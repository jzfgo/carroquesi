import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as reactRouter from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as AuthContext from '../contexts/AuthContext';
import * as FeatureFlagsContext from '../contexts/FeatureFlagsContext';
import * as usePWAInstallModule from '../hooks/usePWAInstall';
import * as api from '../lib/api';
import { DashboardScreen } from './DashboardScreen';

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../contexts/FeatureFlagsContext', () => ({
  useFeatureFlags: vi.fn(),
}));
vi.mock('../lib/api');
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: vi.fn().mockReturnValue(vi.fn()),
  };
});
vi.mock('../hooks/usePWAInstall');

const mockGetToken = vi.fn().mockResolvedValue('token');
const mockSignOut = vi.fn().mockResolvedValue(undefined);
let mockNavigate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem('cqs_dashboard_cache_u1');
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    configurable: true,
    writable: true,
  });
  mockNavigate = vi.fn();
  vi.mocked(reactRouter.useNavigate).mockReturnValue(mockNavigate as never);
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: {
      id: 'u1',
      displayName: 'Alice',
      photoUrl: null,
      email: 'alice@example.com',
      features: [],
    },
    getToken: mockGetToken,
    signIn: vi.fn(),
    signOut: mockSignOut,
    loading: false,
    isWaitlisted: false,
  });
  vi.mocked(api.createList).mockResolvedValue({
    id: 'l-new',
    name: 'Nueva',
    emoji: '🍎',
    owner_id: 'u1',
    created_at: '',
    updated_at: '',
    item_count: 0,
    purchased_count: 0,
  } as never);
  vi.mocked(api.updateList).mockResolvedValue({} as never);
  vi.mocked(api.deleteList).mockResolvedValue(null as never);
  vi.mocked(FeatureFlagsContext.useFeatureFlags).mockReturnValue({
    isEnabled: () => false,
  });
  vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
    isInstallable: false,
    isInstalled: false,
    isIOS: false,
    promptInstall: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  });
});

const twoLists = [
  {
    id: 'l1',
    name: 'Mercado',
    emoji: '🛒',
    owner_id: 'u1',
    created_at: '',
    updated_at: '',
    item_count: 8,
    purchased_count: 3,
  },
  {
    id: 'l2',
    name: 'Costco',
    emoji: '🏠',
    owner_id: 'u1',
    created_at: '',
    updated_at: '',
    item_count: 2,
    purchased_count: 0,
  },
];

describe('DashboardScreen', () => {
  it('shows loading spinner while fetching', () => {
    vi.mocked(api.getLists).mockReturnValue(new Promise(() => {}));
    render(<DashboardScreen />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows list cards after successful fetch', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() =>
      expect(screen.getByText('Mercado')).toBeInTheDocument(),
    );
    expect(screen.getByText('Costco')).toBeInTheDocument();
  });

  it('shows progress subtitle on list cards', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() =>
      expect(screen.getByText('3 de 8 comprados')).toBeInTheDocument(),
    );
  });

  it('shows error state when fetch fails', async () => {
    vi.mocked(api.getLists).mockRejectedValue(new Error('Network'));
    render(<DashboardScreen />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /reintentar/i }),
      ).toBeInTheDocument(),
    );
  });

  it('shows create-first-list prompt when no lists', async () => {
    vi.mocked(api.getLists).mockResolvedValue([] as never);
    render(<DashboardScreen />);
    await waitFor(() =>
      expect(screen.getByText(/primera lista/i)).toBeInTheDocument(),
    );
  });

  it('navigates to /lists/:id when a card is tapped', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(screen.getByText('Mercado'));
    expect(mockNavigate).toHaveBeenCalledWith('/lists/l1');
  });

  it('opens avatar menu on avatar click and calls signOut via menu item', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /cerrar sesión/i }));
    expect(mockSignOut).toHaveBeenCalledOnce();
  });
});

describe('DashboardScreen — list management', () => {
  it('tapping ⋯ on a card opens the action sheet for that list', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0]);
    expect(screen.getByText(/renombrar/i)).toBeInTheDocument();
  });

  it('confirming rename updates the list name in the dashboard', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /renombrar/i }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Mercado Nuevo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() =>
      expect(screen.getByText('Mercado Nuevo')).toBeInTheDocument(),
    );
  });

  it('rename failure reverts the name and shows a toast', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    vi.mocked(api.updateList).mockRejectedValue(new Error('Network'));
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /renombrar/i }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Mercado Nuevo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() =>
      expect(screen.getByText('Mercado')).toBeInTheDocument(),
    );
    expect(screen.getByText(/no se pudo renombrar/i)).toBeInTheDocument();
  });

  it('confirming delete removes the list card from the dashboard', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }));
    fireEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }));
    await waitFor(() =>
      expect(screen.queryByText('Mercado')).not.toBeInTheDocument(),
    );
  });

  it('delete failure shows a toast and the list card remains', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    vi.mocked(api.deleteList).mockRejectedValue(new Error('Network'));
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }));
    fireEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }));
    await waitFor(() =>
      expect(screen.getByText(/no se pudo eliminar/i)).toBeInTheDocument(),
    );
    expect(screen.getByText('Mercado')).toBeInTheDocument();
  });

  it('delete option absent when user is not the list owner', async () => {
    const foreignList = { ...twoLists[0], owner_id: 'other-user' };
    vi.mocked(api.getLists).mockResolvedValue([
      foreignList,
      twoLists[1],
    ] as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0]);
    expect(
      screen.queryByRole('button', { name: /eliminar lista/i }),
    ).not.toBeInTheDocument();
  });
});

describe('DashboardScreen — avatar menu and install banner', () => {
  it('avatar menu closes when clicking outside', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('avatar menu closes when Escape is pressed', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('avatar menu shows "Instalar app" when installable', async () => {
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: true,
      isInstalled: false,
      isIOS: false,
      promptInstall: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }));
    expect(
      screen.getByRole('menuitem', { name: /instalar app/i }),
    ).toBeInTheDocument();
  });

  it('avatar menu hides "Instalar app" when not installable and not iOS', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }));
    expect(
      screen.queryByRole('menuitem', { name: /instalar app/i }),
    ).not.toBeInTheDocument();
  });

  it('clicking "Instalar app" calls promptInstall and closes menu', async () => {
    const mockPromptInstall = vi
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined);
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: true,
      isInstalled: false,
      isIOS: false,
      promptInstall: mockPromptInstall,
    });
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /instalar app/i }));
    expect(mockPromptInstall).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders InstallBanner when installable', async () => {
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: true,
      isInstalled: false,
      isIOS: false,
      promptInstall: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('does not render InstallBanner when not installable and not iOS', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('avatar menu hides "Instalar app" when already installed', async () => {
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: true,
      isInstalled: true,
      isIOS: false,
      promptInstall: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }));
    expect(
      screen.queryByRole('menuitem', { name: /instalar app/i }),
    ).not.toBeInTheDocument();
  });

  it('opens feedback sheet from avatar menu with the user email prefilled', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));

    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /enviar feedback/i }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: /enviar feedback/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveValue('alice@example.com');
  });

  it('submits feedback and shows success toast', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    vi.mocked(api.submitFeedback).mockResolvedValue({
      id: 'fb-1',
      created_at: '2026-05-31T10:00:00',
    } as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));

    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /enviar feedback/i }));
    fireEvent.change(screen.getByLabelText(/mensaje/i), {
      target: { value: 'Great app' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));

    await waitFor(() =>
      expect(api.submitFeedback).toHaveBeenCalledWith(mockGetToken, {
        message: 'Great app',
        email: 'alice@example.com',
        source: 'manual',
      }),
    );
    expect(
      screen.queryByRole('dialog', { name: /enviar feedback/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/feedback enviado/i)).toBeInTheDocument();
  });

  it('keeps feedback sheet open and shows failure toast when submit fails', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    vi.mocked(api.submitFeedback).mockRejectedValue(new Error('Network'));
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));

    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /enviar feedback/i }));
    fireEvent.change(screen.getByLabelText(/mensaje/i), {
      target: { value: 'Great app' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/no se pudo enviar el feedback/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('dialog', { name: /enviar feedback/i }),
    ).toBeInTheDocument();
  });
});

describe('DashboardScreen — emoji', () => {
  it('tapping the emoji button opens the EmojiPickerSheet', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(
      screen.getAllByRole('button', { name: /cambiar emoji/i })[0],
    );
    expect(
      screen.getByRole('dialog', { name: /elegir emoji/i }),
    ).toBeInTheDocument();
  });

  it('selecting an emoji closes the sheet and calls updateList', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(
      screen.getAllByRole('button', { name: /cambiar emoji/i })[0],
    );
    fireEvent.click(screen.getByRole('button', { name: '🍎' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /elegir emoji/i }),
      ).not.toBeInTheDocument(),
    );
    expect(vi.mocked(api.updateList)).toHaveBeenCalledWith(
      expect.any(Function),
      'l1',
      { emoji: '🍎' },
    );
  });

  it('emoji update failure reverts and shows toast', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    vi.mocked(api.updateList).mockRejectedValue(new Error('Network'));
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(
      screen.getAllByRole('button', { name: /cambiar emoji/i })[0],
    );
    fireEvent.click(screen.getByRole('button', { name: '🍎' }));
    await waitFor(() =>
      expect(
        screen.getByText(/no se pudo cambiar el emoji/i),
      ).toBeInTheDocument(),
    );
  });

  it('emoji update is applied optimistically before API resolves', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    let resolve!: () => void;
    vi.mocked(api.updateList).mockReturnValue(
      new Promise((r) => {
        resolve = () => r({} as never);
      }),
    );
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));

    // Open the emoji picker for the first list (currently emoji '🛒')
    fireEvent.click(
      screen.getAllByRole('button', { name: /cambiar emoji/i })[0],
    );
    // Select a new emoji
    fireEvent.click(screen.getByRole('button', { name: '🍎' }));

    // Optimistic update: the new emoji should appear immediately before API resolves
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: /cambiar emoji/i })[0],
      ).toHaveTextContent('🍎'),
    );

    // Resolve the API call
    resolve();
  });
});

describe('DashboardScreen — offline', () => {
  it('shows cached lists on network error instead of error state', async () => {
    const cached = [twoLists[0]];
    localStorage.setItem('cqs_dashboard_cache_u1', JSON.stringify(cached));
    vi.mocked(api.getLists).mockRejectedValue(new TypeError('Failed to fetch'));

    render(<DashboardScreen />);
    await waitFor(() =>
      expect(screen.getByText('Mercado')).toBeInTheDocument(),
    );
    expect(
      screen.queryByText('No se pudieron cargar tus listas'),
    ).not.toBeInTheDocument();

    localStorage.removeItem('cqs_dashboard_cache_u1');
  });

  it('shows offline banner when navigator.onLine is false', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
    });
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);

    render(<DashboardScreen />);
    await waitFor(() =>
      expect(screen.getByText(/sin conexión/i)).toBeInTheDocument(),
    );
  });

  it('saves fetched lists to cache', async () => {
    localStorage.removeItem('cqs_dashboard_cache_u1');
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);

    render(<DashboardScreen />);
    await waitFor(() =>
      expect(screen.getByText('Mercado')).toBeInTheDocument(),
    );

    const raw = localStorage.getItem('cqs_dashboard_cache_u1');
    expect(raw).not.toBeNull();
    localStorage.removeItem('cqs_dashboard_cache_u1');
  });
});

describe('DashboardScreen — feature flags', () => {
  it('hides the receipt scan option when AI_RECEIPT_SCANNING is disabled', async () => {
    vi.mocked(FeatureFlagsContext.useFeatureFlags).mockReturnValue({
      isEnabled: (flag) => flag !== 'ai_receipt_scanning',
    });
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0]);
    expect(
      screen.queryByRole('button', { name: /escanear ticket/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the receipt scan option and navigates when AI_RECEIPT_SCANNING is enabled', async () => {
    vi.mocked(FeatureFlagsContext.useFeatureFlags).mockReturnValue({
      isEnabled: (flag) => flag === 'ai_receipt_scanning',
    });
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never);
    render(<DashboardScreen />);
    await waitFor(() => screen.getByText('Mercado'));
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0]);
    const scanBtn = screen.getByRole('button', { name: /escanear ticket/i });
    expect(scanBtn).toBeInTheDocument();
    fireEvent.click(scanBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/lists/l1', {
      state: { openReceiptScan: true },
    });
  });
});
