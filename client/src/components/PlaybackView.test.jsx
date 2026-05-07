import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PlaybackView } from './PlaybackView.jsx';

function deck(overrides = {}) {
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
      loop: false,
      showSlideStrip: true,
      ...overrides,
    },
    slides: [
      slide({ id: 's1', duration: 10 }),
      slide({ id: 's2', duration: 10 }),
      slide({ id: 's3', duration: 10 }),
    ],
  };
}

function slide(overrides = {}) {
  return {
    id: overrides.id ?? 's',
    type: overrides.type ?? 'canvas',
    duration: { unit: 'seconds', value: overrides.duration ?? 10 },
    content: overrides.content ?? { objects: [], background: '#ffffff' },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function playback({ slideIndex = 0, startedAt = '2026-01-01T00:00:00.000Z' } = {}) {
  return {
    state: 'playing',
    deckId: 'd',
    slideIndex,
    startedAt,
    loop: false,
  };
}

describe('PlaybackView', () => {
  it('renders the slide indicated by playback.slideIndex', () => {
    const d = deck();
    render(<PlaybackView deck={d} playback={playback({ slideIndex: 1 })} />);
    // Header shows 1-based slide number out of total
    expect(screen.getByText(/slide 2 of 3/i)).toBeInTheDocument();
  });

  it('shows the background-fill timer with width matching the elapsed fraction', () => {
    const d = deck({ timerStyle: 'backgroundFill' });
    const { container } = render(
      <PlaybackView deck={d} playback={playback()} />,
    );
    act(() => {
      vi.setSystemTime(new Date('2026-01-01T00:00:03.000Z')); // 3s into 10s slide
      vi.advanceTimersByTime(50); // tick once
    });

    const fill = container.querySelector('.playback-view__fill');
    expect(fill).toBeInTheDocument();
    // Expect width style ~30% (0.3)
    const width = parseFloat(fill.style.width);
    expect(width).toBeGreaterThan(28);
    expect(width).toBeLessThan(32);
  });

  it('shows the shrinking-ball timer when the deck setting picks it', () => {
    const d = deck({ timerStyle: 'shrinkingBall' });
    const { container } = render(<PlaybackView deck={d} playback={playback()} />);
    act(() => {
      vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z')); // halfway
      vi.advanceTimersByTime(50);
    });

    const ball = container.querySelector('.playback-view__ball');
    expect(ball).toBeInTheDocument();
    expect(container.querySelector('.playback-view__fill')).not.toBeInTheDocument();

    // Ball is sized by 1 - fraction. At halfway, expect ~50%.
    const sizePct = parseFloat(ball.style.width);
    expect(sizePct).toBeGreaterThan(45);
    expect(sizePct).toBeLessThan(55);
  });

  it('shows the countdown number once remaining time drops below countdownSeconds', () => {
    const d = deck({ countdownSeconds: 5 });
    const { container } = render(<PlaybackView deck={d} playback={playback()} />);

    // 6s into a 10s slide → 4s remaining → countdown shows "4"
    act(() => {
      vi.setSystemTime(new Date('2026-01-01T00:00:06.000Z'));
      vi.advanceTimersByTime(50);
    });

    const countdown = container.querySelector('.playback-view__countdown');
    expect(countdown).toBeInTheDocument();
    expect(countdown).toHaveTextContent('4');
  });

  it('does not show the countdown when remaining time is above the threshold', () => {
    const d = deck({ countdownSeconds: 3 });
    const { container } = render(<PlaybackView deck={d} playback={playback()} />);

    // 2s in → 8s remaining, > 3s threshold
    act(() => {
      vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'));
      vi.advanceTimersByTime(50);
    });

    expect(container.querySelector('.playback-view__countdown')).not.toBeInTheDocument();
  });

  it('renders the slide strip when showSlideStrip is true', () => {
    const d = deck({ showSlideStrip: true });
    render(<PlaybackView deck={d} playback={playback()} />);
    expect(screen.getByLabelText(/slide strip/i)).toBeInTheDocument();
  });

  it('hides the slide strip when showSlideStrip is false', () => {
    const d = deck({ showSlideStrip: false });
    render(<PlaybackView deck={d} playback={playback()} />);
    expect(screen.queryByLabelText(/slide strip/i)).not.toBeInTheDocument();
  });

  it('marks the current slide in the strip with aria-current', () => {
    const d = deck();
    render(<PlaybackView deck={d} playback={playback({ slideIndex: 1 })} />);
    const strip = screen.getByLabelText(/slide strip/i);
    const items = strip.querySelectorAll('[data-slide-index]');
    expect(items[1].getAttribute('aria-current')).toBe('true');
    expect(items[0].getAttribute('aria-current')).not.toBe('true');
  });
});
