import { taskService, patchProposalService } from '../services';
import { runService } from '../services/run.service';
import { gitlabRepositoryAdapter } from '../adapters/gitlabRepository.adapter';
import { runPostFixVerificationWorkflow } from './postFixVerification.workflow';

export const runVerificationPreparationWorkflow = async (taskId: string, proposalId: string) => {
  const task = await taskService.getTaskById(taskId);
  const run = await taskService.getActiveAgentRun(taskId);
  if (!task || !run) return;

  // 1. Mark workflow started
  await taskService.updateTask(taskId, { codeFixStatus: 'applied' });
  await taskService.appendAgentMessage({
    taskId,
    sender: 'system',
    content: `Approval received. Preparing GitLab handoff...`,
    kind: 'thinking',
    timestamp: Date.now()
  });

  // Handoff to GitLab
  const result = await gitlabRepositoryAdapter.applyPatchProposal(taskId, proposalId);

  if (result.success) {
    await taskService.updateTask(taskId, { status: 'merged' });
    await runService.updateAgentRunProgress(run.id, run.totalSteps, "Completed", "completed");


    // Add logs
    if (result.logs) {
      await taskService.updateTaskArtifact(taskId, 'log', result.logs.join('\n'));
      await runService.createAgentEvent({
        taskId,
        source: "orchestrator",
        type: "ARTIFACT_UPDATED",
        title: "GitLab Hand-Off Complete",
        description: `Created branch and MR successfully.`,
        metadata: "{}",
        timestamp: Date.now()
      });
    }

    // Mark patch proposal as applied
    await patchProposalService.updatePatchProposalStatus(proposalId, 'applied');

    // Create a verification plan
    const plan = {
      id: crypto.randomUUID(),
      taskId,
      proposalId,
      targetUrl: task.targetUrl || 'http://localhost:3000/dashboard/matches',
      expectedOutcome: 'Visual clipping on the element should be resolved, showing a horizontal scroll container.',
      checks: [
        'Check DOM element wrapper for overflow-x-auto',
        'Verify UI does not overflow the main viewport boundaries'
      ],
      createdAt: Date.now()
    };

    await patchProposalService.createVerificationPlan(plan);
    await runService.createAgentEvent({
      taskId,
      source: "system",
      type: "STATUS_CHANGED",
      title: "Verification Plan Created",
      description: "Ready for post-fix UI reinspection. MR URL: " + result.mergeRequestUrl,
      metadata: JSON.stringify({ planId: plan.id }),
      timestamp: Date.now()
    });

    await taskService.appendAgentMessage({
      taskId,
      sender: 'devpilot',
      content: `GitLab handoff completed successfully. Branch: \`${result.branchName}\`. System is ready for verification.`,
      kind: 'success',
      timestamp: Date.now()
    });

    // Automatically trigger post-fix verification
    runPostFixVerificationWorkflow(taskId);

  } else {
    // Failure path
    await taskService.updateTask(taskId, { codeFixStatus: 'failed' });
    await patchProposalService.updatePatchProposalStatus(proposalId, 'failed');
    await taskService.appendAgentMessage({
      taskId,
      sender: 'system',
      content: `GitLab handoff failed: ${result.error}`,
      kind: 'warning',
      timestamp: Date.now()
    });
  }
};
