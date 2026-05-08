// Video slide editor — mirrors ImageSlideEditor structure: empty state with
// an Upload button, populated state showing a <video> preview with controls
// and a Replace button. Uploads round-trip through /api/media; the slide's
// content.src is set to the returned URL.

import { useRef, useState } from 'react';

const ACCEPT = 'video/mp4,video/webm,video/quicktime,video/ogg';

async function uploadVideo(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/media', { method: 'POST', body: fd });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return body;
}

export function VideoSlideEditor({ slide, onUpdate }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const src = slide.content?.src ?? null;

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const result = await uploadVideo(file);
      await onUpdate(slide.id, { content: { src: result.url } });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="video-slide-editor">
      {src ? (
        <figure className="video-slide-editor__figure">
          {/* preload metadata so the player is responsive without grabbing
              the whole file up front. The host previews via the <video>
              element's native controls; PlaybackView handles autoplay. */}
          <video src={src} controls preload="metadata" />
        </figure>
      ) : (
        <p className="video-slide-editor__hint">
          Choose a video file to attach to this slide.
        </p>
      )}

      <label className="video-slide-editor__upload">
        {src ? 'Replace video' : 'Upload video'}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={handleFileChange}
          disabled={busy}
        />
      </label>

      {busy && <p className="video-slide-editor__status">Uploading…</p>}
      {error && (
        <p role="alert" className="video-slide-editor__error">
          {error}
        </p>
      )}
    </div>
  );
}
