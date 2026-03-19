import { VIEWPORT_PRESETS } from "../adapters/browserAutomation.adapter";
import { gitlabDuoAdapter } from "../adapters/gitlabDuo.adapter";
import { sandboxAdapter } from "../adapters/sandbox.adapter";
import { visionAnalysisAdapter } from "../adapters/visionAnalysis.adapter";
import { taskService } from "../services";
import { memoryService } from "../services/memory.service";
import { runService } from "../services/run.service";
import { runCodeFixWorkflow } from "./codeFix.workflow";

export const runUiInspectionWorkflow = async (taskId: string) => {
  const task = await taskService.getTaskById(taskId);
  const run = await taskService.getActiveAgentRun(taskId);
  if (!task || !run || run.status !== "running") {
    return;
  }

  const targetUrl = task.targetUrl;
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
    await runService.updateRunStepStatus(
      stepRecords[0],
      "running",
      "Launching sandbox session...",
    );
    const sandboxSession = await sandboxAdapter.createSession({
      id: taskId,
      targetUrl,
      viewport,
    });
    await completeStep(0, "Sandbox session established.");

    await runService.updateRunStepStatus(
      stepRecords[1],
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
    await completeStep(1, `Captured ${liveSession.currentUrl}.`);

    await runService.updateRunStepStatus(
      stepRecords[2],
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
    await completeStep(2, "Historical memory loaded.");

    await gitlabDuoAdapter.invokeAgent(
      taskId,
      "normalize_findings",
      "ui_inspector",
    );
    await runService.updateRunStepStatus(
      stepRecords[3],
      "running",
      "Requesting Gemini vision analysis...",
    );

    const analysis = await visionAnalysisAdapter.analyzeUi({
      taskTitle: task.title,
      targetUrl: liveSession.currentUrl,
      viewportWidth: liveSession.viewportInfo.width,
      viewportHeight: liveSession.viewportInfo.height,
      screenshotBase64,
      consoleErrors: liveSession.consoleLogs,
      priorMemoryHints,
    });

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
      timestamp: Date.now(),
    });
    await completeStep(3, "Vision analysis generated.");

    await runService.updateRunStepStatus(
      stepRecords[4],
      "running",
      "Finalizing inspection artifacts...",
    );
    await taskService.updateTask(taskId, {
      inspectionStatus: "completed",
      lastInspectionAt: Date.now(),
    });
    await completeStep(4, "Inspection finished.");
    await taskService.appendAgentMessage({
      taskId,
      sender: "system",
      content: "Inspection complete. Proceeding to code fix generation.",
      kind: "success",
      timestamp: Date.now(),
    });
    await sandboxAdapter.closeSession(taskId);
    await runCodeFixWorkflow(taskId);
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
    await sandboxAdapter.closeSession(taskId);
  }
};
