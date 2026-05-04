import { useState } from 'react';
import { DeckSettings } from './DeckSettings.jsx';

export function SlidePanel({ deck, loading, error, onUpdate }) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  let body = null;
  if (loading) {
    body = <p className="slide-panel__status">Loading…</p>;
  } else if (error) {
    body = (
      <p role="alert" className="slide-panel__error">
        {error}
      </p>
    );
  } else if (!deck) {
    body = <p className="slide-panel__status">Select a deck to begin.</p>;
  } else {
    body = (
      <>
        <header className="slide-panel__header">
          <h2>{deck.name}</h2>
          <button
            type="button"
            aria-label="Deck settings"
            aria-expanded={settingsOpen ? 'true' : 'false'}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            ⚙
          </button>
        </header>
        {settingsOpen && (
          <DeckSettings
            deck={deck}
            onSave={async (patch) => {
              await onUpdate(patch);
              setSettingsOpen(false);
            }}
          />
        )}
        {deck.slides.length === 0 ? (
          <p className="slide-panel__status">No slides yet.</p>
        ) : (
          <ul className="slide-panel__list">
            {deck.slides.map((slide, i) => (
              <li key={slide.id ?? i}>{slide.id ?? `slide-${i}`}</li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <aside className="slide-panel" aria-label="Slides">
      {body}
    </aside>
  );
}
