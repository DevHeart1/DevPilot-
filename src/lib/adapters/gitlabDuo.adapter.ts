import { AgentRole, AgentType, GitLabDuoFlowRun } from '../../types';
import { gitlabDuoService } from '../services/gitlabDuo.service';
import { runService } from '../services/run.service';

export interface AgentInvocationResult {
  success: boolean;
  message?: string;
  metadata?: Record<string, any>;
}

/**
 * gitlabDuoAdapter maps DevPilot's orchestration logic to the real GitLab Duo concepts
 * using custom flows and custom agents.
 */
export const gitlabDuoAdapter = {

  /**
   * Starts or resumes a custom GitLab Duo Flow run.
   */
  async initializeFlowRun(taskId: string, flowName: string): Promise<string> {
    const flowRunId = `run_${crypto.randomUUID().slice(0, 8)}`;
    return await gitlabDuoService.createOrUpdateFlowRun({
      taskId,
      flowRunId,
      flowName,
      status: 'running',
    });
  },

  /**
   * Transitions a flow run into a new step handled by a specific GitLab Duo Agent.
   */
  async invokeAgent(
    taskId: string,
    stepKey: string,
    agentRole: AgentRole,
    contextPayload: Record<string, any> = {}
  ): Promise<AgentInvocationResult> {

    // In a live environment, this would call the GitLab Duo Custom Agent API endpoint
    // e.g. POST /api/v4/projects/:id/duo/agents/:agent_id/invocations

    // Persist local state for the agent handoff
    await gitlabDuoService.updateFlowStep(taskId, stepKey, agentRole, 'running');

    await runService.createAgentEvent({
      taskId,
      source: "orchestrator",
      type: "STEP_STARTED",
      title: `Invoking ${agentRole}`,
      description: `GitLab Duo Flow transitioning to ${stepKey} step.`,
      metadata: JSON.stringify({ role: agentRole, step: stepKey, payloadSize: JSON.stringify(contextPayload).length }),
      timestamp: Date.now()
    });

    return { success: true, message: `Agent ${agentRole} successfully assigned.` };
  },

  /**
   * Reaches an approval checkpoint in the Custom Flow where human intervention is required.
   */
  async requireApprovalCheckpoint(taskId: string, description: string): Promise<void> {
    await runService.createAgentEvent({
      taskId,
      source: "orchestrator",
      type: "STATUS_CHANGED",
      title: `Approval Checkpoint Reached`,
      description,
      metadata: "{}",
      timestamp: Date.now()
    });
  },

  /**
   * Completes a custom flow run.
   */
  async completeFlowRun(taskId: string, success: boolean): Promise<void> {
    const existing = await gitlabDuoService.getFlowRunByTaskId(taskId);
    if (existing) {
      await gitlabDuoService.createOrUpdateFlowRun({
        taskId,
        flowRunId: existing.flowRunId,
        status: success ? 'completed' : 'failed'
      });
    }
  }

};
