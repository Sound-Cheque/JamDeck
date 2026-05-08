// App-level settings modal — distinct from the per-deck DeckSettings panel.
// Currently exposes fullscreen mode + theme; both stored in localStorage
// via useAppSettings.

export function AppSettingsModal({ open, settings, onChange, onClose }) {
  if (!open) return null;
  return (
    <div className="app-settings-modal" role="dialog" aria-modal="true" aria-label="App settings">
      <div className="app-settings-modal__backdrop" onClick={onClose} />
      <div className="app-settings-modal__panel">
        <header className="app-settings-modal__header">
          <h2>App settings</h2>
          <button
            type="button"
            className="app-settings-modal__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <fieldset className="app-settings-modal__group">
          <legend>Fullscreen</legend>
          <label>
            <input
              type="radio"
              name="fullscreenMode"
              value="window"
              checked={settings.fullscreenMode === 'window'}
              onChange={() => onChange({ fullscreenMode: 'window' })}
            />
            Open in a second window
          </label>
          <label>
            <input
              type="radio"
              name="fullscreenMode"
              value="current"
              checked={settings.fullscreenMode === 'current'}
              onChange={() => onChange({ fullscreenMode: 'current' })}
            />
            Fullscreen the current window
          </label>
        </fieldset>

        <fieldset className="app-settings-modal__group">
          <legend>Theme</legend>
          {[
            { value: 'auto', label: 'Match system' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ].map(({ value, label }) => (
            <label key={value}>
              <input
                type="radio"
                name="theme"
                value={value}
                checked={settings.theme === value}
                onChange={() => onChange({ theme: value })}
              />
              {label}
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  );
}
