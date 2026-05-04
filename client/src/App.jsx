import { useState } from 'react';
import { DeckPanel } from './components/DeckPanel.jsx';
import { useDecks } from './hooks/useDecks.js';

export function App() {
  const { decks, loading, error, createDeck, deleteDeck, toggleFavorite } = useDecks();
  const [selectedDeckId, setSelectedDeckId] = useState(null);

  return (
    <div className="app">
      <header className="top-bar">
        <h1>Jam Deck</h1>
      </header>
      <main className="layout">
        <DeckPanel
          decks={decks}
          loading={loading}
          error={error}
          selectedDeckId={selectedDeckId}
          onSelect={setSelectedDeckId}
          onCreate={createDeck}
          onDelete={(id) => {
            deleteDeck(id);
            if (id === selectedDeckId) setSelectedDeckId(null);
          }}
          onToggleFavorite={toggleFavorite}
        />
        <aside className="slide-panel" aria-label="Slides" />
        <section className="main-panel" aria-label="Slide editor" />
      </main>
    </div>
  );
}
