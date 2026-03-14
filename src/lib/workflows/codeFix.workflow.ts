import { taskService, patchProposalService } from '../services';
import { runService } from '../services/run.service';
import { memoryService } from '../services/memory.service';
import { codeAgentAdapter } from '../adapters/codeAgent.adapter';
import { gitlabDuoAdapter } from '../adapters/gitlabDuo.adapter';

export const runCodeFixWorkflow = async (taskId: string) => {
  const task = await taskService.getTaskById(taskId);
  const run = await taskService.getActiveAgentRun(taskId);
  if (!task || !run || run.status !== 'running') return;
  if (task.codeFixStatus && task.codeFixStatus !== 'idle') return;

  // 1. Mark workflow started
  await taskService.updateTask(taskId, { codeFixStatus: 'running' });
  await taskService.appendAgentMessage({
    taskId,
    sender: 'system',
    content: `Starting Code Fix Generator for ${task.title}`,
    kind: 'thinking',
    timestamp: Date.now()
  });

  // Create Step Records
  const workflowSteps = [
    { key: "infer_files", label: "Analyze Target", detail: "Mapping visual issue to likely source files..." },
    { key: "retrieve_fix_memory", label: "Check Patterns", detail: "Looking for similar historical patches..." },
    { key: "generate_recommendation", label: "Fix Recommendation", detail: "Drafting normalized fix approach..." },
    { key: "prepare_patch", label: "Prepare Patch", detail: "Generating code patches..." },
    { key: "ready_for_review", label: "Ready for Review", detail: "Patch proposal generated." }
  ];

  const startIndex = run.completedSteps || 0;

  const stepRecords = await Promise.all(
    workflowSteps.map((s, i) => runService.createRunStep({
      runId: run.id,
      taskId,
      order: startIndex + i + 1,
      key: s.key,
      label: s.label,
      status: "pending",
      detail: s.detail,
      phase: "code_fix"
    }))
  );

  const completeStep = async (index: number, detail: string) => {
    await runService.updateRunStepStatus(stepRecords[index], 'completed', detail);
    await runService.updateAgentRunProgress(run.id, startIndex + index + 1, workflowSteps[index + 1]?.detail || "Waiting for Review.");
    await runService.createAgentEvent({
      taskId,
      source: "code_agent",
      type: "STEP_COMPLETED",
      title: `Completed: ${workflowSteps[index].label}`,
      description: detail,
      metadata: "{}",
      timestamp: Date.now()
    });
  };

  try {
    // Step 1: Analyze targets from vision analysis
    await runService.updateRunStepStatus(stepRecords[0], 'running', 'Reading vision analysis...');
    const visionArtifact = await taskService.getArtifactsByTaskIdAndType(taskId, 'vision_analysis');
    let visionAnalysisResult: any = {};
    if (visionArtifact && visionArtifact.content) {
      try {
        visionAnalysisResult = JSON.parse(visionArtifact.content);
      } catch (e) { }
    }

    await taskService.appendAgentMessage({
      taskId,
      sender: 'code_agent',
      content: "Mapping visual issue to repository candidate files...",
      kind: 'info',
      timestamp: Date.now()
    });
    await completeStep(0, "Source files mapped.");

    // Step 2: Retrieve memory
    await runService.updateRunStepStatus(stepRecords[1], 'running', 'Searching codebase patterns...');
    const memory = await memoryService.getRelevantMemoryForTask(taskId);
    let memoryContent = "";
    if (memory) {
      memoryContent = memory.content;
      await taskService.appendAgentMessage({
        taskId,
        sender: 'system',
        content: `Found a relevant codebase pattern: "${memory.title}"`,
        kind: 'info',
        timestamp: Date.now()
      });
      await runService.createAgentEvent({
        taskId,
        source: "memory_engine",
        type: "MEMORY_RETRIEVED",
        title: "Code Pattern Matched",
        description: memory.title,
        metadata: "{}",
        timestamp: Date.now()
      });
    }
    await completeStep(1, "Pattern search complete.");

    // Step 3: Recommendation
    await runService.updateRunStepStatus(stepRecords[2], 'running', 'Drafting fix strategy...');
    const recommendation = await codeAgentAdapter.generateFixRecommendation(
      taskId,
      visionAnalysisResult,
      { candidateFiles: task.candidateFiles },
      memoryContent
    );
    await completeStep(2, `Strategy adopted: ${recommendation.recommendedFix}`);

    // Step 4: Propose patch
    await runService.updateRunStepStatus(stepRecords[3], 'running', 'Generating code patch proposal...');
    await taskService.appendAgentMessage({
      taskId,
      sender: 'code_agent',
      content: `Preparing a patch proposal for ${recommendation.suspectedFiles.join(', ')}...`,
      kind: 'info',
      timestamp: Date.now()
    });

    const { proposal, files } = await codeAgentAdapter.proposePatch(taskId, recommendation);

    // Store proposal and files into DB
    const proposalId = await patchProposalService.createPatchProposal(proposal);
    for (const f of files) {
      f.proposalId = proposalId;
      await patchProposalService.createPatchFile(f);
    }

    // Build combined text diff for the legacy artifact viewer
    const combinedDiff = files.map(f => f.patch).join('\n\n');
    await taskService.updateTaskArtifact(taskId, 'diff', combinedDiff);
    await runService.createAgentEvent({
      taskId,
      source: "code_agent",
      type: "ARTIFACT_UPDATED",
      title: "Patch Artifact Generated",
      description: `Generated unified diff for ${files.length} file(s).`,
      metadata: JSON.stringify({ proposalId }),
      timestamp: Date.now()
    });

    await completeStep(3, "Patch proposal generated.");

    // Step 5: Ready for Review
    await runService.updateRunStepStatus(stepRecords[4], 'running', 'Waiting for human review.');
    await taskService.updateTask(taskId, { codeFixStatus: 'ready_for_review' });

    await taskService.appendAgentMessage({
      taskId,
      sender: 'devpilot',
      content: "Patch proposal is ready for review.",
      kind: 'success',
      timestamp: Date.now()
    });

    await runService.createAgentEvent({
      taskId,
      source: "orchestrator",
      type: "STATUS_CHANGED",
      title: "Ready for Review",
      description: "Code fix phase complete, awaiting user approval.",
      metadata: "{}",
      timestamp: Date.now()
    });

    await completeStep(4, "Ready for Review");
    // Leave the run open for approval
  } catch (err: any) {
    console.error("Code fix workflow failed:", err);
    await taskService.updateTask(taskId, { codeFixStatus: 'failed' });
  }
};
