import { initializeApp, getApps } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);

// Offline persistence (inspection module Phase 6 — "do not defer"): an
// IndexedDB-backed cache so a signed-in staff member can keep creating and
// editing ANY document while genuinely offline, not only inspections —
// this is an SDK-wide setting, there's no way to scope it to one
// collection — with the SDK's own built-in write queue syncing
// automatically on reconnect. That queue is exactly what an inspection
// document needs to be "fully creatable and editable offline"; the photo
// queue below handles Storage uploads separately, since Storage has no
// equivalent built-in offline behaviour.
//
// Guarded to the browser only: persistentLocalCache touches `indexedDB`,
// which doesn't exist during this app's SSR render pass, and
// getFirestore()'s plain in-memory cache is exactly what SSR needs anyway
// (a server render never persists between requests). The try/catch handles
// Vite HMR re-running this module against an app that already has
// Firestore initialized from a previous pass — initializeFirestore() throws
// in that case; the persistent-cache settings from the first call already
// stuck, so falling back to getFirestore() just returns that same instance.
export const db = (() => {
  if (typeof window === "undefined") return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(app);
  }
})();

export const storage = getStorage(app);

// Opt-in only (VITE_USE_FIREBASE_EMULATOR=true): every other build/run talks
// to the real project exactly as before. Exists so `npm run dev` and
// Playwright tests can exercise the app (login, bookings, staff mgmt)
// without writing test data into the live production Firestore project,
// which is otherwise the *only* backend this app can ever talk to locally.
if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true" && typeof window !== "undefined") {
  const g = globalThis as unknown as { __psEmulatorConnected?: boolean };
  if (!g.__psEmulatorConnected) {
    g.__psEmulatorConnected = true;
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
  }
}
