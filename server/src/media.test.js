import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMediaStore, MediaValidationError } from './media.js';

let dataDir;
let store;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'jam-deck-media-'));
  store = createMediaStore({ dataDir });
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

// 1×1 PNG (transparent pixel)
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=',
  'base64',
);

describe('save', () => {
  it('persists a buffer and returns a hash + url + size + mimeType', async () => {
    const result = await store.save(TINY_PNG, 'image/png');

    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.url).toBe(`/media/${result.hash}.png`);
    expect(result.mimeType).toBe('image/png');
    expect(result.size).toBe(TINY_PNG.length);

    // Persisted on disk under the hashed filename
    const onDisk = await readFile(join(dataDir, `${result.hash}.png`));
    expect(onDisk.equals(TINY_PNG)).toBe(true);
  });

  it('dedupes by content hash — identical bytes return the same url', async () => {
    const a = await store.save(TINY_PNG, 'image/png');
    const b = await store.save(TINY_PNG, 'image/png');

    expect(a.hash).toBe(b.hash);
    expect(a.url).toBe(b.url);

    const files = await readdir(dataDir);
    expect(files).toHaveLength(1);
  });

  it('different content yields different hashes', async () => {
    const a = await store.save(TINY_PNG, 'image/png');
    const b = await store.save(Buffer.concat([TINY_PNG, Buffer.from([0])]), 'image/png');

    expect(a.hash).not.toBe(b.hash);
  });

  it('maps known image MIME types to extensions', async () => {
    const cases = [
      ['image/png', '.png'],
      ['image/jpeg', '.jpg'],
      ['image/gif', '.gif'],
      ['image/webp', '.webp'],
    ];
    for (const [mime, ext] of cases) {
      const r = await store.save(TINY_PNG, mime);
      expect(r.url.endsWith(ext)).toBe(true);
    }
  });

  it('maps known video MIME types to extensions', async () => {
    const cases = [
      ['video/mp4', '.mp4'],
      ['video/webm', '.webm'],
      ['video/quicktime', '.mov'],
    ];
    for (const [mime, ext] of cases) {
      const buf = Buffer.concat([TINY_PNG, Buffer.from(`v-${mime}`)]);
      const r = await store.save(buf, mime);
      expect(r.url.endsWith(ext)).toBe(true);
    }
  });

  it('maps known audio MIME types to extensions (for metronome samples)', async () => {
    // Reuse TINY_PNG bytes — the store doesn't validate file content beyond
    // MIME type. Real usage will have actual audio bytes.
    const cases = [
      ['audio/wav', '.wav'],
      ['audio/mpeg', '.mp3'],
      ['audio/ogg', '.ogg'],
      ['audio/mp4', '.m4a'],
    ];
    for (const [mime, ext] of cases) {
      // Distinct content per case so dedupe doesn't collapse them.
      const buf = Buffer.concat([TINY_PNG, Buffer.from(mime)]);
      const r = await store.save(buf, mime);
      expect(r.url.endsWith(ext)).toBe(true);
    }
  });

  it('rejects unsupported MIME types', async () => {
    await expect(store.save(TINY_PNG, 'application/octet-stream')).rejects.toBeInstanceOf(
      MediaValidationError,
    );
    await expect(store.save(TINY_PNG, 'text/html')).rejects.toBeInstanceOf(
      MediaValidationError,
    );
  });

  it('rejects buffers larger than the configured limit', async () => {
    const tiny = createMediaStore({ dataDir, maxBytes: 4 });
    await expect(tiny.save(TINY_PNG, 'image/png')).rejects.toBeInstanceOf(
      MediaValidationError,
    );
  });

  it('rejects an empty buffer', async () => {
    await expect(store.save(Buffer.alloc(0), 'image/png')).rejects.toBeInstanceOf(
      MediaValidationError,
    );
  });
});
