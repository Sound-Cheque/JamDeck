import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeckStore } from './decks.js';
import { createMediaStore } from './media.js';
import { createLinkBridge } from './link.js';
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
// Set JAM_DECK_LINK=0 to skip the native addon (useful when running without
// build tools, in CI, or to debug Link issues).
const LINK_ENABLED = process.env.JAM_DECK_LINK !== '0';

const deckStore = createDeckStore({ dataDir: join(DATA_ROOT, 'decks') });
const mediaDir = join(DATA_ROOT, 'media');
const mediaStore = createMediaStore({ dataDir: mediaDir });

const linkBridge = createLinkBridge();
linkBridge.on('error', (err) => {
  console.warn(`[jam-deck] link bridge error: ${err.message}`);
});

const { httpServer } = createServer({ deckStore, mediaStore, mediaDir, linkBridge });

if (LINK_ENABLED) {
  linkBridge.enable().then(() => {
    if (linkBridge.isEnabled()) {
      console.log(`[jam-deck] Ableton Link enabled (tempo=${linkBridge.getTempo()})`);
    }
  });
}

httpServer.listen(PORT, () => {
  console.log(`[jam-deck] server listening on http://localhost:${PORT}`);
  console.log(`[jam-deck] data dir: ${DATA_ROOT}`);
});
