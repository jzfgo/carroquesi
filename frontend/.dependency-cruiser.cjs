/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'lib-is-leaf',
      comment: 'lib/ must stay UI-free',
      severity: 'error',
      from: { path: '^src/lib' },
      to: { path: '^src/(components|hooks|pages|contexts)' },
    },
    {
      name: 'sw-worker-safe',
      comment: 'sw.ts may only import worker-safe internal modules',
      severity: 'error',
      from: { path: '^src/sw\\.ts$' },
      to: {
        path: '^src/',
        pathNot: '^src/lib/pushCopy\\.ts$',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'generated-schema-via-types',
      severity: 'error',
      from: { pathNot: '^src/types\\.ts$' },
      to: { path: '^src/apiSchema\\.generated\\.ts$' },
    },
    {
      name: 'pdfjs-via-accessor',
      severity: 'error',
      from: { pathNot: '^src/lib/pdfjs\\.ts$' },
      to: { path: 'node_modules/pdfjs-dist' },
    },
    {
      name: 'firebase-via-lib',
      comment:
        'Firebase clients must be constructed lazily via lib/firebase.ts; SDK imports are confined to this allowlist.',
      severity: 'error',
      from: {
        pathNot:
          '^src/(lib/(firebase|push|receiptAi)\\.ts|contexts/AuthContext\\.tsx)$',
      },
      to: { path: 'node_modules/(firebase|@firebase)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.app.json' },
    tsPreCompilationDeps: true,
    exclude: { path: '\\.test\\.(ts|tsx)$|vitest\\.setup\\.ts$' },
  },
}
