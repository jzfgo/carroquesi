import {
  Check,
  ChevronRight,
  Lightbulb,
  RotateCcw,
  ScanBarcode,
  Tag,
  X,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { ApiError, getBarcode, getPriceHistory } from '../lib/api'
import {
  type Catalogue,
  type CatalogueField,
  differingFields,
} from '../lib/catalogueSuggestions'
import { defaultPriceStore } from '../lib/defaultPriceStore'
import { foldText } from '../lib/foldText'
import { formatAmount, formatUnitPrice, savedPercent } from '../lib/formatPrice'
import {
  type PackFormat,
  parseQuantityFactor,
  unitPrice,
} from '../lib/itemCost'
import { formatPack, samePack } from '../lib/packFormat'
import { formatChartDate, PriceBand } from '../lib/priceChart'
import { normalizeEntries } from '../lib/priceNormalization'
import { buildRastroSegments } from '../lib/rastro'
import { compareServerInstants } from '../lib/serverInstant'
import type {
  ListItem,
  Member,
  PackSource,
  PriceEntry,
  TagField,
} from '../types'
import { CameraScanner } from './CameraScanner'
import './ItemFichaSheet.css'
import LogPurchaseForm from './LogPurchaseForm'
import { PackFormatField } from './PackFormatField'
import { PriceHistoryBlock } from './PriceHistoryBlock'
import { Sheet } from './Sheet'
import { StoreEditor } from './StoreEditor'
import { TagEditor } from './TagEditor'

type SubState =
  | 'main'
  | 'rename'
  | 'brand'
  | 'quantity'
  | 'format'
  | 'stores'
  | 'code'
  | 'confirm-code'
  | 'price'
  | 'confirm-delete'

/** A correction the item sheet sends as it is, in one request. */
interface ItemCorrection {
  ean?: string
  brand?: string
  pack?: PackFormat | null
  pack_source?: PackSource
}

export interface FichaToast {
  lead?: string
  message: string
}

interface Props {
  item: ListItem
  members: Map<string, Member>
  displayStore: (raw: string) => string
  getToken: () => Promise<string>
  listId: string
  /** Every line of the list: the editors suggest from them. */
  listItems: ListItem[]
  purchased?: boolean
  /** A brand comes along when a suggestion names another product. */
  onRename: (newName: string, brand?: string | null) => void
  onSetTag: (field: TagField, value: string | null) => void
  onSetStores: (stores: string[]) => void
  /** Saves a format typed by hand; null removes it. */
  onSetPack: (pack: PackFormat | null) => void
  /** A code and what it fills; answers the line as saved, or null. */
  onCorrect: (patch: ItemCorrection) => Promise<ListItem | null>
  onDelete: () => void
  onClone: () => void
  /**
   * Saves a price; present only for a closed-trip record. Answers whether it
   * was saved.
   */
  onSavePrice?: (
    amount: number,
    pricePer: 'KILOGRAM' | null,
    store: string | null,
    purchasedQuantity: string | null,
  ) => Promise<boolean>
  onToast: (toast: FichaToast) => void
  onClose: () => void
}

const EAN = /^(\d{8}|\d{13})$/
const FROM_OFF = 'de Open Food Facts'

const FIELD_LABEL: Record<CatalogueField, string> = {
  name: 'Nombre',
  brand: 'Marca',
  pack: 'Formato',
}

/** What a field held before a catalogue value replaced it. */
interface Undo {
  before: string | PackFormat
  source: PackSource | null
}

/** «Mercadona, Alcampo» → «Mercadona y Alcampo»; three or more use a comma. */
function joinStores(names: string[]): string {
  if (names.length <= 1) return names.join('')
  if (names.length === 2) return `${names[0]} y ${names[1]}`
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

interface LatestPrice {
  amount: number
  pricePer: 'KILOGRAM' | null
  store: string | null
  purchasedAt: string | null
  quantity: string | null
  /** From a reduced label: what it cost before, in the same basis. */
  before: number | null
  pack: PackFormat | null
}

function latestPrice(
  entries: PriceEntry[],
  item: ListItem,
): LatestPrice | null {
  const priced = entries
    .filter((e): e is PriceEntry & { amount: number } => e.amount !== null)
    .sort((a, b) => {
      if (!a.purchased_at && !b.purchased_at) return 0
      if (!a.purchased_at) return 1
      if (!b.purchased_at) return -1
      return compareServerInstants(b.purchased_at, a.purchased_at)
    })
  const top = priced[0]
  if (top) {
    return {
      amount: top.amount,
      pricePer: top.price_per,
      store: top.store,
      purchasedAt: top.purchased_at ?? null,
      quantity: top.quantity ?? item.quantity,
      before: top.price_before ?? null,
      pack: top.pack ?? null,
    }
  }
  if (item.price != null) {
    return {
      amount: item.price,
      pricePer: item.price_per,
      store: item.price_store ?? item.stores[0] ?? null,
      purchasedAt: item.purchased_at,
      quantity: item.quantity,
      before: item.price_before ?? null,
      pack: item.pack ?? null,
    }
  }
  return null
}

const BASIS_UNIT = { kg: 'kg', l: 'L', ud: 'ud', unit: 'ud' } as const

function LastPriceBlock({
  entries,
  item,
  displayStore,
}: {
  entries: PriceEntry[]
  item: ListItem
  displayStore: (raw: string) => string
}) {
  const latest = latestPrice(entries, item)
  if (!latest) return null

  // The headline is the unit price the household pays — per kilo for weighed
  // goods, per unit otherwise — not the line total of the last trip. With a
  // format it is the shelf-label price, and the price per unit bought and
  // the format move beneath it.
  const unitSuffix = latest.pricePer === 'KILOGRAM' ? '/kg' : '/ud'
  const pack = latest.pricePer === 'KILOGRAM' ? null : latest.pack
  const shelf = pack ? unitPrice(latest.amount, null, null, pack) : null
  const headline = shelf ? shelf.value : latest.amount
  const headlineSuffix = shelf ? `/${BASIS_UNIT[shelf.basis]}` : unitSuffix
  const sub = [
    shelf ? formatUnitPrice(latest.amount, latest.pricePer) : null,
    pack ? formatPack(pack) : null,
    latest.store ? displayStore(latest.store) : null,
    latest.purchasedAt ? formatChartDate(latest.purchasedAt) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  // The glance is an average line with a min–max band across stores — never one
  // line threaded through several shops, whose slope would mean nothing.
  const curve = normalizeEntries(entries).entries

  return (
    <div className="ficha__last">
      <span className="ficha__last-figures">
        <span className="ficha__eyebrow">Último precio</span>
        <span className="ficha__last-amount">
          {formatAmount(headline)}
          <span className="ficha__last-unit">{headlineSuffix}</span>
        </span>
        {sub && <span className="ficha__last-sub">{sub}</span>}
        {/* Only a known old price shows: a reduced price without one reads
            like any other. */}
        {latest.before != null && latest.before > latest.amount && (
          <span className="ficha__before">
            <Tag size={13} strokeWidth={2.2} aria-hidden />
            <span>
              Antes{' '}
              <span className="ficha__before-figure">
                {formatAmount(latest.before)}
                {unitSuffix}
              </span>{' '}
              · {savedPercent(latest.before, latest.amount)} % menos
            </span>
          </span>
        )}
      </span>
      <PriceBand
        records={curve}
        width={120}
        height={42}
        pad={6}
        strokeWidth={1.5}
        className="ficha__last-curve"
      />
    </div>
  )
}

/**
 * One row of «Producto». An empty value reads «Sin …» in the quiet voice. A
 * row with an action (the scanner, a catalogue bulb) keeps the action just
 * before its chevron, over the row, and its tooltip beneath.
 */
function ProductField({
  label,
  value,
  empty,
  mono,
  source,
  onEdit,
  action,
  tip,
}: {
  label: string
  value: string | null
  empty: string
  mono?: boolean
  source?: string
  onEdit: () => void
  action?: ReactNode
  tip?: ReactNode
}) {
  const valueClass = [
    'ficha__field-value',
    value !== null && mono ? 'ficha__field-value--mono' : null,
    value === null ? 'ficha__field-value--empty' : null,
  ]
    .filter(Boolean)
    .join(' ')
  const row = (
    <button
      className={`ficha__field ficha__field--tappable${
        action ? ' ficha__field--with-action' : ''
      }`}
      onClick={onEdit}
    >
      <span className="ficha__field-label">{label}</span>
      <span className="ficha__field-values">
        <span className={valueClass}>{value ?? empty}</span>
        {value !== null && source && (
          <span className="ficha__field-source">{source}</span>
        )}
      </span>
      <ChevronRight size={14} className="ficha__field-chevron" />
    </button>
  )
  if (!action) return row
  return (
    <div className="ficha__field-wrap">
      {row}
      {action}
      {tip}
    </div>
  )
}

interface Product {
  name: string
  brand: string | null
}

const productKey = (p: Product) =>
  `${foldText(p.name.trim())}\u0000${foldText((p.brand ?? '').trim())}`

/**
 * The products the list already names whose name holds the typed text, one
 * per name + brand, never the line's own. A rename that lands on one of them
 * joins its price history instead of starting a third spelling.
 */
function renameSuggestions(
  lines: ListItem[],
  self: ListItem,
  typed: string,
): Product[] {
  const needle = foldText(typed.trim())
  if (!needle) return []
  const seen = new Set([productKey(self)])
  const found: Product[] = []
  for (const line of lines) {
    const key = productKey(line)
    if (seen.has(key)) continue
    seen.add(key)
    if (foldText(line.name).includes(needle)) {
      found.push({ name: line.name, brand: line.brand })
    }
  }
  return found.slice(0, 5)
}

function withoutKey<T extends object>(obj: T, key: keyof T): T {
  const copy = { ...obj }
  delete copy[key]
  return copy
}

function showValue(value: string | PackFormat): string {
  return typeof value === 'string' ? value : formatPack(value)
}

/** Where the format a saved code filled came from, if it filled one. */
type FilledPack = 'off' | 'copied' | null

function filledPack(before: ListItem, saved: ListItem): FilledPack {
  const source = saved.pack_source
  if (source !== 'off' && source !== 'copied') return null
  if (!saved.pack) return null
  if (before.pack && samePack(before.pack, saved.pack)) return null
  return source
}

/** The toast a saved code earns: what it filled, and from where. */
function codeToast(
  known: boolean | null,
  brand: boolean,
  pack: FilledPack,
): FichaToast {
  const lead = 'Código guardado.'
  const copied = 'Formato copiado de otra línea de tu lista.'
  if (known === false) {
    return {
      lead,
      message:
        pack === 'copied'
          ? `Open Food Facts no lo conoce. ${copied}`
          : 'Open Food Facts no lo conoce, así que no hay más datos que añadir.',
    }
  }
  if (brand && pack === 'off') {
    return { lead, message: 'Marca y formato añadidos desde Open Food Facts.' }
  }
  if (brand && pack === 'copied') {
    return { lead, message: `Marca añadida desde Open Food Facts. ${copied}` }
  }
  if (brand) return { lead, message: 'Marca añadida desde Open Food Facts.' }
  if (pack === 'off') {
    return { lead, message: 'Formato añadido desde Open Food Facts.' }
  }
  if (pack === 'copied') return { lead, message: copied }
  return { lead, message: '' }
}

/**
 * The product ficha: one sheet, four blocks — what it costs, where and at what
 * price, what it is, and where it came from — plus a footer to buy it again or
 * remove it. Every editor is a sub-state inside the one sheet: a dismiss steps
 * back to the main view rather than closing, and each change of sub-state
 * slides.
 */
export function ItemFichaSheet({
  item,
  members,
  displayStore,
  getToken,
  listId,
  listItems,
  purchased,
  onRename,
  onSetTag,
  onSetStores,
  onSetPack,
  onCorrect,
  onDelete,
  onClone,
  onSavePrice,
  onToast,
  onClose,
}: Props) {
  const [subState, setSubState] = useState<SubState>('main')
  // Whether the last change went back to the main view: the slide's direction.
  const [back, setBack] = useState(false)
  const [renameValue, setRenameValue] = useState(item.name)
  const [entries, setEntries] = useState<PriceEntry[]>([])
  const trimmed = renameValue.trim()
  const suggestions = useMemo(
    () =>
      subState === 'rename'
        ? renameSuggestions(listItems, item, renameValue)
        : [],
    [subState, listItems, item, renameValue],
  )
  // undefined while a field of the format block cannot be read.
  const [draftPack, setDraftPack] = useState<PackFormat | null | undefined>(
    item.pack ?? null,
  )
  const [codeDraft, setCodeDraft] = useState('')
  const [scanning, setScanning] = useState(false)
  const [pendingCode, setPendingCode] = useState<{
    ean: string
    scanned: boolean
  } | null>(null)
  // What the catalogue said on the last scan. Suggestions live only while
  // the sheet is open: nothing about them is stored.
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null)
  const [ignored, setIgnored] = useState<Set<CatalogueField>>(new Set())
  const [undo, setUndo] = useState<Partial<Record<CatalogueField, Undo>>>({})
  const [openTip, setOpenTip] = useState<CatalogueField | null>(null)
  // Bulbs that just appeared: they ripple once, then rest.
  const [fresh, setFresh] = useState<Set<CatalogueField>>(new Set())
  // A weighed line is priced per kg whatever its package: no «Formato».
  const hasFormat = item.price_per !== 'KILOGRAM'
  const boughtQty =
    item.purchased && item.purchased_quantity != null
      ? item.purchased_quantity
      : item.quantity

  useEffect(() => {
    let cancelled = false
    getPriceHistory(getToken, listId, item.id, 'this_list')
      .then((data) => {
        if (!cancelled) setEntries(data.entries)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [getToken, listId, item.id])

  function go(next: SubState) {
    setBack(next === 'main')
    setSubState(next)
    setOpenTip(null)
    setFresh(new Set())
  }

  const differing = catalogue ? differingFields(item, catalogue) : []

  async function saveCode(ean: string) {
    go('main')
    let product: Awaited<ReturnType<typeof getBarcode>> | null = null
    // null: the lookup failed, so nobody knows whether the code is known.
    let known: boolean | null = true
    try {
      product = await getBarcode(getToken, ean)
    } catch (err) {
      known = err instanceof ApiError && err.status === 404 ? false : null
    }
    const brand = product?.brand && !item.brand ? product.brand : null
    const saved = await onCorrect(brand ? { ean, brand } : { ean })
    if (!saved) return
    // The server decides the format: the list's own line first, then Open
    // Food Facts, and none on a line sold by weight.
    onToast(codeToast(known, !!brand, filledPack(item, saved)))
    if (!product) return
    const found: Catalogue = {
      ean,
      name: product.name,
      brand: product.brand,
      pack: product.pack,
    }
    // The line as the save leaves it: what was filled is no suggestion.
    const after = { ...item, brand: saved.brand, pack: saved.pack ?? null }
    const fields = differingFields(after, found)
    setCatalogue(found)
    setIgnored(new Set())
    setUndo({})
    setFresh(new Set(fields))
    setOpenTip(fields[0] ?? null)
  }

  function takeCode(ean: string, scanned: boolean) {
    if (item.ean && item.ean !== ean) {
      setPendingCode({ ean, scanned })
      go('confirm-code')
      return
    }
    void saveCode(ean)
  }

  function current(field: CatalogueField): string | PackFormat | null {
    if (field === 'name') return item.name
    if (field === 'brand') return item.brand
    return item.pack ?? null
  }

  function write(
    field: CatalogueField,
    value: string | PackFormat,
    source: PackSource,
  ) {
    if (field === 'name') onRename(value as string)
    else if (field === 'brand') onSetTag('brand', value as string)
    else if (catalogue) {
      // The code stays: it is the one that names this format.
      void onCorrect({
        pack: value as PackFormat,
        pack_source: source,
        ean: catalogue.ean,
      })
    }
  }

  function takeSuggestion(field: CatalogueField) {
    const before = current(field)
    const value = catalogue?.[field]
    if (before === null || value == null) return
    setUndo((u) => ({
      ...u,
      [field]: { before, source: item.pack_source ?? null },
    }))
    write(field, value, 'off')
    // Left open, the tip would turn into the undo under the same finger, and
    // a second tap on ✓ would put the old value back.
    setOpenTip(null)
  }

  function restore(field: CatalogueField) {
    const was = undo[field]
    if (!was) return
    write(field, was.before, was.source ?? 'manual')
    setUndo((u) => withoutKey(u, field))
    setOpenTip(null)
  }

  function keepNew(field: CatalogueField) {
    setUndo((u) => withoutKey(u, field))
    setOpenTip(null)
  }

  function ignore(field: CatalogueField) {
    setIgnored((s) => new Set(s).add(field))
    setOpenTip(null)
  }

  /** The bulb or the undo a field carries, with its tooltip. */
  function catalogueAction(field: CatalogueField) {
    const label = FIELD_LABEL[field]
    const was = undo[field]
    const value = catalogue?.[field]
    const showsUndo =
      !!was &&
      value != null &&
      current(field) !== null &&
      !differing.includes(field)
    const showsBulb =
      !showsUndo && differing.includes(field) && !ignored.has(field)
    if (!showsUndo && !showsBulb) return {}
    const open = openTip === field
    const toggle = () => setOpenTip(open ? null : field)
    const action = (
      <button
        type="button"
        className={[
          'ficha__badge',
          open ? 'ficha__badge--on' : null,
          showsBulb && fresh.has(field) ? 'ficha__badge--pulse' : null,
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={
          showsUndo
            ? `Deshacer ${label.toLowerCase()}`
            : `${label} en Open Food Facts`
        }
        aria-expanded={open}
        onClick={toggle}
      >
        <span>
          {showsUndo ? (
            <RotateCcw size={15} aria-hidden />
          ) : (
            <Lightbulb size={15} aria-hidden />
          )}
        </span>
      </button>
    )
    const tip = open && (
      <>
        {/* A tap outside the tip only folds it: the layer takes the tap, so
            the row beneath never opens its editor. */}
        <div
          className="ficha__tip-catcher"
          data-testid="tip-catcher"
          aria-hidden
          onClick={() => setOpenTip(null)}
        />
        <div
          className="ficha__tip"
          role="group"
          aria-label={
            showsUndo ? `${label} anterior` : `${label} en Open Food Facts`
          }
        >
          <span className="ficha__tip-arrow" aria-hidden />
          <span className="ficha__tip-text">
            {showsUndo && was ? (
              <>
                <span className="ficha__tip-src">Antes</span>
                <span className="ficha__tip-value">
                  {showValue(was.before)}
                </span>
              </>
            ) : (
              <>
                <span className="ficha__tip-value">
                  {value != null ? showValue(value) : ''}
                </span>
                <span className="ficha__tip-src">{FROM_OFF}</span>
              </>
            )}
          </span>
          <span className="ficha__tip-actions">
            <button
              type="button"
              className="ficha__disc ficha__disc--no"
              aria-label={showsUndo ? 'Dejar el nuevo' : 'Ignorar'}
              onClick={() => (showsUndo ? keepNew(field) : ignore(field))}
            >
              <X size={15} strokeWidth={2.4} aria-hidden />
            </button>
            <button
              type="button"
              className="ficha__disc ficha__disc--yes"
              aria-label={showsUndo ? 'Restaurar' : 'Usar'}
              onClick={() =>
                showsUndo ? restore(field) : takeSuggestion(field)
              }
            >
              <Check size={15} strokeWidth={2.4} aria-hidden />
            </button>
          </span>
        </div>
      </>
    )
    return { action, tip }
  }

  const label =
    subState === 'rename'
      ? 'Renombrar producto'
      : subState === 'brand'
        ? 'Marca'
        : subState === 'quantity'
          ? 'Cantidad'
          : subState === 'format'
            ? 'Formato'
            : subState === 'stores'
              ? 'Tiendas'
              : subState === 'code'
                ? 'Código de barras'
                : subState === 'confirm-code'
                  ? '¿Cambiar el código?'
                  : subState === 'price'
                    ? 'Registrar compra'
                    : subState === 'confirm-delete'
                      ? 'Confirmar eliminación'
                      : item.name

  const storeNames = item.stores.map(displayStore)
  const subtitle = [
    item.brand,
    storeNames.length > 0 ? `en ${joinStores(storeNames)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const rastroSegments = buildRastroSegments(item, members, entries)
  const cancel = (
    <button className="ficha__cancel-link" onClick={() => go('main')}>
      Cancelar
    </button>
  )
  const typedCode = codeDraft.replace(/\s/g, '')

  return (
    <Sheet
      className="item-ficha-sheet"
      label={label}
      onClose={onClose}
      onDismiss={
        scanning
          ? () => setScanning(false)
          : subState === 'main'
            ? undefined
            : () => go('main')
      }
    >
      <div
        key={subState}
        className={`ficha-pane${back ? ' ficha-pane--back' : ''}`}
      >
        {subState === 'main' && (
          <div className="ficha">
            <div className="ficha__header">
              <div className="ficha__title">{item.name}</div>
              {subtitle && <div className="ficha__subtitle">{subtitle}</div>}
            </div>

            <LastPriceBlock
              entries={entries}
              item={item}
              displayStore={displayStore}
            />

            {/* The entry row lives in the history block, so a record with no
                price yet still gets the block, holding only that row. */}
            {(entries.length > 0 || onSavePrice) && (
              <PriceHistoryBlock
                entries={entries}
                displayStore={displayStore}
                onLogPrice={onSavePrice ? () => go('price') : undefined}
              />
            )}

            <div className="ficha__section">
              <div className="ficha__eyebrow ficha__section-eyebrow">
                Producto
              </div>
              <ProductField
                label="Nombre"
                value={item.name}
                empty="Sin nombre"
                onEdit={() => {
                  setRenameValue(item.name)
                  go('rename')
                }}
                {...catalogueAction('name')}
              />
              <ProductField
                label="Marca"
                value={item.brand}
                empty="Sin marca"
                onEdit={() => go('brand')}
                {...catalogueAction('brand')}
              />
              <ProductField
                label="Cantidad"
                value={item.quantity}
                empty="Sin cantidad"
                onEdit={() => go('quantity')}
              />
              {hasFormat && (
                <ProductField
                  label="Formato"
                  value={item.pack ? formatPack(item.pack) : null}
                  empty="Sin formato"
                  mono
                  source={item.pack_source === 'off' ? FROM_OFF : undefined}
                  onEdit={() => {
                    setDraftPack(item.pack ?? null)
                    go('format')
                  }}
                  {...catalogueAction('pack')}
                />
              )}
              <ProductField
                label="Tiendas"
                value={storeNames.length > 0 ? storeNames.join(', ') : null}
                empty="Sin tiendas"
                onEdit={() => go('stores')}
              />
              <ProductField
                label="Código"
                value={item.ean}
                empty="Sin código"
                mono
                onEdit={() => {
                  setCodeDraft(item.ean ?? '')
                  go('code')
                }}
                action={
                  <button
                    type="button"
                    className="ficha__icon-btn"
                    aria-label="Escanear el código de barras"
                    onClick={() => setScanning(true)}
                  >
                    <ScanBarcode size={18} aria-hidden />
                  </button>
                }
              />
            </div>

            {rastroSegments.length > 0 && (
              <div className="ficha__section">
                <div className="ficha__eyebrow ficha__section-eyebrow">
                  Rastro
                </div>
                <p className="ficha__rastro">
                  {rastroSegments.map((seg, i) =>
                    typeof seg === 'string' ? seg : <b key={i}>{seg.b}</b>,
                  )}
                </p>
              </div>
            )}

            <div className="ficha__footer">
              {/* «Volver a comprar» clones the line onto the pending list —
                  only meaningful for something already bought. On a pending
                  item it would just add a duplicate, so it is hidden there. */}
              {purchased && (
                <button className="ficha__rebuy" onClick={onClone}>
                  <RotateCcw size={16} /> Volver a comprar
                </button>
              )}
              <button
                className="ficha__delete"
                onClick={() => go('confirm-delete')}
              >
                Eliminar producto
              </button>
            </div>
          </div>
        )}

        {subState === 'rename' && (
          <div className="ficha ficha--sub">
            <div className="ficha__input-row">
              <input
                className="ficha__input"
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && trimmed) {
                    onRename(trimmed)
                    go('main')
                  }
                }}
                autoFocus
                aria-label="Nombre del producto"
              />
              <button
                className="ficha__save-btn"
                onClick={() => {
                  onRename(trimmed)
                  go('main')
                }}
                disabled={!trimmed}
                aria-label="Guardar"
              >
                Guardar
              </button>
            </div>
            {/* Name + brand is the product key: a bought line takes its
                prices along to whatever product it is renamed to. */}
            {purchased && (
              <p className="ficha__rename-note">
                Sus precios pasan al historial de precios del nuevo nombre.
              </p>
            )}
            {suggestions.length > 0 && (
              <ul
                className="ficha__suggestions"
                aria-label="Productos de la lista"
              >
                {suggestions.map((s) => (
                  <li key={productKey(s)}>
                    <button
                      className="ficha__suggestion"
                      onClick={() => {
                        onRename(s.name, s.brand)
                        go('main')
                      }}
                    >
                      <span>{s.name}</span>
                      {s.brand && (
                        <span className="ficha__suggestion-brand">
                          {s.brand}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {cancel}
          </div>
        )}

        {(subState === 'brand' || subState === 'quantity') && (
          <div className="ficha ficha--sub">
            <TagEditor
              item={item}
              field={subState}
              items={listItems}
              onSave={(value) => {
                onSetTag(subState, value)
                go('main')
              }}
            />
            {cancel}
          </div>
        )}

        {subState === 'stores' && (
          <div className="ficha ficha--sub">
            <StoreEditor
              item={item}
              items={listItems}
              onSave={(stores) => {
                onSetStores(stores)
                go('main')
              }}
            />
            {cancel}
          </div>
        )}

        {subState === 'format' && (
          <div className="ficha ficha--sub ficha--format">
            <PackFormatField
              initial={item.pack ?? null}
              price={item.price}
              units={parseQuantityFactor(boughtQty, null)}
              onChange={setDraftPack}
            />
            <button
              className="ficha__done-btn"
              disabled={draftPack === undefined}
              onClick={() => {
                if (draftPack === undefined) return
                onSetPack(draftPack)
                go('main')
              }}
            >
              Hecho
            </button>
            <button className="ficha__cancel-btn" onClick={() => go('main')}>
              Cancelar
            </button>
          </div>
        )}

        {subState === 'code' && (
          <div className="ficha ficha--sub">
            <div className="ficha__header">
              <div className="ficha__title">{item.name}</div>
              <div className="ficha__subtitle">Código de barras</div>
            </div>
            <div className="ficha__code">
              <label className="ficha__code-label" htmlFor="ficha-code">
                Código
              </label>
              <div className="ficha__input-row ficha__input-row--flush">
                <input
                  id="ficha-code"
                  className="ficha__input ficha__input--mono"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && EAN.test(typedCode)) {
                      takeCode(typedCode, false)
                    }
                  }}
                  autoFocus
                />
                <button
                  className="ficha__save-btn"
                  disabled={!EAN.test(typedCode)}
                  onClick={() => takeCode(typedCode, false)}
                >
                  Guardar
                </button>
              </div>
              <p className="ficha__help">
                Las 8 o 13 cifras que hay bajo las barras. Al guardarlo, se
                rellena lo que falte, igual que al escanearlo.
              </p>
            </div>
            {cancel}
          </div>
        )}

        {subState === 'confirm-code' && pendingCode && (
          <div className="ficha ficha--sub">
            <div className="ficha__header ficha__header--plain">
              <div className="ficha__title">¿Cambiar el código?</div>
              <p className="ficha__lede">
                {item.name} ya tiene otro código. Si has escaneado otro formato,
                quizá sea mejor añadirlo como otro producto.
              </p>
            </div>
            <div className="ficha__code">
              <dl className="ficha__compare">
                <dt>Tiene</dt>
                <dd className="ficha__compare-old">{item.ean}</dd>
                <dt>{pendingCode.scanned ? 'Escaneado' : 'Escrito'}</dt>
                <dd className="ficha__compare-new">{pendingCode.ean}</dd>
              </dl>
              <p className="ficha__help">
                Lo que escribiste tú no cambia. Solo se rellenan los datos que
                falten.
              </p>
            </div>
            <div className="ficha__choice">
              <button
                className="ficha__choice-no"
                onClick={() => {
                  setPendingCode(null)
                  go('main')
                }}
              >
                Dejar el que tiene
              </button>
              <button
                className="ficha__choice-yes"
                onClick={() => {
                  const { ean } = pendingCode
                  setPendingCode(null)
                  void saveCode(ean)
                }}
              >
                Cambiar el código
              </button>
            </div>
          </div>
        )}

        {subState === 'price' && onSavePrice && (
          <div className="ficha ficha--sub">
            <LogPurchaseForm
              item={item}
              displayStore={displayStore}
              initialAmount={item.price}
              initialStore={defaultPriceStore(item)}
              initialPurchasedQuantity={item.purchased_quantity ?? null}
              onSave={(amount, pricePer, store, qty) => {
                void onSavePrice(amount, pricePer, store, qty).then((ok) => {
                  if (ok) go('main')
                })
              }}
            />
            {cancel}
          </div>
        )}

        {subState === 'confirm-delete' && (
          <div className="ficha ficha--sub">
            <p className="ficha__confirm-name">{item.name}</p>
            <p className="ficha__warning">Esta acción no se puede deshacer.</p>
            <button
              className="ficha__confirm-btn"
              onClick={onDelete}
              aria-label="Sí, eliminar"
            >
              Sí, eliminar
            </button>
            <button className="ficha__cancel-btn" onClick={() => go('main')}>
              Cancelar
            </button>
          </div>
        )}
      </div>

      {scanning && (
        <CameraScanner
          formats={['ean_8', 'ean_13']}
          hint="Apunta al código de barras del envase"
          caption={
            <span className="barcode-scanner__target">
              <span className="barcode-scanner__target-eyebrow">
                Código para
              </span>
              <span className="barcode-scanner__target-line">
                <span className="barcode-scanner__target-name">
                  {item.name}
                </span>
              </span>
            </span>
          }
          onDetect={(ean) => {
            setScanning(false)
            takeCode(ean, true)
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </Sheet>
  )
}
