import type { DragEndEvent } from '@dnd-kit/core'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useFeatureFlags } from '../contexts/FeatureFlagsContext'
import { useApplePlatform } from '../hooks/useApplePlatform'
import { useIsOffline } from '../hooks/useIsOffline'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePWAInstall } from '../hooks/usePWAInstall'
import { useToast } from '../hooks/useToast'
import type { FeedbackPayload } from '../lib/api'
import { createList, getLists, submitFeedback } from '../lib/api'
import { CURATED_EMOJIS } from '../lib/curatedEmojis'
import type { DragState } from '../lib/dragAnnouncements'
import { createDragAnnouncements } from '../lib/dragAnnouncements'
import { FLAGS } from '../lib/featureFlags'
import type { Direction } from '../lib/listOrder'
import { moveAnnouncement, moveList } from '../lib/listOrder'
import { OFFLINE_REFUSAL } from '../lib/refusalCopy'
import type { ApiList } from '../types'
import { CreateListCard } from './CreateListCard'
import './DashboardScreen.css'
import { FeedbackSheet } from './FeedbackSheet'
import { SettingsSheet } from './SettingsSheet'
import { SortableListCard } from './SortableListCard'
import { Toast } from './Toast'
import { Wordmark } from './Wordmark'

function loadOrder(userId: string): string[] | null {
  try {
    const raw = localStorage.getItem(`list-order-${userId}`)
    return raw ? (JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

function saveOrder(userId: string, ids: string[]) {
  localStorage.setItem(`list-order-${userId}`, JSON.stringify(ids))
}

function applyOrder(lists: ApiList[], order: string[] | null): ApiList[] {
  if (!order) return lists
  const map = new Map(lists.map((l) => [l.id, l]))
  const sorted = order.flatMap((id) => (map.has(id) ? [map.get(id)!] : []))
  const rest = lists.filter((l) => !order.includes(l.id))
  return [...sorted, ...rest]
}

function loadDashboardCache(userId: string): ApiList[] | null {
  try {
    const raw = localStorage.getItem(`cqs_dashboard_cache_${userId}`)
    return raw ? (JSON.parse(raw) as ApiList[]) : null
  } catch {
    return null
  }
}

function saveDashboardCache(userId: string, lists: ApiList[]) {
  try {
    localStorage.setItem(`cqs_dashboard_cache_${userId}`, JSON.stringify(lists))
  } catch {
    /* storage unavailable */
  }
}

function randomEmoji(): string {
  return CURATED_EMOJIS[Math.floor(Math.random() * CURATED_EMOJIS.length)]
}

export function DashboardScreen() {
  const { user, getToken, signOut } = useAuth()
  const navigate = useNavigate()
  const [lists, setLists] = useState<ApiList[] | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const { isOffline } = useIsOffline()
  usePageTitle(undefined)
  const { toast, showToast, dismissToast } = useToast()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall()
  const { isEnabled } = useFeatureFlags()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const isApplePlatform = useApplePlatform()

  const defaultList = lists?.find((l) => l.is_default) ?? null

  const [reorderRequested, setReorderRequested] = useState(false)
  const [moveMessage, setMoveMessage] = useState('')

  // Arranging does not survive the row *set* changing. Everywhere `lists` is
  // replaced from outside goes through here, so the rule is enforced in one
  // place rather than at each call site.
  //
  // The set, deliberately, and not the array: handleMove and handleDragEnd
  // change the order constantly and must not clear the mode they are being
  // used from, so the key is sorted and a reorder leaves it identical.
  //
  // A ref rather than reading `lists` from the closure, which would have to
  // join fetchLists's dependency list — and fetchLists is the mount effect's
  // only dependency, so every fetch would rebuild it, refire the effect and
  // fetch again, forever.
  const listIdsRef = useRef('')
  const applyLists = useCallback((next: ApiList[]) => {
    setLists(next)
    const key = next
      .map((l) => l.id)
      .sort()
      .join(',')
    if (key === listIdsRef.current) return
    listIdsRef.current = key
    setReorderRequested(false)
    setMoveMessage('')
  }, [])

  const fetchLists = useCallback(
    async (silent = false) => {
      const cached = loadDashboardCache(user!.id)
      if (cached) {
        const ordered = applyOrder(cached, loadOrder(user!.id))
        applyLists(ordered)
      } else if (!silent) {
        setLists(null)
        setFetchError(false)
      }
      try {
        const data = (await getLists(getToken)) as ApiList[]
        const ordered = applyOrder(data, loadOrder(user!.id))
        applyLists(ordered)
        saveDashboardCache(user!.id, data)
      } catch {
        if (!cached && !silent) setFetchError(true)
      }
    },
    // applyLists is a useCallback over [], so it is stable and does not
    // reintroduce the rebuild-and-refetch loop the ref exists to avoid.
    [getToken, user, applyLists],
  )

  const handleFeedbackSubmit = useCallback(
    async (payload: FeedbackPayload) => {
      if (isOffline) {
        showToast('No se pudo enviar el feedback')
        return
      }
      setFeedbackSubmitting(true)
      try {
        await submitFeedback(getToken, payload)
        setFeedbackOpen(false)
        showToast('Feedback enviado')
      } catch {
        showToast('No se pudo enviar el feedback')
      } finally {
        setFeedbackSubmitting(false)
      }
    },
    [getToken, isOffline, showToast],
  )

  // Arranging is a mode, not a second affordance bolted to every row. #171
  // reduced the row to one control on purpose, and a permanent pair of arrows
  // would put the duplication straight back; asking for the mode is what buys
  // the space to show them.
  //
  // Derived rather than stored, so it cannot survive the condition that makes
  // it meaningless. With one list there is nothing to arrange and the toggle is
  // not drawn — and if a refetch or another tab takes the panel down to one
  // while the mode is on, a stored flag would leave someone inside a mode whose
  // only exit had just been removed.
  const reordering = reorderRequested && (lists?.length ?? 0) > 1

  // Reads `lists` from the closure rather than using the updater form, because
  // it has to do three things and only one of them is computing the next state.
  // A setState updater must be pure — StrictMode calls it twice — so saving the
  // order and setting the announcement cannot live inside one. Only ever called
  // from a click, so the closed-over `lists` is the rendered one.
  const handleMove = useCallback(
    (id: string, direction: Direction) => {
      if (!lists) return
      const next = moveList(lists, id, direction)
      // Identical reference: the move was off the end. Nothing changed, so
      // nothing is saved and nothing is announced.
      if (next === lists) return
      setLists(next)
      saveOrder(
        user!.id,
        next.map((l) => l.id),
      )
      setMoveMessage(moveAnnouncement(next, id))
    },
    [lists, user],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      setLists((prev) => {
        if (!prev) return prev
        const oldIndex = prev.findIndex((l) => l.id === active.id)
        const newIndex = prev.findIndex((l) => l.id === over.id)
        const next = arrayMove(prev, oldIndex, newIndex)
        saveOrder(
          user!.id,
          next.map((l) => l.id),
        )
        return next
      })
    },
    [user],
  )

  // The one bit a drag carries — has it left the row it started on — kept in a
  // mutable box so the announcements can be rebuilt whenever the order changes
  // without forgetting it mid-drag. Held via useState's lazy initialiser purely
  // to get one stable object per mount; nothing renders from it, and it is
  // never reassigned. See lib/dragAnnouncements, where the strings live and are
  // tested.
  const [dragState] = useState<DragState>(() => ({ hasLeftOrigin: false }))
  const announcements = useMemo(
    () => createDragAnnouncements(lists, dragState),
    [lists, dragState],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: shows cached data synchronously while fresh fetch is in flight
    void fetchLists()
  }, [fetchLists])

  // Returns whether the list was created, because CreateListCard clears the
  // name it holds on the way back and must be able to tell "it didn't happen"
  // from "it worked". The offline check sits here beside `handleFeedbackSubmit`
  // rather than in the card, so `isOffline` stays a single authority.
  //
  // Refusal and failure both answer `false`, and both keep what was typed.
  // That is the safe side of each: offline *knows* no list exists, and a
  // rejection cannot rule it out.
  //
  // Cannot rule it out is the operative part, and it is why the failure toast
  // does not say the list was not created. `apiFetch` rejects the same way
  // whether the server refused before writing or committed and lost the
  // response on the way back — and `create_list` has no idempotency key and
  // `lists.name` no unique constraint, so a user who believes a definite "no"
  // and presses Crear again gets two lists with the same name and nothing to
  // explain it. The message states what is actually known.
  //
  // The refetch is the other half. If the write did land, it puts the list on
  // screen underneath the message, so the ambiguity resolves itself in the one
  // direction the copy cannot.
  //
  // The toast goes first, and the order is the point rather than an accident.
  // `apiFetch` has no timeout, so on the case this whole branch exists for —
  // a response lost in transport — the follow-up `getLists` hangs too, for as
  // long as the browser takes to give up. Refetching first would hold the
  // card's `creating` flag through all of it with nothing said, which is a
  // dead button and silence on the one path that most needs an explanation.
  // Both updates paint separately either way, so nothing is lost by saying it
  // first. The `await` stays *after* the toast rather than being dropped:
  // holding `creating` for the refetch is what stops a fast second tap
  // creating the duplicate while the check is still in flight.
  //
  // `silent` is load-bearing here, not defensive. `saveDashboardCache`
  // swallows its own failure, so when storage is unavailable — blocked for the
  // origin, quota exceeded — the mount fetch still renders the screen and
  // `loadDashboardCache` returns null forever after. In that session this
  // refetch takes the uncached path, and without the flag a refetch that also
  // fails sets `fetchError`, whose early return replaces the screen with the
  // retry state and unmounts the `<Toast>` before it can be read. The message
  // this commit exists to show would be the thing it destroyed.
  //
  // Only `createList` is inside the `try`. `fetchLists` settles on its own —
  // its network path catches into `fetchError` — and widening the guard around
  // it would report a create that *succeeded* as a failure, leaving the card
  // holding a name whose list already exists.
  const handleCreate = useCallback(
    async (name: string) => {
      if (isOffline) {
        showToast(OFFLINE_REFUSAL)
        return false
      }
      try {
        await createList(getToken, { name, emoji: randomEmoji() })
      } catch {
        showToast('No se pudo confirmar si se creó la lista')
        await fetchLists(true)
        return false
      }
      await fetchLists()
      return true
    },
    [getToken, fetchLists, isOffline, showToast],
  )

  if (fetchError) {
    return (
      <div className="dashboard-screen dashboard-screen--centered">
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          No se pudieron cargar tus listas
        </p>
        <button
          className="dashboard-screen__retry"
          onClick={() => void fetchLists()}
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (lists === null) {
    return (
      <div
        role="status"
        aria-label="Cargando"
        className="dashboard-screen dashboard-screen--centered"
      >
        <span className="dashboard-screen__spinner" />
      </div>
    )
  }

  return (
    <div className="dashboard-screen">
      <header className="dashboard-screen__header">
        <h1 className="dashboard-screen__title">
          <Wordmark size={26} />
        </h1>
        <button
          className="dashboard-screen__avatar"
          onClick={() => setSettingsOpen(true)}
          aria-label="Ajustes"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
        >
          {user?.photoUrl ? (
            <img src={user.photoUrl} alt={user.displayName} />
          ) : (
            <span>{user?.displayName?.[0] ?? '?'}</span>
          )}
        </button>
      </header>
      {isOffline && (
        <div className="offline-banner" role="status">
          Sin conexión
        </div>
      )}
      <main className="dashboard-screen__lists">
        {lists.length > 0 && (
          <div className="dashboard-screen__panel-head">
            <span className="dashboard-screen__panel-label">Tus listas</span>
            <span className="dashboard-screen__panel-count">
              {lists.length}
            </span>
            {lists.length > 1 && (
              // Edit/Done, and deliberately no aria-pressed. The label already
              // says what pressing it will do, and a toggle carrying both
              // announces "Listo, botón de alternancia, pulsado" — which reads
              // as though pressing it would *perform* Listo, and states the
              // mode twice in two vocabularies. One or the other: a fixed label
              // with aria-pressed, or a label that changes without it. The
              // changing label is the better affordance for leaving. Neither
              // form makes the press itself audible; the live region in the
              // onClick does.
              <button
                className={`dashboard-screen__reorder-toggle${reordering ? ' dashboard-screen__reorder-toggle--on' : ''}`}
                onClick={() => {
                  const next = !reordering
                  setReorderRequested(next)
                  // Entering is announced through the live region rather than
                  // left to the label swap. Pressing this changes the
                  // accessible name of the focused element, which NVDA and JAWS
                  // generally re-announce and VoiceOver on iOS generally does
                  // not — and iOS is the platform this app is least willing to
                  // be silent on. aria-pressed would not have rescued it
                  // either; VO's handling of a pressed-state change is no more
                  // dependable. A live region is the mechanism that does not
                  // depend on the screen reader noticing something about the
                  // element you are already on.
                  //
                  // Leaving stays silent, and not because a farewell would be
                  // stale — the entry text is left standing too, for as long as
                  // the mode is on, so persistence is not what separates them.
                  //
                  // What separates them is whether the referent is still there
                  // to be found. The entry instructions describe controls that
                  // exist for as long as the text does, and so does a move
                  // announcement — "movida a la posición 1 de 3" is an account
                  // of an event, but the row it names is on screen with its
                  // arrows still under the reader's finger. An exit message
                  // would be the only one whose subject stops existing as it is
                  // read: the mode it reports is gone, so anyone meeting it
                  // later has nothing to attach it to. Entry also creates
                  // affordances nobody has a reason to go looking for; exit
                  // removes ones they just asked to remove.
                  //
                  // The gap this leaves, named rather than hidden: on iOS VO,
                  // pressing Listo can be silent, and so can a mis-tap that
                  // fails to leave the mode, so silence does not distinguish
                  // "done" from "nothing happened". Small — the next swipe lands
                  // on a row that is a button again, because this region is
                  // empty by then and is passed over.
                  setMoveMessage(
                    next
                      ? 'Modo reordenar. Usa los botones subir y bajar de cada lista.'
                      : '',
                  )
                }}
              >
                {reordering ? 'Listo' : 'Reordenar'}
              </button>
            )}
          </div>
        )}
        {/* Only the button path needs this. A drag has DndContext's own live
            region, which says considerably more than a landing position — see
            lib/dragAnnouncements.

            aria-live rather than role="status", which is what it would
            otherwise be written as. DndContext mounts a role="status" region of
            its own, and a second one makes "the status region" ambiguous — for
            a test picking it out, and for anyone navigating by role. The
            announcement behaviour is identical; only the implicit role is not
            claimed twice.

            Where it sits is load-bearing in both of its states, and nothing
            will tell you if that changes: between the panel head and the rows,
            it is read after the toggle and before the first Subir when it has
            text, and skipped over — leaving the next swipe to land on a row —
            when it does not. Both claims are argued in the toggle's onClick,
            which is not where someone tidying this markup would look.

            The ordering half is pinned by `is read after the toggle and
            before the first row`, which asserts *both* bounds — DOM order is
            not layout, so jsdom models it exactly, and a hoist above this head
            fails it just as a drop below the rows does. Either assertion alone
            passes one of those two moves, so neither is spare.

            What stays uncovered is the empty half: nothing asserts
            that a blank region is skipped rather than read, because that is a
            fact about screen readers and not about the tree. */}
        <p className="sr-only dashboard-screen__move-status" aria-live="polite">
          {moveMessage}
        </p>
        {/* Say the gesture that exists, not the one dnd-kit assumes.

            Its default instructions tell a screen reader to press the space
            bar to pick an item up. That was inaudible while these attributes
            sat on the grip, which was aria-hidden; on the real button they are
            announced, and only PointerSensor and TouchSensor are registered
            here, so space does nothing. Describing a gesture that isn't there
            is worse than describing none.

            KeyboardSensor is still not registered, and now never will be. It
            activates on Space/Enter — the keys that open a list from this
            button — so it would need an activator element of its own, and the
            row has none to spare. Reordering without a pointer is the
            Reordenar mode above instead, which is better than a keyboard drag
            rather than a substitute for one: two buttons per row serve screen
            readers, switch access and voice control, none of which can hold
            something down and steer it. */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{
            screenReaderInstructions: {
              draggable:
                'Mantén pulsada una lista para moverla. Suéltala en su nuevo sitio para guardar el orden.',
            },
            announcements,
          }}
        >
          <SortableContext
            items={lists.map((l) => l.id)}
            strategy={verticalListSortingStrategy}
          >
            {lists.map((list, index) => (
              <SortableListCard
                key={list.id}
                list={list}
                onClick={() => navigate(`/lists/${list.id}`)}
                reordering={reordering}
                onMove={(direction) => handleMove(list.id, direction)}
                isFirst={index === 0}
                isLast={index === lists.length - 1}
              />
            ))}
          </SortableContext>
        </DndContext>
        <div className="dashboard-screen__create">
          <CreateListCard
            isFirst={lists.length === 0}
            onCreate={handleCreate}
          />
        </div>
      </main>
      {settingsOpen && (
        <SettingsSheet
          user={user}
          getToken={getToken}
          pushAvailable={isEnabled(FLAGS.PUSH_NOTIFICATIONS)}
          isIOS={isIOS}
          isInstalled={isInstalled}
          isInstallable={isInstallable}
          promptInstall={promptInstall}
          isApplePlatform={isApplePlatform}
          defaultListName={defaultList?.name ?? null}
          // Settings closes on its way out. Two live sheets would stack two
          // overlays and leave two elements each claiming to be the only modal.
          onOpenFeedback={() => {
            setSettingsOpen(false)
            setFeedbackOpen(true)
          }}
          onSignOut={() => void signOut()}
          onToast={showToast}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {feedbackOpen && (
        <FeedbackSheet
          defaultEmail={user?.email}
          isSubmitting={feedbackSubmitting}
          onSubmit={(payload) => void handleFeedbackSubmit(payload)}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          action={toast.action}
          onDismiss={dismissToast}
        />
      )}
    </div>
  )
}
