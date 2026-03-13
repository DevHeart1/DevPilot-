import Dexie, { Table } from 'dexie';
import { Task, AgentMessage, TaskArtifact, Memory, AgentRun, AgentEvent, RunStep, TaskMemoryHit } from '../../types';

export class DevPilotDB extends Dexie {
  tasks!: Table<Task>;
  agentMessages!: Table<AgentMessage>;
  taskArtifacts!: Table<TaskArtifact>;
  memories!: Table<Memory>;
  agentRuns!: Table<AgentRun>;
  agentEvents!: Table<AgentEvent>;
  runSteps!: Table<RunStep>;
  taskMemoryHits!: Table<TaskMemoryHit>;

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
      return tx.table('agentRuns').toCollection().modify(run => {
        run.progress = run.progress ?? 0;
        run.totalSteps = run.totalSteps ?? 0;
        run.completedSteps = run.completedSteps ?? 0;
        run.mode = run.mode ?? 'mock';
      });
    });
  }
}

export const db = new DevPilotDB();
