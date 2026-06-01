import { useEffect, useRef, useState } from 'react';
import { DeckSettings } from './DeckSettings.jsx';
import { SlideThumbnail } from './SlideThumbnail.jsx';
import { reorderIds } from '../utils/reorder.js';

function describeDuration(duration) {
  if (!duration) return '';
  const { unit, value } = duration;
  return unit === 'bars' ? `${value} bar${value === 1 ? '' : 's'}` : `${value}s`;
}

function DurationField({ slide, onUpdateSlide }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (!slide.duration) return null;

  const { unit, value } = slide.duration;
  const unitLabel = unit === 'bars' ? (value === 1 ? 'bar' : 'bars') : 's';

  function startEdit(e) {
    e.stopPropagation();
    setDraft(String(value));
    setEditing(true);
  }

  function commit() {
    const num = parseFloat(draft);
    if (!isNaN(num) && num > 0) {
      onUpdateSlide(slide.id, { duration: { unit, value: num } });
    }
    setEditing(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') setEditing(false);
    e.stopPropagation();
  }

  if (editing) {
    return (
      <span className="slide-panel__duration slide-panel__duration--editing" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="number"
          min={0.1}
          step={unit === 'bars' ? 1 : 0.5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="slide-panel__duration-input"
          autoFocus
        />
        <span>{unitLabel}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="slide-panel__duration slide-panel__duration--btn"
      onClick={startEdit}
      title="Click to edit duration"
    >
      {describeDuration(slide.duration)}
    </button>
  );
}

export function SlidePanel({
  deck,
  loading,
  error,
  selectedSlideId,
  onUpdate,
  onUpdateSlide,
  onAddSlide,
  onAddImageSlide,
  onAddVideoSlide,
  onDeleteSlide,
  onSelectSlide,
  onReorderSlides,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

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
              const isDragging = draggingId === slide.id;
              const isDragOver = dragOverId === slide.id && draggingId && draggingId !== slide.id;
              return (
                <li
                  key={slide.id}
                  className={
                    'slide-panel__item' +
                    (isDragging ? ' slide-panel__item--dragging' : '') +
                    (isDragOver ? ' slide-panel__item--drag-over' : '')
                  }
                  draggable={!!onReorderSlides}
                  onDragStart={(e) => {
                    setDraggingId(slide.id);
                    // Some browsers require setData() for the drag to "stick".
                    try { e.dataTransfer?.setData?.('text/plain', slide.id); } catch { /* noop */ }
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    if (!draggingId) return;
                    e.preventDefault(); // allow drop
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                    if (dragOverId !== slide.id) setDragOverId(slide.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverId === slide.id) setDragOverId(null);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const fromId = draggingId;
                    setDraggingId(null);
                    setDragOverId(null);
                    if (!fromId || !onReorderSlides || fromId === slide.id) return;
                    const ids = deck.slides.map((s) => s.id);
                    const next = reorderIds(ids, fromId, slide.id);
                    if (next.join() === ids.join()) return;
                    await onReorderSlides(next);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOverId(null);
                  }}
                >
                  <button
                    type="button"
                    className="slide-panel__select"
                    aria-label={`Select slide ${num}`}
                    aria-current={slide.id === selectedSlideId ? 'true' : undefined}
                    onClick={() => onSelectSlide(slide.id)}
                  >
                    <span className="slide-panel__num">{num}</span>
                    <SlideThumbnail slide={slide} />
                    <span className="slide-panel__type">{slide.type}</span>
                  </button>
                  {onUpdateSlide && slide.duration && (
                    <DurationField slide={slide} onUpdateSlide={onUpdateSlide} />
                  )}
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
        <div className="slide-panel__add-row">
          <button
            type="button"
            className="slide-panel__add"
            aria-label="Add slide"
            onClick={() => onAddSlide()}
          >
            + Add Slide
          </button>
          <button
            type="button"
            className="slide-panel__add slide-panel__add--image"
            aria-label="Add image"
            onClick={() => onAddImageSlide()}
          >
            + Add Image
          </button>
          {onAddVideoSlide && (
            <button
              type="button"
              className="slide-panel__add slide-panel__add--video"
              aria-label="Add video"
              onClick={() => onAddVideoSlide()}
            >
              + Add Video
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <aside className="slide-panel" aria-label="Slides">
      {body}
    </aside>
  );
}
