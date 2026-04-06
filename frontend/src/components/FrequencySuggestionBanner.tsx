import { useState, useEffect } from 'react'
import './FrequencySuggestionBanner.css'
import type { DueSuggestion } from '../types'
import { isDismissed, writeDismissal } from '../lib/dismissedSuggestions'

interface Props {
  suggestions: DueSuggestion[]
  onAdd: (suggestion: DueSuggestion) => void
}

export function FrequencySuggestionBanner({ suggestions, onAdd }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [, setDismissTick] = useState(0)

  const eligible = suggestions.filter(s => !isDismissed(s.name))

  useEffect(() => {
    if (eligible.length === 0) return
    const id = setInterval(() => {
      setCurrentIndex(i => (i + 1) % eligible.length)
    }, 6000)
    return () => clearInterval(id)
  }, [eligible.length])

  if (eligible.length === 0) return null

  const current = eligible[currentIndex % eligible.length]
  const meta = [current.brand, ...current.stores].filter(Boolean).join(' · ')

  function handleDismiss() {
    writeDismissal(current.name, current.dismissal_ttl_days)
    setDismissTick(t => t + 1)
  }

  return (
    <div className="freq-banner">
      <div className="freq-banner__content">
        <span className="freq-banner__name">{current.name}</span>
        {meta && <span className="freq-banner__meta">{meta}</span>}
      </div>
      <button className="freq-banner__add" onClick={() => onAdd(current)}>
        + Añadir
      </button>
      <button className="freq-banner__dismiss" onClick={handleDismiss} aria-label="Ignorar">
        ✕
      </button>
    </div>
  )
}
