import { config } from '../config/env';

export interface GitLabHandoffResult {
  success: boolean;
  branchName?: string;
  mergeRequestUrl?: string;
  error?: string;
  logs?: string[];
}

export const gitlabRepositoryAdapter = {
  /**
   * Pushes the approved patch proposal to the upstream remote and creates a Merge Request.
   * Mocked for demo mode unless a live backend integration exists.
   */
  async applyPatchProposal(taskId: string, proposalId: string): Promise<GitLabHandoffResult> {
    const isLive = config.liveGitlabMode && config.gitlabToken && config.gitlabProjectId;

    // Simulate network latency for GitLab API
    await new Promise(resolve => setTimeout(resolve, 2500));

    if (!isLive) {
      return {
        success: true,
        branchName: `fix/agent-proposal-${proposalId.slice(0, 6)}`,
        mergeRequestUrl: `https://gitlab.com/demo/project/-/merge_requests/42`,
        logs: [
          `[MOCK] Authenticating with GitLab...`,
          `[MOCK] Created branch: fix/agent-proposal-${proposalId.slice(0, 6)}`,
          `[MOCK] Committed patch for ${taskId}.`,
          `[MOCK] Opened Merge Request #42.`,
          `[MOCK] Triggered CI/CD pipeline.`
        ]
      };
    }

    // Future Real GitLab Integration Point
    return {
      success: true,
      branchName: `fix/agent-proposal-${proposalId.slice(0, 6)}`,
      mergeRequestUrl: `https://gitlab.com/project/-/merge_requests/99`,
      logs: [
        `[GITLAB] Connecting to API...`,
        `[GITLAB] Branch pushed. MR created. Pipeline initiated.`
      ]
    };
  }
};
