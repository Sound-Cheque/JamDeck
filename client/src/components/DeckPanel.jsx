import { useState } from 'react';

function compareDecks(a, b) {
  if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
  return a.name.localeCompare(b.name);
}

export function DeckPanel({
  decks,
  loading,
  error,
  selectedDeckId,
  onSelect,
  onCreate,
  onDelete,
  onToggleFavorite,
}) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');

  function openCreate() {
    setCreating(true);
    setDraftName('');
  }

  function cancelCreate() {
    setCreating(false);
    setDraftName('');
  }

  async function submitCreate(event) {
    event.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) return;
    await onCreate(trimmed);
    setCreating(false);
    setDraftName('');
  }

  const sorted = [...decks].sort(compareDecks);

  return (
    <aside className="deck-panel" aria-label="Decks">
      <header className="deck-panel__header">
        <h2>Decks</h2>
        {!creating && (
          <button type="button" onClick={openCreate} aria-label="New deck">
            + New
          </button>
        )}
      </header>

      {creating && (
        <form className="deck-panel__create" onSubmit={submitCreate}>
          <label className="visually-hidden" htmlFor="new-deck-name">
            New deck name
          </label>
          <input
            id="new-deck-name"
            type="text"
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Deck name"
          />
          <button type="submit">Create</button>
          <button type="button" onClick={cancelCreate}>
            Cancel
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="deck-panel__error">
          {error}
        </p>
      )}

      {loading ? (
        <p className="deck-panel__status">Loading…</p>
      ) : error ? null : sorted.length === 0 ? (
        <p className="deck-panel__status">No decks yet — click + New to start.</p>
      ) : (
        <ul className="deck-panel__list">
          {sorted.map((deck) => (
            <li key={deck.id} className="deck-panel__item">
              <button
                type="button"
                className="deck-panel__select"
                aria-current={deck.id === selectedDeckId ? 'true' : undefined}
                aria-label={`Select deck ${deck.name}`}
                onClick={() => onSelect(deck.id)}
              >
                {deck.name}
              </button>
              <button
                type="button"
                className="deck-panel__favorite"
                aria-label={`Favorite ${deck.name}`}
                aria-pressed={deck.favorite ? 'true' : 'false'}
                onClick={() => onToggleFavorite(deck.id)}
              >
                {deck.favorite ? '★' : '☆'}
              </button>
              <button
                type="button"
                className="deck-panel__delete"
                aria-label={`Delete ${deck.name}`}
                onClick={() => onDelete(deck.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
