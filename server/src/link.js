// Ableton Link bridge.
//
// Thin wrapper around the `abletonlink` native addon. The addon polls a Link
// session for tempo / beat / phase via `startUpdate(intervalMs, cb)` — we
// re-emit those updates as events:
//
//   - 'tempo'      bpm        — fired when BPM changes between ticks
//   - 'peers'      numPeers   — fired when peer count changes between ticks
//   - 'playState'  isPlaying  — fired when transport play state changes
//                                externally (DAW pressed play / stop). Self-
//                                originating changes are suppressed to avoid
//                                feedback loops.
//   - 'error'      Error      — fired when the native addon can't be loaded
//
// The native addon is loaded lazily inside `enable()` so this module is safe
// to import in environments without `abletonlink` installed (CI, mock tests).
// Tests inject a mock constructor via the `abletonLink` option.
//
// Phase / quantum exposed for quantized-start calculations elsewhere.

import { EventEmitter } from 'events';

const DEFAULT_UPDATE_INTERVAL_MS = 100;

export function createLinkBridge({
  abletonLink: AbletonLinkCtor,
  updateIntervalMs = DEFAULT_UPDATE_INTERVAL_MS,
} = {}) {
  const emitter = new EventEmitter();
  let link = null;
  let _beat = 0;
  let _phase = 0;
  let _bpm = null;
  let _numPeers = 0;
  let _isPlaying = false;
  // Tracks the last play state we know about. Used to detect external
  // changes (DAW-triggered play/stop) vs. echoes of our own setIsPlaying().
  let _lastSeenIsPlaying = false;

  async function enable() {
    if (link) return;

    let Ctor = AbletonLinkCtor;
    if (!Ctor) {
      try {
        const mod = await import('abletonlink');
        Ctor = mod.default ?? mod;
      } catch (err) {
        emitter.emit('error', new Error(`abletonlink not available: ${err.message}`));
        return;
      }
    }

    try {
      link = new Ctor();
      link.enable(true);
      // Opt into play-state sharing so our `setIsPlaying` calls broadcast to
      // peers, and DAW play/stop events come back to us via the poll loop.
      try { link.enablePlayStateSync?.(); } catch { /* older addon — ignore */ }
      _bpm = link.bpm;
      _numPeers = link.numPeers;
      _beat = link.beat ?? 0;
      _phase = link.phase ?? 0;
      _isPlaying = !!link.isPlaying;
      _lastSeenIsPlaying = _isPlaying;

      link.startUpdate(updateIntervalMs, (beat, phase, bpm) => {
        _beat = beat;
        _phase = phase;
        if (bpm !== _bpm) {
          _bpm = bpm;
          emitter.emit('tempo', bpm);
        }
        const peers = link.numPeers;
        if (peers !== _numPeers) {
          _numPeers = peers;
          emitter.emit('peers', peers);
        }
        const playing = !!link.isPlaying;
        if (playing !== _lastSeenIsPlaying) {
          _lastSeenIsPlaying = playing;
          _isPlaying = playing;
          emitter.emit('playState', playing);
        }
      });
    } catch (err) {
      emitter.emit('error', err);
      link = null;
    }
  }

  function disable() {
    if (!link) return;
    try { link.stopUpdate(); } catch { /* ignore */ }
    try { link.enable(false); } catch { /* ignore */ }
    link = null;
    _bpm = null;
    _numPeers = 0;
    _beat = 0;
    _phase = 0;
    _isPlaying = false;
    _lastSeenIsPlaying = false;
  }

  function isEnabled() {
    return link !== null;
  }

  function getTempo() {
    return _bpm;
  }

  function getBeat() {
    return _beat;
  }

  function getPhase() {
    return _phase;
  }

  function getQuantum() {
    return link?.quantum ?? null;
  }

  function getNumPeers() {
    return _numPeers;
  }

  function getIsPlaying() {
    return _isPlaying;
  }

  // Set the Link transport play state. Suppresses the next 'playState' event
  // so we don't echo our own change back to the playback controller.
  function setIsPlaying(playing) {
    if (!link) return;
    const target = !!playing;
    if (target === _lastSeenIsPlaying && target === _isPlaying) return;
    // Pre-claim the new value so the next poll tick doesn't see a transition.
    _lastSeenIsPlaying = target;
    _isPlaying = target;
    try {
      if (typeof link.setIsPlaying === 'function') {
        link.setIsPlaying(target);
      } else if (target && typeof link.play === 'function') {
        link.play();
      } else if (!target && typeof link.stop === 'function') {
        link.stop();
      }
    } catch (err) {
      emitter.emit('error', err);
    }
  }

  // Time in ms until the next bar boundary on the Link timeline. Aligns to
  // the local Link session even with zero peers — used for quantized start.
  // Returns null if the bridge isn't enabled or BPM is unknown.
  function msUntilNextBar() {
    if (!link || !_bpm) return null;
    const quantum = link.quantum;
    if (!Number.isFinite(quantum) || quantum <= 0) return null;
    // Treat phase within ~1% of a boundary as "on the boundary" — the Link
    // timeline ticks aren't perfectly aligned to wall-clock zero.
    const threshold = quantum * 0.01;
    const beatsToNext = _phase < threshold ? 0 : quantum - _phase;
    const beatMs = 60_000 / _bpm;
    return beatsToNext * beatMs;
  }

  function on(event, listener) {
    emitter.on(event, listener);
    return () => emitter.off(event, listener);
  }
  function off(event, listener) { emitter.off(event, listener); }
  function once(event, listener) { emitter.once(event, listener); }

  return {
    enable,
    disable,
    isEnabled,
    getTempo,
    getBeat,
    getPhase,
    getQuantum,
    getNumPeers,
    getIsPlaying,
    setIsPlaying,
    msUntilNextBar,
    on,
    off,
    once,
  };
}
