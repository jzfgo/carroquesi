export const IS_DEV = import.meta.env.DEV

export const FIREBASE_API_KEY = import.meta.env.VITE_FIREBASE_API_KEY as
  | string
  | undefined
export const FIREBASE_AUTH_DOMAIN = import.meta.env
  .VITE_FIREBASE_AUTH_DOMAIN as string | undefined
export const FIREBASE_PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID as
  | string
  | undefined
export const FIREBASE_STORAGE_BUCKET = import.meta.env
  .VITE_FIREBASE_STORAGE_BUCKET as string | undefined
export const FIREBASE_MESSAGING_SENDER_ID = import.meta.env
  .VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined
export const FIREBASE_APP_ID = import.meta.env.VITE_FIREBASE_APP_ID as
  | string
  | undefined
export const FIREBASE_MEASUREMENT_ID = import.meta.env
  .VITE_FIREBASE_MEASUREMENT_ID as string | undefined

export const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? ''

export const BACKEND_URL = (
  import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
).replace(/\/$/, '')

export const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID as
  | string
  | undefined

export const IS_WAITLIST_ENABLED =
  import.meta.env.VITE_WAITLIST_ENABLED === 'true'
