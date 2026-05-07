import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeckStore } from './decks.js';
import { createMediaStore } from './media.js';
import { createServer } from './server.js';

// Resolve data paths against the project root, not process.cwd(). This file
// lives at <project>/server/src/index.js, so two directories up is the root.
// Without this, running `npm run dev -w server` (cwd=server/) creates a stray
// server/data/ alongside the source tree instead of using the project's
// canonical data/ directory.
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DATA_ROOT = process.env.JAM_DECK_DATA_DIR ?? join(PROJECT_ROOT, 'data');

const PORT = Number(process.env.PORT) || 4000;

const deckStore = createDeckStore({ dataDir: join(DATA_ROOT, 'decks') });
const mediaDir = join(DATA_ROOT, 'media');
const mediaStore = createMediaStore({ dataDir: mediaDir });

const { httpServer } = createServer({ deckStore, mediaStore, mediaDir });
httpServer.listen(PORT, () => {
  console.log(`[jam-deck] server listening on http://localhost:${PORT}`);
  console.log(`[jam-deck] data dir: ${DATA_ROOT}`);
});
