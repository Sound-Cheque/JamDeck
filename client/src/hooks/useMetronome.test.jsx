import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMetronome } from './useMetronome.js';

let player;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  player = { play: vi.fn() };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useMetronome', () => {
  it('does nothing when disabled', () => {
    renderHook(() => useMetronome({ enabled: false, startedAt: '2026-01-01T00:00:00.000Z', bpm: 120, player }));
    vi.advanceTimersByTime(2_000);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('does nothing when bpm is missing or non-positive', () => {
    renderHook(() => useMetronome({ enabled: true, startedAt: '2026-01-01T00:00:00.000Z', bpm: 0, player }));
    vi.advanceTimersByTime(2_000);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('plays an accent on the very first beat at the start', () => {
    renderHook(() =>
      useMetronome({
        enabled: true,
        startedAt: '2026-01-01T00:00:00.000Z',
        bpm: 120,
        beatsPerBar: 4,
        player,
      }),
    );
    vi.advanceTimersByTime(0);
    expect(player.play).toHaveBeenCalledWith('accent');
  });

  it('plays accent then three beats per bar at 120 BPM (4/4)', () => {
    renderHook(() =>
      useMetronome({
        enabled: true,
        startedAt: '2026-01-01T00:00:00.000Z',
        bpm: 120, // 500 ms / beat
        beatsPerBar: 4,
        player,
      }),
    );

    // First beat fires at t=0; advance through one bar (4 beats × 500ms).
    vi.advanceTimersByTime(2_000);

    const sequence = player.play.mock.calls.map((c) => c[0]);
    // accent, beat, beat, beat, accent (start of bar 2)
    expect(sequence).toEqual(['accent', 'beat', 'beat', 'beat', 'accent']);
  });

  it('catches up to the right beat when joining mid-playback', () => {
    // Started 1.25s ago at 120 BPM → already past beat 0, beat 1, beat 2.
    // The next beat fires at the next 500ms boundary, which is t=startedAt+1500ms.
    // At fake time = 1250ms after startedAt, the next firing is in 250ms.
    vi.setSystemTime(new Date('2026-01-01T00:00:01.250Z'));
    renderHook(() =>
      useMetronome({
        enabled: true,
        startedAt: '2026-01-01T00:00:00.000Z',
        bpm: 120,
        beatsPerBar: 4,
        player,
      }),
    );

    // Just before next beat: nothing yet
    vi.advanceTimersByTime(249);
    expect(player.play).not.toHaveBeenCalled();

    // Cross the boundary: beat 3 fires (it's the 4th beat → still in bar 1, so 'beat')
    vi.advanceTimersByTime(2);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledWith('beat');
  });

  it('cancels scheduled beats on unmount', () => {
    const { unmount } = renderHook(() =>
      useMetronome({
        enabled: true,
        startedAt: '2026-01-01T00:00:00.000Z',
        bpm: 120,
        beatsPerBar: 4,
        player,
      }),
    );
    vi.advanceTimersByTime(0);
    expect(player.play).toHaveBeenCalledTimes(1);

    unmount();
    vi.advanceTimersByTime(60_000);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('reschedules from the new position when startedAt changes', () => {
    const { rerender } = renderHook(
      ({ startedAt }) =>
        useMetronome({ enabled: true, startedAt, bpm: 120, beatsPerBar: 4, player }),
      { initialProps: { startedAt: '2026-01-01T00:00:00.000Z' } },
    );
    vi.advanceTimersByTime(0); // initial accent
    player.play.mockClear();

    // Now jump to a new slide that started 0.5s ago.
    vi.setSystemTime(new Date('2026-01-01T00:00:10.500Z'));
    rerender({ startedAt: '2026-01-01T00:00:10.000Z' });

    // 500ms in at 120 BPM → beat 1 should fire ~immediately.
    vi.advanceTimersByTime(0);
    expect(player.play).toHaveBeenCalledWith('beat');
  });
});
