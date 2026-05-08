import { describe, it, expect } from 'vitest';
import { barsToMs, msToBars, slideDurationMs } from './timing.js';

describe('barsToMs', () => {
  it('converts at the canonical 120bpm in 4/4', () => {
    // 120 BPM = 2 beats/sec → 1 bar (4 beats) = 2s = 2000ms
    expect(barsToMs(1, 120)).toBe(2_000);
    expect(barsToMs(8, 120)).toBe(16_000);
  });

  it('honours a custom beatsPerBar', () => {
    // 120 BPM in 3/4 → 1 bar = 3 beats = 1.5s = 1500ms
    expect(barsToMs(1, 120, 3)).toBe(1_500);
  });

  it('returns 0 for non-positive bpm', () => {
    expect(barsToMs(8, 0)).toBe(0);
    expect(barsToMs(8, -10)).toBe(0);
  });

  it('returns 0 for zero or negative bars', () => {
    expect(barsToMs(0, 120)).toBe(0);
    expect(barsToMs(-2, 120)).toBe(0);
  });
});

describe('msToBars', () => {
  it('is the inverse of barsToMs', () => {
    expect(msToBars(2_000, 120)).toBeCloseTo(1);
    expect(msToBars(16_000, 120)).toBeCloseTo(8);
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

  it('returns ms for bars-mode slides in internal-clock mode using the deck BPM', () => {
    const slide = { duration: { unit: 'bars', value: 4 } };
    // 4 bars at 120 BPM, 4/4 = 8s = 8000ms
    expect(slideDurationMs(slide, { timingMode: 'internal', internalBpm: 120 })).toBe(8_000);
    // 4 bars at 60 BPM = 16s = 16000ms
    expect(slideDurationMs(slide, { timingMode: 'internal', internalBpm: 60 })).toBe(16_000);
  });

  it('returns null for bars-mode slides in Link mode without linkBpm', () => {
    const slide = { duration: { unit: 'bars', value: 4 } };
    expect(slideDurationMs(slide, { timingMode: 'link', internalBpm: 120 })).toBeNull();
  });

  it('resolves bars-mode in Link mode using settings.linkBpm', () => {
    const slide = { duration: { unit: 'bars', value: 4 } };
    expect(slideDurationMs(slide, { timingMode: 'link', linkBpm: 120 })).toBe(8_000);
    expect(slideDurationMs(slide, { timingMode: 'link', linkBpm: 60 })).toBe(16_000);
  });

  it('returns null for bars-mode slides without a usable BPM', () => {
    const slide = { duration: { unit: 'bars', value: 4 } };
    expect(slideDurationMs(slide, { timingMode: 'internal', internalBpm: 0 })).toBeNull();
    expect(slideDurationMs(slide, { timingMode: 'internal' })).toBeNull();
  });

  it('returns null for unknown duration units or missing slides', () => {
    expect(slideDurationMs({}, { timingMode: 'duration' })).toBeNull();
    expect(slideDurationMs(null, { timingMode: 'duration' })).toBeNull();
    expect(
      slideDurationMs({ duration: { unit: 'parsecs', value: 4 } }, { timingMode: 'duration' }),
    ).toBeNull();
  });
});
