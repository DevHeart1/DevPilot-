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

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);

      const isAllowed = allowedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app") ||
        process.env.NODE_ENV === "development";

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    preflightContinue: false,
    optionsSuccessStatus: 204
  })
);

// Configure http-proxy-middleware for noVNC and websockify
// All traffic to /novnc and /websockify will be proxied to the local websockify port (6080)
const proxyOptions = {
  target: `http://localhost:${WS_PORT}`,
  ws: true,
  changeOrigin: true,
  logLevel: "debug" as const,
};

// Proxy noVNC static assets
app.use('/novnc', createProxyMiddleware(proxyOptions));
app.use('/websockify', createProxyMiddleware(proxyOptions));

// JSON parser for REST API routes only
app.use(express.json());

// Sandbox Lifecycle API
const apiRouter = express.Router();

apiRouter.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", time: new Date().toISOString() });
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
    res.json(sessionService.getSerializableSession(session.id));
  } catch (error: any) {
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
