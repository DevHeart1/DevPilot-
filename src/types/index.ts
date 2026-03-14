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
  targetUrl?: string;
  viewportPreset?: "desktop" | "tablet" | "mobile";
  viewportWidth?: number;
  viewportHeight?: number;
  lastInspectionAt?: number;
  inspectionStatus?: "idle" | "queued" | "running" | "completed" | "failed";
  codeFixStatus?: "idle" | "running" | "ready_for_review" | "approved" | "applied" | "failed";
  repoName?: string;
  repoPath?: string;
  defaultBranch?: string;
  candidateFiles?: string[];
  componentHints?: string[];
  relatedRoute?: string;
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
  type: "diff" | "log" | "terminal" | "vision_analysis" | "screenshot" | "after_screenshot" | "before_screenshot" | "after_logs" | "before_logs" | "before_analysis" | "after_analysis";
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
  phase?: "inspection" | "code_fix" | "verification";
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
  phase?: "inspection" | "code_fix" | "verification";
}

export interface TaskMemoryHit {
  id: string;
  taskId: string;
  memoryId: string;
  score: number;
  reason: string;
  createdAt: number;
}


export interface PatchProposal {
  id: string;
  taskId: string;
  source: "mock_code_agent" | "gitlab_adapter" | "hybrid";
  status: "draft" | "ready_for_review" | "approved" | "applied" | "failed";
  title: string;
  summary: string;
  suspectedFiles: string[];
  recommendedStrategy: string;
  explanation: string;
  confidence: number;
  createdAt: number;
  updatedAt: number;
}

export interface PatchFile {
  id: string;
  proposalId: string;
  taskId: string;
  filePath: string;
  changeType: "update" | "create" | "delete";
  patch: string;
  explanation: string;
  createdAt: number;
}

export interface VerificationPlan {
  id: string;
  taskId: string;
  proposalId: string;
  targetUrl: string;
  expectedOutcome: string;
  checks: string[];
  createdAt: number;
}

export interface NormalizedFixRecommendation {
  taskId: string;
  issueType: string;
  suspectedComponent: string;
  suspectedFiles: string[];
  explanation: string;
  recommendedFix: string;
  evidence: string[];
  tags: string[];
  confidence: number;
  sourceArtifactIds: string[];
}

export interface VerificationResult {
  id: string;
  taskId: string;
  proposalId: string;
  status: "passed" | "failed" | "regression_detected" | "inconclusive";
  summary: string;
  explanation: string;
  confidence: number;
  issueResolved: boolean;
  regressionDetected: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface VerificationEvidence {
  id: string;
  verificationResultId: string;
  taskId: string;
  type: "before_screenshot" | "after_screenshot" | "before_logs" | "after_logs" | "before_analysis" | "after_analysis";
  artifactId: string;
  createdAt: number;
}
