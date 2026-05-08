// Smoke tests for the mobile shell. We mock fetch + WebSocket so the deck
// list / current deck / playback hooks all work end-to-end without wiring
// up a real server.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileApp } from './MobileApp.jsx';

let fetchMock;

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetchByUrl(routes) {
  return vi.fn(async (url, init) => {
    const method = init?.method ?? 'GET';
    const key = `${method} ${url}`;
    if (routes[key]) return routes[key]({ url, init });
    if (routes[url]) return routes[url]({ url, init });
    throw new Error(`Unmocked fetch: ${key}`);
  });
}

class MockWebSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }
  send() {}
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }
  emit(data) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

function deckSummary(overrides = {}) {
  return {
    id: 'deck-1',
    name: 'My Deck',
    favorite: false,
    slideCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function fullDeck(overrides = {}) {
  return {
    id: 'deck-1',
    name: 'My Deck',
    favorite: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    settings: {
      timingMode: 'duration',
      internalBpm: 120,
      metronomeSounds: { accent: null, beat: null },
      timerStyle: 'backgroundFill',
      countdownBars: 2,
      countdownSeconds: 5,
      loop: false,
      showSlideStrip: true,
    },
    slides: [
      { id: 's1', type: 'canvas', duration: { unit: 'seconds', value: 30 }, content: { objects: [], background: '#fff' } },
      { id: 's2', type: 'canvas', duration: { unit: 'seconds', value: 30 }, content: { objects: [], background: '#fff' } },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MobileApp', () => {
  it('shows a deck picker when no deck is selected', async () => {
    fetchMock = mockFetchByUrl({
      '/api/decks': () => jsonResponse([deckSummary({ slideCount: 2 })]),
      '/api/playback': () => jsonResponse({ state: 'idle' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MobileApp />);

    expect(await screen.findByText('My Deck')).toBeInTheDocument();
    expect(screen.getByText(/2 slides/i)).toBeInTheDocument();
  });

  it('drills into a deck and shows the slide list', async () => {
    fetchMock = mockFetchByUrl({
      '/api/decks': () => jsonResponse([deckSummary({ slideCount: 2 })]),
      '/api/playback': () => jsonResponse({ state: 'idle' }),
      '/api/decks/deck-1': () => jsonResponse(fullDeck()),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MobileApp />);

    await user.click(await screen.findByRole('button', { name: /My Deck/ }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'My Deck' })).toBeInTheDocument(),
    );
    expect(screen.getByText('Slide 1')).toBeInTheDocument();
    expect(screen.getByText('Slide 2')).toBeInTheDocument();
  });

  it('shows a 🔒 instead of an edit button on the currently-playing slide', async () => {
    fetchMock = mockFetchByUrl({
      '/api/decks': () => jsonResponse([deckSummary({ slideCount: 2 })]),
      '/api/playback': () =>
        jsonResponse({
          state: 'playing',
          deckId: 'deck-1',
          slideIndex: 0,
          startedAt: '2026-01-01T00:00:00.000Z',
          loop: false,
        }),
      '/api/decks/deck-1': () => jsonResponse(fullDeck()),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MobileApp />);

    await user.click(await screen.findByRole('button', { name: /My Deck/ }));
    await screen.findByRole('heading', { name: 'My Deck' });

    // The first row is locked
    expect(screen.getByLabelText(/currently playing — locked/i)).toBeInTheDocument();
    // The second still shows an edit button
    expect(screen.getByRole('button', { name: /Edit slide 2/i })).toBeInTheDocument();
    // No edit button for slide 1
    expect(screen.queryByRole('button', { name: /Edit slide 1/i })).not.toBeInTheDocument();
  });

  it('auto-switches to the playing deck when a playback:start arrives', async () => {
    fetchMock = mockFetchByUrl({
      '/api/decks': () =>
        jsonResponse([
          deckSummary({ id: 'deck-1', name: 'First', slideCount: 1 }),
          deckSummary({ id: 'deck-2', name: 'Second', slideCount: 1 }),
        ]),
      '/api/playback': () => jsonResponse({ state: 'idle' }),
      '/api/decks/deck-2': () =>
        jsonResponse({
          ...fullDeck(),
          id: 'deck-2',
          name: 'Second',
          slides: [
            {
              id: 'sX',
              type: 'canvas',
              duration: { unit: 'seconds', value: 10 },
              content: { objects: [], background: '#fff' },
            },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MobileApp />);
    await screen.findByText('First');

    // Simulate playback:start for deck-2
    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0));
    const ws = MockWebSocket.instances[0];
    await waitFor(() => expect(ws.readyState).toBe(1));

    ws.emit({
      type: 'playback:start',
      deckId: 'deck-2',
      slideIndex: 0,
      startedAt: '2026-01-01T00:00:00.000Z',
      loop: false,
    });

    // We should now be inside deck-2
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Second' })).toBeInTheDocument(),
    );
  });
});
