import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImageSlideEditor } from './ImageSlideEditor.jsx';

let fetchMock;

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderEditor(slide, onUpdate = vi.fn()) {
  render(<ImageSlideEditor slide={slide} onUpdate={onUpdate} />);
  return onUpdate;
}

describe('ImageSlideEditor', () => {
  it('shows an upload prompt when the slide has no src', () => {
    renderEditor({ id: 's', content: {} });
    expect(screen.getByLabelText(/upload image/i)).toBeInTheDocument();
    expect(screen.getByText(/choose an image/i)).toBeInTheDocument();
  });

  it('renders the image when a src is set', () => {
    renderEditor({ id: 's', content: { src: '/media/abc.png' } });
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('/media/abc.png');
  });

  it('uploads the selected file and patches the slide content with the returned url', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { hash: 'h', url: '/media/h.png', mimeType: 'image/png', size: 4 },
        { status: 201 },
      ),
    );

    const onUpdate = renderEditor({ id: 's1', content: {} });
    const file = new File(['data'], 'pic.png', { type: 'image/png' });
    const input = screen.getByLabelText(/upload image/i);

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(onUpdate).toHaveBeenCalledWith('s1', { content: { src: '/media/h.png' } });

    // Verify the request was a POST to /api/media with multipart FormData
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/media',
      expect.objectContaining({ method: 'POST' }),
    );
    const formData = fetchMock.mock.calls[0][1].body;
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get('file')).toBe(file);
  });

  it('shows an error message if the upload fails', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'Unsupported media type: text/plain' }, { status: 415 }),
    );

    const onUpdate = renderEditor({ id: 's', content: {} });
    const input = screen.getByLabelText(/upload image/i);
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'oops.txt', { type: 'text/plain' })] },
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/unsupported/i);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('shows a Replace control when an image is already set', () => {
    renderEditor({ id: 's', content: { src: '/media/abc.png' } });
    expect(screen.getByLabelText(/replace image/i)).toBeInTheDocument();
  });
});
