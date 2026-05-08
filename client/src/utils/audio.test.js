import { describe, it, expect, vi } from 'vitest';
import { createTonePlayer } from './audio.js';

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = { __dst: true };
    this.oscillators = [];
    this.gains = [];
    this.bufferSources = [];
    this.resumed = 0;
    this.decodedCalls = [];
  }
  createOscillator() {
    const osc = {
      type: null,
      frequency: { value: null },
      connect: vi.fn().mockReturnThis(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.oscillators.push(osc);
    return osc;
  }
  createBufferSource() {
    const src = {
      buffer: null,
      connect: vi.fn().mockReturnThis(),
      start: vi.fn(),
    };
    this.bufferSources.push(src);
    return src;
  }
  createGain() {
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn().mockReturnThis(),
    };
    this.gains.push(gain);
    return gain;
  }
  decodeAudioData(arrayBuffer) {
    this.decodedCalls.push(arrayBuffer);
    // Return a fake buffer that can be assigned to bufferSource.buffer.
    return Promise.resolve({ __decoded: true, byteLength: arrayBuffer.byteLength });
  }
  resume() {
    this.resumed += 1;
    this.state = 'running';
  }
}

describe('createTonePlayer', () => {
  it('lazily constructs the AudioContext on the first play', () => {
    const factory = vi.fn(() => new MockAudioContext());
    const player = createTonePlayer({ audioContextFactory: factory });
    expect(factory).not.toHaveBeenCalled();
    player.play('beat');
    expect(factory).toHaveBeenCalledTimes(1);
    player.play('accent');
    expect(factory).toHaveBeenCalledTimes(1); // reused
  });

  it('plays accent at a higher pitch than beat', () => {
    const ctx = new MockAudioContext();
    const player = createTonePlayer({ audioContextFactory: () => ctx });
    player.play('beat');
    player.play('accent');
    const [beatOsc, accentOsc] = ctx.oscillators;
    expect(accentOsc.frequency.value).toBeGreaterThan(beatOsc.frequency.value);
  });

  it('schedules a short envelope (start + stop within 100ms)', () => {
    const ctx = new MockAudioContext();
    ctx.currentTime = 10;
    const player = createTonePlayer({ audioContextFactory: () => ctx });
    player.play('beat');
    const osc = ctx.oscillators[0];
    expect(osc.start).toHaveBeenCalledWith(10);
    const stopCall = osc.stop.mock.calls[0][0];
    expect(stopCall).toBeGreaterThan(10);
    expect(stopCall - 10).toBeLessThanOrEqual(0.1);
  });

  it('resumes the context if it was suspended', () => {
    const ctx = new MockAudioContext();
    ctx.state = 'suspended';
    const player = createTonePlayer({ audioContextFactory: () => ctx });
    player.play('beat');
    expect(ctx.resumed).toBe(1);
  });

  it('does not throw when the AudioContext is unavailable', () => {
    const player = createTonePlayer({
      audioContextFactory: () => {
        throw new Error('no audio');
      },
    });
    expect(() => player.play('beat')).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Custom sample playback
  // -------------------------------------------------------------------------

  function fakeOkResponse(bytes = new Uint8Array([1, 2, 3]).buffer) {
    return Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(bytes),
    });
  }

  it('plays a decoded buffer source instead of the sine tone when a sample URL is set', async () => {
    const ctx = new MockAudioContext();
    const fetchFn = vi.fn(() => fakeOkResponse());
    const player = createTonePlayer({ audioContextFactory: () => ctx, fetchFn });

    player.setSamples({ accent: '/media/abc.wav' });
    // Wait for fetch + decode to settle before playing.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    player.play('accent');
    expect(ctx.bufferSources).toHaveLength(1);
    expect(ctx.bufferSources[0].buffer).toMatchObject({ __decoded: true });
    // The sine tone path should NOT have been triggered.
    expect(ctx.oscillators).toHaveLength(0);
  });

  it('falls back to the sine tone if the sample is still loading', async () => {
    const ctx = new MockAudioContext();
    // Never resolves — sample stays "pending"
    const fetchFn = vi.fn(() => new Promise(() => {}));
    const player = createTonePlayer({ audioContextFactory: () => ctx, fetchFn });

    player.setSamples({ accent: '/media/slow.wav' });
    player.play('accent');
    expect(ctx.oscillators).toHaveLength(1); // sine tone fired
    expect(ctx.bufferSources).toHaveLength(0);
  });

  it('falls back to the sine tone if the fetch fails', async () => {
    const ctx = new MockAudioContext();
    const fetchFn = vi.fn(() => Promise.resolve({ ok: false, status: 404 }));
    const player = createTonePlayer({ audioContextFactory: () => ctx, fetchFn });

    player.setSamples({ accent: '/media/missing.wav' });
    await Promise.resolve();
    await Promise.resolve();

    player.play('accent');
    expect(ctx.oscillators).toHaveLength(1);
  });

  it('does not refetch the same URL on subsequent setSamples calls', async () => {
    const ctx = new MockAudioContext();
    const fetchFn = vi.fn(() => fakeOkResponse());
    const player = createTonePlayer({ audioContextFactory: () => ctx, fetchFn });

    player.setSamples({ accent: '/media/a.wav', beat: '/media/b.wav' });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchFn).toHaveBeenCalledTimes(2);

    // Re-setting the same URLs shouldn't trigger more fetches.
    player.setSamples({ accent: '/media/a.wav', beat: '/media/b.wav' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('reverts to the built-in tone when the URL is cleared', async () => {
    const ctx = new MockAudioContext();
    const fetchFn = vi.fn(() => fakeOkResponse());
    const player = createTonePlayer({ audioContextFactory: () => ctx, fetchFn });

    player.setSamples({ beat: '/media/b.wav' });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    player.play('beat');
    expect(ctx.bufferSources).toHaveLength(1);

    player.setSamples({ beat: null });
    player.play('beat');
    // Same context — accumulated counts. Sine tone should now have fired.
    expect(ctx.oscillators).toHaveLength(1);
  });
});
