import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DashboardScreen } from './DashboardScreen'
import * as AuthContext from '../contexts/AuthContext'
import * as api from '../lib/api'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/api')
vi.mock('./ListScreen', () => ({
  ListScreen: ({ listId, listName, onBack }: { listId: string; listName: string; onBack: () => void }) => (
    <div>
      <span>ListScreen:{listId}:{listName}</span>
      <button onClick={onBack}>Volver</button>
    </div>
  ),
}))
import * as reactRouter from 'react-router-dom'
vi.mock('react-router-dom', () => ({
  useLocation: vi.fn().mockReturnValue({ state: null }),
}))
import * as usePWAInstallModule from '../hooks/usePWAInstall'
vi.mock('../hooks/usePWAInstall')

const mockGetToken = vi.fn().mockResolvedValue('token')
const mockSignOut = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: { id: 'u1', displayName: 'Alice', photoUrl: null, email: 'alice@example.com' },
    getToken: mockGetToken,
    signIn: vi.fn(),
    signOut: mockSignOut,
    loading: false,
  })
  vi.mocked(api.createList).mockResolvedValue({
    id: 'l-new', name: 'Nueva', owner_id: 'u1',
    created_at: '', updated_at: '', item_count: 0, purchased_count: 0,
  } as never)
  vi.mocked(api.renameList).mockResolvedValue({} as never)
  vi.mocked(api.deleteList).mockResolvedValue(null as never)
  vi.mocked(reactRouter.useLocation).mockReturnValue({ state: null } as never)
  vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
    isInstallable: false,
    isInstalled: false,
    isIOS: false,
    promptInstall: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  })
})

const twoLists = [
  { id: 'l1', name: 'Mercado', owner_id: 'u1', created_at: '', updated_at: '', item_count: 8, purchased_count: 3 },
  { id: 'l2', name: 'Costco', owner_id: 'u1', created_at: '', updated_at: '', item_count: 2, purchased_count: 0 },
]

describe('DashboardScreen', () => {
  it('shows loading spinner while fetching', () => {
    vi.mocked(api.getLists).mockReturnValue(new Promise(() => {}))
    render(<DashboardScreen />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows list cards after successful fetch', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())
    expect(screen.getByText('Costco')).toBeInTheDocument()
  })

  it('shows progress subtitle on list cards', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('3 de 8 comprados')).toBeInTheDocument())
  })

  it('shows error state when fetch fails', async () => {
    vi.mocked(api.getLists).mockRejectedValue(new Error('Network'))
    render(<DashboardScreen />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument(),
    )
  })

  it('shows create-first-list prompt when no lists', async () => {
    vi.mocked(api.getLists).mockResolvedValue([] as never)
    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText(/primera lista/i)).toBeInTheDocument())
  })

  it('navigates into a list and passes its name when a card is tapped', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByText('Mercado'))
    expect(screen.getByText('ListScreen:l1:Mercado')).toBeInTheDocument()
  })

  it('returns to dashboard when onBack is called from ListScreen', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /volver/i }))
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())
  })

  it('opens avatar menu on avatar click and calls signOut via menu item', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /cerrar sesión/i }))
    expect(mockSignOut).toHaveBeenCalledOnce()
  })

  it('auto-opens a list when openListId is passed via router state', async () => {
    vi.mocked(reactRouter.useLocation).mockReturnValue({ state: { openListId: 'l2' } } as never)
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() =>
      expect(screen.getByText('ListScreen:l2:Costco')).toBeInTheDocument()
    )
  })
})

describe('DashboardScreen — list management', () => {
  it('tapping ⋯ on a card opens the action sheet for that list', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0])
    expect(screen.getByText(/renombrar/i)).toBeInTheDocument()
  })

  it('confirming rename updates the list name in the dashboard', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Mercado Nuevo' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(screen.getByText('Mercado Nuevo')).toBeInTheDocument())
  })

  it('rename failure reverts the name and shows a toast', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    vi.mocked(api.renameList).mockRejectedValue(new Error('Network'))
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Mercado Nuevo' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())
    expect(screen.getByText(/no se pudo renombrar/i)).toBeInTheDocument()
  })

  it('confirming delete removes the list card from the dashboard', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
    fireEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }))
    await waitFor(() => expect(screen.queryByText('Mercado')).not.toBeInTheDocument())
  })

  it('delete failure shows a toast and the list card remains', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    vi.mocked(api.deleteList).mockRejectedValue(new Error('Network'))
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
    fireEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }))
    await waitFor(() => expect(screen.getByText(/no se pudo eliminar/i)).toBeInTheDocument())
    expect(screen.getByText('Mercado')).toBeInTheDocument()
  })

  it('delete option absent when user is not the list owner', async () => {
    const foreignList = { ...twoLists[0], owner_id: 'other-user' }
    vi.mocked(api.getLists).mockResolvedValue([foreignList, twoLists[1]] as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0])
    expect(screen.queryByRole('button', { name: /eliminar lista/i })).not.toBeInTheDocument()
  })
})

describe('DashboardScreen — avatar menu and install banner', () => {
  it('avatar menu closes when clicking outside', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('avatar menu closes when Escape is pressed', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('avatar menu shows "Instalar app" when installable', async () => {
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: true,
      isInstalled: false,
      isIOS: false,
      promptInstall: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    })
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(screen.getByRole('menuitem', { name: /instalar app/i })).toBeInTheDocument()
  })

  it('avatar menu hides "Instalar app" when not installable and not iOS', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(screen.queryByRole('menuitem', { name: /instalar app/i })).not.toBeInTheDocument()
  })

  it('clicking "Instalar app" calls promptInstall and closes menu', async () => {
    const mockPromptInstall = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: true,
      isInstalled: false,
      isIOS: false,
      promptInstall: mockPromptInstall,
    })
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /instalar app/i }))
    expect(mockPromptInstall).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('renders InstallBanner when installable', async () => {
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: true,
      isInstalled: false,
      isIOS: false,
      promptInstall: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    })
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    expect(screen.getByRole('complementary')).toBeInTheDocument()
  })

  it('does not render InstallBanner when not installable and not iOS', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })
})
