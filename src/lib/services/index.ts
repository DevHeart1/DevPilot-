import { db } from '../db';
import { Task, AgentMessage, TaskArtifact, AgentRun } from '../../types';

export const taskService = {
  getAllTasks: async (): Promise<Task[]> => {
    return await db.tasks.toArray();
  },

  getTasksByCategory: async (category: Task['category']): Promise<Task[]> => {
    return await db.tasks.where('category').equals(category).toArray();
  },

  getTaskById: async (id: string): Promise<Task | undefined> => {
    return await db.tasks.get(id);
  },

  getMessagesByTaskId: async (taskId: string): Promise<AgentMessage[]> => {
    return await db.agentMessages.where('taskId').equals(taskId).sortBy('timestamp');
  },

  getArtifactsByTaskIdAndType: async (taskId: string, type: TaskArtifact['type']): Promise<TaskArtifact | undefined> => {
    return await db.taskArtifacts.where('[taskId+type]').equals([taskId, type]).first();
  },

  getActiveAgentRun: async (taskId: string): Promise<AgentRun | undefined> => {
    return await db.agentRuns.where('taskId').equals(taskId).first();
  },

  createTask: async (task: Task): Promise<string> => {
    return await db.tasks.add(task) as string;
  },

  appendAgentMessage: async (message: Omit<AgentMessage, 'id'>): Promise<string> => {
    const newMessage = { ...message, id: crypto.randomUUID() };
    return await db.agentMessages.add(newMessage) as string;
  },


  updateTask: async (taskId: string, data: Partial<Task>): Promise<number> => {
    return await db.tasks.update(taskId, { ...data, updatedAt: Date.now() });
  },

  updateTaskStatus: async (taskId: string, status: Task['status']): Promise<number> => {
    return await db.tasks.update(taskId, { status, updatedAt: Date.now() });
  },

  updateTaskArtifact: async (taskId: string, type: TaskArtifact['type'], content: string): Promise<string | number> => {
    const existing = await db.taskArtifacts.where('[taskId+type]').equals([taskId, type]).first();
    if (existing) {
        return await db.taskArtifacts.update(existing.id, { content, timestamp: Date.now() });
    } else {
        return await db.taskArtifacts.add({ id: crypto.randomUUID(), taskId, type, content, timestamp: Date.now() }) as string;
    }
  },

  updateAgentRunStep: async (runId: string, currentStep: string, status?: AgentRun['status']): Promise<number> => {
    const updateData: Partial<AgentRun> = { currentStep, updatedAt: Date.now() };
    if (status) {
      updateData.status = status;
    }
    return await db.agentRuns.update(runId, updateData);
  }
};
export * from './patchProposal.service';
export * from './verificationComparison.service';
