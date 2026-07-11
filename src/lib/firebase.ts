import { initializeApp, getApps } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
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
export const db = getFirestore(app);
export const storage = getStorage(app);

// Opt-in only (VITE_USE_FIREBASE_EMULATOR=true) — every other build/run talks
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
