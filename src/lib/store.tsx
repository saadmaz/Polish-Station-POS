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
  type Unsubscribe,
} from "firebase/firestore";
import { db as fsDb } from "./firebase";
import { useAuth } from "./auth";
import { calcTier, getQCTemplate, DEFAULT_NOTIFICATION_SETTINGS } from "./db";
import type {
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
  POLine,
  POStatus,
  PurchaseOrder,
  QCItem,
  SentNotification,
  Service,
  Shift,
} from "./db";

// ── ID helpers ────────────────────────────────────────────────────────────────

function nextSeqId(items: { id: string }[], prefix: string, startAt: number): string {
  const nums = items
    .map(i => parseInt(i.id.replace(prefix, ""), 10))
    .filter(n => !isNaN(n));
  return `${prefix}${nums.length > 0 ? Math.max(...nums) + 1 : startAt}`;
}

function newId(): string {
  return crypto.randomUUID();
}

// ── Context shape ─────────────────────────────────────────────────────────────

interface Store {
  storeLoading: boolean;

  // data
  services:            Service[];
  customers:           Customer[];
  jobs:                Job[];
  bookings:            Booking[];
  invoices:            Invoice[];
  inventory:           InventoryItem[];
  expenses:            Expense[];
  shifts:              Shift[];
  equipmentList:       Equipment[];
  maintenanceLogsList: MaintenanceLog[];
  purchaseOrdersList:  PurchaseOrder[];

  // computed
  openShift:       Shift | undefined;
  lowStockItems:   InventoryItem[];
  overdueEquipment: Equipment[];
  todayRevenue:    number;
  todayJobs:       number;

  // mutations
  refreshAll: () => void;

  // Equipment
  upsertEquipment:     (eq: Equipment) => void;
  deleteEquipment:     (id: string) => void;
  addMaintenanceLog:   (log: Omit<MaintenanceLog, "id" | "createdAt">) => MaintenanceLog;
  deleteMaintenanceLog:(id: string) => void;

  // Purchase Orders
  addPurchaseOrder:    (po: Omit<PurchaseOrder, "id" | "poNumber" | "createdAt">) => PurchaseOrder;
  updatePurchaseOrder: (po: PurchaseOrder) => void;
  deletePurchaseOrder: (id: string) => void;
  receivePO:           (poId: string, receivedLines: { inventoryItemId: string; qtyReceived: number }[]) => void;

  // Notifications
  notificationSettingsData:  NotificationSettings;
  sentNotificationsList:     SentNotification[];
  customersNeedingReminder:  Customer[];
  jobsNeedingReview:         Job[];
  saveNotificationSettings:  (s: NotificationSettings) => void;
  recordNotification:        (n: Omit<SentNotification, "id" | "sentAt">) => SentNotification;

  // Jobs
  addJob:          (j: Omit<Job, "id" | "createdAt" | "startedAt" | "completedAt" | "elapsedMin">) => Job;
  updateJob:       (j: Job) => void;
  deleteJob:       (id: string) => void;
  moveJob:         (id: string, status: JobStatus, tech?: string, bay?: string) => void;
  addJobPhoto:     (jobId: string, photo: Omit<JobPhoto, "id">) => void;
  removeJobPhoto:  (jobId: string, photoId: string) => void;
  updateQCItems:   (jobId: string, items: QCItem[]) => void;

  // Customers
  addCustomer:    (c: Omit<Customer, "id" | "createdAt" | "visits" | "spend" | "tier" | "lastVisit">) => Customer;
  updateCustomer: (c: Customer) => void;
  deleteCustomer: (id: string) => void;

  // Bookings
  addBooking:      (b: Omit<Booking, "id" | "createdAt">) => Booking;
  updateBooking:   (b: Booking) => void;
  deleteBooking:   (id: string) => void;
  checkinBooking:  (id: string) => void;
  markDepositPaid: (bookingId: string) => void;

  // Services
  upsertService: (s: Service) => void;
  deleteService: (id: string) => void;

  // Inventory
  upsertInventoryItem: (item: InventoryItem) => void;
  deleteInventoryItem: (id: string) => void;
  adjustStock:         (id: string, delta: number) => void;

  // Invoices
  addInvoice:    (inv: Omit<Invoice, "id" | "createdAt">) => Invoice;
  updateInvoice: (inv: Invoice) => void;
  voidInvoice:   (id: string) => void;

  // Expenses
  addExpense:    (e: Omit<Expense, "id" | "createdAt">) => Expense;
  deleteExpense: (id: string) => void;

  // Shifts
  openShiftFn:    (data: { staffId: string; staffName: string; openingBalance: number; openingDenominations: Record<string, number>; notes: string }) => Shift;
  closeShiftFn:   (data: { closingBalance: number; closingDenominations: Record<string, number>; notes: string; verifiedBy: string; variance: number }) => void;
  addSaleToShift: (invoiceId: string, method: PaymentMethod, amount: number) => void;
}

const StoreContext = createContext<Store | null>(null);

// ── Firestore helpers ─────────────────────────────────────────────────────────

function fs(path: string) { return collection(fsDb, path); }
function fd(path: string, id: string) { return doc(fsDb, path, id); }

function write<T extends { id: string }>(collPath: string, item: T): void {
  setDoc(fd(collPath, item.id), item).catch(err =>
    console.error(`[store] write ${collPath}/${item.id}:`, err),
  );
}

function patch(collPath: string, id: string, data: Record<string, unknown>): void {
  updateDoc(fd(collPath, id), data).catch(err =>
    console.error(`[store] patch ${collPath}/${id}:`, err),
  );
}

function remove(collPath: string, id: string): void {
  deleteDoc(fd(collPath, id)).catch(err =>
    console.error(`[store] delete ${collPath}/${id}:`, err),
  );
}

function logAudit(entry: Record<string, unknown>): void {
  addDoc(fs("audit"), {
    ...entry,
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

  // ── State ──────────────────────────────────────────────────────────────────
  const [storeLoading, setStoreLoading] = useState(true);
  const [services,            setServices]            = useState<Service[]>([]);
  const [customers,           setCustomers]           = useState<Customer[]>([]);
  const [jobs,                setJobs]                = useState<Job[]>([]);
  const [bookings,            setBookings]            = useState<Booking[]>([]);
  const [invoices,            setInvoices]            = useState<Invoice[]>([]);
  const [inventory,           setInventory]           = useState<InventoryItem[]>([]);
  const [expenses,            setExpenses]            = useState<Expense[]>([]);
  const [shifts,              setShifts]              = useState<Shift[]>([]);
  const [equipmentList,       setEquipmentList]       = useState<Equipment[]>([]);
  const [maintenanceLogsList, setMaintenanceLogsList] = useState<MaintenanceLog[]>([]);
  const [purchaseOrdersList,  setPurchaseOrdersList]  = useState<PurchaseOrder[]>([]);
  const [notificationSettingsData, setNotificationSettingsData] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [sentNotificationsList,    setSentNotificationsList]    = useState<SentNotification[]>([]);

  // Ref always holds latest state — safe to use in async mutations without stale closures
  const S = useRef({
    jobs, customers, bookings, invoices, shifts, expenses,
    inventory, equipmentList, maintenanceLogsList, purchaseOrdersList,
    sentNotificationsList, notificationSettingsData,
  });
  useEffect(() => {
    S.current = {
      jobs, customers, bookings, invoices, shifts, expenses,
      inventory, equipmentList, maintenanceLogsList, purchaseOrdersList,
      sentNotificationsList, notificationSettingsData,
    };
  }, [
    jobs, customers, bookings, invoices, shifts, expenses,
    inventory, equipmentList, maintenanceLogsList, purchaseOrdersList,
    sentNotificationsList, notificationSettingsData,
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

    const TOTAL_SUBS = 13;
    let loaded = 0;
    const done = () => { if (++loaded >= TOTAL_SUBS) setStoreLoading(false); };
    // An errored listener still counts as done — data stays empty, but the UI
    // must never hang on a spinner because a subscription failed.
    const fail = (name: string) => (err: unknown) => {
      console.error(`[store] "${name}" listener error:`, err);
      done();
    };

    const unsubs: Unsubscribe[] = [
      onSnapshot(fs("services"),            s => { setServices(s.docs.map(d => ({ id: d.id, ...d.data() } as Service)));                         done(); }, fail("services")),
      onSnapshot(fs("customers"),           s => { setCustomers(s.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));                       done(); }, fail("customers")),
      onSnapshot(fs("jobs"),                s => { setJobs(s.docs.map(d => ({ id: d.id, ...d.data() } as Job)));                                 done(); }, fail("jobs")),
      onSnapshot(fs("bookings"),            s => { setBookings(s.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));                         done(); }, fail("bookings")),
      onSnapshot(fs("invoices"),            s => { setInvoices(s.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));                         done(); }, fail("invoices")),
      onSnapshot(fs("inventory"),           s => { setInventory(s.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem)));                  done(); }, fail("inventory")),
      onSnapshot(fs("expenses"),            s => { setExpenses(s.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));                         done(); }, fail("expenses")),
      onSnapshot(fs("shifts"),              s => { setShifts(s.docs.map(d => ({ id: d.id, ...d.data() } as Shift)));                             done(); }, fail("shifts")),
      onSnapshot(fs("equipment"),           s => { setEquipmentList(s.docs.map(d => ({ id: d.id, ...d.data() } as Equipment)));                  done(); }, fail("equipment")),
      onSnapshot(fs("maintenanceLogs"),     s => { setMaintenanceLogsList(s.docs.map(d => ({ id: d.id, ...d.data() } as MaintenanceLog)));       done(); }, fail("maintenanceLogs")),
      onSnapshot(fs("purchaseOrders"),      s => { setPurchaseOrdersList(s.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseOrder)));         done(); }, fail("purchaseOrders")),
      onSnapshot(fs("sentNotifications"),   s => { setSentNotificationsList(s.docs.map(d => ({ id: d.id, ...d.data() } as SentNotification)));   done(); }, fail("sentNotifications")),
      onSnapshot(fd("settings", "notifications"), s => {
        setNotificationSettingsData(s.exists() ? { ...DEFAULT_NOTIFICATION_SETTINGS, ...(s.data() as Partial<NotificationSettings>) } : DEFAULT_NOTIFICATION_SETTINGS);
        done();
      }, fail("settings/notifications")),
    ];

    return () => unsubs.forEach(u => u());
  }, [staffId]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const openShift = shifts.find(s => s.status === "OPEN");
  const today = new Date().toISOString().slice(0, 10);
  const todayRevenue = invoices.filter(i => i.createdAt.startsWith(today)).reduce((s, i) => s + i.total, 0);
  const todayJobs = jobs.filter(j => j.status === "Done Today" || j.completedAt?.startsWith(today)).length;
  const lowStockItems = inventory.filter(i => i.stock <= i.reorder);
  const overdueEquipment = equipmentList.filter(eq => {
    if (eq.status === "Retired" || !eq.lastServiceDate) return false;
    return new Date(eq.lastServiceDate).getTime() + eq.serviceIntervalDays * 86400000 < Date.now();
  });
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const customersNeedingReminder = customers.filter(c => {
    if (!c.lastVisit) return false;
    const daysSince = Math.floor((Date.now() - new Date(c.lastVisit).getTime()) / 86400000);
    if (daysSince < notificationSettingsData.reminderIntervalDays) return false;
    return !sentNotificationsList.find(n =>
      n.type === "service_reminder" && n.customerId === c.id &&
      Date.now() - new Date(n.sentAt).getTime() < notificationSettingsData.reminderIntervalDays * 86400000,
    );
  });
  const jobsNeedingReview = jobs.filter(j => {
    if (j.status !== "Done Today" && !j.completedAt) return false;
    if (j.completedAt && j.completedAt < sevenDaysAgo) return false;
    return !sentNotificationsList.find(n => n.type === "review_request" && n.jobId === j.id);
  });

  // ── Shift total recalculation ──────────────────────────────────────────────
  const recalcShift = useCallback((shiftId: string) => {
    const { expenses: exps, invoices: invs } = S.current;
    const shiftExps = exps.filter(e => e.sessionId === shiftId);
    const shiftInvs = invs.filter(i => i.sessionId === shiftId);
    patch("shifts", shiftId, {
      cashSales:      shiftInvs.filter(i => i.method === "Cash").reduce((s, i) => s + i.total, 0),
      cardSales:      shiftInvs.filter(i => i.method !== "Cash").reduce((s, i) => s + i.total, 0),
      totalExpenses:  shiftExps.filter(e => e.type === "EXPENSE").reduce((s, e) => s + e.amount, 0),
      totalDeposits:  shiftExps.filter(e => e.type === "DEPOSIT").reduce((s, e) => s + e.amount, 0),
    });
  }, []);

  // ── Job mutations ──────────────────────────────────────────────────────────
  const addJob = useCallback(
    (data: Omit<Job, "id" | "createdAt" | "startedAt" | "completedAt" | "elapsedMin">): Job => {
      const j: Job = {
        ...data,
        id: nextSeqId(S.current.jobs, "J-", 1041),
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        elapsedMin: 0,
      };
      write("jobs", j);
      logAudit({ action: "ADD_JOB", entity: "Job", entityId: j.id, staffId: data.sessionId ?? "", staffName: "", before: null, after: j });
      return j;
    }, [],
  );

  const updateJob = useCallback((j: Job) => write("jobs", j), []);

  const deleteJob = useCallback((id: string) => remove("jobs", id), []);

  const moveJob = useCallback((id: string, status: JobStatus, tech?: string, bay?: string) => {
    const j = S.current.jobs.find(x => x.id === id);
    if (!j) return;
    const now = new Date().toISOString();
    const autoQC = status === "Awaiting QC" && !j.qcItems?.length
      ? getQCTemplate(j.category).map((label, i) => ({ id: `qc-${id}-${i}`, label, checked: false }))
      : j.qcItems;
    write("jobs", {
      ...j, status,
      tech: tech ?? j.tech,
      bay: bay ?? j.bay,
      startedAt:      status === "In Bay" && !j.startedAt ? now : j.startedAt,
      completedAt:    status === "Done Today" ? now : j.completedAt,
      qcItems:        autoQC,
      qcCompletedBy:  status === "Ready" ? (j.qcCompletedBy ?? "") : j.qcCompletedBy,
      qcCompletedAt:  status === "Ready" ? (j.qcCompletedAt ?? now) : j.qcCompletedAt,
    });
  }, []);

  const addJobPhoto = useCallback((jobId: string, photo: Omit<JobPhoto, "id">) => {
    const j = S.current.jobs.find(x => x.id === jobId);
    if (!j) return;
    write("jobs", { ...j, photos: [...(j.photos ?? []), { ...photo, id: newId() }] });
  }, []);

  const removeJobPhoto = useCallback((jobId: string, photoId: string) => {
    const j = S.current.jobs.find(x => x.id === jobId);
    if (!j) return;
    write("jobs", { ...j, photos: (j.photos ?? []).filter(p => p.id !== photoId) });
  }, []);

  const updateQCItems = useCallback((jobId: string, items: QCItem[]) => {
    const j = S.current.jobs.find(x => x.id === jobId);
    if (!j) return;
    write("jobs", { ...j, qcItems: items });
  }, []);

  // ── Customer mutations ─────────────────────────────────────────────────────
  const addCustomer = useCallback(
    (data: Omit<Customer, "id" | "createdAt" | "visits" | "spend" | "tier" | "lastVisit">): Customer => {
      const c: Customer = { ...data, id: newId(), createdAt: new Date().toISOString(), visits: 0, spend: 0, tier: "Bronze", lastVisit: null };
      write("customers", c);
      return c;
    }, [],
  );

  const updateCustomer = useCallback((c: Customer) => write("customers", c), []);

  const deleteCustomer = useCallback((id: string) => remove("customers", id), []);

  // ── Booking mutations ──────────────────────────────────────────────────────
  const addBooking = useCallback(
    (data: Omit<Booking, "id" | "createdAt">): Booking => {
      const b: Booking = { ...data, id: nextSeqId(S.current.bookings, "B-", 200), createdAt: new Date().toISOString() };
      write("bookings", b);
      return b;
    }, [],
  );

  const updateBooking = useCallback((b: Booking) => write("bookings", b), []);

  const deleteBooking = useCallback((id: string) => remove("bookings", id), []);

  const checkinBooking = useCallback((id: string) => {
    const b = S.current.bookings.find(x => x.id === id);
    if (!b) return;
    const j: Job = {
      id: nextSeqId(S.current.jobs, "J-", 1041),
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
      sessionId: S.current.shifts.find(s => s.status === "OPEN")?.id ?? null,
      notes: b.notes,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      depositPaid: b.depositStatus === "paid" ? (b.depositAmount ?? 0) : 0,
    };
    const batch = writeBatch(fsDb);
    batch.set(fd("bookings", b.id), { ...b, status: "Checked-In" });
    batch.set(fd("jobs", j.id), j);
    batch.commit().catch(err => console.error("[store] checkinBooking:", err));
  }, []);

  const markDepositPaid = useCallback((bookingId: string) => {
    const b = S.current.bookings.find(x => x.id === bookingId);
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
    const item = S.current.inventory.find(x => x.id === id);
    if (!item) return;
    write("inventory", { ...item, stock: Math.max(0, item.stock + delta), lastUpdated: new Date().toISOString() });
  }, []);

  // ── Invoice mutations ──────────────────────────────────────────────────────
  const addInvoice = useCallback(
    (data: Omit<Invoice, "id" | "createdAt">): Invoice => {
      const inv: Invoice = { ...data, id: nextSeqId(S.current.invoices, "INV-", 2090), createdAt: new Date().toISOString() };
      const batch = writeBatch(fsDb);
      batch.set(fd("invoices", inv.id), inv);
      // Update customer visit + spend
      if (data.customerId) {
        const c = S.current.customers.find(x => x.id === data.customerId);
        if (c) {
          const spend = c.spend + data.total;
          batch.set(fd("customers", c.id), { ...c, visits: c.visits + 1, spend, tier: calcTier(spend), lastVisit: new Date().toISOString() });
        }
      }
      batch.commit().catch(err => console.error("[store] addInvoice:", err));
      // Recalc shift totals after Firestore write settles
      if (data.sessionId) setTimeout(() => recalcShift(data.sessionId!), 500);
      return inv;
    }, [recalcShift],
  );

  const updateInvoice = useCallback((inv: Invoice) => write("invoices", inv), []);

  const voidInvoice = useCallback((id: string) => {
    const inv = S.current.invoices.find(x => x.id === id);
    if (!inv) return;
    write("invoices", { ...inv, status: "Void" });
  }, []);

  // ── Expense mutations ──────────────────────────────────────────────────────
  const addExpense = useCallback(
    (data: Omit<Expense, "id" | "createdAt">): Expense => {
      const e: Expense = { ...data, id: newId(), createdAt: new Date().toISOString() };
      write("expenses", e);
      if (data.sessionId) setTimeout(() => recalcShift(data.sessionId), 500);
      return e;
    }, [recalcShift],
  );

  const deleteExpense = useCallback((id: string) => {
    const e = S.current.expenses.find(x => x.id === id);
    remove("expenses", id);
    if (e?.sessionId) setTimeout(() => recalcShift(e.sessionId), 500);
  }, [recalcShift]);

  // ── Shift mutations ────────────────────────────────────────────────────────
  const openShiftFn = useCallback(
    (data: { staffId: string; staffName: string; openingBalance: number; openingDenominations: Record<string, number>; notes: string }): Shift => {
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
      logAudit({ action: "OPEN_SHIFT", entity: "Shift", entityId: s.id, staffId: data.staffId, staffName: data.staffName, before: null, after: s });
      return s;
    }, [],
  );

  const closeShiftFn = useCallback(
    (data: { closingBalance: number; closingDenominations: Record<string, number>; notes: string; verifiedBy: string; variance: number }) => {
      const open = S.current.shifts.find(s => s.status === "OPEN");
      if (!open) return;
      const updated = { ...open, ...data, status: "CLOSED" as const, closedAt: new Date().toISOString() };
      write("shifts", updated);
      logAudit({ action: "CLOSE_SHIFT", entity: "Shift", entityId: open.id, staffId: open.staffId, staffName: open.staffName, before: open, after: updated });
    }, [],
  );

  const addSaleToShift = useCallback(
    (_invoiceId: string, _method: PaymentMethod, _amount: number) => {
      const open = S.current.shifts.find(s => s.status === "OPEN");
      if (open) setTimeout(() => recalcShift(open.id), 500);
    }, [recalcShift],
  );

  // ── Equipment mutations ────────────────────────────────────────────────────
  const upsertEquipment = useCallback((eq: Equipment) => write("equipment", eq), []);
  const deleteEquipment = useCallback((id: string) => remove("equipment", id), []);

  const addMaintenanceLog = useCallback(
    (data: Omit<MaintenanceLog, "id" | "createdAt">): MaintenanceLog => {
      const m: MaintenanceLog = { ...data, id: newId(), createdAt: new Date().toISOString() };
      write("maintenanceLogs", m);
      // Update equipment's lastServiceDate if this is more recent
      const eq = S.current.equipmentList.find(e => e.id === data.equipmentId);
      if (eq && (eq.lastServiceDate === null || data.date > eq.lastServiceDate)) {
        write("equipment", { ...eq, lastServiceDate: data.date });
      }
      return m;
    }, [],
  );

  const deleteMaintenanceLog = useCallback((id: string) => remove("maintenanceLogs", id), []);

  // ── Purchase Order mutations ───────────────────────────────────────────────
  const addPurchaseOrder = useCallback(
    (data: Omit<PurchaseOrder, "id" | "poNumber" | "createdAt">): PurchaseOrder => {
      const id = nextSeqId(S.current.purchaseOrdersList, "PO-", 1000);
      const po: PurchaseOrder = { ...data, id, poNumber: id, createdAt: new Date().toISOString() };
      write("purchaseOrders", po);
      return po;
    }, [],
  );

  const updatePurchaseOrder = useCallback((po: PurchaseOrder) => write("purchaseOrders", po), []);
  const deletePurchaseOrder = useCallback((id: string) => remove("purchaseOrders", id), []);

  const receivePO = useCallback((poId: string, receivedLines: { inventoryItemId: string; qtyReceived: number }[]) => {
    const po = S.current.purchaseOrdersList.find(x => x.id === poId);
    if (!po) return;
    const updatedLines: POLine[] = po.lines.map(l => {
      const recv = receivedLines.find(r => r.inventoryItemId === l.inventoryItemId);
      return { ...l, qtyReceived: recv ? recv.qtyReceived : l.qtyReceived };
    });
    const allReceived = updatedLines.every(l => l.qtyReceived >= l.qtyOrdered);
    const anyReceived = updatedLines.some(l => l.qtyReceived > 0);
    const status: POStatus = allReceived ? "Received" : anyReceived ? "Partially Received" : po.status;
    const batch = writeBatch(fsDb);
    batch.set(fd("purchaseOrders", po.id), {
      ...po, lines: updatedLines, status,
      receivedAt: allReceived ? new Date().toISOString() : po.receivedAt,
    });
    // Adjust inventory stock for newly received quantities
    for (const l of updatedLines) {
      const recv = receivedLines.find(r => r.inventoryItemId === l.inventoryItemId);
      if (recv && recv.qtyReceived > l.qtyReceived) {
        const item = S.current.inventory.find(i => i.id === l.inventoryItemId);
        if (item) {
          batch.set(fd("inventory", item.id), {
            ...item,
            stock: Math.max(0, item.stock + (recv.qtyReceived - l.qtyReceived)),
            lastUpdated: new Date().toISOString(),
          });
        }
      }
    }
    batch.commit().catch(err => console.error("[store] receivePO:", err));
  }, []);

  // ── Notification mutations ─────────────────────────────────────────────────
  const saveNotificationSettings = useCallback((s: NotificationSettings) => {
    setDoc(fd("settings", "notifications"), s).catch(err =>
      console.error("[store] saveNotificationSettings:", err),
    );
  }, []);

  const recordNotification = useCallback(
    (n: Omit<SentNotification, "id" | "sentAt">): SentNotification => {
      const entry: SentNotification = { ...n, id: newId(), sentAt: new Date().toISOString() };
      write("sentNotifications", entry);
      return entry;
    }, [],
  );

  const refreshAll = useCallback(() => {}, []); // no-op — onSnapshot handles refresh

  // ── Context value ──────────────────────────────────────────────────────────
  const value: Store = {
    storeLoading,
    services, customers, jobs, bookings, invoices, inventory, expenses, shifts,
    equipmentList, maintenanceLogsList, purchaseOrdersList,
    openShift, lowStockItems, overdueEquipment, todayRevenue, todayJobs,
    refreshAll,
    upsertEquipment, deleteEquipment, addMaintenanceLog, deleteMaintenanceLog,
    addPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, receivePO,
    notificationSettingsData, sentNotificationsList, customersNeedingReminder,
    jobsNeedingReview, saveNotificationSettings, recordNotification,
    addJob, updateJob, deleteJob, moveJob, addJobPhoto, removeJobPhoto, updateQCItems,
    addCustomer, updateCustomer, deleteCustomer,
    addBooking, updateBooking, deleteBooking, checkinBooking, markDepositPaid,
    upsertService, deleteService,
    upsertInventoryItem, deleteInventoryItem, adjustStock,
    addInvoice, updateInvoice, voidInvoice,
    addExpense, deleteExpense,
    openShiftFn, closeShiftFn, addSaleToShift,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore outside StoreProvider");
  return ctx;
}
