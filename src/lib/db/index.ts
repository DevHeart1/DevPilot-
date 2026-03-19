import Dexie, { Table } from 'dexie';
import { Task, AgentMessage, TaskArtifact, Memory, AgentRun, AgentEvent, RunStep, TaskMemoryHit, PatchProposal, PatchFile, VerificationPlan, VerificationResult, VerificationEvidence, DuoFlowRun, DuoAgentInvocation, GitLabRepositoryAction, GitLabMergeRequestRecord, GitLabPipelineRecord } from '../../types';

export class DevPilotDB extends Dexie {
  tasks!: Table<Task>;
  agentMessages!: Table<AgentMessage>;
  taskArtifacts!: Table<TaskArtifact>;
  memories!: Table<Memory>;
  agentRuns!: Table<AgentRun>;
  agentEvents!: Table<AgentEvent>;
  runSteps!: Table<RunStep>;
  taskMemoryHits!: Table<TaskMemoryHit>;
  patchProposals!: Table<PatchProposal>;
  patchFiles!: Table<PatchFile>;
  verificationPlans!: Table<VerificationPlan>;
  verificationResults!: Table<VerificationResult>;
  verificationEvidences!: Table<VerificationEvidence>;
  duoFlowRuns!: Table<DuoFlowRun>;
  duoAgentInvocations!: Table<DuoAgentInvocation>;
  gitlabRepositoryActions!: Table<GitLabRepositoryAction>;
  gitlabMergeRequestRecords!: Table<GitLabMergeRequestRecord>;
  gitlabPipelineRecords!: Table<GitLabPipelineRecord>;

  constructor() {
    super('DevPilotDB');
    this.version(1).stores({
      tasks: 'id, category, status, createdAt',
      agentMessages: 'id, taskId, timestamp',
      taskArtifacts: 'id, [taskId+type]',
      memories: 'id, scope, createdAt',
      agentRuns: 'id, taskId, status'
    });

    this.version(2).stores({
      tasks: 'id, category, status, createdAt',
      agentMessages: 'id, taskId, timestamp',
      taskArtifacts: 'id, [taskId+type]',
      memories: 'id, scope, createdAt',
      agentRuns: 'id, taskId, status',
      agentEvents: 'id, taskId, timestamp',
      runSteps: 'id, runId, taskId, order',
      taskMemoryHits: 'id, taskId, memoryId'
    }).upgrade(tx => {
      return tx.table('tasks').toCollection().modify(task => {
        // Migration logic if any
      });
    });

    this.version(7).stores({
      tasks: 'id, category, status, createdAt',
      agentMessages: 'id, taskId, timestamp',
      taskArtifacts: 'id, [taskId+type]',
      memories: 'id, scope, createdAt',
      agentRuns: 'id, taskId, status',
      agentEvents: 'id, taskId, timestamp',
      runSteps: 'id, runId, taskId, order',
      taskMemoryHits: 'id, taskId, memoryId',
      patchProposals: 'id, taskId, status',
      patchFiles: 'id, proposalId, taskId',
      verificationPlans: 'id, taskId, proposalId',
      verificationResults: 'id, taskId, proposalId, status',
      verificationEvidences: 'id, verificationResultId, taskId, type',
      duoFlowRuns: 'id, taskId, flowRunId, flowDefinitionId, status, createdAt',
      duoAgentInvocations: 'id, flowRunId, taskId, agentRole, stepKey, invocationStatus'
    }).upgrade(tx => {
      return tx.table('agentRuns').toCollection().modify(run => {
        run.progress = run.progress ?? 0;
        run.totalSteps = run.totalSteps ?? 0;
        run.completedSteps = run.completedSteps ?? 0;
        run.mode = run.mode ?? 'mock';
      });
    });

    this.version(8).stores({
      tasks: 'id, category, status, createdAt',
      agentMessages: 'id, taskId, timestamp',
      taskArtifacts: 'id, [taskId+type]',
      memories: 'id, scope, createdAt',
      agentRuns: 'id, taskId, status',
      agentEvents: 'id, taskId, timestamp',
      runSteps: 'id, runId, taskId, order',
      taskMemoryHits: 'id, taskId, memoryId',
      patchProposals: 'id, taskId, status',
      patchFiles: 'id, proposalId, taskId',
      verificationPlans: 'id, taskId, proposalId',
      verificationResults: 'id, taskId, proposalId, status',
      verificationEvidences: 'id, verificationResultId, taskId, type',
      duoFlowRuns: 'id, taskId, flowRunId, flowDefinitionId, status, createdAt',
      duoAgentInvocations: 'id, flowRunId, taskId, agentRole, stepKey, invocationStatus',
      gitlabRepositoryActions: 'id, taskId, proposalId, actionType, status',
      gitlabMergeRequestRecords: 'id, taskId, proposalId, mergeRequestIid',
      gitlabPipelineRecords: 'id, taskId, proposalId, pipelineId, status'
    });

    this.version(9).stores({
      tasks: 'id, category, status, createdAt',
      agentMessages: 'id, taskId, timestamp',
      taskArtifacts: 'id, [taskId+type]',
      memories: 'id, scope, createdAt',
      agentRuns: 'id, taskId, status',
      agentEvents: 'id, taskId, timestamp',
      runSteps: 'id, runId, taskId, order',
      taskMemoryHits: 'id, taskId, memoryId',
      patchProposals: 'id, taskId, status',
      patchFiles: 'id, proposalId, taskId',
      verificationPlans: 'id, taskId, proposalId',
      verificationResults: 'id, taskId, proposalId, status',
      verificationEvidences: 'id, verificationResultId, taskId, type',
      duoFlowRuns: 'id, taskId, flowRunId, flowDefinitionId, status, createdAt',
      duoAgentInvocations: 'id, flowRunId, taskId, agentRole, stepKey, invocationStatus',
      gitlabRepositoryActions: 'id, taskId, proposalId, actionType, status',
      gitlabMergeRequestRecords: 'id, taskId, proposalId, mergeRequestIid',
      gitlabPipelineRecords: 'id, taskId, proposalId, pipelineId, status'
    }).upgrade(async tx => {
      await tx.table('agentRuns').toCollection().modify(run => {
        if (run.mode === 'mock') {
          run.mode = 'live';
        }
      });

      await tx.table('patchProposals').toCollection().modify(proposal => {
        if (proposal.source === 'mock_code_agent') {
          proposal.source = 'gemini_code_agent';
        }
      });
    });

    this.version(3).stores({
      tasks: 'id, category, status, createdAt',
      agentMessages: 'id, taskId, timestamp',
      taskArtifacts: 'id, [taskId+type]',
      memories: 'id, scope, createdAt',
      agentRuns: 'id, taskId, status',
      agentEvents: 'id, taskId, timestamp',
      runSteps: 'id, runId, taskId, order',
      taskMemoryHits: 'id, taskId, memoryId'
    }).upgrade(tx => {
      return tx.table('tasks').toCollection().modify(task => {
        task.inspectionStatus = task.inspectionStatus || "idle";
      });
    });

    this.version(4).stores({
      tasks: 'id, category, status, createdAt',
      agentMessages: 'id, taskId, timestamp',
      taskArtifacts: 'id, [taskId+type]',
      memories: 'id, scope, createdAt',
      agentRuns: 'id, taskId, status',
      agentEvents: 'id, taskId, timestamp',
      runSteps: 'id, runId, taskId, order',
      taskMemoryHits: 'id, taskId, memoryId',
      patchProposals: 'id, taskId, status',
      patchFiles: 'id, proposalId, taskId',
      verificationPlans: 'id, taskId, proposalId'
    }).upgrade(tx => {
      return tx.table('tasks').toCollection().modify(task => {
        task.codeFixStatus = task.codeFixStatus || "idle";
      });
    });

    this.version(5).stores({
      tasks: 'id, category, status, createdAt',
      agentMessages: 'id, taskId, timestamp',
      taskArtifacts: 'id, [taskId+type]',
      memories: 'id, scope, createdAt',
      agentRuns: 'id, taskId, status',
      agentEvents: 'id, taskId, timestamp',
      runSteps: 'id, runId, taskId, order',
      taskMemoryHits: 'id, taskId, memoryId',
      patchProposals: 'id, taskId, status',
      patchFiles: 'id, proposalId, taskId',
      verificationPlans: 'id, taskId, proposalId',
      verificationResults: 'id, taskId, proposalId, status',
      verificationEvidences: 'id, verificationResultId, taskId, type'
    });
  }
}

export const db = new DevPilotDB();
