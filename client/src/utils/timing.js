// Timing math, mirrored from server/src/timing.js. Kept in sync by hand —
// both files have parallel tests.

const DEFAULT_BEATS_PER_BAR = 4;

export function barsToMs(bars, bpm, beatsPerBar = DEFAULT_BEATS_PER_BAR) {
  if (!Number.isFinite(bpm) || bpm <= 0) return 0;
  if (!Number.isFinite(bars) || bars <= 0) return 0;
  const beatMs = 60_000 / bpm;
  return bars * beatsPerBar * beatMs;
}

export function msToBars(ms, bpm, beatsPerBar = DEFAULT_BEATS_PER_BAR) {
  if (!Number.isFinite(bpm) || bpm <= 0) return 0;
  const beatMs = 60_000 / bpm;
  return ms / (beatsPerBar * beatMs);
}

// Resolve a slide's duration to milliseconds in the given deck-settings
// context. Returns null when we can't auto-advance from these settings alone
// (bars-mode under Link timing — driven by Link tempo updates instead).
export function slideDurationMs(slide, settings) {
  const unit = slide?.duration?.unit;
  const value = slide?.duration?.value;
  if (unit === 'seconds') {
    return Number.isFinite(value) ? value * 1000 : null;
  }
  if (unit === 'bars') {
    const mode = settings?.timingMode;
    if (mode === 'internal' && Number.isFinite(settings?.internalBpm) && settings.internalBpm > 0) {
      return barsToMs(value, settings.internalBpm);
    }
    return null;
  }
  return null;
}
