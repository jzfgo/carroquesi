import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'coverage', 'src/apiSchema.generated.ts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      eslintConfigPrettier,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // A mock built as vi.fn().mockX(value) holds its value as an attachment,
  // and mockReset wipes attachments before every test. Evaluated at module
  // load, the mock then returns undefined and the test can pass vacuously.
  // Bake the value in instead: vi.fn(() => value). The rule bans the spelling
  // everywhere because the AST cannot tell module scope from a test body.
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.callee.object.name='vi'][callee.object.callee.property.name='fn'][callee.property.name=/^mock/]",
          message:
            'vi.fn().mockX(value) is wiped by mockReset when evaluated at module load. Bake the implementation in: vi.fn(() => value).',
        },
      ],
    },
  },
])
