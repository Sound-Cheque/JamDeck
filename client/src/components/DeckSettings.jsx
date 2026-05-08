import { useEffect, useRef, useState } from 'react';

async function uploadAudioSample(file) {
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

const ACCEPTED_AUDIO =
  'audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/mp3,audio/ogg,audio/webm,audio/mp4,audio/aac';

const TIMING_MODES = [
  { value: 'link', label: 'Ableton Link' },
  { value: 'internal', label: 'Internal Clock' },
  { value: 'duration', label: 'Duration Only' },
];

const TIMER_STYLES = [
  { value: 'backgroundFill', label: 'Background Fill' },
  { value: 'shrinkingBall', label: 'Shrinking Ball' },
];

export function DeckSettings({ deck, onSave }) {
  const [draft, setDraft] = useState(deck.settings);
  const [draftName, setDraftName] = useState(deck.name);
  const [uploadingKind, setUploadingKind] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const accentInputRef = useRef(null);
  const beatInputRef = useRef(null);

  // When the underlying deck changes — e.g. selecting a different deck —
  // re-seed the draft form state from the new deck.
  useEffect(() => {
    setDraft(deck.settings);
    setDraftName(deck.name);
  }, [deck.id, deck.name, deck.settings]);

  const set = (partial) => setDraft((prev) => ({ ...prev, ...partial }));
  const setSound = (kind, url) =>
    setDraft((prev) => ({
      ...prev,
      metronomeSounds: { ...(prev.metronomeSounds ?? {}), [kind]: url },
    }));

  async function handleSoundUpload(kind, event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadingKind(kind);
    try {
      const result = await uploadAudioSample(file);
      setSound(kind, result.url);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploadingKind(null);
      const ref = kind === 'accent' ? accentInputRef : beatInputRef;
      if (ref.current) ref.current.value = '';
    }
  }

  async function handleSave(event) {
    event.preventDefault();
    const trimmedName = draftName.trim();
    if (!trimmedName) return;
    await onSave({ name: trimmedName, settings: draft });
  }

  function handleCancel() {
    setDraft(deck.settings);
    setDraftName(deck.name);
  }

  return (
    <form className="deck-settings" onSubmit={handleSave}>
      <label className="deck-settings__name">
        Deck name
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
        />
      </label>

      <fieldset>
        <legend>Timing mode</legend>
        {TIMING_MODES.map(({ value, label }) => (
          <label key={value}>
            <input
              type="radio"
              name="timingMode"
              value={value}
              checked={draft.timingMode === value}
              onChange={() => set({ timingMode: value })}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <label>
        Internal BPM
        <input
          type="number"
          min={20}
          max={300}
          value={draft.internalBpm}
          onChange={(e) => set({ internalBpm: Number(e.target.value) })}
        />
      </label>

      <fieldset>
        <legend>Timer style</legend>
        {TIMER_STYLES.map(({ value, label }) => (
          <label key={value}>
            <input
              type="radio"
              name="timerStyle"
              value={value}
              checked={draft.timerStyle === value}
              onChange={() => set({ timerStyle: value })}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <label>
        Countdown bars
        <input
          type="number"
          min={0}
          value={draft.countdownBars}
          onChange={(e) => set({ countdownBars: Number(e.target.value) })}
        />
      </label>

      <label>
        Countdown seconds
        <input
          type="number"
          min={0}
          value={draft.countdownSeconds}
          onChange={(e) => set({ countdownSeconds: Number(e.target.value) })}
        />
      </label>

      <label>
        <input
          type="checkbox"
          checked={draft.showSlideStrip}
          onChange={(e) => set({ showSlideStrip: e.target.checked })}
        />
        Show slide strip
      </label>

      <label>
        <input
          type="checkbox"
          checked={draft.loop}
          onChange={(e) => set({ loop: e.target.checked })}
        />
        Loop
      </label>

      <fieldset className="deck-settings__sounds">
        <legend>Metronome sounds</legend>
        {['accent', 'beat'].map((kind) => {
          const url = draft.metronomeSounds?.[kind] ?? null;
          const ref = kind === 'accent' ? accentInputRef : beatInputRef;
          return (
            <div key={kind} className="deck-settings__sound-row">
              <span className="deck-settings__sound-label">
                {kind === 'accent' ? 'Accent (beat 1)' : 'Beat'}
              </span>
              <span className="deck-settings__sound-state">
                {url ? `Custom: ${url.split('/').pop()}` : 'Built-in tone'}
              </span>
              <label className="deck-settings__sound-upload">
                {url ? 'Replace' : 'Upload'}
                <input
                  ref={ref}
                  type="file"
                  accept={ACCEPTED_AUDIO}
                  onChange={(e) => handleSoundUpload(kind, e)}
                  disabled={uploadingKind === kind}
                />
              </label>
              {url && (
                <button
                  type="button"
                  onClick={() => setSound(kind, null)}
                  className="deck-settings__sound-reset"
                >
                  Reset
                </button>
              )}
            </div>
          );
        })}
        {uploadingKind && (
          <p className="deck-settings__sound-status">
            Uploading {uploadingKind}…
          </p>
        )}
        {uploadError && (
          <p role="alert" className="deck-settings__sound-error">
            {uploadError}
          </p>
        )}
      </fieldset>

      <div className="deck-settings__actions">
        <button type="submit">Save</button>
        <button type="button" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
