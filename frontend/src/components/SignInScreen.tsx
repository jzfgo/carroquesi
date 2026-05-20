import { useAuth } from '../contexts/AuthContext'
import { usePageTitle } from '../hooks/usePageTitle'
import { Mascot } from './Mascot'
import { Wordmark } from './Wordmark'
import './SignInScreen.css'

export function SignInScreen() {
  usePageTitle()
  const { signIn } = useAuth()

  return (
    <div className="signin">
      <span className="signin__hand">¡a por ello!</span>
      <Mascot size={160} />
      <h1 className="signin__title"><Wordmark size={56} /></h1>
      <p className="signin__tag">
        Lista de la compra compartida.<br />Sencilla. Para toda la familia.
      </p>
      <button className="signin__cta" onClick={() => void signIn()}>
        Continuar con Google
      </button>
    </div>
  )
}
