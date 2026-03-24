import express, { Request, Response } from "express";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createServer } from "http";
import * as dotenv from "dotenv";
import { sessionService } from "./services/session.service";

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

// Configure http-proxy-middleware for KasmVNC web client and websockets
// Traffic to /vnc and its websockets will be proxied to the KasmVNC port (6080)
const proxyOptions = {
  target: `http://localhost:${WS_PORT}`,
  ws: true,
  changeOrigin: true,
  logLevel: "debug" as const,
};

// Proxy KasmVNC static assets and websockets
app.use('/vnc', createProxyMiddleware({
  ...proxyOptions,
  pathRewrite: { '^/vnc': '' }
}));

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
