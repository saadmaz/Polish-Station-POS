// Central React store: Firestore-backed with real-time onSnapshot listeners.
// All reads come from in-memory state synced by Firestore.
// All writes go to Firestore; onSnapshot updates local state automatically.
// Components call useStore(); the interface is identical to the old localStorage version.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  addDoc,
  runTransaction,
  query,
  orderBy,
  limit,
  type Query,
  type Unsubscribe,
  type WriteBatch,
} from "firebase/firestore";
import { db as fsDb } from "./firebase";
import { useAuth } from "./auth";
import { hasModule, isManagerOrAbove, type ModuleKey } from "./permissions";
import {
  calcTier,
  calcLoyaltyPointsEarned,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_BUSINESS_INFO,
  DEFAULT_BAYS,
  sanitizeBusinessInfo,
  sanitizeBays,
  setBusinessInfoCache,
  getAmountPaid,
  type BusinessInfo,
} from "./db";
import { synthesizeWalkInJob } from "./job-linking";
import { buildTransitionEvent, nextQuoteVersion } from "./job";
import type { Job, JobEvent, JobStatus } from "./job";
import {
  assertLegalLeadTransition,
  LeadAlreadyConvertedError,
  reconcileServiceIds,
  stampFirstResponse,
} from "./lead";
import { normalizePhone, toE164 } from "./phone";
import type {
  AuditLog,
  Booking,
  BookingType,
  Coupon,
  Customer,
  Equipment,
  Expense,
  InventoryItem,
  Inquiry,
  Invoice,
  Lead,
  LostReason,
  MaintenanceLog,
  NewsletterSubscriber,
  NotificationSettings,
  PaymentRecord,
  POLine,
  POStatus,
  PurchaseOrder,
  RefundRecord,
  SentNotification,
  Service,
} from "./db";

// ── ID helpers ────────────────────────────────────────────────────────────────

function localNextSeq(items: { id: string }[], prefix: string, startAt: number): number {
  const nums = items.map((i) => parseInt(i.id.replace(prefix, ""), 10)).filter((n) => !isNaN(n));
  return nums.length > 0 ? Math.max(...nums) + 1 : startAt;
}

/**
 * Allocate the next sequential id ("INV-2091") from a counters/{name} doc in a
 * Firestore transaction, so two tills charging at the same moment can never
 * mint the same id and silently overwrite each other's document. The local max
 * is used as a floor (self-heals a missing or backwards counter) and as the
 * fallback when the transaction can't run at all (offline), which degrades to
 * the previous single-till behavior instead of blocking the sale.
 */
async function nextSeqId(
  counterName: string,
  prefix: string,
  items: { id: string }[],
  startAt: number,
): Promise<string> {
  const localNext = localNextSeq(items, prefix, startAt);
  try {
    return await runTransaction(fsDb, async (tx) => {
      const ref = fd("counters", counterName);
      const snap = await tx.get(ref);
      const stored = snap.exists() ? Number(snap.data().next) : 0;
      const n = Math.max(Number.isFinite(stored) ? stored : 0, localNext);
      tx.set(ref, { next: n + 1 });
      return `${prefix}${n}`;
    });
  } catch (err) {
    console.error(`[store] counter "${counterName}" unavailable, local allocation:`, err);
    return `${prefix}${localNext}`;
  }
}

function newId(): string {
  return crypto.randomUUID();
}

// ── Context shape ─────────────────────────────────────────────────────────────

interface Store {
  storeLoading: boolean;
  /** Collection names whose Firestore listener is currently erroring (e.g.
   *  permission-denied) — see the note on setListenerErrors in the provider. */
  listenerErrors: Set<string>;

  // data
  services: Service[];
  customers: Customer[];
  coupons: Coupon[];
  bookings: Booking[];
  jobs: Job[];
  invoices: Invoice[];
  inventory: InventoryItem[];
  expenses: Expense[];
  equipmentList: Equipment[];
  maintenanceLogsList: MaintenanceLog[];
  purchaseOrdersList: PurchaseOrder[];
  auditList: AuditLog[];
  leads: Lead[];
  inquiries: Inquiry[];
  newsletterSubscribers: NewsletterSubscriber[];

  // computed
  lowStockItems: InventoryItem[];
  overdueEquipment: Equipment[];

  // Equipment
  upsertEquipment: (eq: Equipment) => void;
  deleteEquipment: (id: string) => void;
  addMaintenanceLog: (log: Omit<MaintenanceLog, "id" | "createdAt">) => MaintenanceLog;
  deleteMaintenanceLog: (id: string) => void;

  // Purchase Orders
  addPurchaseOrder: (
    po: Omit<PurchaseOrder, "id" | "poNumber" | "createdAt">,
  ) => Promise<PurchaseOrder>;
  updatePurchaseOrder: (po: PurchaseOrder) => void;
  deletePurchaseOrder: (id: string) => void;
  receivePO: (
    poId: string,
    receivedLines: { inventoryItemId: string; qtyReceived: number }[],
  ) => void;

  // Notifications
  notificationSettingsData: NotificationSettings;
  sentNotificationsList: SentNotification[];
  customersNeedingReminder: Customer[];
  saveNotificationSettings: (s: NotificationSettings) => void;
  recordNotification: (n: Omit<SentNotification, "id" | "sentAt">) => SentNotification;

  // Customers
  addCustomer: (
    c: Omit<
      Customer,
      "id" | "createdAt" | "visits" | "spend" | "tier" | "lastVisit" | "loyaltyPoints"
    >,
  ) => Customer;
  updateCustomer: (c: Customer) => void;
  deleteCustomer: (id: string) => void;

  // Leads (contact/booking inquiries from the public site, plus manual
  // WhatsApp/phone/walk-in entry) — see src/lib/lead.ts for the status graph
  addLead: (
    data: Omit<Lead, "id" | "createdAt" | "status" | "lostReason" | "duplicateOf" | "convertedTo">,
  ) => Lead;
  // "new" as a target is only legal from lost/archived (Reopen/Restore) --
  // assertLegalLeadTransition is what actually enforces that, this signature
  // just documents every status this function is ever called with.
  transitionLeadStatus: (
    lead: Lead,
    status: "new" | "contacted" | "quoted" | "archived",
    quote?: { quotedAmount?: number; quoteValidUntil?: string },
  ) => void;
  markLeadLost: (lead: Lead, reason: LostReason) => void;
  markLeadDuplicate: (lead: Lead, duplicateOfId: string) => void;
  assignLead: (lead: Lead, staffId: string | null) => void;
  // Batched, not transactional: a manual bulk-selection action (Phase 3's
  // "Mark as Test" bulk bar item), not a data-integrity-sensitive one like
  // the convert paths below -- a partial failure just leaves a few leads
  // untagged, which the operator can retry.
  markLeadsTest: (leads: Lead[], isTest: boolean) => Promise<void>;
  // Atomic: creates/links a Customer, creates the Booking, and flips the
  // lead to converted — or fails entirely with no partial writes. Throws
  // LeadAlreadyConvertedError if the lead was converted by someone else
  // first.
  convertLeadToBooking: (
    lead: Lead,
    bookingType: BookingType,
    data: Omit<Booking, "id" | "createdAt" | "type" | "leadId" | "source" | "customerId">,
  ) => Promise<Booking>;
  // Atomic: links an already-created walk-in Invoice (and its Job, if any)
  // to this lead, stamping leadId/source, and flips the lead to converted.
  convertLeadToInvoiceLink: (lead: Lead, invoiceId: string) => Promise<void>;
  // Atomic: creates the Job and flips the lead to converted, mirroring
  // convertLeadToBooking. Throws LeadAlreadyConvertedError the same way.
  convertLeadToJob: (
    lead: Lead,
    data: Omit<Job, "id" | "createdAt" | "updatedAt" | "status" | "bookingId" | "vehicleId">,
  ) => Promise<Job>;
  // The inspection -> service hop: a plain booking carrying leadId/source
  // forward from an already-converted booking. Does NOT touch lead status —
  // it is deliberately not a second conversion.
  createFollowUpBooking: (
    sourceBooking: Booking,
    data: Omit<Booking, "id" | "createdAt" | "leadId" | "source">,
  ) => Promise<Booking>;

  // Inquiries (contact-form submissions from the public polishstation.lk
  // site, written directly by that site via the client SDK). No status
  // workflow — staff can only view and delete.
  deleteInquiry: (id: string) => void;

  // Newsletter subscribers (newsletter/blog signups from the public site,
  // written by the Admin SDK from api.public.newsletter.ts). Staff can
  // toggle subscribed/unsubscribed and delete, but never create one here.
  toggleSubscriberStatus: (subscriber: NewsletterSubscriber) => void;
  deleteSubscriber: (id: string) => void;

  // Coupons
  addCoupon: (c: Omit<Coupon, "id" | "createdAt" | "redeemedCount">) => Coupon;
  updateCoupon: (c: Coupon) => void;
  deleteCoupon: (id: string) => void;

  // Bookings
  addBooking: (b: Omit<Booking, "id" | "createdAt">) => Promise<Booking>;
  updateBooking: (b: Booking) => void;
  deleteBooking: (id: string) => void;
  checkinBooking: (id: string) => Promise<void>;
  markDepositPaid: (bookingId: string) => void;

  // Jobs (job intake / job card — see src/lib/job.ts). Booking above is
  // still just "the promise"; POS checkout (addInvoice) remains the other
  // writer of this same collection, transitioning a job to "delivered".
  addJob: (
    data: Omit<Job, "id" | "createdAt" | "updatedAt" | "status" | "bookingId" | "vehicleId">,
  ) => Promise<Job>;
  updateJob: (job: Job) => void;
  transitionJobStatus: (id: string, toStatus: JobStatus) => Promise<void>;

  // Services
  upsertService: (s: Service) => void;
  deleteService: (id: string) => void;

  // Inventory
  upsertInventoryItem: (item: InventoryItem) => void;
  deleteInventoryItem: (id: string) => void;
  adjustStock: (id: string, delta: number) => void;

  // Business info (settings/business doc: letterhead details)
  businessInfo: BusinessInfo;
  saveBusinessInfo: (b: BusinessInfo) => void;

  // Bays (settings/bays doc: the list of physical service bays)
  bays: string[];
  saveBays: (bays: string[]) => void;

  // Invoices
  addInvoice: (
    inv: Omit<Invoice, "id" | "createdAt" | "method" | "status" | "payments"> & {
      payments: Omit<PaymentRecord, "id">[];
    },
  ) => Promise<Invoice>;
  updateInvoice: (inv: Invoice) => void;
  voidInvoice: (id: string) => void;
  recordInvoicePayment: (invoiceId: string, payments: Omit<PaymentRecord, "id">[]) => void;
  refundInvoicePayment: (invoiceId: string, refund: Omit<RefundRecord, "id">) => void;

  // Expenses
  addExpense: (e: Omit<Expense, "id" | "createdAt">) => Expense;
  deleteExpense: (id: string) => void;
}

const StoreContext = createContext<Store | null>(null);

// ── Firestore helpers ─────────────────────────────────────────────────────────

function fs(path: string) {
  return collection(fsDb, path);
}
function fd(path: string, id: string) {
  return doc(fsDb, path, id);
}

function write<T extends { id: string }>(collPath: string, item: T): void {
  setDoc(fd(collPath, item.id), item).catch((err) =>
    console.error(`[store] write ${collPath}/${item.id}:`, err),
  );
}

function remove(collPath: string, id: string): void {
  deleteDoc(fd(collPath, id)).catch((err) =>
    console.error(`[store] delete ${collPath}/${id}:`, err),
  );
}

// Partial update for a field-only patch (Lead.assignedTo, Lead.isTest) that
// has nothing to do with the status transition graph. Deliberately NOT
// write() (a full-document setDoc): write() resends the caller's whole local
// copy of the doc, including fields like `convertedTo` that may be stale
// relative to the server (a listener update not yet applied) or entirely
// absent on an already-converted lead -- either way, resending it collides
// with firestore.rules' "convertedTo is immutable/shaped once converted"
// check for a status that isn't even changing. A merge update only ever
// touches the given keys, so the server's own already-correct convertedTo
// (or complete absence of it, for pre-existing malformed records) is what
// the rule evaluates, not this client's possibly-stale snapshot of it.
function patch(collPath: string, id: string, fields: Record<string, unknown>): void {
  updateDoc(fd(collPath, id), fields).catch((err) =>
    console.error(`[store] patch ${collPath}/${id}:`, err),
  );
}

// Batches a legal Job status transition: updates the job doc and appends
// the corresponding JobEvent, atomically. Shared by addInvoice's
// checkout-driven transition to "delivered" and transitionJobStatus's
// direct staff-driven transitions, so the two paths can never drift apart
// on what a "transition" actually writes. Throws IllegalJobTransitionError
// (via buildTransitionEvent) rather than writing an illegal move.
function applyJobStatusTransition(
  batch: WriteBatch,
  job: Job,
  toStatus: JobStatus,
  actor: { id: string; name: string },
  at: string,
): void {
  const event = buildTransitionEvent(job, toStatus, actor, at);
  batch.set(fd("jobs", job.id), { ...job, status: toStatus, updatedAt: at });
  batch.set(fd("jobEvents", event.id), event);
}

// Audit entries always carry the *actor's* verified identity: firestore.rules
// rejects a create whose staffId isn't the caller's own uid, so one staff
// member can no longer write log lines attributed to another.
function logAudit(
  actor: { id: string; name: string } | null,
  entry: { action: string; entity: string; entityId: string; before: unknown; after: unknown },
): void {
  if (!actor) return;
  addDoc(fs("audit"), {
    ...entry,
    staffId: actor.id,
    staffName: actor.name,
    id: newId(),
    createdAt: new Date().toISOString(),
  }).catch(() => {});
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function StoreProvider({ children }: { children: ReactNode }) {
  // Firestore rules require an authenticated user, so listeners must not start
  // until login completes, or all 13 fail with permission-denied (and, before
  // error handlers were added, never resolved storeLoading: infinite spinner).
  const { staff } = useAuth();
  const staffId = staff?.id;
  // Serialised so the listener effect re-runs when a SuperAdmin changes this
  // user's modules (which revokes their token and re-mints the claim).
  const permsKey = staff ? `${staff.role}:${staff.permissions.join(",")}` : "";

  // ── State ──────────────────────────────────────────────────────────────────
  const [storeLoading, setStoreLoading] = useState(true);
  // Names of collections whose onSnapshot listener is currently erroring
  // (e.g. permission-denied). Before this, fail() below only console.error'd
  // and moved on — every consumer saw an empty array, indistinguishable from
  // "genuinely no data". Dashboard reads this to tell "no jobs today" apart
  // from "couldn't read jobs" (audit finding D1).
  const [listenerErrors, setListenerErrors] = useState<Set<string>>(new Set());
  const [services, setServices] = useState<Service[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [maintenanceLogsList, setMaintenanceLogsList] = useState<MaintenanceLog[]>([]);
  const [purchaseOrdersList, setPurchaseOrdersList] = useState<PurchaseOrder[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [newsletterSubscribers, setNewsletterSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [notificationSettingsData, setNotificationSettingsData] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  const [sentNotificationsList, setSentNotificationsList] = useState<SentNotification[]>([]);
  const [auditList, setAuditList] = useState<AuditLog[]>([]);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>(DEFAULT_BUSINESS_INFO);
  const [bays, setBays] = useState<string[]>(DEFAULT_BAYS);

  // Actor identity for audit entries, read through a ref so the mutation
  // callbacks don't have to re-create whenever the profile doc refreshes.
  const actorRef = useRef<{ id: string; name: string } | null>(null);
  actorRef.current = staff ? { id: staff.id, name: staff.name } : null;

  // Ref always holds latest state, safe to use in async mutations without stale closures
  const S = useRef({
    services,
    customers,
    coupons,
    bookings,
    jobs,
    invoices,
    expenses,
    inventory,
    equipmentList,
    maintenanceLogsList,
    purchaseOrdersList,
    sentNotificationsList,
    notificationSettingsData,
    businessInfo,
    bays,
    inquiries,
    newsletterSubscribers,
  });
  useEffect(() => {
    S.current = {
      services,
      customers,
      coupons,
      bookings,
      jobs,
      invoices,
      expenses,
      inventory,
      equipmentList,
      maintenanceLogsList,
      purchaseOrdersList,
      sentNotificationsList,
      notificationSettingsData,
      businessInfo,
      bays,
      inquiries,
      newsletterSubscribers,
    };
  }, [
    services,
    customers,
    coupons,
    bookings,
    jobs,
    invoices,
    expenses,
    inventory,
    equipmentList,
    maintenanceLogsList,
    purchaseOrdersList,
    inquiries,
    newsletterSubscribers,
    sentNotificationsList,
    notificationSettingsData,
    businessInfo,
    bays,
  ]);

  // ── Firestore listeners ────────────────────────────────────────────────────
  useEffect(() => {
    // Not signed in: no listeners (rules would deny them all). Mark the store
    // "loaded" so no route ever waits forever on data that can't arrive:
    // the auth guard in _app.tsx redirects to login before data is needed.
    if (!staffId) {
      setStoreLoading(false);
      setListenerErrors(new Set());
      return;
    }
    setStoreLoading(true);
    setListenerErrors(new Set());

    // Collections whose read rules require a module claim. Subscribing without
    // it would only produce a permission-denied, so skip it and leave the slice
    // empty: the same end state, without the failed request.
    const allowed = (m: ModuleKey) => hasModule(staff.role, staff.permissions, m);

    type Sub = () => Unsubscribe;
    const subs: Sub[] = [];
    const add = (fn: Sub) => subs.push(fn);

    // Unbounded collections are capped: subscribe to the newest N and reverse
    // back to ascending order (which is what every consumer historically
    // assumed from the un-ordered reads). Without a cap, a year of trading
    // makes every login download the shop's entire history. Anything older
    // than the cap still exists in Firestore, it's just not streamed to every
    // till on every login.
    const newestFirst = (path: string, field: string, n: number): Query =>
      query(fs(path), orderBy(field, "desc"), limit(n));

    // Always available to any signed-in user: firestore.rules gates these on
    // `isAuth()` alone, and the dashboard and job cards depend on them.
    add(() =>
      onSnapshot(
        fs("services"),
        (s) => {
          setServices(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Service));
          done();
        },
        fail("services"),
      ),
    );
    add(() =>
      onSnapshot(
        fs("customers"),
        (s) => {
          setCustomers(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Customer));
          done();
        },
        fail("customers"),
      ),
    );
    add(() =>
      onSnapshot(
        fs("coupons"),
        (s) => {
          setCoupons(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Coupon));
          done();
        },
        fail("coupons"),
      ),
    );
    add(() =>
      onSnapshot(
        newestFirst("bookings", "createdAt", 1000),
        (s) => {
          setBookings(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking).reverse());
          done();
        },
        fail("bookings"),
      ),
    );
    add(() =>
      onSnapshot(
        newestFirst("jobs", "createdAt", 1000),
        (s) => {
          setJobs(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Job).reverse());
          done();
        },
        fail("jobs"),
      ),
    );
    add(() =>
      onSnapshot(
        fs("inventory"),
        (s) => {
          setInventory(s.docs.map((d) => ({ id: d.id, ...d.data() }) as InventoryItem));
          done();
        },
        fail("inventory"),
      ),
    );
    add(() =>
      onSnapshot(
        newestFirst("expenses", "createdAt", 1000),
        (s) => {
          setExpenses(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Expense).reverse());
          done();
        },
        fail("expenses"),
      ),
    );
    add(() =>
      onSnapshot(
        fd("settings", "business"),
        (s) => {
          const info = s.exists() ? sanitizeBusinessInfo(s.data()) : DEFAULT_BUSINESS_INFO;
          setBusinessInfo(info);
          setBusinessInfoCache(info); // keeps PDF letterhead in sync
          done();
        },
        fail("settings/business"),
      ),
    );
    add(() =>
      onSnapshot(
        fd("settings", "bays"),
        (s) => {
          setBays(s.exists() ? sanitizeBays(s.data()) : DEFAULT_BAYS);
          done();
        },
        fail("settings/bays"),
      ),
    );
    add(() =>
      onSnapshot(
        fs("equipment"),
        (s) => {
          setEquipmentList(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Equipment));
          done();
        },
        fail("equipment"),
      ),
    );
    add(() =>
      onSnapshot(
        fs("maintenanceLogs"),
        (s) => {
          setMaintenanceLogsList(s.docs.map((d) => ({ id: d.id, ...d.data() }) as MaintenanceLog));
          done();
        },
        fail("maintenanceLogs"),
      ),
    );
    add(() =>
      onSnapshot(
        fd("settings", "notifications"),
        (s) => {
          setNotificationSettingsData(
            s.exists()
              ? { ...DEFAULT_NOTIFICATION_SETTINGS, ...(s.data() as Partial<NotificationSettings>) }
              : DEFAULT_NOTIFICATION_SETTINGS,
          );
          done();
        },
        fail("settings/notifications"),
      ),
    );

    // Module-gated.
    if (allowed("pos"))
      add(() =>
        onSnapshot(
          newestFirst("invoices", "createdAt", 1000),
          (s) => {
            setInvoices(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Invoice).reverse());
            done();
          },
          fail("invoices"),
        ),
      );
    if (allowed("purchase-orders"))
      add(() =>
        onSnapshot(
          fs("purchaseOrders"),
          (s) => {
            setPurchaseOrdersList(s.docs.map((d) => ({ id: d.id, ...d.data() }) as PurchaseOrder));
            done();
          },
          fail("purchaseOrders"),
        ),
      );
    if (allowed("leads"))
      add(() =>
        onSnapshot(
          newestFirst("leads", "createdAt", 500),
          (s) => {
            setLeads(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Lead).reverse());
            done();
          },
          fail("leads"),
        ),
      );
    if (allowed("inquiry"))
      add(() =>
        onSnapshot(
          newestFirst("inquiries", "createdAt", 500),
          (s) => {
            setInquiries(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Inquiry));
            done();
          },
          fail("inquiries"),
        ),
      );
    if (allowed("subscribers"))
      add(() =>
        onSnapshot(
          newestFirst("newsletterSubscribers", "subscribedAt", 1000),
          (s) => {
            setNewsletterSubscribers(
              s.docs.map((d) => ({ id: d.id, ...d.data() }) as NewsletterSubscriber),
            );
            done();
          },
          fail("newsletterSubscribers"),
        ),
      );
    if (allowed("notifications") && isManagerOrAbove(staff.role))
      add(() =>
        onSnapshot(
          newestFirst("sentNotifications", "sentAt", 500),
          (s) => {
            setSentNotificationsList(
              s.docs.map((d) => ({ id: d.id, ...d.data() }) as SentNotification),
            );
            done();
          },
          fail("sentNotifications"),
        ),
      );
    // Matches firestore.rules exactly: `audit` reads require Manager+ and no
    // module claim. Settings' Audit Log panel used to read this from a
    // localStorage stand-in that nothing ever wrote to, so it always showed
    // empty even though every mutation elsewhere already calls logAudit().
    if (isManagerOrAbove(staff.role))
      add(() =>
        onSnapshot(
          newestFirst("audit", "createdAt", 200),
          (s) => {
            setAuditList(s.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditLog));
            done();
          },
          fail("audit"),
        ),
      );

    // Bind `done` to the real subscription count, not a hardcoded 13. A
    // stale constant here is what produces an infinite loading spinner.
    // Unblock the UI on a quorum rather than every listener: the first few
    // snapshots (services/customers/bookings lead the multiplexed
    // channel) are what the landing pages render, and the rest keep
    // streaming into state after the spinner clears. Waiting for all 13
    // held the dashboard hostage ~4s for collections it doesn't show.
    const total = subs.length;
    const quorum = Math.min(4, total);
    let loaded = 0;
    function done() {
      if (++loaded >= quorum) setStoreLoading(false);
    }
    // An errored listener still counts as done: data stays empty, but the UI
    // must never hang on a spinner because a subscription failed. It's
    // recorded in listenerErrors, though, so a consumer that cares (see
    // Dashboard) can render "couldn't load" instead of a false "no data".
    function fail(name: string) {
      return (err: unknown) => {
        console.error(`[store] "${name}" listener error:`, err);
        setListenerErrors((prev) => {
          if (prev.has(name)) return prev;
          const next = new Set(prev);
          next.add(name);
          return next;
        });
        done();
      };
    }

    const unsubs: Unsubscribe[] = subs.map((fn) => fn());
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId, permsKey]);

  // ── Computed ───────────────────────────────────────────────────────────────
  // Dashboard KPIs (Revenue Today / Today's Timeline / Upcoming / Outstanding)
  // are computed by the Dashboard route itself via computeDashboardMetrics(),
  // not here — a single call site for all four is what keeps them from
  // drifting out of sync again.
  const lowStockItems = inventory.filter((i) => i.stock <= i.reorder);
  const overdueEquipment = equipmentList.filter((eq) => {
    if (eq.status === "Retired" || !eq.lastServiceDate) return false;
    return new Date(eq.lastServiceDate).getTime() + eq.serviceIntervalDays * 86400000 < Date.now();
  });
  const customersNeedingReminder = customers.filter((c) => {
    if (!c.lastVisit) return false;
    const daysSince = Math.floor((Date.now() - new Date(c.lastVisit).getTime()) / 86400000);
    if (daysSince < notificationSettingsData.reminderIntervalDays) return false;
    return !sentNotificationsList.find(
      (n) =>
        n.type === "service_reminder" &&
        n.customerId === c.id &&
        Date.now() - new Date(n.sentAt).getTime() <
          notificationSettingsData.reminderIntervalDays * 86400000,
    );
  });

  // ── Customer mutations ─────────────────────────────────────────────────────
  const addCustomer = useCallback(
    (
      data: Omit<
        Customer,
        "id" | "createdAt" | "visits" | "spend" | "tier" | "lastVisit" | "loyaltyPoints"
      >,
    ): Customer => {
      const c: Customer = {
        ...data,
        id: newId(),
        createdAt: new Date().toISOString(),
        visits: 0,
        spend: 0,
        tier: "Bronze",
        lastVisit: null,
        loyaltyPoints: 0,
      };
      write("customers", c);
      logAudit(actorRef.current, {
        action: "ADD_CUSTOMER",
        entity: "Customer",
        entityId: c.id,
        before: null,
        after: c,
      });
      return c;
    },
    [],
  );

  const updateCustomer = useCallback((c: Customer) => {
    const before = S.current.customers.find((x) => x.id === c.id) ?? null;
    write("customers", c);
    logAudit(actorRef.current, {
      action: "UPDATE_CUSTOMER",
      entity: "Customer",
      entityId: c.id,
      before,
      after: c,
    });
  }, []);

  const deleteCustomer = useCallback((id: string) => {
    const before = S.current.customers.find((x) => x.id === id) ?? null;
    remove("customers", id);
    logAudit(actorRef.current, {
      action: "DELETE_CUSTOMER",
      entity: "Customer",
      entityId: id,
      before,
      after: null,
    });
  }, []);

  // ── Lead mutations ─────────────────────────────────────────────────────────
  // See src/lib/lead.ts for the status transition graph and
  // firestore.rules' isLegalLeadUpdate() for its server-side mirror.
  const deleteInquiry = useCallback((id: string) => {
    const before = S.current.inquiries.find((i) => i.id === id) ?? null;
    remove("inquiries", id);
    logAudit(actorRef.current, {
      action: "DELETE_INQUIRY",
      entity: "Inquiry",
      entityId: id,
      before,
      after: null,
    });
  }, []);

  const toggleSubscriberStatus = useCallback((subscriber: NewsletterSubscriber) => {
    const unsubscribing = subscriber.status === "subscribed";
    // write() does a full setDoc, not a merge -- omitting unsubscribedAt
    // (rather than setting it to undefined, which Firestore's SDK rejects
    // outright) is what actually clears it back off the doc on resubscribe.
    const { unsubscribedAt: _drop, ...rest } = subscriber;
    const after: NewsletterSubscriber = {
      ...rest,
      status: unsubscribing ? "unsubscribed" : "subscribed",
      ...(unsubscribing ? { unsubscribedAt: new Date().toISOString() } : {}),
    };
    write("newsletterSubscribers", after);
    logAudit(actorRef.current, {
      action: unsubscribing ? "UNSUBSCRIBE" : "RESUBSCRIBE",
      entity: "NewsletterSubscriber",
      entityId: subscriber.id,
      before: subscriber,
      after,
    });
  }, []);

  const deleteSubscriber = useCallback((id: string) => {
    const before = S.current.newsletterSubscribers.find((s) => s.id === id) ?? null;
    remove("newsletterSubscribers", id);
    logAudit(actorRef.current, {
      action: "DELETE_SUBSCRIBER",
      entity: "NewsletterSubscriber",
      entityId: id,
      before,
      after: null,
    });
  }, []);

  const addLead = useCallback(
    (
      data: Omit<
        Lead,
        "id" | "createdAt" | "status" | "lostReason" | "duplicateOf" | "convertedTo"
      >,
    ): Lead => {
      const e164 = data.phone ? toE164(data.phone) : null;
      const serviceIds = reconcileServiceIds(data);
      const l: Lead = {
        ...data,
        id: newId(),
        status: "new",
        createdAt: new Date().toISOString(),
        // Conditional spread, not `phone: e164 ?? data.phone` -- an
        // undefined field written via setDoc() fails outright, see the
        // Firestore undefined-field convention this codebase follows
        // everywhere else a field is only sometimes present.
        ...(data.phone ? { phone: e164 ?? data.phone, phoneRaw: data.phone } : {}),
        ...(serviceIds.length > 0 ? { serviceIds } : {}),
      };
      write("leads", l);
      logAudit(actorRef.current, {
        action: "ADD_LEAD",
        entity: "Lead",
        entityId: l.id,
        before: null,
        after: l,
      });
      return l;
    },
    [],
  );

  const transitionLeadStatus = useCallback(
    (
      lead: Lead,
      status: "new" | "contacted" | "quoted" | "archived",
      quote?: { quotedAmount?: number; quoteValidUntil?: string },
    ) => {
      assertLegalLeadTransition(lead.status, status);
      const after: Lead = {
        ...lead,
        status,
        ...stampFirstResponse(lead),
        ...(quote?.quotedAmount !== undefined ? { quotedAmount: quote.quotedAmount } : {}),
        ...(quote?.quoteValidUntil ? { quoteValidUntil: quote.quoteValidUntil } : {}),
      };
      write("leads", after);
      logAudit(actorRef.current, {
        action: "UPDATE_LEAD_STATUS",
        entity: "Lead",
        entityId: lead.id,
        before: lead,
        after,
      });
    },
    [],
  );

  const markLeadLost = useCallback((lead: Lead, reason: LostReason) => {
    assertLegalLeadTransition(lead.status, "lost");
    const after: Lead = {
      ...lead,
      status: "lost",
      lostReason: reason,
      ...stampFirstResponse(lead),
    };
    write("leads", after);
    logAudit(actorRef.current, {
      action: "LOSE_LEAD",
      entity: "Lead",
      entityId: lead.id,
      before: lead,
      after,
    });
  }, []);

  const markLeadDuplicate = useCallback((lead: Lead, duplicateOfId: string) => {
    assertLegalLeadTransition(lead.status, "duplicate");
    const after: Lead = {
      ...lead,
      status: "duplicate",
      duplicateOf: duplicateOfId,
      ...stampFirstResponse(lead),
    };
    write("leads", after);
    logAudit(actorRef.current, {
      action: "MARK_LEAD_DUPLICATE",
      entity: "Lead",
      entityId: lead.id,
      before: lead,
      after,
    });
  }, []);

  const assignLead = useCallback((lead: Lead, staffId: string | null) => {
    const after: Lead = { ...lead, assignedTo: staffId };
    patch("leads", lead.id, { assignedTo: staffId });
    logAudit(actorRef.current, {
      action: "ASSIGN_LEAD",
      entity: "Lead",
      entityId: lead.id,
      before: lead,
      after,
    });
  }, []);

  const markLeadsTest = useCallback(async (leads: Lead[], isTest: boolean) => {
    const actor = actorRef.current;
    for (const lead of leads) {
      const after: Lead = { ...lead, isTest };
      patch("leads", lead.id, { isTest });
      logAudit(actor, {
        action: "MARK_LEAD_TEST",
        entity: "Lead",
        entityId: lead.id,
        before: lead,
        after,
      });
    }
  }, []);

  const convertLeadToBooking = useCallback(
    async (
      lead: Lead,
      bookingType: BookingType,
      data: Omit<Booking, "id" | "createdAt" | "type" | "leadId" | "source" | "customerId">,
    ): Promise<Booking> => {
      // Cheap client-side pre-check before any round trip; the real
      // guarantee is the transactional read of the lead doc below, which
      // is what actually stops two staff converting the same lead at once.
      assertLegalLeadTransition(lead.status, "converted");

      // Match against the phone the staff member is actually submitting
      // with this booking (pre-filled from the lead, but editable), not the
      // lead's original phone.
      const normalized = data.phone ? normalizePhone(data.phone) : null;
      const matchedCustomer = normalized
        ? S.current.customers.find((c) => normalizePhone(c.phone) === normalized)
        : undefined;

      // Allocated before the guarded transaction, same precedent as
      // addInvoice's jobId/invoiceId allocation: a booking id "burned" by a
      // transaction that then aborts (e.g. LeadAlreadyConvertedError) is an
      // accepted, pre-existing tradeoff of nextSeqId, not something this
      // function needs to fix.
      const bookingId = await nextSeqId("bookings", "B-", S.current.bookings, 200);
      const actor = actorRef.current;

      const { booking, afterLead } = await runTransaction(fsDb, async (tx) => {
        const leadSnap = await tx.get(fd("leads", lead.id));
        const currentLead = leadSnap.data() as Lead | undefined;
        if (!currentLead || currentLead.status === "converted" || currentLead.convertedTo) {
          throw new LeadAlreadyConvertedError(lead.id);
        }

        let customerId = matchedCustomer?.id ?? null;
        if (!customerId) {
          const newCustomer: Customer = {
            id: newId(),
            name: data.customerName,
            phone: data.phone,
            email: "",
            vehicles: data.vehicleModel
              ? [{ plate: data.plate, model: data.vehicleModel, color: "" }]
              : [],
            visits: 0,
            spend: 0,
            tier: "Bronze",
            lastVisit: null,
            loyaltyPoints: 0,
            createdAt: new Date().toISOString(),
          };
          customerId = newCustomer.id;
          tx.set(fd("customers", newCustomer.id), newCustomer);
        }

        const newBooking: Booking = {
          ...data,
          id: bookingId,
          createdAt: new Date().toISOString(),
          type: bookingType,
          leadId: lead.id,
          source: lead.source,
          customerId,
        };
        tx.set(fd("bookings", bookingId), newBooking);

        const updatedLead: Lead = {
          ...currentLead,
          status: "converted",
          convertedTo: { type: bookingType, id: bookingId },
          ...stampFirstResponse(currentLead),
        };
        tx.set(fd("leads", lead.id), updatedLead);

        return { booking: newBooking, afterLead: updatedLead };
      });

      // Single headline audit entry, matching addInvoice's convention of
      // auditing only the user-facing action even though the transaction
      // also touched customers/bookings.
      logAudit(actor, {
        action: "CONVERT_LEAD",
        entity: "Lead",
        entityId: lead.id,
        before: lead,
        after: afterLead,
      });
      return booking;
    },
    [],
  );

  const convertLeadToJob = useCallback(
    async (
      lead: Lead,
      data: Omit<Job, "id" | "createdAt" | "updatedAt" | "status" | "bookingId" | "vehicleId">,
    ): Promise<Job> => {
      assertLegalLeadTransition(lead.status, "converted");

      const phone = data.customerSnapshot?.phone;
      const normalized = phone ? normalizePhone(phone) : null;
      const matchedCustomer = normalized
        ? S.current.customers.find((c) => normalizePhone(c.phone) === normalized)
        : undefined;

      const jobId = await nextSeqId("jobs", "J-", S.current.jobs, 1);
      const actor = actorRef.current;
      const now = new Date().toISOString();

      const { job, afterLead } = await runTransaction(fsDb, async (tx) => {
        const leadSnap = await tx.get(fd("leads", lead.id));
        const currentLead = leadSnap.data() as Lead | undefined;
        if (!currentLead || currentLead.status === "converted" || currentLead.convertedTo) {
          throw new LeadAlreadyConvertedError(lead.id);
        }

        let customerId = matchedCustomer?.id ?? data.customerId;
        if (!customerId) {
          const newCustomer: Customer = {
            id: newId(),
            name: data.customerName,
            phone: phone ?? "",
            email: data.customerSnapshot?.email ?? "",
            vehicles: data.vehicle
              ? [{ plate: data.vehicle.plate, model: data.vehicle.model, color: "" }]
              : [],
            visits: 0,
            spend: 0,
            tier: "Bronze",
            lastVisit: null,
            loyaltyPoints: 0,
            createdAt: now,
          };
          customerId = newCustomer.id;
          tx.set(fd("customers", newCustomer.id), newCustomer);
        }

        const newJob: Job = {
          ...data,
          id: jobId,
          bookingId: null,
          vehicleId: null,
          customerId,
          status: "booked",
          createdAt: now,
          updatedAt: now,
          leadId: lead.id,
          source: lead.source,
        };
        tx.set(fd("jobs", jobId), newJob);

        const event: JobEvent = {
          id: newId(),
          jobId,
          fromStatus: null,
          toStatus: "booked",
          actorId: actor?.id ?? "",
          actorName: actor?.name ?? "",
          at: now,
          note: null,
        };
        tx.set(fd("jobEvents", event.id), event);

        const updatedLead: Lead = {
          ...currentLead,
          status: "converted",
          convertedTo: { type: "job", id: jobId },
          ...stampFirstResponse(currentLead),
        };
        tx.set(fd("leads", lead.id), updatedLead);

        return { job: newJob, afterLead: updatedLead };
      });

      logAudit(actor, {
        action: "CONVERT_LEAD",
        entity: "Lead",
        entityId: lead.id,
        before: lead,
        after: afterLead,
      });
      return job;
    },
    [],
  );

  const convertLeadToInvoiceLink = useCallback(async (lead: Lead, invoiceId: string) => {
    assertLegalLeadTransition(lead.status, "converted");

    const normalized = lead.phone ? normalizePhone(lead.phone) : null;
    const matchedCustomer = normalized
      ? S.current.customers.find((c) => normalizePhone(c.phone) === normalized)
      : undefined;

    const actor = actorRef.current;

    const afterLead = await runTransaction(fsDb, async (tx) => {
      const [leadSnap, invoiceSnap] = await Promise.all([
        tx.get(fd("leads", lead.id)),
        tx.get(fd("invoices", invoiceId)),
      ]);
      const currentLead = leadSnap.data() as Lead | undefined;
      if (!currentLead || currentLead.status === "converted" || currentLead.convertedTo) {
        throw new LeadAlreadyConvertedError(lead.id);
      }
      const invoice = invoiceSnap.data() as Invoice | undefined;
      if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
      if (invoice.leadId && invoice.leadId !== lead.id) {
        throw new Error(`Invoice ${invoiceId} is already linked to a different lead`);
      }

      // Reads must all happen before any writes below.
      const jobSnap = invoice.jobId ? await tx.get(fd("jobs", invoice.jobId)) : null;

      let customerId = invoice.customerId ?? matchedCustomer?.id ?? null;
      if (!customerId) {
        const newCustomer: Customer = {
          id: newId(),
          name: lead.name,
          phone: lead.phone ?? "",
          email: lead.email ?? "",
          vehicles: [],
          visits: 0,
          spend: 0,
          tier: "Bronze",
          lastVisit: null,
          loyaltyPoints: 0,
          createdAt: new Date().toISOString(),
        };
        customerId = newCustomer.id;
        tx.set(fd("customers", newCustomer.id), newCustomer);
      }

      const updatedInvoice: Invoice = {
        ...invoice,
        leadId: lead.id,
        source: lead.source,
        customerId,
        customerName: invoice.customerName || lead.name,
        // Omit rather than set to undefined when neither side has one (see
        // the Firestore undefined-field write bug this codebase avoids
        // elsewhere) — only touch the key when there's a real value to add.
        ...(!invoice.phone && lead.phone ? { phone: lead.phone } : {}),
      };
      tx.set(fd("invoices", invoiceId), updatedInvoice);

      if (jobSnap && jobSnap.exists() && invoice.jobId) {
        const job = jobSnap.data() as Job;
        tx.set(fd("jobs", invoice.jobId), { ...job, leadId: lead.id, source: lead.source });
      }

      const updatedLead: Lead = {
        ...currentLead,
        status: "converted",
        convertedTo: { type: "walk-in", id: invoiceId },
        ...stampFirstResponse(currentLead),
      };
      tx.set(fd("leads", lead.id), updatedLead);
      return updatedLead;
    });

    logAudit(actor, {
      action: "CONVERT_LEAD",
      entity: "Lead",
      entityId: lead.id,
      before: lead,
      after: afterLead,
    });
  }, []);

  const createFollowUpBooking = useCallback(
    async (
      sourceBooking: Booking,
      data: Omit<Booking, "id" | "createdAt" | "leadId" | "source">,
    ): Promise<Booking> => {
      const b: Booking = {
        ...data,
        id: await nextSeqId("bookings", "B-", S.current.bookings, 200),
        createdAt: new Date().toISOString(),
        // Omit rather than set to undefined: sourceBooking may not have
        // come from a lead at all.
        ...(sourceBooking.leadId ? { leadId: sourceBooking.leadId } : {}),
        ...(sourceBooking.source ? { source: sourceBooking.source } : {}),
      };
      write("bookings", b);
      logAudit(actorRef.current, {
        action: "ADD_BOOKING",
        entity: "Booking",
        entityId: b.id,
        before: null,
        after: b,
      });
      return b;
    },
    [],
  );

  // ── Coupon mutations ───────────────────────────────────────────────────────
  const addCoupon = useCallback(
    (data: Omit<Coupon, "id" | "createdAt" | "redeemedCount">): Coupon => {
      const c: Coupon = {
        ...data,
        id: newId(),
        createdAt: new Date().toISOString(),
        redeemedCount: 0,
      };
      write("coupons", c);
      logAudit(actorRef.current, {
        action: "ADD_COUPON",
        entity: "Coupon",
        entityId: c.id,
        before: null,
        after: c,
      });
      return c;
    },
    [],
  );

  const updateCoupon = useCallback((c: Coupon) => {
    const before = S.current.coupons.find((x) => x.id === c.id) ?? null;
    write("coupons", c);
    logAudit(actorRef.current, {
      action: "UPDATE_COUPON",
      entity: "Coupon",
      entityId: c.id,
      before,
      after: c,
    });
  }, []);

  const deleteCoupon = useCallback((id: string) => {
    const before = S.current.coupons.find((x) => x.id === id) ?? null;
    remove("coupons", id);
    logAudit(actorRef.current, {
      action: "DELETE_COUPON",
      entity: "Coupon",
      entityId: id,
      before,
      after: null,
    });
  }, []);

  // ── Booking mutations ──────────────────────────────────────────────────────
  const addBooking = useCallback(
    async (data: Omit<Booking, "id" | "createdAt">): Promise<Booking> => {
      const b: Booking = {
        ...data,
        id: await nextSeqId("bookings", "B-", S.current.bookings, 200),
        createdAt: new Date().toISOString(),
      };
      write("bookings", b);
      logAudit(actorRef.current, {
        action: "ADD_BOOKING",
        entity: "Booking",
        entityId: b.id,
        before: null,
        after: b,
      });
      return b;
    },
    [],
  );

  const updateBooking = useCallback((b: Booking) => {
    const before = S.current.bookings.find((x) => x.id === b.id) ?? null;
    write("bookings", b);
    logAudit(actorRef.current, {
      action: "UPDATE_BOOKING",
      entity: "Booking",
      entityId: b.id,
      before,
      after: b,
    });
  }, []);

  const deleteBooking = useCallback((id: string) => {
    const before = S.current.bookings.find((x) => x.id === id) ?? null;
    remove("bookings", id);
    logAudit(actorRef.current, {
      action: "DELETE_BOOKING",
      entity: "Booking",
      entityId: id,
      before,
      after: null,
    });
  }, []);

  const checkinBooking = useCallback(async (id: string) => {
    const b = S.current.bookings.find((x) => x.id === id);
    if (!b) return;
    const after = { ...b, status: "Checked-In" as const };
    write("bookings", after);
    logAudit(actorRef.current, {
      action: "CHECKIN_BOOKING",
      entity: "Booking",
      entityId: id,
      before: b,
      after,
    });
  }, []);

  const markDepositPaid = useCallback((bookingId: string) => {
    const b = S.current.bookings.find((x) => x.id === bookingId);
    if (!b) return;
    const after = { ...b, depositStatus: "paid" as const };
    write("bookings", after);
    logAudit(actorRef.current, {
      action: "MARK_DEPOSIT_PAID",
      entity: "Booking",
      entityId: bookingId,
      before: b,
      after,
    });
  }, []);

  // ── Job mutations (job intake) ─────────────────────────────────────────────
  // Direct job creation/editing, distinct from the walk-in synthesis inside
  // addInvoice above: this is a vehicle logged in for work *before* any
  // invoice exists, so the job starts at "booked" the same way a real
  // Booking-derived job would.
  const addJob = useCallback(
    async (
      data: Omit<Job, "id" | "createdAt" | "updatedAt" | "status" | "bookingId" | "vehicleId">,
    ): Promise<Job> => {
      const id = await nextSeqId("jobs", "J-", S.current.jobs, 1);
      const now = new Date().toISOString();
      const actor = actorRef.current ?? { id: "", name: "" };
      const job: Job = {
        ...data,
        id,
        bookingId: null,
        vehicleId: null, // Vehicle cutover not wired into Job in this stage
        status: "booked",
        createdAt: now,
        updatedAt: now,
      };
      // The creation event, built directly rather than via
      // buildTransitionEvent (which transitions an EXISTING job's status —
      // there is no prior status here), same precedent as
      // synthesizeWalkInJob's first chain link in job-linking.ts.
      const event: JobEvent = {
        id: newId(),
        jobId: id,
        fromStatus: null,
        toStatus: "booked",
        actorId: actor.id,
        actorName: actor.name,
        at: now,
        note: null,
      };
      const batch = writeBatch(fsDb);
      batch.set(fd("jobs", id), job);
      batch.set(fd("jobEvents", event.id), event);
      await batch.commit();
      logAudit(actor, { action: "ADD_JOB", entity: "Job", entityId: id, before: null, after: job });
      return job;
    },
    [],
  );

  const updateJob = useCallback((job: Job) => {
    const before = S.current.jobs.find((j) => j.id === job.id) ?? null;
    const now = new Date().toISOString();
    const after: Job = {
      ...job,
      updatedAt: now,
      // Only ever advances via nextQuoteVersion — never set by hand — so a
      // job card PDF already handed to a customer is never silently
      // superseded by an edit that didn't actually change the price.
      estimate: job.estimate
        ? { ...job.estimate, quoteVersion: nextQuoteVersion(before ?? job, job.price) }
        : job.estimate,
    };
    write("jobs", after);
    logAudit(actorRef.current, {
      action: "UPDATE_JOB",
      entity: "Job",
      entityId: job.id,
      before,
      after,
    });
  }, []);

  const transitionJobStatus = useCallback(async (id: string, toStatus: JobStatus) => {
    const job = S.current.jobs.find((j) => j.id === id);
    if (!job) return;
    const actor = actorRef.current ?? { id: "", name: "" };
    const at = new Date().toISOString();
    const batch = writeBatch(fsDb);
    applyJobStatusTransition(batch, job, toStatus, actor, at);
    await batch.commit();
    logAudit(actor, {
      action: "TRANSITION_JOB_STATUS",
      entity: "Job",
      entityId: id,
      before: job,
      after: { ...job, status: toStatus, updatedAt: at },
    });
  }, []);

  // ── Service mutations ──────────────────────────────────────────────────────
  const upsertService = useCallback((s: Service) => {
    const before = S.current.services.find((x) => x.id === s.id) ?? null;
    write("services", s);
    logAudit(actorRef.current, {
      action: "UPSERT_SERVICE",
      entity: "Service",
      entityId: s.id,
      before,
      after: s,
    });
  }, []);
  const deleteService = useCallback((id: string) => {
    const before = S.current.services.find((x) => x.id === id) ?? null;
    remove("services", id);
    logAudit(actorRef.current, {
      action: "DELETE_SERVICE",
      entity: "Service",
      entityId: id,
      before,
      after: null,
    });
  }, []);

  // ── Inventory mutations ────────────────────────────────────────────────────
  const upsertInventoryItem = useCallback((item: InventoryItem) => {
    const before = S.current.inventory.find((x) => x.id === item.id) ?? null;
    write("inventory", item);
    logAudit(actorRef.current, {
      action: "UPSERT_INVENTORY_ITEM",
      entity: "InventoryItem",
      entityId: item.id,
      before,
      after: item,
    });
  }, []);
  const deleteInventoryItem = useCallback((id: string) => {
    const before = S.current.inventory.find((x) => x.id === id) ?? null;
    remove("inventory", id);
    logAudit(actorRef.current, {
      action: "DELETE_INVENTORY_ITEM",
      entity: "InventoryItem",
      entityId: id,
      before,
      after: null,
    });
  }, []);
  const adjustStock = useCallback((id: string, delta: number) => {
    const item = S.current.inventory.find((x) => x.id === id);
    if (!item) return;
    const after = {
      ...item,
      stock: Math.max(0, item.stock + delta),
      lastUpdated: new Date().toISOString(),
    };
    write("inventory", after);
    logAudit(actorRef.current, {
      action: "ADJUST_STOCK",
      entity: "InventoryItem",
      entityId: id,
      before: item,
      after,
    });
  }, []);

  // ── Invoice mutations ──────────────────────────────────────────────────────
  const addInvoice = useCallback(
    async (
      data: Omit<Invoice, "id" | "createdAt" | "method" | "status" | "payments"> & {
        payments: Omit<PaymentRecord, "id">[];
      },
    ): Promise<Invoice> => {
      const payments: PaymentRecord[] = data.payments.map((p) => ({ ...p, id: newId() }));
      const draft: Invoice = {
        ...data,
        payments,
        method: payments[0]?.method ?? "Cash",
        status: "Issued",
        id: await nextSeqId("invoices", "INV-", S.current.invoices, 2090),
        createdAt: new Date().toISOString(),
      };
      // getAmountPaid folds in any deposit already collected earlier, so a
      // checkout that only tenders the remaining balance still resolves to
      // "Paid" rather than incorrectly staying "Partially Paid".
      const amountPaid = getAmountPaid(draft);

      // Every invoice must belong to a same-day Job so the dashboard's
      // "Revenue Today" and "Today's Timeline" can never disagree (see
      // job-linking.ts). If checkout was started from an existing job, use
      // it and transition it to delivered; otherwise this is a walk-in sale
      // with no job at all, so synthesize one — already delivered, with its
      // full event chain — on the spot.
      const batch = writeBatch(fsDb);
      const actor = actorRef.current ?? { id: "", name: "" };
      let jobId = data.jobId ?? null;
      if (jobId) {
        const existing = S.current.jobs.find((j) => j.id === jobId);
        if (existing && existing.status !== "delivered") {
          applyJobStatusTransition(batch, existing, "delivered", actor, draft.createdAt);
        }
      } else {
        jobId = await nextSeqId("jobs", "J-", S.current.jobs, 1);
        const { job, events } = synthesizeWalkInJob(
          {
            createdAt: draft.createdAt,
            customerId: data.customerId,
            customerName: data.customerName,
            plate: "", // Vehicle cutover not wired into Job in this stage
            vehicleModel: "",
            lines: data.lines,
            total: data.total,
            servicesCatalog: services,
          },
          jobId,
          actor,
        );
        batch.set(fd("jobs", jobId), job);
        for (const event of events) {
          batch.set(fd("jobEvents", event.id), event);
        }
      }

      const inv: Invoice = {
        ...draft,
        jobId,
        status: amountPaid >= draft.total ? "Paid" : amountPaid > 0 ? "Partially Paid" : "Issued",
      };
      batch.set(fd("invoices", inv.id), inv);
      // Update customer visit + spend + loyalty points
      if (data.customerId) {
        const c = S.current.customers.find((x) => x.id === data.customerId);
        if (c) {
          const spend = c.spend + data.total;
          const pointsRedeemed = data.pointsRedeemed ?? 0;
          const pointsEarned = calcLoyaltyPointsEarned(data.total);
          batch.set(fd("customers", c.id), {
            ...c,
            visits: c.visits + 1,
            spend,
            tier: calcTier(spend),
            lastVisit: new Date().toISOString(),
            loyaltyPoints: Math.max(0, c.loyaltyPoints - pointsRedeemed) + pointsEarned,
          });
        }
      }
      // Bump the coupon's redemption count so maxRedemptions is enforced.
      if (data.couponCode) {
        const coupon = S.current.coupons.find((x) => x.code === data.couponCode);
        if (coupon) {
          batch.set(fd("coupons", coupon.id), {
            ...coupon,
            redeemedCount: coupon.redeemedCount + 1,
          });
        }
      }
      // Awaited (not fire-and-forget): the caller shows a "payment received"
      // receipt and resets the till off this return, so it must not resolve
      // until the sale is actually durable. A rejection here propagates to
      // the caller instead of silently vanishing into a console.error while
      // the UI reports success for a sale that never landed.
      await batch.commit();
      // Invoice creation is the core money event this store handles, and
      // was the one demonstrably NOT audited before (audit finding ST2) --
      // logged only after commit succeeds, so a failed sale never shows up
      // as a phantom entry.
      logAudit(actorRef.current, {
        action: "ADD_INVOICE",
        entity: "Invoice",
        entityId: inv.id,
        before: null,
        after: inv,
      });
      return inv;
    },
    [services],
  );

  const updateInvoice = useCallback((inv: Invoice) => {
    const before = S.current.invoices.find((x) => x.id === inv.id) ?? null;
    write("invoices", inv);
    logAudit(actorRef.current, {
      action: "UPDATE_INVOICE",
      entity: "Invoice",
      entityId: inv.id,
      before,
      after: inv,
    });
  }, []);

  const voidInvoice = useCallback((id: string) => {
    const inv = S.current.invoices.find((x) => x.id === id);
    if (!inv) return;
    const voided = { ...inv, status: "Void" as const };
    write("invoices", voided);
    logAudit(actorRef.current, {
      action: "VOID_INVOICE",
      entity: "Invoice",
      entityId: inv.id,
      before: inv,
      after: voided,
    });
  }, []);

  // Takes ALL tender lines of one collection in a single call/write. Calling
  // this once per line would lose money: each call reads the invoice from
  // S.current, which doesn't see the previous call's write until the snapshot
  // round-trips, so later lines clobber earlier ones.
  const recordInvoicePayment = useCallback(
    (invoiceId: string, newPayments: Omit<PaymentRecord, "id">[]) => {
      const inv = S.current.invoices.find((x) => x.id === invoiceId);
      if (!inv || newPayments.length === 0) return;
      const payments = [
        ...(inv.payments ?? []),
        ...newPayments.map((p) => ({ ...p, id: newId() })),
      ];
      const updated = { ...inv, payments };
      const amountPaid = getAmountPaid(updated);
      write("invoices", {
        ...updated,
        status: amountPaid >= inv.total ? "Paid" : "Partially Paid",
      });
    },
    [],
  );

  const refundInvoicePayment = useCallback(
    (invoiceId: string, refund: Omit<RefundRecord, "id">) => {
      const inv = S.current.invoices.find((x) => x.id === invoiceId);
      if (!inv) return;
      const refunds = [...(inv.refunds ?? []), { ...refund, id: newId() }];
      const amountPaid = getAmountPaid(inv);
      const amountRefunded = refunds.reduce((s, r) => s + r.amount, 0);
      const batch = writeBatch(fsDb);
      batch.set(fd("invoices", invoiceId), {
        ...inv,
        refunds,
        status: amountRefunded >= amountPaid ? "Refunded" : inv.status,
      });
      if (inv.customerId) {
        const c = S.current.customers.find((x) => x.id === inv.customerId);
        if (c) {
          const spend = Math.max(0, c.spend - refund.amount);
          batch.set(fd("customers", c.id), { ...c, spend, tier: calcTier(spend) });
        }
      }
      batch.commit().catch((err) => console.error("[store] refundInvoicePayment:", err));
      logAudit(actorRef.current, {
        action: "REFUND_INVOICE",
        entity: "Invoice",
        entityId: invoiceId,
        before: inv,
        after: { refund },
      });
    },
    [],
  );

  // ── Expense mutations ──────────────────────────────────────────────────────
  const addExpense = useCallback((data: Omit<Expense, "id" | "createdAt">): Expense => {
    const e: Expense = { ...data, id: newId(), createdAt: new Date().toISOString() };
    write("expenses", e);
    logAudit(actorRef.current, {
      action: "ADD_EXPENSE",
      entity: "Expense",
      entityId: e.id,
      before: null,
      after: e,
    });
    return e;
  }, []);

  const deleteExpense = useCallback((id: string) => {
    const e = S.current.expenses.find((x) => x.id === id);
    remove("expenses", id);
    logAudit(actorRef.current, {
      action: "DELETE_EXPENSE",
      entity: "Expense",
      entityId: id,
      before: e ?? null,
      after: null,
    });
  }, []);

  // ── Equipment mutations ────────────────────────────────────────────────────
  const upsertEquipment = useCallback((eq: Equipment) => {
    const before = S.current.equipmentList.find((x) => x.id === eq.id) ?? null;
    write("equipment", eq);
    logAudit(actorRef.current, {
      action: before ? "UPDATE_EQUIPMENT" : "ADD_EQUIPMENT",
      entity: "Equipment",
      entityId: eq.id,
      before,
      after: eq,
    });
  }, []);
  const deleteEquipment = useCallback((id: string) => {
    const before = S.current.equipmentList.find((x) => x.id === id) ?? null;
    remove("equipment", id);
    logAudit(actorRef.current, {
      action: "DELETE_EQUIPMENT",
      entity: "Equipment",
      entityId: id,
      before,
      after: null,
    });
  }, []);

  const addMaintenanceLog = useCallback(
    (data: Omit<MaintenanceLog, "id" | "createdAt">): MaintenanceLog => {
      const m: MaintenanceLog = { ...data, id: newId(), createdAt: new Date().toISOString() };
      write("maintenanceLogs", m);
      logAudit(actorRef.current, {
        action: "ADD_MAINTENANCE_LOG",
        entity: "MaintenanceLog",
        entityId: m.id,
        before: null,
        after: m,
      });
      // Update equipment's lastServiceDate if this is more recent
      const eq = S.current.equipmentList.find((e) => e.id === data.equipmentId);
      if (eq && (eq.lastServiceDate === null || data.date > eq.lastServiceDate)) {
        write("equipment", { ...eq, lastServiceDate: data.date });
      }
      return m;
    },
    [],
  );

  const deleteMaintenanceLog = useCallback((id: string) => {
    const before = S.current.maintenanceLogsList.find((x) => x.id === id) ?? null;
    remove("maintenanceLogs", id);
    logAudit(actorRef.current, {
      action: "DELETE_MAINTENANCE_LOG",
      entity: "MaintenanceLog",
      entityId: id,
      before,
      after: null,
    });
  }, []);

  // ── Purchase Order mutations ───────────────────────────────────────────────
  const addPurchaseOrder = useCallback(
    async (data: Omit<PurchaseOrder, "id" | "poNumber" | "createdAt">): Promise<PurchaseOrder> => {
      const id = await nextSeqId("purchaseOrders", "PO-", S.current.purchaseOrdersList, 1000);
      const po: PurchaseOrder = { ...data, id, poNumber: id, createdAt: new Date().toISOString() };
      write("purchaseOrders", po);
      logAudit(actorRef.current, {
        action: "ADD_PURCHASE_ORDER",
        entity: "PurchaseOrder",
        entityId: po.id,
        before: null,
        after: po,
      });
      return po;
    },
    [],
  );

  const updatePurchaseOrder = useCallback((po: PurchaseOrder) => {
    const before = S.current.purchaseOrdersList.find((x) => x.id === po.id) ?? null;
    write("purchaseOrders", po);
    logAudit(actorRef.current, {
      action: "UPDATE_PURCHASE_ORDER",
      entity: "PurchaseOrder",
      entityId: po.id,
      before,
      after: po,
    });
  }, []);
  const deletePurchaseOrder = useCallback((id: string) => {
    const before = S.current.purchaseOrdersList.find((x) => x.id === id) ?? null;
    remove("purchaseOrders", id);
    logAudit(actorRef.current, {
      action: "DELETE_PURCHASE_ORDER",
      entity: "PurchaseOrder",
      entityId: id,
      before,
      after: null,
    });
  }, []);

  const receivePO = useCallback(
    (poId: string, receivedLines: { inventoryItemId: string; qtyReceived: number }[]) => {
      const po = S.current.purchaseOrdersList.find((x) => x.id === poId);
      if (!po) return;
      const updatedLines: POLine[] = po.lines.map((l) => {
        const recv = receivedLines.find((r) => r.inventoryItemId === l.inventoryItemId);
        return { ...l, qtyReceived: recv ? recv.qtyReceived : l.qtyReceived };
      });
      const allReceived = updatedLines.every((l) => l.qtyReceived >= l.qtyOrdered);
      const anyReceived = updatedLines.some((l) => l.qtyReceived > 0);
      const status: POStatus = allReceived
        ? "Received"
        : anyReceived
          ? "Partially Received"
          : po.status;
      const batch = writeBatch(fsDb);
      batch.set(fd("purchaseOrders", po.id), {
        ...po,
        lines: updatedLines,
        status,
        receivedAt: allReceived ? new Date().toISOString() : po.receivedAt,
      });
      // Adjust inventory stock for newly received quantities. Compare against
      // the *original* po.lines (pre-update): updatedLines already carries
      // the new cumulative qtyReceived, so comparing against it would always
      // read as "nothing new received."
      for (const l of po.lines) {
        const recv = receivedLines.find((r) => r.inventoryItemId === l.inventoryItemId);
        if (recv && recv.qtyReceived > l.qtyReceived) {
          const item = S.current.inventory.find((i) => i.id === l.inventoryItemId);
          if (item) {
            batch.set(fd("inventory", item.id), {
              ...item,
              stock: Math.max(0, item.stock + (recv.qtyReceived - l.qtyReceived)),
              lastUpdated: new Date().toISOString(),
            });
          }
        }
      }
      batch
        .commit()
        .then(() => {
          logAudit(actorRef.current, {
            action: "RECEIVE_PO",
            entity: "PurchaseOrder",
            entityId: po.id,
            before: po,
            after: { ...po, lines: updatedLines, status },
          });
        })
        .catch((err) => console.error("[store] receivePO:", err));
    },
    [],
  );

  // ── Notification mutations ─────────────────────────────────────────────────
  const saveNotificationSettings = useCallback((s: NotificationSettings) => {
    setDoc(fd("settings", "notifications"), s).catch((err) =>
      console.error("[store] saveNotificationSettings:", err),
    );
  }, []);

  // ── Business info ──────────────────────────────────────────────────────────
  // Write is gated by firestore.rules (Manager+ holding the settings module),
  // same as the notification settings above.
  const saveBusinessInfo = useCallback((b: BusinessInfo) => {
    const before = S.current.businessInfo;
    const sanitized = sanitizeBusinessInfo(b);
    setDoc(fd("settings", "business"), sanitized)
      .then(() => {
        logAudit(actorRef.current, {
          action: "UPDATE_BUSINESS_INFO",
          entity: "Settings",
          entityId: "business",
          before,
          after: sanitized,
        });
      })
      .catch((err) => console.error("[store] saveBusinessInfo:", err));
  }, []);

  // ── Bays ────────────────────────────────────────────────────────────────────
  const saveBays = useCallback((next: string[]) => {
    const before = S.current.bays;
    const sanitized = sanitizeBays({ bays: next });
    setDoc(fd("settings", "bays"), { bays: sanitized })
      .then(() => {
        logAudit(actorRef.current, {
          action: "UPDATE_BAYS",
          entity: "Settings",
          entityId: "bays",
          before: { bays: before },
          after: { bays: sanitized },
        });
      })
      .catch((err) => console.error("[store] saveBays:", err));
  }, []);

  const recordNotification = useCallback(
    (n: Omit<SentNotification, "id" | "sentAt">): SentNotification => {
      const entry: SentNotification = { ...n, id: newId(), sentAt: new Date().toISOString() };
      write("sentNotifications", entry);
      return entry;
    },
    [],
  );

  // ── Context value ──────────────────────────────────────────────────────────
  const value: Store = {
    storeLoading,
    listenerErrors,
    services,
    customers,
    coupons,
    bookings,
    jobs,
    invoices,
    inventory,
    expenses,
    equipmentList,
    maintenanceLogsList,
    purchaseOrdersList,
    auditList,
    leads,
    inquiries,
    deleteInquiry,
    newsletterSubscribers,
    toggleSubscriberStatus,
    deleteSubscriber,
    lowStockItems,
    overdueEquipment,
    upsertEquipment,
    deleteEquipment,
    addMaintenanceLog,
    deleteMaintenanceLog,
    addPurchaseOrder,
    updatePurchaseOrder,
    deletePurchaseOrder,
    receivePO,
    notificationSettingsData,
    sentNotificationsList,
    customersNeedingReminder,
    saveNotificationSettings,
    recordNotification,
    businessInfo,
    saveBusinessInfo,
    bays,
    saveBays,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    addLead,
    transitionLeadStatus,
    markLeadLost,
    markLeadDuplicate,
    assignLead,
    markLeadsTest,
    convertLeadToBooking,
    convertLeadToInvoiceLink,
    convertLeadToJob,
    createFollowUpBooking,
    addCoupon,
    updateCoupon,
    deleteCoupon,
    addBooking,
    updateBooking,
    deleteBooking,
    checkinBooking,
    markDepositPaid,
    addJob,
    updateJob,
    transitionJobStatus,
    upsertService,
    deleteService,
    upsertInventoryItem,
    deleteInventoryItem,
    adjustStock,
    addInvoice,
    updateInvoice,
    voidInvoice,
    recordInvoicePayment,
    refundInvoicePayment,
    addExpense,
    deleteExpense,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore outside StoreProvider");
  return ctx;
}
