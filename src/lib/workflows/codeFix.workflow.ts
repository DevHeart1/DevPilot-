import { codeAgentAdapter } from "../adapters/codeAgent.adapter";
import { gitlabDuoAdapter } from "../adapters/gitlabDuo.adapter";
import { gitlabRepositoryAdapter } from "../adapters/gitlabRepository.adapter";
import { taskService, patchProposalService } from "../services";
import { memoryService } from "../services/memory.service";
import { runService } from "../services/run.service";
import { countDiffStats } from "../utils/diff";

const REPOSITORY_FILE_PATTERN = /\.(tsx?|jsx?|css|scss|json|md)$/i;

function parseVisionArtifact(content?: string): Record<string, unknown> {
  if (!content) {
    return {};
  }

  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function filterRepositoryPaths(paths: string[]): string[] {
  return paths
    .filter((path) => REPOSITORY_FILE_PATTERN.test(path))
    .filter((path) => !path.includes("node_modules"))
    .slice(0, 250);
}

export const runCodeFixWorkflow = async (taskId: string) => {
  const task = await taskService.getTaskById(taskId);
  const run = await taskService.getActiveAgentRun(taskId);
  if (!task || !run || run.status !== "running") {
    return;
  }
  if (task.codeFixStatus && task.codeFixStatus !== "idle") {
    return;
  }

  await taskService.updateTask(taskId, { codeFixStatus: "running" });
  await taskService.appendAgentMessage({
    taskId,
    sender: "system",
    content: `Starting code fix generation for ${task.title}.`,
    kind: "thinking",
    timestamp: Date.now(),
  });

  const workflowSteps = [
    {
      key: "infer_files",
      label: "Analyze Target",
      detail: "Mapping the issue to repository files...",
    },
    {
      key: "retrieve_fix_memory",
      label: "Check Patterns",
      detail: "Searching previously verified fixes...",
    },
    {
      key: "generate_recommendation",
      label: "Fix Recommendation",
      detail: "Drafting the patch strategy...",
    },
    {
      key: "prepare_patch",
      label: "Prepare Patch",
      detail: "Generating updated file contents...",
    },
    {
      key: "ready_for_review",
      label: "Ready for Review",
      detail: "Patch proposal generated.",
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
      workflowSteps[index + 1]?.detail || "Waiting for review.",
    );
  };

  try {
    await gitlabDuoAdapter.invokeAgent(taskId, "infer_target_files", "code_fixer");
    await runService.updateRunStepStatus(
      stepRecords[0],
      "running",
      "Loading repository tree from GitLab...",
    );

    const visionArtifact = await taskService.getArtifactsByTaskIdAndType(
      taskId,
      "vision_analysis",
    );
    const visionAnalysisResult = parseVisionArtifact(visionArtifact?.content);

    const treeResult = await gitlabRepositoryAdapter.listRepositoryTree(
      task.branch || task.defaultBranch,
    );
    if (!treeResult.success || !treeResult.data) {
      throw new Error(treeResult.error || "Failed to load repository tree.");
    }

    const repositoryPaths = filterRepositoryPaths(
      treeResult.data
        .filter((entry) => entry.type === "blob")
        .map((entry) => entry.path),
    );
    if (repositoryPaths.length === 0) {
      throw new Error("The configured GitLab repository does not expose candidate source files.");
    }

    await taskService.appendAgentMessage({
      taskId,
      sender: "code_agent",
      content: `Loaded ${repositoryPaths.length} repository files for candidate matching.`,
      kind: "info",
      timestamp: Date.now(),
    });
    await completeStep(0, "Repository tree loaded.");

    await runService.updateRunStepStatus(
      stepRecords[1],
      "running",
      "Searching stored verification memories...",
    );
    const memory = await memoryService.getRelevantMemoryForTask(taskId);
    const memoryContent = memory?.content;
    if (memory) {
      await memoryService.attachMemoryHitToTask(
        taskId,
        memory.id,
        0.88,
        "Matched against a previously verified live run.",
      );
      await taskService.appendAgentMessage({
        taskId,
        sender: "system",
        content: `Found a relevant memory: "${memory.title}".`,
        kind: "info",
        timestamp: Date.now(),
      });
    }
    await completeStep(1, "Memory retrieval complete.");

    await gitlabDuoAdapter.invokeAgent(
      taskId,
      "generate_fix_recommendation",
      "code_fixer",
    );
    await runService.updateRunStepStatus(
      stepRecords[2],
      "running",
      "Requesting Gemini fix recommendation...",
    );

    const recommendation = await codeAgentAdapter.generateFixRecommendation({
      taskId,
      taskTitle: task.title,
      taskPrompt: task.prompt,
      visionAnalysisResult,
      repoTreePaths: repositoryPaths,
      memoryContent,
    });

    await taskService.updateTask(taskId, {
      candidateFiles: recommendation.suspectedFiles,
      componentHints: [recommendation.suspectedComponent],
    });
    await completeStep(
      2,
      `Gemini selected ${recommendation.suspectedFiles.length} file(s).`,
    );

    await gitlabDuoAdapter.invokeAgent(
      taskId,
      "prepare_patch_proposal",
      "code_fixer",
    );
    await runService.updateRunStepStatus(
      stepRecords[3],
      "running",
      "Fetching candidate file contents from GitLab...",
    );

    const fileResults = await Promise.all(
      recommendation.suspectedFiles.map((filePath) =>
        gitlabRepositoryAdapter.getFileContent(filePath, task.branch || task.defaultBranch),
      ),
    );
    const files = fileResults
      .filter((result): result is typeof result & { data: NonNullable<typeof result.data> } =>
        result.success && !!result.data,
      )
      .map((result) => result.data);

    if (files.length === 0) {
      throw new Error("Unable to load the selected repository files for patch generation.");
    }

    const { proposal, files: patchFiles } = await codeAgentAdapter.proposePatch({
      taskId,
      recommendation,
      files,
    });

    const proposalId = await patchProposalService.createPatchProposal(proposal);
    for (const file of patchFiles) {
      await patchProposalService.createPatchFile({ ...file, proposalId });
    }

    const combinedDiff = patchFiles.map((file) => file.patch).join("\n\n");
    const diffStats = patchFiles.reduce(
      (totals, file) => {
        const stats = countDiffStats(file.patch);
        totals.additions += stats.additions;
        totals.deletions += stats.deletions;
        return totals;
      },
      { additions: 0, deletions: 0 },
    );

    await taskService.updateTaskArtifact(taskId, "diff", combinedDiff);
    await taskService.updateTaskDiffStats(
      taskId,
      diffStats.additions,
      diffStats.deletions,
    );
    await completeStep(3, "Patch proposal generated.");

    await runService.updateRunStepStatus(
      stepRecords[4],
      "running",
      "Waiting for human approval.",
    );
    await taskService.updateTask(taskId, { codeFixStatus: "ready_for_review" });
    await taskService.appendAgentMessage({
      taskId,
      sender: "devpilot",
      content: "Patch proposal is ready for review.",
      kind: "success",
      timestamp: Date.now(),
    });
    await completeStep(4, "Ready for review.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await taskService.updateTask(taskId, { codeFixStatus: "failed" });
    await taskService.appendAgentMessage({
      taskId,
      sender: "system",
      content: `Code fix workflow failed: ${message}`,
      kind: "warning",
      timestamp: Date.now(),
    });
  }
};
