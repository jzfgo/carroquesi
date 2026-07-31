import { useTheme } from '../hooks/useTheme'
import { THEME_PREFERENCES, type ThemePreference } from '../lib/theme'
import './AppearanceSegment.css'

const LABELS: Record<ThemePreference, string> = {
  light: 'Claro',
  dark: 'Oscuro',
  system: 'Sistema',
}

/**
 * Three words, not a switch. "Como el sistema" is what most people want and a
 * two-state toggle cannot say it — which is also why it is the factory setting.
 * No drawn thumbnails and no explanatory line underneath: nobody needs a
 * preview of a dark mode, and drawing board-and-sheet here would be showing
 * off the system instead of letting someone choose.
 *
 * This lives in settings and not in the list, the opposite of the board,
 * because the board is the list's identity and the mode is a condition of your
 * eye: the whole household sees the same board, each in their own light.
 */
export function AppearanceSegment() {
  const { preference, setPreference } = useTheme()

  return (
    <span className="appearance-segment" role="radiogroup" aria-label="Aspecto">
      {THEME_PREFERENCES.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={preference === option}
          className={`appearance-segment__option${
            preference === option ? ' appearance-segment__option--on' : ''
          }`}
          onClick={() => setPreference(option)}
        >
          {LABELS[option]}
        </button>
      ))}
    </span>
  )
}
