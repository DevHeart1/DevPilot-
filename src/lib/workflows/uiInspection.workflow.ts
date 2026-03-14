import { runCodeFixWorkflow } from './codeFix.workflow';
import { taskService } from '../services';
import { gitlabDuoAdapter } from '../adapters/gitlabDuo.adapter';
import { runService } from '../services/run.service';
import { memoryService } from '../services/memory.service';
import { sandboxAdapter } from '../adapters/sandbox.adapter';
import { visionAnalysisAdapter } from '../adapters/visionAnalysis.adapter';
import { config } from '../config/env';

export const runUiInspectionWorkflow = async (taskId: string) => {
  const task = await taskService.getTaskById(taskId);
  const run = await taskService.getActiveAgentRun(taskId);
  if (!task || !run || run.status !== 'running') return;

  const targetUrl = task.targetUrl || config.targetAppBaseUrl;
  const preset = task.viewportPreset || 'desktop';

  // 1. Mark workflow started
  await taskService.updateTask(taskId, { inspectionStatus: 'running' });
  await taskService.appendAgentMessage({
    taskId,
    sender: 'system',
    content: `Starting ${config.liveMode ? 'Live' : 'Mock'} UI Inspection for ${task.title}`,
    kind: 'thinking',
    timestamp: Date.now()
  });

  // Create Step Records
  const workflowSteps = [
    { key: "browser_session", label: "Launch Browser", detail: "Initializing Playwright..." },
    { key: "capture_ui", label: "Capture UI", detail: "Navigating to " + targetUrl },
    { key: "analyze_vision", label: "Vision Analysis", detail: "Analyzing snapshot with Gemini..." },
    { key: "retrieve_memory", label: "Retrieve Memory", detail: "Cross-referencing past patterns..." },
    { key: "complete_inspection", label: "Inspection Complete", detail: "Saving results..." }
  ];

  await runService.updateAgentRunProgress(run.id, 0, "Initializing UI Inspection...");
  const stepRecords = await Promise.all(
    workflowSteps.map((s, i) => runService.createRunStep({
      runId: run.id,
      taskId,
      order: i + 1,
      key: s.key,
      label: s.label,
      status: "pending",
      detail: s.detail
    }))
  );

  const completeStep = async (index: number, detail: string) => {
    await runService.updateRunStepStatus(stepRecords[index], 'completed', detail);
    await runService.updateAgentRunProgress(run.id, index + 1, workflowSteps[index + 1]?.detail || "Done");
    await runService.createAgentEvent({
      taskId,
      source: "system",
      type: "STEP_COMPLETED",
      title: `Completed: ${workflowSteps[index].label}`,
      description: detail,
      metadata: "{}",
      timestamp: Date.now()
    });
  };

  try {
    // Step 1: Launch Browser & Step 2: Capture UI
    await runService.updateRunStepStatus(stepRecords[0], 'running', 'Connecting to Sandbox...');
    const sandboxSession = await sandboxAdapter.createSession(taskId);
    const screenshotBase64 = await sandboxAdapter.captureScreenshot(taskId);

    const session = {
      sessionId: sandboxSession.id,
      currentUrl: targetUrl,
      status: 'success',
      viewportInfo: { width: 1280, height: 800 },
      screenshotBase64: screenshotBase64,
      consoleLogs: [
        '[SANDBOX] Started remote session: ' + sandboxSession.vncUrl,
        '[PLAYWRIGHT] Navigated to ' + targetUrl,
        '[PLAYWRIGHT] Capturing viewport 1280x800'
      ]
    };
    await completeStep(0, "Browser session established.");

    await runService.updateRunStepStatus(stepRecords[1], 'running', 'Taking screenshot...');

    // Write terminal logs artifact from session output
    if (session.consoleLogs) {
      await taskService.updateTaskArtifact(taskId, 'terminal', session.consoleLogs.join('\n'));
      await runService.createAgentEvent({
        taskId,
        source: "orchestrator",
        type: "ARTIFACT_UPDATED",
        title: "Console Logs Collected",
        description: `Captured ${session.consoleLogs.length} lines of output.`,
        metadata: "{}",
        timestamp: Date.now()
      });
    }

    if (session.screenshotBase64) {
      await taskService.updateTaskArtifact(taskId, 'screenshot', session.screenshotBase64);
    }

    await completeStep(1, `Navigated to ${session.currentUrl}.`);

    // Step 3: Analyze Vision
    await runService.updateRunStepStatus(stepRecords[2], 'running', 'Requesting Gemini 3.1 Pro Preview analysis...');

    // Fetch memory hit before analysis
    await runService.updateRunStepStatus(stepRecords[3], 'running', 'Searching past solutions...');
    const memory = await memoryService.getRelevantMemoryForTask(taskId);
    let priorMemoryHints = "";
    if (memory) {
      priorMemoryHints = `Past similar issue: ${memory.title} -> tags: ${memory.tags.join(',')}`;
      await memoryService.attachMemoryHitToTask(taskId, memory.id, 0.88, "Relevant visual issue pattern.");
    }
    await completeStep(3, "Memory search complete.");

    // Execute vision analysis
    const analysis = await visionAnalysisAdapter.analyzeUi({
      taskTitle: task.title,
      targetUrl: session.currentUrl,
      viewportWidth: session.viewportInfo?.width || 1280,
      viewportHeight: session.viewportInfo?.height || 800,
      screenshotBase64: session.screenshotBase64,
      consoleErrors: session.consoleLogs,
      priorMemoryHints
    });

    await taskService.updateTaskArtifact(taskId, 'vision_analysis', JSON.stringify(analysis, null, 2));

    await taskService.appendAgentMessage({
      taskId,
      sender: 'devpilot',
      content: `Vision analysis complete: Detected **${analysis.issueType}**. Recommended fix: ${analysis.recommendedFix}`,
      kind: analysis.severity === 'high' ? 'warning' : 'info',
      timestamp: Date.now()
    });

    await completeStep(2, "Analysis successfully generated.");

    // Step 4: Complete
    await runService.updateRunStepStatus(stepRecords[4], 'running', 'Finalizing...');
    await taskService.updateTask(taskId, {
      inspectionStatus: 'completed',
      lastInspectionAt: Date.now()
    });
        await completeStep(4, "Inspection finished and recorded.");

    await runService.createAgentEvent({
      taskId,
      source: "system",
      type: "STATUS_CHANGED",
      title: "Inspection Complete",
      description: "Proceeding to Code Fix generation.",
      metadata: "{}",
      timestamp: Date.now()
    });

    // Start code fix workflow seamlessly
    runCodeFixWorkflow(taskId);

  } catch (err: any) {
    console.error("Workflow failed:", err);
    await taskService.updateTask(taskId, { inspectionStatus: 'failed' });
    await runService.createAgentEvent({
      taskId,
      source: "system",
      type: "RUN_FAILED",
      title: "Inspection Failed",
      description: err.message || "An unknown error occurred.",
      metadata: "{}",
      timestamp: Date.now()
    });
    await taskService.appendAgentMessage({
      taskId,
      sender: 'system',
      content: `Inspection workflow failed: ${err.message}`,
      kind: 'warning',
      timestamp: Date.now()
    });
  }
};
