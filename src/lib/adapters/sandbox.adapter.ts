import { getEnvVar } from '../config/env';

export interface SandboxSessionResponse {
  id: string;
  status: 'initializing' | 'active' | 'closed' | 'failed';
  vncUrl: string;
  createdAt: number;
}

export const sandboxAdapter = {
  getSandboxBaseUrl: () => {
    // If not specified, default to localhost for local testing
    return getEnvVar('VITE_SANDBOX_URL', 'http://localhost:8080');
  },

  checkHealth: async (): Promise<boolean> => {
    try {
      const response = await fetch(`${sandboxAdapter.getSandboxBaseUrl()}/api/sessions/health`, {
        signal: AbortSignal.timeout(2000)
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  createSession: async (sessionId: string): Promise<SandboxSessionResponse> => {
    const isHealthy = await sandboxAdapter.checkHealth();
    if (!isHealthy) {
      console.warn('Sandbox service is not reachable. Falling back to mock session.');
      return sandboxAdapter.mockCreateSession(sessionId);
    }

    const response = await fetch(`${sandboxAdapter.getSandboxBaseUrl()}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sessionId })
    });

    if (!response.ok) {
      throw new Error(`Failed to create sandbox session: ${response.statusText}`);
    }

    return await response.json();
  },

  getSession: async (sessionId: string): Promise<SandboxSessionResponse | null> => {
    const isHealthy = await sandboxAdapter.checkHealth();
    if (!isHealthy) {
      return sandboxAdapter.mockCreateSession(sessionId);
    }

    const response = await fetch(`${sandboxAdapter.getSandboxBaseUrl()}/api/sessions/${sessionId}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Failed to get sandbox session: ${response.statusText}`);

    return await response.json();
  },

  captureScreenshot: async (sessionId: string): Promise<string> => {
    const isHealthy = await sandboxAdapter.checkHealth();
    if (!isHealthy) {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='; // Mock 1x1 transparent pixel
    }

    const response = await fetch(`${sandboxAdapter.getSandboxBaseUrl()}/api/sessions/${sessionId}/screenshot`);
    if (!response.ok) throw new Error(`Failed to capture screenshot: ${response.statusText}`);

    const arrayBuffer = await response.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer)
        .reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    return `data:image/png;base64,${base64}`;
  },

  closeSession: async (sessionId: string): Promise<void> => {
    const isHealthy = await sandboxAdapter.checkHealth();
    if (!isHealthy) return; // Ignore in mock mode

    await fetch(`${sandboxAdapter.getSandboxBaseUrl()}/api/sessions/${sessionId}`, {
      method: 'DELETE'
    });
  },

  // Graceful fallback methods for disconnected environment
  mockCreateSession: (sessionId: string): SandboxSessionResponse => ({
    id: sessionId,
    status: 'active',
    vncUrl: '#mock-vnc-url',
    createdAt: Date.now()
  })
};
