/// <reference types="vite/client" />

/** The package.json version, injected at build time via Vite `define`. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string
  readonly VITE_FIREBASE_VAPID_KEY?: string
  readonly VITE_RECAPTCHA_SITE_KEY?: string
  readonly VITE_BACKEND_URL?: string
  readonly VITE_DEV_USER_ID?: string
  readonly VITE_WAITLIST_ENABLED?: string
  readonly VITE_ENVIRONMENT_LABEL?: string
}
