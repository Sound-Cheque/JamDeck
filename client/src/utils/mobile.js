// Mobile-mode detection. Two signals, in order of precedence:
//   1. `?mobile=1` (or 0/true/false) URL param — explicit override, lets the
//      host force mobile UI on a desktop or vice versa.
//   2. User-agent sniffing — best-effort heuristic for phone-class devices.
// The URL param wins when present so testing the mobile UI on desktop and
// forcing the desktop UI on a tablet are both possible.

// Matches phone-class user agents. Android tablets share the mobile UI on
// purpose — the touch flow is right for them too.
const MOBILE_UA_RE = /iPhone|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i;

function readSearch() {
  if (typeof window === 'undefined') return '';
  return window.location?.search ?? '';
}

function readUserAgent() {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent ?? '';
}

function paramValue(search, key) {
  const params = new URLSearchParams(search);
  return params.get(key);
}

function truthyParam(value) {
  if (value == null) return null;
  const v = String(value).toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'no') return false;
  return null;
}

export function isMobileMode({ search = readSearch(), userAgent = readUserAgent() } = {}) {
  const explicit = truthyParam(paramValue(search, 'mobile'));
  if (explicit != null) return explicit;
  return MOBILE_UA_RE.test(userAgent);
}
