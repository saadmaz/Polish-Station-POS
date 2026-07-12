// Central React store — Firestore-backed with real-time onSnapshot listeners.
// All reads come from in-memory state synced by Firestore.
// All writes go to Firestore; onSnapshot updates local state automatically.
// Components call useStore() — the interface is identical to the old localStorage version.

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
  deleteDoc,
  updateDoc,
  onSnapshot,
  writeBatch,
  addDoc,
  runTransaction,
  query,
  orderBy,
  limit,
  type Query,
  type Unsubscribe,
} from "firebase/firestore";
import { db as fsDb } from "./firebase";
import { useAuth } from "./auth";
import { hasModule, isManagerOrAbove, type ModuleKey } from "./permissions";
import {
  calcTier,
  getQCTemplate,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_BUSINESS_INFO,
  sanitizeBusinessInfo,
  setBusinessInfoCache,
  getPayments,
  getAmountPaid,
  type BusinessInfo,
} from "./db";
import type {
  AuditLog,
  Booking,
  Customer,
  Equipment,
  Expense,
  InventoryItem,
  Invoice,
  Job,
  JobPhoto,
  JobStatus,
  MaintenanceLog,
  NotificationSettings,
  PaymentMethod,
  PaymentRecord,
  POLine,
  POStatus,
  PurchaseOrder,
  QCItem,
  RefundRecord,
  SentNotification,
  Service,
  Shift,
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
 * fallback when the transaction can't run at all (offline) — which degrades to
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
    console.error(`[store] counter "${counterName}" unavailable — local allocation:`, err);
    return `${prefix}${localNext}`;
  }
}

function newId(): string {
  return crypto.randomUUID();
}

// ── Context shape ─────────────────────────────────────────────────────────────

interface Store {
  storeLoading: boolean;

  // data
  services: Service[];
  customers: Customer[];
  jobs: Job[];
  bookings: Booking[];
  invoices: Invoice[];
  inventory: InventoryItem[];
  expenses: Expense[];
  shifts: Shift[];
  equipmentList: Equipment[];
  maintenanceLogsList: MaintenanceLog[];
  purchaseOrdersList: PurchaseOrder[];
  auditList: AuditLog[];

  // computed
  openShift: Shift | undefined;
  lowStockItems: InventoryItem[];
  overdueEquipment: Equipment[];
  todayRevenue: number;
  todayJobs: number;

  // mutations
  refreshAll: () => void;

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
  jobsNeedingReview: Job[];
  saveNotificationSettings: (s: NotificationSettings) => void;
  recordNotification: (n: Omit<SentNotification, "id" | "sentAt">) => SentNotification;

  // Jobs
  addJob: (
    j: Omit<Job, "id" | "createdAt" | "startedAt" | "completedAt" | "elapsedMin">,
  ) => Promise<Job>;
  updateJob: (j: Job) => void;
  deleteJob: (id: string) => void;
  moveJob: (id: string, status: JobStatus, tech?: string, bay?: string) => void;
  addJobPhoto: (jobId: string, photo: Omit<JobPhoto, "id">) => void;
  removeJobPhoto: (jobId: string, photoId: string) => void;
  updateQCItems: (jobId: string, items: QCItem[]) => void;

  // Customers
  addCustomer: (
    c: Omit<Customer, "id" | "createdAt" | "visits" | "spend" | "tier" | "lastVisit">,
  ) => Customer;
  updateCustomer: (c: Customer) => void;
  deleteCustomer: (id: string) => void;

  // Bookings
  addBooking: (b: Omit<Booking, "id" | "createdAt">) => Promise<Booking>;
  updateBooking: (b: Booking) => void;
  deleteBooking: (id: string) => void;
  checkinBooking: (id: string) => Promise<void>;
  markDepositPaid: (bookingId: string) => void;

  // Services
  upsertService: (s: Service) => void;
  deleteService: (id: string) => void;

  // Inventory
  upsertInventoryItem: (item: InventoryItem) => void;
  deleteInventoryItem: (id: string) => void;
  adjustStock: (id: string, delta: number) => void;

  // Business info (settings/business doc — letterhead + VAT rate)
  businessInfo: BusinessInfo;
  saveBusinessInfo: (b: BusinessInfo) => void;

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

  // Shifts
  openShiftFn: (data: {
    staffId: string;
    staffName: string;
    openingBalance: number;
    openingDenominations: Record<string, number>;
    notes: string;
  }) => Shift;
  closeShiftFn: (data: {
    closingBalance: number;
    closingDenominations: Record<string, number>;
    notes: string;
    verifiedBy: string;
    variance: number;
  }) => void;
  addSaleToShift: (invoiceId: string, method: PaymentMethod, amount: number) => void;
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

function patch(collPath: string, id: string, data: Record<string, unknown>): void {
  updateDoc(fd(collPath, id), data).catch((err) =>
    console.error(`[store] patch ${collPath}/${id}:`, err),
  );
}

function remove(collPath: string, id: string): void {
  deleteDoc(fd(collPath, id)).catch((err) =>
    console.error(`[store] delete ${collPath}/${id}:`, err),
  );
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
  // Firestore rules require an authenticated user — listeners must not start
  // until login completes, or all 13 fail with permission-denied (and, before
  // error handlers were added, never resolved storeLoading: infinite spinner).
  const { staff } = useAuth();
  const staffId = staff?.id;
  // Serialised so the listener effect re-runs when a SuperAdmin changes this
  // user's modules (which revokes their token and re-mints the claim).
  const permsKey = staff ? `${staff.role}:${staff.permissions.join(",")}` : "";

  // ── State ──────────────────────────────────────────────────────────────────
  const [storeLoading, setStoreLoading] = useState(true);
  const [services, setServices] = useState<Service[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [maintenanceLogsList, setMaintenanceLogsList] = useState<MaintenanceLog[]>([]);
  const [purchaseOrdersList, setPurchaseOrdersList] = useState<PurchaseOrder[]>([]);
  const [notificationSettingsData, setNotificationSettingsData] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  const [sentNotificationsList, setSentNotificationsList] = useState<SentNotification[]>([]);
  const [auditList, setAuditList] = useState<AuditLog[]>([]);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>(DEFAULT_BUSINESS_INFO);

  // Actor identity for audit entries, read through a ref so the mutation
  // callbacks don't have to re-create whenever the profile doc refreshes.
  const actorRef = useRef<{ id: string; name: string } | null>(null);
  actorRef.current = staff ? { id: staff.id, name: staff.name } : null;

  // Ref always holds latest state — safe to use in async mutations without stale closures
  const S = useRef({
    jobs,
    customers,
    bookings,
    invoices,
    shifts,
    expenses,
    inventory,
    equipmentList,
    maintenanceLogsList,
    purchaseOrdersList,
    sentNotificationsList,
    notificationSettingsData,
  });
  useEffect(() => {
    S.current = {
      jobs,
      customers,
      bookings,
      invoices,
      shifts,
      expenses,
      inventory,
      equipmentList,
      maintenanceLogsList,
      purchaseOrdersList,
      sentNotificationsList,
      notificationSettingsData,
    };
  }, [
    jobs,
    customers,
    bookings,
    invoices,
    shifts,
    expenses,
    inventory,
    equipmentList,
    maintenanceLogsList,
    purchaseOrdersList,
    sentNotificationsList,
    notificationSettingsData,
  ]);

  // ── Firestore listeners ────────────────────────────────────────────────────
  useEffect(() => {
    // Not signed in: no listeners (rules would deny them all). Mark the store
    // "loaded" so no route ever waits forever on data that can't arrive —
    // the auth guard in _app.tsx redirects to login before data is needed.
    if (!staffId) {
      setStoreLoading(false);
      return;
    }
    setStoreLoading(true);

    // Collections whose read rules require a module claim. Subscribing without
    // it would only produce a permission-denied, so skip it and leave the slice
    // empty — the same end state, without the failed request.
    const allowed = (m: ModuleKey) => hasModule(staff.role, staff.permissions, m);

    type Sub = () => Unsubscribe;
    const subs: Sub[] = [];
    const add = (fn: Sub) => subs.push(fn);

    // Unbounded collections are capped: subscribe to the newest N and reverse
    // back to ascending order (which is what every consumer historically
    // assumed from the un-ordered reads). Without a cap, a year of trading
    // makes every login download the shop's entire history. Anything older
    // than the cap still exists in Firestore — it's just not streamed to every
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
        newestFirst("shifts", "openedAt", 400),
        (s) => {
          setShifts(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Shift).reverse());
          done();
        },
        fail("shifts"),
      ),
    );
    add(() =>
      onSnapshot(
        fd("settings", "business"),
        (s) => {
          const info = s.exists() ? sanitizeBusinessInfo(s.data()) : DEFAULT_BUSINESS_INFO;
          setBusinessInfo(info);
          setBusinessInfoCache(info); // keeps calcTax/PDF letterhead in sync
          done();
        },
        fail("settings/business"),
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

    // Bind `done` to the real subscription count, not a hardcoded 13 — a
    // stale constant here is what produces an infinite loading spinner.
    // Unblock the UI on a quorum rather than every listener: the first few
    // snapshots (services/customers/jobs/bookings lead the multiplexed
    // channel) are what the landing pages render, and the rest keep
    // streaming into state after the spinner clears. Waiting for all 13
    // held the dashboard hostage ~4s for collections it doesn't show.
    const total = subs.length;
    const quorum = Math.min(4, total);
    let loaded = 0;
    function done() {
      if (++loaded >= quorum) setStoreLoading(false);
    }
    // An errored listener still counts as done — data stays empty, but the UI
    // must never hang on a spinner because a subscription failed.
    function fail(name: string) {
      return (err: unknown) => {
        console.error(`[store] "${name}" listener error:`, err);
        done();
      };
    }

    const unsubs: Unsubscribe[] = subs.map((fn) => fn());
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId, permsKey]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const openShift = shifts.find((s) => s.status === "OPEN");
  const today = new Date().toISOString().slice(0, 10);
  const todayRevenue = invoices
    .filter((i) => i.createdAt.startsWith(today))
    .reduce((s, i) => s + i.total, 0);
  const todayJobs = jobs.filter(
    (j) => j.status === "Done Today" || j.completedAt?.startsWith(today),
  ).length;
  const lowStockItems = inventory.filter((i) => i.stock <= i.reorder);
  const overdueEquipment = equipmentList.filter((eq) => {
    if (eq.status === "Retired" || !eq.lastServiceDate) return false;
    return new Date(eq.lastServiceDate).getTime() + eq.serviceIntervalDays * 86400000 < Date.now();
  });
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
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
  const jobsNeedingReview = jobs.filter((j) => {
    if (j.status !== "Done Today" && !j.completedAt) return false;
    if (j.completedAt && j.completedAt < sevenDaysAgo) return false;
    return !sentNotificationsList.find((n) => n.type === "review_request" && n.jobId === j.id);
  });

  // ── Shift total recalculation ──────────────────────────────────────────────
  // Sums payments/refunds tagged with this shift's sessionId, across ALL
  // invoices — not just invoices originally opened in this shift. This is
  // what makes "collect the rest of a bill next week" and "refund today for
  // a sale from last month" reconcile against the *current* drawer, not the
  // invoice's original one.
  const recalcShift = useCallback((shiftId: string) => {
    const { expenses: exps, invoices: invs } = S.current;
    const shiftExps = exps.filter((e) => e.sessionId === shiftId);

    let cashIn = 0;
    let cardIn = 0;
    for (const inv of invs) {
      for (const p of getPayments(inv)) {
        if (p.sessionId !== shiftId) continue;
        if (p.method === "Cash") cashIn += p.amount;
        else cardIn += p.amount;
      }
      for (const r of inv.refunds ?? []) {
        if (r.sessionId !== shiftId) continue;
        if (r.method === "Cash") cashIn -= r.amount;
        else cardIn -= r.amount;
      }
    }

    patch("shifts", shiftId, {
      cashSales: cashIn,
      cardSales: cardIn,
      totalExpenses: shiftExps
        .filter((e) => e.type === "EXPENSE")
        .reduce((s, e) => s + e.amount, 0),
      totalDeposits: shiftExps
        .filter((e) => e.type === "DEPOSIT")
        .reduce((s, e) => s + e.amount, 0),
    });
  }, []);

  // ── Job mutations ──────────────────────────────────────────────────────────
  const addJob = useCallback(
    async (
      data: Omit<Job, "id" | "createdAt" | "startedAt" | "completedAt" | "elapsedMin">,
    ): Promise<Job> => {
      const j: Job = {
        ...data,
        id: await nextSeqId("jobs", "J-", S.current.jobs, 1041),
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        elapsedMin: 0,
      };
      write("jobs", j);
      logAudit(actorRef.current, {
        action: "ADD_JOB",
        entity: "Job",
        entityId: j.id,
        before: null,
        after: j,
      });
      return j;
    },
    [],
  );

  const updateJob = useCallback((j: Job) => write("jobs", j), []);

  const deleteJob = useCallback((id: string) => remove("jobs", id), []);

  const moveJob = useCallback((id: string, status: JobStatus, tech?: string, bay?: string) => {
    const j = S.current.jobs.find((x) => x.id === id);
    if (!j) return;
    const now = new Date().toISOString();
    const autoQC =
      status === "Awaiting QC" && !j.qcItems?.length
        ? getQCTemplate(j.category).map((label, i) => ({
            id: `qc-${id}-${i}`,
            label,
            checked: false,
          }))
        : j.qcItems;
    write("jobs", {
      ...j,
      status,
      tech: tech ?? j.tech,
      bay: bay ?? j.bay,
      startedAt: status === "In Bay" && !j.startedAt ? now : j.startedAt,
      completedAt: status === "Done Today" ? now : j.completedAt,
      qcItems: autoQC,
      qcCompletedBy: status === "Ready" ? (j.qcCompletedBy ?? "") : j.qcCompletedBy,
      qcCompletedAt: status === "Ready" ? (j.qcCompletedAt ?? now) : j.qcCompletedAt,
    });
  }, []);

  const addJobPhoto = useCallback((jobId: string, photo: Omit<JobPhoto, "id">) => {
    const j = S.current.jobs.find((x) => x.id === jobId);
    if (!j) return;
    write("jobs", { ...j, photos: [...(j.photos ?? []), { ...photo, id: newId() }] });
  }, []);

  const removeJobPhoto = useCallback((jobId: string, photoId: string) => {
    const j = S.current.jobs.find((x) => x.id === jobId);
    if (!j) return;
    write("jobs", { ...j, photos: (j.photos ?? []).filter((p) => p.id !== photoId) });
  }, []);

  const updateQCItems = useCallback((jobId: string, items: QCItem[]) => {
    const j = S.current.jobs.find((x) => x.id === jobId);
    if (!j) return;
    write("jobs", { ...j, qcItems: items });
  }, []);

  // ── Customer mutations ─────────────────────────────────────────────────────
  const addCustomer = useCallback(
    (
      data: Omit<Customer, "id" | "createdAt" | "visits" | "spend" | "tier" | "lastVisit">,
    ): Customer => {
      const c: Customer = {
        ...data,
        id: newId(),
        createdAt: new Date().toISOString(),
        visits: 0,
        spend: 0,
        tier: "Bronze",
        lastVisit: null,
      };
      write("customers", c);
      return c;
    },
    [],
  );

  const updateCustomer = useCallback((c: Customer) => write("customers", c), []);

  const deleteCustomer = useCallback((id: string) => remove("customers", id), []);

  // ── Booking mutations ──────────────────────────────────────────────────────
  const addBooking = useCallback(
    async (data: Omit<Booking, "id" | "createdAt">): Promise<Booking> => {
      const b: Booking = {
        ...data,
        id: await nextSeqId("bookings", "B-", S.current.bookings, 200),
        createdAt: new Date().toISOString(),
      };
      write("bookings", b);
      return b;
    },
    [],
  );

  const updateBooking = useCallback((b: Booking) => write("bookings", b), []);

  const deleteBooking = useCallback((id: string) => remove("bookings", id), []);

  const checkinBooking = useCallback(async (id: string) => {
    const b = S.current.bookings.find((x) => x.id === id);
    if (!b) return;
    const j: Job = {
      id: await nextSeqId("jobs", "J-", S.current.jobs, 1041),
      customerId: b.customerId,
      customerName: b.customerName,
      phone: b.phone,
      plate: b.plate,
      vehicleModel: b.vehicleModel,
      vehicleColor: "",
      serviceId: b.serviceId,
      serviceName: b.serviceName,
      category: b.category,
      price: b.price,
      tech: b.tech,
      bay: b.bay,
      status: "Queue",
      elapsedMin: 0,
      estimateMin: b.durationMin,
      sessionId: S.current.shifts.find((s) => s.status === "OPEN")?.id ?? null,
      notes: b.notes,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      depositPaid: b.depositStatus === "paid" ? (b.depositAmount ?? 0) : 0,
    };
    const batch = writeBatch(fsDb);
    batch.set(fd("bookings", b.id), { ...b, status: "Checked-In" });
    batch.set(fd("jobs", j.id), j);
    batch.commit().catch((err) => console.error("[store] checkinBooking:", err));
  }, []);

  const markDepositPaid = useCallback((bookingId: string) => {
    const b = S.current.bookings.find((x) => x.id === bookingId);
    if (!b) return;
    write("bookings", { ...b, depositStatus: "paid" });
  }, []);

  // ── Service mutations ──────────────────────────────────────────────────────
  const upsertService = useCallback((s: Service) => write("services", s), []);
  const deleteService = useCallback((id: string) => remove("services", id), []);

  // ── Inventory mutations ────────────────────────────────────────────────────
  const upsertInventoryItem = useCallback((item: InventoryItem) => write("inventory", item), []);
  const deleteInventoryItem = useCallback((id: string) => remove("inventory", id), []);
  const adjustStock = useCallback((id: string, delta: number) => {
    const item = S.current.inventory.find((x) => x.id === id);
    if (!item) return;
    write("inventory", {
      ...item,
      stock: Math.max(0, item.stock + delta),
      lastUpdated: new Date().toISOString(),
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
      const inv: Invoice = {
        ...draft,
        status: amountPaid >= draft.total ? "Paid" : amountPaid > 0 ? "Partially Paid" : "Issued",
      };
      const batch = writeBatch(fsDb);
      batch.set(fd("invoices", inv.id), inv);
      // Update customer visit + spend
      if (data.customerId) {
        const c = S.current.customers.find((x) => x.id === data.customerId);
        if (c) {
          const spend = c.spend + data.total;
          batch.set(fd("customers", c.id), {
            ...c,
            visits: c.visits + 1,
            spend,
            tier: calcTier(spend),
            lastVisit: new Date().toISOString(),
          });
        }
      }
      batch.commit().catch((err) => console.error("[store] addInvoice:", err));
      // Recalc shift totals after Firestore write settles, for every shift
      // touched by this invoice's tender lines (normally just the open shift).
      const shiftIds = new Set(payments.map((p) => p.sessionId).filter((x): x is string => !!x));
      shiftIds.forEach((id) => setTimeout(() => recalcShift(id), 500));
      return inv;
    },
    [recalcShift],
  );

  const updateInvoice = useCallback((inv: Invoice) => write("invoices", inv), []);

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
      const shiftIds = new Set(newPayments.map((p) => p.sessionId).filter((x): x is string => !!x));
      shiftIds.forEach((id) => setTimeout(() => recalcShift(id), 500));
    },
    [recalcShift],
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
      if (refund.sessionId) setTimeout(() => recalcShift(refund.sessionId!), 500);
    },
    [recalcShift],
  );

  // ── Expense mutations ──────────────────────────────────────────────────────
  const addExpense = useCallback(
    (data: Omit<Expense, "id" | "createdAt">): Expense => {
      const e: Expense = { ...data, id: newId(), createdAt: new Date().toISOString() };
      write("expenses", e);
      if (data.sessionId) setTimeout(() => recalcShift(data.sessionId), 500);
      return e;
    },
    [recalcShift],
  );

  const deleteExpense = useCallback(
    (id: string) => {
      const e = S.current.expenses.find((x) => x.id === id);
      remove("expenses", id);
      if (e?.sessionId) setTimeout(() => recalcShift(e.sessionId), 500);
    },
    [recalcShift],
  );

  // ── Shift mutations ────────────────────────────────────────────────────────
  const openShiftFn = useCallback(
    (data: {
      staffId: string;
      staffName: string;
      openingBalance: number;
      openingDenominations: Record<string, number>;
      notes: string;
    }): Shift => {
      const s: Shift = {
        id: newId(),
        ...data,
        status: "OPEN",
        openedAt: new Date().toISOString(),
        closedAt: null,
        closingBalance: null,
        closingDenominations: null,
        cashSales: 0,
        cardSales: 0,
        totalExpenses: 0,
        totalDeposits: 0,
        variance: null,
        verifiedBy: null,
      };
      write("shifts", s);
      logAudit(actorRef.current, {
        action: "OPEN_SHIFT",
        entity: "Shift",
        entityId: s.id,
        before: null,
        after: s,
      });
      return s;
    },
    [],
  );

  const closeShiftFn = useCallback(
    (data: {
      closingBalance: number;
      closingDenominations: Record<string, number>;
      notes: string;
      verifiedBy: string;
      variance: number;
    }) => {
      const open = S.current.shifts.find((s) => s.status === "OPEN");
      if (!open) return;
      const updated = {
        ...open,
        ...data,
        status: "CLOSED" as const,
        closedAt: new Date().toISOString(),
      };
      write("shifts", updated);
      // Attributed to the actor closing the shift, which may legitimately be a
      // manager rather than the cashier who opened it.
      logAudit(actorRef.current, {
        action: "CLOSE_SHIFT",
        entity: "Shift",
        entityId: open.id,
        before: open,
        after: updated,
      });
    },
    [],
  );

  const addSaleToShift = useCallback(
    (_invoiceId: string, _method: PaymentMethod, _amount: number) => {
      const open = S.current.shifts.find((s) => s.status === "OPEN");
      if (open) setTimeout(() => recalcShift(open.id), 500);
    },
    [recalcShift],
  );

  // ── Equipment mutations ────────────────────────────────────────────────────
  const upsertEquipment = useCallback((eq: Equipment) => write("equipment", eq), []);
  const deleteEquipment = useCallback((id: string) => remove("equipment", id), []);

  const addMaintenanceLog = useCallback(
    (data: Omit<MaintenanceLog, "id" | "createdAt">): MaintenanceLog => {
      const m: MaintenanceLog = { ...data, id: newId(), createdAt: new Date().toISOString() };
      write("maintenanceLogs", m);
      // Update equipment's lastServiceDate if this is more recent
      const eq = S.current.equipmentList.find((e) => e.id === data.equipmentId);
      if (eq && (eq.lastServiceDate === null || data.date > eq.lastServiceDate)) {
        write("equipment", { ...eq, lastServiceDate: data.date });
      }
      return m;
    },
    [],
  );

  const deleteMaintenanceLog = useCallback((id: string) => remove("maintenanceLogs", id), []);

  // ── Purchase Order mutations ───────────────────────────────────────────────
  const addPurchaseOrder = useCallback(
    async (data: Omit<PurchaseOrder, "id" | "poNumber" | "createdAt">): Promise<PurchaseOrder> => {
      const id = await nextSeqId("purchaseOrders", "PO-", S.current.purchaseOrdersList, 1000);
      const po: PurchaseOrder = { ...data, id, poNumber: id, createdAt: new Date().toISOString() };
      write("purchaseOrders", po);
      return po;
    },
    [],
  );

  const updatePurchaseOrder = useCallback((po: PurchaseOrder) => write("purchaseOrders", po), []);
  const deletePurchaseOrder = useCallback((id: string) => remove("purchaseOrders", id), []);

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
      // Adjust inventory stock for newly received quantities
      for (const l of updatedLines) {
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
      batch.commit().catch((err) => console.error("[store] receivePO:", err));
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
    setDoc(fd("settings", "business"), sanitizeBusinessInfo(b)).catch((err) =>
      console.error("[store] saveBusinessInfo:", err),
    );
  }, []);

  const recordNotification = useCallback(
    (n: Omit<SentNotification, "id" | "sentAt">): SentNotification => {
      const entry: SentNotification = { ...n, id: newId(), sentAt: new Date().toISOString() };
      write("sentNotifications", entry);
      return entry;
    },
    [],
  );

  const refreshAll = useCallback(() => {}, []); // no-op — onSnapshot handles refresh

  // ── Context value ──────────────────────────────────────────────────────────
  const value: Store = {
    storeLoading,
    services,
    customers,
    jobs,
    bookings,
    invoices,
    inventory,
    expenses,
    shifts,
    equipmentList,
    maintenanceLogsList,
    purchaseOrdersList,
    auditList,
    openShift,
    lowStockItems,
    overdueEquipment,
    todayRevenue,
    todayJobs,
    refreshAll,
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
    jobsNeedingReview,
    saveNotificationSettings,
    recordNotification,
    businessInfo,
    saveBusinessInfo,
    addJob,
    updateJob,
    deleteJob,
    moveJob,
    addJobPhoto,
    removeJobPhoto,
    updateQCItems,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    addBooking,
    updateBooking,
    deleteBooking,
    checkinBooking,
    markDepositPaid,
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
    openShiftFn,
    closeShiftFn,
    addSaleToShift,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore outside StoreProvider");
  return ctx;
}
