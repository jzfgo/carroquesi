/**
 * Copy text to the clipboard, returning whether it succeeded.
 *
 * `navigator.clipboard` only exists in a secure context (HTTPS or localhost), so on a
 * plain-HTTP origin — e.g. a LAN IP during `just dev network` device testing — it's
 * undefined and the modern path can't run. Fall back to the legacy
 * `document.execCommand('copy')` selection trick, which works on insecure origins.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or unavailable — fall through to the legacy path.
    }
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
