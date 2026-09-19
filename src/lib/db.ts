// Typed localStorage database layer.
// All writes go through these functions so the store context can invalidate queries.
import { DEFAULT_TEMPLATES } from "./notifications";

// "Completed" was added alongside the POS/timeline consistency fix: a
// walk-in POS sale with no pre-existing booking now auto-creates one (see
// job-linking.ts) stamped straight to "Completed", since the work is
// already finished by the time payment is taken. Before this, there was no
// status representing finished-but-not-a-future-appointment work at all.
export type BookingStatus =
  "Pending" | "Confirmed" | "Checked-In" | "Completed" | "No-Show" | "Cancelled";
export type InvoiceStatus = "Draft" | "Issued" | "Partially Paid" | "Paid" | "Void" | "Refunded";
export type PaymentMethod = "Cash" | "Card" | "Transfer";
export type CustomerTier = "Bronze" | "Silver" | "Gold" | "Platinum";
export type ServiceCategory =
  "Exterior" | "Interior" | "Full Detail" | "Paint Protection" | "Coating";

export interface Service {
  id: string;
  name: string;
  category: ServiceCategory;
  price: number;
  durationMin: number;
}

export interface Vehicle {
  plate: string;
  model: string;
  color: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address?: string;
  vehicles: Vehicle[];
  visits: number;
  spend: number;
  lastVisit: string | null;
  tier: CustomerTier;
  loyaltyPoints: number;
  createdAt: string;
}

export function calcTier(spend: number): CustomerTier {
  if (spend >= 200000) return "Platinum";
  if (spend >= 80000) return "Gold";
  if (spend >= 20000) return "Silver";
  return "Bronze";
}

export type DepositStatus = "none" | "required" | "paid";

// Absent on every booking written before this field existed — treat a
// missing type as "service", the only kind of booking that could exist
// before "inspection" did.
export type BookingType = "inspection" | "service";

export interface Booking {
  id: string;
  customerId: string | null;
  customerName: string;
  phone: string;
  plate: string;
  vehicleModel: string;
  serviceId: string;
  serviceName: string;
  category: ServiceCategory;
  durationMin: number;
  price: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  tech: string;
  bay: string;
  status: BookingStatus;
  notes: string;
  createdAt: string;
  depositAmount?: number;
  depositStatus?: DepositStatus;
  type?: BookingType;
  // Attribution, carried forward from the Lead this booking was created
  // from — see convertLeadToBooking/createFollowUpBooking in store.tsx.
  // Absent for bookings not created from a lead.
  leadId?: string;
  source?: string;
}

// ── Leads (contact/booking inquiries from the public polishstation.lk site,
//    plus manual WhatsApp/phone/walk-in entry — see src/lib/lead.ts for the
//    status transition graph) ─────────────────────────────────────────────
// Written by the Admin SDK from the unauthenticated src/routes/api.public.*
// routes (see src/server/public-api.ts) for the website source, or directly
// by staff (see addLead in store.tsx) for the three manual sources. Staff
// triage them here into a real Customer/Booking/Invoice via the Convert
// action (see convertLeadToBooking/convertLeadToInvoiceLink in store.tsx).
export type LeadType = "contact" | "booking";
// "archived" predates the rest of this list and stays as the existing
// one-way Archive button's target; lost/duplicate are separate, newer
// terminal states with their own required fields below.
export type LeadStatus =
  "new" | "contacted" | "quoted" | "converted" | "lost" | "duplicate" | "archived";

// The polishstation.lk booking-request page's fixed checkbox list (plus a
// free-text "Other"). Distinct from the internal `Service` catalog: an
// anonymous site visitor has no visibility into real service ids/prices, so
// this is a separate, marketing-friendly menu -- kept here as the single
// source of truth so api.public.booking.ts's Zod schema and any future UI
// stay in sync with each other.
export const WEBSITE_BOOKING_SERVICES = [
  "Paint Correction",
  "Cut & Polish",
  "Ceramic Coating",
  "Graphene Coating",
  "Interior Detailing",
  "Exterior Detailing",
  "Engine Bay Cleaning",
  "Headlight Restoration",
  "Other",
] as const;
export type WebsiteBookingService = (typeof WEBSITE_BOOKING_SERVICES)[number];

// The site's fixed preferred-time menu (replaces the free-text `timeWindow`
// field below, which nothing live writes anymore). Bucket boundaries chosen
// to match the site's actual dropdown copy -- see PREFERRED_WINDOW_LABELS in
// lead.ts for the exact display string each one maps to.
export const PREFERRED_WINDOWS = ["08_11", "11_14", "14_17", "17_19"] as const;
export type PreferredWindow = (typeof PREFERRED_WINDOWS)[number];

export type VehicleBodyType = "sedan" | "hatchback" | "suv" | "double_cab" | "van" | "coupe";

// Required whenever a lead is marked lost -- see LOST_REASON_LABELS in
// lead.ts for the picker's display copy, and firestore.rules'
// isLegalLeadUpdate for the matching server-side enum check.
export const LOST_REASONS = [
  "price",
  "timing",
  "distance",
  "no_response",
  "out_of_scope",
  "duplicate",
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export interface Lead {
  id: string;
  type: LeadType;
  name: string;
  email?: string;
  phone?: string;
  // What the customer/staff actually typed, before normalizePhone/toE164 --
  // kept because normalization is lossy for anything that isn't a
  // recognizable Sri Lankan mobile number. `phone` above holds the E.164
  // form (+94...) when normalization succeeded, else falls back to this.
  phoneRaw?: string;
  message?: string;
  // Free-text vehicle description as typed/submitted -- kept for reference
  // even once vehicleMake/Model/Year below are split out, since the split
  // is a best-effort parse (by staff or a future auto-parser) that can be
  // wrong or incomplete.
  vehicle?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  // Staff-set or derived from make/model; drives price banding. Optional
  // because most leads arrive before anyone has looked at the vehicle.
  vehicleBodyType?: VehicleBodyType;
  // Set by the staff "New Lead" dialog (WhatsApp/phone/walk-in), matching a
  // real Service catalog id. Website-sourced booking leads use `services`/
  // `otherService` below instead -- the two are never both set on one lead.
  serviceId?: string;
  // Set by the polishstation.lk booking-request page: the checkboxes picked
  // from WEBSITE_BOOKING_SERVICES, e.g. ["Paint Correction", "Other"].
  services?: WebsiteBookingService[];
  // Canonical, origin-agnostic list the UI/reports read from -- reconciles
  // serviceId (staff dialog) and services[] (website) into one shape,
  // populated wherever a Lead is written rather than derived at render
  // time. See reconcileServiceIds() in lead.ts, the single place that does
  // this reconciliation.
  serviceIds?: string[];
  // Required by api.public.booking.ts whenever "Other" is among `services`.
  otherService?: string;
  preferredDate?: string;
  // First-class replacement for the free-text `timeWindow` below -- see
  // PreferredWindow above. The website form should send this instead of
  // appending "Preferred time: ..." to `notes` (its old workaround for not
  // having a dedicated field).
  preferredWindow?: PreferredWindow;
  // Superseded by preferredWindow above. Still read (never written) so old
  // records and the staff "New Lead" dialog's free-text field don't break;
  // remove once nothing writes it and the dialog is migrated (Phase 2).
  timeWindow?: string;
  notes?: string;
  status: LeadStatus;
  source: string;
  createdAt: string;
  ip?: string | null;
  // When this lead was first moved out of "new" (contacted, or straight to
  // quoted/converted) -- set once, never overwritten. Null until then.
  firstResponseAt?: string | null;
  // Derived: (firstResponseAt - createdAt) in minutes, stamped alongside
  // firstResponseAt so reports don't need to recompute it from two
  // timestamps every time. Null until firstResponseAt is set.
  responseMinutes?: number | null;
  // Staff uid this lead is assigned to. Null/absent means unassigned.
  assignedTo?: string | null;
  // Set iff status === "lost". Required by both the UI and firestore.rules.
  lostReason?: LostReason;
  // Set iff status === "duplicate" — id of the lead this one was merged into.
  duplicateOf?: string;
  // Set by the "Mark Quoted" dialog. Both optional even once quoted: a quote
  // given verbally over the phone before the LKR figure was finalized is
  // still a legitimate "quoted" lead.
  quotedAmount?: number;
  quoteValidUntil?: string; // YYYY-MM-DD
  // Set iff status === "converted". Written once, atomically with the
  // status flip, and never overwritten afterward (immutable in rules).
  convertedTo?: { type: "inspection" | "service" | "walk-in" | "job"; id: string };
  // True for leads created while testing the form/UI rather than by a real
  // customer -- excluded from every count/metric/default view (see the
  // "Show test leads" filter toggle). Defaults to false; never set by the
  // public booking endpoint (a real site visitor is never a test lead).
  isTest?: boolean;
  // Marketing attribution, captured client-side by the site at submission
  // time. All optional -- most sources (WhatsApp, phone, walk-in) have none
  // of these; even website leads may arrive without them (direct traffic,
  // ad blockers stripping the params, etc).
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  landingPage?: string;
}

// Per-lead timeline (Leads detail panel, Phase 5) — a purpose-built event
// stream separate from the app-wide `audit` collection, same precedent as
// Job's own `jobEvents` vs. `audit`: `audit` reads are Manager+ only (it
// carries every entity's before/after, including ones a Leads-module
// Advisor has no business seeing), so a Leads timeline visible to anyone
// who can work leads needs its own collection with its own, narrower read
// gate (see firestore.rules). Written alongside (never instead of) the
// existing logAudit() call at each mutation site.
export type LeadEventType = "status_change" | "note";

export interface LeadEvent {
  id: string;
  leadId: string;
  type: LeadEventType;
  // Set only for type "status_change"; both null for a plain "note" event.
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus | null;
  // Set only for type "note" (the staff member's free text) -- also holds a
  // short auto-generated summary for a few status changes where the bare
  // from→to isn't self-explanatory (e.g. lost's reason, duplicate's target).
  note: string | null;
  actorId: string;
  actorName: string;
  at: string;
}

// ── Inquiries (contact-form submissions from the public polishstation.lk
//    site) ─────────────────────────────────────────────────────────────────
// Written directly by the marketing site via the client Firestore SDK
// (firestore.rules gates the public `create`); staff can only read/delete
// here, there is no status workflow — see FEATURES.md / the inquiry handoff
// note for the marketing site's contract.
export interface Inquiry {
  id: string;
  name: string;
  contactNumber: string;
  email: string | null;
  message: string;
  createdAt: string;
}

export type NewsletterStatus = "subscribed" | "unsubscribed";

export interface NewsletterSubscriber {
  id: string; // = email
  email: string;
  status: NewsletterStatus;
  source: string;
  subscribedAt: string;
  unsubscribedAt?: string;
}

export interface InvoiceLine {
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
  // Print-only: line total still comes from unitPrice * qty - discount as
  // usual (so totals stay consistent), but the PDF leaves the UNIT PRICE
  // cell blank for this row — e.g. a bundled/flat-rate line where a per-unit
  // figure would only be a confusing rounding artifact of the total.
  hideUnitPrice?: boolean;
}

export interface PaymentRecord {
  id: string;
  method: PaymentMethod;
  amount: number;
  reference: string; // optional free-text: last 4 digits, bank slip #, etc.
  staffName: string;
  at: string;
}

export interface RefundRecord {
  id: string;
  amount: number;
  method: PaymentMethod;
  reason: string;
  staffName: string;
  at: string;
}

export type InvoiceDiscountType = "percent" | "fixed";

export interface InvoiceDiscount {
  type: InvoiceDiscountType;
  value: number; // percent (0-100) or a fixed currency amount
  reason?: string;
}

export interface Invoice {
  id: string;
  customerId: string | null;
  customerName: string;
  // Snapshot of the customer's contact/vehicle at the moment of sale (not a
  // live join to Customer.vehicles) so the printed invoice always matches
  // what the customer actually saw, even if their profile changes later.
  // Optional: guest/manual-entry sales at the till may have neither.
  phone?: string;
  plate?: string;
  vehicleModel?: string;
  address?: string;
  lines: InvoiceLine[];
  subtotal: number;
  tip: number;
  total: number;
  // Invoice-level, ad-hoc discount (e.g. a manager-negotiated reduction with
  // a reason) -- separate from a Coupon, which is code-redeemed and capped.
  // Absent on every invoice issued before this field existed, which is
  // exactly the "no discount" case, so no backfill is needed.
  discount?: InvoiceDiscount;
  // Defaults to createdAt when absent (every invoice up to this field's
  // introduction was due on issue).
  dueAt?: string;
  notes?: string;
  terms?: string;
  method: PaymentMethod;
  status: InvoiceStatus;
  createdAt: string;
  // The Job this revenue belongs to. Every invoice created through
  // addInvoice() now has one: it's stamped to an existing job if one was
  // passed in, or to a job synthesized on the spot for a walk-in sale (see
  // job-linking.ts's synthesizeWalkInJob). Optional only because invoices
  // written before this field existed don't have it on their own — run
  // scripts/migrate-invoice-bookings.ts (which backfills bookingId, the
  // predecessor field below) then scripts/migrate-booking-jobs.ts to
  // backfill this one for historical rows.
  jobId?: string | null;
  // Superseded by jobId above (Job, not Booking, is the canonical work
  // record now — see job-linking.ts's module comment for why). Kept only so
  // invoices written during the brief window before jobId existed remain
  // readable; no new invoice sets this.
  bookingId?: string | null;
  depositApplied?: number;
  payments?: PaymentRecord[];
  refunds?: RefundRecord[];
  couponCode?: string;
  couponDiscount?: number;
  pointsRedeemed?: number;
  pointsRedeemedValue?: number;
  pointsEarned?: number;
  // Attribution — set only when this invoice was linked to a Lead via
  // convertLeadToInvoiceLink in store.tsx (the "walk-in invoice" convert
  // target). Absent for every other invoice.
  leadId?: string;
  source?: string;
}

// ─── Loyalty & coupons ───────────────────────────────────────────────────────

export type CouponType = "percent" | "fixed";

export interface Coupon {
  id: string;
  code: string; // normalized uppercase, unique
  type: CouponType;
  value: number; // percent (1-100) or a fixed currency amount
  active: boolean;
  expiresAt: string | null; // ISO date, inclusive; null = no expiry
  maxRedemptions: number | null; // null = unlimited
  redeemedCount: number;
  createdAt: string;
}

// ─── Business info (settings/business Firestore doc) ────────────────────────
// Single source of truth for the letterhead details printed on
// invoices/quotations. Lives in Firestore so every till shows the same
// details; the store keeps this module-level cache in sync so non-React code
// (the PDF builders) reads the same values the UI uses.

export interface BusinessInfo {
  name: string;
  trading: string;
  phone: string;
  email: string;
  address: string;
  hours: string;
}

export const DEFAULT_BUSINESS_INFO: BusinessInfo = {
  name: "Polish Station (Pvt) Ltd",
  trading: "Polish Station",
  phone: "+94 11 250 8821",
  email: "hello@polishstation.lk",
  address: "No. 22C, Sri Saranankara Road, Dehiwala",
  hours: "Mon–Sat · 08:00–18:00",
};

/** Coerce an untrusted doc/localStorage shape into a safe BusinessInfo. */
export function sanitizeBusinessInfo(input: unknown): BusinessInfo {
  const d = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const str = (k: keyof BusinessInfo) =>
    typeof d[k] === "string" ? (d[k] as string) : DEFAULT_BUSINESS_INFO[k as "name"];
  return {
    name: str("name"),
    trading: str("trading"),
    phone: str("phone"),
    email: str("email"),
    address: str("address"),
    hours: str("hours"),
  };
}

let businessInfoCache = DEFAULT_BUSINESS_INFO;
/** Called by the store whenever the settings/business doc changes. */
export function setBusinessInfoCache(b: BusinessInfo): void {
  businessInfoCache = b;
}
export function getBusinessInfo(): BusinessInfo {
  return businessInfoCache;
}

// ─── Bays (settings/bays Firestore doc) ──────────────────────────────────────
// The set of physical service bays. Polish Station currently operates one
// bay, but every screen that assigns/displays a bay (Bookings, Settings)
// reads this single list rather than hardcoding bay names, so adding a
// second bay later is a Settings → Bays edit, not a code change.

export const DEFAULT_BAYS: string[] = ["Bay 1"];

/** Coerce an untrusted doc shape into a safe, non-empty list of bay names. */
export function sanitizeBays(input: unknown): string[] {
  const d = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const raw = Array.isArray(d.bays) ? d.bays : null;
  if (!raw) return DEFAULT_BAYS;
  const names = raw
    .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
    .map((b) => b.trim());
  return names.length > 0 ? names : DEFAULT_BAYS;
}

// ─── Payment/refund derived helpers ─────────────────────────────────────────
// Invoices written before this feature shipped have no `payments` array, so
// synthesize one from the legacy single-method fields so old data keeps
// working without a Firestore backfill. The legacy amount excludes any
// deposit already collected earlier (deposits are tracked separately on the
// booking/job, not as an invoice-level payment).

function legacyPayments(inv: Invoice): PaymentRecord[] {
  const amount = inv.total - (inv.depositApplied ?? 0);
  if (amount <= 0) return [];
  return [
    {
      id: `${inv.id}-legacy`,
      method: inv.method,
      amount,
      reference: "",
      staffName: "",
      at: inv.createdAt,
    },
  ];
}

export function getPayments(inv: Invoice): PaymentRecord[] {
  // Presence of the field, not its length: a genuinely unpaid invoice
  // (status "Issued"/"Draft", awaiting a bank transfer that hasn't landed
  // yet) has an explicit empty array and must read as $0 collected, not
  // fall through to the legacy full-payment synthesis below — that fallback
  // exists only for invoices written before this field existed at all.
  return inv.payments !== undefined ? inv.payments : legacyPayments(inv);
}

// A deposit collected earlier (via the booking flow) is tracked separately
// from checkout `payments`; add it back in so "amount paid" reflects the
// true total collected from the customer, in both legacy and new invoices.
export function getAmountPaid(inv: Invoice): number {
  return getPayments(inv).reduce((s, p) => s + p.amount, 0) + (inv.depositApplied ?? 0);
}

export function getAmountRefunded(inv: Invoice): number {
  return (inv.refunds ?? []).reduce((s, r) => s + r.amount, 0);
}

export function getInvoiceBalance(inv: Invoice): number {
  return Math.max(0, inv.total - getAmountPaid(inv));
}

export function describePaymentMethods(inv: Invoice): string {
  const methods = Array.from(new Set(getPayments(inv).map((p) => p.method)));
  return methods.length > 0 ? methods.join(" + ") : inv.method;
}

/**
 * The vehicle plate is the human-facing lead identifier for every
 * document -- "CBA 2421 - INV 2091", not "INV-2091" alone. Display/filename
 * only: the underlying id (Firestore doc id, the sequence a counter
 * allocated) never changes shape, this just prefixes how a person sees it.
 * Falls back to the bare label when there's no plate on file (documents
 * issued before a plate was required, or -- store.tsx no longer allows this
 * going forward -- the rare pre-existing invoice with none at all).
 */
export function formatDocumentLabel(plate: string | undefined | null, label: string): string {
  return plate ? `${plate} - ${label}` : label;
}

/**
 * "CBA 2421 - INV 2091" for a normal invoice. A handful of invoices
 * created before this app's current id scheme carry an older id shape
 * (seen in live data: "PS-0505", not "INV-####") -- for those, `id` is
 * already the whole human-readable label on its own, so it's used as-is
 * rather than blindly prefixed with "INV " (which produced the nonsensical
 * "INV PS-0505" this replaces). Same fallback as formatDocumentLabel when
 * there's no plate on file.
 */
export function invoiceDocumentLabel(inv: Pick<Invoice, "id" | "plate">): string {
  const label = inv.id.startsWith("INV-") ? `INV ${inv.id.slice(4)}` : inv.id;
  return formatDocumentLabel(inv.plate, label);
}

export interface PaymentMethodTotals {
  cash: number;
  card: number;
  transfer: number;
}

// Exhaustive by construction (the `never` check fails to compile if
// PaymentMethod ever grows a fourth value): Reports (finding R1) used to
// bucket revenue with `method === "Cash" ? cash : card`, which silently
// counted every Transfer payment/refund as Card. Every call site that
// buckets by payment method now goes through this instead of re-deriving
// the split.
function applyPaymentMethodDelta(
  totals: PaymentMethodTotals,
  method: PaymentMethod,
  delta: number,
): void {
  switch (method) {
    case "Cash":
      totals.cash += delta;
      break;
    case "Card":
      totals.card += delta;
      break;
    case "Transfer":
      totals.transfer += delta;
      break;
    default: {
      const exhaustive: never = method;
      throw new Error(`Unhandled payment method: ${exhaustive}`);
    }
  }
}

export function sumPaymentsByMethod(invoices: Invoice[]): PaymentMethodTotals {
  const totals: PaymentMethodTotals = { cash: 0, card: 0, transfer: 0 };
  for (const inv of invoices) {
    for (const p of getPayments(inv)) {
      applyPaymentMethodDelta(totals, p.method, p.amount);
    }
  }
  return totals;
}

// ─── Loyalty & coupon math ───────────────────────────────────────────────────
// 1 point per 100 (currency units) of invoice total, redeemable 1 point = 1
// unit off a later sale. Kept as named constants/functions rather than
// scattered literals so the rate is easy to retune from one place.

export function calcLoyaltyPointsEarned(invoiceTotal: number): number {
  return Math.floor(Math.max(0, invoiceTotal) / 100);
}

/** Currency value of redeeming `points`, capped at what's actually owed. */
export function calcPointsValue(points: number, cap: number): number {
  return Math.min(Math.max(0, Math.floor(points)), Math.max(0, cap));
}

export function isCouponValid(c: Coupon, now: Date = new Date()): boolean {
  if (!c.active) return false;
  if (c.expiresAt && new Date(c.expiresAt) < now) return false;
  if (c.maxRedemptions != null && c.redeemedCount >= c.maxRedemptions) return false;
  return true;
}

/** Coupon discount off a subtotal, never more than the subtotal itself. */
export function calcCouponDiscount(c: Coupon, subtotal: number): number {
  const raw = c.type === "percent" ? subtotal * (c.value / 100) : c.value;
  return Math.min(Math.max(0, raw), Math.max(0, subtotal));
}

/**
 * Ad-hoc invoice-level discount off a subtotal, never more than the subtotal
 * itself. Same shape as calcCouponDiscount, kept separate because a Coupon
 * carries redemption/expiry rules an invoice-level discount doesn't.
 */
export function calcInvoiceDiscount(
  discount: InvoiceDiscount | undefined,
  subtotal: number,
): number {
  if (!discount) return 0;
  const raw = discount.type === "percent" ? subtotal * (discount.value / 100) : discount.value;
  return Math.min(Math.max(0, raw), Math.max(0, subtotal));
}

export interface ComputedInvoice {
  subtotal: number;
  discountAmount: number; // invoice-level discount only
  couponDiscount: number;
  pointsValue: number;
  tip: number;
  total: number;
  amountPaid: number;
  amountRefunded: number;
  balanceDue: number;
  status: InvoiceStatus;
}

/**
 * The single place invoice arithmetic happens. Screen, PDF, Recent Invoices,
 * and any report must all call this rather than re-deriving totals -- see
 * the audit note on sumPaymentsByMethod below for what duplicated money math
 * already cost this codebase once (finding R1: Transfer silently counted as
 * Card because two call sites bucketed payments differently).
 *
 * `subtotal`/`total` are read from the invoice, not rebuilt from `lines`:
 * they're the sale-time snapshot of what the customer was actually charged,
 * and `lines` alone cannot always reconstruct that. Concretely, every
 * invoice issued before 2026-08-28 was charged with an 18% VAT line (see
 * the removed `calcTax`/`Invoice.tax`) that is baked into its stored `total`
 * but has no corresponding entry in `lines` -- recomputing from `lines`
 * would silently under-total every one of those historical invoices by its
 * VAT amount. `discountAmount` is still derived here (from the new
 * `discount` field, which is undefined on every pre-existing invoice and so
 * contributes 0) purely for display -- it does not feed into `total`.
 *
 * Status is derived from amountPaid vs. total, except the two terminal
 * manual states (Void/Refunded) always pass through as stored -- nobody
 * (including this function) sets "Paid" by hand.
 */
export function computeInvoice(inv: Invoice): ComputedInvoice {
  const subtotal = inv.subtotal;
  const discountAmount = calcInvoiceDiscount(inv.discount, subtotal);
  const couponDiscount = inv.couponDiscount ?? 0;
  const pointsValue = inv.pointsRedeemedValue ?? 0;
  const tip = inv.tip;
  const total = inv.total;

  const amountPaid = getAmountPaid(inv);
  const amountRefunded = getAmountRefunded(inv);
  const balanceDue = Math.max(0, total - amountPaid);

  const status: InvoiceStatus =
    inv.status === "Void" || inv.status === "Refunded"
      ? inv.status
      : amountPaid >= total
        ? "Paid"
        : amountPaid > 0
          ? "Partially Paid"
          : "Issued";

  return {
    subtotal,
    discountAmount,
    couponDiscount,
    pointsValue,
    tip,
    total,
    amountPaid,
    amountRefunded,
    balanceDue,
    status,
  };
}

export interface DraftInvoiceInput {
  lines: InvoiceLine[];
  discount?: InvoiceDiscount;
  coupon?: Coupon;
  pointsToRedeem?: number;
  tip: number;
}

export interface DraftInvoiceTotal {
  subtotal: number;
  discountAmount: number;
  couponDiscount: number;
  pointsValue: number;
  tip: number;
  total: number;
}

/**
 * Same formula computeInvoice's discount/points math is built on, applied to
 * a cart that hasn't been saved as an Invoice yet (so there's no stored
 * subtotal/total to trust -- see computeInvoice's module comment on why it
 * trusts stored fields instead of this kind of from-lines recomputation).
 * The checkout screen calls this instead of inlining its own reduce, so
 * there is exactly one place the subtotal-to-total formula is written.
 */
export function computeDraftInvoiceTotal(input: DraftInvoiceInput): DraftInvoiceTotal {
  const subtotal = input.lines.reduce((s, l) => s + l.unitPrice * l.qty - l.discount, 0);
  const discountAmount = calcInvoiceDiscount(input.discount, subtotal);
  const couponDiscount = input.coupon ? calcCouponDiscount(input.coupon, subtotal) : 0;
  const afterDiscounts = Math.max(0, subtotal - discountAmount - couponDiscount);
  const tip = input.tip;
  const pointsValue = calcPointsValue(input.pointsToRedeem ?? 0, afterDiscounts + tip);
  const total = Math.max(0, afterDiscounts + tip - pointsValue);
  return { subtotal, discountAmount, couponDiscount, pointsValue, tip, total };
}

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  stock: number;
  reorder: number;
  cost: number;
  supplier: string;
  lastUpdated: string;
}

export interface Expense {
  id: string;
  type: "EXPENSE" | "DEPOSIT";
  amount: number;
  category: string;
  paidTo: string;
  description: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  staffId: string;
  staffName: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export type EquipmentStatus = "Active" | "In Maintenance" | "Retired";

export interface Equipment {
  id: string;
  name: string;
  type: string;
  make: string;
  model: string;
  serial: string;
  purchasedAt: string | null;
  status: EquipmentStatus;
  serviceIntervalDays: number;
  lastServiceDate: string | null;
  notes: string;
  createdAt: string;
}

export type MaintenanceType = "Service" | "Repair" | "Inspection" | "Replacement";

export interface MaintenanceLog {
  id: string;
  equipmentId: string;
  type: MaintenanceType;
  description: string;
  performedBy: string;
  cost: number;
  date: string;
  createdAt: string;
}

export type POStatus = "Draft" | "Sent" | "Received" | "Partially Received" | "Cancelled";

export interface POLine {
  inventoryItemId: string;
  itemName: string;
  sku: string;
  unit: string;
  qtyOrdered: number;
  unitCost: number;
  qtyReceived: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplier: string;
  status: POStatus;
  lines: POLine[];
  notes: string;
  createdAt: string;
  sentAt: string | null;
  receivedAt: string | null;
  createdBy: string;
}

export interface NotificationSettings {
  googleReviewLink: string;
  reminderIntervalDays: number;
  serviceReminderTemplate: string;
  reviewRequestTemplate: string;
  // Settings → Notifications' one real toggle (src/server/notifications.ts
  // sendReceiptEmailFn). Defaults off: a customer-facing send is new
  // capability, not something to silently turn on for every existing till.
  receiptEmailEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  googleReviewLink: "",
  reminderIntervalDays: 30,
  serviceReminderTemplate: DEFAULT_TEMPLATES.serviceReminder,
  reviewRequestTemplate: DEFAULT_TEMPLATES.reviewRequest,
  receiptEmailEnabled: false,
};

export type SentNotificationType = "service_reminder" | "review_request" | "receipt_email";

export interface SentNotification {
  id: string;
  type: SentNotificationType;
  customerId: string | null;
  customerName: string;
  phone: string;
  // Only set for type "receipt_email" -- the other two types are WhatsApp/
  // SMS deep-links keyed on phone.
  email?: string;
  sentAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _counter = Date.now();
export function newId(prefix: string): string {
  return `${prefix}-${(++_counter).toString(36)}`;
}

// This file used to continue with a typed localStorage "database"
// (per-collection load/save/upsert/delete helpers, seed data, a
// seedIfNeeded() bootstrapper) from before the Firebase migration. It was
// dead code: nothing outside this file ever called any of it (store.tsx and
// every route import only types and the pure helpers above from here), and
// seedIfNeeded() itself was never invoked either. Removed rather than left
// as an unreachable ~800-line leftover -- see the migration this predates.
