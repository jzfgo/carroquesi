import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// The offline write queue is gone; drop its database so writes queued by a
// pre-removal version do not sit stranded forever.
indexedDB.deleteDatabase('cqs_offline')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
