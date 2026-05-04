import express from 'express';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createDeckStore } from './decks.js';
import { createDeckRouter } from './decks.routes.js';

export function createServer({ deckStore } = {}) {
  const store = deckStore ?? createDeckStore({ dataDir: 'data/decks' });

  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/decks', createDeckRouter(store));

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  return { app, httpServer, wss, deckStore: store };
}
