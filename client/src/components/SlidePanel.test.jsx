import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SlidePanel } from './SlidePanel.jsx';

function deck(overrides = {}) {
  return {
    id: 'a',
    name: 'My Deck',
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
    },
    slides: [],
    ...overrides,
  };
}

function renderPanel(props = {}) {
  return render(
    <SlidePanel
      deck={props.deck ?? null}
      loading={props.loading ?? false}
      error={props.error ?? null}
      selectedSlideId={props.selectedSlideId ?? null}
      onUpdate={props.onUpdate ?? vi.fn()}
      onAddSlide={props.onAddSlide ?? vi.fn()}
      onAddImageSlide={props.onAddImageSlide ?? vi.fn()}
      onDeleteSlide={props.onDeleteSlide ?? vi.fn()}
      onSelectSlide={props.onSelectSlide ?? vi.fn()}
      onReorderSlides={props.onReorderSlides}
    />,
  );
}

function slide(overrides = {}) {
  return {
    id: overrides.id ?? 's1',
    type: overrides.type ?? 'canvas',
    duration: overrides.duration ?? { unit: 'seconds', value: 30 },
    content: overrides.content ?? { objects: [], background: '#ffffff' },
  };
}

describe('SlidePanel', () => {
  it('shows a hint when no deck is selected', () => {
    renderPanel();
    expect(screen.getByText(/select a deck/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deck settings/i })).not.toBeInTheDocument();
  });

  it('shows a loading state while a deck is being fetched', () => {
    renderPanel({ loading: true });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows the deck name and a settings cog when a deck is loaded', () => {
    renderPanel({ deck: deck({ name: 'My Deck' }) });
    expect(screen.getByRole('heading', { name: /my deck/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deck settings/i })).toBeInTheDocument();
  });

  it('toggles the settings panel open and closed via the cog', async () => {
    const user = userEvent.setup();
    renderPanel({ deck: deck() });

    const cog = screen.getByRole('button', { name: /deck settings/i });
    expect(cog).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: /timing mode/i })).not.toBeInTheDocument();

    await user.click(cog);
    expect(cog).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: /timing mode/i })).toBeInTheDocument();

    await user.click(cog);
    expect(cog).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: /timing mode/i })).not.toBeInTheDocument();
  });

  it('forwards Save from settings to onUpdate', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue();
    renderPanel({ deck: deck(), onUpdate });

    await user.click(screen.getByRole('button', { name: /deck settings/i }));
    await user.click(screen.getByRole('radio', { name: /internal clock/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].settings.timingMode).toBe('internal');
  });

  it('shows a deck-load error when present', () => {
    renderPanel({ error: 'Failed to load deck: HTTP 500' });
    expect(screen.getByRole('alert')).toHaveTextContent(/failed to load/i);
  });

  it('renders a slide-list placeholder when a deck has no slides', () => {
    renderPanel({ deck: deck({ slides: [] }) });
    expect(screen.getByText(/no slides yet/i)).toBeInTheDocument();
  });

  it('always shows an Add Slide button when a deck is loaded', () => {
    renderPanel({ deck: deck({ slides: [] }) });
    expect(screen.getByRole('button', { name: /^add slide$/i })).toBeInTheDocument();
  });

  it('does not show Add Slide when no deck is loaded', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: /^add slide$/i })).not.toBeInTheDocument();
  });

  it('clicking Add Slide calls onAddSlide', async () => {
    const user = userEvent.setup();
    const onAddSlide = vi.fn().mockResolvedValue();
    renderPanel({ deck: deck({ slides: [] }), onAddSlide });

    await user.click(screen.getByRole('button', { name: /^add slide$/i }));
    expect(onAddSlide).toHaveBeenCalledTimes(1);
  });

  it('always shows an Add Image button when a deck is loaded', () => {
    renderPanel({ deck: deck({ slides: [] }) });
    expect(screen.getByRole('button', { name: /add image/i })).toBeInTheDocument();
  });

  it('clicking Add Image calls onAddImageSlide', async () => {
    const user = userEvent.setup();
    const onAddImageSlide = vi.fn().mockResolvedValue();
    renderPanel({ deck: deck({ slides: [] }), onAddImageSlide });
    await user.click(screen.getByRole('button', { name: /add image/i }));
    expect(onAddImageSlide).toHaveBeenCalledTimes(1);
  });

  describe('with slides', () => {
    const slides = [slide({ id: 's1' }), slide({ id: 's2' }), slide({ id: 's3' })];

    it('renders one selectable row per slide', () => {
      renderPanel({ deck: deck({ slides }) });
      expect(screen.getByRole('button', { name: /select slide 1/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /select slide 2/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /select slide 3/i })).toBeInTheDocument();
    });

    it('marks the selected slide with aria-current', () => {
      renderPanel({ deck: deck({ slides }), selectedSlideId: 's2' });
      expect(screen.getByRole('button', { name: /select slide 2/i })).toHaveAttribute(
        'aria-current',
        'true',
      );
      expect(screen.getByRole('button', { name: /select slide 1/i })).not.toHaveAttribute(
        'aria-current',
        'true',
      );
    });

    it('clicking a slide row calls onSelectSlide with its id', async () => {
      const user = userEvent.setup();
      const onSelectSlide = vi.fn();
      renderPanel({ deck: deck({ slides }), onSelectSlide });
      await user.click(screen.getByRole('button', { name: /select slide 2/i }));
      expect(onSelectSlide).toHaveBeenCalledWith('s2');
    });

    it('clicking delete on a row calls onDeleteSlide and not onSelectSlide', async () => {
      const user = userEvent.setup();
      const onDeleteSlide = vi.fn().mockResolvedValue();
      const onSelectSlide = vi.fn();
      renderPanel({ deck: deck({ slides }), onDeleteSlide, onSelectSlide });

      await user.click(screen.getByRole('button', { name: /delete slide 2/i }));

      expect(onDeleteSlide).toHaveBeenCalledWith('s2');
      expect(onSelectSlide).not.toHaveBeenCalled();
    });

    it('does not show the empty-state placeholder when slides exist', () => {
      renderPanel({ deck: deck({ slides }) });
      expect(screen.queryByText(/no slides yet/i)).not.toBeInTheDocument();
    });
  });

  describe('drag-to-reorder', () => {
    const threeSlides = [
      slide({ id: 's1' }),
      slide({ id: 's2' }),
      slide({ id: 's3' }),
    ];

    function findRow(id) {
      // Each row's <li> wraps the [Select slide N] button — easiest path is
      // to climb from the button up to its <li> ancestor.
      const idx = threeSlides.findIndex((s) => s.id === id);
      const btn = screen.getByRole('button', { name: `Select slide ${idx + 1}` });
      return btn.closest('li');
    }

    function fakeDataTransfer() {
      const store = new Map();
      return {
        effectAllowed: '',
        dropEffect: '',
        setData: (k, v) => store.set(k, v),
        getData: (k) => store.get(k) ?? '',
      };
    }

    it('rows are draggable when onReorderSlides is supplied', () => {
      renderPanel({ deck: deck({ slides: threeSlides }), onReorderSlides: vi.fn() });
      const row = findRow('s1');
      expect(row.getAttribute('draggable')).toBe('true');
    });

    it('rows are NOT draggable when onReorderSlides is omitted', () => {
      renderPanel({ deck: deck({ slides: threeSlides }) });
      const row = findRow('s1');
      // React leaves draggable={false} → renders attribute as "false"
      expect(row.getAttribute('draggable')).toBe('false');
    });

    it('drag-and-drop calls onReorderSlides with the new id order', async () => {
      const onReorderSlides = vi.fn().mockResolvedValue();
      renderPanel({ deck: deck({ slides: threeSlides }), onReorderSlides });

      const { fireEvent } = await import('@testing-library/react');
      const fromRow = findRow('s1');
      const toRow = findRow('s3');
      const dt = fakeDataTransfer();

      fireEvent.dragStart(fromRow, { dataTransfer: dt });
      fireEvent.dragOver(toRow, { dataTransfer: dt });
      fireEvent.drop(toRow, { dataTransfer: dt });

      expect(onReorderSlides).toHaveBeenCalledTimes(1);
      // 's1' moved to 's3's slot — pushes s3 down: ['s2','s1','s3']
      expect(onReorderSlides).toHaveBeenCalledWith(['s2', 's1', 's3']);
    });

    it('dropping on the same row is a no-op', async () => {
      const onReorderSlides = vi.fn();
      renderPanel({ deck: deck({ slides: threeSlides }), onReorderSlides });

      const { fireEvent } = await import('@testing-library/react');
      const row = findRow('s2');
      const dt = fakeDataTransfer();
      fireEvent.dragStart(row, { dataTransfer: dt });
      fireEvent.dragOver(row, { dataTransfer: dt });
      fireEvent.drop(row, { dataTransfer: dt });

      expect(onReorderSlides).not.toHaveBeenCalled();
    });
  });
});
