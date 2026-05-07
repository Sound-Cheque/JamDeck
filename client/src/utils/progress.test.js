import { describe, it, expect } from 'vitest';
import { computeProgress, slideDurationMs } from './progress.js';

describe('computeProgress', () => {
  it('returns zeros when startedAt is missing', () => {
    expect(computeProgress({ startedAt: null, durationMs: 10_000, now: 0 })).toEqual({
      elapsedMs: 0,
      remainingMs: 0,
      fraction: 0,
    });
  });

  it('clamps elapsed to >= 0 when now is before startedAt', () => {
    const startedAt = '2026-01-01T00:00:10.000Z';
    const result = computeProgress({
      startedAt,
      durationMs: 10_000,
      now: new Date('2026-01-01T00:00:05.000Z').getTime(),
    });
    expect(result.elapsedMs).toBe(0);
    expect(result.remainingMs).toBe(10_000);
    expect(result.fraction).toBe(0);
  });

  it('returns fraction = elapsed / duration', () => {
    const startedAt = '2026-01-01T00:00:00.000Z';
    const result = computeProgress({
      startedAt,
      durationMs: 10_000,
      now: new Date('2026-01-01T00:00:03.000Z').getTime(),
    });
    expect(result.elapsedMs).toBe(3_000);
    expect(result.remainingMs).toBe(7_000);
    expect(result.fraction).toBeCloseTo(0.3);
  });

  it('clamps fraction at 1 when elapsed exceeds duration', () => {
    const startedAt = '2026-01-01T00:00:00.000Z';
    const result = computeProgress({
      startedAt,
      durationMs: 5_000,
      now: new Date('2026-01-01T00:01:00.000Z').getTime(),
    });
    expect(result.fraction).toBe(1);
    expect(result.remainingMs).toBe(0);
  });

  it('returns fraction 1 when durationMs is 0 (avoids divide-by-zero)', () => {
    const startedAt = '2026-01-01T00:00:00.000Z';
    const result = computeProgress({
      startedAt,
      durationMs: 0,
      now: new Date('2026-01-01T00:00:01.000Z').getTime(),
    });
    expect(result.fraction).toBe(1);
  });
});

describe('slideDurationMs', () => {
  it('returns ms for seconds-mode slides', () => {
    expect(slideDurationMs({ duration: { unit: 'seconds', value: 30 } })).toBe(30_000);
  });

  it('returns null for bars-mode slides (cannot resolve without tempo)', () => {
    expect(slideDurationMs({ duration: { unit: 'bars', value: 8 } })).toBeNull();
  });

  it('returns null for slides without duration', () => {
    expect(slideDurationMs({})).toBeNull();
    expect(slideDurationMs(null)).toBeNull();
  });
});
