# Booking Rules — requirements

## Status note (read this first)

**UPDATE (2026-09-05, later the same day):** the feature described below has
now actually been removed, at the operator's explicit request ("take off the
whole booking rules thing... there is no need for anything like this right
now, I will come back later if required"). This document was written a few
hours earlier, while the feature was still live, specifically so this
removal wouldn't lose the requirement — see the original note below,
preserved for context on why the doc exists and what was verified before
deletion.

The app now behaves exactly as it did before commit `a3502ba` ("feat:
implement booking rules management and enforcement"): the public `/book`
widget always creates `"Pending"` bookings with no lead-time/max-advance
check beyond "not in the past", staff bookings have no policy check either,
and there is no deposit-threshold/percentage computation, cancellation-window
flagging, or no-show flagging tied to a configurable policy. (The
**pre-existing, unrelated** manual per-booking deposit fields —
`Booking.depositAmount`/`depositStatus`, set by hand per booking in the
booking sheet — were not touched; they predate this feature and aren't part
of what "booking rules" ever meant.) Removal was verified with a full
typecheck, lint, the unit test suite, and a production build, all passing.

To rebuild: this file is the spec. The original commit is still in git
history (`a3502ba`) if a line-for-line starting point is wanted, though the
codebase has moved on since (the Notifications feature in particular touches
some of the same files) so it's a reference, not a drop-in patch.

---

### Original note, written before the removal above

This document was requested as a pre-deletion capture of the policy intent
behind Settings → Booking Rules (`BookingRulesPanel`, `src/routes/_app.settings.tsx`),
on the premise that the panel and its enforcement are about to be removed.

**As of the date this file was written (2026-09-05), that is not yet true.**
The seven fields below are not an unimplemented spec — they are live,
server-enforced, Firestore-backed code, verified against the actual source
twice this session (once by re-deriving each field's read sites from
scratch, once again while writing this document) and covered by 16 boundary
unit tests (`src/lib/booking-rules.test.ts`) plus e2e coverage
(`scripts/e2e/booking-flow.mjs`, `scripts/e2e/staff-booking-flow.mjs`).

This document exists so that **if** the panel and/or its enforcement is
deleted after this point, the requirement isn't lost with it — not because
it has already been deleted. Anyone consulting this file to rebuild the
feature should start from the file/function pointers below, which describe
what existed at the moment of writing (recoverable from git history at this
commit if it's since been removed).

No production Firestore value is captured here beyond the coded defaults
below — this environment has no read access to the live `settings/bookingRules`
document. If real operator-tuned values differ from the defaults, an admin
must read them from the still-live Settings → Booking Rules panel and record
them here before the panel is deleted; after deletion they're only
recoverable from a Firestore backup/export of that one document.

## Per-field requirements

### 1. `leadTimeMinutes` — "Minimum lead time"

- **Intended meaning**: the shortest gap, in minutes, allowed between "now"
  and a booking's start time. A booking inside this window is rejected.
- **Coded default**: 30 minutes (`DEFAULT_BOOKING_RULES.leadTimeMinutes`,
  `src/lib/booking-rules.ts:34`). No confirmed operator override on file.
- **Enforcement today**: `isWithinLeadTime()` (`src/lib/booking-rules.ts:50-58`),
  called from both `src/server/bookings.ts` (public `/book` widget,
  unauthenticated `createBookingFn`) and `src/server/staff-bookings.ts`
  (`createStaffBookingFn`/reschedule path in `updateStaffBookingFn`). Also
  used client-side in `book.tsx` to pre-filter which slots are even offered,
  but that's UX only — the two server functions above are the actual gate.
  Staff bookings may bypass a lead-time rejection with a mandatory
  `overrideReason`, audited; the public widget has no override.
- **What's missing today**: nothing. Fully enforced server-side on both entry
  points that can create a booking.

### 2. `maxAdvanceDays` — "Maximum advance booking"

- **Intended meaning**: the furthest a booking may be placed into the
  future, in days. A date beyond this is rejected.
- **Coded default**: 60 days (`booking-rules.ts:35`).
- **Enforcement today**: `isWithinMaxAdvance()` (`booking-rules.ts:61-70`),
  same two server call sites as lead time, same staff-override path. Also
  caps which date cards `book.tsx` renders (UX only).
- **What's missing today**: nothing.

### 3. `depositThreshold` — "Deposit required above"

- **Intended meaning**: the LKR service price at/above which a deposit is
  required. Below this, no deposit is computed.
- **Coded default**: 25,000 LKR (`booking-rules.ts:36`).
- **Enforcement today**: `computeRequiredDeposit()` (`booking-rules.ts:73-79`).
  Never blocks booking creation — it stamps `depositAmount`/`depositStatus`
  onto the `Booking` doc at creation time (`server/staff-bookings.ts`,
  `server/bookings.ts`). Replaced a previously hardcoded `price >= 15000` →
  30% check that used to live directly in `booking-sheet.tsx`.
- **What's missing today**: nothing for computation/storage. Whether the
  deposit is actually *collected* depends on field 3a below (checkout
  reconciliation), which is real but is a separate code path from the
  settings field itself.

  **3a. Checkout reconciliation** (not a Booking Rules field, but the reason
  the deposit number means anything): `_app.bookings.tsx` offers a "Bill"
  action on a checked-in booking, which navigates to `/pos?bookingId=<id>`.
  `_app.pos.tsx` (search-param handler, ~L92-119) pre-fills the sale and
  threads the booking's `depositAmount` through as `Invoice.depositApplied`
  in the **same `addInvoice` `writeBatch`** as the rest of the sale
  (`store.tsx:925-992`) — not a parallel payment write. `getAmountPaid()`
  (`src/lib/db.ts`) folds `depositApplied` back in so the invoice resolves
  to the correct paid/balance state. After a successful charge, the booking
  is transitioned to `"Completed"` via `completeBooking()`.

### 4. `depositPct` — "Deposit percentage"

- **Intended meaning**: the percentage of the service price required as a
  deposit, applied only when `depositThreshold` is met.
- **Coded default**: 20% (`booking-rules.ts:37`), UI-capped at 100.
- **Enforcement today**: same `computeRequiredDeposit()` as field 3.
- **What's missing today**: nothing.

### 5. `cancelWindowHours` — "Cancellation window"

- **Intended meaning**: how many hours before a booking's start time counts
  as a "late" cancellation, flagged for review. **Flag only** — this app has
  no stored payment method or automated-charging capability anywhere, so a
  flagged cancellation is recorded, never charged.
- **Coded default**: 24 hours (`booking-rules.ts:38`).
- **Enforcement today**: value is **snapshotted onto the `Booking` doc at
  creation time** (`cancelWindowHours` field, `src/lib/db.ts`), not read live
  from `settings/bookingRules` at cancellation — this is deliberate (see
  Constraints, below). `isInsideCancelWindow()` (`booking-rules.ts:83-91`) is
  evaluated against that snapshot in `updateStaffBookingFn`'s `cancel` action
  (`server/staff-bookings.ts:196-204`); the result (`flagged`) surfaces as a
  toast warning in `_app.bookings.tsx:246-247`.
- **What's missing today**: nothing, given the flag-only scope. (A real
  automated-charge capability would be new scope, not a gap in this field.)

### 6. `noShowPenaltyEnabled` — "Flag no-shows for review"

- **Intended meaning**: whether marking a booking No-Show is recorded for
  review. Flag only, same charging caveat as field 5.
- **Coded default**: `true` (`booking-rules.ts:39`).
- **Enforcement today**: also snapshotted onto the `Booking` doc at creation
  (`noShowPenaltyEnabled` field). Read from that snapshot in
  `updateStaffBookingFn`'s `no_show` action (`server/staff-bookings.ts:205-206`);
  surfaces as a toast in `_app.bookings.tsx:283-284`.
- **What's missing today**: nothing, given the flag-only scope.

### 7. `autoConfirm` — "Auto-confirm public bookings"

- **Intended meaning**: whether a booking placed through the public `/book`
  widget lands `Confirmed` immediately or `Pending` (awaiting staff review).
  Explicitly public-widget-only — staff-created bookings always land
  `Confirmed` regardless of this setting.
- **Coded default**: `true` (`booking-rules.ts:40`).
- **Enforcement today**: `status: rules.autoConfirm ? "Confirmed" : "Pending"`
  (`server/bookings.ts:177`).
- **Pending-state check** (per the constraints list below): **confirmed to
  already exist.** `BookingStatus` (`src/lib/db.ts`) is
  `"Pending" | "Confirmed" | "Checked-In" | "Completed" | "No-Show" | "Cancelled"`
  — `"Pending"` was already part of the status model before this field was
  wired up; `autoConfirm: false` uses it, doesn't require adding it.
- **What's missing today**: nothing. Note for a rebuild: nothing in the
  current UI lets staff triage/act on a `"Pending"` booking differently from
  a `"Confirmed"` one beyond status display — if that's part of the intent
  going forward, it wasn't scoped as part of this field.

## Constraints for any future implementation

The task asked these to be recorded as constraints a rebuild must satisfy.
All four are already satisfied by the current implementation being
described above; recorded here as the acceptance bar, not as open work.

1. **Enforcement must be server-side.** `api.public.booking.ts` /
   `createBookingFn` is unauthenticated — client-side validation there is
   trivially bypassable by anyone calling the endpoint directly. ✅ Verified:
   lead-time/max-advance checks run inside the `createServerFn` handlers in
   `src/server/bookings.ts` and `src/server/staff-bookings.ts`, not in
   `book.tsx`'s client code (which only pre-filters for UX).

2. **Terms must be snapshotted onto the booking at creation, not read live
   at cancellation.** Editing a policy later must never retroactively
   rewrite the terms of a booking already taken. ✅ Verified:
   `cancelWindowHours`/`noShowPenaltyEnabled` are copied onto the `Booking`
   doc at creation and read from that copy, never from the live
   `settings/bookingRules` doc, at cancel/no-show time
   (`src/lib/booking-rules.ts`'s own module comment states this explicitly;
   confirmed against `server/staff-bookings.ts`'s actual read sites).

3. **`autoConfirm` requires a pending state in the Job/Booking status
   model; confirm whether one exists.** ✅ Confirmed: yes, `"Pending"` was
   already present in `BookingStatus` (`src/lib/db.ts`) — see field 7 above.

4. **Deposit capture must go through the existing `addInvoice` writeBatch,
   not a parallel payment path.** ✅ Verified: `depositApplied` is passed
   into `addInvoice()` and written inside its single `writeBatch` call in
   `store.tsx:925-992` alongside the invoice, job, and customer-spend writes
   — there is no second/parallel write for deposit capture.

## Related

- `src/lib/booking-rules.ts` — the pure policy math (single implementation,
  shared by client and both servers).
- `src/server/bookings.ts`, `src/server/staff-bookings.ts` — the two real
  server-side enforcement points.
- `src/lib/booking-rules.test.ts` — 16 boundary-value unit tests.
- `scripts/e2e/booking-flow.mjs`, `scripts/e2e/staff-booking-flow.mjs` —
  end-to-end coverage against a real Firebase emulator.
