import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeckPanel } from './DeckPanel.jsx';

function summary(overrides = {}) {
  return {
    id: overrides.id ?? 'id',
    name: overrides.name ?? 'A Deck',
    favorite: overrides.favorite ?? false,
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z',
    slideCount: 0,
  };
}

function renderPanel(props = {}) {
  return render(
    <DeckPanel
      decks={props.decks ?? []}
      loading={props.loading ?? false}
      error={props.error ?? null}
      selectedDeckId={props.selectedDeckId ?? null}
      onSelect={props.onSelect ?? vi.fn()}
      onCreate={props.onCreate ?? vi.fn()}
      onDelete={props.onDelete ?? vi.fn()}
      onToggleFavorite={props.onToggleFavorite ?? vi.fn()}
    />,
  );
}

describe('DeckPanel', () => {
  it('shows a loading indicator while loading', () => {
    renderPanel({ loading: true });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows an empty-state hint when no decks exist', () => {
    renderPanel();
    expect(screen.getByText(/no decks yet/i)).toBeInTheDocument();
  });

  it('shows the error message when present', () => {
    renderPanel({ error: 'Failed to load decks: HTTP 500' });
    expect(screen.getByRole('alert')).toHaveTextContent(/failed to load/i);
  });

  it('does not show the empty-state hint while an error is displayed', () => {
    renderPanel({ error: 'Failed to load decks: HTTP 500' });
    expect(screen.queryByText(/no decks yet/i)).not.toBeInTheDocument();
  });

  it('renders one row per deck with the name visible', () => {
    renderPanel({
      decks: [summary({ id: 'a', name: 'Alpha' }), summary({ id: 'b', name: 'Beta' })],
    });
    expect(screen.getByRole('button', { name: /select deck alpha/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select deck beta/i })).toBeInTheDocument();
  });

  it('orders favorites first, then alphabetically by name', () => {
    renderPanel({
      decks: [
        summary({ id: '1', name: 'Charlie', favorite: false }),
        summary({ id: '2', name: 'alpha', favorite: false }),
        summary({ id: '3', name: 'Bravo', favorite: true }),
        summary({ id: '4', name: 'apple', favorite: true }),
      ],
    });
    const items = screen.getAllByRole('listitem');
    const order = items.map((li) => within(li).getByRole('button', { name: /select deck/i }).textContent);
    expect(order).toEqual(['apple', 'Bravo', 'alpha', 'Charlie']);
  });

  it('marks the selected deck with aria-current', () => {
    renderPanel({
      decks: [summary({ id: 'a', name: 'Alpha' }), summary({ id: 'b', name: 'Beta' })],
      selectedDeckId: 'b',
    });
    const beta = screen.getByRole('button', { name: /select deck beta/i });
    expect(beta).toHaveAttribute('aria-current', 'true');
    const alpha = screen.getByRole('button', { name: /select deck alpha/i });
    expect(alpha).not.toHaveAttribute('aria-current', 'true');
  });

  it('calls onSelect when a deck row is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderPanel({
      decks: [summary({ id: 'a', name: 'Alpha' })],
      onSelect,
    });
    await user.click(screen.getByRole('button', { name: /select deck alpha/i }));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('toggling favorite does not also trigger select', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onToggleFavorite = vi.fn();
    renderPanel({
      decks: [summary({ id: 'a', name: 'Alpha', favorite: false })],
      onSelect,
      onToggleFavorite,
    });
    await user.click(screen.getByRole('button', { name: /favorite alpha/i }));
    expect(onToggleFavorite).toHaveBeenCalledWith('a');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('reflects favorite state via aria-pressed on the favorite button', () => {
    renderPanel({
      decks: [
        summary({ id: 'a', name: 'Alpha', favorite: true }),
        summary({ id: 'b', name: 'Beta', favorite: false }),
      ],
    });
    expect(screen.getByRole('button', { name: /favorite alpha/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /favorite beta/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('calls onDelete with the deck id when delete is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderPanel({ decks: [summary({ id: 'a', name: 'Alpha' })], onDelete });
    await user.click(screen.getByRole('button', { name: /delete alpha/i }));
    expect(onDelete).toHaveBeenCalledWith('a');
  });

  describe('create flow', () => {
    it('reveals the name input when "New" is clicked', async () => {
      const user = userEvent.setup();
      renderPanel();
      expect(screen.queryByRole('textbox', { name: /new deck name/i })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /new deck/i }));
      expect(screen.getByRole('textbox', { name: /new deck name/i })).toBeInTheDocument();
    });

    it('submits with the entered name and clears the form', async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn().mockResolvedValue({ id: 'x' });
      renderPanel({ onCreate });

      await user.click(screen.getByRole('button', { name: /new deck/i }));
      const input = screen.getByRole('textbox', { name: /new deck name/i });
      await user.type(input, 'Fresh Deck{enter}');

      expect(onCreate).toHaveBeenCalledWith('Fresh Deck');
      expect(screen.queryByRole('textbox', { name: /new deck name/i })).not.toBeInTheDocument();
    });

    it('does not submit empty or whitespace names', async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn();
      renderPanel({ onCreate });

      await user.click(screen.getByRole('button', { name: /new deck/i }));
      await user.type(screen.getByRole('textbox', { name: /new deck name/i }), '   {enter}');
      expect(onCreate).not.toHaveBeenCalled();
    });

    it('cancel button closes the form without submitting', async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn();
      renderPanel({ onCreate });

      await user.click(screen.getByRole('button', { name: /new deck/i }));
      await user.type(screen.getByRole('textbox', { name: /new deck name/i }), 'Discard me');
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onCreate).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox', { name: /new deck name/i })).not.toBeInTheDocument();
    });
  });
});
