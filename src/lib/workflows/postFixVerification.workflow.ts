import { db } from "../db";
import { taskService } from "../services";
import { runService } from "../services/run.service";
import { sandboxAdapter } from "../adapters/sandbox.adapter";
import { verificationComparisonService } from "../services/verificationComparison.service";
import { VerificationAnalysisInput } from "../adapters/visionAnalysis.adapter";

export async function runPostFixVerificationWorkflow(taskId: string): Promise<void> {
  console.log(`[Post-Fix Verification Workflow] Triggered for Task ${taskId}`);

  const task = await taskService.getTaskById(taskId);
  const run = await taskService.getActiveAgentRun(taskId);
  if (!task || !run) {
    console.warn("[Post-Fix Verification] Task or Run missing.");
    return;
  }

  // 1. Mark phase as verification
  await db.agentRuns.update(run.id, { phase: "verification", currentStep: "Starting post-fix verification..." });

  // Add initial message
  await taskService.appendAgentMessage({
    taskId,
    sender: "system",
    content: "Starting post-fix verification workflow.",
    kind: "thinking",
    timestamp: Date.now()
  });

  try {
    // Determine start index for step ordering
    const startIndex = run.completedSteps || 0;

    // Create Workflow Steps
    const workflowSteps = [
      { key: "start_post_fix_verification", label: "Start Verification", detail: "Initializing verification context..." },
      { key: "reopen_target_url", label: "Launch Sandbox", detail: "Opening application sandbox..." },
      { key: "capture_after_screenshot", label: "Capture Evidence", detail: "Taking post-fix screenshot..." },
      { key: "compare_before_after", label: "Compare States", detail: "Running AI state comparison..." },
      { key: "finalize_task_state", label: "Finalize", detail: "Updating task status..." },
    ];

    const stepRecords = await Promise.all(
      workflowSteps.map((s, i) => runService.createRunStep({
        runId: run.id,
        taskId,
        order: startIndex + i + 1,
        key: s.key,
        label: s.label,
        status: "pending",
        detail: s.detail,
        phase: "verification"
      }))
    );

    const completeStep = async (index: number, detail: string) => {
      await runService.updateRunStepStatus(stepRecords[index], "completed", detail);
      await runService.updateAgentRunProgress(run.id, startIndex + index + 1, workflowSteps[index + 1]?.detail || "Done");
    };

    // --- STEP 0: Start ---
    await runService.updateRunStepStatus(stepRecords[0], "running", "Fetching verification plan...");

    // Get Verification Plan
    const plan = await db.verificationPlans.where({ taskId }).first();
    if (!plan) throw new Error("VerificationPlan missing.");

    // Get Before State
    const beforeScreenshotArtifact = await db.taskArtifacts.where({ taskId, type: "screenshot" }).first();
    const beforeLogsArtifact = await db.taskArtifacts.where({ taskId, type: "terminal" }).first();
    const beforeAnalysisArtifact = await db.taskArtifacts.where({ taskId, type: "vision_analysis" }).first();

    let originalIssueSummary = "Unknown issue";
    if (beforeAnalysisArtifact) {
        try {
            const parsed = JSON.parse(beforeAnalysisArtifact.content);
            originalIssueSummary = parsed.summary || parsed.issueType || originalIssueSummary;
        } catch(e){}
    }

    await completeStep(0, "Context loaded.");

    // --- STEP 1: Launch Sandbox ---
    await runService.updateRunStepStatus(stepRecords[1], "running", "Connecting to devpilot-sandbox...");
    await taskService.appendAgentMessage({
      taskId,
      sender: "system",
      content: "Reopening application in sandbox to verify changes...",
      kind: "thinking",
      timestamp: Date.now()
    });

    const sandboxSession = await sandboxAdapter.createSession(taskId);
    await completeStep(1, "Sandbox active.");

    // --- STEP 2: Capture Evidence ---
    await runService.updateRunStepStatus(stepRecords[2], "running", "Taking after-state screenshot...");

    const afterScreenshotBase64 = await sandboxAdapter.captureScreenshot(taskId);
    await taskService.updateTaskArtifact(taskId, "after_screenshot", afterScreenshotBase64);

    // Simulate Logs capture since adapter doesn't expose it directly yet, or use generic
    const afterConsoleLogs = ["[Mock Logs] App loaded without errors.", "[Mock Logs] API endpoints stable."];

    await completeStep(2, "Evidence captured.");

    // --- STEP 3: Compare ---
    await runService.updateRunStepStatus(stepRecords[3], "running", "Analyzing before vs after...");
    await taskService.appendAgentMessage({
      taskId,
      sender: "system",
      content: "Running AI comparison of pre-fix and post-fix application states...",
      kind: "thinking",
      timestamp: Date.now()
    });

    const comparisonInput: VerificationAnalysisInput = {
      taskTitle: task.title,
      originalIssueSummary,
      expectedOutcome: plan.expectedOutcome,
      beforeScreenshotBase64: beforeScreenshotArtifact?.content,
      afterScreenshotBase64,
      beforeConsoleLogs: beforeLogsArtifact ? beforeLogsArtifact.content.split('\n') : undefined,
      afterConsoleLogs
    };

    const comparisonResult = await verificationComparisonService.compareState(comparisonInput);
    await completeStep(3, `Comparison complete. Resolved: ${comparisonResult.issueResolved}`);

    // --- STEP 4: Finalize ---
    await runService.updateRunStepStatus(stepRecords[4], "running", "Persisting results...");

    let finalStatus: "passed" | "failed" | "regression_detected" | "inconclusive" = "passed";
    if (!comparisonResult.issueResolved) finalStatus = "failed";
    if (comparisonResult.regressionDetected) finalStatus = "regression_detected";

    const verificationResultId = crypto.randomUUID();
    await db.verificationResults.add({
        id: verificationResultId,
        taskId,
        proposalId: plan.proposalId,
        status: finalStatus,
        summary: comparisonResult.summary,
        explanation: comparisonResult.explanation,
        confidence: comparisonResult.confidence,
        issueResolved: comparisonResult.issueResolved,
        regressionDetected: comparisonResult.regressionDetected,
        createdAt: Date.now(),
        updatedAt: Date.now()
    });

    await db.verificationEvidences.bulkAdd([
        {
             id: crypto.randomUUID(),
             verificationResultId,
             taskId,
             type: "before_screenshot",
             artifactId: beforeScreenshotArtifact?.id || "",
             createdAt: Date.now()
        },
        {
             id: crypto.randomUUID(),
             verificationResultId,
             taskId,
             type: "after_screenshot",
             artifactId: "after_screenshot_artifact_placeholder", // Typically we'd save the artifact id properly
             createdAt: Date.now()
        }
    ]);

    // Update Task Status based on result
    let taskUpdate: Partial<import('../../types').Task> = {};
    if (finalStatus === "passed") {
        taskUpdate.status = "closed";
        taskUpdate.codeFixStatus = "applied";
    } else {
        // Keep it merged but mark it failed or something.
        // For now, if it failed verification, we'll keep the task open (running)
        // but mark the codeFixStatus as failed so the UI knows it needs attention.
        taskUpdate.status = "running";
        taskUpdate.codeFixStatus = "failed";
    }

    await db.tasks.update(taskId, taskUpdate);

    await taskService.appendAgentMessage({
      taskId,
      sender: "system",
      content: `Verification ${finalStatus.toUpperCase()}: ${comparisonResult.summary}`,
      kind: finalStatus === "passed" ? "success" : "warning",
      timestamp: Date.now()
    });

    await runService.createAgentEvent({
      taskId,
      source: "orchestrator",
      type: "RUN_COMPLETED",
      title: "Verification Workflow Complete",
      description: `Result: ${finalStatus}`,
      metadata: JSON.stringify({ verificationResultId }),
      timestamp: Date.now()
    });

    await completeStep(4, "Verification finalized.");

    await db.agentRuns.update(run.id, {
        status: "completed",
        currentStep: "Verification finished.",
        completedSteps: startIndex + 5
    });

  } catch (err: any) {
     console.error("Verification workflow failed:", err);
     await taskService.appendAgentMessage({
      taskId,
      sender: "system",
      content: `Verification workflow failed to execute: ${err.message}`,
      kind: "warning",
      timestamp: Date.now()
    });

    await db.agentRuns.update(run.id, {
        status: "failed",
        currentStep: "Verification error",
        lastError: err.message
    });
  }
}
