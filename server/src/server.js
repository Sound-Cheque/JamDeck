import express from 'express';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createDeckStore } from './decks.js';
import { createDeckRouter } from './decks.routes.js';
import { createMediaStore } from './media.js';
import { createMediaRouter } from './media.routes.js';

export function createServer({ deckStore, mediaStore, mediaDir } = {}) {
  const decks = deckStore ?? createDeckStore({ dataDir: 'data/decks' });
  const resolvedMediaDir = mediaDir ?? 'data/media';
  const media = mediaStore ?? createMediaStore({ dataDir: resolvedMediaDir });

  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/decks', createDeckRouter(decks));
  app.use('/api/media', createMediaRouter(media));
  app.use('/media', express.static(resolvedMediaDir));

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  return { app, httpServer, wss, deckStore: decks, mediaStore: media };
}
