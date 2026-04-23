# Quoted Sigil Values — Design Spec

**Date:** 2026-04-23
**Status:** Approved

---

## Problem

The SmartInputBar parses free-text input by treating the first character of each whitespace-separated token as a potential sigil (`+`, `#`, `@`, `$`, `€`, `|`). This means any value whose text contains a sigil character will corrupt the parse. For example:

- `#Marca + Bio` → brand = `Marca`, quantity = `Bio` (wrong)
- `Producto +Bio +3` → name = `Producto`, quantity = `Bio` (wrong — `+Bio` hijacks the name)

Stores can technically contain sigil chars too (e.g. a store named `C&Co.` with `+` would be `@C+Co.`), and so can item names typed before any sigil.

---

## Solution

Support wrapping any sigil value — or the item name — in single or double quotes so that the quoted content is treated as a single opaque token, immune to sigil-char interpretation.

**Examples:**

```
#'Marca + Bio'           → brand = "Marca + Bio"
#"Eco +"                 → brand = "Eco +"
@'Tienda + co'           → store = "Tienda + co"
"Producto +Bio" +3       → name = "Producto +Bio", quantity = "3"
'Aceite de oliva virgen' → name = "Aceite de oliva virgen"
```

Unclosed quotes pass through as literals — no special behavior, no error:

```
#"unclosed    → brand = "\"unclosed"
'unclosed     → name = "'unclosed"
```

---

## Scope

**Only `frontend/src/parseInput.ts` changes** (plus its test file). The public API `parseInput(raw: string): ParsedInput` is unchanged. No other file is touched.

---

## Algorithm

The implementation wraps the existing word-loop in a pre-tokenise / restore pattern. The loop itself is **not modified**.

### Step 1 — Pre-tokenise

Before `split(/\s+/)`, run a global regex replace over the raw string:

```
/([+#@$€|]?)(?:"([^"]*)"|'([^']*)')/g
```

- Group 1: optional sigil character immediately before the opening quote
- Groups 2/3: content inside double or single quotes respectively
- Unclosed quotes produce no match (both closing quotes are required) → pass through unchanged

Each complete match is replaced by `${sigil}${placeholder}`, where:
- `placeholder = \x00q{i}\x00` (null-byte delimited; impossible in user-typed input)
- The original quoted content is stored in a `placeholders: string[]` array at index `i`

**Transform examples:**

| Raw input | After pre-tokenise |
|---|---|
| `#"Marca + Bio" leche` | `#\x00q0\x00 leche` |
| `"Producto +Bio" +3` | `\x00q0\x00 +3` |
| `@'El Corte Inglés'` | `@\x00q0\x00` |
| `#"unclosed` | `#"unclosed` (no match) |
| `#''` | `#\x00q0\x00` (empty content, i=0) |

### Step 2 — Existing word-loop (unchanged)

After pre-tokenisation, the string is split on whitespace and iterated as before.

- `#\x00q0\x00` → `word[0]` is `#` → assigned to brand field; `word.slice(1)` = `\x00q0\x00`
- `\x00q0\x00` (standalone) → first char is `\x00`, not a sigil → goes to name (or current field context)
- All other tokens: identical behaviour to today

### Step 3 — Restore placeholders

After the loop, a `restore` helper substitutes placeholders back before assembling result fields:

```ts
const restore = (s: string) => s.replace(/\x00q(\d+)\x00/g, (_, i) => placeholders[+i])
```

Applied at three call sites:

1. `result.name = restore(nameWords.join(' '))`
2. In the `tokenWords` loop: `result[field] = restore(parts.join(' '))`
3. In the stores assembly: `restore(parts.join(' ').trim())`

The existing empty-string guard (`parts.join('').length > 0`) naturally handles empty quoted strings like `#''` — they produce no brand assignment.

---

## Test Cases

New tests in a `describe('quoted sigil values', ...)` block in `parseInput.test.ts`:

| Input | Expected result |
|---|---|
| `#'Marca + Bio'` | brand = `Marca + Bio` |
| `#"Eco +"` | brand = `Eco +` |
| `@'Tienda + co'` | stores = `['Tienda + co']` |
| `"Producto +Bio" +3` | name = `Producto +Bio`, quantity = `3` |
| `'Aceite de oliva virgen extra'` | name = `Aceite de oliva virgen extra` |
| `leche #"Marca + Bio" @Mercadona` | name = `leche`, brand = `Marca + Bio`, stores = `['Mercadona']` |
| `#"Marca + Bio" @"Tienda + co"` | brand = `Marca + Bio`, stores = `['Tienda + co']` |
| `#"unclosed` | brand = `"unclosed` (literal) |
| `'unclosed` | name = `'unclosed` (literal) |
| `#''` | brand = null (empty quoted string ignored) |

All existing tests must continue to pass without modification.

---

## What is not changing

- `SmartInputBar.tsx` — no changes; the component passes `raw` to `parseInput` as today
- `types.ts` — `ParsedInput` shape is unchanged
- Backend — no changes; the parsed values are sent to the API as strings, same as today
- Price (`$`/`€`) and EAN (`|`) sigils — quoting these silently fails (placeholder won't match `PRICE_RE` or the EAN digit regex); acceptable since there is no real use case for quoting a number
