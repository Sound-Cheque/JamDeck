import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeckStore, DeckNotFoundError, SlideNotFoundError } from './decks.js';

let dataDir;
let store;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'jam-deck-slides-'));
  store = createDeckStore({ dataDir });
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('addSlide', () => {
  it('appends a default canvas slide to an empty deck', async () => {
    const deck = await store.createDeck({ name: 'D' });
    const updated = await store.addSlide(deck.id);

    expect(updated.slides).toHaveLength(1);
    const slide = updated.slides[0];
    expect(slide.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(slide.type).toBe('canvas');
    expect(slide.content).toEqual({ objects: [], background: '#ffffff' });
  });

  it('defaults duration to seconds when the deck timing mode is duration', async () => {
    const deck = await store.createDeck({ name: 'D' });
    const updated = await store.addSlide(deck.id);
    expect(updated.slides[0].duration).toEqual({ unit: 'seconds', value: 30 });
  });

  it('defaults duration to bars when timing mode is internal or link', async () => {
    const a = await store.createDeck({ name: 'A' });
    await store.updateDeck(a.id, { settings: { timingMode: 'internal' } });
    const aUpdated = await store.addSlide(a.id);
    expect(aUpdated.slides[0].duration).toEqual({ unit: 'bars', value: 8 });

    const b = await store.createDeck({ name: 'B' });
    await store.updateDeck(b.id, { settings: { timingMode: 'link' } });
    const bUpdated = await store.addSlide(b.id);
    expect(bUpdated.slides[0].duration).toEqual({ unit: 'bars', value: 8 });
  });

  it('respects explicit fields in the partial', async () => {
    const deck = await store.createDeck({ name: 'D' });
    const updated = await store.addSlide(deck.id, {
      type: 'image',
      duration: { unit: 'seconds', value: 10 },
      content: { src: 'media/foo.jpg' },
    });
    const slide = updated.slides[0];
    expect(slide.type).toBe('image');
    expect(slide.duration).toEqual({ unit: 'seconds', value: 10 });
    expect(slide.content).toEqual({ src: 'media/foo.jpg' });
  });

  it('always generates a fresh id, even if the partial supplied one', async () => {
    const deck = await store.createDeck({ name: 'D' });
    const updated = await store.addSlide(deck.id, { id: 'pretend-i-set-this' });
    expect(updated.slides[0].id).not.toBe('pretend-i-set-this');
    expect(updated.slides[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('appends to existing slides without disturbing them', async () => {
    const deck = await store.createDeck({ name: 'D' });
    const a = (await store.addSlide(deck.id)).slides[0];
    const after = await store.addSlide(deck.id);
    expect(after.slides).toHaveLength(2);
    expect(after.slides[0].id).toBe(a.id);
    expect(after.slides[1].id).not.toBe(a.id);
  });

  it('bumps the deck updatedAt', async () => {
    const deck = await store.createDeck({ name: 'D' });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await store.addSlide(deck.id);
    expect(updated.updatedAt > deck.updatedAt).toBe(true);
  });

  it('throws DeckNotFoundError for unknown deck id', async () => {
    await expect(store.addSlide('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      DeckNotFoundError,
    );
  });
});

describe('updateSlide', () => {
  it('merges patch into the named slide and leaves siblings alone', async () => {
    const deck = await store.createDeck({ name: 'D' });
    const a = (await store.addSlide(deck.id)).slides[0];
    const b = (await store.addSlide(deck.id)).slides[1];

    const updated = await store.updateSlide(deck.id, a.id, {
      duration: { unit: 'seconds', value: 60 },
    });

    const updatedA = updated.slides.find((s) => s.id === a.id);
    const updatedB = updated.slides.find((s) => s.id === b.id);
    expect(updatedA.duration).toEqual({ unit: 'seconds', value: 60 });
    expect(updatedA.type).toBe('canvas'); // preserved
    expect(updatedB).toEqual(b);
  });

  it('replaces content wholesale (not deep-merged)', async () => {
    const deck = await store.createDeck({ name: 'D' });
    const a = (await store.addSlide(deck.id)).slides[0];

    const newContent = {
      objects: [{ kind: 'rect', x: 1, y: 2, w: 3, h: 4 }],
      background: '#000',
    };
    const updated = await store.updateSlide(deck.id, a.id, { content: newContent });
    expect(updated.slides[0].content).toEqual(newContent);
  });

  it('ignores attempts to change the slide id', async () => {
    const deck = await store.createDeck({ name: 'D' });
    const a = (await store.addSlide(deck.id)).slides[0];
    const updated = await store.updateSlide(deck.id, a.id, { id: 'hacked' });
    expect(updated.slides[0].id).toBe(a.id);
  });

  it('throws SlideNotFoundError for an unknown slide', async () => {
    const deck = await store.createDeck({ name: 'D' });
    await expect(
      store.updateSlide(deck.id, '00000000-0000-0000-0000-000000000000', {}),
    ).rejects.toBeInstanceOf(SlideNotFoundError);
  });

  it('throws DeckNotFoundError for an unknown deck', async () => {
    await expect(
      store.updateSlide('00000000-0000-0000-0000-000000000000', 'x', {}),
    ).rejects.toBeInstanceOf(DeckNotFoundError);
  });
});

describe('deleteSlide', () => {
  it('removes the slide and preserves the rest', async () => {
    const deck = await store.createDeck({ name: 'D' });
    const a = (await store.addSlide(deck.id)).slides[0];
    const b = (await store.addSlide(deck.id)).slides[1];

    const updated = await store.deleteSlide(deck.id, a.id);

    expect(updated.slides.map((s) => s.id)).toEqual([b.id]);
  });

  it('throws SlideNotFoundError for an unknown slide', async () => {
    const deck = await store.createDeck({ name: 'D' });
    await expect(
      store.deleteSlide(deck.id, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(SlideNotFoundError);
  });

  it('throws DeckNotFoundError for an unknown deck', async () => {
    await expect(
      store.deleteSlide('00000000-0000-0000-0000-000000000000', 'x'),
    ).rejects.toBeInstanceOf(DeckNotFoundError);
  });
});

describe('reorderSlides', () => {
  it('reorders the slides to match the supplied order', async () => {
    const deck = await store.createDeck({ name: 'D' });
    const a = (await store.addSlide(deck.id)).slides[0];
    const b = (await store.addSlide(deck.id)).slides[1];
    const c = (await store.addSlide(deck.id)).slides[2];

    const updated = await store.reorderSlides(deck.id, [c.id, a.id, b.id]);
    expect(updated.slides.map((s) => s.id)).toEqual([c.id, a.id, b.id]);
  });

  it('rejects an order that omits or adds a slide id', async () => {
    const deck = await store.createDeck({ name: 'D' });
    const a = (await store.addSlide(deck.id)).slides[0];
    const b = (await store.addSlide(deck.id)).slides[1];

    await expect(store.reorderSlides(deck.id, [a.id])).rejects.toThrow(/order/i);
    await expect(store.reorderSlides(deck.id, [a.id, b.id, 'extra'])).rejects.toThrow(/order/i);
  });

  it('rejects a duplicated id in the order', async () => {
    const deck = await store.createDeck({ name: 'D' });
    const a = (await store.addSlide(deck.id)).slides[0];
    const b = (await store.addSlide(deck.id)).slides[1];

    await expect(store.reorderSlides(deck.id, [a.id, a.id, b.id])).rejects.toThrow(/order/i);
  });

  it('throws DeckNotFoundError for an unknown deck', async () => {
    await expect(
      store.reorderSlides('00000000-0000-0000-0000-000000000000', []),
    ).rejects.toBeInstanceOf(DeckNotFoundError);
  });
});
