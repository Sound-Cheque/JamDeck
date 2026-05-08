import { useEffect } from 'react';

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function TopBar({
  deck,
  playbackState,
  onStart,
  onStop,
  onToggleLoop,
  onShare,
  onFullscreen,
  onSettings,
}) {
  const isPlaying = playbackState?.state === 'playing';
  const canPlay = !!deck && deck.slides?.length > 0;
  const loopOn = !!deck?.settings?.loop;

  // Spacebar toggles play/stop unless focus is in a typing target.
  useEffect(() => {
    function handleKey(event) {
      if (event.key !== ' ' && event.code !== 'Space') return;
      if (isTypingTarget(event.target)) return;
      if (!deck) return;

      if (isPlaying) {
        event.preventDefault();
        onStop?.();
      } else if (canPlay) {
        event.preventDefault();
        onStart?.(deck.id);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [deck, isPlaying, canPlay, onStart, onStop]);

  return (
    <header className="top-bar">
      <h1>Jam Deck</h1>
      <div className="top-bar__controls">
        {isPlaying ? (
          <button
            type="button"
            className="top-bar__stop"
            aria-label="Stop"
            onClick={() => onStop?.()}
          >
            ■ Stop
          </button>
        ) : (
          <button
            type="button"
            className="top-bar__play"
            aria-label="Play"
            disabled={!canPlay}
            onClick={() => onStart?.(deck.id)}
          >
            ▶ Play
          </button>
        )}

        <button
          type="button"
          className="top-bar__loop"
          aria-label="Loop"
          aria-pressed={loopOn ? 'true' : 'false'}
          disabled={!deck}
          onClick={() => onToggleLoop?.()}
        >
          ⟳ Loop
        </button>

        {onFullscreen && (
          <button
            type="button"
            className="top-bar__fullscreen"
            aria-label="Fullscreen"
            onClick={() => onFullscreen()}
          >
            ⛶ Fullscreen
          </button>
        )}

        {onShare && (
          <button
            type="button"
            className="top-bar__share"
            aria-label="Share with phones"
            onClick={() => onShare()}
          >
            📱 Share
          </button>
        )}

        {onSettings && (
          <button
            type="button"
            className="top-bar__settings"
            aria-label="App settings"
            onClick={() => onSettings()}
          >
            ⚙
          </button>
        )}
      </div>
    </header>
  );
}
