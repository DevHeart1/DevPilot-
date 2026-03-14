import { chromium, Browser, BrowserContext, Page } from 'playwright';

export interface SandboxSession {
  id: string;
  status: 'initializing' | 'active' | 'closed' | 'failed';
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  createdAt: number;
}

export class SessionService {
  private activeSession: SandboxSession | null = null;
  private readonly defaultViewport = { width: 1280, height: 800 };

  constructor() {
    // Rely on start.sh to have DISPLAY=:99 set and xvfb running
    if (!process.env.DISPLAY) {
      process.env.DISPLAY = ':99';
    }
  }

  async createSession(id: string): Promise<SandboxSession> {
    if (this.activeSession && this.activeSession.status !== 'closed') {
      throw new Error('A session is already active in this container. Cloud Run concurrency should manage multiple containers.');
    }

    this.activeSession = {
      id,
      status: 'initializing',
      createdAt: Date.now(),
    };

    try {
      // Launch Chromium connecting to the virtual X display
      const browser = await chromium.launch({
        headless: false, // Important: must be false to render on X11
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu', // Usually better for software rendering on xvfb
          '--window-position=0,0',
          `--window-size=${this.defaultViewport.width},${this.defaultViewport.height}`,
          '--start-maximized',
        ],
      });

      const context = await browser.newContext({
        viewport: this.defaultViewport,
        userAgent: 'DevPilot Sandbox Browser/1.0',
        locale: 'en-US',
      });

      const page = await context.newPage();

      // Navigate to a blank page or default dev environment
      await page.goto('about:blank');

      this.activeSession.browser = browser;
      this.activeSession.context = context;
      this.activeSession.page = page;
      this.activeSession.status = 'active';

      return this.activeSession;
    } catch (error) {
      console.error('Failed to initialize Playwright session:', error);
      if (this.activeSession) {
        this.activeSession.status = 'failed';
      }
      throw error;
    }
  }

  getSession(id?: string): SandboxSession | null {
    if (!this.activeSession) return null;
    if (id && this.activeSession.id !== id) return null;
    return this.activeSession;
  }

  async captureScreenshot(id: string): Promise<Buffer> {
    const session = this.getSession(id);
    if (!session || session.status !== 'active' || !session.page) {
      throw new Error('No active session or page available for screenshot.');
    }
    return await session.page.screenshot({ type: 'png', fullPage: true });
  }

  async closeSession(id: string): Promise<void> {
    const session = this.getSession(id);
    if (!session) {
      return; // Already closed or doesn't exist
    }

    try {
      if (session.browser) {
        await session.browser.close();
      }
    } catch (error) {
      console.error('Error closing browser:', error);
    } finally {
      if (this.activeSession) {
        this.activeSession.status = 'closed';
        this.activeSession.browser = undefined;
        this.activeSession.context = undefined;
        this.activeSession.page = undefined;
        this.activeSession = null;
      }
    }
  }
}

export const sessionService = new SessionService();
