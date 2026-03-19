export const getEnvVar = (key: string, defaultValue: string = ''): string => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] as string;
  }
  // @ts-ignore - Vite compatibility
  if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
    // @ts-ignore
    return (import.meta as any).env[key] as string;
  }
  return defaultValue;
};

export const config = {
  liveDuoExecution: (import.meta as any).env.VITE_LIVE_DUO_EXECUTION === 'true',
  gitlabDuoApiUrl: (import.meta as any).env.VITE_GITLAB_DUO_API_URL || 'https://gitlab.com/api/v4',
  gitlabDuoToken: (import.meta as any).env.VITE_GITLAB_DUO_TOKEN || '',
  liveMode: getEnvVar('VITE_LIVE_MODE', 'false') === 'true',
  liveGitlabMode: getEnvVar('VITE_LIVE_GITLAB_MODE', 'false') === 'true',
  sandboxUrl: getEnvVar('VITE_SANDBOX_URL', 'http://localhost:8080'),
  targetAppBaseUrl: getEnvVar('VITE_TARGET_APP_BASE_URL', 'http://localhost:3000'),

  // Gemini
  geminiApiKey: getEnvVar('VITE_GEMINI_API_KEY'),

  // Browserbase
  browserbaseApiKey: getEnvVar('VITE_BROWSERBASE_API_KEY'),
  browserbaseProjectId: getEnvVar('VITE_BROWSERBASE_PROJECT_ID'),

  // GitLab
  gitlabUrl: getEnvVar('VITE_GITLAB_URL', 'https://gitlab.com'),
  gitlabToken: getEnvVar('VITE_GITLAB_TOKEN'),
  gitlabProjectId: getEnvVar('VITE_GITLAB_PROJECT_ID'),
  gitlabDefaultBranch: getEnvVar('VITE_GITLAB_DEFAULT_BRANCH', 'main'),

  // GitLab Repository Integration
  liveRepositoryMode: getEnvVar('VITE_LIVE_REPOSITORY_MODE', 'false') === 'true',
  liveEventMode: getEnvVar('VITE_LIVE_EVENT_MODE', 'false') === 'true',
  webhookSecret: getEnvVar('VITE_GITLAB_WEBHOOK_SECRET'),
  get isGitLabConfigured() {
    return !!(this.liveRepositoryMode && this.gitlabToken && this.gitlabProjectId);
  },
  get isGeminiConfigured() {
    return !!(this.liveMode && this.geminiApiKey);
  },
  get isSandboxConfigured() {
    return !!this.sandboxUrl;
  },
};
