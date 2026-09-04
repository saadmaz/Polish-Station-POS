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
}

// ── Leads (contact/booking inquiries from the public polishstation.lk site) ───
// Written by the Admin SDK from the unauthenticated src/routes/api.public.*
// routes (see src/server/public-api.ts); staff triage them here into a real
// Customer/Booking by hand.
export type LeadType = "contact" | "booking";
export type LeadStatus = "new" | "contacted" | "converted" | "archived";

export interface Lead {
  id: string;
  type: LeadType;
  name: string;
  email?: string;
  phone?: string;
  message?: string;
  vehicle?: string;
  serviceId?: string;
  preferredDate?: string;
  timeWindow?: string;
  notes?: string;
  status: LeadStatus;
  source: string;
  createdAt: string;
  ip?: string | null;
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
  lines: InvoiceLine[];
  subtotal: number;
  tip: number;
  total: number;
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
  return inv.payments && inv.payments.length > 0 ? inv.payments : legacyPayments(inv);
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
