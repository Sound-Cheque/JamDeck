// Pure time math for the playback timer. No React, no DOM, no clocks —
// callers pass in `now` so this stays deterministic under tests.

export function computeProgress({ startedAt, durationMs, now }) {
  if (!startedAt) {
    return { elapsedMs: 0, remainingMs: 0, fraction: 0 };
  }
  const startMs = new Date(startedAt).getTime();
  const elapsedMs = Math.max(0, now - startMs);
  if (durationMs <= 0) {
    return { elapsedMs, remainingMs: 0, fraction: 1 };
  }
  const fraction = Math.min(1, elapsedMs / durationMs);
  const remainingMs = Math.max(0, durationMs - elapsedMs);
  return { elapsedMs, remainingMs, fraction };
}

// Re-exported from timing.js so existing imports keep working. Bars-mode
// resolution is timing-mode-aware now — see ./timing.js.
export { slideDurationMs } from './timing.js';
