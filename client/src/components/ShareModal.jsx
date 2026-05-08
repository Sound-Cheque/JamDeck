// Modal for "share with phones" — starts an ngrok tunnel via the share
// controller, then renders a QR code + the URL so musicians can join from
// their phones. Closing the modal does NOT stop the tunnel; that's a
// separate explicit action so a fleeting drawer dismissal doesn't kick
// everyone off.

import { useEffect, useRef, useState } from 'react';

// QRCode library returns a Promise that resolves once the code has been
// rendered to the supplied canvas. Imported via dynamic import so tests can
// mock the module without pulling the real implementation into jsdom.
async function renderQrToCanvas(canvas, text) {
  const mod = await import('qrcode');
  const qr = mod.default ?? mod;
  await qr.toCanvas(canvas, text, { errorCorrectionLevel: 'M', margin: 1, width: 224 });
}

export function ShareModal({ open, onClose, status, busy, error, onStart, onStop }) {
  const canvasRef = useRef(null);
  const [renderError, setRenderError] = useState(null);
  // Append `?mobile=1` so phones land in the mobile UI even on user-agents
  // that wouldn't be detected as mobile (browser DevTools impersonation, etc.).
  const shareUrl = status?.active && status?.url ? appendMobileParam(status.url) : null;

  useEffect(() => {
    if (!open || !shareUrl || !canvasRef.current) return;
    setRenderError(null);
    renderQrToCanvas(canvasRef.current, shareUrl).catch((err) => {
      setRenderError(err.message ?? 'Failed to render QR code');
    });
  }, [open, shareUrl]);

  if (!open) return null;

  return (
    <div className="share-modal" role="dialog" aria-modal="true" aria-label="Share with phones">
      <div className="share-modal__backdrop" onClick={onClose} />
      <div className="share-modal__panel">
        <header className="share-modal__header">
          <h2>Share with phones</h2>
          <button
            type="button"
            className="share-modal__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {!status.active && (
          <div className="share-modal__body">
            <p>
              Start an ngrok tunnel to make this Jam Deck reachable from any phone.
              Requires the <code>NGROK_AUTHTOKEN</code> env var.
            </p>
            <button
              type="button"
              className="share-modal__primary"
              onClick={onStart}
              disabled={busy}
            >
              {busy ? 'Starting…' : 'Start tunnel'}
            </button>
          </div>
        )}

        {status.active && shareUrl && (
          <div className="share-modal__body">
            <canvas
              ref={canvasRef}
              className="share-modal__qr"
              aria-label="QR code linking to the share URL"
            />
            <p className="share-modal__url">
              <a href={shareUrl} target="_blank" rel="noreferrer">
                {shareUrl}
              </a>
            </p>
            <button
              type="button"
              className="share-modal__secondary"
              onClick={onStop}
              disabled={busy}
            >
              {busy ? 'Stopping…' : 'Stop tunnel'}
            </button>
          </div>
        )}

        {(error || renderError) && (
          <p role="alert" className="share-modal__error">
            {error || renderError}
          </p>
        )}
      </div>
    </div>
  );
}

function appendMobileParam(url) {
  try {
    const u = new URL(url);
    u.searchParams.set('mobile', '1');
    return u.toString();
  } catch {
    // Fallback for malformed URLs — best-effort
    return url.includes('?') ? `${url}&mobile=1` : `${url}?mobile=1`;
  }
}
