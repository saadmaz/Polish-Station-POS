Fix the booking-request form on the Bookings page so it matches what the POS backend actually accepts. Submissions currently fail validation outright if they don't match the shape below exactly.

## Update: stop appending "Preferred time" to `notes`

The form's "Preferred time" picker is currently being appended as text onto
the end of `notes` client-side (e.g. `"hii\n\nPreferred time: 8:00 AM - 11:00 AM"`)
because there was no dedicated field for it. There is now — see
`preferredWindow` below. Send the picker's value as its own field and stop
touching `notes` for this; `notes` should only ever contain what the customer
actually typed in the notes box.

## Endpoint
```
POST https://pos.polishstation.lk/api/public/booking
Content-Type: application/json
```
CORS is already open for `polishstation.lk`/`www.polishstation.lk` — no changes needed there.

## Request body — exact shape

```ts
{
  name: string,           // required, 2-100 characters
  phone: string,          // required, 6-24 characters, whatever format the visitor typed (e.g. "071 234 5678" or "+94 71 234 5678")
  email: string,          // optional -- send "" if left blank, NOT omitted and NOT null
  vehicle: string,        // required, e.g. "Toyota Prius 2019" -- one free-text field, not split into make/model
  services: string[],     // required, at least one -- see the EXACT allowed values below
  otherService: string,   // required ONLY if "Other" is among `services` -- otherwise send "" or omit it
  preferredDate: string,  // required, "YYYY-MM-DD" -- see note below, this is NOT the mm/dd/yyyy shown on screen
  preferredWindow: string, // optional -- one of the 4 exact values below; omit the field entirely if the picker has no selection
  notes: string,          // optional -- send "" if left blank; customer free text ONLY, see note above
  utmSource: string,      // optional -- omit if not applicable
  utmMedium: string,      // optional -- omit if not applicable
  utmCampaign: string,    // optional -- omit if not applicable
  landingPage: string,    // optional -- the page the visitor landed on, omit if not tracked
  company: string,        // ALWAYS send "", this is the honeypot -- see below
}
```

### `services` — allowed values (exact strings, case-sensitive)
```
"Paint Correction"
"Cut & Polish"
"Ceramic Coating"
"Graphene Coating"
"Interior Detailing"
"Exterior Detailing"
"Engine Bay Cleaning"
"Headlight Restoration"
"Other"
```
Any value outside this list gets the whole submission rejected — if the checkboxes on the page use different labels or casing than this list, fix the labels (or the values sent) to match exactly. If "Other" is checked, its accompanying text input is required and goes in `otherService`.

### `preferredDate` — important
If the date field is a native `<input type="date">`, its `value` is **always** `YYYY-MM-DD` regardless of the `mm/dd/yyyy` format the browser displays to the visitor — send `input.value` directly, don't reformat it. If it's a custom date picker instead, format the value as `YYYY-MM-DD` before sending (not `mm/dd/yyyy`, not a `Date.toString()`).

### `preferredWindow` — allowed values (exact strings, case-sensitive)
```
"08_11"   // 8:00 AM - 11:00 AM
"11_14"   // 11:00 AM - 2:00 PM
"14_17"   // 2:00 PM - 5:00 PM
"17_19"   // 5:00 PM - 7:00 PM
```
Map the picker's displayed label to the matching code above. If the form has
no such picker yet, omit the field entirely rather than sending an empty
string or guessing.

### Honeypot: `company`
Always send this field, always `""` from a real visitor. Add a form field named `company` that's:
- Visually hidden with CSS positioning (e.g. `position: absolute; left: -9999px`), **not** `display: none` — some bots specifically skip fields hidden that way.
- Never reachable by Tab (`tabindex="-1"`).
- Never labeled anything a real visitor would think to fill in.

If it arrives non-empty, the server pretends the request succeeded (so a bot never learns it was caught) but doesn't actually create anything — so don't be alarmed if a `{ ok: true }` response doesn't show up in the POS; that's the honeypot working as intended, not a bug.

## Response
```ts
{ ok: true } | { ok: false, error: string }
```
Show `error` to the visitor on failure — the current copy on the site ("we'll confirm your slot by phone shortly") is correct messaging for success, keep it. Don't fail silently.

## What NOT to do
- Don't send a `timeWindow` or `serviceId` field — those are old field *names* from a previous version of this contract and no longer exist. `preferredWindow` above is the current, different field for the same concept (time slot); sending the old names is harmless (extra fields aren't rejected) but pointless.
- Don't try to book directly against the real appointment calendar — this endpoint deliberately creates a **request**, not a confirmed slot. Staff review and convert it into a real booking by hand from the POS.
- Don't rate-limit or dedupe on your end — the server already rate-limits by phone number (max 3 submissions per 10 minutes) and will return a friendly error if that's hit.

## Verifying it worked
Submit a real test booking and confirm it shows up on the POS's Leads screen within a few seconds, with the correct services listed, the vehicle text, the preferred date rendering as a real date (not raw `YYYY-MM-DD` text or "Invalid Date"), the preferred time window showing correctly, and `notes` containing only what you actually typed in the notes box (no "Preferred time: ..." text appended). If it doesn't show up, check the browser network tab for the actual JSON response from `/api/public/booking` first — it will say exactly which field failed validation.

Please use a phone number and name that's obviously not a real customer (e.g. "Test — please delete") when testing against the live site, and let the POS side know once you've verified it so the test submission can be cleaned out of the production leads collection.
