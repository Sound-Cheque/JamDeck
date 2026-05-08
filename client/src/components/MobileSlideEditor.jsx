// Mobile slide editor — simplified, full-screen, single-shot submit.
//
// Per the spec, the mobile editor doesn't sync edits live like the desktop
// canvas does. The user changes things, hits Send, and the whole slide
// (content + duration) goes back to the server in one PATCH. Last-write-wins.
//
// v1 scope: duration editing for every slide type, image upload for image
// slides. On-canvas drawing on a phone screen needs a proper touch flow and
// is deferred to a follow-up; for now we render the existing canvas as
// read-only via SlideThumbnail so the user can still see what they're
// editing the timing for.

import { useEffect, useRef, useState } from 'react';
import { SlideThumbnail } from './SlideThumbnail.jsx';

async function uploadImage(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/media', { method: 'POST', body: fd });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body;
}

export function MobileSlideEditor({ slide, deckSettings, onSubmit, onCancel }) {
  const [draftDuration, setDraftDuration] = useState(slide.duration ?? { unit: 'seconds', value: 30 });
  const [draftContent, setDraftContent] = useState(slide.content ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  // Re-seed when the slide prop swaps (different slide selected).
  useEffect(() => {
    setDraftDuration(slide.duration ?? { unit: 'seconds', value: 30 });
    setDraftContent(slide.content ?? null);
    setError(null);
  }, [slide.id]);

  async function handleImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await uploadImage(file);
      setDraftContent({ ...(draftContent ?? {}), src: result.url });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Send the WHOLE slide-relevant state in one PATCH. This is the
      // explicit "Send" semantic from the spec — last write wins.
      await onSubmit({ duration: draftDuration, content: draftContent });
    } catch (err) {
      setError(err.message ?? 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  // Pick the default unit from the deck's timing mode — bars for link/internal,
  // seconds for duration mode.
  const defaultUnit =
    deckSettings?.timingMode === 'duration' ? 'seconds' : 'bars';

  return (
    <form className="mobile-slide-editor" onSubmit={handleSubmit}>
      <header className="mobile-slide-editor__header">
        <button
          type="button"
          onClick={onCancel}
          className="mobile-slide-editor__cancel"
        >
          Cancel
        </button>
        <h2>Edit slide</h2>
        <button type="submit" disabled={busy} className="mobile-slide-editor__send">
          Send
        </button>
      </header>

      <div className="mobile-slide-editor__preview">
        <SlideThumbnail slide={{ ...slide, content: draftContent }} />
      </div>

      <fieldset className="mobile-slide-editor__duration">
        <legend>Duration</legend>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={draftDuration.value ?? 0}
          onChange={(e) =>
            setDraftDuration((d) => ({
              ...d,
              value: Number(e.target.value),
              unit: d.unit ?? defaultUnit,
            }))
          }
          aria-label="Duration value"
        />
        <select
          value={draftDuration.unit ?? defaultUnit}
          onChange={(e) =>
            setDraftDuration((d) => ({ ...d, unit: e.target.value }))
          }
          aria-label="Duration unit"
        >
          <option value="bars">bars</option>
          <option value="seconds">seconds</option>
        </select>
      </fieldset>

      {slide.type === 'image' && (
        <fieldset className="mobile-slide-editor__image">
          <legend>Image</legend>
          {draftContent?.src ? (
            <img
              src={draftContent.src}
              alt="Slide content"
              className="mobile-slide-editor__image-preview"
            />
          ) : (
            <p>No image yet.</p>
          )}
          <label className="mobile-slide-editor__image-upload">
            {draftContent?.src ? 'Replace image' : 'Upload image'}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleImageChange}
              disabled={busy}
            />
          </label>
        </fieldset>
      )}

      {error && (
        <p role="alert" className="mobile-slide-editor__error">
          {error}
        </p>
      )}
    </form>
  );
}
