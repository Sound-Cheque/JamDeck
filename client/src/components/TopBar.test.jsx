import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopBar } from './TopBar.jsx';

function deckWith({ slides = 1, loop = false } = {}) {
  return {
    id: 'd',
    name: 'D',
    favorite: false,
    createdAt: 't',
    updatedAt: 't',
    settings: {
      timingMode: 'duration',
      internalBpm: 120,
      metronomeSounds: { accent: null, beat: null },
      timerStyle: 'backgroundFill',
      countdownBars: 2,
      countdownSeconds: 5,
      loop,
      showSlideStrip: true,
    },
    slides: Array.from({ length: slides }, (_, i) => ({
      id: `s${i}`,
      type: 'canvas',
      duration: { unit: 'seconds', value: 10 },
      content: { objects: [], background: '#fff' },
    })),
  };
}

function renderTopBar(props = {}) {
  return render(
    <TopBar
      deck={props.deck ?? null}
      playbackState={props.playbackState ?? { state: 'idle' }}
      onStart={props.onStart ?? vi.fn()}
      onStop={props.onStop ?? vi.fn()}
      onToggleLoop={props.onToggleLoop ?? vi.fn()}
    />,
  );
}

describe('TopBar', () => {
  it('renders the Jam Deck title', () => {
    renderTopBar();
    expect(screen.getByRole('heading', { name: /jam deck/i })).toBeInTheDocument();
  });

  describe('Play / Stop', () => {
    it('shows the Play button when idle', () => {
      renderTopBar({ deck: deckWith() });
      expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^stop$/i })).not.toBeInTheDocument();
    });

    it('shows the Stop button when playing', () => {
      renderTopBar({
        deck: deckWith(),
        playbackState: { state: 'playing', deckId: 'd', slideIndex: 0, startedAt: 't', loop: false },
      });
      expect(screen.getByRole('button', { name: /^stop$/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^play$/i })).not.toBeInTheDocument();
    });

    it('disables Play when no deck is loaded', () => {
      renderTopBar({ deck: null });
      expect(screen.getByRole('button', { name: /play/i })).toBeDisabled();
    });

    it('disables Play when the loaded deck has no slides', () => {
      renderTopBar({ deck: deckWith({ slides: 0 }) });
      expect(screen.getByRole('button', { name: /play/i })).toBeDisabled();
    });

    it('Play click invokes onStart(deck.id)', async () => {
      const user = userEvent.setup();
      const onStart = vi.fn();
      renderTopBar({ deck: deckWith(), onStart });
      await user.click(screen.getByRole('button', { name: /play/i }));
      expect(onStart).toHaveBeenCalledWith('d');
    });

    it('Stop click invokes onStop', async () => {
      const user = userEvent.setup();
      const onStop = vi.fn();
      renderTopBar({
        deck: deckWith(),
        playbackState: { state: 'playing', deckId: 'd', slideIndex: 0, startedAt: 't', loop: false },
        onStop,
      });
      await user.click(screen.getByRole('button', { name: /^stop$/i }));
      expect(onStop).toHaveBeenCalled();
    });
  });

  describe('Spacebar shortcut', () => {
    it('starts playback when idle', () => {
      const onStart = vi.fn();
      renderTopBar({ deck: deckWith(), onStart });
      fireEvent.keyDown(window, { key: ' ', code: 'Space' });
      expect(onStart).toHaveBeenCalledWith('d');
    });

    it('stops playback when playing', () => {
      const onStop = vi.fn();
      renderTopBar({
        deck: deckWith(),
        playbackState: { state: 'playing', deckId: 'd', slideIndex: 0, startedAt: 't', loop: false },
        onStop,
      });
      fireEvent.keyDown(window, { key: ' ', code: 'Space' });
      expect(onStop).toHaveBeenCalled();
    });

    it('does nothing when typing inside an input', () => {
      const onStart = vi.fn();
      const { container } = render(
        <>
          <input data-testid="text" />
          <TopBar
            deck={deckWith()}
            playbackState={{ state: 'idle' }}
            onStart={onStart}
            onStop={vi.fn()}
            onToggleLoop={vi.fn()}
          />
        </>,
      );
      const input = container.querySelector('input');
      input.focus();
      fireEvent.keyDown(input, { key: ' ', code: 'Space' });
      expect(onStart).not.toHaveBeenCalled();
    });

    it('does nothing when no deck is loaded', () => {
      const onStart = vi.fn();
      renderTopBar({ deck: null, onStart });
      fireEvent.keyDown(window, { key: ' ', code: 'Space' });
      expect(onStart).not.toHaveBeenCalled();
    });
  });

  describe('Loop toggle', () => {
    it('reflects deck.settings.loop via aria-pressed', () => {
      renderTopBar({ deck: deckWith({ loop: true }) });
      expect(screen.getByRole('button', { name: /loop/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('shows aria-pressed=false when loop is off', () => {
      renderTopBar({ deck: deckWith({ loop: false }) });
      expect(screen.getByRole('button', { name: /loop/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('click invokes onToggleLoop', async () => {
      const user = userEvent.setup();
      const onToggleLoop = vi.fn();
      renderTopBar({ deck: deckWith({ loop: false }), onToggleLoop });
      await user.click(screen.getByRole('button', { name: /loop/i }));
      expect(onToggleLoop).toHaveBeenCalled();
    });

    it('is disabled when no deck is loaded', () => {
      renderTopBar({ deck: null });
      expect(screen.getByRole('button', { name: /loop/i })).toBeDisabled();
    });
  });
});
