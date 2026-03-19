import { config } from "../config/env";

export interface SandboxViewport {
  width: number;
  height: number;
}

export interface SandboxSessionRequest {
  id: string;
  targetUrl: string;
  viewport: SandboxViewport;
}

export interface SandboxSessionResponse {
  id: string;
  status: "initializing" | "active" | "closed" | "failed";
  vncUrl: string;
  createdAt: number;
  currentUrl: string;
  viewportInfo: SandboxViewport;
  consoleLogs: string[];
}

export const sandboxAdapter = {
  getSandboxBaseUrl: () => config.sandboxUrl,

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${sandboxAdapter.getSandboxBaseUrl()}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  async assertHealthy(): Promise<void> {
    const isHealthy = await sandboxAdapter.checkHealth();
    if (!isHealthy) {
      throw new Error(
        `Sandbox service is not reachable at ${sandboxAdapter.getSandboxBaseUrl()}.`,
      );
    }
  },

  async createSession(request: SandboxSessionRequest): Promise<SandboxSessionResponse> {
    await sandboxAdapter.assertHealthy();

    const response = await fetch(`${sandboxAdapter.getSandboxBaseUrl()}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to create sandbox session: ${response.statusText}`);
    }

    return (await response.json()) as SandboxSessionResponse;
  },

  async getSession(sessionId: string): Promise<SandboxSessionResponse | null> {
    await sandboxAdapter.assertHealthy();

    const response = await fetch(
      `${sandboxAdapter.getSandboxBaseUrl()}/api/sessions/${sessionId}`,
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to get sandbox session: ${response.statusText}`);
    }

    return (await response.json()) as SandboxSessionResponse;
  },

  async captureScreenshot(sessionId: string): Promise<string> {
    await sandboxAdapter.assertHealthy();

    const response = await fetch(
      `${sandboxAdapter.getSandboxBaseUrl()}/api/sessions/${sessionId}/screenshot`,
    );
    if (!response.ok) {
      throw new Error(`Failed to capture screenshot: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        "",
      ),
    );
    return `data:image/png;base64,${base64}`;
  },

  async closeSession(sessionId: string): Promise<void> {
    const isHealthy = await sandboxAdapter.checkHealth();
    if (!isHealthy) {
      return;
    }

    await fetch(`${sandboxAdapter.getSandboxBaseUrl()}/api/sessions/${sessionId}`, {
      method: "DELETE",
    });
  },
};
