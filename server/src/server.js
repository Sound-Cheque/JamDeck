import express from 'express';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createDeckStore } from './decks.js';
import { createDeckRouter } from './decks.routes.js';
import { createMediaStore } from './media.js';
import { createMediaRouter } from './media.routes.js';
import { createPlaybackController } from './playback.js';
import { createPlaybackRouter } from './playback.routes.js';
import { createShareRouter } from './share.routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = join(__dirname, '../../client/dist');

const WS_OPEN = 1; // ws library readyState constant

export function createServer({
  deckStore,
  mediaStore,
  mediaDir,
  broadcast: injectedBroadcast,
  playbackController,
  linkBridge,
  shareController = null,
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

  // If a Link bridge was supplied, re-broadcast its tempo/peer events so
  // every connected client can keep its progress / countdown calculations
  // in sync with the live DAW tempo.
  if (linkBridge && typeof linkBridge.on === 'function') {
    linkBridge.on('tempo', (bpm) => broadcast({ type: 'link:tempo', bpm }));
    linkBridge.on('peers', (numPeers) => broadcast({ type: 'link:peers', numPeers }));
  }

  const playback =
    playbackController ??
    createPlaybackController({ deckStore: decks, broadcast, linkBridge });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/decks', createDeckRouter(decks, broadcast, playback));
  app.use('/api/media', createMediaRouter(media));
  app.use('/api/playback', createPlaybackRouter(playback));
  if (shareController) {
    app.use('/api/share', createShareRouter(shareController));
  }
  app.use('/media', express.static(resolvedMediaDir));
  // Explicit 404 for missing media files — must come before the SPA catch-all
  // so unknown /media paths aren't silently served index.html.
  app.use('/media', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built client bundle when present (production / ngrok share mode).
  // In dev the Vite server handles this; in CI or tests CLIENT_DIST won't exist
  // so we skip it. Must come after all /api routes so the API wins.
  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get('/{*path}', (_req, res) => res.sendFile(join(CLIENT_DIST, 'index.html')));
  }

  return {
    app,
    httpServer,
    wss,
    deckStore: decks,
    mediaStore: media,
    broadcast,
    playbackController: playback,
    linkBridge,
    shareController,
  };
}
