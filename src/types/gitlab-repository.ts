export interface GitLabAdapterResult<T = Record<string, unknown>> {
  success: boolean;
  mode: "live";
  data?: T;
  error?: string;
  logs: string[];
}

export type GitLabActionType =
  | "create_branch"
  | "apply_patch"
  | "create_mr"
  | "comment"
  | "rerun_pipeline"
  | "fetch_status";

export type GitLabActionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export interface GitLabRepositoryAction {
  id: string;
  taskId: string;
  proposalId: string;
  actionType: GitLabActionType;
  status: GitLabActionStatus;
  mode: "live";
  gitlabRef?: string;
  summary: string;
  metadata: string;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}

export type GitLabMRStatus = "opened" | "merged" | "closed" | "locked";

export interface GitLabMergeRequestRecord {
  id: string;
  taskId: string;
  proposalId: string;
  mergeRequestIid?: number;
  title: string;
  status: GitLabMRStatus;
  webUrl?: string;
  sourceBranch: string;
  targetBranch: string;
  approvedAt?: number;
  mergedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type GitLabPipelineStatus =
  | "created"
  | "waiting_for_resource"
  | "preparing"
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "canceled"
  | "skipped"
  | "manual"
  | "scheduled";

export interface GitLabPipelineRecord {
  id: string;
  taskId: string;
  proposalId: string;
  pipelineId?: number;
  status: GitLabPipelineStatus;
  webUrl?: string;
  ref?: string;
  createdAt: number;
  updatedAt: number;
}

export interface GitLabProjectSummary {
  id: number;
  name: string;
  pathWithNamespace: string;
  defaultBranch: string;
  webUrl: string;
}

export interface GitLabBranchSummary {
  name: string;
  isDefault: boolean;
  merged: boolean;
  protected: boolean;
}

export interface GitLabRepositoryTreeEntry {
  id: string;
  name: string;
  type: "tree" | "blob";
  path: string;
  mode: string;
}

export interface GitLabRepositoryFile {
  filePath: string;
  content: string;
  ref: string;
}

export type GitLabWebhookEventKind = "merge_request" | "pipeline";

export type GitLabWebhookEventAction =
  | "open"
  | "update"
  | "approved"
  | "unapproved"
  | "merge"
  | "close"
  | "reopen"
  | "started"
  | "succeeded"
  | "failed"
  | "canceled";

export interface GitLabWebhookEvent {
  id: string;
  kind: GitLabWebhookEventKind;
  action: GitLabWebhookEventAction;
  taskId?: string;
  mergeRequestIid?: number;
  pipelineId?: number;
  ref?: string;
  webUrl?: string;
  sourceProjectId?: number;
  rawPayload?: string;
  receivedAt: number;
}
