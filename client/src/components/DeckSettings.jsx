import { useEffect, useState } from 'react';

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

  // When the underlying deck (or its settings) changes — e.g. selecting a
  // different deck — re-seed the draft form state.
  useEffect(() => {
    setDraft(deck.settings);
  }, [deck.id, deck.settings]);

  const set = (partial) => setDraft((prev) => ({ ...prev, ...partial }));

  async function handleSave(event) {
    event.preventDefault();
    await onSave({ settings: draft });
  }

  function handleCancel() {
    setDraft(deck.settings);
  }

  return (
    <form className="deck-settings" onSubmit={handleSave}>
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

      <div className="deck-settings__actions">
        <button type="submit">Save</button>
        <button type="button" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
