import { useCallback, useEffect, useMemo, useState } from 'react';
import { DeckPanel } from './components/DeckPanel.jsx';
import { SlidePanel } from './components/SlidePanel.jsx';
import { SlideEditor } from './components/SlideEditor.jsx';
import { PlaybackView } from './components/PlaybackView.jsx';
import { TopBar } from './components/TopBar.jsx';
import { ShareModal } from './components/ShareModal.jsx';
import { useDecks } from './hooks/useDecks.js';
import { useDeck } from './hooks/useDeck.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { usePlayback } from './hooks/usePlayback.js';
import { useMetronome } from './hooks/useMetronome.js';
import { useShare } from './hooks/useShare.js';
import { createTonePlayer } from './utils/audio.js';

export function App() {
  const decksState = useDecks();
  const [selectedDeckId, setSelectedDeckId] = useState(null);
  const [selectedSlideId, setSelectedSlideId] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const deckState = useDeck(selectedDeckId);
  const playbackState = usePlayback();
  const shareState = useShare();

  // Live sync — react to mutations broadcast by the server. We refresh state
  // from REST rather than applying message payloads directly; redundant with
  // self-originating broadcasts but simple and idempotent.
  const handleMessage = useCallback(
    (msg) => {
      // Playback (and link:*) messages drive playbackState; deck messages
      // drive deck state. The hook filters by type, so forwarding everything
      // is safe.
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
        case 'link:tempo':
        case 'link:peers':
          // Forwarded to playbackState above; nothing else to do here.
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

  // One tone player for the lifetime of the app. AudioContext stays lazy —
  // it's created on the first beat, after the user's Play click satisfies
  // browser autoplay policy.
  const tonePlayer = useMemo(() => createTonePlayer(), []);

  // Push the loaded deck's metronome sample URLs into the player. setSamples
  // is idempotent for unchanged URLs, so this fires harmlessly on every render.
  useEffect(() => {
    const sounds = deckState.deck?.settings?.metronomeSounds ?? {};
    tonePlayer.setSamples({
      accent: sounds.accent ?? null,
      beat: sounds.beat ?? null,
    });
  }, [
    deckState.deck?.settings?.metronomeSounds?.accent,
    deckState.deck?.settings?.metronomeSounds?.beat,
    tonePlayer,
  ]);

  useMetronome({
    enabled:
      isPlayingLoadedDeck && deckState.deck.settings?.timingMode === 'internal',
    startedAt: playbackState.state.startedAt,
    bpm: deckState.deck?.settings?.internalBpm,
    beatsPerBar: 4,
    player: tonePlayer,
  });

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
        onShare={() => setShareOpen(true)}
      />
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        status={shareState.status}
        busy={shareState.busy}
        error={shareState.error}
        onStart={() => shareState.start().catch(() => {})}
        onStop={() => shareState.stop()}
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
