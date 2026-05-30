import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parseInput } from '../parseInput'
import type { ListItem } from '../types'
import { SmartInputBar } from './SmartInputBar'

const NO_ITEMS: ListItem[] = []
const noop = () => { }

test('renders syntax legend chips', () => {
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.getByText(/\+/)).toBeInTheDocument()   // qty chip
  expect(screen.getByText(/#/)).toBeInTheDocument()    // brand chip
  expect(screen.getByText(/@/)).toBeInTheDocument()    // store chip
})

test('add button is disabled when name is empty', () => {
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.getByRole('button', { name: /^añadir$/i })).toBeDisabled()
})

test('add button is enabled when name is present', () => {
  render(<SmartInputBar value="Leche" parsed={parseInput('Leche')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.getByRole('button', { name: /^añadir$/i })).not.toBeDisabled()
})

test('onChange is called when user types', async () => {
  const onChange = vi.fn()
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={onChange} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  await userEvent.type(screen.getByRole('textbox'), 'L')
  expect(onChange).toHaveBeenCalled()
})

test('onSubmit called when add button clicked', () => {
  const onSubmit = vi.fn()
  render(<SmartInputBar value="Leche" parsed={parseInput('Leche')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={onSubmit} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  fireEvent.click(screen.getByRole('button', { name: /^añadir$/i }))
  expect(onSubmit).toHaveBeenCalledTimes(1)
})

test('parse preview not shown when no sigil detected', () => {
  render(<SmartInputBar value="Leche" parsed={parseInput('Leche')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.queryByTestId('parse-preview')).not.toBeInTheDocument()
})

test('parse preview shown when sigil detected', () => {
  render(<SmartInputBar value="Leche +2" parsed={parseInput('Leche +2')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.getByTestId('parse-preview')).toBeInTheDocument()
})

test('parse preview shows parsed name and quantity', () => {
  render(<SmartInputBar value="Leche +2" parsed={parseInput('Leche +2')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.getByTestId('parse-preview')).toHaveTextContent('Leche')
  expect(screen.getByTestId('parse-preview')).toHaveTextContent('2')
})

test('shows "No item name" warning when input has sigil but no name', () => {
  render(<SmartInputBar value="+3" parsed={parseInput('+3')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.getByText(/sin nombre de producto/i)).toBeInTheDocument()
})

test('suggestion dropdown shown when suggestions provided', () => {
  render(<SmartInputBar value="Le" parsed={parseInput('Le')} items={NO_ITEMS}
    suggestions={[
      { name: 'Leche', brand: 'Puleva', stores: ['Mercadona'] },
      { name: 'Lechuga', brand: null, stores: [] },
    ]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.getByText('Leche')).toBeInTheDocument()
  expect(screen.getByText('Lechuga')).toBeInTheDocument()
})

test('clicking a product suggestion adds it directly with metadata', async () => {
  const onSuggestionAdd = vi.fn()
  const suggestion = { name: 'Leche', brand: 'Puleva', stores: ['Mercadona'] }
  render(<SmartInputBar value="Le" parsed={parseInput('Le')} items={NO_ITEMS}
    suggestions={[suggestion]} onChange={noop} onSubmit={noop} onSuggestionAdd={onSuggestionAdd}
    onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  await userEvent.click(screen.getByRole('button', { name: 'Leche' }))
  expect(onSuggestionAdd).toHaveBeenCalledWith(suggestion)
})

test('tapping a legend chip appends its sigil when not already present', () => {
  const onChange = vi.fn()
  render(<SmartInputBar value="Leche" parsed={parseInput('Leche')} items={NO_ITEMS}
    suggestions={[]} onChange={onChange} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  fireEvent.click(screen.getByRole('button', { name: /añadir marca/i }))
  expect(onChange).toHaveBeenCalledWith('Leche #')
})

test('tapping brand chip is a no-op when # already present', () => {
  const onChange = vi.fn()
  render(<SmartInputBar value="Leche #Puleva" parsed={parseInput('Leche #Puleva')} items={NO_ITEMS}
    suggestions={[]} onChange={onChange} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  fireEvent.click(screen.getByRole('button', { name: /añadir marca/i }))
  expect(onChange).not.toHaveBeenCalled()
})

test('tapping a legend chip on empty input sets value to just the sigil', () => {
  const onChange = vi.fn()
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={onChange} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  fireEvent.click(screen.getByRole('button', { name: /añadir tienda/i }))
  expect(onChange).toHaveBeenCalledWith('@')
})

test('tapping a different chip when input ends with a bare sigil replaces it', () => {
  const onChange = vi.fn()
  render(<SmartInputBar value="Leche #" parsed={parseInput('Leche #')} items={NO_ITEMS}
    suggestions={[]} onChange={onChange} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  fireEvent.click(screen.getByRole('button', { name: /añadir tienda/i }))
  expect(onChange).toHaveBeenCalledWith('Leche @')
})

test('tapping the same chip when input ends with that bare sigil is a no-op', () => {
  const onChange = vi.fn()
  render(<SmartInputBar value="Leche #" parsed={parseInput('Leche #')} items={NO_ITEMS}
    suggestions={[]} onChange={onChange} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  fireEvent.click(screen.getByRole('button', { name: /añadir marca/i }))
  expect(onChange).not.toHaveBeenCalled()
})

test('client-side store suggestions filtered from items when @ typed', () => {
  const items: ListItem[] = [
    {
      id: 'i1', list_id: 'l1', name: 'X', quantity: null, brand: null,
      stores: ['Mercadona'], purchased: false, purchased_at: null, ean: null, price: null, price_per: null, price_store: null, added_by: 'u1', created_at: '', updated_at: ''
    },
    {
      id: 'i2', list_id: 'l1', name: 'Y', quantity: null, brand: null,
      stores: ['Lidl'], purchased: false, purchased_at: null, ean: null, price: null, price_per: null, price_store: null, added_by: 'u1', created_at: '', updated_at: ''
    },
  ]
  render(<SmartInputBar value="Leche @Mer" parsed={parseInput('Leche @Mer')} items={items}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.getByText('Mercadona')).toBeInTheDocument()
  expect(screen.queryByText('Lidl')).not.toBeInTheDocument()
})

test('parse preview shows multiple store chips', () => {
  render(<SmartInputBar value="Leche @Mercadona @Carrefour" parsed={parseInput('Leche @Mercadona @Carrefour')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.getByTestId('parse-preview')).toHaveTextContent('Mercadona')
  expect(screen.getByTestId('parse-preview')).toHaveTextContent('Carrefour')
})

test('tapping tienda chip appends another @ when one is already present', () => {
  const onChange = vi.fn()
  render(<SmartInputBar value="Leche @Mercadona" parsed={parseInput('Leche @Mercadona')} items={NO_ITEMS}
    suggestions={[]} onChange={onChange} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  fireEvent.click(screen.getByRole('button', { name: /añadir tienda/i }))
  expect(onChange).toHaveBeenCalledWith('Leche @Mercadona @')
})

// ── EAN mode ──────────────────────────────────────────────────────────────────

test('| cod. barras chip appears in legend', () => {
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.getByRole('button', { name: /añadir cod\. barras/i })).toBeInTheDocument()
})

test('EAN preview shown when valid EAN parsed', () => {
  render(<SmartInputBar value="|4011200296908" parsed={parseInput('|4011200296908')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.getByTestId('ean-preview')).toBeInTheDocument()
  expect(screen.getByTestId('ean-preview')).toHaveTextContent('4011200296908')
})

test('Buscar button shown in EAN preview', () => {
  render(<SmartInputBar value="|4011200296908" parsed={parseInput('|4011200296908')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.getByRole('button', { name: /buscar producto/i })).toBeInTheDocument()
})

test('Buscar button calls onEanSearch with the EAN', async () => {
  const onEanSearch = vi.fn()
  render(<SmartInputBar value="|4011200296908" parsed={parseInput('|4011200296908')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={onEanSearch} />)
  await userEvent.click(screen.getByRole('button', { name: /buscar producto/i }))
  expect(onEanSearch).toHaveBeenCalledWith('4011200296908')
})

test('Buscar button shows loading state when eanLoading=true', () => {
  render(<SmartInputBar value="|4011200296908" parsed={parseInput('|4011200296908')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} eanLoading={true} />)
  expect(screen.getByRole('button', { name: /buscar producto/i })).toBeDisabled()
})

test('eanError shown in EAN preview', () => {
  render(<SmartInputBar value="|4011200296908" parsed={parseInput('|4011200296908')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} eanError="Código no encontrado" />)
  expect(screen.getByText('Código no encontrado')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /buscar producto/i })).not.toBeInTheDocument()
})

test('add button is disabled in EAN mode', () => {
  render(<SmartInputBar value="|4011200296908" parsed={parseInput('|4011200296908')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.getByRole('button', { name: /^añadir$/i })).toBeDisabled()
})

test('regular parse preview not shown when in EAN mode', () => {
  render(<SmartInputBar value="|4011200296908" parsed={parseInput('|4011200296908')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.queryByTestId('parse-preview')).not.toBeInTheDocument()
})

// ── Clear button ───────────────────────────────────────────────────────────────

test('clear button shown when input has text', () => {
  render(<SmartInputBar value="Leche" parsed={parseInput('Leche')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.getByRole('button', { name: /borrar/i })).toBeInTheDocument()
})

test('scan button not shown when input has text', () => {
  render(<SmartInputBar value="Leche" parsed={parseInput('Leche')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.queryByRole('button', { name: /escanear/i })).not.toBeInTheDocument()
})

test('scan button shown when input is empty', () => {
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.getByRole('button', { name: /escanear/i })).toBeInTheDocument()
})

test('clear button calls onClear', async () => {
  const onClear = vi.fn()
  render(<SmartInputBar value="Leche" parsed={parseInput('Leche')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={onClear} onScanRequest={noop} onEanSearch={noop} />)
  await userEvent.click(screen.getByRole('button', { name: /borrar/i }))
  expect(onClear).toHaveBeenCalled()
})

// ── Own-brand inferred store chip ────────────────────────────────────────────

test('inferredStoreChip renders with --inferred class', () => {
  render(<SmartInputBar value="Leche #Hacendado" parsed={parseInput('Leche #Hacendado')}
    items={NO_ITEMS} suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop}
    onScanRequest={noop} onEanSearch={noop} inferredStoreChip="Mercadona"
    onDismissInferredStore={noop} />)
  const chip = screen.getByTestId('inferred-store-chip')
  expect(chip).toBeInTheDocument()
  expect(chip).toHaveClass('smart-input__suggestion--inferred')
  expect(chip).toHaveTextContent('Mercadona')
})

test('inferredStoreChip renders before regular suggestions', () => {
  // value has no active sigil so the suggestions prop is used as-is
  render(<SmartInputBar value="Le" parsed={parseInput('Le')}
    items={NO_ITEMS} suggestions={[
      { name: 'Leche', brand: null, stores: [] },
      { name: 'Lechuga', brand: null, stores: [] },
    ]} onChange={noop}
    onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop}
    inferredStoreChip="Mercadona" onDismissInferredStore={noop} />)
  const allButtons = screen.getAllByRole('button')
  const chipIndex = allButtons.findIndex(b => b.getAttribute('data-testid') === 'inferred-store-chip')
  const lecheIndex = allButtons.findIndex(b => b.textContent?.includes('Leche'))
  expect(chipIndex).toBeLessThan(lecheIndex)
})

test('tapping inferredStoreChip calls onDismissInferredStore', async () => {
  const onDismiss = vi.fn()
  render(<SmartInputBar value="Leche #Hacendado" parsed={parseInput('Leche #Hacendado')}
    items={NO_ITEMS} suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop}
    onScanRequest={noop} onEanSearch={noop} inferredStoreChip="Mercadona"
    onDismissInferredStore={onDismiss} />)
  await userEvent.click(screen.getByTestId('inferred-store-chip'))
  expect(onDismiss).toHaveBeenCalledTimes(1)
})

test('no inferredStoreChip prop — no extra chip rendered', () => {
  render(<SmartInputBar value="Leche" parsed={parseInput('Leche')}
    items={NO_ITEMS} suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop}
    onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.queryByTestId('inferred-store-chip')).not.toBeInTheDocument()
})

test('inferredStoreChip=null — no extra chip rendered', () => {
  render(<SmartInputBar value="Leche" parsed={parseInput('Leche')}
    items={NO_ITEMS} suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop}
    onScanRequest={noop} onEanSearch={noop} inferredStoreChip={null}
    onDismissInferredStore={noop} />)
  expect(screen.queryByTestId('inferred-store-chip')).not.toBeInTheDocument()
})

test('barcode scan button is disabled when isOffline is true', () => {
  render(
    <SmartInputBar
      value="" parsed={parseInput('')} items={NO_ITEMS}
      suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop}
      onScanRequest={noop} onEanSearch={noop} isOffline={true}
    />,
  )
  expect(screen.getByRole('button', { name: /escanear código de barras/i })).toBeDisabled()
})

test('barcode scan button is enabled when isOffline is false', () => {
  render(
    <SmartInputBar
      value="" parsed={parseInput('')} items={NO_ITEMS}
      suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop}
      onScanRequest={noop} onEanSearch={noop} isOffline={false}
    />,
  )
  expect(screen.getByRole('button', { name: /escanear código de barras/i })).not.toBeDisabled()
})

// ── Due suggestions button ────────────────────────────────────────────────────

test('✨ button renders when dueSuggestionsCount > 0', () => {
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop}
    dueSuggestionsCount={3} onDueSuggestionsOpen={noop} />)
  expect(screen.getByRole('button', { name: /sugerencias pendientes/i })).toBeInTheDocument()
})

test('✨ button absent when dueSuggestionsCount is 0', () => {
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop}
    dueSuggestionsCount={0} onDueSuggestionsOpen={noop} />)
  expect(screen.queryByRole('button', { name: /sugerencias pendientes/i })).not.toBeInTheDocument()
})

test('✨ button absent when dueSuggestionsCount is omitted', () => {
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.queryByRole('button', { name: /sugerencias pendientes/i })).not.toBeInTheDocument()
})

test('✨ button click calls onDueSuggestionsOpen', () => {
  const onDueSuggestionsOpen = vi.fn()
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop}
    dueSuggestionsCount={2} onDueSuggestionsOpen={onDueSuggestionsOpen} />)
  fireEvent.click(screen.getByRole('button', { name: /sugerencias pendientes/i }))
  expect(onDueSuggestionsOpen).toHaveBeenCalledTimes(1)
})
