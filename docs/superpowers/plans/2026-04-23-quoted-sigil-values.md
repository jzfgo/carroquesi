# Quoted Sigil Values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to wrap any sigil value (or the item name) in single or double quotes so that sigil characters inside the quotes are treated as literal text rather than field delimiters.

**Architecture:** A pre-tokenise pass runs a regex over the raw string before the word-loop, replacing complete quoted sequences with null-byte-delimited placeholders. The word-loop itself is unchanged. After the loop, a `restore` helper substitutes placeholders back into the assembled field strings.

**Tech Stack:** TypeScript, Vitest

---

## File Map

| File | Change |
|---|---|
| `frontend/src/parseInput.ts` | Add pre-tokenise step + `restore` helper + apply restore at 3 field-assembly call sites |
| `frontend/src/parseInput.test.ts` | Add `describe('quoted sigil values', ...)` block with 10 new test cases |

---

### Task 1: Write failing tests for quoted sigil values

**Files:**
- Modify: `frontend/src/parseInput.test.ts`

- [ ] **Step 1: Add the failing test block**

Append the following `describe` block at the end of `frontend/src/parseInput.test.ts`, just before the final closing `})`:

```ts
  describe('quoted sigil values', () => {
    test("single-quoted brand with + inside: #'Marca + Bio'", () => {
      const result = parseInput("#'Marca + Bio'")
      expect(result.brand).toBe('Marca + Bio')
      expect(result.name).toBe('')
    })

    test('double-quoted brand with + inside: #"Eco +"', () => {
      const result = parseInput('#"Eco +"')
      expect(result.brand).toBe('Eco +')
    })

    test("single-quoted store with + inside: @'Tienda + co'", () => {
      const result = parseInput("@'Tienda + co'")
      expect(result.stores).toEqual(['Tienda + co'])
    })

    test('double-quoted standalone name with sigil chars: "Producto +Bio" +3', () => {
      const result = parseInput('"Producto +Bio" +3')
      expect(result.name).toBe('Producto +Bio')
      expect(result.quantity).toBe('3')
    })

    test("single-quoted multi-word standalone name", () => {
      const result = parseInput("'Aceite de oliva virgen extra'")
      expect(result.name).toBe('Aceite de oliva virgen extra')
    })

    test('quoted brand composes with unquoted store', () => {
      const result = parseInput('leche #"Marca + Bio" @Mercadona')
      expect(result.name).toBe('leche')
      expect(result.brand).toBe('Marca + Bio')
      expect(result.stores).toEqual(['Mercadona'])
    })

    test('quoted brand and quoted store', () => {
      const result = parseInput('#"Marca + Bio" @"Tienda + co"')
      expect(result.brand).toBe('Marca + Bio')
      expect(result.stores).toEqual(['Tienda + co'])
    })

    test('unclosed double quote is treated as literal', () => {
      const result = parseInput('#"unclosed')
      expect(result.brand).toBe('"unclosed')
    })

    test('unclosed single quote in name is treated as literal', () => {
      const result = parseInput("'unclosed")
      expect(result.name).toBe("'unclosed")
    })

    test('empty double-quoted brand is ignored', () => {
      const result = parseInput('#""')
      expect(result.brand).toBeNull()
    })
  })
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
cd frontend && npm run test -- src/parseInput.test.ts
```

Expected: the 10 new tests FAIL. All pre-existing tests in the file should still PASS. If any pre-existing test fails, stop — something is wrong with the test file edit.

---

### Task 2: Implement quoted-value parsing

**Files:**
- Modify: `frontend/src/parseInput.ts`

- [ ] **Step 1: Replace the entire contents of `frontend/src/parseInput.ts`**

```ts
import type { ParsedInput } from './types'

const SINGLE_SIGIL_MAP: Record<string, keyof Omit<ParsedInput, 'name' | 'stores'>> = {
  '+': 'quantity',
  '#': 'brand',
}

const PRICE_SIGILS = new Set(['$', '€'])
const PRICE_RE = /^(\d+([,.]\d{1,2})?|[,.]\d{1,2})(\/kg)?$/i
const QUOTED_RE = /([+#@$€|]?)(?:"([^"]*)"|'([^']*)')/g

export function parseInput(raw: string): ParsedInput {
  // Replace complete quoted sequences with null-byte-delimited placeholders so
  // the word-loop never sees sigil characters that are meant to be literal text.
  // Unclosed quotes produce no regex match and pass through unchanged.
  const placeholders: string[] = []
  const withPlaceholders = raw.replace(QUOTED_RE, (_match, sigil, dq, sq) => {
    const key = `\x00q${placeholders.length}\x00`
    placeholders.push(dq !== undefined ? dq : sq)
    return `${sigil}${key}`
  })
  const restore = (s: string) =>
    s.replace(/\x00q(\d+)\x00/g, (_, i) => placeholders[+i])

  const words = withPlaceholders.trim().split(/\s+/).filter(Boolean)

  const result: ParsedInput = { name: '', quantity: null, brand: null, stores: [] }
  const nameWords: string[] = []

  let currentField: keyof Omit<ParsedInput, 'name' | 'stores'> | '@' | null = null
  const tokenWords: Record<string, string[]> = {}
  const storeEntries: string[][] = []

  for (const word of words) {
    const sigil = word[0]

    if (sigil === '|') {
      const digits = word.slice(1)
      if (/^\d{8}$|^\d{13}$/.test(digits) && result.ean === undefined) {
        result.ean = digits
      }
    } else if (PRICE_SIGILS.has(sigil)) {
      if (result.price === undefined) {
        const rest = word.slice(1)
        const match = rest.match(PRICE_RE)
        if (match) {
          const normalized = match[1].replace(/[,.]/, '.')
          result.price = parseFloat(normalized)
          result.pricePer = match[3] ? 'KILOGRAM' : null
        }
      }
      // Price is single-token: do not update currentField
    } else if (sigil === '@') {
      storeEntries.push([word.slice(1)])
      currentField = '@'
    } else if (sigil in SINGLE_SIGIL_MAP) {
      const field = SINGLE_SIGIL_MAP[sigil]
      if (!(field in tokenWords)) {
        tokenWords[field] = [word.slice(1)]
      }
      currentField = field
    } else if (currentField === '@') {
      storeEntries[storeEntries.length - 1].push(word)
    } else if (currentField) {
      tokenWords[currentField as string].push(word)
    } else {
      nameWords.push(word)
    }
  }

  result.name = restore(nameWords.join(' '))

  for (const [field, parts] of Object.entries(tokenWords)) {
    const value = restore(parts.join(' ')).trim()
    if (value.length > 0) {
      (result as unknown as Record<string, unknown>)[field] = value
    }
  }

  result.stores = [...new Set(
    storeEntries
      .map(parts => restore(parts.join(' ')).trim())
      .filter(s => s.length > 0)
  )]

  return result
}
```

- [ ] **Step 2: Run the full test suite**

```bash
cd frontend && npm run test -- src/parseInput.test.ts
```

Expected: ALL tests pass — both the 10 new quoted-value tests and all pre-existing tests.

If any pre-existing test fails, the most likely cause is the `tokenWords` assembly change (the original used `parts.join('').length > 0`; the new code uses `restore(parts.join(' ')).trim().length > 0`). Both produce identical results for non-quoted input, so a failure would indicate a bug in the replacement — double-check the file was written exactly as shown.

- [ ] **Step 3: Run the type-checker**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

Expected: no errors. (The `npm run typecheck` at repo root always passes silently due to `files: []` in the root tsconfig — always use this command instead.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/parseInput.ts frontend/src/parseInput.test.ts
git commit -m "feat: support quoted sigil values in SmartInputBar input parser"
```

---

### Task 3: Mark TODO item as done

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Mark the item complete**

In `TODO.md`, change:

```
- [ ] **Quoted sigil values in SmartInputBar**
```

to:

```
- [x] **Quoted sigil values in SmartInputBar**
```

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "chore: mark quoted sigil values as done in TODO"
```
