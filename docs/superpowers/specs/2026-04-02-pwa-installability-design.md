# PWA Installability — Design Spec

**Date:** 2026-04-02
**Scope:** Make CarroQueSí installable as a PWA (Add to Home Screen). No offline caching. No push notifications.

---

## Goals

- Users can install CarroQueSí to their phone's home screen on Android (Chrome) and iOS (Safari).
- The app launches in standalone mode (no browser chrome).
- A branded icon and splash screen appear on install.
- The install prompt is discoverable without being intrusive.

## Out of Scope

- Offline support / service worker caching
- Push notifications
- Background sync

---

## 1. Icons

A CQ monogram SVG is the source icon: white bold "CQ" text on a `#aa3bff` (purple) rounded square background, with a small gold checkmark badge in the top-right corner.

The `@vite-pwa/assets-generator` CLI generates all required PNG sizes from the SVG source:

| File | Size | Purpose |
|------|------|---------|
| `public/icon-192.png` | 192×192 | Android home screen |
| `public/icon-512.png` | 512×512 | Chrome install splash |
| `public/icon-512-maskable.png` | 512×512 | Android adaptive icon (safe zone padded) |
| `public/apple-touch-icon-180.png` | 180×180 | iOS home screen |

The SVG source lives at `public/icon.svg`.

---

## 2. Manifest & vite-plugin-pwa Config

`vite-plugin-pwa` is added to `vite.config.ts`. No separate `manifest.json` file — everything is declared in the plugin config.

**Manifest values:**

| Field | Value |
|-------|-------|
| `name` | CarroQueSí |
| `short_name` | Carroquesí |
| `description` | Lista de compras colaborativa |
| `theme_color` | `#aa3bff` |
| `background_color` | `#ffffff` |
| `display` | `standalone` |
| `start_url` | `/` |
| `icons` | 192, 512, 512 maskable, 180 apple-touch |

**Service worker strategy:** `generateSW` with Workbox configured for network-only behavior — no precaching, no runtime caching. This is the minimum viable service worker required to satisfy the PWA installability criteria.

```ts
// vite.config.ts (additions)
VitePWA({
  registerType: 'autoUpdate',
  strategies: 'generateSW',
  workbox: {
    navigateFallback: null,
    runtimeCaching: [],
  },
  manifest: { /* values above */ },
  devOptions: { enabled: true },
})
```

`devOptions: { enabled: true }` allows testing the install prompt in local dev via Vite.

`index.html` gets a `<meta name="theme-color" content="#aa3bff">` tag. The plugin automatically injects the manifest link and `apple-mobile-web-app-capable` meta tags.

---

## 3. Install Prompt UX

### InstallBanner

A new `InstallBanner` component rendered at the top of `DashboardScreen`'s main content area, above the list.

**Chrome/Android flow:**
- Listens for the `beforeinstallprompt` event on mount and stores the deferred prompt.
- Shows the banner only when the deferred prompt is available and the user hasn't dismissed it before.
- "Instalar" button calls `prompt()` on the deferred event; on `userChoice` resolution the banner hides itself.
- "✕" dismiss button sets `localStorage.setItem('pwa-install-dismissed', '1')` and hides the banner permanently.

**iOS flow:**
- Detects iOS via `navigator.userAgent` and checks `('standalone' in navigator)` to identify Safari.
- If not already installed (`window.navigator.standalone !== true`), shows the banner with iOS-specific copy: "Toca Compartir → Añadir a pantalla de inicio".
- Same dismiss behavior as Android.

**Already installed:** If `window.matchMedia('(display-mode: standalone)').matches`, the banner never renders.

**Dismissed:** If `localStorage.getItem('pwa-install-dismissed')` is set, the banner never renders.

### Avatar Dropdown Menu

The avatar button in `DashboardScreen`'s header is converted from a direct `signOut()` call into a toggle that opens a small dropdown menu. The menu contains:

1. **Instalar app** — triggers the stored `beforeinstallprompt` (hidden on iOS, hidden if already installed, hidden if no prompt is available)
2. **Cerrar sesión** — calls `signOut()`

The dropdown closes on outside click (via a `useEffect` with a `mousedown` listener on `document`) and on Escape keypress.

The `InstallBanner` and the avatar dropdown share install prompt state. Because `beforeinstallprompt` fires only once, it must be captured in a single place. `usePWAInstall` is called once inside `DashboardScreen` and its return values (`promptInstall`, `isInstallable`, `isInstalled`) are passed as props to `InstallBanner` and used directly in the avatar dropdown (which lives in `DashboardScreen`). The hook lives at `frontend/src/hooks/usePWAInstall.ts` and is responsible for:
- Capturing and storing the `beforeinstallprompt` event
- Exposing `promptInstall()`, `isInstallable`, and `isInstalled`

---

## 4. Component & File Changes

| File | Change |
|------|--------|
| `frontend/vite.config.ts` | Add `vite-plugin-pwa` |
| `frontend/public/icon.svg` | New — CQ monogram SVG source |
| `frontend/public/icon-192.png` | Generated |
| `frontend/public/icon-512.png` | Generated |
| `frontend/public/icon-512-maskable.png` | Generated |
| `frontend/public/apple-touch-icon-180.png` | Generated |
| `frontend/index.html` | Add `theme-color` meta tag |
| `frontend/src/hooks/usePWAInstall.ts` | New hook — shared install prompt state |
| `frontend/src/components/InstallBanner.tsx` | New component |
| `frontend/src/components/InstallBanner.css` | New styles |
| `frontend/src/components/DashboardScreen.tsx` | Add InstallBanner, convert avatar to dropdown |
| `frontend/src/components/DashboardScreen.css` | Add avatar dropdown + banner styles |

---

## 5. Testing

- **Unit:** `usePWAInstall` hook — mock `beforeinstallprompt` event, verify prompt is captured and `isInstallable` becomes true; verify dismissed state from localStorage suppresses the banner.
- **Unit:** `InstallBanner` — renders for Android (mock event), renders iOS copy when userAgent matches iOS and not standalone, does not render when dismissed or already installed.
- **Manual (Chrome DevTools):** Application → Manifest → check all fields; Service Workers → verify registered; Lighthouse PWA audit → installability checks pass.
- **Manual (iOS Safari):** Verify banner shows iOS-specific copy; verify it disappears after dismiss; verify standalone launch hides banner.
