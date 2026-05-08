import { describe, it, expect } from 'vitest';
import { getBootMode } from './mode.js';

describe('getBootMode', () => {
  it('returns "playback" when ?playback=1', () => {
    expect(getBootMode({ search: '?playback=1' })).toBe('playback');
  });

  it('returns "mobile" when ?mobile=1', () => {
    expect(getBootMode({ search: '?mobile=1' })).toBe('mobile');
  });

  it('playback wins over mobile if both are set', () => {
    expect(getBootMode({ search: '?playback=1&mobile=1' })).toBe('playback');
  });

  it('returns "host" when no params are set and not on a phone', () => {
    expect(getBootMode({ search: '' })).toBe('host');
  });
});
