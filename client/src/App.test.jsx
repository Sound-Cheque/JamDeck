import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App.jsx';

describe('App smoke', () => {
  it('renders the Jam Deck heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /jam deck/i })).toBeInTheDocument();
  });

  it('renders the three layout panels', () => {
    render(<App />);
    expect(screen.getByRole('complementary', { name: /decks/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /slides/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /slide editor/i })).toBeInTheDocument();
  });
});
