// Typed localStorage database layer.
// All writes go through these functions so the store context can invalidate queries.
import { DEFAULT_TEMPLATES } from "./notifications";

export type JobStatus = "Queue" | "In Bay" | "On Hold" | "Awaiting QC" | "Ready" | "Done Today";
export type BookingStatus = "Pending" | "Confirmed" | "Checked-In" | "No-Show" | "Cancelled";
export type InvoiceStatus = "Draft" | "Issued" | "Partially Paid" | "Paid" | "Void";
export type PaymentMethod = "Cash" | "Card" | "Transfer";
export type CustomerTier = "Bronze" | "Silver" | "Gold" | "Platinum";
export type ServiceCategory =
  | "Exterior"
  | "Interior"
  | "Full Detail"
  | "Paint Protection"
  | "Coating";
export type ShiftStatus = "OPEN" | "CLOSED";

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

export interface JobPhoto {
  id: string;
  stage: "before" | "during" | "after";
  url: string; // base64 compressed JPEG data URL
  takenAt: string;
  note: string;
}

export interface QCItem {
  id: string;
  label: string;
  checked: boolean;
}

const QC_TEMPLATES: Record<ServiceCategory, string[]> = {
  Exterior: [
    "Pre-rinse completed",
    "Snow foam applied & dwelled",
    "Contact wash (two-bucket method)",
    "Wheels & arches cleaned",
    "Final rinse & blow-dry",
    "Glass cleaned (streak-free)",
    "Tyres dressed",
    "Door jambs wiped",
    "Final walk-around inspection",
  ],
  Interior: [
    "Floor mats removed & cleaned",
    "Vacuum: seats, carpets, boot",
    "Dashboard & console wiped",
    "Door panels & pockets cleaned",
    "Interior glass cleaned",
    "Leather/fabric treatment applied",
    "Air vents & cup holders cleaned",
    "Fragrance applied",
    "Mats reinstalled & inspected",
  ],
  "Full Detail": [
    "Pre-rinse completed",
    "Snow foam applied & dwelled",
    "Contact wash (two-bucket method)",
    "Wheels & arches cleaned",
    "Final rinse & blow-dry",
    "Glass cleaned (streak-free)",
    "Tyres dressed",
    "Floor mats removed & cleaned",
    "Vacuum: seats, carpets, boot",
    "Dashboard & console wiped",
    "Door panels & pockets cleaned",
    "Interior glass cleaned",
    "Fragrance applied",
    "Final exterior walk-around",
  ],
  "Paint Protection": [
    "Decontamination wash completed",
    "Clay bar treatment done",
    "Paint thickness measured & recorded",
    "Compound stage completed",
    "Polish stage completed",
    "IPA wipe-down done",
    "Sealant / PPF applied",
    "Cure time observed",
    "Panel reflection check (no swirls/haze)",
    "Final inspection sign-off",
  ],
  Coating: [
    "Decontamination wash completed",
    "Paint correction completed",
    "IPA wipe-down done",
    "Coating applied to all panels",
    "Coating levelled & inspected",
    "Flash time observed",
    "Second coat applied (if required)",
    "Infra-red cure completed (if applicable)",
    "Final inspection in controlled lighting",
    "Care card & instructions given to customer",
  ],
};

export function getQCTemplate(category: ServiceCategory): string[] {
  return QC_TEMPLATES[category] ?? QC_TEMPLATES["Exterior"];
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
  createdAt: string;
}

export interface Job {
  id: string;
  customerName: string;
  customerId: string | null;
  phone: string;
  plate: string;
  vehicleModel: string;
  vehicleColor: string;
  serviceId: string;
  serviceName: string;
  category: ServiceCategory;
  price: number;
  tech: string;
  bay: string;
  status: JobStatus;
  elapsedMin: number;
  estimateMin: number;
  sessionId: string | null;
  notes: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  photos?: JobPhoto[];
  qcItems?: QCItem[];
  qcCompletedBy?: string;
  qcCompletedAt?: string;
  depositPaid?: number;
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

export interface InvoiceLine {
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
}

export interface Invoice {
  id: string;
  jobId: string | null;
  customerId: string | null;
  customerName: string;
  lines: InvoiceLine[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  method: PaymentMethod;
  status: InvoiceStatus;
  sessionId: string | null;
  createdAt: string;
  depositApplied?: number;
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
  sessionId: string;
  type: "EXPENSE" | "DEPOSIT";
  amount: number;
  category: string;
  paidTo: string;
  description: string;
  createdAt: string;
}

export interface Shift {
  id: string;
  staffId: string;
  staffName: string;
  status: ShiftStatus;
  openedAt: string;
  closedAt: string | null;
  openingBalance: number;
  openingDenominations: Record<string, number>;
  closingBalance: number | null;
  closingDenominations: Record<string, number> | null;
  cashSales: number;
  cardSales: number;
  totalExpenses: number;
  totalDeposits: number;
  variance: number | null;
  notes: string;
  verifiedBy: string | null;
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
  jobReadyTemplate: string;
  serviceReminderTemplate: string;
  reviewRequestTemplate: string;
}

export type SentNotificationType = "job_ready" | "service_reminder" | "review_request";

export interface SentNotification {
  id: string;
  type: SentNotificationType;
  customerId: string | null;
  jobId: string | null;
  customerName: string;
  phone: string;
  sentAt: string;
}

// ─── Storage keys ───────────────────────────────────────────────────────────

const KEYS = {
  services: "ps_services",
  customers: "ps_customers",
  jobs: "ps_jobs",
  bookings: "ps_bookings",
  invoices: "ps_invoices",
  inventory: "ps_inventory",
  expenses: "ps_expenses",
  shifts: "ps_shifts",
  audit: "ps_audit",
  equipment: "ps_equipment",
  maintenanceLogs: "ps_maintenance_logs",
  purchaseOrders: "ps_purchase_orders",
  notificationSettings: "ps_notification_settings",
  sentNotifications: "ps_sent_notifications",
  seeded: "ps_seeded_v3",
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _counter = Date.now();
export function newId(prefix: string): string {
  return `${prefix}-${(++_counter).toString(36)}`;
}

function load<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(data));
}

// ─── Seed data ───────────────────────────────────────────────────────────────

const SEED_SERVICES: Service[] = [
  { id: "sv1", name: "Express Exterior Wash", category: "Exterior", price: 2500, durationMin: 30 },
  { id: "sv2", name: "Premium Hand Wash", category: "Exterior", price: 4500, durationMin: 60 },
  { id: "sv3", name: "Interior Deep Clean", category: "Interior", price: 6500, durationMin: 90 },
  { id: "sv4", name: "Full Detail Package", category: "Full Detail", price: 18500, durationMin: 240 },
  { id: "sv5", name: "Ceramic Coating", category: "Coating", price: 75000, durationMin: 480 },
  { id: "sv6", name: "Paint Correction", category: "Paint Protection", price: 28000, durationMin: 300 },
];

const SEED_CUSTOMERS: Customer[] = [
  {
    id: "c1", name: "Hasini Wijesuriya", phone: "+94 77 412 8821", email: "hasini@example.lk",
    vehicles: [{ plate: "CAR-4521", model: "Toyota Aqua 2018", color: "Pearl White" }, { plate: "CAR-1234", model: "Honda Fit 2019", color: "Silver" }],
    visits: 28, spend: 184200, lastVisit: new Date().toISOString(), tier: "Platinum", createdAt: "2023-01-15T08:00:00.000Z",
  },
  {
    id: "c2", name: "Marcus Fernando", phone: "+94 71 905 4421", email: "m.fernando@example.lk",
    vehicles: [{ plate: "WP CAR-8821", model: "BMW 320i 2021", color: "Alpine White" }],
    visits: 12, spend: 96500, lastVisit: new Date().toISOString(), tier: "Gold", createdAt: "2023-03-10T08:00:00.000Z",
  },
  {
    id: "c3", name: "Priya Jayasinghe", phone: "+94 76 221 9087", email: "priya.j@example.lk",
    vehicles: [{ plate: "CAR-1145", model: "Honda Vezel 2019", color: "Crystal Black" }],
    visits: 9, spend: 41200, lastVisit: new Date().toISOString(), tier: "Silver", createdAt: "2023-06-01T08:00:00.000Z",
  },
  {
    id: "c4", name: "Sahan De Silva", phone: "+94 70 884 1102", email: "sahan@example.lk",
    vehicles: [{ plate: "CAR-3398", model: "Suzuki Swift 2020", color: "Solid Red" }],
    visits: 3, spend: 8400, lastVisit: new Date(Date.now() - 2 * 86400000).toISOString(), tier: "Bronze", createdAt: "2024-01-20T08:00:00.000Z",
  },
  {
    id: "c5", name: "Lakmal Perera", phone: "+94 77 100 5523", email: "l.perera@example.lk",
    vehicles: [{ plate: "WP CAB-2204", model: "Nissan X-Trail 2017", color: "Gunmetal" }, { plate: "CAR-5500", model: "Toyota Vitz 2018", color: "Blue" }, { plate: "CAR-8800", model: "Suzuki Alto 2020", color: "White" }],
    visits: 17, spend: 122900, lastVisit: new Date().toISOString(), tier: "Gold", createdAt: "2022-11-05T08:00:00.000Z",
  },
  {
    id: "c6", name: "Anjali Mendis", phone: "+94 78 442 1100", email: "anjali@example.lk",
    vehicles: [{ plate: "CAR-9087", model: "Mazda CX-5 2022", color: "Soul Red" }],
    visits: 5, spend: 14500, lastVisit: new Date().toISOString(), tier: "Silver", createdAt: "2023-09-12T08:00:00.000Z",
  },
  {
    id: "c7", name: "Roshan Karu", phone: "+94 75 220 9981", email: "roshan.k@example.lk",
    vehicles: [{ plate: "CAR-2210", model: "Toyota Prius 2016", color: "Silver" }, { plate: "CAR-7700", model: "Honda CR-V 2020", color: "White" }],
    visits: 41, spend: 312400, lastVisit: new Date().toISOString(), tier: "Platinum", createdAt: "2022-05-01T08:00:00.000Z",
  },
];

const SEED_INVENTORY: InventoryItem[] = [
  { id: "i1", name: "Meguiar's Gold Class Shampoo", sku: "MG-GC-1L", category: "Wash & Rinse", unit: "L", stock: 18, reorder: 10, cost: 4200, supplier: "AutoCare Lanka", lastUpdated: new Date().toISOString() },
  { id: "i2", name: "Sonax Clay Bar Kit", sku: "SX-CB-K", category: "Clay Bar", unit: "kit", stock: 4, reorder: 6, cost: 5800, supplier: "Detail Imports", lastUpdated: new Date().toISOString() },
  { id: "i3", name: "Gtechniq Crystal Serum Light", sku: "GT-CSL-50", category: "Sealants & Coatings", unit: "50ml", stock: 2, reorder: 3, cost: 32500, supplier: "Detail Imports", lastUpdated: new Date().toISOString() },
  { id: "i4", name: "Microfiber Towel 40x40", sku: "MF-4040", category: "Microfiber", unit: "pc", stock: 142, reorder: 60, cost: 350, supplier: "Local Textiles", lastUpdated: new Date().toISOString() },
  { id: "i5", name: "Foam Cannon Snow Soap", sku: "FC-SS-5L", category: "Wash & Rinse", unit: "5L", stock: 0, reorder: 4, cost: 7400, supplier: "AutoCare Lanka", lastUpdated: new Date().toISOString() },
  { id: "i6", name: "Interior All-Purpose Cleaner", sku: "IAP-C-1L", category: "Interior Cleaners", unit: "L", stock: 11, reorder: 8, cost: 1850, supplier: "AutoCare Lanka", lastUpdated: new Date().toISOString() },
  { id: "i7", name: "Polish Compound Cut", sku: "PC-CUT-1L", category: "Polish & Compound", unit: "L", stock: 6, reorder: 5, cost: 6900, supplier: "Detail Imports", lastUpdated: new Date().toISOString() },
];

const SEED_BOOKINGS: Booking[] = [
  { id: "B-201", customerId: "c7", customerName: "Roshan Karu", phone: "+94 75 220 9981", plate: "CAR-2210", vehicleModel: "Toyota Prius 2016", serviceId: "sv2", serviceName: "Premium Hand Wash", category: "Exterior", durationMin: 60, price: 4500, date: new Date().toISOString().slice(0, 10), time: "08:30", tech: "Imran S.", bay: "Bay 2", status: "Checked-In", notes: "", createdAt: new Date().toISOString() },
  { id: "B-202", customerId: "c1", customerName: "Hasini Wijesuriya", phone: "+94 77 412 8821", plate: "CAR-4521", vehicleModel: "Toyota Aqua 2018", serviceId: "sv2", serviceName: "Premium Hand Wash", category: "Exterior", durationMin: 60, price: 4500, date: new Date().toISOString().slice(0, 10), time: "09:00", tech: "Imran S.", bay: "Bay 1", status: "Checked-In", notes: "", createdAt: new Date().toISOString() },
  { id: "B-203", customerId: "c2", customerName: "Marcus Fernando", phone: "+94 71 905 4421", plate: "WP CAR-8821", vehicleModel: "BMW 320i 2021", serviceId: "sv5", serviceName: "Ceramic Coating", category: "Coating", durationMin: 480, price: 75000, date: new Date().toISOString().slice(0, 10), time: "09:30", tech: "Dilshan H.", bay: "Bay 4", status: "Checked-In", notes: "", createdAt: new Date().toISOString() },
  { id: "B-204", customerId: "c3", customerName: "Priya Jayasinghe", phone: "+94 76 221 9087", plate: "CAR-1145", vehicleModel: "Honda Vezel 2019", serviceId: "sv4", serviceName: "Full Detail Package", category: "Full Detail", durationMin: 240, price: 18500, date: new Date().toISOString().slice(0, 10), time: "10:00", tech: "Imran S.", bay: "Bay 3", status: "Checked-In", notes: "", createdAt: new Date().toISOString() },
  { id: "B-205", customerId: "c6", customerName: "Anjali Mendis", phone: "+94 78 442 1100", plate: "CAR-9087", vehicleModel: "Mazda CX-5 2022", serviceId: "sv1", serviceName: "Express Exterior Wash", category: "Exterior", durationMin: 30, price: 2500, date: new Date().toISOString().slice(0, 10), time: "11:30", tech: "Dilshan H.", bay: "Bay 5", status: "Confirmed", notes: "", createdAt: new Date().toISOString() },
];

const SEED_JOBS: Job[] = [
  { id: "J-1042", customerId: "c1", customerName: "Hasini Wijesuriya", phone: "+94 77 412 8821", plate: "CAR-4521", vehicleModel: "Toyota Aqua 2018", vehicleColor: "Pearl White", serviceId: "sv2", serviceName: "Premium Hand Wash", category: "Exterior", price: 4500, tech: "Imran S.", bay: "Bay 2", status: "In Bay", elapsedMin: 32, estimateMin: 60, sessionId: null, notes: "", createdAt: new Date().toISOString(), startedAt: new Date(Date.now() - 32 * 60000).toISOString(), completedAt: null },
  { id: "J-1043", customerId: "c2", customerName: "Marcus Fernando", phone: "+94 71 905 4421", plate: "WP CAR-8821", vehicleModel: "BMW 320i 2021", vehicleColor: "Alpine White", serviceId: "sv5", serviceName: "Ceramic Coating", category: "Coating", price: 75000, tech: "Dilshan H.", bay: "Bay 4", status: "In Bay", elapsedMin: 210, estimateMin: 480, sessionId: null, notes: "", createdAt: new Date().toISOString(), startedAt: new Date(Date.now() - 210 * 60000).toISOString(), completedAt: null },
  { id: "J-1044", customerId: "c3", customerName: "Priya Jayasinghe", phone: "+94 76 221 9087", plate: "CAR-1145", vehicleModel: "Honda Vezel 2019", vehicleColor: "Crystal Black", serviceId: "sv4", serviceName: "Full Detail Package", category: "Full Detail", price: 18500, tech: "Imran S.", bay: "Bay 1", status: "Awaiting QC", elapsedMin: 245, estimateMin: 240, sessionId: null, notes: "", createdAt: new Date().toISOString(), startedAt: new Date(Date.now() - 245 * 60000).toISOString(), completedAt: null },
  { id: "J-1045", customerId: "c4", customerName: "Sahan De Silva", phone: "+94 70 884 1102", plate: "CAR-3398", vehicleModel: "Suzuki Swift 2020", vehicleColor: "Solid Red", serviceId: "sv3", serviceName: "Interior Deep Clean", category: "Interior", price: 6500, tech: "—", bay: "—", status: "Queue", elapsedMin: 0, estimateMin: 90, sessionId: null, notes: "", createdAt: new Date().toISOString(), startedAt: null, completedAt: null },
  { id: "J-1046", customerId: "c5", customerName: "Lakmal Perera", phone: "+94 77 100 5523", plate: "WP CAB-2204", vehicleModel: "Nissan X-Trail 2017", vehicleColor: "Gunmetal", serviceId: "sv6", serviceName: "Paint Correction", category: "Paint Protection", price: 28000, tech: "Imran S.", bay: "Bay 3", status: "On Hold", elapsedMin: 75, estimateMin: 300, sessionId: null, notes: "", createdAt: new Date().toISOString(), startedAt: new Date(Date.now() - 75 * 60000).toISOString(), completedAt: null },
  { id: "J-1047", customerId: "c6", customerName: "Anjali Mendis", phone: "+94 78 442 1100", plate: "CAR-9087", vehicleModel: "Mazda CX-5 2022", vehicleColor: "Soul Red", serviceId: "sv1", serviceName: "Express Exterior Wash", category: "Exterior", price: 2500, tech: "Dilshan H.", bay: "Bay 5", status: "Ready", elapsedMin: 28, estimateMin: 30, sessionId: null, notes: "", createdAt: new Date().toISOString(), startedAt: new Date(Date.now() - 28 * 60000).toISOString(), completedAt: null },
  { id: "J-1041", customerId: "c7", customerName: "Roshan Karu", phone: "+94 75 220 9981", plate: "CAR-2210", vehicleModel: "Toyota Prius 2016", vehicleColor: "Silver", serviceId: "sv2", serviceName: "Premium Hand Wash", category: "Exterior", price: 4500, tech: "Imran S.", bay: "Bay 2", status: "Done Today", elapsedMin: 55, estimateMin: 60, sessionId: null, notes: "", createdAt: new Date().toISOString(), startedAt: new Date(Date.now() - 120 * 60000).toISOString(), completedAt: new Date(Date.now() - 65 * 60000).toISOString() },
];

const SEED_EQUIPMENT: Equipment[] = [
  {
    id: "eq1", name: "RUPES LHR21 Mark III", type: "Polishing Machine", make: "RUPES", model: "LHR21 Mark III",
    serial: "RU-LHR21-0044", purchasedAt: "2022-03-10", status: "Active", serviceIntervalDays: 90,
    lastServiceDate: new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10),
    notes: "Primary polisher for paint correction jobs", createdAt: "2022-03-10T08:00:00.000Z",
  },
  {
    id: "eq2", name: "Karcher SC5 Steam Cleaner", type: "Steam Cleaner", make: "Karcher", model: "SC5",
    serial: "KC-SC5-2291", purchasedAt: "2021-07-15", status: "Active", serviceIntervalDays: 180,
    lastServiceDate: new Date(Date.now() - 195 * 86400000).toISOString().slice(0, 10),
    notes: "Interior deep cleaning station", createdAt: "2021-07-15T08:00:00.000Z",
  },
  {
    id: "eq3", name: "Nilfisk C145 Pressure Washer", type: "Pressure Washer", make: "Nilfisk", model: "C 145.6 X-TRA",
    serial: "NF-C145-8810", purchasedAt: "2022-11-01", status: "Active", serviceIntervalDays: 180,
    lastServiceDate: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
    notes: "Main pre-wash & snow foam station", createdAt: "2022-11-01T08:00:00.000Z",
  },
  {
    id: "eq4", name: "Silverline Air Compressor 50L", type: "Air Compressor", make: "Silverline", model: "50L 2HP",
    serial: "SL-AC50-3301", purchasedAt: "2023-01-20", status: "Active", serviceIntervalDays: 365,
    lastServiceDate: null, notes: "Drying, tyre inflation & air tools", createdAt: "2023-01-20T08:00:00.000Z",
  },
  {
    id: "eq5", name: "Flex PE14-2 Rotary Polisher", type: "Polishing Machine", make: "Flex", model: "PE14-2 150",
    serial: "FX-PE14-5577", purchasedAt: "2023-06-05", status: "In Maintenance", serviceIntervalDays: 90,
    lastServiceDate: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10),
    notes: "Sent for carbon brush replacement — Flex service centre", createdAt: "2023-06-05T08:00:00.000Z",
  },
];

const SEED_MAINTENANCE_LOGS: MaintenanceLog[] = [
  {
    id: "ml1", equipmentId: "eq1", type: "Service",
    description: "Replaced pad backing plate, cleaned pad retention system, lubricated bearings",
    performedBy: "Dilshan H.", cost: 4500,
    date: new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10),
    createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
  },
  {
    id: "ml2", equipmentId: "eq1", type: "Repair",
    description: "Replaced trigger switch — was intermittently cutting out under load",
    performedBy: "RUPES Agent", cost: 8200,
    date: new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10),
    createdAt: new Date(Date.now() - 120 * 86400000).toISOString(),
  },
  {
    id: "ml3", equipmentId: "eq2", type: "Service",
    description: "Full descale and service, replaced boiler seals and steam nozzle",
    performedBy: "Karcher Service Centre", cost: 12000,
    date: new Date(Date.now() - 195 * 86400000).toISOString().slice(0, 10),
    createdAt: new Date(Date.now() - 195 * 86400000).toISOString(),
  },
  {
    id: "ml4", equipmentId: "eq3", type: "Inspection",
    description: "O-ring check, hose inspection, pressure test — all within spec",
    performedBy: "Imran S.", cost: 0,
    date: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
    createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
  },
  {
    id: "ml5", equipmentId: "eq5", type: "Repair",
    description: "Carbon brush replacement — sent to authorised Flex service centre",
    performedBy: "Flex Service Centre", cost: 6800,
    date: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10),
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
];

const SEED_PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    id: "PO-1001", poNumber: "PO-1001", supplier: "Detail Imports", status: "Draft",
    lines: [
      { inventoryItemId: "i2", itemName: "Sonax Clay Bar Kit", sku: "SX-CB-K", unit: "kit", qtyOrdered: 6, unitCost: 5800, qtyReceived: 0 },
      { inventoryItemId: "i3", itemName: "Gtechniq Crystal Serum Light", sku: "GT-CSL-50", unit: "50ml", qtyOrdered: 3, unitCost: 32500, qtyReceived: 0 },
    ],
    notes: "Reorder triggered by low stock — see inventory alerts",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    sentAt: null, receivedAt: null, createdBy: "Ashan (Admin)",
  },
];

export function seedIfNeeded(): void {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(KEYS.seeded)) return;
  save(KEYS.services, SEED_SERVICES);
  save(KEYS.customers, SEED_CUSTOMERS);
  save(KEYS.inventory, SEED_INVENTORY);
  save(KEYS.bookings, SEED_BOOKINGS);
  save(KEYS.jobs, SEED_JOBS);
  save(KEYS.invoices, []);
  save(KEYS.expenses, []);
  save(KEYS.shifts, []);
  save(KEYS.audit, []);
  window.localStorage.setItem(KEYS.seeded, "1");
}

// ─── Services ────────────────────────────────────────────────────────────────

export const services = {
  list: (): Service[] => load<Service>(KEYS.services, SEED_SERVICES),
  upsert: (s: Service): void => {
    const all = services.list();
    const idx = all.findIndex((x) => x.id === s.id);
    if (idx >= 0) all[idx] = s;
    else all.push(s);
    save(KEYS.services, all);
  },
  delete: (id: string): void => save(KEYS.services, services.list().filter((s) => s.id !== id)),
};

// ─── Customers ───────────────────────────────────────────────────────────────

export function calcTier(spend: number): CustomerTier {
  if (spend >= 200000) return "Platinum";
  if (spend >= 80000) return "Gold";
  if (spend >= 20000) return "Silver";
  return "Bronze";
}

export const customers = {
  list: (): Customer[] => load<Customer>(KEYS.customers, SEED_CUSTOMERS),
  get: (id: string): Customer | undefined => customers.list().find((c) => c.id === id),
  upsert: (c: Customer): void => {
    const all = customers.list();
    const idx = all.findIndex((x) => x.id === c.id);
    if (idx >= 0) all[idx] = c;
    else all.push(c);
    save(KEYS.customers, all);
  },
  delete: (id: string): void => save(KEYS.customers, customers.list().filter((c) => c.id !== id)),
  addVisit: (id: string, amount: number): void => {
    const c = customers.get(id);
    if (!c) return;
    const spend = c.spend + amount;
    customers.upsert({ ...c, visits: c.visits + 1, spend, tier: calcTier(spend), lastVisit: new Date().toISOString() });
  },
};

// ─── Jobs ────────────────────────────────────────────────────────────────────

export const jobs = {
  list: (): Job[] => load<Job>(KEYS.jobs, SEED_JOBS),
  get: (id: string): Job | undefined => jobs.list().find((j) => j.id === id),
  upsert: (j: Job): void => {
    const all = jobs.list();
    const idx = all.findIndex((x) => x.id === j.id);
    if (idx >= 0) all[idx] = j;
    else all.push(j);
    save(KEYS.jobs, all);
  },
  delete: (id: string): void => save(KEYS.jobs, jobs.list().filter((j) => j.id !== id)),
  updateStatus: (id: string, status: JobStatus): void => {
    const j = jobs.get(id);
    if (!j) return;
    const now = new Date().toISOString();
    jobs.upsert({
      ...j,
      status,
      startedAt: status === "In Bay" && !j.startedAt ? now : j.startedAt,
      completedAt: status === "Done Today" ? now : j.completedAt,
    });
  },
  nextId: (): string => {
    const all = jobs.list();
    const nums = all.map((j) => parseInt(j.id.replace("J-", ""), 10)).filter((n) => !isNaN(n));
    const max = nums.length > 0 ? Math.max(...nums) : 1040;
    return `J-${max + 1}`;
  },
};

// ─── Bookings ────────────────────────────────────────────────────────────────

export const bookings = {
  list: (): Booking[] => load<Booking>(KEYS.bookings, SEED_BOOKINGS),
  get: (id: string): Booking | undefined => bookings.list().find((b) => b.id === id),
  upsert: (b: Booking): void => {
    const all = bookings.list();
    const idx = all.findIndex((x) => x.id === b.id);
    if (idx >= 0) all[idx] = b;
    else all.push(b);
    save(KEYS.bookings, all);
  },
  delete: (id: string): void => save(KEYS.bookings, bookings.list().filter((b) => b.id !== id)),
  nextId: (): string => {
    const all = bookings.list();
    const nums = all.map((b) => parseInt(b.id.replace("B-", ""), 10)).filter((n) => !isNaN(n));
    const max = nums.length > 0 ? Math.max(...nums) : 200;
    return `B-${max + 1}`;
  },
};

// ─── Invoices ────────────────────────────────────────────────────────────────

export const invoices = {
  list: (): Invoice[] => load<Invoice>(KEYS.invoices, []),
  get: (id: string): Invoice | undefined => invoices.list().find((i) => i.id === id),
  upsert: (inv: Invoice): void => {
    const all = invoices.list();
    const idx = all.findIndex((x) => x.id === inv.id);
    if (idx >= 0) all[idx] = inv;
    else all.push(inv);
    save(KEYS.invoices, all);
  },
  delete: (id: string): void => save(KEYS.invoices, invoices.list().filter((i) => i.id !== id)),
  nextId: (): string => {
    const all = invoices.list();
    const nums = all.map((i) => parseInt(i.id.replace("INV-", ""), 10)).filter((n) => !isNaN(n));
    const max = nums.length > 0 ? Math.max(...nums) : 2090;
    return `INV-${max + 1}`;
  },
};

// ─── Inventory ───────────────────────────────────────────────────────────────

export const inventory = {
  list: (): InventoryItem[] => load<InventoryItem>(KEYS.inventory, SEED_INVENTORY),
  get: (id: string): InventoryItem | undefined => inventory.list().find((i) => i.id === id),
  upsert: (item: InventoryItem): void => {
    const all = inventory.list();
    const idx = all.findIndex((x) => x.id === item.id);
    if (idx >= 0) all[idx] = item;
    else all.push(item);
    save(KEYS.inventory, all);
  },
  delete: (id: string): void => save(KEYS.inventory, inventory.list().filter((i) => i.id !== id)),
  adjust: (id: string, delta: number): void => {
    const item = inventory.get(id);
    if (!item) return;
    inventory.upsert({ ...item, stock: Math.max(0, item.stock + delta), lastUpdated: new Date().toISOString() });
  },
};

// ─── Expenses ────────────────────────────────────────────────────────────────

export const expenses = {
  list: (): Expense[] => load<Expense>(KEYS.expenses, []),
  listBySession: (sessionId: string): Expense[] => expenses.list().filter((e) => e.sessionId === sessionId),
  upsert: (e: Expense): void => {
    const all = expenses.list();
    const idx = all.findIndex((x) => x.id === e.id);
    if (idx >= 0) all[idx] = e;
    else all.push(e);
    save(KEYS.expenses, all);
  },
  delete: (id: string): void => save(KEYS.expenses, expenses.list().filter((e) => e.id !== id)),
};

// ─── Shifts ──────────────────────────────────────────────────────────────────

export const shifts = {
  list: (): Shift[] => load<Shift>(KEYS.shifts, []),
  get: (id: string): Shift | undefined => shifts.list().find((s) => s.id === id),
  getOpen: (): Shift | undefined => shifts.list().find((s) => s.status === "OPEN"),
  upsert: (s: Shift): void => {
    const all = shifts.list();
    const idx = all.findIndex((x) => x.id === s.id);
    if (idx >= 0) all[idx] = s;
    else all.push(s);
    save(KEYS.shifts, all);
  },
  updateTotals: (id: string): void => {
    const shift = shifts.get(id);
    if (!shift) return;
    const exps = expenses.listBySession(id);
    const totalExpenses = exps.filter((e) => e.type === "EXPENSE").reduce((s, e) => s + e.amount, 0);
    const totalDeposits = exps.filter((e) => e.type === "DEPOSIT").reduce((s, e) => s + e.amount, 0);
    const invs = invoices.list().filter((i) => i.sessionId === id);
    const cashSales = invs.filter((i) => i.method === "Cash").reduce((s, i) => s + i.total, 0);
    const cardSales = invs.filter((i) => i.method !== "Cash").reduce((s, i) => s + i.total, 0);
    shifts.upsert({ ...shift, cashSales, cardSales, totalExpenses, totalDeposits });
  },
};

// ─── Audit ───────────────────────────────────────────────────────────────────

export const audit = {
  list: (): AuditLog[] => load<AuditLog>(KEYS.audit, []),
  log: (entry: Omit<AuditLog, "id" | "createdAt">): void => {
    const all = audit.list();
    all.unshift({ ...entry, id: newId("al"), createdAt: new Date().toISOString() });
    if (all.length > 1000) all.splice(1000);
    save(KEYS.audit, all);
  },
};

// ─── Equipment ───────────────────────────────────────────────────────────────

export const equipment = {
  list: (): Equipment[] => load<Equipment>(KEYS.equipment, SEED_EQUIPMENT),
  get: (id: string): Equipment | undefined => equipment.list().find((e) => e.id === id),
  upsert: (eq: Equipment): void => {
    const all = equipment.list();
    const idx = all.findIndex((x) => x.id === eq.id);
    if (idx >= 0) all[idx] = eq; else all.push(eq);
    save(KEYS.equipment, all);
  },
  delete: (id: string): void => save(KEYS.equipment, equipment.list().filter((e) => e.id !== id)),
  nextId: (): string => {
    const nums = equipment.list().map((e) => parseInt(e.id.replace("eq", ""), 10)).filter((n) => !isNaN(n));
    return `eq${(nums.length > 0 ? Math.max(...nums) : 0) + 1}`;
  },
};

// ─── Maintenance Logs ────────────────────────────────────────────────────────

export const maintenanceLogs = {
  list: (): MaintenanceLog[] => load<MaintenanceLog>(KEYS.maintenanceLogs, SEED_MAINTENANCE_LOGS),
  listByEquipment: (equipmentId: string): MaintenanceLog[] =>
    maintenanceLogs.list().filter((m) => m.equipmentId === equipmentId),
  upsert: (m: MaintenanceLog): void => {
    const all = maintenanceLogs.list();
    const idx = all.findIndex((x) => x.id === m.id);
    if (idx >= 0) all[idx] = m; else all.push(m);
    save(KEYS.maintenanceLogs, all);
  },
  delete: (id: string): void => save(KEYS.maintenanceLogs, maintenanceLogs.list().filter((m) => m.id !== id)),
};

// ─── Purchase Orders ─────────────────────────────────────────────────────────

export const purchaseOrders = {
  list: (): PurchaseOrder[] => load<PurchaseOrder>(KEYS.purchaseOrders, SEED_PURCHASE_ORDERS),
  get: (id: string): PurchaseOrder | undefined => purchaseOrders.list().find((p) => p.id === id),
  upsert: (po: PurchaseOrder): void => {
    const all = purchaseOrders.list();
    const idx = all.findIndex((x) => x.id === po.id);
    if (idx >= 0) all[idx] = po; else all.push(po);
    save(KEYS.purchaseOrders, all);
  },
  delete: (id: string): void => save(KEYS.purchaseOrders, purchaseOrders.list().filter((p) => p.id !== id)),
  nextId: (): string => {
    const nums = purchaseOrders.list().map((p) => parseInt(p.id.replace("PO-", ""), 10)).filter((n) => !isNaN(n));
    return `PO-${(nums.length > 0 ? Math.max(...nums) : 1000) + 1}`;
  },
};

// ─── Notification Settings ───────────────────────────────────────────────────

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  googleReviewLink: "",
  reminderIntervalDays: 30,
  jobReadyTemplate: DEFAULT_TEMPLATES.jobReady,
  serviceReminderTemplate: DEFAULT_TEMPLATES.serviceReminder,
  reviewRequestTemplate: DEFAULT_TEMPLATES.reviewRequest,
};

export const notificationSettings = {
  get: (): NotificationSettings => {
    if (typeof window === "undefined") return DEFAULT_NOTIFICATION_SETTINGS;
    try {
      const raw = window.localStorage.getItem(KEYS.notificationSettings);
      return raw ? { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(raw) } : DEFAULT_NOTIFICATION_SETTINGS;
    } catch { return DEFAULT_NOTIFICATION_SETTINGS; }
  },
  set: (s: NotificationSettings): void => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEYS.notificationSettings, JSON.stringify(s));
  },
};

// ─── Sent Notifications ──────────────────────────────────────────────────────

export const sentNotifications = {
  list: (): SentNotification[] => load<SentNotification>(KEYS.sentNotifications, []),
  add: (n: Omit<SentNotification, "id" | "sentAt">): SentNotification => {
    const all = sentNotifications.list();
    const entry: SentNotification = { ...n, id: newId("sn"), sentAt: new Date().toISOString() };
    all.unshift(entry);
    if (all.length > 500) all.splice(500);
    save(KEYS.sentNotifications, all);
    return entry;
  },
};
