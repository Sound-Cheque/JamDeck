import express from 'express';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createDeckStore } from './decks.js';
import { createDeckRouter } from './decks.routes.js';
import { createMediaStore } from './media.js';
import { createMediaRouter } from './media.routes.js';

const WS_OPEN = 1; // ws library readyState constant

export function createServer({
  deckStore,
  mediaStore,
  mediaDir,
  broadcast: injectedBroadcast,
} = {}) {
  const decks = deckStore ?? createDeckStore({ dataDir: 'data/decks' });
  const resolvedMediaDir = mediaDir ?? 'data/media';
  const media = mediaStore ?? createMediaStore({ dataDir: resolvedMediaDir });

  const app = express();
  app.use(express.json());

  const httpServer = http.createServer(app);
  // Path is /api/ws (not /ws) because Vite's HMR also handles WebSocket
  // upgrades on the dev server port, and a top-level /ws path confuses its
  // proxy routing. Nesting under /api keeps everything app-related on one
  // proxied prefix.
  const wss = new WebSocketServer({ server: httpServer, path: '/api/ws' });

  // Default broadcaster: send a JSON message to every open WS client.
  // Tests can inject a spy via the `broadcast` option to skip the WS layer.
  const broadcast =
    injectedBroadcast ??
    ((message) => {
      const data = JSON.stringify(message);
      for (const client of wss.clients) {
        if (client.readyState === WS_OPEN) {
          client.send(data);
        }
      }
    });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/decks', createDeckRouter(decks, broadcast));
  app.use('/api/media', createMediaRouter(media));
  app.use('/media', express.static(resolvedMediaDir));

  return { app, httpServer, wss, deckStore: decks, mediaStore: media, broadcast };
}
