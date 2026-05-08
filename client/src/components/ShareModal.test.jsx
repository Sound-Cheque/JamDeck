import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareModal } from './ShareModal.jsx';

// Mock the qrcode module so jsdom doesn't choke on canvas drawing.
vi.mock('qrcode', () => ({
  default: { toCanvas: vi.fn().mockResolvedValue(undefined) },
  toCanvas: vi.fn().mockResolvedValue(undefined),
}));

describe('ShareModal', () => {
  it('renders nothing when not open', () => {
    const { container } = render(
      <ShareModal
        open={false}
        onClose={vi.fn()}
        status={{ active: false }}
        busy={false}
        error={null}
        onStart={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows a Start button when open and inactive', async () => {
    const onStart = vi.fn();
    render(
      <ShareModal
        open
        onClose={vi.fn()}
        status={{ active: false }}
        busy={false}
        error={null}
        onStart={onStart}
        onStop={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /start tunnel/i }));
    expect(onStart).toHaveBeenCalled();
  });

  it('renders the share URL with ?mobile=1 appended once active', () => {
    render(
      <ShareModal
        open
        onClose={vi.fn()}
        status={{ active: true, url: 'https://abc.ngrok-free.app' }}
        busy={false}
        error={null}
        onStart={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('https://abc.ngrok-free.app/?mobile=1');
  });

  it('shows a Stop button when active', async () => {
    const onStop = vi.fn();
    render(
      <ShareModal
        open
        onClose={vi.fn()}
        status={{ active: true, url: 'https://x.ngrok-free.app' }}
        busy={false}
        error={null}
        onStart={vi.fn()}
        onStop={onStop}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /stop tunnel/i }));
    expect(onStop).toHaveBeenCalled();
  });

  it('clicking the backdrop calls onClose (does not stop the tunnel)', async () => {
    const onClose = vi.fn();
    const onStop = vi.fn();
    const { container } = render(
      <ShareModal
        open
        onClose={onClose}
        status={{ active: true, url: 'https://x.ngrok-free.app' }}
        busy={false}
        error={null}
        onStart={vi.fn()}
        onStop={onStop}
      />,
    );
    const user = userEvent.setup();
    await user.click(container.querySelector('.share-modal__backdrop'));
    expect(onClose).toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });

  it('renders an error message when supplied', () => {
    render(
      <ShareModal
        open
        onClose={vi.fn()}
        status={{ active: false }}
        busy={false}
        error="ngrok auth failed"
        onStart={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/auth failed/);
  });
});
