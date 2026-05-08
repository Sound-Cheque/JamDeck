// Mobile UI shell: vertical slide list with edit toggles, lock indicator
// for the currently-playing slide, and an inline "Add Slide" button.
//
// At the top level we show a deck picker — the host can have multiple decks
// open across rehearsal sessions, and the mobile user picks which to follow.
// When a deck starts playing, we auto-switch to it so the band's phones
// stay in sync with the projector.

import { useCallback, useEffect, useState } from 'react';
import { useDecks } from './hooks/useDecks.js';
import { useDeck } from './hooks/useDeck.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { usePlayback } from './hooks/usePlayback.js';
import { SlideThumbnail } from './components/SlideThumbnail.jsx';
import { MobileSlideEditor } from './components/MobileSlideEditor.jsx';

export function MobileApp() {
  const decksState = useDecks();
  const playbackState = usePlayback();
  const [selectedDeckId, setSelectedDeckId] = useState(null);
  const [editingSlideId, setEditingSlideId] = useState(null);
  const deckState = useDeck(selectedDeckId);

  // Live sync — same shape as the desktop App: refresh from REST after
  // mutation broadcasts arrive.
  const handleMessage = useCallback(
    (msg) => {
      playbackState.handleMessage(msg);
      switch (msg.type) {
        case 'deck:created':
        case 'deck:deleted':
          decksState.refresh();
          if (msg.type === 'deck:deleted' && msg.deckId === selectedDeckId) {
            setSelectedDeckId(null);
            setEditingSlideId(null);
          }
          break;
        case 'deck:update':
          decksState.refresh();
          if (msg.deck?.id === selectedDeckId) deckState.refresh();
          break;
        case 'playback:start':
          if (msg.deckId && msg.deckId !== selectedDeckId) {
            // Auto-switch the phone to the playing deck so musicians don't
            // have to navigate manually when the leader hits Play.
            setSelectedDeckId(msg.deckId);
            setEditingSlideId(null);
          }
          break;
        default:
          break;
      }
    },
    [decksState, deckState, selectedDeckId, playbackState],
  );
  useWebSocket('/api/ws', handleMessage);

  // If the editing slide vanishes (deleted by another client), exit the editor.
  useEffect(() => {
    if (!editingSlideId || !deckState.deck) return;
    const exists = deckState.deck.slides.some((s) => s.id === editingSlideId);
    if (!exists) setEditingSlideId(null);
  }, [editingSlideId, deckState.deck]);

  const playingDeckId = playbackState.state.deckId ?? null;
  const playingSlideIndex = playbackState.state.slideIndex ?? null;
  const isCurrentDeckPlaying =
    playbackState.state.state === 'playing' && playingDeckId === selectedDeckId;
  const lockedSlideId =
    isCurrentDeckPlaying && playingSlideIndex != null
      ? deckState.deck?.slides?.[playingSlideIndex]?.id ?? null
      : null;

  // ---- Deck picker view ----------------------------------------------------
  if (!selectedDeckId) {
    return (
      <div className="mobile-app">
        <header className="mobile-app__header">
          <h1>Jam Deck</h1>
        </header>
        <main className="mobile-app__deck-picker">
          {decksState.loading && <p>Loading…</p>}
          {decksState.error && (
            <p role="alert" className="mobile-app__error">
              {decksState.error}
            </p>
          )}
          {!decksState.loading && decksState.decks.length === 0 && (
            <p className="mobile-app__empty">No decks yet — open Jam Deck on the host to create one.</p>
          )}
          <ul className="mobile-app__deck-list">
            {decksState.decks.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className="mobile-app__deck-button"
                  onClick={() => setSelectedDeckId(d.id)}
                >
                  <span className="mobile-app__deck-name">{d.name}</span>
                  <span className="mobile-app__deck-meta">
                    {d.slideCount} slide{d.slideCount === 1 ? '' : 's'}
                    {d.id === playingDeckId ? ' · ▶ playing' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </main>
      </div>
    );
  }

  // ---- Editor view (full-screen for the slide being edited) ---------------
  if (editingSlideId) {
    const slide = deckState.deck?.slides.find((s) => s.id === editingSlideId);
    if (!slide) return null;
    return (
      <MobileSlideEditor
        slide={slide}
        deckSettings={deckState.deck.settings}
        onSubmit={async (next) => {
          await deckState.updateSlide(slide.id, next);
          setEditingSlideId(null);
        }}
        onCancel={() => setEditingSlideId(null)}
      />
    );
  }

  // ---- Slide list view ----------------------------------------------------
  const deck = deckState.deck;
  return (
    <div className="mobile-app">
      <header className="mobile-app__header">
        <button
          type="button"
          className="mobile-app__back"
          onClick={() => {
            setSelectedDeckId(null);
            setEditingSlideId(null);
          }}
          aria-label="Back to deck list"
        >
          ‹
        </button>
        <h1>{deck?.name ?? 'Loading…'}</h1>
      </header>
      <main className="mobile-app__slides">
        {deckState.loading && <p>Loading…</p>}
        {deckState.error && (
          <p role="alert" className="mobile-app__error">
            {deckState.error}
          </p>
        )}
        {deck && (
          <ol className="mobile-app__slide-list">
            {deck.slides.map((slide, i) => {
              const locked = slide.id === lockedSlideId;
              return (
                <li
                  key={slide.id}
                  className="mobile-app__slide-row"
                  aria-current={locked ? 'true' : undefined}
                >
                  <div className="mobile-app__slide-meta">
                    <span className="mobile-app__slide-num">Slide {i + 1}</span>
                    {locked ? (
                      <span aria-label="currently playing — locked" title="Locked: currently playing">
                        🔒
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="mobile-app__edit-toggle"
                        onClick={() => setEditingSlideId(slide.id)}
                        aria-label={`Edit slide ${i + 1}`}
                      >
                        ✏
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="mobile-app__slide-thumb"
                    onClick={() => !locked && setEditingSlideId(slide.id)}
                    disabled={locked}
                    aria-label={`Slide ${i + 1}${locked ? ' (locked)' : ''}`}
                  >
                    <SlideThumbnail slide={slide} />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {deck && (
          <button
            type="button"
            className="mobile-app__add-slide"
            onClick={async () => {
              const updated = await deckState.addSlide();
              const last = updated.slides[updated.slides.length - 1];
              if (last) setEditingSlideId(last.id);
            }}
          >
            + Add Slide
          </button>
        )}
      </main>
    </div>
  );
}
