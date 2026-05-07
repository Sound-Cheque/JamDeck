// Web Audio metronome tone player. Lazy AudioContext (constructed on first
// play, after a user-initiated event so autoplay policy is happy). Built-in
// short sine-wave clicks: 880Hz for accents, 440Hz for beats. Uploadable
// click sounds can be layered on top later via the existing media route.

const FREQ = { accent: 880, beat: 440 };
const PEAK_GAIN = 0.4;
const ATTACK_S = 0.01;
const RELEASE_S = 0.04;

function defaultFactory() {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio API not available');
  return new Ctor();
}

export function createTonePlayer({ audioContextFactory = defaultFactory } = {}) {
  let ctx = null;
  let broken = false;

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

  function play(kind) {
    const audio = ensureCtx();
    if (!audio) return;
    try {
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
  }

  return { play, dispose };
}
