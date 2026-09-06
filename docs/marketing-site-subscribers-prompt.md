Wire the newsletter signup and the blog's subscribe form to the same existing backend endpoint, so both feed the "Subscribers" screen in the POS.

## The endpoint already exists — don't build a new one
`POST https://pos.polishstation.lk/api/public/newsletter` already works today (Admin SDK write on the POS server, not a direct Firestore write from this site — there is no Firebase config or security-rules exposure to worry about on this side at all).

If the newsletter section of this site already calls this endpoint, leave it exactly as is — no changes needed there. The only new work is pointing the **blog page's** subscribe form at the same endpoint.

## Request

```ts
await fetch("https://pos.polishstation.lk/api/public/newsletter", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: email.trim(),
    company: "", // honeypot -- see below
  }),
});
```

Fields:
- `email` (required) — validate it looks like an email client-side before sending; the server also validates and will reject an invalid one.
- `company` (required, always send it) — a honeypot. Always send it as an **empty string** from a real visitor. It must be a real form field on the page, visually hidden with CSS (not `display:none` — see below), and never something a visitor would think to fill in. If it arrives non-empty, the server silently pretends the request succeeded (so a bot never learns it was caught) but does not actually subscribe the address.

## Response
```ts
{ ok: true } | { ok: false, error: string }
```
Show `error` to the visitor on failure (don't fail silently); show a clear success state on `ok: true`.

## What this does NOT need
- No Firebase SDK, no Firebase config, no security rules on this side — the write happens entirely on the POS server via the Admin SDK, which bypasses Firestore rules by design. There is nothing here that can be misconfigured into a permission error the way a direct-Firestore-write feature could be.
- No new CORS setup — `polishstation.lk` and `www.polishstation.lk` are already in the allowed origins on the POS server for this endpoint.
- Resubmitting the same email is safe and expected — the write is an idempotent upsert keyed by email, so someone subscribing from both the newsletter box and the blog page just re-confirms the same subscription, it doesn't create a duplicate or error.

## Honeypot field example
```html
<label style="position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden;">
  Company
  <input type="text" name="company" tabindex="-1" autocomplete="off" />
</label>
```
Visually hidden via CSS positioning (not `display:none` or `hidden`, which some bots skip filling precisely because they detect those), and never reachable by Tab (`tabindex="-1"`) so a real visitor can't stumble into it.

## Verifying it worked
After wiring the blog form, submit a real test email and confirm it shows up on the POS's Subscribers screen (`pos.polishstation.lk/subscribers`) with source `polishstation.lk` shortly after. If it doesn't show up, check the browser console/network tab for the actual response from `/api/public/newsletter` before assuming anything about Firestore — the endpoint's response body will say what went wrong.
