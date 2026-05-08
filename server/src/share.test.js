// Tests for the share controller — starts/stops an ngrok tunnel on demand
// and exposes its URL. Uses an injected tunnelFactory so tests never touch
// the real ngrok service.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createShareController } from './share.js';

let factoryCalls;
let activeTunnel;

function makeTunnelFactory({ url = 'https://abc123.ngrok-free.app', failOnStart = false } = {}) {
  factoryCalls = [];
  return async (opts) => {
    factoryCalls.push(opts);
    if (failOnStart) throw new Error('ngrok auth failed');
    let closed = false;
    activeTunnel = {
      url: () => url,
      close: vi.fn(async () => {
        closed = true;
      }),
      _isClosed: () => closed,
    };
    return activeTunnel;
  };
}

describe('createShareController', () => {
  beforeEach(() => {
    factoryCalls = null;
    activeTunnel = null;
  });

  it('reports inactive before start', () => {
    const ctl = createShareController({ tunnelFactory: makeTunnelFactory(), port: 4000 });
    expect(ctl.getStatus()).toEqual({ active: false });
  });

  it('start() opens a tunnel and reports the URL', async () => {
    const ctl = createShareController({
      tunnelFactory: makeTunnelFactory({ url: 'https://foo.ngrok-free.app' }),
      port: 4000,
    });
    const result = await ctl.start();
    expect(result).toEqual({ active: true, url: 'https://foo.ngrok-free.app' });
    expect(ctl.getStatus()).toEqual({ active: true, url: 'https://foo.ngrok-free.app' });
  });

  it('passes the configured port to the factory', async () => {
    const ctl = createShareController({
      tunnelFactory: makeTunnelFactory(),
      port: 4321,
    });
    await ctl.start();
    expect(factoryCalls[0]).toMatchObject({ addr: 4321 });
  });

  it('start() is idempotent — returns the existing tunnel without reopening', async () => {
    const factory = makeTunnelFactory({ url: 'https://x.ngrok-free.app' });
    const ctl = createShareController({ tunnelFactory: factory, port: 4000 });
    await ctl.start();
    const second = await ctl.start();
    expect(second.url).toBe('https://x.ngrok-free.app');
    expect(factoryCalls).toHaveLength(1);
  });

  it('stop() closes the tunnel and clears state', async () => {
    const ctl = createShareController({ tunnelFactory: makeTunnelFactory(), port: 4000 });
    await ctl.start();
    await ctl.stop();
    expect(activeTunnel.close).toHaveBeenCalled();
    expect(ctl.getStatus()).toEqual({ active: false });
  });

  it('stop() is a no-op when no tunnel is active', async () => {
    const ctl = createShareController({ tunnelFactory: makeTunnelFactory(), port: 4000 });
    await expect(ctl.stop()).resolves.not.toThrow();
    expect(ctl.getStatus()).toEqual({ active: false });
  });

  it('start() rethrows the factory error and stays inactive', async () => {
    const ctl = createShareController({
      tunnelFactory: makeTunnelFactory({ failOnStart: true }),
      port: 4000,
    });
    await expect(ctl.start()).rejects.toThrow(/ngrok auth failed/);
    expect(ctl.getStatus()).toEqual({ active: false });
  });
});
