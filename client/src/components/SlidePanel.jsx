import { useState } from 'react';
import { DeckSettings } from './DeckSettings.jsx';

function describeDuration(duration) {
  if (!duration) return '';
  const { unit, value } = duration;
  return unit === 'bars' ? `${value} bar${value === 1 ? '' : 's'}` : `${value}s`;
}

export function SlidePanel({
  deck,
  loading,
  error,
  selectedSlideId,
  onUpdate,
  onAddSlide,
  onDeleteSlide,
  onSelectSlide,
}) {
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
            {deck.slides.map((slide, i) => {
              const num = i + 1;
              return (
                <li key={slide.id} className="slide-panel__item">
                  <button
                    type="button"
                    className="slide-panel__select"
                    aria-label={`Select slide ${num}`}
                    aria-current={slide.id === selectedSlideId ? 'true' : undefined}
                    onClick={() => onSelectSlide(slide.id)}
                  >
                    <span className="slide-panel__num">{num}</span>
                    <span className="slide-panel__type">{slide.type}</span>
                    <span className="slide-panel__duration">{describeDuration(slide.duration)}</span>
                  </button>
                  <button
                    type="button"
                    className="slide-panel__delete"
                    aria-label={`Delete slide ${num}`}
                    onClick={() => onDeleteSlide(slide.id)}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          className="slide-panel__add"
          aria-label="Add slide"
          onClick={() => onAddSlide()}
        >
          + Add Slide
        </button>
      </>
    );
  }

  return (
    <aside className="slide-panel" aria-label="Slides">
      {body}
    </aside>
  );
}
