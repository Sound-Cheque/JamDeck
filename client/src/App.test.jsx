import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App.jsx';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
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
