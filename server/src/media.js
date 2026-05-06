import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

export class MediaValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MediaValidationError';
  }
}

export function createMediaStore({ dataDir, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (!dataDir) throw new Error('createMediaStore requires { dataDir }');

  async function save(buffer, mimeType) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new MediaValidationError('Empty file');
    }
    const ext = EXT_BY_MIME[mimeType];
    if (!ext) {
      throw new MediaValidationError(`Unsupported media type: ${mimeType}`);
    }
    if (buffer.length > maxBytes) {
      throw new MediaValidationError(
        `File too large: ${buffer.length} bytes (max ${maxBytes})`,
      );
    }

    const hash = createHash('sha256').update(buffer).digest('hex');
    const filename = `${hash}${ext}`;
    const filepath = join(dataDir, filename);

    await mkdir(dataDir, { recursive: true });

    // Dedupe: only write if file isn't already there.
    let exists = false;
    try {
      await stat(filepath);
      exists = true;
    } catch {
      /* not present, will write */
    }
    if (!exists) {
      await writeFile(filepath, buffer);
    }

    return {
      hash,
      url: `/media/${filename}`,
      mimeType,
      size: buffer.length,
    };
  }

  return { save };
}
