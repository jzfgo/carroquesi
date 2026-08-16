import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import * as AuthContext from '../contexts/AuthContext'
import * as api from '../lib/api'
import type { BackendMember } from '../types'
import { ListMembersSheet } from './ListMembersSheet'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getListMembers: vi.fn(),
    removeMember: vi.fn(),
    createOpenInvite: vi.fn(),
    transferOwnership: vi.fn(),
  }
})

const mockGetToken = vi.fn(async () => 'token')

const ALICE: BackendMember = {
  id: 'lm1',
  user_id: 'u1',
  list_id: 'l1',
  display_name: 'Alice',
  photo_url: null,
  created_at: '',
}
const BOB: BackendMember = {
  id: 'lm2',
  user_id: 'u2',
  list_id: 'l1',
  display_name: 'Bob',
  photo_url: null,
  created_at: '',
}
const CAROL: BackendMember = {
  id: 'lm3',
  user_id: 'u3',
  list_id: 'l1',
  display_name: 'Carol',
  photo_url: null,
  created_at: '',
}

function makeMembers(count: number): BackendMember[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `lm${i}`,
    user_id: `u${i}`,
    list_id: 'l1',
    display_name: `User ${i}`,
    photo_url: null,
    created_at: '',
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: {
      id: 'u1',
      displayName: 'Alice',
      photoUrl: null,
      email: 'alice@example.com',
      features: [],
      receiptConsent: null,
    },
    getToken: mockGetToken,
    signIn: vi.fn(),
    signOut: vi.fn(),
    loading: false,
    isWaitlisted: false,
    recordReceiptConsent: vi.fn(),
  })
})

test('shows spinner while loading', () => {
  vi.mocked(api.getListMembers).mockReturnValue(new Promise(() => {}))
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument()
})

test('shows error and retry button when fetch fails', async () => {
  vi.mocked(api.getListMembers).mockRejectedValue(new Error('net'))
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  expect(await screen.findByText(/no se pudieron cargar/i)).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /reintentar/i }),
  ).toBeInTheDocument()
})

test('renders member list after fetch', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  expect(await screen.findByText(/Alice/)).toBeInTheDocument()
  expect(screen.getByText('Bob')).toBeInTheDocument()
})

test('header says how many of the five seats are taken', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB, CAROL])
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  expect(await screen.findByText('3 de 5')).toBeInTheDocument()
})

test('invite footer says how many still fit', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB, CAROL])
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  expect(
    await screen.findByText(
      'Quien abra el enlace entra en esta lista. Caben 2 más.',
    ),
  ).toBeInTheDocument()
})

test('invite footer uses the singular when one seat is left', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue(makeMembers(4))
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u0"
      ownerId="u0"
      onClose={vi.fn()}
    />,
  )
  expect(
    await screen.findByText(
      'Quien abra el enlace entra en esta lista. Cabe 1 más.',
    ),
  ).toBeInTheDocument()
})

test('a full list hides the invite button and says the list is full', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue(makeMembers(5))
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u0"
      ownerId="u0"
      onClose={vi.fn()}
    />,
  )
  expect(await screen.findByText('La lista está completa.')).toBeInTheDocument()
  expect(screen.getByText('5 de 5')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /copiar enlace/i }),
  ).not.toBeInTheDocument()
})

test('the owner row carries the crown badge', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  const aliceName = await screen.findByText('Alice')
  expect(within(aliceName).getByText('Propietario')).toBeInTheDocument()
})

test('a non-owner viewer still sees the crown on the owner row', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u2"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  const aliceName = await screen.findByText('Alice')
  expect(within(aliceName).getByText('Propietario')).toBeInTheDocument()
  expect(within(screen.getByText('Bob')).queryByText('Propietario')).toBeNull()
})

test('sole owner sees neither Quitar nor Salir', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  await screen.findByText(/Alice/)
  expect(
    screen.queryByRole('button', { name: /quitar/i }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /salir de esta lista/i }),
  ).not.toBeInTheDocument()
})

test('owner row has no Quitar button', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  await screen.findByText(/Alice/)
  expect(
    screen.queryByRole('button', { name: /quitar a alice/i }),
  ).not.toBeInTheDocument()
})

test('owner sees Quitar on other members', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  expect(
    await screen.findByRole('button', { name: /quitar a bob/i }),
  ).toBeInTheDocument()
})

test('non-owner sees Salir below the divider and no Quitar anywhere', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u2"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  expect(
    await screen.findByRole('button', { name: /salir de esta lista/i }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /quitar/i }),
  ).not.toBeInTheDocument()
})

test('Quitar asks first, and confirming removes the member', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  vi.mocked(api.removeMember).mockResolvedValue(null)
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: /quitar a bob/i }))
  expect(screen.getByText('¿Quitar a Bob de la lista?')).toBeInTheDocument()
  expect(api.removeMember).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /sí, quitar/i }))
  await waitFor(() => expect(screen.queryByText('Bob')).not.toBeInTheDocument())
  expect(api.removeMember).toHaveBeenCalledWith(mockGetToken, 'l1', 'u2')
})

test('cancelling the Quitar confirmation keeps the member', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: /quitar a bob/i }))
  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
  expect(screen.getByText('Bob')).toBeInTheDocument()
  expect(api.removeMember).not.toHaveBeenCalled()
})

test('ESC from the Quitar confirmation goes back without closing', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  const onClose = vi.fn()
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={onClose}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: /quitar a bob/i }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.getByText('Bob')).toBeInTheDocument()
  expect(
    screen.queryByText('¿Quitar a Bob de la lista?'),
  ).not.toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
})

test('Salir removes the current user from the list', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  vi.mocked(api.removeMember).mockResolvedValue(null)
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u2"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  fireEvent.click(
    await screen.findByRole('button', { name: /salir de esta lista/i }),
  )
  await waitFor(() => expect(screen.queryByText('Bob')).not.toBeInTheDocument())
  expect(api.removeMember).toHaveBeenCalledWith(mockGetToken, 'l1', 'u2')
})

test('a successful Salir reports onLeft', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  vi.mocked(api.removeMember).mockResolvedValue(null)
  const onLeft = vi.fn()
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u2"
      ownerId="u1"
      onClose={vi.fn()}
      onLeft={onLeft}
    />,
  )
  fireEvent.click(
    await screen.findByRole('button', { name: /salir de esta lista/i }),
  )
  await waitFor(() => expect(onLeft).toHaveBeenCalled())
})

test('removing another member never reports onLeft', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  vi.mocked(api.removeMember).mockResolvedValue(null)
  const onLeft = vi.fn()
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
      onLeft={onLeft}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: /quitar a bob/i }))
  fireEvent.click(screen.getByRole('button', { name: /sí, quitar/i }))
  await waitFor(() => expect(api.removeMember).toHaveBeenCalled())
  expect(onLeft).not.toHaveBeenCalled()
})

test('a 404 on remove reports onListSuspect', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  vi.mocked(api.removeMember).mockRejectedValue(new api.ApiError(404, 'gone'))
  const onListSuspect = vi.fn()
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u2"
      ownerId="u1"
      onClose={vi.fn()}
      onListSuspect={onListSuspect}
    />,
  )
  fireEvent.click(
    await screen.findByRole('button', { name: /salir de esta lista/i }),
  )
  await waitFor(() => expect(onListSuspect).toHaveBeenCalled())
})

test('remove failure reverts member list and shows toast', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  vi.mocked(api.removeMember).mockRejectedValue(new Error('fail'))
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: /quitar a bob/i }))
  fireEvent.click(screen.getByRole('button', { name: /sí, quitar/i }))
  expect(await screen.findByText('Bob')).toBeInTheDocument()
  expect(screen.getByText(/no se pudo quitar/i)).toBeInTheDocument()
})

test('a stray 409 on self-leave explains the transfer requirement', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  vi.mocked(api.removeMember).mockRejectedValue(
    new api.ApiError(409, 'Transfer ownership before leaving'),
  )
  const onListSuspect = vi.fn()
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u2"
      ownerId="u1"
      onClose={vi.fn()}
      onListSuspect={onListSuspect}
    />,
  )
  fireEvent.click(
    await screen.findByRole('button', { name: /salir de esta lista/i }),
  )
  expect(
    await screen.findByText(
      'Transfiere la propiedad antes de salir de la lista.',
    ),
  ).toBeInTheDocument()
  expect(screen.getByText('Bob')).toBeInTheDocument()
  expect(onListSuspect).not.toHaveBeenCalled()
})

test('owner Salir opens the transfer picker, then transfers and leaves', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB, CAROL])
  vi.mocked(api.transferOwnership).mockResolvedValue(null)
  vi.mocked(api.removeMember).mockResolvedValue(null)
  const onLeft = vi.fn()
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
      onLeft={onLeft}
    />,
  )
  fireEvent.click(
    await screen.findByRole('button', { name: /salir de esta lista/i }),
  )
  expect(
    screen.getByText('Antes de salir, elige quién se queda como propietario.'),
  ).toBeInTheDocument()
  expect(api.removeMember).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Bob' }))
  await waitFor(() => expect(onLeft).toHaveBeenCalled())
  expect(api.transferOwnership).toHaveBeenCalledWith(mockGetToken, 'l1', 'u2')
  expect(api.removeMember).toHaveBeenCalledWith(mockGetToken, 'l1', 'u1')
})

test('cancelling the transfer picker goes back to the member list', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  fireEvent.click(
    await screen.findByRole('button', { name: /salir de esta lista/i }),
  )
  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
  expect(await screen.findByText('Bob')).toBeInTheDocument()
  expect(api.transferOwnership).not.toHaveBeenCalled()
})

test('a failed transfer leaves membership untouched', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  vi.mocked(api.transferOwnership).mockRejectedValue(new Error('fail'))
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  fireEvent.click(
    await screen.findByRole('button', { name: /salir de esta lista/i }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Bob' }))
  expect(
    await screen.findByText('No se pudo transferir la propiedad'),
  ).toBeInTheDocument()
  expect(api.removeMember).not.toHaveBeenCalled()
  const aliceName = await screen.findByText('Alice')
  expect(within(aliceName).getByText('Propietario')).toBeInTheDocument()
})

test('transfer succeeds but leave fails: toast, refetch, crown moves', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  vi.mocked(api.transferOwnership).mockResolvedValue(null)
  vi.mocked(api.removeMember).mockRejectedValue(new Error('fail'))
  const onLeft = vi.fn()
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
      onLeft={onLeft}
    />,
  )
  fireEvent.click(
    await screen.findByRole('button', { name: /salir de esta lista/i }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Bob' }))
  expect(
    await screen.findByText(
      'La lista ya tiene nuevo propietario, pero no se pudo salir. Inténtalo de nuevo.',
    ),
  ).toBeInTheDocument()
  expect(onLeft).not.toHaveBeenCalled()
  expect(api.getListMembers).toHaveBeenCalledTimes(2)
  const bobName = await screen.findByText('Bob')
  expect(within(bobName).getByText('Propietario')).toBeInTheDocument()
  expect(
    within(screen.getByText('Alice')).queryByText('Propietario'),
  ).toBeNull()
})

test('copy invite success writes to clipboard and shows toast', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  vi.mocked(api.createOpenInvite).mockResolvedValue({ id: 'inv-123' })
  const writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    writable: true,
    configurable: true,
  })
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: /copiar enlace/i }))
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('/i/inv-123'),
    ),
  )
  expect(await screen.findByText(/enlace copiado/i)).toBeInTheDocument()
})

test('invite limit reached shows message and disables button', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  vi.mocked(api.createOpenInvite).mockRejectedValue(
    new api.ApiError(429, 'Too many'),
  )
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: /copiar enlace/i }))
  expect(await screen.findByText(/límite de invitaciones/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /copiar enlace/i })).toBeDisabled()
})

test('a failed invite says so instead of staying silent', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  vi.mocked(api.createOpenInvite).mockRejectedValue(
    new api.ApiError(500, 'boom'),
  )
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: /copiar enlace/i }))
  expect(
    await screen.findByText(/no se pudo crear el enlace/i),
  ).toBeInTheDocument()
})

test('a 403 on invite reports onListSuspect', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  vi.mocked(api.createOpenInvite).mockRejectedValue(
    new api.ApiError(403, 'forbidden'),
  )
  const onListSuspect = vi.fn()
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
      onListSuspect={onListSuspect}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: /copiar enlace/i }))
  await waitFor(() => expect(onListSuspect).toHaveBeenCalled())
})

test('clipboard unavailable shows fallback URL input', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  vi.mocked(api.createOpenInvite).mockResolvedValue({ id: 'inv-456' })
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: vi.fn(() => Promise.reject(new Error('no clipboard'))),
    },
    writable: true,
    configurable: true,
  })
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={vi.fn()}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: /copiar enlace/i }))
  expect(
    await screen.findByRole('textbox', { name: /enlace de invitación/i }),
  ).toBeInTheDocument()
})

test('ESC key calls onClose', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  const onClose = vi.fn()
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={onClose}
    />,
  )
  await screen.findByText(/Alice/)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})

test('tapping the scrim calls onClose', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  const onClose = vi.fn()
  render(
    <ListMembersSheet
      listId="l1"
      currentUserId="u1"
      ownerId="u1"
      onClose={onClose}
    />,
  )
  await screen.findByText(/Alice/)
  fireEvent.click(document.querySelector('.modal-sheet-scrim')!)
  expect(onClose).toHaveBeenCalled()
})
