import { config } from "../config/env";
import {
  GitLabAdapterResult,
  GitLabBranchSummary,
  GitLabProjectSummary,
  GitLabRepositoryFile,
  GitLabRepositoryTreeEntry,
} from "../../types";

interface BranchResult {
  branchName: string;
  ref?: string;
}

interface CommitResult {
  commitSha: string;
  branchName: string;
}

interface MergeRequestResult {
  mergeRequestIid: number;
  webUrl: string;
  title: string;
  sourceBranch: string;
  targetBranch: string;
}

interface CommentResult {
  noteId: number;
}

interface PipelineResult {
  pipelineId: number;
  webUrl: string;
  status: string;
}

interface MRStatusResult {
  status: string;
  mergeRequestIid: number;
  webUrl: string;
  mergedAt?: string;
  approvedBy?: string[];
}

interface PipelineStatusResult {
  pipelineId: number;
  status: string;
  ref: string;
  webUrl: string;
  finishedAt?: string;
}

function apiBase(): string {
  return `${config.gitlabUrl}/api/v4`;
}

function projectPath(): string {
  return `${apiBase()}/projects/${encodeURIComponent(config.gitlabProjectId)}`;
}

function fail<T>(message: string, logs: string[]): GitLabAdapterResult<T> {
  return {
    success: false,
    mode: "live",
    error: message,
    logs,
  };
}

function decodeBase64(content: string): string {
  if (typeof atob === "function") {
    return atob(content);
  }

  return Buffer.from(content, "base64").toString("utf-8");
}

async function gitlabFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T; response: Response }> {
  const response = await fetch(`${projectPath()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "PRIVATE-TOKEN": config.gitlabToken,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitLab API ${response.status}: ${body}`);
  }

  return {
    data: (await response.json()) as T,
    response,
  };
}

function isLiveCapable(): boolean {
  return config.isGitLabConfigured;
}

function ensureLiveCapable(logs: string[]): string | null {
  if (isLiveCapable()) {
    return null;
  }

  const message =
    "GitLab integration is not configured. Set VITE_LIVE_REPOSITORY_MODE, VITE_GITLAB_TOKEN, and VITE_GITLAB_PROJECT_ID.";
  logs.push(message);
  return message;
}

async function collectPaginated<T>(path: string): Promise<T[]> {
  const records: T[] = [];
  let nextPage = "1";

  while (nextPage) {
    const queryJoiner = path.includes("?") ? "&" : "?";
    const { data, response } = await gitlabFetch<T[]>(
      `${path}${queryJoiner}per_page=100&page=${nextPage}`,
    );
    records.push(...data);
    nextPage = response.headers.get("x-next-page") ?? "";
  }

  return records;
}

export const gitlabRepositoryAdapter = {
  isLiveCapable,

  async getProject(): Promise<GitLabAdapterResult<GitLabProjectSummary>> {
    const logs: string[] = [];
    const configError = ensureLiveCapable(logs);
    if (configError) {
      return fail(configError, logs);
    }

    try {
      logs.push("[GITLAB] Fetching project metadata...");
      const { data } = await gitlabFetch<{
        id: number;
        name: string;
        path_with_namespace: string;
        default_branch: string;
        web_url: string;
      }>("", { method: "GET" });

      return {
        success: true,
        mode: "live",
        data: {
          id: data.id,
          name: data.name,
          pathWithNamespace: data.path_with_namespace,
          defaultBranch: data.default_branch || config.gitlabDefaultBranch,
          webUrl: data.web_url,
        },
        logs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logs.push(`[GITLAB] Project fetch failed: ${message}`);
      return fail(message, logs);
    }
  },

  async listBranches(): Promise<GitLabAdapterResult<GitLabBranchSummary[]>> {
    const logs: string[] = [];
    const configError = ensureLiveCapable(logs);
    if (configError) {
      return fail(configError, logs);
    }

    try {
      logs.push("[GITLAB] Listing branches...");
      const data = await collectPaginated<{
        name: string;
        default: boolean;
        merged: boolean;
        protected: boolean;
      }>("/repository/branches");

      return {
        success: true,
        mode: "live",
        data: data.map((branch) => ({
          name: branch.name,
          isDefault: branch.default,
          merged: branch.merged,
          protected: branch.protected,
        })),
        logs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logs.push(`[GITLAB] Branch listing failed: ${message}`);
      return fail(message, logs);
    }
  },

  async listRepositoryTree(
    ref: string = config.gitlabDefaultBranch,
    path?: string,
  ): Promise<GitLabAdapterResult<GitLabRepositoryTreeEntry[]>> {
    const logs: string[] = [];
    const configError = ensureLiveCapable(logs);
    if (configError) {
      return fail(configError, logs);
    }

    try {
      const encodedPath = path ? `&path=${encodeURIComponent(path)}` : "";
      logs.push(`[GITLAB] Listing repository tree for ref "${ref}"...`);
      const data = await collectPaginated<GitLabRepositoryTreeEntry>(
        `/repository/tree?recursive=true&ref=${encodeURIComponent(ref)}${encodedPath}`,
      );

      return {
        success: true,
        mode: "live",
        data,
        logs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logs.push(`[GITLAB] Repository tree listing failed: ${message}`);
      return fail(message, logs);
    }
  },

  async getFileContent(
    filePath: string,
    ref: string = config.gitlabDefaultBranch,
  ): Promise<GitLabAdapterResult<GitLabRepositoryFile>> {
    const logs: string[] = [];
    const configError = ensureLiveCapable(logs);
    if (configError) {
      return fail(configError, logs);
    }

    try {
      logs.push(`[GITLAB] Fetching file "${filePath}" from "${ref}"...`);
      const { data } = await gitlabFetch<{
        file_path: string;
        content: string;
      }>(
        `/repository/files/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(ref)}`,
      );

      return {
        success: true,
        mode: "live",
        data: {
          filePath: data.file_path,
          content: decodeBase64(data.content),
          ref,
        },
        logs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logs.push(`[GITLAB] File fetch failed: ${message}`);
      return fail(message, logs);
    }
  },

  async createBranch(
    branchName: string,
    ref: string = config.gitlabDefaultBranch,
  ): Promise<GitLabAdapterResult<BranchResult>> {
    const logs: string[] = [];
    const configError = ensureLiveCapable(logs);
    if (configError) {
      return fail(configError, logs);
    }

    try {
      logs.push(`[GITLAB] Creating branch "${branchName}" from "${ref}"...`);
      const { data } = await gitlabFetch<{ name: string; commit?: { id: string } }>(
        "/repository/branches",
        {
          method: "POST",
          body: JSON.stringify({ branch: branchName, ref }),
        },
      );
      logs.push(`[GITLAB] Branch "${data.name}" created successfully.`);
      return {
        success: true,
        mode: "live",
        data: { branchName: data.name, ref: data.commit?.id },
        logs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logs.push(`[GITLAB] Branch creation failed: ${message}`);
      return fail(message, logs);
    }
  },

  async applyPatch(
    branchName: string,
    files: Array<{
      filePath: string;
      content: string;
      action?: "create" | "update" | "delete";
    }>,
    commitMessage: string,
  ): Promise<GitLabAdapterResult<CommitResult>> {
    const logs: string[] = [];
    const configError = ensureLiveCapable(logs);
    if (configError) {
      return fail(configError, logs);
    }

    try {
      logs.push(`[GITLAB] Committing ${files.length} file(s) to "${branchName}"...`);
      const actions = files.map((file) => ({
        action: file.action || "update",
        file_path: file.filePath,
        content: file.content,
      }));
      const { data } = await gitlabFetch<{ id: string }>("/repository/commits", {
        method: "POST",
        body: JSON.stringify({
          branch: branchName,
          commit_message: commitMessage,
          actions,
        }),
      });
      logs.push(`[GITLAB] Commit ${data.id.slice(0, 8)} pushed.`);
      return {
        success: true,
        mode: "live",
        data: { commitSha: data.id, branchName },
        logs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logs.push(`[GITLAB] Commit failed: ${message}`);
      return fail(message, logs);
    }
  },

  async createMergeRequest(
    sourceBranch: string,
    title: string,
    description = "",
    targetBranch: string = config.gitlabDefaultBranch,
  ): Promise<GitLabAdapterResult<MergeRequestResult>> {
    const logs: string[] = [];
    const configError = ensureLiveCapable(logs);
    if (configError) {
      return fail(configError, logs);
    }

    try {
      logs.push(
        `[GITLAB] Creating MR: "${title}" (${sourceBranch} -> ${targetBranch})...`,
      );
      const { data } = await gitlabFetch<{
        iid: number;
        web_url: string;
        title: string;
        source_branch: string;
        target_branch: string;
      }>("/merge_requests", {
        method: "POST",
        body: JSON.stringify({
          source_branch: sourceBranch,
          target_branch: targetBranch,
          title,
          description,
        }),
      });
      logs.push(`[GITLAB] MR !${data.iid} created: ${data.web_url}`);
      return {
        success: true,
        mode: "live",
        data: {
          mergeRequestIid: data.iid,
          webUrl: data.web_url,
          title: data.title,
          sourceBranch: data.source_branch,
          targetBranch: data.target_branch,
        },
        logs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logs.push(`[GITLAB] MR creation failed: ${message}`);
      return fail(message, logs);
    }
  },

  async postMRComment(
    mergeRequestIid: number,
    body: string,
  ): Promise<GitLabAdapterResult<CommentResult>> {
    const logs: string[] = [];
    const configError = ensureLiveCapable(logs);
    if (configError) {
      return fail(configError, logs);
    }

    try {
      logs.push(`[GITLAB] Posting comment on MR !${mergeRequestIid}...`);
      const { data } = await gitlabFetch<{ id: number }>(
        `/merge_requests/${mergeRequestIid}/notes`,
        {
          method: "POST",
          body: JSON.stringify({ body }),
        },
      );
      logs.push(`[GITLAB] Comment posted (note ${data.id}).`);
      return {
        success: true,
        mode: "live",
        data: { noteId: data.id },
        logs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logs.push(`[GITLAB] Comment failed: ${message}`);
      return fail(message, logs);
    }
  },

  async rerunPipeline(ref: string): Promise<GitLabAdapterResult<PipelineResult>> {
    const logs: string[] = [];
    const configError = ensureLiveCapable(logs);
    if (configError) {
      return fail(configError, logs);
    }

    try {
      logs.push(`[GITLAB] Triggering pipeline on ref "${ref}"...`);
      const { data } = await gitlabFetch<{
        id: number;
        web_url: string;
        status: string;
      }>("/pipeline", {
        method: "POST",
        body: JSON.stringify({ ref }),
      });
      logs.push(`[GITLAB] Pipeline #${data.id} triggered (${data.status}).`);
      return {
        success: true,
        mode: "live",
        data: {
          pipelineId: data.id,
          webUrl: data.web_url,
          status: data.status,
        },
        logs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logs.push(`[GITLAB] Pipeline trigger failed: ${message}`);
      return fail(message, logs);
    }
  },

  async fetchMRStatus(
    mergeRequestIid: number,
  ): Promise<GitLabAdapterResult<MRStatusResult>> {
    const logs: string[] = [];
    const configError = ensureLiveCapable(logs);
    if (configError) {
      return fail(configError, logs);
    }

    try {
      logs.push(`[GITLAB] Fetching status for MR !${mergeRequestIid}...`);
      const { data } = await gitlabFetch<{
        iid: number;
        state: string;
        web_url: string;
        merged_at?: string;
        approved_by?: { user: { username: string } }[];
      }>(`/merge_requests/${mergeRequestIid}`);

      return {
        success: true,
        mode: "live",
        data: {
          status: data.state,
          mergeRequestIid: data.iid,
          webUrl: data.web_url,
          mergedAt: data.merged_at ?? undefined,
          approvedBy: data.approved_by?.map((item) => item.user.username),
        },
        logs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logs.push(`[GITLAB] MR status fetch failed: ${message}`);
      return fail(message, logs);
    }
  },

  async fetchPipelineStatus(
    pipelineId: number,
  ): Promise<GitLabAdapterResult<PipelineStatusResult>> {
    const logs: string[] = [];
    const configError = ensureLiveCapable(logs);
    if (configError) {
      return fail(configError, logs);
    }

    try {
      logs.push(`[GITLAB] Fetching pipeline #${pipelineId}...`);
      const { data } = await gitlabFetch<{
        id: number;
        status: string;
        ref: string;
        web_url: string;
        finished_at?: string;
      }>(`/pipelines/${pipelineId}`);

      return {
        success: true,
        mode: "live",
        data: {
          pipelineId: data.id,
          status: data.status,
          ref: data.ref,
          webUrl: data.web_url,
          finishedAt: data.finished_at ?? undefined,
        },
        logs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logs.push(`[GITLAB] Pipeline fetch failed: ${message}`);
      return fail(message, logs);
    }
  },
};
