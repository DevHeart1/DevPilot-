import { VIEWPORT_PRESETS } from "../adapters/browserAutomation.adapter";
import {
  VerificationAnalysisInput,
} from "../adapters/visionAnalysis.adapter";
import { sandboxAdapter } from "../adapters/sandbox.adapter";
import {
  patchProposalService,
  taskService,
  verificationComparisonService,
  verificationService,
} from "../services";
import { memoryService } from "../services/memory.service";
import { runService } from "../services/run.service";

function summarizeOriginalIssue(analysisContent?: string): string {
  if (!analysisContent) {
    return "Unknown issue";
  }

  try {
    const parsed = JSON.parse(analysisContent) as {
      summary?: string;
      issueType?: string;
    };
    return parsed.summary || parsed.issueType || "Unknown issue";
  } catch {
    return "Unknown issue";
  }
}

function getVerificationStatus(
  issueResolved: boolean,
  regressionDetected: boolean,
  confidence: number,
): "passed" | "failed" | "regression_detected" | "inconclusive" {
  if (regressionDetected) {
    return "regression_detected";
  }

  if (issueResolved) {
    return "passed";
  }

  if (confidence < 0.5) {
    return "inconclusive";
  }

  return "failed";
}

export async function runPostFixVerificationWorkflow(
  taskId: string,
): Promise<void> {
  const task = await taskService.getTaskById(taskId);
  const run = await taskService.getActiveAgentRun(taskId);
  if (!task || !run) {
    return;
  }

  const targetUrl = task.targetUrl;
  if (!targetUrl) {
    throw new Error("Task is missing a target URL for verification.");
  }

  const plan = await patchProposalService.getVerificationPlanForTask(taskId);
  if (!plan) {
    throw new Error("Verification plan is missing.");
  }

  const beforeScreenshotArtifact = await taskService.getArtifactsByTaskIdAndType(
    taskId,
    "screenshot",
  );
  const beforeLogsArtifact = await taskService.getArtifactsByTaskIdAndType(
    taskId,
    "terminal",
  );
  const beforeAnalysisArtifact = await taskService.getArtifactsByTaskIdAndType(
    taskId,
    "vision_analysis",
  );

  const startIndex = run.completedSteps || 0;
  const preset = task.viewportPreset || "desktop";
  const viewport = VIEWPORT_PRESETS[preset] || VIEWPORT_PRESETS.desktop;

  await runService.updateAgentRunProgress(
    run.id,
    startIndex,
    "Starting post-fix verification...",
  );
  await taskService.appendAgentMessage({
    taskId,
    sender: "system",
    content: "Starting post-fix verification workflow.",
    kind: "thinking",
    timestamp: Date.now(),
  });

  const workflowSteps = [
    {
      key: "start_post_fix_verification",
      label: "Start Verification",
      detail: "Initializing verification context...",
    },
    {
      key: "reopen_target_url",
      label: "Launch Sandbox",
      detail: "Opening the live application for verification...",
    },
    {
      key: "capture_after_screenshot",
      label: "Capture Evidence",
      detail: "Capturing live post-fix evidence...",
    },
    {
      key: "compare_before_after",
      label: "Compare States",
      detail: "Comparing inspection and verification evidence...",
    },
    {
      key: "finalize_task_state",
      label: "Finalize",
      detail: "Persisting verification results...",
    },
  ];

  const stepRecords = await Promise.all(
    workflowSteps.map((step, index) =>
      runService.createRunStep({
        runId: run.id,
        taskId,
        order: startIndex + index + 1,
        key: step.key,
        label: step.label,
        status: "pending",
        detail: step.detail,
        phase: "verification",
      }),
    ),
  );

  const completeStep = async (index: number, detail: string) => {
    await runService.updateRunStepStatus(stepRecords[index], "completed", detail);
    await runService.updateAgentRunProgress(
      run.id,
      startIndex + index + 1,
      workflowSteps[index + 1]?.detail || "Verification complete.",
    );
  };

  try {
    await runService.updateRunStepStatus(
      stepRecords[0],
      "running",
      "Loading inspection artifacts and verification plan...",
    );
    await completeStep(0, "Verification context loaded.");

    await runService.updateRunStepStatus(
      stepRecords[1],
      "running",
      "Launching verification sandbox session...",
    );
    await taskService.appendAgentMessage({
      taskId,
      sender: "system",
      content: "Opening the updated application in the sandbox for verification.",
      kind: "thinking",
      timestamp: Date.now(),
    });

    await sandboxAdapter.createSession({
      id: taskId,
      targetUrl,
      viewport,
    });
    await completeStep(1, `Sandbox launched at ${targetUrl}.`);

    await runService.updateRunStepStatus(
      stepRecords[2],
      "running",
      "Capturing screenshot and console output...",
    );

    const afterScreenshotBase64 = await sandboxAdapter.captureScreenshot(taskId);
    const liveSession = await sandboxAdapter.getSession(taskId);
    if (!liveSession) {
      throw new Error("Verification sandbox session was lost.");
    }

    await taskService.updateTaskArtifact(
      taskId,
      "after_screenshot",
      afterScreenshotBase64,
    );
    await taskService.updateTaskArtifact(
      taskId,
      "after_logs",
      liveSession.consoleLogs.join("\n"),
    );

    const afterScreenshotArtifact = await taskService.getArtifactsByTaskIdAndType(
      taskId,
      "after_screenshot",
    );
    const afterLogsArtifact = await taskService.getArtifactsByTaskIdAndType(
      taskId,
      "after_logs",
    );

    if (!afterScreenshotArtifact || !afterLogsArtifact) {
      throw new Error("Failed to persist verification artifacts.");
    }

    await runService.createAgentEvent({
      taskId,
      source: "orchestrator",
      type: "ARTIFACT_UPDATED",
      title: "Verification evidence captured",
      description: "Stored the post-fix screenshot and browser logs.",
      metadata: JSON.stringify({
        afterScreenshotArtifactId: afterScreenshotArtifact.id,
        afterLogsArtifactId: afterLogsArtifact.id,
      }),
      timestamp: Date.now(),
    });
    await completeStep(2, `Captured verification evidence at ${liveSession.currentUrl}.`);

    await runService.updateRunStepStatus(
      stepRecords[3],
      "running",
      "Comparing before and after evidence with Gemini...",
    );
    await taskService.appendAgentMessage({
      taskId,
      sender: "system",
      content: "Comparing the inspection evidence with the updated application state.",
      kind: "thinking",
      timestamp: Date.now(),
    });

    const comparisonInput: VerificationAnalysisInput = {
      taskTitle: task.title,
      originalIssueSummary: summarizeOriginalIssue(beforeAnalysisArtifact?.content),
      expectedOutcome: plan.expectedOutcome,
      beforeScreenshotBase64: beforeScreenshotArtifact?.content,
      afterScreenshotBase64,
      beforeConsoleLogs: beforeLogsArtifact?.content
        ? beforeLogsArtifact.content.split("\n")
        : undefined,
      afterConsoleLogs: liveSession.consoleLogs,
    };

    const comparisonResult = await verificationComparisonService.compareState(
      comparisonInput,
    );
    await taskService.updateTaskArtifact(
      taskId,
      "after_analysis",
      JSON.stringify(comparisonResult, null, 2),
    );
    const afterAnalysisArtifact = await taskService.getArtifactsByTaskIdAndType(
      taskId,
      "after_analysis",
    );
    await completeStep(
      3,
      `Comparison complete. Resolved: ${comparisonResult.issueResolved}.`,
    );

    await runService.updateRunStepStatus(
      stepRecords[4],
      "running",
      "Persisting verification result and updating task state...",
    );

    const finalStatus = getVerificationStatus(
      comparisonResult.issueResolved,
      comparisonResult.regressionDetected,
      comparisonResult.confidence,
    );

    const verificationResultId = crypto.randomUUID();
    await verificationService.createVerificationResult({
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
      updatedAt: Date.now(),
    });

    const evidenceRecords = [
      {
        type: "before_screenshot" as const,
        artifactId: beforeScreenshotArtifact?.id,
      },
      {
        type: "after_screenshot" as const,
        artifactId: afterScreenshotArtifact.id,
      },
      {
        type: "before_logs" as const,
        artifactId: beforeLogsArtifact?.id,
      },
      {
        type: "after_logs" as const,
        artifactId: afterLogsArtifact.id,
      },
      {
        type: "before_analysis" as const,
        artifactId: beforeAnalysisArtifact?.id,
      },
      {
        type: "after_analysis" as const,
        artifactId: afterAnalysisArtifact?.id,
      },
    ].filter(
      (
        evidence,
      ): evidence is {
        type:
          | "before_screenshot"
          | "after_screenshot"
          | "before_logs"
          | "after_logs"
          | "before_analysis"
          | "after_analysis";
        artifactId: string;
      } => Boolean(evidence.artifactId),
    );

    for (const evidence of evidenceRecords) {
      await verificationService.createVerificationEvidence({
        id: crypto.randomUUID(),
        verificationResultId,
        taskId,
        type: evidence.type,
        artifactId: evidence.artifactId,
        createdAt: Date.now(),
      });
    }

    const taskUpdate =
      finalStatus === "passed"
        ? {
            status: "closed" as const,
            codeFixStatus: "applied" as const,
          }
        : {
            status: "running" as const,
            codeFixStatus: "failed" as const,
          };
    await taskService.updateTask(taskId, taskUpdate);

    if (finalStatus === "passed") {
      const proposal = await patchProposalService.getPatchProposalById(plan.proposalId);
      if (proposal) {
        const tags = Array.from(
          new Set(
            [
              ...proposal.suspectedFiles.map((file) => file.split("/").pop() || file),
              ...(task.componentHints || []),
            ].filter(Boolean),
          ),
        ).slice(0, 8);

        const memoryId = await memoryService.storeMemoryRecord({
          scope: "bug_fix",
          title: task.title,
          content: [
            comparisonResult.summary,
            proposal.recommendedStrategy,
            `Files: ${proposal.suspectedFiles.join(", ")}`,
          ].join("\n\n"),
          tags,
          confidence: Math.max(0.6, comparisonResult.confidence),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        await runService.createAgentEvent({
          taskId,
          source: "memory_engine",
          type: "MEMORY_STORED",
          title: "Stored verified memory",
          description: `Saved a reusable memory record for ${task.title}.`,
          metadata: JSON.stringify({ memoryId }),
          timestamp: Date.now(),
        });
      }
    }

    await taskService.appendAgentMessage({
      taskId,
      sender: "system",
      content: `Verification ${finalStatus.toUpperCase()}: ${comparisonResult.summary}`,
      kind: finalStatus === "passed" ? "success" : "warning",
      timestamp: Date.now(),
    });

    await runService.createAgentEvent({
      taskId,
      source: "orchestrator",
      type: finalStatus === "passed" ? "RUN_COMPLETED" : "RUN_FAILED",
      title: "Verification Workflow Complete",
      description: `Result: ${finalStatus}`,
      metadata: JSON.stringify({ verificationResultId }),
      timestamp: Date.now(),
    });

    await completeStep(4, `Verification finalized with status: ${finalStatus}.`);
    await runService.updateAgentRunProgress(
      run.id,
      startIndex + workflowSteps.length,
      finalStatus === "passed"
        ? "Verification passed."
        : "Verification requires attention.",
      finalStatus === "passed" ? "completed" : "failed",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await taskService.updateTask(taskId, { codeFixStatus: "failed" });
    await taskService.appendAgentMessage({
      taskId,
      sender: "system",
      content: `Verification workflow failed: ${message}`,
      kind: "warning",
      timestamp: Date.now(),
    });
    await runService.updateAgentRunProgress(
      run.id,
      startIndex,
      "Verification error.",
      "failed",
    );
  } finally {
    await sandboxAdapter.closeSession(taskId);
  }
}
