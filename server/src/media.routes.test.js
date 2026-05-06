import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMediaStore } from './media.js';
import { createServer } from './server.js';

let dataDir;
let app;
let mediaStore;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'jam-deck-media-routes-'));
  mediaStore = createMediaStore({ dataDir });
  ({ app } = createServer({ mediaStore, mediaDir: dataDir }));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=',
  'base64',
);

describe('POST /api/media', () => {
  it('uploads an image and returns 201 with hash + url', async () => {
    const res = await request(app)
      .post('/api/media')
      .attach('file', TINY_PNG, { filename: 'tiny.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.url).toMatch(/^\/media\/[a-f0-9]{64}\.png$/);
    expect(res.body.mimeType).toBe('image/png');
    expect(res.body.size).toBe(TINY_PNG.length);
  });

  it('dedupes — same content uploaded twice returns the same url', async () => {
    const a = await request(app)
      .post('/api/media')
      .attach('file', TINY_PNG, { filename: 'a.png', contentType: 'image/png' });
    const b = await request(app)
      .post('/api/media')
      .attach('file', TINY_PNG, { filename: 'b.png', contentType: 'image/png' });

    expect(a.body.url).toBe(b.body.url);
    const files = await readdir(dataDir);
    expect(files).toHaveLength(1);
  });

  it('returns 400 when no file is attached', async () => {
    const res = await request(app).post('/api/media').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/file/i);
  });

  it('returns 415 for unsupported MIME types', async () => {
    const res = await request(app)
      .post('/api/media')
      .attach('file', Buffer.from('hello'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      });
    expect(res.status).toBe(415);
    expect(res.body.error).toMatch(/unsupported/i);
  });
});

describe('GET /media/:filename', () => {
  it('serves an uploaded file with the original bytes', async () => {
    const upload = await request(app)
      .post('/api/media')
      .attach('file', TINY_PNG, { filename: 'tiny.png', contentType: 'image/png' });

    const res = await request(app).get(upload.body.url);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^image\/png/);
    expect(Buffer.from(res.body).equals(TINY_PNG)).toBe(true);
  });

  it('returns 404 for unknown files', async () => {
    const res = await request(app).get('/media/nonexistent.png');
    expect(res.status).toBe(404);
  });
});
