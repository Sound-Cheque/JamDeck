import { useRef, useState } from 'react';

async function readJson(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function uploadImage(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/media', { method: 'POST', body: fd });
  const body = await readJson(res).catch(() => null);
  if (!res.ok) {
    const detail = body?.error ?? `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return body;
}

export function ImageSlideEditor({ slide, onUpdate }) {
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
      const result = await uploadImage(file);
      await onUpdate(slide.id, { content: { src: result.url } });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="image-slide-editor">
      {src ? (
        <figure className="image-slide-editor__figure">
          <img src={src} alt="Slide content" />
        </figure>
      ) : (
        <p className="image-slide-editor__hint">
          Choose an image to display on this slide.
        </p>
      )}

      <label className="image-slide-editor__upload">
        {src ? 'Replace image' : 'Upload image'}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={handleFileChange}
          disabled={busy}
        />
      </label>

      {busy && <p className="image-slide-editor__status">Uploading…</p>}
      {error && (
        <p role="alert" className="image-slide-editor__error">
          {error}
        </p>
      )}
    </div>
  );
}
