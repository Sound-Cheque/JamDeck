import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, unlink, rename } from 'node:fs/promises';
import { join } from 'node:path';

export class DeckNotFoundError extends Error {
  constructor(id) {
    super(`Deck not found: ${id}`);
    this.name = 'DeckNotFoundError';
    this.id = id;
  }
}

export class SlideNotFoundError extends Error {
  constructor(deckId, slideId) {
    super(`Slide not found: ${slideId} (deck ${deckId})`);
    this.name = 'SlideNotFoundError';
    this.deckId = deckId;
    this.slideId = slideId;
  }
}

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

const DEFAULT_SETTINGS = Object.freeze({
  timingMode: 'duration',
  internalBpm: 120,
  metronomeSounds: { accent: null, beat: null },
  timerStyle: 'backgroundFill',
  countdownBars: 2,
  countdownSeconds: 5,
  loop: false,
  showSlideStrip: true,
});

function isValidId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

function deckPath(dataDir, id) {
  return join(dataDir, `${id}.json`);
}

async function readDeckFile(path) {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

async function writeDeckFile(path, deck) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(deck, null, 2), 'utf8');
  await rename(tmp, path);
}

function defaultDuration(deck) {
  const mode = deck.settings?.timingMode;
  if (mode === 'link' || mode === 'internal') {
    return { unit: 'bars', value: 8 };
  }
  return { unit: 'seconds', value: 30 };
}

function makeSlide(deck, partial = {}) {
  return {
    type: 'canvas',
    duration: defaultDuration(deck),
    content: { objects: [], background: '#ffffff' },
    ...partial,
    id: randomUUID(), // always generated, even if partial supplied one
  };
}

function mergeDeck(current, patch) {
  const settings = patch.settings
    ? { ...current.settings, ...patch.settings }
    : current.settings;
  return {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    settings,
    slides: patch.slides ?? current.slides,
    updatedAt: new Date().toISOString(),
  };
}

export function createDeckStore({ dataDir }) {
  const writeQueues = new Map();

  function withLock(id, fn) {
    const prev = writeQueues.get(id) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    writeQueues.set(id, next);
    const cleanup = () => {
      if (writeQueues.get(id) === next) writeQueues.delete(id);
    };
    next.then(cleanup, cleanup);
    return next;
  }

  async function createDeck({ name }) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('Deck name is required');
    }
    await mkdir(dataDir, { recursive: true });
    const now = new Date().toISOString();
    const deck = {
      id: randomUUID(),
      name: name.trim(),
      favorite: false,
      createdAt: now,
      updatedAt: now,
      settings: structuredClone(DEFAULT_SETTINGS),
      slides: [],
    };
    await writeDeckFile(deckPath(dataDir, deck.id), deck);
    return deck;
  }

  async function getDeck(id) {
    if (!isValidId(id)) throw new DeckNotFoundError(id);
    try {
      return await readDeckFile(deckPath(dataDir, id));
    } catch (err) {
      if (err.code === 'ENOENT') throw new DeckNotFoundError(id);
      throw err;
    }
  }

  async function listDecks() {
    let entries;
    try {
      entries = await readdir(dataDir);
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    const summaries = [];
    for (const file of entries) {
      if (!file.endsWith('.json')) continue;
      try {
        const deck = await readDeckFile(join(dataDir, file));
        summaries.push({
          id: deck.id,
          name: deck.name,
          favorite: deck.favorite,
          createdAt: deck.createdAt,
          updatedAt: deck.updatedAt,
          slideCount: deck.slides?.length ?? 0,
        });
      } catch {
        // skip malformed deck files
      }
    }
    return summaries;
  }

  function updateDeck(id, patch) {
    if (!isValidId(id)) return Promise.reject(new DeckNotFoundError(id));
    return withLock(id, async () => {
      const current = await getDeck(id);
      const merged = mergeDeck(current, patch);
      await writeDeckFile(deckPath(dataDir, id), merged);
      return merged;
    });
  }

  function deleteDeck(id) {
    if (!isValidId(id)) return Promise.reject(new DeckNotFoundError(id));
    return withLock(id, async () => {
      try {
        await unlink(deckPath(dataDir, id));
      } catch (err) {
        if (err.code === 'ENOENT') throw new DeckNotFoundError(id);
        throw err;
      }
    });
  }

  function toggleFavorite(id) {
    if (!isValidId(id)) return Promise.reject(new DeckNotFoundError(id));
    return withLock(id, async () => {
      const current = await getDeck(id);
      const merged = mergeDeck(current, { favorite: !current.favorite });
      await writeDeckFile(deckPath(dataDir, id), merged);
      return merged;
    });
  }

  function addSlide(deckId, partial = {}) {
    if (!isValidId(deckId)) return Promise.reject(new DeckNotFoundError(deckId));
    return withLock(deckId, async () => {
      const deck = await getDeck(deckId);
      const slide = makeSlide(deck, partial);
      const merged = mergeDeck(deck, { slides: [...deck.slides, slide] });
      await writeDeckFile(deckPath(dataDir, deckId), merged);
      return merged;
    });
  }

  function updateSlide(deckId, slideId, patch) {
    if (!isValidId(deckId)) return Promise.reject(new DeckNotFoundError(deckId));
    return withLock(deckId, async () => {
      const deck = await getDeck(deckId);
      const idx = deck.slides.findIndex((s) => s.id === slideId);
      if (idx === -1) throw new SlideNotFoundError(deckId, slideId);
      const nextSlide = { ...deck.slides[idx], ...patch, id: deck.slides[idx].id };
      const slides = [...deck.slides];
      slides[idx] = nextSlide;
      const merged = mergeDeck(deck, { slides });
      await writeDeckFile(deckPath(dataDir, deckId), merged);
      return merged;
    });
  }

  function deleteSlide(deckId, slideId) {
    if (!isValidId(deckId)) return Promise.reject(new DeckNotFoundError(deckId));
    return withLock(deckId, async () => {
      const deck = await getDeck(deckId);
      const idx = deck.slides.findIndex((s) => s.id === slideId);
      if (idx === -1) throw new SlideNotFoundError(deckId, slideId);
      const slides = deck.slides.filter((s) => s.id !== slideId);
      const merged = mergeDeck(deck, { slides });
      await writeDeckFile(deckPath(dataDir, deckId), merged);
      return merged;
    });
  }

  function reorderSlides(deckId, orderedIds) {
    if (!isValidId(deckId)) return Promise.reject(new DeckNotFoundError(deckId));
    return withLock(deckId, async () => {
      const deck = await getDeck(deckId);
      const have = new Set(deck.slides.map((s) => s.id));
      const want = new Set(orderedIds);
      const isValidOrder =
        Array.isArray(orderedIds) &&
        orderedIds.length === deck.slides.length &&
        want.size === orderedIds.length &&
        orderedIds.every((id) => have.has(id));
      if (!isValidOrder) {
        throw new Error('Invalid slide order: must be a permutation of existing slide ids');
      }
      const byId = new Map(deck.slides.map((s) => [s.id, s]));
      const slides = orderedIds.map((id) => byId.get(id));
      const merged = mergeDeck(deck, { slides });
      await writeDeckFile(deckPath(dataDir, deckId), merged);
      return merged;
    });
  }

  return {
    createDeck,
    getDeck,
    listDecks,
    updateDeck,
    deleteDeck,
    toggleFavorite,
    addSlide,
    updateSlide,
    deleteSlide,
    reorderSlides,
  };
}
