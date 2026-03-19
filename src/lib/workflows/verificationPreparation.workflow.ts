import { gitlabDuoAdapter } from "../adapters/gitlabDuo.adapter";
import { patchProposalService, taskService } from "../services";
import { runService } from "../services/run.service";
import { runPostFixVerificationWorkflow } from "./postFixVerification.workflow";
import { runRepositoryMutationWorkflow } from "./repositoryMutation.workflow";

export const runVerificationPreparationWorkflow = async (
  taskId: string,
  proposalId: string,
) => {
  const task = await taskService.getTaskById(taskId);
  const run = await taskService.getActiveAgentRun(taskId);
  const proposal = await patchProposalService.getPatchProposalById(proposalId);

  if (!task || !run || !proposal) {
    return;
  }

  await taskService.appendAgentMessage({
    taskId,
    sender: "system",
    content: "Approval received. Preparing GitLab handoff and verification.",
    kind: "thinking",
    timestamp: Date.now(),
  });

  try {
    await gitlabDuoAdapter.invokeAgent(taskId, "handoff_to_gitlab", "system");
    await gitlabDuoAdapter.invokeAgent(
      taskId,
      "apply_repository_mutation",
      "system",
    );

    const mutationResult = await runRepositoryMutationWorkflow(taskId, proposalId);

    const existingPlan = await patchProposalService.getVerificationPlanForTask(
      taskId,
    );
    if (!existingPlan || existingPlan.proposalId !== proposalId) {
      await patchProposalService.createVerificationPlan({
        id: crypto.randomUUID(),
        taskId,
        proposalId,
        targetUrl: task.targetUrl || "",
        expectedOutcome:
          proposal.summary ||
          task.prompt ||
          "Verify that the approved change resolves the reported issue.",
        checks: [
          "Confirm the reported issue no longer appears in the live application.",
          "Compare the new UI state against the inspection evidence.",
          "Review browser console output for regressions after the change.",
        ],
        createdAt: Date.now(),
      });
    }

    await runService.createAgentEvent({
      taskId,
      source: "system",
      type: "STATUS_CHANGED",
      title: "Verification Plan Ready",
      description: `MR !${mutationResult.mergeRequestIid} created and queued for verification.`,
      metadata: JSON.stringify(mutationResult),
      timestamp: Date.now(),
    });

    await taskService.appendAgentMessage({
      taskId,
      sender: "devpilot",
      content: `GitLab handoff complete. MR !${mutationResult.mergeRequestIid} and pipeline #${mutationResult.pipelineId} are live. Starting post-fix verification.`,
      kind: "success",
      timestamp: Date.now(),
    });

    await gitlabDuoAdapter.invokeAgent(taskId, "verify_fix", "verifier");
    await runPostFixVerificationWorkflow(taskId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await taskService.updateTask(taskId, { codeFixStatus: "failed" });
    await patchProposalService.updatePatchProposalStatus(proposalId, "failed");
    await runService.updateAgentRunProgress(
      run.id,
      run.completedSteps,
      "GitLab handoff failed.",
      "failed",
    );
    await taskService.appendAgentMessage({
      taskId,
      sender: "system",
      content: `GitLab handoff failed: ${message}`,
      kind: "warning",
      timestamp: Date.now(),
    });
  }
};
