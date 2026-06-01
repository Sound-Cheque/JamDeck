// Share controller — starts and stops an ngrok tunnel on demand so phones
// on a different network can reach the local server. Single-tunnel state;
// idempotent start; injectable tunnelFactory so unit tests never call the
// real service.
//
// In production the factory wraps `@ngrok/ngrok`'s `forward()` API, which
// reads NGROK_AUTHTOKEN from the environment. If the package isn't
// installed (or the auth token isn't set), the controller surfaces the
// error from start() and stays inactive.

export function createShareController({ tunnelFactory, port = 4000 } = {}) {
  if (typeof tunnelFactory !== 'function') {
    throw new Error('createShareController requires a tunnelFactory function');
  }

  let tunnel = null;
  let url = null;

  function getStatus() {
    if (!tunnel) return { active: false };
    return { active: true, url };
  }

  async function start() {
    if (tunnel) return getStatus();
    const t = await tunnelFactory({ addr: port });
    tunnel = t;
    url = typeof t.url === 'function' ? t.url() : t.url;
    return getStatus();
  }

  async function stop() {
    if (!tunnel) return;
    const t = tunnel;
    tunnel = null;
    url = null;
    try {
      if (typeof t.close === 'function') await t.close();
    } catch {
      /* swallow — best-effort cleanup */
    }
  }

  return { getStatus, start, stop };
}

// Default tunnelFactory used in production. Lazy-imports `@ngrok/ngrok` so
// `share.js` is safe to import without the package installed.
export async function defaultNgrokTunnelFactory(opts) {
  const authtoken = process.env.NGROK_AUTHTOKEN;
  if (!authtoken) {
    throw new Error('NGROK_AUTHTOKEN is not set — add it to .env');
  }
  const mod = await import('@ngrok/ngrok');
  // `forward` is the recommended entrypoint for newer @ngrok/ngrok; it
  // returns a Listener with .url() and .close().
  const ngrok = mod.default ?? mod;
  if (typeof ngrok.forward !== 'function') {
    throw new Error('@ngrok/ngrok does not expose forward()');
  }
  return ngrok.forward({ ...opts, authtoken });
}
