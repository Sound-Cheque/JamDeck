import { describe, it, expect, vi } from 'vitest';
import { createTonePlayer } from './audio.js';

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = { __dst: true };
    this.oscillators = [];
    this.gains = [];
    this.resumed = 0;
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
});
