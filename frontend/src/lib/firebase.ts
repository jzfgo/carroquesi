import { getAI, GoogleAIBackend } from 'firebase/ai'
import { initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { getAuth } from 'firebase/auth'
import {
  getMessaging,
  isSupported as isMessagingSupported,
} from 'firebase/messaging'
import {
  FIREBASE_API_KEY,
  FIREBASE_APP_ID,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_MEASUREMENT_ID,
  FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
  IS_DEV,
  RECAPTCHA_SITE_KEY,
} from './environment'

const firebaseConfig = {
  apiKey: FIREBASE_API_KEY,
  authDomain: FIREBASE_AUTH_DOMAIN,
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: FIREBASE_STORAGE_BUCKET,
  messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
  appId: FIREBASE_APP_ID,
  measurementId: FIREBASE_MEASUREMENT_ID,
}

const app = initializeApp(firebaseConfig)

if (!IS_DEV && RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  })
}

export const auth = getAuth(app)
export const ai = getAI(app, { backend: new GoogleAIBackend() })

/**
 * Resolves to null where the browser has no Push API — notably iOS Safari
 * outside a home-screen app, where the messaging entrypoint cannot initialise
 * at all. Callers must treat null as "push is impossible here", not "not yet".
 */
export const messagingPromise = isMessagingSupported().then((ok) =>
  ok ? getMessaging(app) : null,
)
