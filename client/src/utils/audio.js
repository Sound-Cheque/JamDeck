// Web Audio metronome tone player. Lazy AudioContext (constructed on first
// play, after a user-initiated event so autoplay policy is happy). Built-in
// short sine-wave clicks: 880Hz for accents, 440Hz for beats.
//
// Custom samples (uploaded WAV/MP3/etc.) can override the built-in tones via
// `setSamples({ accent, beat })`. URLs are fetched + decoded on demand and
// cached; bad fetches silently fall back to the sine tones, so a single
// failed sample never breaks the metronome.

const FREQ = { accent: 880, beat: 440 };
const PEAK_GAIN = 0.4;
const ATTACK_S = 0.01;
const RELEASE_S = 0.04;
const SAMPLE_GAIN = 0.7;

function defaultFactory() {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio API not available');
  return new Ctor();
}

function defaultFetch(url) {
  return globalThis.fetch(url);
}

export function createTonePlayer({
  audioContextFactory = defaultFactory,
  fetchFn = defaultFetch,
} = {}) {
  let ctx = null;
  let broken = false;
  // url -> AudioBuffer (decoded). Decoded once and reused.
  const buffers = new Map();
  // url -> 'pending' while a fetch+decode is in flight.
  const pending = new Map();
  // Per-kind URL currently selected. null = use built-in tone.
  const sampleUrls = { accent: null, beat: null };

  function ensureCtx() {
    if (broken) return null;
    if (!ctx) {
      try {
        ctx = audioContextFactory();
      } catch {
        broken = true;
        return null;
      }
    }
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try {
        ctx.resume();
      } catch {
        /* ignore */
      }
    }
    return ctx;
  }

  function loadSample(url) {
    if (!url || buffers.has(url) || pending.has(url)) return;
    const audio = ensureCtx();
    if (!audio || typeof audio.decodeAudioData !== 'function') return;
    const promise = (async () => {
      try {
        const res = await fetchFn(url);
        if (!res?.ok) throw new Error(`HTTP ${res?.status}`);
        const arrayBuffer = await res.arrayBuffer();
        // Some browsers want a Promise; others a callback. We pass a Promise.
        const decoded = await audio.decodeAudioData(arrayBuffer);
        buffers.set(url, decoded);
      } catch {
        /* leave un-cached — play() will fall back to the sine tone */
      } finally {
        pending.delete(url);
      }
    })();
    pending.set(url, promise);
  }

  // Update the active sample URLs. Pass `null` (or omit) to revert a kind to
  // the built-in tone. Triggers a background fetch + decode for new URLs.
  function setSamples({ accent, beat } = {}) {
    if (accent !== undefined) sampleUrls.accent = accent || null;
    if (beat !== undefined) sampleUrls.beat = beat || null;
    if (sampleUrls.accent) loadSample(sampleUrls.accent);
    if (sampleUrls.beat) loadSample(sampleUrls.beat);
  }

  function playSample(audio, buffer) {
    const now = audio.currentTime;
    const src = audio.createBufferSource();
    src.buffer = buffer;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(SAMPLE_GAIN, now);
    src.connect(gain).connect(audio.destination);
    src.start(now);
  }

  function playSineTone(audio, kind) {
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = FREQ[kind] ?? FREQ.beat;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, now + ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + ATTACK_S + RELEASE_S);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + ATTACK_S + RELEASE_S);
  }

  function play(kind) {
    const audio = ensureCtx();
    if (!audio) return;
    try {
      const url = sampleUrls[kind];
      const buffer = url ? buffers.get(url) : null;
      if (buffer) {
        playSample(audio, buffer);
      } else {
        // No URL set, or sample still loading / failed to decode → fall back
        // to the built-in sine tone so the click never goes silent.
        playSineTone(audio, kind);
      }
    } catch {
      /* ignore — keep playback going even if a single tone fails */
    }
  }

  function dispose() {
    if (ctx?.close) {
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
    }
    ctx = null;
    buffers.clear();
    pending.clear();
  }

  return { play, setSamples, dispose };
}
