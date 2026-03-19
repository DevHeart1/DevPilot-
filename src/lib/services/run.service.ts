import { db } from '../db';
import { AgentRun, AgentEvent, RunStep } from '../../types';

export const runService = {
  createAgentRun: async (run: AgentRun): Promise<string> => {
    await db.agentRuns.add(run);
    return run.id;
  },

  createAgentEvent: async (event: Omit<AgentEvent, 'id'>): Promise<string> => {
    const newEvent = { ...event, id: crypto.randomUUID() };
    return await db.agentEvents.add(newEvent) as string;
  },

  getAgentEventsByTaskId: async (taskId: string): Promise<AgentEvent[]> => {
    return await db.agentEvents.where('taskId').equals(taskId).sortBy('timestamp');
  },

  createRunStep: async (step: Omit<RunStep, 'id'>): Promise<string> => {
    const newStep = { ...step, id: crypto.randomUUID() };
    return await db.runSteps.add(newStep) as string;
  },

  getRunStepsByRunId: async (runId: string): Promise<RunStep[]> => {
    return await db.runSteps.where('runId').equals(runId).sortBy('order');
  },

  updateRunStepStatus: async (stepId: string, status: RunStep['status'], detail?: string): Promise<number> => {
    const updateData: Partial<RunStep> = { status };
    if (detail) updateData.detail = detail;
    if (status === 'completed' || status === 'failed') {
      updateData.completedAt = Date.now();
    } else if (status === 'running') {
      updateData.startedAt = Date.now();
    }
    return await db.runSteps.update(stepId, updateData);
  },

  updateAgentRunProgress: async (runId: string, completedSteps: number, currentStep?: string, status?: AgentRun['status']): Promise<number> => {
    const run = await db.agentRuns.get(runId);
    if (!run) return 0;

    const progress = run.totalSteps > 0 ? Math.round((completedSteps / run.totalSteps) * 100) : 0;

    const updateData: Partial<AgentRun> = {
      completedSteps,
      progress,
      updatedAt: Date.now()
    };

    if (currentStep) updateData.currentStep = currentStep;
    if (status) updateData.status = status;

    return await db.agentRuns.update(runId, updateData);
  }
};
