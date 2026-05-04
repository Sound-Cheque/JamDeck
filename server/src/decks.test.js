import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeckStore, DeckNotFoundError } from './decks.js';

let dataDir;
let store;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'jam-deck-test-'));
  store = createDeckStore({ dataDir });
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('createDeck', () => {
  it('creates a deck with default fields', async () => {
    const deck = await store.createDeck({ name: 'My Deck' });

    expect(deck.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(deck.name).toBe('My Deck');
    expect(deck.favorite).toBe(false);
    expect(deck.slides).toEqual([]);
    expect(deck.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(deck.updatedAt).toBe(deck.createdAt);
  });

  it('uses spec-defined default settings', async () => {
    const deck = await store.createDeck({ name: 'Defaults' });

    expect(deck.settings).toEqual({
      timingMode: 'duration',
      internalBpm: 120,
      metronomeSounds: { accent: null, beat: null },
      timerStyle: 'backgroundFill',
      countdownBars: 2,
      countdownSeconds: 5,
      loop: false,
      showSlideStrip: true,
    });
  });

  it('persists to disk', async () => {
    const deck = await store.createDeck({ name: 'Persisted' });
    const raw = await readFile(join(dataDir, `${deck.id}.json`), 'utf8');
    expect(JSON.parse(raw)).toEqual(deck);
  });

  it('rejects empty or whitespace-only names', async () => {
    await expect(store.createDeck({ name: '' })).rejects.toThrow(/name/i);
    await expect(store.createDeck({ name: '   ' })).rejects.toThrow(/name/i);
  });

  it('trims the name', async () => {
    const deck = await store.createDeck({ name: '  Padded  ' });
    expect(deck.name).toBe('Padded');
  });

  it('generates a unique id per deck', async () => {
    const a = await store.createDeck({ name: 'A' });
    const b = await store.createDeck({ name: 'B' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('getDeck', () => {
  it('returns the persisted deck', async () => {
    const deck = await store.createDeck({ name: 'Get me' });
    const fetched = await store.getDeck(deck.id);
    expect(fetched).toEqual(deck);
  });

  it('throws DeckNotFoundError for unknown id', async () => {
    await expect(store.getDeck('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      DeckNotFoundError,
    );
  });

  it('rejects ids containing path separators', async () => {
    await expect(store.getDeck('../escape')).rejects.toBeInstanceOf(DeckNotFoundError);
    await expect(store.getDeck('a/b')).rejects.toBeInstanceOf(DeckNotFoundError);
  });
});

describe('listDecks', () => {
  it('returns empty array when none exist', async () => {
    expect(await store.listDecks()).toEqual([]);
  });

  it('returns a summary for each deck', async () => {
    const a = await store.createDeck({ name: 'Alpha' });
    await store.toggleFavorite(a.id);
    const b = await store.createDeck({ name: 'Beta' });

    const list = await store.listDecks();
    expect(list).toHaveLength(2);

    const aSummary = list.find((d) => d.id === a.id);
    const bSummary = list.find((d) => d.id === b.id);

    expect(aSummary).toMatchObject({
      id: a.id,
      name: 'Alpha',
      favorite: true,
      slideCount: 0,
    });
    expect(aSummary.createdAt).toBe(a.createdAt);
    expect(typeof aSummary.updatedAt).toBe('string');

    expect(bSummary).toMatchObject({ id: b.id, name: 'Beta', favorite: false });
    // Summaries do NOT include heavy fields:
    expect(aSummary).not.toHaveProperty('slides');
    expect(aSummary).not.toHaveProperty('settings');
  });

  it('ignores non-json files in the data directory', async () => {
    await store.createDeck({ name: 'A' });
    await writeFile(join(dataDir, 'README.txt'), 'hello');
    await writeFile(join(dataDir, '.DS_Store'), '');
    const list = await store.listDecks();
    expect(list).toHaveLength(1);
  });

  it('ignores malformed json files instead of throwing', async () => {
    await store.createDeck({ name: 'A' });
    await writeFile(join(dataDir, 'broken.json'), '{ not json');
    const list = await store.listDecks();
    expect(list).toHaveLength(1);
  });

  it('returns empty array if the data directory does not yet exist', async () => {
    const missingDir = join(dataDir, 'nope');
    const s = createDeckStore({ dataDir: missingDir });
    expect(await s.listDecks()).toEqual([]);
  });
});

describe('updateDeck', () => {
  it('merges top-level fields and bumps updatedAt', async () => {
    const deck = await store.createDeck({ name: 'Original' });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await store.updateDeck(deck.id, { name: 'Renamed' });

    expect(updated.name).toBe('Renamed');
    expect(updated.id).toBe(deck.id);
    expect(updated.createdAt).toBe(deck.createdAt);
    expect(updated.updatedAt > deck.updatedAt).toBe(true);
  });

  it('deep-merges settings, preserving unspecified keys', async () => {
    const deck = await store.createDeck({ name: 'Settings' });
    const updated = await store.updateDeck(deck.id, {
      settings: { internalBpm: 90, loop: true },
    });
    expect(updated.settings.internalBpm).toBe(90);
    expect(updated.settings.loop).toBe(true);
    expect(updated.settings.timerStyle).toBe('backgroundFill');
    expect(updated.settings.countdownBars).toBe(2);
  });

  it('replaces slides wholesale (not merged)', async () => {
    const deck = await store.createDeck({ name: 'Slides' });
    const slide = {
      id: 'slide-1',
      type: 'canvas',
      duration: { unit: 'seconds', value: 10 },
      content: { objects: [], background: '#ffffff' },
    };
    const updated = await store.updateDeck(deck.id, { slides: [slide] });
    expect(updated.slides).toEqual([slide]);
  });

  it('ignores attempts to change id or createdAt', async () => {
    const deck = await store.createDeck({ name: 'Immutable' });
    const updated = await store.updateDeck(deck.id, {
      id: 'hacked',
      createdAt: 'forever-ago',
    });
    expect(updated.id).toBe(deck.id);
    expect(updated.createdAt).toBe(deck.createdAt);
  });

  it('throws DeckNotFoundError for unknown id', async () => {
    await expect(
      store.updateDeck('00000000-0000-0000-0000-000000000000', { name: 'X' }),
    ).rejects.toBeInstanceOf(DeckNotFoundError);
  });

  it('persists the merged deck', async () => {
    const deck = await store.createDeck({ name: 'Persist' });
    await store.updateDeck(deck.id, { name: 'Renamed' });
    const reread = await store.getDeck(deck.id);
    expect(reread.name).toBe('Renamed');
  });
});

describe('deleteDeck', () => {
  it('removes the file from disk', async () => {
    const deck = await store.createDeck({ name: 'Doomed' });
    await store.deleteDeck(deck.id);

    await expect(store.getDeck(deck.id)).rejects.toBeInstanceOf(DeckNotFoundError);
    const files = await readdir(dataDir);
    expect(files).not.toContain(`${deck.id}.json`);
  });

  it('throws DeckNotFoundError for unknown id', async () => {
    await expect(
      store.deleteDeck('00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(DeckNotFoundError);
  });
});

describe('toggleFavorite', () => {
  it('flips false -> true -> false', async () => {
    const deck = await store.createDeck({ name: 'Fav' });
    expect(deck.favorite).toBe(false);

    const a = await store.toggleFavorite(deck.id);
    expect(a.favorite).toBe(true);

    const b = await store.toggleFavorite(deck.id);
    expect(b.favorite).toBe(false);
  });

  it('persists the new favorite state', async () => {
    const deck = await store.createDeck({ name: 'Fav' });
    await store.toggleFavorite(deck.id);
    const reread = await store.getDeck(deck.id);
    expect(reread.favorite).toBe(true);
  });

  it('throws DeckNotFoundError for unknown id', async () => {
    await expect(
      store.toggleFavorite('00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(DeckNotFoundError);
  });
});

describe('concurrent writes', () => {
  it('settles to one of the writes without corrupting the file (last-write-wins)', async () => {
    const deck = await store.createDeck({ name: 'Race' });

    const writes = Array.from({ length: 20 }, (_, i) =>
      store.updateDeck(deck.id, { name: `Name ${i}` }),
    );
    await Promise.all(writes);

    const final = await store.getDeck(deck.id);
    expect(final.name).toMatch(/^Name \d+$/);
    expect(final.id).toBe(deck.id);
  });
});
