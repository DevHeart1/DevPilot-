import { taskService } from '../services';
import { runService } from '../services/run.service';
import { memoryService } from '../services/memory.service';

const orchestratedTasks = new Set<string>();

export const startMockOrchestrator = async (taskId: string) => {
  if (orchestratedTasks.has(taskId)) return;
  orchestratedTasks.add(taskId);

  const run = await taskService.getActiveAgentRun(taskId);
  if (!run || run.status !== 'running') return;

  // Initialize workflow steps
  const workflowSteps = [
    { key: "detect_ui_issue", label: "Detect UI Issue", detail: "Analyzing viewport layout..." },
    { key: "analyze_layout", label: "Analyze Layout", detail: "Identifying overflow causes..." },
    { key: "retrieve_similar_memory", label: "Retrieve Memory", detail: "Searching past solutions..." },
    { key: "generate_patch", label: "Generate Patch", detail: "Modifying component..." },
    { key: "prepare_diff", label: "Prepare Diff", detail: "Generating preview..." },
    { key: "ready_for_review", label: "Ready for Review", detail: "Waiting for approval." }
  ];

  await runService.updateAgentRunProgress(run.id, 0, "Initializing workflow...", "running");

  await runService.createAgentEvent({
    taskId,
    source: "orchestrator",
    type: "RUN_STARTED",
    title: "Workflow Started",
    description: "Started automated layout fix workflow.",
    metadata: JSON.stringify({ totalSteps: workflowSteps.length }),
    timestamp: Date.now()
  });

  const stepRecords = [];
  for (let i = 0; i < workflowSteps.length; i++) {
    const s = workflowSteps[i];
    const stepId = await runService.createRunStep({
      runId: run.id,
      taskId,
      order: i + 1,
      key: s.key,
      label: s.label,
      status: "pending",
      detail: "Waiting..."
    });
    stepRecords.push({ ...s, id: stepId });
  }

  // Update total steps
  await runService.updateAgentRunProgress(run.id, 0, stepRecords[0].detail);

  const stepsToExecute = [
    { delay: 1500, message: "Analyzing authentication requirements... Wait, detecting a layout overflow on mobile instead...", stepIndex: 0 },
    { delay: 2000, message: "Element .card-header is clipping outside its parent container at 1280px width.", stepIndex: 1 },
    { delay: 2500, message: "Reviewing project workflow memory on layout patterns...", stepIndex: 2, isMemory: true },
    { delay: 2000, message: "Proposing to use overflow-x-auto and hide scrollbars based on past memory.", stepIndex: 3 },
    { delay: 2000, message: "Applying patch to MomentsGrid.tsx...", stepIndex: 4 },
    { delay: 1500, message: "Patch ready for review. Waiting for approval.", stepIndex: 5 }
  ];

  let cumulativeDelay = 0;

  for (let i = 0; i < stepsToExecute.length; i++) {
    const { delay, message, stepIndex, isMemory } = stepsToExecute[i];
    const currentStepRecord = stepRecords[stepIndex];
    cumulativeDelay += delay;

    setTimeout(async () => {
      const currentRun = await taskService.getActiveAgentRun(taskId);
      if (currentRun && currentRun.status === 'running') {

        await runService.updateRunStepStatus(currentStepRecord.id, 'running', currentStepRecord.detail);

        await runService.createAgentEvent({
          taskId,
          source: "system",
          type: "STEP_STARTED",
          title: `Step Started: ${currentStepRecord.label}`,
          description: currentStepRecord.detail,
          metadata: JSON.stringify({ stepKey: currentStepRecord.key }),
          timestamp: Date.now()
        });

        // Complete previous step if any
        if (stepIndex > 0) {
           await runService.updateRunStepStatus(stepRecords[stepIndex - 1].id, 'completed', "Done.");
           await runService.createAgentEvent({
             taskId,
             source: "system",
             type: "STEP_COMPLETED",
             title: `Step Completed: ${stepRecords[stepIndex - 1].label}`,
             description: "Successfully finished.",
             metadata: JSON.stringify({ stepKey: stepRecords[stepIndex - 1].key }),
             timestamp: Date.now()
           });
        }

        await runService.updateAgentRunProgress(currentRun.id, stepIndex, currentStepRecord.detail);

        if (isMemory) {
          const memory = await memoryService.getRelevantMemoryForTask(taskId);
          if (memory) {
            await memoryService.attachMemoryHitToTask(taskId, memory.id, 0.92, "High textual overlap with layout overflow fix.");
            await runService.createAgentEvent({
              taskId,
              source: "memory_engine",
              type: "MEMORY_RETRIEVED",
              title: "Memory Retrieved",
              description: `Found relevant pattern: ${memory.title}`,
              metadata: JSON.stringify({ memoryId: memory.id }),
              timestamp: Date.now()
            });
          }
        }

        await taskService.appendAgentMessage({
          taskId,
          sender: "devpilot",
          content: message,
          kind: i === stepsToExecute.length - 1 ? "success" : "info",
          timestamp: Date.now()
        });

        // If it's the last step, mark it running until approved
        if (i === stepsToExecute.length - 1) {
           // We leave it as 'running' because it's waiting for user
           await runService.createAgentEvent({
             taskId,
             source: "system",
             type: "STATUS_CHANGED",
             title: "Awaiting Review",
             description: "Workflow paused, waiting for manual approval.",
             metadata: JSON.stringify({ status: "awaiting_review" }),
             timestamp: Date.now()
           });
        }
      }
    }, cumulativeDelay);
  }
};
