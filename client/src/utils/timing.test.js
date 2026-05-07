import { describe, it, expect } from 'vitest';
import { barsToMs, msToBars, slideDurationMs } from './timing.js';

// Mirror of server/src/timing.test.js — keeps the two implementations from
// drifting. If you tweak one, copy the change to the other.

describe('barsToMs', () => {
  it('converts at 120 BPM in 4/4', () => {
    expect(barsToMs(1, 120)).toBe(2_000);
    expect(barsToMs(8, 120)).toBe(16_000);
  });

  it('honours a custom beatsPerBar', () => {
    expect(barsToMs(1, 120, 3)).toBe(1_500);
  });

  it('returns 0 for non-positive bpm', () => {
    expect(barsToMs(8, 0)).toBe(0);
    expect(barsToMs(8, -10)).toBe(0);
  });

  it('returns 0 for non-positive bars', () => {
    expect(barsToMs(0, 120)).toBe(0);
    expect(barsToMs(-2, 120)).toBe(0);
  });
});

describe('msToBars', () => {
  it('is the inverse of barsToMs', () => {
    expect(msToBars(2_000, 120)).toBeCloseTo(1);
  });

  it('returns 0 for non-positive bpm', () => {
    expect(msToBars(2_000, 0)).toBe(0);
  });
});

describe('slideDurationMs', () => {
  it('returns ms for seconds-mode slides regardless of timing mode', () => {
    const slide = { duration: { unit: 'seconds', value: 30 } };
    expect(slideDurationMs(slide, { timingMode: 'duration' })).toBe(30_000);
    expect(slideDurationMs(slide, { timingMode: 'internal', internalBpm: 60 })).toBe(30_000);
  });

  it('returns ms for bars-mode slides in internal-clock mode', () => {
    const slide = { duration: { unit: 'bars', value: 4 } };
    expect(slideDurationMs(slide, { timingMode: 'internal', internalBpm: 120 })).toBe(8_000);
  });

  it('returns null for bars-mode slides in Link mode', () => {
    expect(
      slideDurationMs(
        { duration: { unit: 'bars', value: 4 } },
        { timingMode: 'link', internalBpm: 120 },
      ),
    ).toBeNull();
  });

  it('returns null for bars-mode slides without a usable BPM', () => {
    expect(
      slideDurationMs(
        { duration: { unit: 'bars', value: 4 } },
        { timingMode: 'internal', internalBpm: 0 },
      ),
    ).toBeNull();
  });

  it('returns null for missing slides or unknown units', () => {
    expect(slideDurationMs(null, {})).toBeNull();
    expect(slideDurationMs({}, {})).toBeNull();
    expect(slideDurationMs({ duration: { unit: 'parsecs', value: 1 } }, {})).toBeNull();
  });
});
