import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parseInput } from '../lib/parseInput'
import type { ListItem } from '../types'
import { SmartInputBar } from './SmartInputBar'

const NO_ITEMS: ListItem[] = []
const noop = () => {}

function renderBar(props: Partial<React.ComponentProps<typeof SmartInputBar>>) {
  return render(
    <SmartInputBar
      value=""
      parsed={parseInput('')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
      {...props}
    />,
  )
}

const field = () => screen.getByRole('textbox', { name: /añadir producto/i })

test('send button is disabled when the text carries no product name', () => {
  // A store sigil alone: there is text (so the send button shows, keyboard
  // down) but nothing to add, so it stays disabled.
  renderBar({ value: '@Mercadona', parsed: parseInput('@Mercadona') })
  expect(screen.getByRole('button', { name: /^añadir$/i })).toBeDisabled()
})

test('add button is enabled when name is present', () => {
  render(
    <SmartInputBar
      value="Leche"
      parsed={parseInput('Leche')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  expect(screen.getByRole('button', { name: /^añadir$/i })).not.toBeDisabled()
})

test('onChange is called when user types', async () => {
  const onChange = vi.fn()
  render(
    <SmartInputBar
      value=""
      parsed={parseInput('')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={onChange}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  await userEvent.type(screen.getByRole('textbox'), 'L')
  expect(onChange).toHaveBeenCalled()
})

test('onSubmit called when add button clicked', () => {
  const onSubmit = vi.fn()
  render(
    <SmartInputBar
      value="Leche"
      parsed={parseInput('Leche')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={onSubmit}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /^añadir$/i }))
  expect(onSubmit).toHaveBeenCalledTimes(1)
})

test('parse preview not shown when no sigil detected', () => {
  render(
    <SmartInputBar
      value="Leche"
      parsed={parseInput('Leche')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  expect(screen.queryByTestId('parse-preview')).not.toBeInTheDocument()
})

test('parse preview shown when sigil detected', () => {
  render(
    <SmartInputBar
      value="Leche +2"
      parsed={parseInput('Leche +2')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  expect(screen.getByTestId('parse-preview')).toBeInTheDocument()
})

test('parse preview shows parsed name and quantity', () => {
  render(
    <SmartInputBar
      value="Leche +2"
      parsed={parseInput('Leche +2')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  expect(screen.getByTestId('parse-preview')).toHaveTextContent('Leche')
  expect(screen.getByTestId('parse-preview')).toHaveTextContent('2')
})

test('shows "No item name" warning when input has sigil but no name', () => {
  render(
    <SmartInputBar
      value="+3"
      parsed={parseInput('+3')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  expect(screen.getByText(/sin nombre de producto/i)).toBeInTheDocument()
})

test('suggestion dropdown shown when suggestions provided', () => {
  render(
    <SmartInputBar
      value="Le"
      parsed={parseInput('Le')}
      items={NO_ITEMS}
      suggestions={[
        { name: 'Leche', brand: 'Puleva', stores: ['Mercadona'] },
        { name: 'Lechuga', brand: null, stores: [] },
      ]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  expect(screen.getByText('Leche')).toBeInTheDocument()
  expect(screen.getByText('Lechuga')).toBeInTheDocument()
})

test('clicking a product suggestion adds it directly with metadata', async () => {
  const onSuggestionAdd = vi.fn()
  const suggestion = { name: 'Leche', brand: 'Puleva', stores: ['Mercadona'] }
  render(
    <SmartInputBar
      value="Le"
      parsed={parseInput('Le')}
      items={NO_ITEMS}
      suggestions={[suggestion]}
      onChange={noop}
      onSubmit={noop}
      onSuggestionAdd={onSuggestionAdd}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Leche' }))
  expect(onSuggestionAdd).toHaveBeenCalledWith(suggestion)
})

test('client-side store suggestions filtered from items when @ typed', () => {
  const items: ListItem[] = [
    {
      id: 'i1',
      list_id: 'l1',
      name: 'X',
      quantity: null,
      purchased_quantity: null,
      brand: null,
      stores: ['Mercadona'],
      purchased: false,
      purchased_at: null,
      purchase_has_receipt: false,
      ean: null,
      price: null,
      price_per: null,
      price_store: null,
      added_by: 'u1',
      created_at: '',
      updated_at: '',
    },
    {
      id: 'i2',
      list_id: 'l1',
      name: 'Y',
      quantity: null,
      purchased_quantity: null,
      brand: null,
      stores: ['Lidl'],
      purchased: false,
      purchased_at: null,
      purchase_has_receipt: false,
      ean: null,
      price: null,
      price_per: null,
      price_store: null,
      added_by: 'u1',
      created_at: '',
      updated_at: '',
    },
  ]
  render(
    <SmartInputBar
      value="Leche @Mer"
      parsed={parseInput('Leche @Mer')}
      items={items}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  expect(screen.getByText('Mercadona')).toBeInTheDocument()
  expect(screen.queryByText('Lidl')).not.toBeInTheDocument()
})

test('parse preview shows multiple store chips', () => {
  render(
    <SmartInputBar
      value="Leche @Mercadona @Carrefour"
      parsed={parseInput('Leche @Mercadona @Carrefour')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  expect(screen.getByTestId('parse-preview')).toHaveTextContent('Mercadona')
  expect(screen.getByTestId('parse-preview')).toHaveTextContent('Carrefour')
})

// ── EAN mode ──────────────────────────────────────────────────────────────────

test('EAN preview shown when valid EAN parsed', () => {
  render(
    <SmartInputBar
      value="|4011200296908"
      parsed={parseInput('|4011200296908')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  expect(screen.getByTestId('ean-preview')).toBeInTheDocument()
  expect(screen.getByTestId('ean-preview')).toHaveTextContent('4011200296908')
})

test('Buscar button shown in EAN preview', () => {
  render(
    <SmartInputBar
      value="|4011200296908"
      parsed={parseInput('|4011200296908')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  expect(
    screen.getByRole('button', { name: /buscar producto/i }),
  ).toBeInTheDocument()
})

test('Buscar button calls onEanSearch with the EAN', async () => {
  const onEanSearch = vi.fn()
  render(
    <SmartInputBar
      value="|4011200296908"
      parsed={parseInput('|4011200296908')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={onEanSearch}
    />,
  )
  await userEvent.click(
    screen.getByRole('button', { name: /buscar producto/i }),
  )
  expect(onEanSearch).toHaveBeenCalledWith('4011200296908')
})

test('Buscar button shows loading state when eanLoading=true', () => {
  render(
    <SmartInputBar
      value="|4011200296908"
      parsed={parseInput('|4011200296908')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
      eanLoading={true}
    />,
  )
  expect(
    screen.getByRole('button', { name: /buscar producto/i }),
  ).toBeDisabled()
})

test('eanError shown in EAN preview', () => {
  render(
    <SmartInputBar
      value="|4011200296908"
      parsed={parseInput('|4011200296908')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
      eanError="Código no encontrado"
    />,
  )
  expect(screen.getByText('Código no encontrado')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /buscar producto/i }),
  ).not.toBeInTheDocument()
})

test('add button is disabled in EAN mode', () => {
  render(
    <SmartInputBar
      value="|4011200296908"
      parsed={parseInput('|4011200296908')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  expect(screen.getByRole('button', { name: /^añadir$/i })).toBeDisabled()
})

test('regular parse preview not shown when in EAN mode', () => {
  render(
    <SmartInputBar
      value="|4011200296908"
      parsed={parseInput('|4011200296908')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  expect(screen.queryByTestId('parse-preview')).not.toBeInTheDocument()
})

// ── Clear button ───────────────────────────────────────────────────────────────

test('clear button shown while typing (keyboard open) with text', () => {
  renderBar({ value: 'Leche', parsed: parseInput('Leche') })
  fireEvent.focus(field())
  expect(screen.getByRole('button', { name: /borrar/i })).toBeInTheDocument()
  // ...and the send button is not there while the keyboard is up.
  expect(
    screen.queryByRole('button', { name: /^añadir$/i }),
  ).not.toBeInTheDocument()
})

test('scan button not shown when input has text', () => {
  render(
    <SmartInputBar
      value="Leche"
      parsed={parseInput('Leche')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  expect(
    screen.queryByRole('button', { name: /escanear/i }),
  ).not.toBeInTheDocument()
})

test('scan button shown when input is empty', () => {
  render(
    <SmartInputBar
      value=""
      parsed={parseInput('')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  expect(screen.getByRole('button', { name: /escanear/i })).toBeInTheDocument()
})

test('clear button calls onClear', async () => {
  const onClear = vi.fn()
  renderBar({ value: 'Leche', parsed: parseInput('Leche'), onClear })
  fireEvent.focus(field())
  await userEvent.click(screen.getByRole('button', { name: /borrar/i }))
  expect(onClear).toHaveBeenCalled()
})

// ── Three-state pill: what you can't do another way right now (5d) ───────────

test('the scanner retires while the keyboard is open', () => {
  renderBar({ value: '', parsed: parseInput('') })
  expect(screen.getByRole('button', { name: /escanear/i })).toBeInTheDocument()
  fireEvent.focus(field())
  expect(
    screen.queryByRole('button', { name: /escanear/i }),
  ).not.toBeInTheDocument()
})

test('keyboard open hides the send button; Enter still submits', () => {
  const onSubmit = vi.fn()
  renderBar({ value: 'Leche', parsed: parseInput('Leche'), onSubmit })
  fireEvent.focus(field())
  expect(
    screen.queryByRole('button', { name: /^añadir$/i }),
  ).not.toBeInTheDocument()
  fireEvent.keyDown(field(), { key: 'Enter' })
  expect(onSubmit).toHaveBeenCalledTimes(1)
})

test('keyboard down with text shows the accent send button, which submits', async () => {
  const onSubmit = vi.fn()
  // Blurred is the default in jsdom — the keyboard-down state.
  renderBar({ value: 'Leche', parsed: parseInput('Leche'), onSubmit })
  const send = screen.getByRole('button', { name: /^añadir$/i })
  expect(send).toBeEnabled()
  await userEvent.click(send)
  expect(onSubmit).toHaveBeenCalledTimes(1)
})

// ── Own-brand inferred store chip ────────────────────────────────────────────

test('inferredStoreChip renders with --inferred class', () => {
  render(
    <SmartInputBar
      value="Leche #Hacendado"
      parsed={parseInput('Leche #Hacendado')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
      inferredStoreChip="Mercadona"
      onDismissInferredStore={noop}
    />,
  )
  const chip = screen.getByTestId('inferred-store-chip')
  expect(chip).toBeInTheDocument()
  expect(chip).toHaveClass('smart-input__suggestion--inferred')
  expect(chip).toHaveTextContent('Mercadona')
})

test('inferredStoreChip renders before regular suggestions', () => {
  // value has no active sigil so the suggestions prop is used as-is
  render(
    <SmartInputBar
      value="Le"
      parsed={parseInput('Le')}
      items={NO_ITEMS}
      suggestions={[
        { name: 'Leche', brand: null, stores: [] },
        { name: 'Lechuga', brand: null, stores: [] },
      ]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
      inferredStoreChip="Mercadona"
      onDismissInferredStore={noop}
    />,
  )
  const allButtons = screen.getAllByRole('button')
  const chipIndex = allButtons.findIndex(
    (b) => b.getAttribute('data-testid') === 'inferred-store-chip',
  )
  const lecheIndex = allButtons.findIndex((b) =>
    b.textContent?.includes('Leche'),
  )
  expect(chipIndex).toBeLessThan(lecheIndex)
})

test('tapping inferredStoreChip calls onDismissInferredStore', async () => {
  const onDismiss = vi.fn()
  render(
    <SmartInputBar
      value="Leche #Hacendado"
      parsed={parseInput('Leche #Hacendado')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
      inferredStoreChip="Mercadona"
      onDismissInferredStore={onDismiss}
    />,
  )
  await userEvent.click(screen.getByTestId('inferred-store-chip'))
  expect(onDismiss).toHaveBeenCalledTimes(1)
})

test('no inferredStoreChip prop — no extra chip rendered', () => {
  render(
    <SmartInputBar
      value="Leche"
      parsed={parseInput('Leche')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
    />,
  )
  expect(screen.queryByTestId('inferred-store-chip')).not.toBeInTheDocument()
})

test('inferredStoreChip=null — no extra chip rendered', () => {
  render(
    <SmartInputBar
      value="Leche"
      parsed={parseInput('Leche')}
      items={NO_ITEMS}
      suggestions={[]}
      onChange={noop}
      onSubmit={noop}
      onClear={noop}
      onScanRequest={noop}
      onEanSearch={noop}
      inferredStoreChip={null}
      onDismissInferredStore={noop}
    />,
  )
  expect(screen.queryByTestId('inferred-store-chip')).not.toBeInTheDocument()
})
