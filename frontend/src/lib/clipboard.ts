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

/**
 * Copy text that has to be fetched before it can be copied.
 *
 * WebKit drops the user's gesture across an await, and both paths in
 * `copyToClipboard` need that gesture — the legacy `execCommand` fallback is
 * gated on it too, so it does not rescue the modern one. A handler that waits
 * for the network and then copies is therefore refused on Safari and iOS.
 *
 * `clipboard.write` exists for this case: it takes a promise, so the call
 * happens on the tap and the value arrives later.
 */
export async function copyWhenReady(text: Promise<string>): Promise<boolean> {
  const blob = text.then((t) => new Blob([t], { type: 'text/plain' }))
  // Nothing reads `blob` when the fallback below runs, and an unobserved
  // rejection is a console error everywhere. This marks it read; callers still
  // learn the real outcome from the boolean.
  void blob.catch(() => undefined)

  try {
    // A `ClipboardItem` that exists and a `ClipboardItem` that accepts a promise
    // are separate facts, and engines have shipped the first without the second.
    // Building it inside the try covers both, and the missing-constructor case.
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })])
    return true
  } catch {
    // Unsupported or refused. Wait for the text and take the ordinary path,
    // which still works wherever the gesture is not required.
    return text.then(copyToClipboard, () => false)
  }
}
