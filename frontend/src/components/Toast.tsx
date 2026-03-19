import { useEffect } from 'react'
import './Toast.css'

interface Props {
  message: string
  onDismiss: () => void
}

export function Toast({ message, onDismiss }: Props) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 3000)
    return () => clearTimeout(id)
  }, [onDismiss])

  return (
    <div className="toast" role="alert">
      {message}
    </div>
  )
}
