// Server-level test: when the supplied Link bridge fires tempo / peers
// events, those events are re-broadcast to all WS clients as
// `link:tempo` and `link:peers`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'events';
import { createDeckStore } from './decks.js';
import { createServer } from './server.js';

let dataDir;
let deckStore;
let broadcast;
let fakeBridge;

function makeFakeLinkBridge() {
  const ee = new EventEmitter();
  return {
    isEnabled: () => true,
    getTempo: () => 120,
    getNumPeers: () => 0,
    msUntilNextBar: () => 0,
    on: (event, fn) => ee.on(event, fn),
    off: (event, fn) => ee.off(event, fn),
    enable: async () => {},
    disable: () => {},
    _emit: (event, payload) => ee.emit(event, payload),
  };
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'jam-deck-link-broadcasts-'));
  deckStore = createDeckStore({ dataDir });
  broadcast = vi.fn();
  fakeBridge = makeFakeLinkBridge();
  createServer({ deckStore, broadcast, linkBridge: fakeBridge });
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('link bridge → WS broadcasts', () => {
  it('broadcasts link:tempo when the bridge emits "tempo"', () => {
    fakeBridge._emit('tempo', 132);
    expect(broadcast).toHaveBeenCalledWith({ type: 'link:tempo', bpm: 132 });
  });

  it('broadcasts link:peers when the bridge emits "peers"', () => {
    fakeBridge._emit('peers', 3);
    expect(broadcast).toHaveBeenCalledWith({ type: 'link:peers', numPeers: 3 });
  });

  it('does not broadcast spurious link:* messages on unrelated events', () => {
    fakeBridge._emit('beat', 1);
    expect(broadcast).not.toHaveBeenCalled();
  });
});
