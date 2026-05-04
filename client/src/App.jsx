import { useEffect, useState } from 'react';
import { DeckPanel } from './components/DeckPanel.jsx';
import { SlidePanel } from './components/SlidePanel.jsx';
import { useDecks } from './hooks/useDecks.js';
import { useDeck } from './hooks/useDeck.js';

export function App() {
  const decksState = useDecks();
  const [selectedDeckId, setSelectedDeckId] = useState(null);
  const [selectedSlideId, setSelectedSlideId] = useState(null);
  const deckState = useDeck(selectedDeckId);

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

  return (
    <div className="app">
      <header className="top-bar">
        <h1>Jam Deck</h1>
      </header>
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
          onDeleteSlide={async (slideId) => {
            await deckState.deleteSlide(slideId);
            if (slideId === selectedSlideId) setSelectedSlideId(null);
            await decksState.refresh();
          }}
          onSelectSlide={setSelectedSlideId}
        />
        <section className="main-panel" aria-label="Slide editor" />
      </main>
    </div>
  );
}
