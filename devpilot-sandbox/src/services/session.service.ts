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

const DEFAULT_VIEWPORT: SandboxViewport = { width: 1280, height: 800 };

export class SessionService {
  private activeSession: SandboxSession | null = null;

  constructor() {
    if (!process.env.DISPLAY) {
      process.env.DISPLAY = ":99";
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
      vncUrl: `/novnc/vnc.html?path=websockify&autoconnect=true&resize=remote`,
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
    if (this.activeSession && this.activeSession.status !== "closed") {
      throw new Error(
        "A session is already active in this container. Cloud Run concurrency should manage multiple containers.",
      );
    }

    this.activeSession = {
      id,
      status: "initializing",
      createdAt: Date.now(),
      currentUrl: targetUrl,
      viewportInfo: viewport,
      consoleLogs: [],
    };

    try {
      const browser = await chromium.launch({
        headless: false,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--window-position=0,0",
          `--window-size=${viewport.width},${viewport.height}`,
          "--start-maximized",
        ],
      });

      const context = await browser.newContext({
        viewport,
        userAgent: "DevPilot Sandbox Browser/1.0",
        locale: "en-US",
      });

      const page = await context.newPage();
      page.on("console", (message) => this.trackConsoleMessage(this.activeSession!, message));
      page.on("pageerror", (error) => {
        this.activeSession?.consoleLogs.push(`[PAGEERROR] ${error.message}`);
      });
      page.on("requestfailed", (request) => {
        this.activeSession?.consoleLogs.push(
          `[REQUESTFAILED] ${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "unknown"}`,
        );
      });

      await page.goto(targetUrl, { waitUntil: "networkidle" });

      this.activeSession.browser = browser;
      this.activeSession.context = context;
      this.activeSession.page = page;
      this.activeSession.status = "active";
      this.activeSession.currentUrl = page.url();

      return this.activeSession;
    } catch (error) {
      if (this.activeSession) {
        this.activeSession.status = "failed";
        this.activeSession.consoleLogs.push(
          `[SESSIONERROR] ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      throw error;
    }
  }

  getSession(id?: string): SandboxSession | null {
    if (!this.activeSession) {
      return null;
    }
    if (id && this.activeSession.id !== id) {
      return null;
    }
    return this.activeSession;
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
      if (this.activeSession) {
        this.activeSession.status = "closed";
        this.activeSession.browser = undefined;
        this.activeSession.context = undefined;
        this.activeSession.page = undefined;
        this.activeSession = null;
      }
    }
  }
}

export const sessionService = new SessionService();
