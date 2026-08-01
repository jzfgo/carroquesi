import { getAI, GoogleAIBackend, type AI } from 'firebase/ai'
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { getAuth, type Auth } from 'firebase/auth'
import {
  getMessaging,
  isSupported as isMessagingSupported,
  type Messaging,
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

let app: FirebaseApp | undefined

// Lazy so a missing or bad Firebase config surfaces where Firebase is first
// used, not as a crash while this module is being imported.
function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = initializeApp(firebaseConfig)
    // App Check must attach before any feature touches the app, so it rides
    // along with app creation.
    if (!IS_DEV && RECAPTCHA_SITE_KEY) {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true,
      })
    }
  }
  return app
}

let auth: Auth | undefined

export function getFirebaseAuth(): Auth {
  return (auth ??= getAuth(getFirebaseApp()))
}

let ai: AI | undefined

export function getFirebaseAi(): AI {
  return (ai ??= getAI(getFirebaseApp(), { backend: new GoogleAIBackend() }))
}

let messagingPromise: Promise<Messaging | null> | undefined

/**
 * Resolves to null where the browser has no Push API — notably iOS Safari
 * outside a home-screen app, where the messaging entrypoint cannot initialise
 * at all. Callers must treat null as "push is impossible here", not "not yet".
 * The promise is memoised, so concurrent callers share one isSupported()
 * probe and at most one getMessaging() construction.
 */
export function getMessagingIfSupported(): Promise<Messaging | null> {
  return (messagingPromise ??= isMessagingSupported().then((ok) =>
    ok ? getMessaging(getFirebaseApp()) : null,
  ))
}
