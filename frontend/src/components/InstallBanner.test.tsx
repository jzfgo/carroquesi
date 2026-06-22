import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallBanner } from './InstallBanner';

const defaults = {
  isInstallable: true,
  isInstalled: false,
  isIOS: false,
  promptInstall: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('InstallBanner', () => {
  it('renders when installable and not dismissed', () => {
    render(<InstallBanner {...defaults} />);
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('does not render when not installable and not iOS', () => {
    render(<InstallBanner {...defaults} isInstallable={false} />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('does not render when already installed', () => {
    render(<InstallBanner {...defaults} isInstalled={true} />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('does not render when pwa-install-dismissed is set in localStorage', () => {
    localStorage.setItem('pwa-install-dismissed', '1');
    render(<InstallBanner {...defaults} />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('dismiss button sets localStorage and removes the banner', async () => {
    render(<InstallBanner {...defaults} />);
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }));
    expect(localStorage.getItem('pwa-install-dismissed')).toBe('1');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('install button calls promptInstall', async () => {
    const promptInstall = vi
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined);
    render(<InstallBanner {...defaults} promptInstall={promptInstall} />);
    await userEvent.click(screen.getByRole('button', { name: /instalar/i }));
    expect(promptInstall).toHaveBeenCalledOnce();
  });

  it('renders iOS instructions when isIOS is true', () => {
    render(<InstallBanner {...defaults} isInstallable={false} isIOS={true} />);
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.getByText(/compartir/i)).toBeInTheDocument();
  });

  it('hides the install button on iOS', () => {
    render(<InstallBanner {...defaults} isInstallable={false} isIOS={true} />);
    expect(
      screen.queryByRole('button', { name: /instalar/i }),
    ).not.toBeInTheDocument();
  });
});
