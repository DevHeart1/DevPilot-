import { db } from '../db';
import { GitLabDuoFlowRun, AgentRole, AgentType } from '../../types';

export const gitlabDuoService = {
  async getFlowRunByTaskId(taskId: string): Promise<GitLabDuoFlowRun | undefined> {
    return db.gitLabDuoFlowRuns.where('taskId').equals(taskId).first();
  },

  async createOrUpdateFlowRun(
    flowRun: Partial<GitLabDuoFlowRun> & { taskId: string; flowRunId: string }
  ): Promise<string> {
    const existing = await this.getFlowRunByTaskId(flowRun.taskId);
    if (existing) {
      await db.gitLabDuoFlowRuns.update(existing.id, {
        ...flowRun,
        updatedAt: Date.now()
      });
      return existing.id;
    } else {
      const newFlowRun: GitLabDuoFlowRun = {
        id: crypto.randomUUID(),
        taskId: flowRun.taskId,
        flowRunId: flowRun.flowRunId!,
        flowName: flowRun.flowName || 'DevPilot Standard Fix Flow',
        flowStepKey: flowRun.flowStepKey || 'inspection',
        agentRole: flowRun.agentRole || 'ui_inspector',
        agentType: flowRun.agentType || 'custom',
        agentInvocationId: flowRun.agentInvocationId || crypto.randomUUID(),
        handoffState: flowRun.handoffState || 'pending',
        approvalCheckpoint: flowRun.approvalCheckpoint || false,
        status: flowRun.status || 'running',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...flowRun
      } as GitLabDuoFlowRun;
      await db.gitLabDuoFlowRuns.add(newFlowRun);
      return newFlowRun.id;
    }
  },

  async updateFlowStep(
    taskId: string,
    stepKey: string,
    agentRole: AgentRole,
    status: GitLabDuoFlowRun['status'] = 'running'
  ) {
      const existing = await this.getFlowRunByTaskId(taskId);
      if(existing) {
          await db.gitLabDuoFlowRuns.update(existing.id, {
              flowStepKey: stepKey,
              agentRole: agentRole,
              status,
              updatedAt: Date.now()
          })
      }
  }
};
