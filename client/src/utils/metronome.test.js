import { describe, it, expect } from 'vitest';
import { nextBeatAtOrAfter } from './metronome.js';

describe('nextBeatAtOrAfter', () => {
  it('returns beat 0 at the start when now equals startedAt', () => {
    expect(nextBeatAtOrAfter(0, 120, 0)).toEqual({ beatNumber: 0, atMs: 0 });
  });

  it('rounds up to the next beat when between beats', () => {
    // 120 BPM → 500ms/beat. At t=250ms, next beat is beat 1 at t=500.
    expect(nextBeatAtOrAfter(0, 120, 250)).toEqual({ beatNumber: 1, atMs: 500 });
  });

  it('returns the current beat when now is exactly on a beat boundary', () => {
    expect(nextBeatAtOrAfter(0, 120, 500)).toEqual({ beatNumber: 1, atMs: 500 });
  });

  it('respects an arbitrary startedAt offset', () => {
    // Start at t=1000 with 60 BPM (1000ms/beat). At t=1500: next is beat 1 at 2000.
    expect(nextBeatAtOrAfter(1000, 60, 1500)).toEqual({ beatNumber: 1, atMs: 2000 });
  });

  it('returns beat 0 when now is before startedAt', () => {
    expect(nextBeatAtOrAfter(2000, 120, 1000)).toEqual({ beatNumber: 0, atMs: 2000 });
  });

  it('returns null for non-positive bpm', () => {
    expect(nextBeatAtOrAfter(0, 0, 100)).toBeNull();
    expect(nextBeatAtOrAfter(0, -1, 100)).toBeNull();
  });
});
