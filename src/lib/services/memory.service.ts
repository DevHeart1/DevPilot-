import { db } from '../db';
import { Memory, TaskMemoryHit } from '../../types';

export const memoryService = {
  searchMemoryByTags: async (tags: string[]): Promise<Memory[]> => {
    // Basic implementation: fetch all memories and filter by tag overlap
    const allMemories = await db.memories.toArray();
    return allMemories.filter(m => m.tags.some(tag => tags.includes(tag)));
  },

  searchMemoryByText: async (query: string): Promise<Memory[]> => {
    const q = query.toLowerCase();
    const allMemories = await db.memories.toArray();
    return allMemories.filter(m =>
      m.title.toLowerCase().includes(q) ||
      m.content.toLowerCase().includes(q)
    );
  },

  getRelevantMemoryForTask: async (taskId: string): Promise<Memory | undefined> => {
    const task = await db.tasks.get(taskId);
    if (!task) return undefined;

    // A lightweight hybrid retrieval for mock purposes
    // Check titles for keywords related to the task title
    const keywords = task.title.toLowerCase().split(' ').filter(w => w.length > 3);
    const allMemories = await db.memories.toArray();

    // Score memories
    const scoredMemories = allMemories.map(m => {
      let score = m.confidence * 0.5; // Base score from confidence

      const titleLower = m.title.toLowerCase();
      const contentLower = m.content.toLowerCase();

      keywords.forEach(kw => {
        if (titleLower.includes(kw)) score += 0.3;
        if (contentLower.includes(kw)) score += 0.2;
        if (m.tags.includes(kw)) score += 0.4;
      });

      return { memory: m, score };
    }).sort((a, b) => b.score - a.score);

    // Return the highest scoring memory if it crosses a mock threshold
    if (scoredMemories.length > 0 && scoredMemories[0].score > 0.5) {
      return scoredMemories[0].memory;
    }

    return undefined;
  },

  storeMemoryRecord: async (memory: Omit<Memory, 'id'>): Promise<string> => {
    const newMemory = { ...memory, id: crypto.randomUUID() };
    return await db.memories.add(newMemory) as string;
  },

  incrementMemoryConfidence: async (memoryId: string): Promise<number> => {
    const memory = await db.memories.get(memoryId);
    if (memory) {
      const newConfidence = Math.min(1.0, memory.confidence + 0.05);
      return await db.memories.update(memoryId, { confidence: newConfidence, updatedAt: Date.now() });
    }
    return 0;
  },

  attachMemoryHitToTask: async (taskId: string, memoryId: string, score: number, reason: string): Promise<string> => {
    const hit: TaskMemoryHit = {
      id: crypto.randomUUID(),
      taskId,
      memoryId,
      score,
      reason,
      createdAt: Date.now()
    };
    return await db.taskMemoryHits.add(hit) as string;
  },

  getTaskMemoryHits: async (taskId: string): Promise<(TaskMemoryHit & { memory: Memory })[]> => {
    const hits = await db.taskMemoryHits.where('taskId').equals(taskId).toArray();
    const result = [];
    for (const hit of hits) {
        const mem = await db.memories.get(hit.memoryId);
        if (mem) {
            result.push({ ...hit, memory: mem });
        }
    }
    return result;
  }
};
