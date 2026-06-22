import '@testing-library/jest-dom';

// Node.js 25+ ships a stub Web Storage global that lacks the standard methods.
// jsdom provides a proper implementation on `window`; re-assert it here so
// that bare `localStorage` references in tests hit the jsdom object.
const inMemoryStorage = (() => {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: inMemoryStorage,
  writable: true,
  configurable: true,
});
