import express, { Request, Response } from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createServer } from 'http';
import * as dotenv from 'dotenv';
import { sessionService } from './services/session.service';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const WS_PORT = process.env.WS_PORT || 6080;

app.use(cors());

// Configure http-proxy-middleware for noVNC and websockify
// All traffic to /novnc and /websockify will be proxied to the local websockify port (6080)
const proxyOptions = {
  target: `http://localhost:${WS_PORT}`,
  ws: true, // proxy websockets
  changeOrigin: true,
  logLevel: 'debug' as const,
};

// Proxy noVNC static assets
app.use('/novnc', createProxyMiddleware(proxyOptions));
app.use('/websockify', createProxyMiddleware(proxyOptions));

// JSON parser for REST API routes only
app.use(express.json());

// Sandbox Lifecycle API
const apiRouter = express.Router();

// GET /api/sessions/health
apiRouter.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// POST /api/sessions
apiRouter.post('/sessions', async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  try {
    const session = await sessionService.createSession(id);
    res.json({
      id: session.id,
      status: session.status,
      // Provide URLs where the client can reach this session's UI
      vncUrl: `/novnc/vnc.html?path=websockify&autoconnect=true&resize=remote`,
      createdAt: session.createdAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create session' });
  }
});

// GET /api/sessions/:id
apiRouter.get('/sessions/:id', (req: Request, res: Response) => {
  const session = sessionService.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    id: session.id,
    status: session.status,
    vncUrl: `/novnc/vnc.html?path=websockify&autoconnect=true&resize=remote`,
    createdAt: session.createdAt,
  });
});

// GET /api/sessions/:id/screenshot
apiRouter.get('/sessions/:id/screenshot', async (req: Request, res: Response) => {
  try {
    const buffer = await sessionService.captureScreenshot(req.params.id);
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to capture screenshot' });
  }
});

// DELETE /api/sessions/:id
apiRouter.delete('/sessions/:id', async (req: Request, res: Response) => {
  try {
    await sessionService.closeSession(req.params.id);
    res.json({ status: 'closed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to close session' });
  }
});

app.use('/api', apiRouter);

const server = createServer(app);

// Start listening on all interfaces
server.listen(PORT, () => {
  console.log(`DevPilot Sandbox API listening on 0.0.0.0:${PORT}`);
  console.log(`WebSockify Proxy forwarding to localhost:${WS_PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  const session = sessionService.getSession();
  if (session) {
    await sessionService.closeSession(session.id);
  }
  server.close(() => {
    console.log('HTTP server closed');
  });
});
