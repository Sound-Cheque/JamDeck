import { Router } from 'express';
import { DeckNotFoundError } from './decks.js';

export function createPlaybackRouter(controller) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(controller.getState());
  });

  router.post('/start', async (req, res, next) => {
    const { deckId } = req.body ?? {};
    if (typeof deckId !== 'string' || deckId.trim() === '') {
      return res.status(400).json({ error: 'deckId is required' });
    }
    try {
      await controller.start(deckId);
      res.json(controller.getState());
    } catch (err) {
      if (err instanceof DeckNotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      if (/no slides/i.test(err.message)) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  });

  router.post('/stop', (_req, res) => {
    controller.stop();
    res.json(controller.getState());
  });

  return router;
}
