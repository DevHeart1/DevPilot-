import { taskService, patchProposalService, gitlabRepositoryService } from "../services";
import { gitlabDuoService } from "../services/gitlabDuo.service";
import { runService } from "../services/run.service";
import { gitlabRepositoryAdapter } from "../adapters/gitlabRepository.adapter";
import { db } from "../db";

export interface RepositoryMutationWorkflowResult {
  branchName: string;
  mergeRequestIid: number;
  mergeRequestUrl: string;
  pipelineId: number;
  pipelineUrl: string;
}

export async function runRepositoryMutationWorkflow(
  taskId: string,
  proposalId: string,
): Promise<RepositoryMutationWorkflowResult> {
  const task = await taskService.getTaskById(taskId);
  const run = await taskService.getActiveAgentRun(taskId);
  const proposal = await patchProposalService.getPatchProposalById(proposalId);

  if (!task || !run || !proposal) {
    throw new Error(`Task, run, or proposal missing for ${taskId}.`);
  }

  await db.agentRuns.update(run.id, {
    phase: "code_fix",
    currentStep: "Initializing repository mutation...",
  });
  await taskService.appendAgentMessage({
    taskId,
    sender: "system",
    content: `Initiating repository mutation flow for "${proposal.title}".`,
    kind: "thinking",
    timestamp: Date.now(),
  });

  const workflowSteps = [
    {
      key: "create_fix_branch",
      label: "Create Branch",
      detail: "Creating the fix branch in GitLab...",
    },
    {
      key: "apply_patch_files",
      label: "Apply Changes",
      detail: "Committing generated file updates...",
    },
    {
      key: "create_gitlab_mr",
      label: "Open MR",
      detail: "Creating the merge request...",
    },
    {
      key: "monitor_initial_pipeline",
      label: "Run Pipeline",
      detail: "Triggering the validation pipeline...",
    },
  ];

  const startIndex = run.completedSteps || 0;
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
        phase: "code_fix",
      }),
    ),
  );

  const completeStep = async (index: number, detail: string) => {
    await runService.updateRunStepStatus(stepRecords[index], "completed", detail);
    await runService.updateAgentRunProgress(
      run.id,
      startIndex + index + 1,
      workflowSteps[index + 1]?.detail || "Repository mutation complete.",
    );
  };

  const branchName = `codex/task-${taskId.slice(0, 6)}-${Date.now()
    .toString()
    .slice(-5)}`;

  await runService.updateRunStepStatus(
    stepRecords[0],
    "running",
    "Connecting to GitLab...",
  );
  const branchResult = await gitlabRepositoryAdapter.createBranch(
    branchName,
    task.gitlabProjectId,
    task.branch || task.defaultBranch,
  );
  if (!branchResult.success || !branchResult.data) {
    throw new Error(branchResult.error || "Failed to create the GitLab branch.");
  }

  await gitlabRepositoryService.createRepositoryAction({
    taskId,
    proposalId,
    actionType: "create_branch",
    status: "completed",
    mode: "live",
    gitlabRef: branchResult.data.branchName,
    summary: branchResult.logs[branchResult.logs.length - 1] || "Branch created.",
    metadata: JSON.stringify(branchResult),
    startedAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: Date.now(),
  });
  await completeStep(0, `Branch created: ${branchResult.data.branchName}`);

  await runService.updateRunStepStatus(
    stepRecords[1],
    "running",
    "Pushing generated file contents...",
  );
  const patchFiles = await patchProposalService.getPatchFilesForProposal(proposalId);
  const gitlabFiles = patchFiles.map((file) => ({
    filePath: file.filePath,
    content: file.nextContent || "",
    action: file.changeType,
  }));
  const commitResult = await gitlabRepositoryAdapter.applyPatch(
    branchName,
    gitlabFiles,
    `Fix: ${proposal.title}\n\nAutomated by DevPilot.`,
    task.gitlabProjectId,
  );
  if (!commitResult.success || !commitResult.data) {
    throw new Error(commitResult.error || "Failed to create the GitLab commit.");
  }

  await gitlabRepositoryService.createRepositoryAction({
    taskId,
    proposalId,
    actionType: "apply_patch",
    status: "completed",
    mode: "live",
    gitlabRef: commitResult.data.commitSha,
    summary: commitResult.logs[commitResult.logs.length - 1] || "Commit pushed.",
    metadata: JSON.stringify(commitResult),
    startedAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: Date.now(),
  });
  await completeStep(1, `Commit pushed: ${commitResult.data.commitSha.slice(0, 8)}`);

  await runService.updateRunStepStatus(
    stepRecords[2],
    "running",
    "Creating merge request...",
  );
  const mrResult = await gitlabRepositoryAdapter.createMergeRequest(
    branchName,
    `[DevPilot] ${proposal.title}`,
    `## AI Fix Proposal\n\n${proposal.summary}\n\nConfidence: ${Math.round(
      proposal.confidence * 100,
    )}%`,
    task.gitlabProjectId,
    task.defaultBranch || task.branch,
  );
  if (!mrResult.success || !mrResult.data) {
    throw new Error(mrResult.error || "Failed to create the merge request.");
  }

  await gitlabRepositoryService.createMergeRequestRecord({
    taskId,
    proposalId,
    mergeRequestIid: mrResult.data.mergeRequestIid,
    title: mrResult.data.title,
    status: "opened",
    webUrl: mrResult.data.webUrl,
    sourceBranch: mrResult.data.sourceBranch,
    targetBranch: mrResult.data.targetBranch,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  await gitlabRepositoryService.createRepositoryAction({
    taskId,
    proposalId,
    actionType: "create_mr",
    status: "completed",
    mode: "live",
    gitlabRef: String(mrResult.data.mergeRequestIid),
    summary: `Opened MR !${mrResult.data.mergeRequestIid}`,
    metadata: JSON.stringify(mrResult),
    startedAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: Date.now(),
  });
  await taskService.appendAgentMessage({
    taskId,
    sender: "system",
    content: `Merge request created: !${mrResult.data.mergeRequestIid} (${mrResult.data.webUrl})`,
    kind: "success",
    timestamp: Date.now(),
  });
  await completeStep(2, `Merge request created: !${mrResult.data.mergeRequestIid}`);

  await runService.updateRunStepStatus(
    stepRecords[3],
    "running",
    "Triggering pipeline...",
  );

  // Check if CI config exists on the default branch or current context before triggering
  const ciCheck = await gitlabRepositoryAdapter.hasCIConfig(
    task.gitlabProjectId,
    task.branch || task.defaultBranch
  );

  let pipelineResult;
  if (ciCheck.success && ciCheck.data === false) {
    // Graceful skip
    await taskService.appendAgentMessage({
      taskId,
      sender: "system",
      content: "Verification pipeline skipped: Missing `.gitlab-ci.yml` configuration in this repository.",
      kind: "warning",
      timestamp: Date.now(),
    });

    // Create a dummy successful result for the workflow to continue
    pipelineResult = {
      success: true,
      mode: "live" as const,
      data: {
        pipelineId: 0,
        webUrl: mrResult.data.webUrl, // Link to MR instead
        status: "skipped",
      },
    };
  } else {
    pipelineResult = await gitlabRepositoryAdapter.rerunPipeline(
      branchName,
      task.gitlabProjectId
    );
  }

  if (!pipelineResult.success || !pipelineResult.data) {
    if (pipelineResult.error === "MISSING_CI_CONFIG") {
      await taskService.appendAgentMessage({
        taskId,
        sender: "system",
        content: "Verification pipeline skipped: GitLab reported a missing CI configuration file.",
        kind: "warning",
        timestamp: Date.now(),
      });
      // Continue anyway
      pipelineResult.data = { pipelineId: 0, webUrl: mrResult.data.webUrl, status: "skipped" };
    } else {
      throw new Error(pipelineResult.error || "Failed to trigger the pipeline.");
    }
  }

  if (pipelineResult.data.pipelineId > 0) {
    await gitlabRepositoryService.createPipelineRecord({
      taskId,
      proposalId,
      pipelineId: pipelineResult.data.pipelineId,
      status: pipelineResult.data.status as import("../../types").GitLabPipelineStatus,
      webUrl: pipelineResult.data.webUrl,
      ref: branchName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  await gitlabRepositoryService.createRepositoryAction({
    taskId,
    proposalId,
    actionType: "rerun_pipeline",
    status: "completed",
    mode: "live",
    gitlabRef: String(pipelineResult.data.pipelineId),
    summary: `Triggered pipeline #${pipelineResult.data.pipelineId}`,
    metadata: JSON.stringify(pipelineResult),
    startedAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: Date.now(),
  });
  const pipeLabel = pipelineResult.data.pipelineId > 0
    ? `#${pipelineResult.data.pipelineId}`
    : "Skipped (No CI Config)";
  await completeStep(3, `Pipeline status: ${pipeLabel}`);

  await taskService.updateTask(taskId, {
    codeFixStatus: "applied",
    branch: branchName,
  });
  await taskService.updateTaskArtifact(
    taskId,
    "log",
    [
      ...branchResult.logs,
      ...commitResult.logs,
      ...mrResult.logs,
      ...pipelineResult.logs,
    ].join("\n"),
  );
  await gitlabDuoService.updateFlowStep(taskId, "monitor_pipeline", "running");
  await patchProposalService.updatePatchProposalStatus(proposalId, "applied");
  await taskService.appendAgentMessage({
    taskId,
    sender: "devpilot",
    content: "Repository mutation complete. Polling GitLab for MR and pipeline updates.",
    kind: "info",
    timestamp: Date.now(),
  });

  return {
    branchName,
    mergeRequestIid: mrResult.data.mergeRequestIid,
    mergeRequestUrl: mrResult.data.webUrl,
    pipelineId: pipelineResult.data.pipelineId,
    pipelineUrl: pipelineResult.data.webUrl,
  };
}
