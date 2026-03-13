with open('src/lib/services/index.ts', 'r') as f:
    content = f.read()

update_task_artifact = """  updateTaskStatus: async (taskId: string, status: Task['status']): Promise<number> => {
    return await db.tasks.update(taskId, { status, updatedAt: Date.now() });
  },

  updateTaskArtifact: async (taskId: string, type: TaskArtifact['type'], content: string): Promise<string | number> => {
    const existing = await db.taskArtifacts.where('[taskId+type]').equals([taskId, type]).first();
    if (existing) {
        return await db.taskArtifacts.update(existing.id, { content, timestamp: Date.now() });
    } else {
        return await db.taskArtifacts.add({ id: crypto.randomUUID(), taskId, type, content, timestamp: Date.now() }) as string;
    }
  },"""

content = content.replace("  updateTaskStatus: async (taskId: string, status: Task['status']): Promise<number> => {\n    return await db.tasks.update(taskId, { status, updatedAt: Date.now() });\n  },", update_task_artifact)

with open('src/lib/services/index.ts', 'w') as f:
    f.write(content)
