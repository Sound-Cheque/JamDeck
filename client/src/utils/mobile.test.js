import { describe, it, expect } from 'vitest';
import { isMobileMode } from './mobile.js';

describe('isMobileMode', () => {
  it('returns true when ?mobile=1 is in the search string', () => {
    expect(isMobileMode({ search: '?mobile=1', userAgent: 'desktop' })).toBe(true);
  });

  it('returns true when ?mobile=true is in the search string', () => {
    expect(isMobileMode({ search: '?mobile=true', userAgent: 'desktop' })).toBe(true);
  });

  it('returns false when ?mobile=0 is set even on a mobile UA', () => {
    expect(
      isMobileMode({
        search: '?mobile=0',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      }),
    ).toBe(false);
  });

  it('falls back to UA sniffing for iPhone', () => {
    expect(
      isMobileMode({
        search: '',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      }),
    ).toBe(true);
  });

  it('falls back to UA sniffing for Android phones', () => {
    expect(
      isMobileMode({
        search: '',
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36',
      }),
    ).toBe(true);
  });

  it('returns false for desktop user agents with no override', () => {
    expect(
      isMobileMode({
        search: '',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15',
      }),
    ).toBe(false);
  });

  it('reads from window.location / navigator when called with no args', () => {
    // Smoke-only — just make sure the no-arg form doesn't throw in jsdom
    expect(() => isMobileMode()).not.toThrow();
    expect(typeof isMobileMode()).toBe('boolean');
  });
});
