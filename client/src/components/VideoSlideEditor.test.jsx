import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideoSlideEditor } from './VideoSlideEditor.jsx';

let fetchMock;

function videoSlide(overrides = {}) {
  return {
    id: 'v1',
    type: 'video',
    duration: { unit: 'seconds', value: 30 },
    content: { src: null },
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VideoSlideEditor', () => {
  it('renders an upload prompt for empty video slides', () => {
    render(<VideoSlideEditor slide={videoSlide()} onUpdate={vi.fn()} />);
    expect(screen.getByText(/choose a video file/i)).toBeInTheDocument();
    expect(screen.getByText(/upload video/i)).toBeInTheDocument();
  });

  it('uploads to /api/media and updates slide content with the returned URL', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ url: '/media/clip.mp4' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const onUpdate = vi.fn().mockResolvedValue();
    const user = userEvent.setup();
    render(<VideoSlideEditor slide={videoSlide()} onUpdate={onUpdate} />);

    const fileInput = screen
      .getByText(/upload video/i)
      .closest('label')
      .querySelector('input[type=file]');
    const file = new File([new Uint8Array([0, 0, 0, 32])], 'clip.mp4', {
      type: 'video/mp4',
    });
    await user.upload(fileInput, file);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/media',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(onUpdate).toHaveBeenCalledWith('v1', { content: { src: '/media/clip.mp4' } });
  });

  it('renders a <video> preview when a src is set', () => {
    const { container } = render(
      <VideoSlideEditor
        slide={videoSlide({ content: { src: '/media/clip.mp4' } })}
        onUpdate={vi.fn()}
      />,
    );
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video.getAttribute('src')).toBe('/media/clip.mp4');
    expect(screen.getByText(/replace video/i)).toBeInTheDocument();
  });

  it('shows an error if the upload fails', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'too big' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const user = userEvent.setup();
    render(<VideoSlideEditor slide={videoSlide()} onUpdate={vi.fn()} />);

    const fileInput = screen
      .getByText(/upload video/i)
      .closest('label')
      .querySelector('input[type=file]');
    const file = new File([new Uint8Array([0])], 'clip.mp4', { type: 'video/mp4' });
    await user.upload(fileInput, file);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/too big/);
  });
});
