import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeckSettings } from './DeckSettings.jsx';

function deck(overrides = {}) {
  return {
    id: 'a',
    name: 'A',
    favorite: false,
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z',
    settings: {
      timingMode: 'duration',
      internalBpm: 120,
      metronomeSounds: { accent: null, beat: null },
      timerStyle: 'backgroundFill',
      countdownBars: 2,
      countdownSeconds: 5,
      loop: false,
      showSlideStrip: true,
      ...overrides,
    },
    slides: [],
  };
}

function renderSettings(props = {}) {
  return render(
    <DeckSettings deck={props.deck ?? deck()} onSave={props.onSave ?? vi.fn()} />,
  );
}

describe('DeckSettings', () => {
  it('renders the timing mode as a radio group reflecting the current value', () => {
    renderSettings({ deck: deck({ timingMode: 'internal' }) });
    expect(screen.getByRole('radio', { name: /ableton link/i })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /internal clock/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /duration only/i })).not.toBeChecked();
  });

  it('renders the timer style as a radio group reflecting the current value', () => {
    renderSettings({ deck: deck({ timerStyle: 'shrinkingBall' }) });
    expect(screen.getByRole('radio', { name: /background fill/i })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /shrinking ball/i })).toBeChecked();
  });

  it('renders numeric fields with current values', () => {
    renderSettings({ deck: deck({ internalBpm: 92, countdownBars: 4, countdownSeconds: 8 }) });
    expect(screen.getByRole('spinbutton', { name: /internal bpm/i })).toHaveValue(92);
    expect(screen.getByRole('spinbutton', { name: /countdown bars/i })).toHaveValue(4);
    expect(screen.getByRole('spinbutton', { name: /countdown seconds/i })).toHaveValue(8);
  });

  it('renders the show-slide-strip and loop checkboxes', () => {
    renderSettings({ deck: deck({ showSlideStrip: false, loop: true }) });
    expect(screen.getByRole('checkbox', { name: /show slide strip/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /loop/i })).toBeChecked();
  });

  it('Save submits a patch with the full edited settings object', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue();
    renderSettings({ onSave });

    await user.click(screen.getByRole('radio', { name: /internal clock/i }));
    const bpm = screen.getByRole('spinbutton', { name: /internal bpm/i });
    await user.clear(bpm);
    await user.type(bpm, '95');
    await user.click(screen.getByRole('checkbox', { name: /loop/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const patch = onSave.mock.calls[0][0];
    expect(patch.settings.timingMode).toBe('internal');
    expect(patch.settings.internalBpm).toBe(95);
    expect(patch.settings.loop).toBe(true);
    // Unchanged keys are still included so the deep-merge has every value:
    expect(patch.settings.timerStyle).toBe('backgroundFill');
    expect(patch.settings.showSlideStrip).toBe(true);
  });

  it('Cancel reverts edits to the persisted values', async () => {
    const user = userEvent.setup();
    renderSettings();

    const bpm = screen.getByRole('spinbutton', { name: /internal bpm/i });
    await user.clear(bpm);
    await user.type(bpm, '60');
    expect(bpm).toHaveValue(60);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('spinbutton', { name: /internal bpm/i })).toHaveValue(120);
  });

  it('rehydrates the form when a different deck is loaded', () => {
    const { rerender } = renderSettings({ deck: deck({ internalBpm: 120 }) });
    expect(screen.getByRole('spinbutton', { name: /internal bpm/i })).toHaveValue(120);

    rerender(<DeckSettings deck={deck({ internalBpm: 88 })} onSave={vi.fn()} />);
    expect(screen.getByRole('spinbutton', { name: /internal bpm/i })).toHaveValue(88);
  });

  describe('metronome sounds', () => {
    function makeFile(name = 'click.wav', type = 'audio/wav') {
      return new File([new Uint8Array([1, 2, 3, 4])], name, { type });
    }

    function stubFetchOk(url = '/media/abc.wav') {
      const fetchMock = vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ url }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('shows "Built-in tone" by default for both kinds', () => {
      renderSettings();
      const states = screen.getAllByText(/built-in tone/i);
      expect(states.length).toBe(2);
    });

    it('uploads to /api/media and stores the returned URL on the draft', async () => {
      const user = userEvent.setup();
      const fetchMock = stubFetchOk('/media/accent-hash.wav');
      const onSave = vi.fn().mockResolvedValue();
      renderSettings({ onSave });

      // Find the accent file input (the one inside the "Accent (beat 1)" row)
      const uploadButtons = screen.getAllByText(/^upload$/i);
      const accentInput = uploadButtons[0].parentElement.querySelector('input[type=file]');
      await user.upload(accentInput, makeFile('accent.wav'));

      // Give the upload promise a tick to settle
      await screen.findByText(/Custom: accent-hash\.wav/);

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/media',
        expect.objectContaining({ method: 'POST' }),
      );

      // Saving should now include the new URL on settings.metronomeSounds
      await user.click(screen.getByRole('button', { name: /save/i }));
      const patch = onSave.mock.calls[0][0];
      expect(patch.settings.metronomeSounds.accent).toBe('/media/accent-hash.wav');

      vi.unstubAllGlobals();
    });

    it('Reset returns a kind to the built-in tone (null)', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue();
      renderSettings({
        deck: deck({ metronomeSounds: { accent: '/media/x.wav', beat: null } }),
        onSave,
      });

      // The first row (accent) should have a Reset button
      const resetButtons = screen.getAllByRole('button', { name: /^reset$/i });
      expect(resetButtons.length).toBe(1);
      await user.click(resetButtons[0]);

      await user.click(screen.getByRole('button', { name: /save/i }));
      const patch = onSave.mock.calls[0][0];
      expect(patch.settings.metronomeSounds.accent).toBeNull();
    });

    it('shows an error if the upload fails', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'too big' }), {
            status: 413,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );
      vi.stubGlobal('fetch', fetchMock);
      renderSettings();

      const uploadButtons = screen.getAllByText(/^upload$/i);
      const beatInput = uploadButtons[1].parentElement.querySelector('input[type=file]');
      await user.upload(beatInput, makeFile('big.wav'));

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toMatch(/too big/);

      vi.unstubAllGlobals();
    });
  });

  describe('deck name', () => {
    it('renders a deck name input pre-filled with the current name', () => {
      renderSettings({ deck: { ...deck(), name: 'Original' } });
      expect(screen.getByRole('textbox', { name: /deck name/i })).toHaveValue('Original');
    });

    it('Save submits a patch including the new name (trimmed)', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue();
      renderSettings({ deck: { ...deck(), name: 'Original' }, onSave });

      const input = screen.getByRole('textbox', { name: /deck name/i });
      await user.clear(input);
      await user.type(input, '  Renamed  ');
      await user.click(screen.getByRole('button', { name: /save/i }));

      expect(onSave).toHaveBeenCalledTimes(1);
      const patch = onSave.mock.calls[0][0];
      expect(patch.name).toBe('Renamed');
      expect(patch.settings).toBeDefined();
    });

    it('does not submit when the name is empty or whitespace', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderSettings({ deck: { ...deck(), name: 'Original' }, onSave });

      const input = screen.getByRole('textbox', { name: /deck name/i });
      await user.clear(input);
      await user.type(input, '   ');
      await user.click(screen.getByRole('button', { name: /save/i }));

      expect(onSave).not.toHaveBeenCalled();
    });

    it('Cancel reverts the name to the persisted value', async () => {
      const user = userEvent.setup();
      renderSettings({ deck: { ...deck(), name: 'Original' } });

      const input = screen.getByRole('textbox', { name: /deck name/i });
      await user.clear(input);
      await user.type(input, 'Half-renamed');
      expect(input).toHaveValue('Half-renamed');

      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.getByRole('textbox', { name: /deck name/i })).toHaveValue('Original');
    });

    it('rehydrates the name input when a different deck is loaded', () => {
      const { rerender } = renderSettings({ deck: { ...deck({}), id: 'a', name: 'First' } });
      expect(screen.getByRole('textbox', { name: /deck name/i })).toHaveValue('First');

      rerender(
        <DeckSettings deck={{ ...deck({}), id: 'b', name: 'Second' }} onSave={vi.fn()} />,
      );
      expect(screen.getByRole('textbox', { name: /deck name/i })).toHaveValue('Second');
    });
  });
});
