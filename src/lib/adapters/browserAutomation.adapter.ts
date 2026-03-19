import { sandboxAdapter } from "./sandbox.adapter";

export interface ViewportPreset {
  width: number;
  height: number;
}

export const VIEWPORT_PRESETS: Record<string, ViewportPreset> = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
};

export interface BrowserSessionResult {
  sessionId: string;
  currentUrl: string;
  status: "success" | "failed";
  screenshotBase64?: string;
  consoleLogs?: string[];
  error?: string;
  viewportInfo?: ViewportPreset;
}

export const browserAutomationAdapter = {
  async inspectTaskTarget(
    taskId: string,
    targetUrl: string,
    preset: keyof typeof VIEWPORT_PRESETS = "desktop",
  ): Promise<BrowserSessionResult> {
    const viewport = VIEWPORT_PRESETS[preset] || VIEWPORT_PRESETS.desktop;

    try {
      const session = await sandboxAdapter.createSession({
        id: taskId,
        targetUrl,
        viewport,
      });
      const screenshotBase64 = await sandboxAdapter.captureScreenshot(taskId);

      return {
        sessionId: session.id,
        currentUrl: session.currentUrl,
        status: "success",
        viewportInfo: session.viewportInfo,
        screenshotBase64,
        consoleLogs: session.consoleLogs,
      };
    } catch (error) {
      return {
        sessionId: taskId,
        currentUrl: targetUrl,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        viewportInfo: viewport,
      };
    }
  },
};
