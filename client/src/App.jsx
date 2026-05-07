import { useCallback, useEffect, useState } from 'react';
import { DeckPanel } from './components/DeckPanel.jsx';
import { SlidePanel } from './components/SlidePanel.jsx';
import { SlideEditor } from './components/SlideEditor.jsx';
import { PlaybackView } from './components/PlaybackView.jsx';
import { TopBar } from './components/TopBar.jsx';
import { useDecks } from './hooks/useDecks.js';
import { useDeck } from './hooks/useDeck.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { usePlayback } from './hooks/usePlayback.js';

export function App() {
  const decksState = useDecks();
  const [selectedDeckId, setSelectedDeckId] = useState(null);
  const [selectedSlideId, setSelectedSlideId] = useState(null);
  const deckState = useDeck(selectedDeckId);
  const playbackState = usePlayback();

  // Live sync — react to mutations broadcast by the server. We refresh state
  // from REST rather than applying message payloads directly; redundant with
  // self-originating broadcasts but simple and idempotent.
  const handleMessage = useCallback(
    (msg) => {
      // Playback messages drive playbackState; deck messages drive deck state.
      // The hook filters by type, so it's safe to forward everything.
      playbackState.handleMessage(msg);

      switch (msg.type) {
        case 'deck:created':
          decksState.refresh();
          break;
        case 'deck:deleted':
          decksState.refresh();
          if (msg.deckId === selectedDeckId) setSelectedDeckId(null);
          break;
        case 'deck:update':
          decksState.refresh();
          if (msg.deck?.id === selectedDeckId) deckState.refresh();
          break;
        case 'playback:start':
          // Auto-switch to whichever deck is being played so the operator
          // always sees the live view.
          if (msg.deckId && msg.deckId !== selectedDeckId) {
            setSelectedDeckId(msg.deckId);
          }
          break;
        default:
          break;
      }
    },
    [decksState, deckState, selectedDeckId, playbackState],
  );
  useWebSocket('/api/ws', handleMessage);

  // When the loaded deck changes (or its slides change), keep the slide
  // selection in a sane state — clear it if the selected slide vanished.
  useEffect(() => {
    if (!deckState.deck) {
      if (selectedSlideId !== null) setSelectedSlideId(null);
      return;
    }
    const stillThere = deckState.deck.slides.some((s) => s.id === selectedSlideId);
    if (selectedSlideId && !stillThere) {
      setSelectedSlideId(null);
    }
  }, [deckState.deck, selectedSlideId]);

  const isPlayingLoadedDeck =
    playbackState.state.state === 'playing' &&
    deckState.deck &&
    playbackState.state.deckId === deckState.deck.id;

  return (
    <div className="app">
      <TopBar
        deck={deckState.deck}
        playbackState={playbackState.state}
        onStart={(deckId) => playbackState.start(deckId)}
        onStop={() => playbackState.stop()}
        onToggleLoop={async () => {
          if (!deckState.deck) return;
          const next = !deckState.deck.settings.loop;
          await deckState.update({ settings: { loop: next } });
          await decksState.refresh();
        }}
      />
      <main className="layout">
        <DeckPanel
          decks={decksState.decks}
          loading={decksState.loading}
          error={decksState.error}
          selectedDeckId={selectedDeckId}
          onSelect={setSelectedDeckId}
          onCreate={decksState.createDeck}
          onDelete={(id) => {
            decksState.deleteDeck(id);
            if (id === selectedDeckId) setSelectedDeckId(null);
          }}
          onToggleFavorite={decksState.toggleFavorite}
        />
        <SlidePanel
          deck={deckState.deck}
          loading={deckState.loading}
          error={deckState.error}
          selectedSlideId={selectedSlideId}
          onUpdate={async (patch) => {
            const updated = await deckState.update(patch);
            // Keep the deck-list summary in sync with name/favorite/timestamp
            // changes from this PATCH.
            await decksState.refresh();
            return updated;
          }}
          onAddSlide={async () => {
            const updated = await deckState.addSlide();
            // Auto-select the newly added slide for fast iteration.
            const last = updated.slides[updated.slides.length - 1];
            if (last) setSelectedSlideId(last.id);
            await decksState.refresh();
          }}
          onAddImageSlide={async () => {
            const updated = await deckState.addSlide({
              type: 'image',
              content: { src: null },
            });
            const last = updated.slides[updated.slides.length - 1];
            if (last) setSelectedSlideId(last.id);
            await decksState.refresh();
          }}
          onDeleteSlide={async (slideId) => {
            await deckState.deleteSlide(slideId);
            if (slideId === selectedSlideId) setSelectedSlideId(null);
            await decksState.refresh();
          }}
          onSelectSlide={setSelectedSlideId}
        />
        <section className="main-panel" aria-label="Slide editor">
          {isPlayingLoadedDeck ? (
            <PlaybackView deck={deckState.deck} playback={playbackState.state} />
          ) : (
            <SlideEditor
              slide={
                deckState.deck && selectedSlideId
                  ? deckState.deck.slides.find((s) => s.id === selectedSlideId) ?? null
                  : null
              }
              onUpdate={(slideId, patch) => deckState.updateSlide(slideId, patch)}
            />
          )}
        </section>
      </main>
    </div>
  );
}
