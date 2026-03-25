import express, { Request, Response } from "express";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createServer } from "http";
import * as dotenv from "dotenv";
import { sessionService } from "./services/session.service";
import { commandService } from "./services/command.service";
import { gitService } from "./services/git.service";
import { bootstrapService } from "./services/bootstrap.service";


dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const WS_PORT = process.env.WS_PORT || 6080;

const allowedOrigins = [
  "https://dev-pilot-phi.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

// Ultra-aggressive CORS middleware for troubleshooting
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Log request for debugging
  console.log(`${req.method} ${req.url} - Origin: ${origin || 'none'}`);

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Credentials", "false");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept");
  res.setHeader("Access-Control-Max-Age", "86400");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Serve a placeholder for the VNC iframe in headless mode
app.get('/vnc/*', (req: Request, res: Response) => {
  res.send(`
    <html>
      <body style="background: #111; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
        <div style="text-align: center;">
          <h2>Live Browser Preview Disabled</h2>
          <p>The sandbox is currently running in headless mode for maximum stability.</p>
          <p>Please rely on screenshots, DOM snapshots, and traces.</p>
        </div>
      </body>
    </html>
  `);
});

// Root path for simple status check
app.get("/", (_req: Request, res: Response) => {
  res.json({
    service: "DevPilot Sandbox",
    status: "online",
    time: new Date().toISOString()
  });
});

// JSON parser for REST API routes only
app.use(express.json());

// Sandbox Lifecycle API
const apiRouter = express.Router();

apiRouter.get("/health", (_req: Request, res: Response) => {
  const version = "1.1.0-aggressive-cors";
  res.setHeader("X-Sandbox-Version", version);
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    version
  });
});

apiRouter.post("/sessions", async (req: Request, res: Response) => {
  const { id, targetUrl, viewport } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Session ID is required" });
  }
  if (!targetUrl) {
    return res.status(400).json({ error: "targetUrl is required" });
  }

  try {
    const session = await sessionService.createSession(id, targetUrl, viewport);
    console.log(`Session active: ${session.id} -> ${targetUrl}`);
    res.json(sessionService.getSerializableSession(session.id));
  } catch (error: any) {
    console.error(`Failed to create session ${id}:`, error.message);
    res.status(500).json({ error: error.message || "Failed to create session" });
  }
});

apiRouter.get("/sessions/:id", (req: Request, res: Response) => {
  const session = sessionService.getSerializableSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  res.json(session);
});

apiRouter.get("/sessions/:id/screenshot", async (req: Request, res: Response) => {
  try {
    const buffer = await sessionService.captureScreenshot(req.params.id);
    res.setHeader("Content-Type", "image/png");
    res.send(buffer);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || "Failed to capture screenshot" });
  }
});

apiRouter.delete("/sessions/:id", async (req: Request, res: Response) => {
  try {
    await sessionService.closeSession(req.params.id);
    res.json({ status: "closed" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to close session" });
  }
});


// Sandbox Lifecycle API

// ... existing code ...

apiRouter.post("/workspace/setup", async (req: Request, res: Response) => {
  const { gitlabUrl, branch, token } = req.body;
  if (!gitlabUrl || !branch) {
    return res.status(400).json({ error: "gitlabUrl and branch are required" });
  }

  try {
    console.log(`[INIT] Setting up workspace for ${gitlabUrl} @ ${branch}`);
    const repoPath = await gitService.cloneRepo(gitlabUrl, branch, token);
    const result = await bootstrapService.prepareWorkspace(repoPath);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Workspace setup failed" });
  }
});

apiRouter.post("/execute", async (req: Request, res: Response) => {

  const { command, cwd } = req.body;
  if (!command) {
    return res.status(400).json({ error: "Command is required" });
  }

  try {
    const result = await commandService.execute(command, cwd);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Execution failed" });
  }
});

apiRouter.post("/execute/start", async (req: Request, res: Response) => {
  const { id, command, cwd } = req.body;
  if (!id || !command) {
    return res.status(400).json({ error: "ID and Command are required" });
  }

  try {
    await commandService.startBackground(id, command, cwd);
    res.json({ status: "started", id });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Start failed" });
  }
});

apiRouter.post("/execute/wait-for-url", async (req: Request, res: Response) => {
  const { targetUrl, timeoutMs, intervalMs } = req.body;
  if (!targetUrl) {
    return res.status(400).json({ error: "targetUrl is required" });
  }

  try {
    const result = await commandService.waitForUrl(targetUrl, timeoutMs, intervalMs);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Readiness check failed" });
  }
});

apiRouter.post("/execute/stop", async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "ID is required" });
  }

  try {
    await commandService.stopBackground(id);
    res.json({ status: "stopped", id });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Stop failed" });
  }
});



app.use("/api", apiRouter);

const server = createServer(app);

server.listen(PORT, () => {
  console.log(`DevPilot Sandbox API listening on 0.0.0.0:${PORT}`);
  console.log(`WebSockify Proxy forwarding to localhost:${WS_PORT}`);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM signal received: closing HTTP server");
  const session = sessionService.getSession();
  if (session) {
    await sessionService.closeSession(session.id);
  }
  server.close(() => {
    console.log("HTTP server closed");
  });
});
