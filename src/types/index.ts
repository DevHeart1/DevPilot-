export interface Task {
  id: string;
  title: string;
  repo: string;
  branch: string;
  status: "running" | "merged" | "closed";
  category: "tasks" | "code_reviews" | "archive";
  createdAt: number;
  updatedAt: number;
  plusCount: number;
  minusCount: number;
}

export interface AgentMessage {
  id: string;
  taskId: string;
  sender: "devpilot" | "ui_agent" | "code_agent" | "system";
  content: string;
  kind: "info" | "warning" | "success" | "thinking";
  timestamp: number;
}

export interface TaskArtifact {
  id: string;
  taskId: string;
  type: "diff" | "log" | "terminal";
  content: string;
  timestamp: number;
}

export interface Memory {
  id: string;
  scope: "bug_fix" | "ui_pattern" | "code_pattern" | "workflow";
  title: string;
  content: string;
  tags: string[];
  confidence: number;
  createdAt: number;
  updatedAt: number;
}

export interface AgentRun {
  id: string;
  taskId: string;
  status: "queued" | "running" | "completed" | "failed";
  currentStep: string;
  startedAt: number;
  updatedAt: number;
  progress: number;
  totalSteps: number;
  completedSteps: number;
  mode: "mock" | "review" | "auto_fix";
  lastError?: string;
}

export interface AgentEvent {
  id: string;
  taskId: string;
  source: "system" | "ui_agent" | "code_agent" | "memory_engine" | "orchestrator";
  type:
    | "RUN_STARTED"
    | "STEP_STARTED"
    | "STEP_COMPLETED"
    | "ARTIFACT_UPDATED"
    | "MEMORY_RETRIEVED"
    | "MEMORY_STORED"
    | "STATUS_CHANGED"
    | "RUN_COMPLETED"
    | "RUN_FAILED";
  title: string;
  description: string;
  metadata: string;
  timestamp: number;
}

export interface RunStep {
  id: string;
  runId: string;
  taskId: string;
  order: number;
  key: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed";
  detail: string;
  startedAt?: number;
  completedAt?: number;
}

export interface TaskMemoryHit {
  id: string;
  taskId: string;
  memoryId: string;
  score: number;
  reason: string;
  createdAt: number;
}
