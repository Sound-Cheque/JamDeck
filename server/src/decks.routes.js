import { Router } from 'express';
import { DeckNotFoundError } from './decks.js';

export function createDeckRouter(deckStore) {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      res.json(await deckStore.listDecks());
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    const { name } = req.body ?? {};
    if (typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'name is required' });
    }
    try {
      const deck = await deckStore.createDeck({ name });
      res.status(201).json(deck);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      res.json(await deckStore.getDeck(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      res.json(await deckStore.updateDeck(req.params.id, req.body ?? {}));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      await deckStore.deleteDeck(req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/favorite', async (req, res, next) => {
    try {
      res.json(await deckStore.toggleFavorite(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.use((err, _req, res, _next) => {
    if (err instanceof DeckNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  return router;
}
