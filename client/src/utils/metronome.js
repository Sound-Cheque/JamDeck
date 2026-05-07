// Pure metronome scheduling math. Given the start of playback (in ms since
// epoch), a tempo (BPM), and the current time, return the next beat boundary
// at or after `now` — including beat 0 at the very start.

export function nextBeatAtOrAfter(startedAtMs, bpm, nowMs) {
  if (!Number.isFinite(bpm) || bpm <= 0) return null;
  const beatMs = 60_000 / bpm;
  const elapsed = nowMs - startedAtMs;
  if (elapsed <= 0) {
    return { beatNumber: 0, atMs: startedAtMs };
  }
  const beatNumber = Math.ceil(elapsed / beatMs);
  return { beatNumber, atMs: startedAtMs + beatNumber * beatMs };
}
