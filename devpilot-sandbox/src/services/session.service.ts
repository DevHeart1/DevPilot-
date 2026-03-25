import { chromium, Browser, BrowserContext, ConsoleMessage, Page } from "playwright";

export interface SandboxViewport {
  width: number;
  height: number;
}

export interface SandboxSession {
  id: string;
  status: "initializing" | "active" | "closed" | "failed";
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  createdAt: number;
  currentUrl: string;
  viewportInfo: SandboxViewport;
  consoleLogs: string[];
}

const DEFAULT_VIEWPORT: SandboxViewport = { width: 1440, height: 950 };

export class SessionService {
  private activeSessions: Map<string, SandboxSession> = new Map();

  constructor() {
    if (!process.env.DISPLAY) {
      process.env.DISPLAY = ":1";
    }
  }

  private trackConsoleMessage(session: SandboxSession, message: ConsoleMessage): void {
    const text = `[${message.type().toUpperCase()}] ${message.text()}`;
    session.consoleLogs.push(text);
    if (session.consoleLogs.length > 200) {
      session.consoleLogs.shift();
    }
  }

  private serializeSession(session: SandboxSession) {
    return {
      id: session.id,
      status: session.status,
      vncUrl: `/vnc/index.html?autoconnect=true&resize=remote`,
      createdAt: session.createdAt,
      currentUrl: session.currentUrl,
      viewportInfo: session.viewportInfo,
      consoleLogs: session.consoleLogs,
    };
  }

  async createSession(
    id: string,
    targetUrl: string,
    viewport: SandboxViewport = DEFAULT_VIEWPORT,
  ): Promise<SandboxSession> {
    if (this.activeSessions.has(id)) {
      console.warn(`Forcefully closing existing session ${id} to start a new one.`);
      try {
        await this.closeSession(id);
      } catch (e) {
        console.error("Error closing previous session:", e);
      }
    }

    const session: SandboxSession = {
      id,
      status: "initializing",
      createdAt: Date.now(),
      currentUrl: targetUrl,
      viewportInfo: viewport,
      consoleLogs: [],
    };

    this.activeSessions.set(id, session);

    try {
      const browser = await chromium.launch({
        headless: true, // Changed to true
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          // Removed: "--window-position=0,0",
          // Removed: `--window-size=${viewport.width},${viewport.height}`,
          // Removed: "--start-maximized",
          // Added new args for headless optimization
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ],
      });

      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }, // Changed viewport and added deviceScaleFactor
        deviceScaleFactor: 1,
        userAgent: "DevPilot Sandbox Browser/1.0",
        locale: "en-US",
      });

      const page = await context.newPage();
      page.on("console", (message) => {
        const s = this.activeSessions.get(id);
        if (s) this.trackConsoleMessage(s, message);
      });
      page.on("pageerror", (error) => {
        const s = this.activeSessions.get(id);
        if (s) {
          s.consoleLogs.push(`[PAGEERROR] ${error.message}`);
        }
      });
      page.on("requestfailed", (request) => {
        const s = this.activeSessions.get(id);
        if (s) {
          s.consoleLogs.push(
            `[REQUESTFAILED] ${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "unknown"}`,
          );
        }
      });

      await page.goto(targetUrl, { waitUntil: "networkidle" });

      const session = this.activeSessions.get(id);
      if (session) {
        session.browser = browser;
        session.context = context;
        session.page = page;
        session.status = "active";
        session.currentUrl = page.url();
      }

      return session!;
    } catch (error) {
      const session = this.activeSessions.get(id);
      if (session) {
        session.status = "failed";
        session.consoleLogs.push(
          `[SESSIONERROR] ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      throw error;
    }
  }

  getSession(id?: string): SandboxSession | null {
    if (!id) {
      // If no ID is provided, but there's a session, return the first one (for legacy fallback)
      if (this.activeSessions.size === 1) return Array.from(this.activeSessions.values())[0];
      return null;
    }
    return this.activeSessions.get(id) || null;
  }

  getSerializableSession(id?: string) {
    const session = this.getSession(id);
    return session ? this.serializeSession(session) : null;
  }

  async captureScreenshot(id: string): Promise<Buffer> {
    const session = this.getSession(id);
    if (!session || session.status !== "active" || !session.page) {
      throw new Error("No active session or page available for screenshot.");
    }

    session.currentUrl = session.page.url();
    return session.page.screenshot({ type: "png", fullPage: true });
  }

  async closeSession(id: string): Promise<void> {
    const session = this.getSession(id);
    if (!session) {
      return;
    }

    try {
      if (session.browser) {
        await session.browser.close();
      }
    } finally {
      session.status = "closed";
      session.browser = undefined;
      session.context = undefined;
      session.page = undefined;
      this.activeSessions.delete(id);
    }
  }
}

export const sessionService = new SessionService();
