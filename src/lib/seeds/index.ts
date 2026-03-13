import { db } from '../db';
import { Task, AgentMessage, TaskArtifact, Memory, AgentRun, AgentEvent, RunStep, TaskMemoryHit } from '../../types';

export const TASK_ID_ACTIVE = crypto.randomUUID();

export const seedTasks: Task[] = [
  {
    id: crypto.randomUUID(),
    title: "Fix layout for top matches on mobile",
    repo: "Project-X",
    branch: "fix/top-matches-layout",
    status: "merged",
    category: "tasks",
    createdAt: Date.now() - 1000 * 60 * 60 * 2, // 2h ago
    updatedAt: Date.now() - 1000 * 60 * 60 * 2,
    plusCount: 52,
    minusCount: 9,
  },
  {
    id: TASK_ID_ACTIVE,
    title: "Refactor authentication middleware",
    repo: "Project-X",
    branch: "refactor/auth-middleware",
    status: "running",
    category: "tasks",
    createdAt: Date.now() - 1000 * 60 * 60 * 5, // 5h ago
    updatedAt: Date.now() - 1000 * 60 * 60 * 5,
    plusCount: 124,
    minusCount: 31,
  },
  {
    id: crypto.randomUUID(),
    title: "Update dependency: tailwindcss v3.4",
    repo: "Project-X",
    branch: "deps/tailwindcss",
    status: "merged",
    category: "tasks",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3, // 3d ago
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
    plusCount: 12,
    minusCount: 12,
  },
  {
    id: crypto.randomUUID(),
    title: "Implement Redis caching for API endpoints",
    repo: "Project-X",
    branch: "feature/redis-cache",
    status: "closed",
    category: "archive",
    createdAt: new Date("2023-10-12").getTime(),
    updatedAt: new Date("2023-10-12").getTime(),
    plusCount: 284,
    minusCount: 0,
  },
  {
    id: crypto.randomUUID(),
    title: "Hotfix: SSL Certificate renewal automation",
    repo: "Project-X",
    branch: "hotfix/ssl-cert",
    status: "merged",
    category: "tasks",
    createdAt: new Date("2023-09-28").getTime(),
    updatedAt: new Date("2023-09-28").getTime(),
    plusCount: 45,
    minusCount: 2,
  },
];

export const seedMessages: AgentMessage[] = [
  {
    id: crypto.randomUUID(),
    taskId: TASK_ID_ACTIVE,
    sender: "devpilot",
    content: "I've detected a need to refactor the authentication middleware to support token rotation.",
    kind: "info",
    timestamp: Date.now() - 1000 * 60 * 5,
  },
  {
    id: crypto.randomUUID(),
    taskId: TASK_ID_ACTIVE,
    sender: "devpilot",
    content: "Proposing a new JWT verification flow that handles refresh tokens automatically.",
    kind: "info",
    timestamp: Date.now() - 1000 * 60 * 4,
  },
];

export const seedArtifacts: TaskArtifact[] = [
  {
    id: crypto.randomUUID(),
    taskId: TASK_ID_ACTIVE,
    type: "diff",
    content: `--- a/src/middleware/auth.ts
+++ b/src/middleware/auth.ts
@@ -10,8 +10,14 @@
 export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
   const token = req.headers.authorization?.split(' ')[1];
   if (!token) return res.status(401).json({ error: 'Unauthorized' });
-
-  try {
-    const payload = jwt.verify(token, process.env.JWT_SECRET);
+
+  try {
+    const payload = await verifyToken(token);
     req.user = payload;
     next();
+  } catch (err) {
+    if (err.name === 'TokenExpiredError') {
+      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
+    }
+    return res.status(401).json({ error: 'Invalid token' });
   }
 };`,
    timestamp: Date.now() - 1000 * 60 * 3,
  },
  {
    id: crypto.randomUUID(),
    taskId: TASK_ID_ACTIVE,
    type: "log",
    content: `[INFO] Starting middleware analysis...
[INFO] Found 12 routes using requireAuth middleware.
[WARN] JWT_SECRET is accessed synchronously.
[INFO] Analyzing TokenExpiredError handling...
[INFO] Refactoring requireAuth to use async verifyToken...
[SUCCESS] Refactoring complete.`,
    timestamp: Date.now() - 1000 * 60 * 3,
  },
  {
    id: crypto.randomUUID(),
    taskId: TASK_ID_ACTIVE,
    type: "terminal",
    content: `$ npm run test:auth
> project-x@1.0.0 test:auth
> jest src/middleware/auth.test.ts

PASS src/middleware/auth.test.ts
  Auth Middleware
    ✓ should allow access with valid token (42 ms)
    ✓ should reject access without token (12 ms)
    ✓ should reject expired token with TOKEN_EXPIRED code (15 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
Snapshots:   0 total
Time:        1.24 s
Ran all test suites matching /src\\/middleware\\/auth.test.ts/i.`,
    timestamp: Date.now() - 1000 * 60 * 3,
  }
];

export const seedMemories: Memory[] = [
  {
    id: crypto.randomUUID(),
    scope: "workflow",
    title: "Authentication standard",
    content: "Always return 401 with code 'TOKEN_EXPIRED' when JWT throws TokenExpiredError.",
    tags: ["auth", "jwt", "api"],
    confidence: 0.95,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 7,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 7,
  },
  {
    id: crypto.randomUUID(),
    scope: "code_pattern",
    title: "Async middleware wrapper",
    content: "Use asyncHandler for route handlers to avoid manual try-catch blocks.",
    tags: ["express", "middleware", "async"],
    confidence: 0.88,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 14,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 14,
  },
  {
    id: crypto.randomUUID(),
    scope: "ui_pattern",
    title: "Horizontal overflow in card rails",
    content: "Horizontal overflow in card rails is often resolved with overflow-x-auto and scrollbar hiding instead of flex-wrap.",
    tags: ["ui", "layout", "mobile", "overflow"],
    confidence: 0.92,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
  },
  {
    id: crypto.randomUUID(),
    scope: "bug_fix",
    title: "Small viewport layout regressions",
    content: "Small viewport layout regressions commonly happen when flex-wrap combines with fixed card min-width.",
    tags: ["css", "flexbox", "responsive"],
    confidence: 0.85,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
  }
];

export const seedAgentRuns: AgentRun[] = [
  {
    id: crypto.randomUUID(),
    taskId: TASK_ID_ACTIVE,
    status: "running",
    currentStep: "Initializing...",
    startedAt: Date.now() - 1000 * 60 * 5,
    updatedAt: Date.now() - 1000 * 60 * 3,
    progress: 0,
    totalSteps: 6,
    completedSteps: 0,
    mode: "mock"
  }
];


export const seedAgentEvents: AgentEvent[] = [];
export const seedRunSteps: RunStep[] = [];
export const seedTaskMemoryHits: TaskMemoryHit[] = [];

export async function initializeDb() {
  const count = await db.tasks.count();
  if (count === 0) {
    console.log("Seeding database...");
    await db.tasks.bulkAdd(seedTasks);
    await db.agentMessages.bulkAdd(seedMessages);
    await db.taskArtifacts.bulkAdd(seedArtifacts);
    await db.memories.bulkAdd(seedMemories);
    await db.agentRuns.bulkAdd(seedAgentRuns);
    await db.agentEvents.bulkAdd(seedAgentEvents);
    await db.runSteps.bulkAdd(seedRunSteps);
    await db.taskMemoryHits.bulkAdd(seedTaskMemoryHits);
    console.log("Database seeded successfully.");
  }
}