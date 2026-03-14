import Dexie, { Table } from 'dexie';
import { Task, AgentMessage, TaskArtifact, Memory, AgentRun, AgentEvent, RunStep, TaskMemoryHit, PatchProposal, PatchFile, VerificationPlan, VerificationResult, VerificationEvidence, GitLabDuoFlowRun } from '../../types';

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
  gitLabDuoFlowRuns!: Table<GitLabDuoFlowRun>;

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

    this.version(6).stores({
      tasks: 'id, category, status, createdAt',
      agentMessages: 'id, taskId, timestamp',
      taskArtifacts: 'id, taskId, type',
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
      gitLabDuoFlowRuns: 'id, taskId, flowRunId, agentRole, status, createdAt'
    }).upgrade(tx => {
      return tx.table('agentRuns').toCollection().modify(run => {
        run.progress = run.progress ?? 0;
        run.totalSteps = run.totalSteps ?? 0;
        run.completedSteps = run.completedSteps ?? 0;
        run.mode = run.mode ?? 'mock';
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
