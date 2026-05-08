import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppSettingsModal } from './AppSettingsModal.jsx';

const baseSettings = { fullscreenMode: 'window', theme: 'auto' };

describe('AppSettingsModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <AppSettingsModal
        open={false}
        settings={baseSettings}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('reflects the current fullscreenMode and theme', () => {
    render(
      <AppSettingsModal
        open
        settings={{ fullscreenMode: 'current', theme: 'dark' }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('radio', { name: /second window/i })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /fullscreen the current window/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^dark$/i })).toBeChecked();
  });

  it('calls onChange with the new fullscreen mode', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <AppSettingsModal open settings={baseSettings} onChange={onChange} onClose={vi.fn()} />,
    );
    await user.click(screen.getByRole('radio', { name: /fullscreen the current window/i }));
    expect(onChange).toHaveBeenCalledWith({ fullscreenMode: 'current' });
  });

  it('calls onChange with the new theme', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <AppSettingsModal open settings={baseSettings} onChange={onChange} onClose={vi.fn()} />,
    );
    await user.click(screen.getByRole('radio', { name: /^dark$/i }));
    expect(onChange).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('clicking the backdrop calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <AppSettingsModal open settings={baseSettings} onChange={vi.fn()} onClose={onClose} />,
    );
    await user.click(container.querySelector('.app-settings-modal__backdrop'));
    expect(onClose).toHaveBeenCalled();
  });
});
