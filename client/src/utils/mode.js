// Top-level boot-mode detection. Three modes:
//   - 'playback' — minimal output window (URL has ?playback=1)
//   - 'mobile'   — phone editing UI (?mobile=1 or phone UA)
//   - 'host'     — full 3-panel desktop editor (default)
// Order matters: ?playback=1 wins over ?mobile=1, since the host is the one
// who explicitly opened the popup.

import { isMobileMode } from './mobile.js';

function readSearch() {
  if (typeof window === 'undefined') return '';
  return window.location?.search ?? '';
}

function paramTruthy(search, key) {
  const params = new URLSearchParams(search);
  const v = params.get(key);
  if (v == null) return false;
  const lower = String(v).toLowerCase();
  return lower === '1' || lower === 'true' || lower === 'yes';
}

export function getBootMode({ search = readSearch() } = {}) {
  if (paramTruthy(search, 'playback')) return 'playback';
  if (isMobileMode({ search })) return 'mobile';
  return 'host';
}
