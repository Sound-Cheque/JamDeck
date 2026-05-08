import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileSlideEditor } from './MobileSlideEditor.jsx';

function canvasSlide(overrides = {}) {
  return {
    id: 's1',
    type: 'canvas',
    duration: { unit: 'seconds', value: 30 },
    content: { objects: [], background: '#fff' },
    ...overrides,
  };
}

function imageSlide(overrides = {}) {
  return {
    id: 's2',
    type: 'image',
    duration: { unit: 'seconds', value: 10 },
    content: { src: null },
    ...overrides,
  };
}

const settings = { timingMode: 'duration' };

describe('MobileSlideEditor', () => {
  it('renders the slide duration pre-filled', () => {
    render(
      <MobileSlideEditor
        slide={canvasSlide({ duration: { unit: 'seconds', value: 45 } })}
        deckSettings={settings}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Duration value/)).toHaveValue(45);
    expect(screen.getByLabelText(/Duration unit/)).toHaveValue('seconds');
  });

  it('Send submits the whole slide state in one PATCH-shaped payload', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue();
    render(
      <MobileSlideEditor
        slide={canvasSlide()}
        deckSettings={settings}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    const value = screen.getByLabelText(/Duration value/);
    await user.clear(value);
    await user.type(value, '8');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.duration).toEqual({ unit: 'seconds', value: 8 });
    // Content unchanged but still in the payload — last-write-wins semantic
    expect(payload.content).toEqual({ objects: [], background: '#fff' });
  });

  it('Cancel calls onCancel without submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(
      <MobileSlideEditor
        slide={canvasSlide()}
        deckSettings={settings}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows an image upload field for image slides', () => {
    render(
      <MobileSlideEditor
        slide={imageSlide()}
        deckSettings={settings}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/upload image/i)).toBeInTheDocument();
  });

  it('updates the draft content with a new src after a successful upload', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue();
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ url: '/media/abc.jpg' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MobileSlideEditor
        slide={imageSlide()}
        deckSettings={settings}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    const fileInput = screen
      .getByText(/upload image/i)
      .closest('label')
      .querySelector('input[type=file]');
    const file = new File([new Uint8Array([1, 2, 3])], 'pic.jpg', { type: 'image/jpeg' });
    await user.upload(fileInput, file);

    // The image preview should appear with the returned URL
    await screen.findByRole('img', { name: /slide content/i });

    // Send → onSubmit gets the new src in content
    await user.click(screen.getByRole('button', { name: /send/i }));
    expect(onSubmit.mock.calls[0][0].content.src).toBe('/media/abc.jpg');

    vi.unstubAllGlobals();
  });
});
