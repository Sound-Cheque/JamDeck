import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App.jsx';

// Inert WebSocket — App opens one on mount; we don't drive messages here.
class StubWebSocket {
  constructor() {
    this.readyState = 0;
    this.OPEN = 1;
    this.CLOSED = 3;
  }
  close() {}
  send() {}
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  // Each call constructs a fresh Response so the body can be read more than
  // once across the multiple hooks that fire on mount (useDecks, usePlayback).
  vi.stubGlobal(
    'fetch',
    vi.fn((url) => {
      if (typeof url === 'string' && url.startsWith('/api/playback')) {
        return Promise.resolve(jsonResponse({ state: 'idle' }));
      }
      return Promise.resolve(jsonResponse([]));
    }),
  );
  vi.stubGlobal('WebSocket', StubWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderAndSettle() {
  render(<App />);
  // Wait for the initial deck fetch to resolve before asserting,
  // so React state updates aren't left pending after the test.
  await waitFor(() => expect(screen.getByText(/no decks yet/i)).toBeInTheDocument());
}

describe('App smoke', () => {
  it('renders the Jam Deck heading', async () => {
    await renderAndSettle();
    expect(screen.getByRole('heading', { name: /jam deck/i })).toBeInTheDocument();
  });

  it('renders the three layout regions', async () => {
    await renderAndSettle();
    expect(screen.getByRole('complementary', { name: /decks/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /slides/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /slide editor/i })).toBeInTheDocument();
  });
});
