import { useState } from 'react';
import { DeckPanel } from './components/DeckPanel.jsx';
import { SlidePanel } from './components/SlidePanel.jsx';
import { useDecks } from './hooks/useDecks.js';
import { useDeck } from './hooks/useDeck.js';

export function App() {
  const decksState = useDecks();
  const [selectedDeckId, setSelectedDeckId] = useState(null);
  const deckState = useDeck(selectedDeckId);

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
          onUpdate={async (patch) => {
            const updated = await deckState.update(patch);
            // Keep the deck-list summary in sync with name/favorite/timestamp
            // changes from this PATCH.
            await decksState.refresh();
            return updated;
          }}
        />
        <section className="main-panel" aria-label="Slide editor" />
      </main>
    </div>
  );
}
