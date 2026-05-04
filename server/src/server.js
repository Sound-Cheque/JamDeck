import express from 'express';
import http from 'node:http';
import { WebSocketServer } from 'ws';

export function createServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  return { app, httpServer, wss };
}
