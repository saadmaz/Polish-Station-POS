Wire the contact form on this site to write directly into the Polish Station POS's Firestore project, so submissions show up on the "Inquiries" screen in the POS.

## Firebase project
- Project id: `pos-polishstation`
- Get the web app config (apiKey, authDomain, storageBucket, messagingSenderId, appId) from Firebase Console → Project Settings → General → Your apps → the Web app for this project (or ask for it if this site doesn't have a Firebase app registered yet — register one, "polishstation.lk marketing site", if not).
- Add the `firebase` npm package if not already present, and initialize a client app with that config (same pattern as `initializeApp`/`getFirestore` from the `firebase/app` and `firebase/firestore` packages).

## Collection: `inquiries`
Each submission is one document with **exactly** these fields (no extra fields — the security rules will reject anything else):

```ts
{
  id: string,             // any unique id, e.g. crypto.randomUUID()
  name: string,            // 2-80 characters
  contactNumber: string,   // 7-20 characters, whatever format the visitor typed
  email: string | null,    // null if left blank, otherwise a string
  message: string,         // 5-2000 characters
  createdAt: string,       // new Date().toISOString() -- set this yourself, client-side
}
```

Write it with the doc id equal to the `id` field, e.g.:

```ts
import { getFirestore, doc, setDoc } from "firebase/firestore";

const db = getFirestore(app);
const id = crypto.randomUUID();
await setDoc(doc(db, "inquiries", id), {
  id,
  name: name.trim(),
  contactNumber: contactNumber.trim(),
  email: email.trim() || null,
  message: message.trim(),
  createdAt: new Date().toISOString(),
});
```

## Form fields
- Name * (required)
- Contact Number * (required)
- Email (optional)
- Message * (required)

Validate these client-side before writing (matching the length bounds above) — the Firestore security rules enforce the same bounds server-side as a backstop, so a submission that violates them will be **rejected outright**, not silently truncated. Show a clear error to the visitor if the write fails (don't fail silently), and a clear success state if it succeeds.

## What NOT to do
- Don't try to read from the `inquiries` collection — the security rules only allow `create`, nothing else, from an unauthenticated visitor. Reads/updates/deletes are staff-only from the POS.
- Don't send any field beyond the six listed above (not even an extra empty string field) — the rules reject writes with any unlisted key.
- Don't set `createdAt` to anything but the actual submission time as an ISO-8601 string (not a Firestore Timestamp/serverTimestamp() — this collection stores plain ISO strings to match the rest of the app).

## Notes
- There's currently no spam protection beyond the field/shape validation above (no App Check, no honeypot, no rate limiting) — acceptable for now, but worth revisiting if this collection starts attracting junk submissions.
- The POS side already has a working "Inquiries" screen reading this collection, sorted newest-first, with tap-to-call and WhatsApp links built from `contactNumber`, and a delete action for staff — nothing further is needed from this repo beyond the write above.
