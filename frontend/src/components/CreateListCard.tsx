import { Plus } from 'lucide-react'
import { useState } from 'react'
import { CURATED_EMOJIS } from '../lib/curatedEmojis'
import './CreateListCard.css'
import { CreateListSheet } from './CreateListSheet'
import { Mascot } from './Mascot'

interface Props {
  isFirst?: boolean
  onCreate: (name: string, emoji: string) => Promise<void>
}

export function CreateListCard({ isFirst, onCreate }: Props) {
  // The chosen emoji doubles as the open flag: null = closed. Picking it here
  // (not on every render) keeps it steady while the sheet is open.
  const [emoji, setEmoji] = useState<string | null>(null)

  const open = () =>
    setEmoji(CURATED_EMOJIS[Math.floor(Math.random() * CURATED_EMOJIS.length)])

  return (
    <>
      {isFirst ? (
        // 16c first-run empty: the one empty state that earns the mascot —
        // flat surface (this is not a list yet), serif title, one sentence,
        // one button.
        <div className="create-list-empty">
          <Mascot size={104} />
          <h2 className="create-list-empty__title">Aún no tienes listas</h2>
          <p className="create-list-empty__lead">
            Empieza una y compártela en casa.
          </p>
          <button className="create-list-empty__cta" onClick={open}>
            Crear la primera lista
          </button>
        </div>
      ) : (
        <button className="create-list-row" onClick={open}>
          <span className="create-list-row__icon" aria-hidden>
            <Plus size={19} strokeWidth={2.2} />
          </span>
          <span className="create-list-row__label">Nueva lista</span>
        </button>
      )}
      {emoji !== null && (
        <CreateListSheet
          emoji={emoji}
          onCreate={onCreate}
          onClose={() => setEmoji(null)}
        />
      )}
    </>
  )
}
