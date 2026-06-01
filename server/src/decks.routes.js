import { Router } from 'express';
import { DeckNotFoundError, SlideNotFoundError } from './decks.js';

// Returns a guard function that returns null when the action is allowed and
// an { status, error } object when the current-slide lock applies. When no
// playbackController is supplied, every action is allowed (back-compat for
// tests that don't wire one in).
function makeLockGuard(playbackController) {
  return function guard({ deckId, slideId = null, scope = 'slide' } = {}) {
    if (!playbackController) return null;
    const state = playbackController.getState?.();
    if (!state || state.state !== 'playing') return null;
    if (state.deckId !== deckId) return null;
    if (scope === 'deck') {
      return {
        status: 409,
        error: 'Cannot delete a deck that is currently playing',
      };
    }
    const activeSlideId = playbackController.getActiveSlideId?.();
    if (slideId && activeSlideId && slideId === activeSlideId) {
      return {
        status: 409,
        error: 'Slide is locked: it is currently playing',
      };
    }
    return null;
  };
}

export function createDeckRouter(deckStore, broadcast = () => {}, playbackController = null) {
  const router = Router();
  const lock = makeLockGuard(playbackController);

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
      broadcast({ type: 'deck:created', deck });
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
      const deck = await deckStore.updateDeck(req.params.id, req.body ?? {});
      res.json(deck);
      broadcast({ type: 'deck:update', deck });
      playbackController?.notifyDeckUpdate?.(deck);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    const blocked = lock({ deckId: req.params.id, scope: 'deck' });
    if (blocked) return res.status(blocked.status).json({ error: blocked.error });
    try {
      await deckStore.deleteDeck(req.params.id);
      res.status(204).end();
      broadcast({ type: 'deck:deleted', deckId: req.params.id });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/favorite', async (req, res, next) => {
    try {
      const deck = await deckStore.toggleFavorite(req.params.id);
      res.json(deck);
      broadcast({ type: 'deck:update', deck });
    } catch (err) {
      next(err);
    }
  });

  // Slides — the order route must be declared before /:slideId so it isn't
  // captured as a slide id.
  router.put('/:id/slides/order', async (req, res, next) => {
    const { order } = req.body ?? {};
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'order must be an array of slide ids' });
    }
    try {
      const deck = await deckStore.reorderSlides(req.params.id, order);
      res.json(deck);
      broadcast({ type: 'deck:update', deck });
    } catch (err) {
      if (err instanceof DeckNotFoundError) return next(err);
      if (/order/i.test(err.message)) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  });

  router.post('/:id/slides', async (req, res, next) => {
    try {
      const deck = await deckStore.addSlide(req.params.id, req.body ?? {});
      res.status(201).json(deck);
      broadcast({ type: 'deck:update', deck });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id/slides/:slideId', async (req, res, next) => {
    const blocked = lock({ deckId: req.params.id, slideId: req.params.slideId });
    if (blocked) return res.status(blocked.status).json({ error: blocked.error });
    try {
      const deck = await deckStore.updateSlide(
        req.params.id,
        req.params.slideId,
        req.body ?? {},
      );
      res.json(deck);
      broadcast({ type: 'deck:update', deck });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id/slides/:slideId', async (req, res, next) => {
    const blocked = lock({ deckId: req.params.id, slideId: req.params.slideId });
    if (blocked) return res.status(blocked.status).json({ error: blocked.error });
    try {
      const deck = await deckStore.deleteSlide(req.params.id, req.params.slideId);
      res.json(deck);
      broadcast({ type: 'deck:update', deck });
    } catch (err) {
      next(err);
    }
  });

  router.use((err, _req, res, _next) => {
    if (err instanceof DeckNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof SlideNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  return router;
}
