import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initTheme } from './lib/theme'

// Before the first render, not inside it: a phone set to dark should never see
// a white sheet flash past on the way in.
initTheme()

/**
 * The offline write queue's store, from the releases that had one.
 *
 * Deleting it loses, once, whatever a device happened to be holding at the
 * moment it upgraded — writes the band used to promise «se enviarán solos».
 * That cost was accepted deliberately rather than keeping a drain alive for
 * one more release to empty it; see the removal spec.
 *
 * **This can go once nobody is upgrading from a release that still wrote to
 * it.** Left in forever it is boot-time work against a database that no
 * version of the app creates any more.
 */
indexedDB?.deleteDatabase('cqs_offline')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
