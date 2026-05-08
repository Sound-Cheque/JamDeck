// REST endpoints for the share controller — start / stop the ngrok tunnel
// and report its current state.

import { Router } from 'express';

export function createShareRouter(shareController) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(shareController.getStatus());
  });

  router.post('/start', async (_req, res, next) => {
    try {
      const status = await shareController.start();
      res.json(status);
    } catch (err) {
      next(err);
    }
  });

  router.post('/stop', async (_req, res, next) => {
    try {
      await shareController.stop();
      res.json(shareController.getStatus());
    } catch (err) {
      next(err);
    }
  });

  // Surface tunnel start failures as 502 so the client can show a useful
  // message ("ngrok auth failed", "package not installed", etc.).
  router.use((err, _req, res, _next) => {
    res.status(502).json({ error: err.message ?? 'tunnel error' });
  });

  return router;
}
