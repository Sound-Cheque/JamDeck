// Standalone playback window — a minimal app that subscribes to playback
// state via WS and shows whichever deck is currently playing. Opened by the
// host via window.open('/?playback=1', ...) when fullscreenMode='window'.

import { useCallback, useEffect, useState } from 'react';
import { PlaybackView } from './components/PlaybackView.jsx';
import { useDeck } from './hooks/useDeck.js';
import { usePlayback } from './hooks/usePlayback.js';
import { useWebSocket } from './hooks/useWebSocket.js';

export function PlaybackWindow() {
  const playbackState = usePlayback();
  const [deckId, setDeckId] = useState(null);
  const deckState = useDeck(deckId);

  // Mirror the playing deck — when a deck starts, load it; when playback
  // stops we keep the deck loaded so the window doesn't go blank.
  useEffect(() => {
    if (playbackState.state.deckId && playbackState.state.deckId !== deckId) {
      setDeckId(playbackState.state.deckId);
    }
  }, [playbackState.state.deckId, deckId]);

  const handleMessage = useCallback(
    (msg) => {
      playbackState.handleMessage(msg);
      if (msg?.type === 'deck:update' && msg.deck?.id === deckId) {
        deckState.refresh();
      }
    },
    [playbackState, deckId, deckState],
  );
  useWebSocket('/api/ws', handleMessage);

  const isPlaying =
    playbackState.state.state === 'playing' &&
    deckState.deck?.id === playbackState.state.deckId;

  return (
    <div className="playback-window">
      {isPlaying && deckState.deck ? (
        <PlaybackView deck={deckState.deck} playback={playbackState.state} />
      ) : (
        <div className="playback-window__idle">
          <p>Waiting for playback to start…</p>
        </div>
      )}
    </div>
  );
}
