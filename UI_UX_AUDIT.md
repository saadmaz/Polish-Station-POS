# Polish Station POS — UI/UX Defect Audit

**Scope:** every route under `src/routes/`, every reusable component under `src/components/` (including `src/components/ui/` shadcn primitives and `src/components/damage-diagram/`), audited against four categories: responsive layout, WCAG 2.1 AA color contrast, keyboard navigation, and Enter-key/form-submission behavior.

**Method:** static read-only review of source. Color values are real conversions of this app's OKLCH design tokens (`src/styles.css`) to sRGB hex, with contrast ratios computed via the standard WCAG relative-luminance formula — not estimated. Breakpoints checked: 320, 375, 414, 768, 1024, 1440px, against Tailwind v4's default breakpoint scale (`sm`=640, `md`=768, `lg`=1024, `xl`=1280, `2xl`=1536 — this repo has no `tailwind.config.js` override). No files were modified.

**Stack notes relevant to all four sections:** React + TanStack Router, Tailwind v4, shadcn/ui components built on Radix UI primitives. There is a fully-defined `.dark` theme block in `styles.css` that is **never activated anywhere in the app** (no `classList.add('dark')`, `ThemeProvider`, `next-themes`, or `prefers-color-scheme` wiring exists in `src/`) — it's dead CSS. Dark-mode-only findings below are flagged as latent/unreachable rather than blocking.

---

## 1. Responsive Layout

The codebase engages Tailwind's default breakpoint system deliberately and consistently for list/table pages: virtually every data-table page (bookings list view, customers, jobs, leads, inquiry, inventory, equipment, purchase-orders, subscribers, settings catalog/audit, access-panel) follows the same pattern — a `divide-y ... md:hidden` stacked-card view paired with a `hidden overflow-x-auto md:block` table, so raw HTML tables never leak onto phones unwrapped. Modals/sheets are consistently width-safe (`Dialog` = `w-[calc(100%-2rem)] max-w-lg`, `Sheet` = `w-full sm:max-w-md/lg`, `Command`/search palette rides on `Dialog`). The weak spots are calendar-grid layouts (bookings Week view, unprefixed multi-column flex rows) and a few dense editing tables (POS line items, inventory, equipment, PO lines, leads filter bar) that get an `overflow-x-auto` escape hatch instead of a real mobile layout — usable but requires horizontal scrolling for core data entry at 320–414px.

### Blocking

- **Bookings Week view** (`src/routes/_app.bookings.tsx` ~L649) — `grid-cols-[60px_repeat(7,minmax(100px,1fr))] ... min-w-[760px]` inside `overflow-x-auto`. At 320–414px this renders a 760px-wide grid that must be scrolled horizontally just to see one day's bookings; the Day/Month views are usable at the same breakpoints, so Week is the outlier that effectively can't be used without heavy panning. **Fix:** collapse to a single-day-at-a-time layout (or the existing Day view) below `md`, matching the pattern already used elsewhere in the same file.

### Degraded

- **POS line-items table** (`src/components/invoice-document.tsx` `LineItemsTable`, ~L310-420) — fixed-width columns (`w-16`/`w-28`/`w-24`/`w-28`) inside `overflow-x-auto` with no card fallback. At 320-414px this is the core "build the invoice" interaction in POS and requires horizontal scrolling to edit qty/price/discount on the same row. **Fix:** add a stacked per-line card layout below `sm`, matching the treatment already used on other list pages.
- **Inventory table** (`src/routes/_app.inventory.tsx` ~L378) and **Equipment table** (`src/routes/_app.equipment.tsx` ~L728, plus the per-row maintenance-log sub-table ~L527) — both wrapped only in `overflow-x-auto rounded-xl border`, no `md:hidden` card list like customers/jobs/leads/subscribers have. 10 columns (Inventory) / 6 columns (Equipment) force horizontal scroll at 320-414px for what are otherwise daily-use screens for staff. **Fix:** add the same `md:hidden` card list pattern used elsewhere.
- **Purchase Order create/receive line tables** (`src/routes/_app.purchase-orders.tsx` `CreatePOForm` ~L160, `ReceivePanel` ~L299) — same `overflow-x-auto` table-only pattern; editing ordered qty/unit cost during PO creation on a phone requires side-scrolling per row. **Fix:** stacked mobile row layout.
- **Leads filter bar** (`src/routes/_app.leads.tsx` ~L2327) — `flex flex-col gap-3 sm:flex-row sm:items-center` with a search input plus ~4 `DropdownMenu` filter buttons and no `flex-wrap` once it switches to `sm:flex-row` at 640px. Between 640-1024px this row can overflow or crowd before wrapping is available. **Fix:** add `flex-wrap` to the `sm:flex-row` container.
- **Bookings List view table** (`src/routes/_app.bookings.tsx` ~L739) — 9-column table (`overflow-x-auto`) with no mobile card alternative, unlike every other list page in the app. **Fix:** add `md:hidden` card view matching Customers/Jobs/Leads.
- **Damage-diagram marker table** (`src/components/damage-diagram/damage-diagram.tsx` `DamageMarkerTable`, ~L389) — 6-column table in `overflow-x-auto`, no card fallback; secondary to the diagram itself (which is genuinely responsive) but the marker list still needs side-scrolling on a phone.
- **Job-sheet / Booking-sheet service rows** (`src/components/job-sheet.tsx` ~L606, similar in `booking-sheet.tsx`) — service name + quick-fill select column next to a fixed `w-28` price input inside a `w-full`-below-`sm` Sheet; each row is visually cramped at 320px (long placeholder text truncates inside a ~140px-wide input). **Fix:** stack label/select above price+remove on narrow widths.

### Cosmetic

- **Dashboard KPI grid** (`src/routes/_app.dashboard.tsx` ~L58) — `grid-cols-2 md:grid-cols-3 xl:grid-cols-6` for only 3 actual KPI cards, leaving an odd half-empty row at `md`-`xl` widths (grid was clearly sized for a since-removed 6-card layout). **Fix:** right-size the grid to `grid-cols-2 md:grid-cols-3` and drop the `xl:` step.
- **Settings shell** (`src/routes/_app.settings.tsx` ~L92) — `grid-cols-1 lg:grid-cols-[260px_1fr]`: correct at the stack/split extremes, but between `md` and `lg` (768-1023px) the section nav renders as a full-width vertical button list above the content, heavier than necessary at tablet width. **Fix:** consider a `md:` two-column split instead of waiting for `lg`.
- **Sidebar hard cutoff at `md`** (`src/components/app-sidebar.tsx` ~L207, `src/components/top-bar.tsx` ~L28-44) — deliberate, documented choice (a 224px rail on a 375px screen would leave ~150px for content), so desktop sidebar is `hidden md:flex` with a `MobileNavSheet` swap below that. Not a defect — noted because it's the highest-traffic chrome and the swap happens at exactly 768px, one of the six audited breakpoints, worth confirming intentional (it is).

---

## 2. Color Contrast

Beyond the StatusChip badge component (see below), the same `text-success`/`text-warning`/`text-info` tokens are used as **plain foreground text** in 15+ files app-wide, and the public-facing `book.tsx` bypasses the design-token system entirely with hardcoded Tailwind grays/reds that are measurably worse than the app's own tokens. The dead `.dark` class never redefines `--success`/`--warning`/`--info`/`--chart-*`, so if dark mode is ever wired up the same failures would recur, likely worse, against dark surfaces.

**Design-token baseline (light mode, the only reachable mode):**

| Pairing | Hex | Ratio | Verdict |
|---|---|---|---|
| foreground on background | `#191a1f` / `#fafafa` | 16.64:1 | PASS |
| card-foreground on card | `#191a1f` / `#ffffff` | 17.37:1 | PASS |
| primary-foreground on primary (solid) | `#fcfcfc` / `#d01d21` | 5.28:1 | PASS |
| muted-foreground on muted/card/background | `#5b5d63` / `#f1f2f4`,`#ffffff`,`#fafafa` | 5.88–6.58:1 | PASS |
| accent-foreground on accent | `#900000` / `#ffe5e0` | 8.02:1 | PASS |
| **success-foreground on success** (solid) | `#fcfcfc` / `#43a84c` | **2.95:1** | **FAIL** (needs 4.5:1) |
| warning-foreground on warning (solid) | `#191a1f` / `#efa831` | 8.53:1 | PASS |
| **info-foreground on info** (solid) | `#fcfcfc` / `#1a89c5` | **3.77:1** | **FAIL** (needs 4.5:1) |
| sidebar-foreground on sidebar | `#ccced1` / `#191a1e` | 11.03:1 | PASS |

### Blocking

- **`StatusChip` success & info variants** (`src/components/status-chip.tsx`) — 11px badge text on translucent background. `success` (`bg-success/15 text-success`): `#43a84c` on composited `#e3f2e4` = **2.60:1** (needs 4.5:1). `info` (`bg-info/15 text-info`): `#1a89c5` on composited `#ddedf6` = **3.23:1** (needs 4.5:1). The `danger` variant already has a code comment showing the team measured and tuned it to 4.58:1 by dropping opacity from `/12` to `/10` — but the same fix was never applied to `success`/`info`, which are actually worse. This component renders "paid", "done", "ready", "confirmed", "active" (success) and "in progress", "booked", "arrived" (info) badges — used across bookings, jobs, invoices, inventory, purchase orders. **Fix:** apply the same opacity-tuning the `danger` variant already got (or switch to solid `bg-success`/`bg-info` with the `-foreground` token, though even that only reaches 2.95:1/3.77:1 — the `--success`/`--info` tokens themselves likely need darkening).
- **`text-warning` used as plain text, site-wide** (`_app.dashboard.tsx:65,82`, `_app.settings.tsx:193,495`, `_app.jobs.tsx:194`, `_app.leads.tsx:329`, `_app.inventory.tsx:319`, `_app.bookings.tsx:146,166,779,795`, `_app.reports.tsx:190`) — e.g. "Couldn't load today's jobs", "Unsaved changes" — `#efa831` on `#ffffff`/card = **2.04:1** (needs 3:1 even at large/bold sizes). **Fix:** never use bare `text-warning` on light backgrounds; pair with `bg-warning` + `text-warning-foreground`, or introduce a darker standalone warning-text token.
- **`text-success`/`text-info` used as plain text, mostly text-xs/sm** (`invoice-document.tsx:35,37` "Paid"/"Issued" stamp on real invoices; `_app.settings.tsx:192,494` "Saved ✓"; `_app.pos.tsx:924,991`; `booking-sheet.tsx:418-419`; `job-sheet.tsx:513-514`; `_app.inquiry.tsx:49,157`; `_app.leads.tsx:369,856`) — `#43a84c`/`#1a89c5` on `#ffffff` = **3.02:1 / 3.87:1** (needs 4.5:1). **Fix:** same as above — pair with filled background, or add darker standalone text variants.
- **`book.tsx` helper/body copy in `text-gray-400`** (~15 occurrences, e.g. lines 183, 205, 235, 243, 247, 302, 509, 696) — `#9ca3af` on `#ffffff` = **2.54:1** (needs 4.5:1). This entire public-facing route bypasses the token system. **Fix:** use `text-muted-foreground` (6.31–6.58:1 in this app) instead of stock Tailwind gray-400.
- **`book.tsx` form validation error text** (lines 416, 442) — `text-red-500` `#ef4444` on `#ffffff` = **3.76:1** (needs 4.5:1). **Fix:** use the app's `--destructive`/`--primary` token (`#d01d21`, 5.19–5.28:1).
- **`book.tsx` primary CTA and step-indicator numerals** (lines 138-140 step circles; line 504 "Confirm Booking") — white text on `bg-red-500` — `#ffffff` on `#ef4444` = **3.76:1** (needs 4.5:1). **Fix:** use the app's own `--primary` red, already tuned to pass.
- **Staff/owner avatar initials on hardcoded palette swatches** (`_app.leads.tsx:404`, `routes/index.tsx:387`, `app-sidebar.tsx:143` — rendered on every authenticated page) — initials on `staff.color`, chosen from the 8-swatch `PALETTE` in `access-panel.tsx:90-98`. **Verified:** 3 of 8 swatches are literally the same OKLCH values as the failing `--info`/`--success`/`--warning` tokens (`oklch(0.60 0.13 240)`, `oklch(0.65 0.16 145)`, `oklch(0.78 0.15 75)`) — white-on-swatch ratios of 3.87:1 / 3.02:1 / **2.04:1**. **Fix:** restrict the palette to swatches independently verified ≥4.5:1 against white, or select text color per-swatch.
- **Sidebar notification-count badges** (`app-sidebar.tsx:104,113`, visible on every page) — white 8-10px bold text on `bg-amber-500` — `#ffffff` on `#f59e0b` = **2.15:1** (needs 4.5:1). **Fix:** use the app's `--warning`/`--warning-foreground` pairing (8.53:1) instead of stock Tailwind amber-500.
- **Damage-diagram marker numerals, warning-colored types** (`damage-diagram.tsx:260-269`, `marker-style.ts` — `crack` uses `--chart-4` which is the same OKLCH value as `--warning`, and `paint_defect` uses `--warning` directly) — **verified in source**, `fill="white"` at line 265 — white on `#efa831` = **2.04:1** (needs 3:1, fails even as large/bold text). **Fix:** switch marker-number fill to `var(--warning-foreground)` for these two types.
- **Reports — "Profit & Loss" headline when expense data fails to load** (`_app.reports.tsx:189-193`, 2xl/extrabold) — `text-warning` `#efa831` on `#ffffff` = **2.04:1** (needs 3:1 large text). **Fix:** same as the site-wide `text-warning` root cause above.

### Degraded

- **Hardcoded `bg-green-600 text-white` buttons** (`_app.notifications.tsx:56`, `_app.pos.tsx:1309`, `_app.purchase-orders.tsx:362,522`) — `#ffffff` on `#16a34a` = **3.30:1** (needs 4.5:1). **Fix:** use `--success`/`--success-foreground`, or Tailwind green-700 (`#15803d`, clears 4.5:1).
- **`bg-success text-white` hardcoded white instead of the token** (`expense-modal.tsx:84,157` "Bank Deposit" tab/submit) — `#ffffff` on `#43a84c` = **3.02:1**. **Fix:** swap `text-white`→`text-success-foreground` (note: the token itself is only 2.95:1, so the `--success` token likely needs darkening independent of this code fix).
- **Damage-diagram marker numerals, success/info-colored types** (`chip`/`scuff` and `rust`/`swirl`) — white on `#43a84c` (3.02:1) and `#1a89c5` (3.87:1) — fails at the component's documented ~16px bold render size, passes the 3:1 large-text threshold only in wider containers; severity is render-width-dependent.
- **`book.tsx` confirmation-box secondary text** (line 388, customer's phone number) — `text-red-400` on `bg-red-50` — `#f87171` on `#fef2f2` = **2.53:1**. **Fix:** use `text-red-700` or the app's `--primary` token.

### Cosmetic

- **Disabled buttons/inputs (`opacity-50`)** (`button.tsx:8`, `input.tsx:11`, `select.tsx:22`, `textarea.tsx:10`) — ≈2.40:1 composited — WCAG explicitly exempts inactive/disabled controls from contrast requirements; noted for completeness only.
- **`book.tsx` footer/disabled-state text** (lines 213, 607 "Powered by Polish Station OS"; line 325 disabled time slots) — `text-gray-300` ≈1.47–1.5:1 — decorative attribution + WCAG-exempt disabled state; low priority.
- **Reports "Profit & Loss" headline in `text-success`** (`_app.reports.tsx:192`) — `#43a84c` on `#ffffff`, 2xl/extrabold = 3.02:1 — technically clears the 3:1 large-text bar by 0.02, fragile to any weight/size reduction.
- **`sidebar-border`** (`#2c2e32` on `#191a1e`, 1.28:1) — decorative separator only, not confirmed to be anyone's sole means of distinguishing adjacent sidebar regions.
- **Dead `.dark` block** — `--success`/`--warning`/`--info`/`--chart-1..5` are never redefined under `.dark`, so every failure above would reproduce (likely worse) if dark mode is ever wired up. Currently unreachable.

---

## 3. Keyboard Navigation

The app leans heavily on Radix primitives (Dialog/Sheet/AlertDialog/Select/DropdownMenu/Popover/Tabs/Command/Calendar are all untouched shadcn wrappers with intact focus-trapping, roving-tabindex, and Escape handling), and the real staff PIN-login pad (`src/routes/index.tsx` — not `access-panel.tsx`, which is the admin "Staff & Access" management panel) is built from genuine `<button>` elements throughout, so it's keyboard-operable. The real risk is concentrated in three hand-rolled areas: **custom (non-Radix) modals** built as raw `fixed inset-0` divs, **the damage diagram's SVG markers**, and a codebase-wide pattern of `<tr onClick>`/`<div onClick>` "expand/select" rows with no keyboard equivalent.

### Blocking

- **Damage diagram markers** (`src/components/damage-diagram/damage-diagram.tsx:213-273`) — every marker is an SVG `<g>` with only `onPointerDown/Move/Up`, no `tabIndex`, `role`, or `onKeyDown`. Placing, selecting, dragging, and long-press-deleting a marker are all pointer/touch-only. A keyboard-only user cannot place, select, edit, or delete a single damage marker. **Fix:** give each marker `tabIndex={0} role="button" onKeyDown={...}` (Enter/Space to open editor, arrow keys to nudge, Delete to remove) plus a keyboard-reachable "Add marker" button.
- **Custom modals with no focus trap, no Escape, no focus return** — three components roll their own overlay instead of Radix Dialog: `access-panel.tsx:946-960` (`Modal`, used by create/edit/reset-PIN/delete-user dialogs), `expense-modal.tsx:50-53` (Cash Out / Deposit), `payment-modal.tsx:216-220` (Collect Payment / Refund). Each is `<div className="fixed inset-0 z-50 ..." onClick={onClose}>` with a content div that stops propagation. None trap focus (Tab walks out into the visually-hidden page behind the overlay), close on Escape, or return focus to the trigger on close. These cover real staff workflows: creating/deleting users, resetting PINs, recording cash movements, collecting/refunding payments. **Fix:** migrate to `ui/dialog.tsx` (gets all three behaviors for free), or manually add an Escape listener + focus trap + focus restoration.

### Degraded

- **Expandable table rows with no keyboard path** — `<tr onClick={...}>` for expand/collapse, no `tabIndex`/`role`/`onKeyDown`, so these rows are skipped entirely by Tab: `_app.equipment.tsx:397-402`, `_app.purchase-orders.tsx:552-557`, `_app.jobs.tsx:304`, `_app.customers.tsx:323`, `_app.leads.tsx:2580-2585`, `damage-diagram.tsx:415-417` (`DamageMarkerTable` row — also the only non-SVG way to select a marker, and it's unreachable too). **Fix:** add `tabIndex={0} role="button" onKeyDown` for Enter/Space, or use a real `<button>`.
- **Booking calendar built entirely from clickable divs** (`_app.bookings.tsx`) — day cells (:587-595), month-view booking chips (:705-716), week-view booking cards (:390-407), and the click-outside-to-close card backdrop (:490-492) are all plain `<div onClick>` with no `tabIndex`/`onKeyDown`. A keyboard-only user cannot select a day or open a booking's detail card — the bookings screen's primary interaction surface is mouse/touch-only. **Fix:** at minimum make day cells and booking chips real `<button>`s or add tabIndex/onKeyDown; full fix needs arrow-key grid navigation.
- **Unreachable "clear filter" control** (`_app.leads.tsx:1897-1909`) — `<span role="button" tabIndex={-1} onClick={...}>` inside `DateRangeFilter`'s trigger; `tabIndex={-1}` removes it from the Tab sequence despite `role="button"` signaling it's interactive. **Fix:** change to `tabIndex={0}` + add `onKeyDown`; note a nested `<button>` inside the trigger `<button>` would be invalid HTML, so the trigger may need restructuring.
- **Clickable lead card with no keyboard equivalent** (`_app.leads.tsx:1776`) — `<div className="p-4" onClick={onOpen}>`, the mobile card-view equivalent of the leads table row; opening detail has no keyboard path (nested checkbox/action buttons are individually reachable, the outer "open" action is not). **Fix:** same pattern as expandable rows above.
- **PIN-pad focus becomes invisible after staff selection** (`routes/index.tsx:114-118, 238-249`) — after picking a staff member, focus moves to a `sr-only aria-hidden tabIndex={-1}` input so physical typing works, but there's no visible focus indicator anywhere on screen at that moment. Self-correcting (typing digits works without seeing a caret) and not a blocker, but a sighted keyboard-only user has no visual confirmation of focus location until they press Tab once.

### Cosmetic

- `button.tsx:8` and other primitives correctly pair `focus-visible:outline-none` with `focus-visible:ring-1 focus-visible:ring-ring` in every occurrence found via repo-wide grep — no invisible-focus regressions from outline removal anywhere in `ui/*.tsx`.
- `app-sidebar.tsx` — real `<Link>`s with `aria-current="page"`, real `<button aria-label>` toggles, tab order matches visual order. No issues.
- `search-palette.tsx` — built on `CommandDialog` (Radix Dialog + cmdk), full focus trap/Escape/arrow-key nav inherited for free. No issues.
- `notifications-popover.tsx` — Radix `Popover`, real `<button>` dismiss actions. No issues.
- `signature-pad.tsx` — canvas drawing is inherently not keyboard-operable; this is an acknowledged, deliberate limitation (component's own comment cites a legal requirement for the canvas), not an oversight. Clear button is a real, reachable `<button>`.
- `status-chip.tsx` — non-interactive `<span>`, never wrapped as clickable anywhere. No issues.
- Stock shadcn primitives spot-checked unmodified: `dialog.tsx`, `sheet.tsx`, `alert-dialog.tsx`, `dropdown-menu.tsx`, `select.tsx`, `tabs.tsx`, `command.tsx`, `calendar.tsx`, `input-otp.tsx` — all preserve Radix's default keyboard behavior.
- `booking-sheet.tsx`, `job-sheet.tsx`, `inspection-sheet.tsx`, `handover-sheet.tsx` — all built on `ui/sheet.tsx` (Radix Dialog), inherit focus trap/Escape/focus-return for free; every field is a real native element.
- `book.tsx` — stepper controls are real `<button>`s, progress indicator carries `role="group" aria-label`. No issues.
- `change-pin.tsx` — standard form, real inputs, `autoFocus` on first field. No issues.

---

## 4. Enter-Key / Form Submission

The app has two opposite stories. The actual PIN-login pad (`src/routes/index.tsx`) and the step-up re-auth dialog (`src/hooks/use-step-up.tsx`) are both well-built: digit buttons plus a physical-keyboard listener that auto-submits the instant the 4th digit lands, so Enter is simply moot there. POS checkout (`_app.pos.tsx`) is the opposite: the entire checkout view has **no `<form>` element at all**, so only the Coupon field responds to Enter — every other field on the same screen silently ignores it — and the public booking form (`book.tsx`) has the same no-`<form>` problem on a page real customers fill out. One active wrong-action bug: Inventory's stock-adjust widget always applies a **positive** adjustment on Enter regardless of intent (verified in source).

### Blocking

- **Public booking form — Details step** (`src/routes/book.tsx`, `DetailsStep`, lines 394-508) — no `<form>` wraps Full Name / Phone / Plate / Vehicle Model / Special Requests, and "Confirm Booking" is a plain `<button onClick>`, not `type="submit"`. A customer who fills the two required fields and presses Enter — the natural way to finish a form on mobile — gets nothing: no submit, no validation, no error. **Fix:** wrap the fields in a real `<form onSubmit>` with the submit button as `type="submit"`.
- **Inventory stock-adjust widget** (`src/routes/_app.inventory.tsx`, `AdjustWidget`, lines 207-219) — **verified in source:** `onKeyDown={(e) => { if (e.key === "Enter") apply(1); ... }}` always calls `apply(1)` (the add-stock path), never `apply(-1)`, with no UI indication of which direction Enter will apply. A staff member typing a quantity meant to *subtract* stock and pressing Enter will silently **add** it instead — an inventory-integrity bug. **Fix:** remove the Enter shortcut, or track last-pressed direction and have Enter repeat it instead of hardcoding `+1`.

### Degraded

- **POS checkout — every non-coupon field** (`_app.pos.tsx`) — no `<form>` anywhere in the file. Vehicle Plate (L717), Customer Search (L777), the 5 New-Customer mini-fields (L829-868), Manual Billing (L880), Discount value/reason (L950-963) all have no `onKeyDown`; the Coupon field two sections down (L1009) does apply on Enter. This inconsistency on a single fast-paced till screen means a cashier who learns "Enter works" from the coupon box will reasonably expect it elsewhere and be wrong. The "Issue Invoice/Charge" action (L1116, plain `onClick`) is also unreachable via Enter from any field — arguably intentional friction on a money-committing action, worth a product decision rather than an automatic fix.
- **Staff & Access dialogs** (`access-panel.tsx`) — `StaffDialog` (Display name/Username/Temporary PIN, L690-732) and `ResetPinDialog` (PIN field, L851-860) have no `<form>`/`onKeyDown`; Save/Create/Reset are plain `onClick`. Enter does nothing in any field, including the 4-digit PIN field.
- **Collect Payment / Refund modal** (`payment-modal.tsx`) — no `<form>`. Refund Amount (L258), Refund Method, Refund Reason (L288, required) all ignore Enter; action buttons are `onClick`-only.
- **Settings → Business panel** (`_app.settings.tsx`, L166-189) — 6 bare inputs, no form, Save is `onClick`. Enter does nothing.
- **Settings → Services Catalog panel** (`_app.settings.tsx`, `CatalogPanel`, L260-313) — same pattern.
- **Settings → Review/Reminder templates panel** (`_app.notifications.tsx`, L257-342) — Google Review Link and Reminder Interval inputs ignore Enter; textareas correctly insert newlines regardless (no form to accidentally trigger).
- **Devices panel** (`devices-panel.tsx`, L108-118) — Till label input has no form/`onKeyDown`; must click "Enroll".
- **Handover sheet — Customer name** (`handover-sheet.tsx`, L233-240) — no `<form>` in the file; "Confirm Delivery" is `onClick`. Enter in the required field does nothing.
- **Inspection sheet — Odometer** (`inspection-sheet.tsx`, L280-289) — no `<form>`; step nav and "Complete Inspection" all `onClick`. Enter does nothing.

### Cosmetic

- **Live-filter search boxes** (`_app.inquiry.tsx:103`, `_app.jobs.tsx:452`, `_app.subscribers.tsx:112`) — filter on every keystroke already, so Enter doing nothing extra is functionally correct; mobile virtual-keyboard return key won't blur/dismiss, a minor missed nicety.
- **PIN login pad** (`routes/index.tsx`, `handleKeyDown`, L179-186) — physical Enter isn't explicitly mapped, harmless today since the 4th digit auto-submits; would silently stop covering Enter if PIN length ever became configurable.
- **Step-up re-auth dialog** (`src/hooks/use-step-up.tsx`, L133-146) — same non-issue, covered by auto-submit on the 4th digit.

**Positive notes (forms already correct — preserve during any fix pass):** `change-pin.tsx` (Current/New/Confirm PIN) is correctly wired — single `type="submit"`, disabled while incomplete. `booking-sheet.tsx`, `job-sheet.tsx`, `expense-modal.tsx`, `_app.customers.tsx`, `_app.equipment.tsx`, `_app.leads.tsx` (4 forms), `_app.purchase-orders.tsx` all use a real `<form onSubmit>` with exactly one `type="submit"` button placed after any `type="button"` Cancel. `AddLineCombobox` (`invoice-document.tsx:216-308`, the POS product/service search) and `SearchPalette`/`command.tsx` correctly use cmdk's built-in Enter-selects-highlighted-item behavior, including a deliberate custom-line fallback when Enter is pressed with no matches — the one POS field that most needed to get this right, and it does.

---

## Summary

| Category | Blocking | Degraded | Cosmetic |
|---|---|---|---|
| Responsive Layout | 1 | 7 | 3 |
| Color Contrast | 9 | 4 | 5 |
| Keyboard Navigation | 2 | 5 | 9 |
| Enter-Key / Form Submission | 2 | 8 | 3 |

**Cross-cutting root causes worth fixing once, not per-instance:**
1. `StatusChip` success/info variants and every bare `text-success`/`text-warning`/`text-info` usage share one root cause — the `--success`/`--info`/`--warning` tokens are too light against white/card for 4.5:1 text use. A single token-darkening pass (or a documented "always pair with filled background" rule) fixes dozens of individual findings at once.
2. `book.tsx` is the only route that bypasses the design-token system with hardcoded Tailwind grays/reds — every contrast and Enter-key finding in that file traces back to it not reusing the same patterns already correct elsewhere in the app.
3. Three hand-rolled modals (`access-panel.tsx` `Modal`, `expense-modal.tsx`, `payment-modal.tsx`) account for both the keyboard-trap findings and several of the Enter-key "does nothing" findings — migrating them to `ui/dialog.tsx`/`ui/sheet.tsx` (already used correctly by 4+ other sheet components in the app) would fix both categories for these three components in one change.
