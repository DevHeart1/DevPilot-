import { VIEWPORT_PRESETS } from "../adapters/browserAutomation.adapter";
import { gitlabDuoAdapter } from "../adapters/gitlabDuo.adapter";
import { sandboxAdapter } from "../adapters/sandbox.adapter";
import { visionAnalysisAdapter } from "../adapters/visionAnalysis.adapter";
import { taskService } from "../services";
import { memoryService } from "../services/memory.service";
import { runService } from "../services/run.service";
import { runPlanCodeFixWorkflow } from "./planCodeFix.workflow";

export const runUiInspectionWorkflow = async (taskId: string) => {
  const task = await taskService.getTaskById(taskId);
  const run = await taskService.getActiveAgentRun(taskId);
  if (!task || !run || run.status !== "running") {
    return;
  }

  const { config } = await import("../config/env");
  const localTargetUrl = config.targetAppBaseUrl || "http://localhost:3000";
  const targetUrl = localTargetUrl; // Override task.targetUrl for building & run workflow
  const serverId = `server-${taskId}`;


  if (!targetUrl) {
    throw new Error("Task is missing a target URL for inspection.");
  }

  const preset = task.viewportPreset || "desktop";
  const viewport = VIEWPORT_PRESETS[preset] || VIEWPORT_PRESETS.desktop;

  await taskService.updateTask(taskId, { inspectionStatus: "running" });
  await taskService.appendAgentMessage({
    taskId,
    sender: "system",
    content: `Starting UI inspection for ${task.title}.`,
    kind: "thinking",
    timestamp: Date.now(),
  });

  const workflowSteps = [
    {
      key: "build_app",
      label: "Build Application",
      detail: "Installing dependencies and building the project...",
    },
    {
      key: "browser_session",
      label: "Launch Browser",
      detail: "Initializing the sandbox browser...",
    },

    {
      key: "capture_ui",
      label: "Capture UI",
      detail: `Navigating to ${targetUrl}`,
    },
    {
      key: "retrieve_memory",
      label: "Retrieve Memory",
      detail: "Looking for related verified fixes...",
    },
    {
      key: "analyze_vision",
      label: "Vision Analysis",
      detail: "Analyzing the captured UI with Gemini...",
    },
    {
      key: "complete_inspection",
      label: "Inspection Complete",
      detail: "Saving inspection results...",
    },
  ];

  await gitlabDuoAdapter.invokeAgent(taskId, "inspect_ui_issue", "ui_inspector");
  await runService.updateAgentRunProgress(run.id, 0, "Initializing UI inspection...");
  const stepRecords = await Promise.all(
    workflowSteps.map((step, index) =>
      runService.createRunStep({
        runId: run.id,
        taskId,
        order: index + 1,
        key: step.key,
        label: step.label,
        status: "pending",
        detail: step.detail,
        phase: "inspection",
      }),
    ),
  );

  const completeStep = async (index: number, detail: string) => {
    await runService.updateRunStepStatus(stepRecords[index], "completed", detail);
    await runService.updateAgentRunProgress(
      run.id,
      index + 1,
      workflowSteps[index + 1]?.detail || "Done",
    );
  };

  try {
    let bootstrapMetadata:
      | Awaited<ReturnType<typeof sandboxAdapter.setupWorkspace>>
      | null = null;

    await runService.updateRunStepStatus(
      stepRecords[0],
      "running",
      "Setting up sandbox workspace (cloning repository)...",
    );

    // 0. Setup Workspace (Clone repo)
    try {
      const { config: coreConfig } = await import("../config/env");
      const gitlabUrl = task.gitlabProjectWebUrl || task.repo;
      if (!gitlabUrl) {
        throw new Error("GitLab project URL is missing from task.");
      }
      bootstrapMetadata = await sandboxAdapter.setupWorkspace(gitlabUrl, task.branch, coreConfig.gitlabToken);
      console.log(
        `[WORKFLOW] Sandbox workspace ready for ${gitlabUrl} @ ${task.branch}. ` +
        `appRoot=${bootstrapMetadata.appRoot}, framework=${bootstrapMetadata.framework}, packageManager=${bootstrapMetadata.packageManager}`,
      );
    } catch (e: any) {
      throw new Error(`Failed to setup sandbox workspace: ${e.message}`);
    }


    await runService.updateRunStepStatus(
      stepRecords[0],
      "running",
      `Running '${bootstrapMetadata?.installCommandUsed ?? "install"}' and '${bootstrapMetadata?.buildCommandUsed ?? "build"}'...`,
    );


    // 1. Build the app
    await sandboxAdapter.executeCommand("npm install");
    const buildResult = await sandboxAdapter.executeCommand("npm run build");

    if (buildResult.exitCode !== 0) {
      throw new Error(`Build failed: ${buildResult.stderr}`);
    }

    await completeStep(0, "Application built successfully.");

    // 2. Start the server (using 'npm run dev' or 'npm run preview')
    const runtimeCommand =
      bootstrapMetadata?.devCommandUsed ||
      bootstrapMetadata?.previewCommandUsed ||
      "npm run dev";
    await sandboxAdapter.startBackgroundCommand(serverId, runtimeCommand);


    // 3. Poll for readiness
    const readiness = await sandboxAdapter.waitForUrl(targetUrl, 60000, 2000);

    if (!readiness.ready) {
      await sandboxAdapter.stopBackgroundCommand(serverId);
      throw new Error(
        `Server at ${targetUrl} did not become ready after 60s. ` +
        `Last error: ${readiness.lastError || "unknown"}`
      );
    }

    await runService.updateRunStepStatus(
      stepRecords[1],
      "running",
      "Launching sandbox session...",
    );


    // TODO: Determine if we need to start a server or use existing
    // For now we assume the environment handles the serving or we start it here
    // If it's a dev server, we might need a non-blocking start.

    const sandboxSession = await sandboxAdapter.createSession({
      id: taskId,
      targetUrl,
      viewport,
    });
    await completeStep(1, "Sandbox session established.");

    await runService.updateRunStepStatus(
      stepRecords[2],
      "running",
      "Capturing screenshot and console logs...",
    );
    const screenshotBase64 = await sandboxAdapter.captureScreenshot(taskId);
    const liveSession = (await sandboxAdapter.getSession(taskId)) || sandboxSession;

    const terminalArtifactId = await taskService.updateTaskArtifact(
      taskId,
      "terminal",
      liveSession.consoleLogs.join("\n"),
    );
    const screenshotArtifactId = await taskService.updateTaskArtifact(
      taskId,
      "screenshot",
      screenshotBase64,
    );
    await runService.createAgentEvent({
      taskId,
      source: "orchestrator",
      type: "ARTIFACT_UPDATED",
      title: "Inspection evidence captured",
      description: "Stored the live screenshot and console log artifacts.",
      metadata: JSON.stringify({ terminalArtifactId, screenshotArtifactId }),
      timestamp: Date.now(),
    });
    await completeStep(2, `Captured ${liveSession.currentUrl}.`);

    await runService.updateRunStepStatus(
      stepRecords[3],
      "running",
      "Searching historical memory...",
    );
    const memory = await memoryService.getRelevantMemoryForTask(taskId);
    let priorMemoryHints = "";
    if (memory) {
      priorMemoryHints = `Past similar issue: ${memory.title}. ${memory.content}`;
      await memoryService.attachMemoryHitToTask(
        taskId,
        memory.id,
        0.88,
        "Matched against a previously verified task.",
      );
    }
    await completeStep(3, "Historical memory loaded.");

    await gitlabDuoAdapter.invokeAgent(
      taskId,
      "normalize_findings",
      "ui_inspector",
    );
    await runService.updateRunStepStatus(
      stepRecords[4],
      "running",
      "Requesting Gemini vision analysis...",
    );

    const analysis = await (async () => {
      // Fetch likely relevant files to provide context to Gemini
      let repoFiles: Array<{ filePath: string; content: string }> = [];
      try {
        const { gitlabRepositoryAdapter } = await import("../adapters/gitlabRepository.adapter");
        const treeResult = await gitlabRepositoryAdapter.listRepositoryTree(task.gitlabProjectId, task.branch);

        if (treeResult.success && treeResult.data) {
          // Filter for relevant files (components, pages, styles)
          const relevantPaths = treeResult.data
            .filter(f => f.type === 'blob' && (
              f.path.includes('src/components') ||
              f.path.includes('src/pages') ||
              f.path.includes('src/App') ||
              f.path.includes('.css') ||
              f.path.includes('.scss')
            ))
            .slice(0, 15); // limit to top 15 most relevant

          const fetchedFiles = await Promise.all(
            relevantPaths.map(async (f) => {
              const contentResult = await gitlabRepositoryAdapter.getFileContent(f.path, task.gitlabProjectId, task.branch);
              return contentResult.success ? { filePath: f.path, content: contentResult.data.content } : null;
            })
          );
          repoFiles = fetchedFiles.filter((f): f is { filePath: string; content: string } => f !== null);
        }
      } catch (e) {
        console.warn("Failed to fetch repository files for vision analysis context:", e);
      }


      return visionAnalysisAdapter.analyzeUi({
        taskTitle: task.title,
        targetUrl: liveSession.currentUrl,
        viewportWidth: liveSession.viewportInfo.width,
        viewportHeight: liveSession.viewportInfo.height,
        screenshotBase64,
        consoleErrors: liveSession.consoleLogs,
        priorMemoryHints,
        repoFiles,
      });
    })();


    await taskService.updateTaskArtifact(
      taskId,
      "vision_analysis",
      JSON.stringify(analysis, null, 2),
    );
    await taskService.appendAgentMessage({
      taskId,
      sender: "devpilot",
      content: `Vision analysis complete: detected ${analysis.issueType}. Recommended fix: ${analysis.recommendedFix}`,
      kind: analysis.severity === "high" ? "warning" : "info",
      artifactIds: [screenshotArtifactId, terminalArtifactId],
      timestamp: Date.now(),
    });
    await completeStep(4, "Vision analysis generated.");

    await runService.updateRunStepStatus(
      stepRecords[5],
      "running",
      "Finalizing inspection artifacts...",
    );
    await taskService.updateTask(taskId, {
      inspectionStatus: "completed",
      lastInspectionAt: Date.now(),
    });
    await completeStep(5, "Inspection finished.");

    await taskService.appendAgentMessage({
      taskId,
      sender: "system",
      content: "Inspection complete. Proceeding to code fix generation.",
      kind: "success",
      timestamp: Date.now(),
    });

    // Clean up server
    await sandboxAdapter.stopBackgroundCommand(serverId);


    await sandboxAdapter.closeSession(taskId);
    await runPlanCodeFixWorkflow(taskId);
  } catch (error) {

    const message = error instanceof Error ? error.message : String(error);
    await taskService.updateTask(taskId, { inspectionStatus: "failed" });
    await runService.createAgentEvent({
      taskId,
      source: "system",
      type: "RUN_FAILED",
      title: "Inspection Failed",
      description: message,
      metadata: "{}",
      timestamp: Date.now(),
    });
    await taskService.appendAgentMessage({
      taskId,
      sender: "system",
      content: `Inspection workflow failed: ${message}`,
      kind: "warning",
      timestamp: Date.now(),
    });

    // Clean up server
    await sandboxAdapter.stopBackgroundCommand(serverId).catch(() => { });


    await sandboxAdapter.closeSession(taskId);
  }
};
