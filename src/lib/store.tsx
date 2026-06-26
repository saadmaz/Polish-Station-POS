// Central React store — wraps the localStorage db layer.
// Components call useStore() to get data + mutation functions.
// Every mutation triggers a re-render of all consumers via a simple version counter.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import * as db from "./db";
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

// ─── Context shape ────────────────────────────────────────────────────────────

interface Store {
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

  // computed
  openShift: Shift | undefined;
  lowStockItems: InventoryItem[];
  overdueEquipment: Equipment[];
  todayRevenue: number;
  todayJobs: number;

  // mutations — every one calls refresh() internally
  refreshAll: () => void;

  // Equipment
  upsertEquipment: (eq: Equipment) => void;
  deleteEquipment: (id: string) => void;
  addMaintenanceLog: (log: Omit<MaintenanceLog, "id" | "createdAt">) => MaintenanceLog;
  deleteMaintenanceLog: (id: string) => void;

  // Purchase Orders
  addPurchaseOrder: (po: Omit<PurchaseOrder, "id" | "poNumber" | "createdAt">) => PurchaseOrder;
  updatePurchaseOrder: (po: PurchaseOrder) => void;
  deletePurchaseOrder: (id: string) => void;
  receivePO: (poId: string, receivedLines: { inventoryItemId: string; qtyReceived: number }[]) => void;

  // Notifications
  notificationSettingsData: NotificationSettings;
  sentNotificationsList: SentNotification[];
  customersNeedingReminder: Customer[];
  jobsNeedingReview: Job[];
  saveNotificationSettings: (s: NotificationSettings) => void;
  recordNotification: (n: Omit<SentNotification, "id" | "sentAt">) => SentNotification;

  // Jobs
  addJob: (j: Omit<Job, "id" | "createdAt" | "startedAt" | "completedAt" | "elapsedMin">) => Job;
  updateJob: (j: Job) => void;
  deleteJob: (id: string) => void;
  moveJob: (id: string, status: JobStatus, tech?: string, bay?: string) => void;
  addJobPhoto: (jobId: string, photo: Omit<JobPhoto, "id">) => void;
  removeJobPhoto: (jobId: string, photoId: string) => void;
  updateQCItems: (jobId: string, items: QCItem[]) => void;

  // Customers
  addCustomer: (c: Omit<Customer, "id" | "createdAt" | "visits" | "spend" | "tier" | "lastVisit">) => Customer;
  updateCustomer: (c: Customer) => void;
  deleteCustomer: (id: string) => void;

  // Bookings
  addBooking: (b: Omit<Booking, "id" | "createdAt">) => Booking;
  updateBooking: (b: Booking) => void;
  deleteBooking: (id: string) => void;
  checkinBooking: (id: string) => void;
  markDepositPaid: (bookingId: string) => void;

  // Services
  upsertService: (s: Service) => void;
  deleteService: (id: string) => void;

  // Inventory
  upsertInventoryItem: (item: InventoryItem) => void;
  deleteInventoryItem: (id: string) => void;
  adjustStock: (id: string, delta: number) => void;

  // Invoices
  addInvoice: (inv: Omit<Invoice, "id" | "createdAt">) => Invoice;
  updateInvoice: (inv: Invoice) => void;
  voidInvoice: (id: string) => void;

  // Expenses
  addExpense: (e: Omit<Expense, "id" | "createdAt">) => Expense;
  deleteExpense: (id: string) => void;

  // Shifts
  openShiftFn: (data: { staffId: string; staffName: string; openingBalance: number; openingDenominations: Record<string, number>; notes: string }) => Shift;
  closeShiftFn: (data: { closingBalance: number; closingDenominations: Record<string, number>; notes: string; verifiedBy: string; variance: number }) => void;
  addSaleToShift: (invoiceId: string, method: PaymentMethod, amount: number) => void;
}

const StoreContext = createContext<Store | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function StoreProvider({ children }: { children: ReactNode }) {
  // A version counter — incrementing forces consumers to re-read from localStorage
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const refresh = useCallback(() => bump(), []);

  // Seed once on mount
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current) {
      db.seedIfNeeded();
      seeded.current = true;
      refresh();
    }
  }, [refresh]);

  // ── Read all data fresh each render ────────────────────────────────────────
  const servicesList = db.services.list();
  const customersList = db.customers.list();
  const jobsList = db.jobs.list();
  const bookingsList = db.bookings.list();
  const invoicesList = db.invoices.list();
  const inventoryList = db.inventory.list();
  const expensesList = db.expenses.list();
  const shiftsList = db.shifts.list();
  const equipmentListData = db.equipment.list();
  const maintenanceLogsListData = db.maintenanceLogs.list();
  const purchaseOrdersListData = db.purchaseOrders.list();

  const openShift = shiftsList.find((s) => s.status === "OPEN");

  const today = new Date().toISOString().slice(0, 10);
  const todayInvoices = invoicesList.filter((i) => i.createdAt.startsWith(today));
  const todayRevenue = todayInvoices.reduce((s, i) => s + i.total, 0);
  const todayJobs = jobsList.filter(
    (j) => j.status === "Done Today" || (j.completedAt && j.completedAt.startsWith(today)),
  ).length;

  const lowStockItems = inventoryList.filter((i) => i.stock <= i.reorder);
  const overdueEquipment = equipmentListData.filter((eq) => {
    if (eq.status === "Retired" || !eq.lastServiceDate) return false;
    const nextService = new Date(eq.lastServiceDate).getTime() + eq.serviceIntervalDays * 86400000;
    return nextService < Date.now();
  });

  const notificationSettingsData = db.notificationSettings.get();
  const sentNotificationsListData = db.sentNotifications.list();
  const customersNeedingReminder = customersList.filter((c) => {
    if (!c.lastVisit) return false;
    const daysSince = Math.floor((Date.now() - new Date(c.lastVisit).getTime()) / 86400000);
    if (daysSince < notificationSettingsData.reminderIntervalDays) return false;
    const recentReminder = sentNotificationsListData.find(
      (n) => n.type === "service_reminder" && n.customerId === c.id &&
      Date.now() - new Date(n.sentAt).getTime() < notificationSettingsData.reminderIntervalDays * 86400000,
    );
    return !recentReminder;
  });
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const jobsNeedingReview = jobsList.filter((j) => {
    if (j.status !== "Done Today" && !j.completedAt) return false;
    if (j.completedAt && j.completedAt < sevenDaysAgo) return false;
    return !sentNotificationsListData.find((n) => n.type === "review_request" && n.jobId === j.id);
  });

  // ── Job mutations ─────────────────────────────────────────────────────────

  const addJob = useCallback(
    (data: Omit<Job, "id" | "createdAt" | "startedAt" | "completedAt" | "elapsedMin">): Job => {
      const j: Job = {
        ...data,
        id: db.jobs.nextId(),
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        elapsedMin: 0,
      };
      db.jobs.upsert(j);
      db.audit.log({ action: "ADD_JOB", entity: "Job", entityId: j.id, staffId: data.sessionId ?? "", staffName: "", before: null, after: j });
      refresh();
      return j;
    },
    [refresh],
  );

  const updateJob = useCallback(
    (j: Job) => { db.jobs.upsert(j); refresh(); },
    [refresh],
  );

  const deleteJob = useCallback(
    (id: string) => { db.jobs.delete(id); refresh(); },
    [refresh],
  );

  const moveJob = useCallback(
    (id: string, status: JobStatus, tech?: string, bay?: string) => {
      const j = db.jobs.get(id);
      if (!j) return;
      const now = new Date().toISOString();
      const autoQC =
        status === "Awaiting QC" && !j.qcItems?.length
          ? db.getQCTemplate(j.category).map((label, i) => ({
              id: `qc-${id}-${i}`,
              label,
              checked: false,
            }))
          : j.qcItems;
      db.jobs.upsert({
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
      refresh();
    },
    [refresh],
  );

  const addJobPhoto = useCallback(
    (jobId: string, photo: Omit<JobPhoto, "id">) => {
      const j = db.jobs.get(jobId);
      if (!j) return;
      const newPhoto: JobPhoto = { ...photo, id: db.newId("ph") };
      db.jobs.upsert({ ...j, photos: [...(j.photos ?? []), newPhoto] });
      refresh();
    },
    [refresh],
  );

  const removeJobPhoto = useCallback(
    (jobId: string, photoId: string) => {
      const j = db.jobs.get(jobId);
      if (!j) return;
      db.jobs.upsert({ ...j, photos: (j.photos ?? []).filter((p) => p.id !== photoId) });
      refresh();
    },
    [refresh],
  );

  const updateQCItems = useCallback(
    (jobId: string, items: QCItem[]) => {
      const j = db.jobs.get(jobId);
      if (!j) return;
      db.jobs.upsert({ ...j, qcItems: items });
      refresh();
    },
    [refresh],
  );

  // ── Customer mutations ───────────────────────────────────────────────────

  const addCustomer = useCallback(
    (data: Omit<Customer, "id" | "createdAt" | "visits" | "spend" | "tier" | "lastVisit">): Customer => {
      const c: Customer = {
        ...data,
        id: db.newId("cus"),
        createdAt: new Date().toISOString(),
        visits: 0,
        spend: 0,
        tier: "Bronze",
        lastVisit: null,
      };
      db.customers.upsert(c);
      refresh();
      return c;
    },
    [refresh],
  );

  const updateCustomer = useCallback(
    (c: Customer) => { db.customers.upsert(c); refresh(); },
    [refresh],
  );

  const deleteCustomer = useCallback(
    (id: string) => { db.customers.delete(id); refresh(); },
    [refresh],
  );

  // ── Booking mutations ────────────────────────────────────────────────────

  const addBooking = useCallback(
    (data: Omit<Booking, "id" | "createdAt">): Booking => {
      const b: Booking = { ...data, id: db.bookings.nextId(), createdAt: new Date().toISOString() };
      db.bookings.upsert(b);
      refresh();
      return b;
    },
    [refresh],
  );

  const updateBooking = useCallback(
    (b: Booking) => { db.bookings.upsert(b); refresh(); },
    [refresh],
  );

  const deleteBooking = useCallback(
    (id: string) => { db.bookings.delete(id); refresh(); },
    [refresh],
  );

  const checkinBooking = useCallback(
    (id: string) => {
      const b = db.bookings.get(id);
      if (!b) return;
      db.bookings.upsert({ ...b, status: "Checked-In" });
      const j: Job = {
        id: db.jobs.nextId(),
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
        sessionId: db.shifts.getOpen()?.id ?? null,
        notes: b.notes,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        depositPaid: b.depositStatus === "paid" ? (b.depositAmount ?? 0) : 0,
      };
      db.jobs.upsert(j);
      refresh();
    },
    [refresh],
  );

  const markDepositPaid = useCallback(
    (bookingId: string) => {
      const b = db.bookings.get(bookingId);
      if (!b) return;
      db.bookings.upsert({ ...b, depositStatus: "paid" });
      refresh();
    },
    [refresh],
  );

  // ── Service mutations ────────────────────────────────────────────────────

  const upsertService = useCallback(
    (s: Service) => { db.services.upsert(s); refresh(); },
    [refresh],
  );

  const deleteService = useCallback(
    (id: string) => { db.services.delete(id); refresh(); },
    [refresh],
  );

  // ── Inventory mutations ──────────────────────────────────────────────────

  const upsertInventoryItem = useCallback(
    (item: InventoryItem) => { db.inventory.upsert(item); refresh(); },
    [refresh],
  );

  const deleteInventoryItem = useCallback(
    (id: string) => { db.inventory.delete(id); refresh(); },
    [refresh],
  );

  const adjustStock = useCallback(
    (id: string, delta: number) => { db.inventory.adjust(id, delta); refresh(); },
    [refresh],
  );

  // ── Invoice mutations ────────────────────────────────────────────────────

  const addInvoice = useCallback(
    (data: Omit<Invoice, "id" | "createdAt">): Invoice => {
      const inv: Invoice = { ...data, id: db.invoices.nextId(), createdAt: new Date().toISOString() };
      db.invoices.upsert(inv);
      // Update customer visit + spend
      if (data.customerId) {
        db.customers.addVisit(data.customerId, data.total);
      }
      // Update shift totals
      if (data.sessionId) {
        db.shifts.updateTotals(data.sessionId);
      }
      refresh();
      return inv;
    },
    [refresh],
  );

  const updateInvoice = useCallback(
    (inv: Invoice) => { db.invoices.upsert(inv); refresh(); },
    [refresh],
  );

  const voidInvoice = useCallback(
    (id: string) => {
      const inv = db.invoices.get(id);
      if (!inv) return;
      db.invoices.upsert({ ...inv, status: "Void" });
      refresh();
    },
    [refresh],
  );

  // ── Expense mutations ────────────────────────────────────────────────────

  const addExpense = useCallback(
    (data: Omit<Expense, "id" | "createdAt">): Expense => {
      const e: Expense = { ...data, id: db.newId("exp"), createdAt: new Date().toISOString() };
      db.expenses.upsert(e);
      db.shifts.updateTotals(data.sessionId);
      refresh();
      return e;
    },
    [refresh],
  );

  const deleteExpense = useCallback(
    (id: string) => {
      const e = db.expenses.list().find((x) => x.id === id);
      db.expenses.delete(id);
      if (e) db.shifts.updateTotals(e.sessionId);
      refresh();
    },
    [refresh],
  );

  // ── Shift mutations ──────────────────────────────────────────────────────

  const openShiftFn = useCallback(
    (data: { staffId: string; staffName: string; openingBalance: number; openingDenominations: Record<string, number>; notes: string }): Shift => {
      const s: Shift = {
        id: db.newId("shift"),
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
      db.shifts.upsert(s);
      db.audit.log({ action: "OPEN_SHIFT", entity: "Shift", entityId: s.id, staffId: data.staffId, staffName: data.staffName, before: null, after: s });
      refresh();
      return s;
    },
    [refresh],
  );

  const closeShiftFn = useCallback(
    (data: { closingBalance: number; closingDenominations: Record<string, number>; notes: string; verifiedBy: string; variance: number }) => {
      const open = db.shifts.getOpen();
      if (!open) return;
      db.shifts.updateTotals(open.id);
      const updated = db.shifts.get(open.id);
      if (!updated) return;
      db.shifts.upsert({ ...updated, ...data, status: "CLOSED", closedAt: new Date().toISOString() });
      db.audit.log({ action: "CLOSE_SHIFT", entity: "Shift", entityId: open.id, staffId: open.staffId, staffName: open.staffName, before: open, after: { ...updated, ...data, status: "CLOSED" } });
      refresh();
    },
    [refresh],
  );

  const addSaleToShift = useCallback(
    (invoiceId: string, _method: PaymentMethod, _amount: number) => {
      const inv = db.invoices.get(invoiceId);
      if (inv?.sessionId) db.shifts.updateTotals(inv.sessionId);
      refresh();
    },
    [refresh],
  );

  // ── Equipment mutations ──────────────────────────────────────────────────

  const upsertEquipment = useCallback(
    (eq: Equipment) => { db.equipment.upsert(eq); refresh(); },
    [refresh],
  );

  const deleteEquipment = useCallback(
    (id: string) => { db.equipment.delete(id); refresh(); },
    [refresh],
  );

  const addMaintenanceLog = useCallback(
    (data: Omit<MaintenanceLog, "id" | "createdAt">): MaintenanceLog => {
      const m: MaintenanceLog = { ...data, id: db.newId("ml"), createdAt: new Date().toISOString() };
      db.maintenanceLogs.upsert(m);
      // Update lastServiceDate on the equipment
      const eq = db.equipment.get(data.equipmentId);
      if (eq && (eq.lastServiceDate === null || data.date > eq.lastServiceDate)) {
        db.equipment.upsert({ ...eq, lastServiceDate: data.date });
      }
      refresh();
      return m;
    },
    [refresh],
  );

  const deleteMaintenanceLog = useCallback(
    (id: string) => { db.maintenanceLogs.delete(id); refresh(); },
    [refresh],
  );

  // ── Purchase Order mutations ──────────────────────────────────────────────

  const addPurchaseOrder = useCallback(
    (data: Omit<PurchaseOrder, "id" | "poNumber" | "createdAt">): PurchaseOrder => {
      const id = db.purchaseOrders.nextId();
      const po: PurchaseOrder = { ...data, id, poNumber: id, createdAt: new Date().toISOString() };
      db.purchaseOrders.upsert(po);
      refresh();
      return po;
    },
    [refresh],
  );

  const updatePurchaseOrder = useCallback(
    (po: PurchaseOrder) => { db.purchaseOrders.upsert(po); refresh(); },
    [refresh],
  );

  const deletePurchaseOrder = useCallback(
    (id: string) => { db.purchaseOrders.delete(id); refresh(); },
    [refresh],
  );

  const receivePO = useCallback(
    (poId: string, receivedLines: { inventoryItemId: string; qtyReceived: number }[]) => {
      const po = db.purchaseOrders.get(poId);
      if (!po) return;
      const updatedLines: POLine[] = po.lines.map((l) => {
        const recv = receivedLines.find((r) => r.inventoryItemId === l.inventoryItemId);
        const qtyReceived = recv ? recv.qtyReceived : l.qtyReceived;
        if (qtyReceived > l.qtyReceived) {
          db.inventory.adjust(l.inventoryItemId, qtyReceived - l.qtyReceived);
        }
        return { ...l, qtyReceived };
      });
      const allReceived = updatedLines.every((l) => l.qtyReceived >= l.qtyOrdered);
      const anyReceived = updatedLines.some((l) => l.qtyReceived > 0);
      const status: POStatus = allReceived ? "Received" : anyReceived ? "Partially Received" : po.status;
      db.purchaseOrders.upsert({
        ...po,
        lines: updatedLines,
        status,
        receivedAt: allReceived ? new Date().toISOString() : po.receivedAt,
      });
      refresh();
    },
    [refresh],
  );

  // ── Notification mutations ───────────────────────────────────────────────

  const saveNotificationSettings = useCallback(
    (s: NotificationSettings) => { db.notificationSettings.set(s); refresh(); },
    [refresh],
  );

  const recordNotification = useCallback(
    (n: Omit<SentNotification, "id" | "sentAt">): SentNotification => {
      const entry = db.sentNotifications.add(n);
      refresh();
      return entry;
    },
    [refresh],
  );

  const refreshAll = useCallback(() => refresh(), [refresh]);

  const value: Store = {
    services: servicesList,
    customers: customersList,
    jobs: jobsList,
    bookings: bookingsList,
    invoices: invoicesList,
    inventory: inventoryList,
    expenses: expensesList,
    shifts: shiftsList,
    equipmentList: equipmentListData,
    maintenanceLogsList: maintenanceLogsListData,
    purchaseOrdersList: purchaseOrdersListData,
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
    sentNotificationsList: sentNotificationsListData,
    customersNeedingReminder,
    jobsNeedingReview,
    saveNotificationSettings,
    recordNotification,
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
