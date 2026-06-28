// Seed business data to Firestore.
// Run: npm run seed:data
// Safe to re-run — skips collections that already have documents unless --force is passed.

import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, WriteBatch } from "firebase-admin/firestore";

if (getApps().length === 0) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    console.error("Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in .env");
    process.exit(1);
  }
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

const db = getFirestore();
const FORCE = process.argv.includes("--force");

// ── Seed data (mirrors src/lib/db.ts) ────────────────────────────────────────

const now = new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const minsAgo = (n: number) => new Date(Date.now() - n * 60000).toISOString();
const today = now.slice(0, 10);

const SERVICES = [
  { id: "sv1", name: "Express Exterior Wash",  category: "Exterior",       price: 2500,  durationMin: 30  },
  { id: "sv2", name: "Premium Hand Wash",       category: "Exterior",       price: 4500,  durationMin: 60  },
  { id: "sv3", name: "Interior Deep Clean",     category: "Interior",       price: 6500,  durationMin: 90  },
  { id: "sv4", name: "Full Detail Package",     category: "Full Detail",    price: 18500, durationMin: 240 },
  { id: "sv5", name: "Ceramic Coating",         category: "Coating",        price: 75000, durationMin: 480 },
  { id: "sv6", name: "Paint Correction",        category: "Paint Protection", price: 28000, durationMin: 300 },
];

const CUSTOMERS = [
  {
    id: "c1", name: "Hasini Wijesuriya", phone: "+94 77 412 8821", email: "hasini@example.lk",
    vehicles: [{ plate: "CAR-4521", model: "Toyota Aqua 2018", color: "Pearl White" }, { plate: "CAR-1234", model: "Honda Fit 2019", color: "Silver" }],
    visits: 28, spend: 184200, lastVisit: now, tier: "Platinum", createdAt: "2023-01-15T08:00:00.000Z",
  },
  {
    id: "c2", name: "Marcus Fernando", phone: "+94 71 905 4421", email: "m.fernando@example.lk",
    vehicles: [{ plate: "WP CAR-8821", model: "BMW 320i 2021", color: "Alpine White" }],
    visits: 12, spend: 96500, lastVisit: now, tier: "Gold", createdAt: "2023-03-10T08:00:00.000Z",
  },
  {
    id: "c3", name: "Priya Jayasinghe", phone: "+94 76 221 9087", email: "priya.j@example.lk",
    vehicles: [{ plate: "CAR-1145", model: "Honda Vezel 2019", color: "Crystal Black" }],
    visits: 9, spend: 41200, lastVisit: now, tier: "Silver", createdAt: "2023-06-01T08:00:00.000Z",
  },
  {
    id: "c4", name: "Sahan De Silva", phone: "+94 70 884 1102", email: "sahan@example.lk",
    vehicles: [{ plate: "CAR-3398", model: "Suzuki Swift 2020", color: "Solid Red" }],
    visits: 3, spend: 8400, lastVisit: daysAgo(2), tier: "Bronze", createdAt: "2024-01-20T08:00:00.000Z",
  },
  {
    id: "c5", name: "Lakmal Perera", phone: "+94 77 100 5523", email: "l.perera@example.lk",
    vehicles: [
      { plate: "WP CAB-2204", model: "Nissan X-Trail 2017", color: "Gunmetal" },
      { plate: "CAR-5500", model: "Toyota Vitz 2018", color: "Blue" },
      { plate: "CAR-8800", model: "Suzuki Alto 2020", color: "White" },
    ],
    visits: 17, spend: 122900, lastVisit: now, tier: "Gold", createdAt: "2022-11-05T08:00:00.000Z",
  },
  {
    id: "c6", name: "Anjali Mendis", phone: "+94 78 442 1100", email: "anjali@example.lk",
    vehicles: [{ plate: "CAR-9087", model: "Mazda CX-5 2022", color: "Soul Red" }],
    visits: 5, spend: 14500, lastVisit: now, tier: "Silver", createdAt: "2023-09-12T08:00:00.000Z",
  },
  {
    id: "c7", name: "Roshan Karu", phone: "+94 75 220 9981", email: "roshan.k@example.lk",
    vehicles: [{ plate: "CAR-2210", model: "Toyota Prius 2016", color: "Silver" }, { plate: "CAR-7700", model: "Honda CR-V 2020", color: "White" }],
    visits: 41, spend: 312400, lastVisit: now, tier: "Platinum", createdAt: "2022-05-01T08:00:00.000Z",
  },
];

const INVENTORY = [
  { id: "i1", name: "Meguiar's Gold Class Shampoo",      sku: "MG-GC-1L",   category: "Wash & Rinse",         unit: "L",    stock: 18,  reorder: 10, cost: 4200,  supplier: "AutoCare Lanka",  lastUpdated: now },
  { id: "i2", name: "Sonax Clay Bar Kit",                 sku: "SX-CB-K",    category: "Clay Bar",             unit: "kit",  stock: 4,   reorder: 6,  cost: 5800,  supplier: "Detail Imports",  lastUpdated: now },
  { id: "i3", name: "Gtechniq Crystal Serum Light",       sku: "GT-CSL-50",  category: "Sealants & Coatings",  unit: "50ml", stock: 2,   reorder: 3,  cost: 32500, supplier: "Detail Imports",  lastUpdated: now },
  { id: "i4", name: "Microfiber Towel 40x40",             sku: "MF-4040",    category: "Microfiber",           unit: "pc",   stock: 142, reorder: 60, cost: 350,   supplier: "Local Textiles",  lastUpdated: now },
  { id: "i5", name: "Foam Cannon Snow Soap",              sku: "FC-SS-5L",   category: "Wash & Rinse",         unit: "5L",   stock: 0,   reorder: 4,  cost: 7400,  supplier: "AutoCare Lanka",  lastUpdated: now },
  { id: "i6", name: "Interior All-Purpose Cleaner",       sku: "IAP-C-1L",   category: "Interior Cleaners",    unit: "L",    stock: 11,  reorder: 8,  cost: 1850,  supplier: "AutoCare Lanka",  lastUpdated: now },
  { id: "i7", name: "Polish Compound Cut",                sku: "PC-CUT-1L",  category: "Polish & Compound",    unit: "L",    stock: 6,   reorder: 5,  cost: 6900,  supplier: "Detail Imports",  lastUpdated: now },
];

const BOOKINGS = [
  { id: "B-201", customerId: "c7", customerName: "Roshan Karu",        phone: "+94 75 220 9981", plate: "CAR-2210",    vehicleModel: "Toyota Prius 2016",  serviceId: "sv2", serviceName: "Premium Hand Wash",       category: "Exterior",       durationMin: 60,  price: 4500,  date: today, time: "08:30", tech: "Imran S.",   bay: "Bay 2", status: "Checked-In", notes: "", createdAt: now },
  { id: "B-202", customerId: "c1", customerName: "Hasini Wijesuriya",  phone: "+94 77 412 8821", plate: "CAR-4521",    vehicleModel: "Toyota Aqua 2018",   serviceId: "sv2", serviceName: "Premium Hand Wash",       category: "Exterior",       durationMin: 60,  price: 4500,  date: today, time: "09:00", tech: "Imran S.",   bay: "Bay 1", status: "Checked-In", notes: "", createdAt: now },
  { id: "B-203", customerId: "c2", customerName: "Marcus Fernando",    phone: "+94 71 905 4421", plate: "WP CAR-8821", vehicleModel: "BMW 320i 2021",      serviceId: "sv5", serviceName: "Ceramic Coating",         category: "Coating",        durationMin: 480, price: 75000, date: today, time: "09:30", tech: "Dilshan H.", bay: "Bay 4", status: "Checked-In", notes: "", createdAt: now },
  { id: "B-204", customerId: "c3", customerName: "Priya Jayasinghe",   phone: "+94 76 221 9087", plate: "CAR-1145",    vehicleModel: "Honda Vezel 2019",   serviceId: "sv4", serviceName: "Full Detail Package",     category: "Full Detail",    durationMin: 240, price: 18500, date: today, time: "10:00", tech: "Imran S.",   bay: "Bay 3", status: "Checked-In", notes: "", createdAt: now },
  { id: "B-205", customerId: "c6", customerName: "Anjali Mendis",      phone: "+94 78 442 1100", plate: "CAR-9087",    vehicleModel: "Mazda CX-5 2022",    serviceId: "sv1", serviceName: "Express Exterior Wash",   category: "Exterior",       durationMin: 30,  price: 2500,  date: today, time: "11:30", tech: "Dilshan H.", bay: "Bay 5", status: "Confirmed",  notes: "", createdAt: now },
];

const JOBS = [
  { id: "J-1042", customerId: "c1", customerName: "Hasini Wijesuriya", phone: "+94 77 412 8821", plate: "CAR-4521",    vehicleModel: "Toyota Aqua 2018",  vehicleColor: "Pearl White",   serviceId: "sv2", serviceName: "Premium Hand Wash",     category: "Exterior",       price: 4500,  tech: "Imran S.",   bay: "Bay 2", status: "In Bay",      elapsedMin: 32,  estimateMin: 60,  sessionId: null, notes: "", createdAt: now, startedAt: minsAgo(32),  completedAt: null },
  { id: "J-1043", customerId: "c2", customerName: "Marcus Fernando",   phone: "+94 71 905 4421", plate: "WP CAR-8821", vehicleModel: "BMW 320i 2021",     vehicleColor: "Alpine White",  serviceId: "sv5", serviceName: "Ceramic Coating",       category: "Coating",        price: 75000, tech: "Dilshan H.", bay: "Bay 4", status: "In Bay",      elapsedMin: 210, estimateMin: 480, sessionId: null, notes: "", createdAt: now, startedAt: minsAgo(210), completedAt: null },
  { id: "J-1044", customerId: "c3", customerName: "Priya Jayasinghe",  phone: "+94 76 221 9087", plate: "CAR-1145",    vehicleModel: "Honda Vezel 2019",  vehicleColor: "Crystal Black", serviceId: "sv4", serviceName: "Full Detail Package",   category: "Full Detail",    price: 18500, tech: "Imran S.",   bay: "Bay 1", status: "Awaiting QC", elapsedMin: 245, estimateMin: 240, sessionId: null, notes: "", createdAt: now, startedAt: minsAgo(245), completedAt: null },
  { id: "J-1045", customerId: "c4", customerName: "Sahan De Silva",    phone: "+94 70 884 1102", plate: "CAR-3398",    vehicleModel: "Suzuki Swift 2020", vehicleColor: "Solid Red",     serviceId: "sv3", serviceName: "Interior Deep Clean",   category: "Interior",       price: 6500,  tech: "—",          bay: "—",     status: "Queue",       elapsedMin: 0,   estimateMin: 90,  sessionId: null, notes: "", createdAt: now, startedAt: null,         completedAt: null },
  { id: "J-1046", customerId: "c5", customerName: "Lakmal Perera",     phone: "+94 77 100 5523", plate: "WP CAB-2204", vehicleModel: "Nissan X-Trail 2017", vehicleColor: "Gunmetal",    serviceId: "sv6", serviceName: "Paint Correction",      category: "Paint Protection", price: 28000, tech: "Imran S.",  bay: "Bay 3", status: "On Hold",     elapsedMin: 75,  estimateMin: 300, sessionId: null, notes: "", createdAt: now, startedAt: minsAgo(75),  completedAt: null },
  { id: "J-1047", customerId: "c6", customerName: "Anjali Mendis",     phone: "+94 78 442 1100", plate: "CAR-9087",    vehicleModel: "Mazda CX-5 2022",   vehicleColor: "Soul Red",      serviceId: "sv1", serviceName: "Express Exterior Wash", category: "Exterior",       price: 2500,  tech: "Dilshan H.", bay: "Bay 5", status: "Ready",       elapsedMin: 28,  estimateMin: 30,  sessionId: null, notes: "", createdAt: now, startedAt: minsAgo(28),  completedAt: null },
  { id: "J-1041", customerId: "c7", customerName: "Roshan Karu",       phone: "+94 75 220 9981", plate: "CAR-2210",    vehicleModel: "Toyota Prius 2016", vehicleColor: "Silver",        serviceId: "sv2", serviceName: "Premium Hand Wash",     category: "Exterior",       price: 4500,  tech: "Imran S.",   bay: "Bay 2", status: "Done Today",  elapsedMin: 55,  estimateMin: 60,  sessionId: null, notes: "", createdAt: now, startedAt: minsAgo(120), completedAt: minsAgo(65) },
];

const EQUIPMENT = [
  { id: "eq1", name: "RUPES LHR21 Mark III",            type: "Polishing Machine", make: "RUPES",     model: "LHR21 Mark III",  serial: "RU-LHR21-0044", purchasedAt: "2022-03-10", status: "Active",         serviceIntervalDays: 90,  lastServiceDate: daysAgo(45).slice(0, 10),  notes: "Primary polisher for paint correction jobs",                         createdAt: "2022-03-10T08:00:00.000Z" },
  { id: "eq2", name: "Karcher SC5 Steam Cleaner",       type: "Steam Cleaner",     make: "Karcher",   model: "SC5",             serial: "KC-SC5-2291",   purchasedAt: "2021-07-15", status: "Active",         serviceIntervalDays: 180, lastServiceDate: daysAgo(195).slice(0, 10), notes: "Interior deep cleaning station",                                     createdAt: "2021-07-15T08:00:00.000Z" },
  { id: "eq3", name: "Nilfisk C145 Pressure Washer",    type: "Pressure Washer",   make: "Nilfisk",   model: "C 145.6 X-TRA",   serial: "NF-C145-8810",  purchasedAt: "2022-11-01", status: "Active",         serviceIntervalDays: 180, lastServiceDate: daysAgo(90).slice(0, 10),  notes: "Main pre-wash & snow foam station",                                  createdAt: "2022-11-01T08:00:00.000Z" },
  { id: "eq4", name: "Silverline Air Compressor 50L",   type: "Air Compressor",    make: "Silverline", model: "50L 2HP",         serial: "SL-AC50-3301",  purchasedAt: "2023-01-20", status: "Active",         serviceIntervalDays: 365, lastServiceDate: null,                      notes: "Drying, tyre inflation & air tools",                                 createdAt: "2023-01-20T08:00:00.000Z" },
  { id: "eq5", name: "Flex PE14-2 Rotary Polisher",     type: "Polishing Machine", make: "Flex",      model: "PE14-2 150",      serial: "FX-PE14-5577",  purchasedAt: "2023-06-05", status: "In Maintenance", serviceIntervalDays: 90,  lastServiceDate: daysAgo(10).slice(0, 10),  notes: "Sent for carbon brush replacement — Flex service centre",             createdAt: "2023-06-05T08:00:00.000Z" },
];

const MAINTENANCE_LOGS = [
  { id: "ml1", equipmentId: "eq1", type: "Service",    description: "Replaced pad backing plate, cleaned pad retention system, lubricated bearings",              performedBy: "Dilshan H.",            cost: 4500,  date: daysAgo(45).slice(0, 10),  createdAt: daysAgo(45)  },
  { id: "ml2", equipmentId: "eq1", type: "Repair",     description: "Replaced trigger switch — was intermittently cutting out under load",                        performedBy: "RUPES Agent",           cost: 8200,  date: daysAgo(120).slice(0, 10), createdAt: daysAgo(120) },
  { id: "ml3", equipmentId: "eq2", type: "Service",    description: "Full descale and service, replaced boiler seals and steam nozzle",                           performedBy: "Karcher Service Centre", cost: 12000, date: daysAgo(195).slice(0, 10), createdAt: daysAgo(195) },
  { id: "ml4", equipmentId: "eq3", type: "Inspection", description: "O-ring check, hose inspection, pressure test — all within spec",                            performedBy: "Imran S.",              cost: 0,     date: daysAgo(90).slice(0, 10),  createdAt: daysAgo(90)  },
  { id: "ml5", equipmentId: "eq5", type: "Repair",     description: "Carbon brush replacement — sent to authorised Flex service centre",                          performedBy: "Flex Service Centre",   cost: 6800,  date: daysAgo(10).slice(0, 10),  createdAt: daysAgo(10)  },
];

const PURCHASE_ORDERS = [
  {
    id: "PO-1001", poNumber: "PO-1001", supplier: "Detail Imports", status: "Draft",
    lines: [
      { inventoryItemId: "i2", itemName: "Sonax Clay Bar Kit",             sku: "SX-CB-K",   unit: "kit",  qtyOrdered: 6, unitCost: 5800,  qtyReceived: 0 },
      { inventoryItemId: "i3", itemName: "Gtechniq Crystal Serum Light",   sku: "GT-CSL-50", unit: "50ml", qtyOrdered: 3, unitCost: 32500, qtyReceived: 0 },
    ],
    notes: "Reorder triggered by low stock — see inventory alerts",
    createdAt: daysAgo(2), sentAt: null, receivedAt: null, createdBy: "Admin",
  },
];

// Counters seed — keeps sequential IDs in sync
const COUNTERS = {
  jobs:           { value: 1047 },
  bookings:       { value: 205  },
  invoices:       { value: 2090 },
  purchaseOrders: { value: 1001 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function collectionIsEmpty(name: string): Promise<boolean> {
  const snap = await db.collection(name).limit(1).get();
  return snap.empty;
}

async function batchWrite(collName: string, docs: { id: string; [k: string]: unknown }[]): Promise<void> {
  const CHUNK = 499; // Firestore batch limit is 500 operations
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + CHUNK)) {
      batch.set(db.collection(collName).doc(d.id), d);
    }
    await batch.commit();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const collections: [string, { id: string; [k: string]: unknown }[]][] = [
    ["services",         SERVICES],
    ["customers",        CUSTOMERS],
    ["inventory",        INVENTORY],
    ["bookings",         BOOKINGS],
    ["jobs",             JOBS],
    ["equipment",        EQUIPMENT],
    ["maintenanceLogs",  MAINTENANCE_LOGS],
    ["purchaseOrders",   PURCHASE_ORDERS],
  ];

  for (const [name, data] of collections) {
    const empty = await collectionIsEmpty(name);
    if (!empty && !FORCE) {
      console.log(`  skip  ${name} (already has data — use --force to overwrite)`);
      continue;
    }
    await batchWrite(name, data);
    console.log(`  wrote ${data.length} docs → ${name}`);
  }

  // Seed counters
  const counterBatch = db.batch();
  for (const [name, val] of Object.entries(COUNTERS)) {
    counterBatch.set(db.collection("counters").doc(name), val);
  }
  await counterBatch.commit();
  console.log("  wrote counters (jobs:1047, bookings:205, invoices:2090, purchaseOrders:1001)");

  console.log("\nDone. Business data is now in Firestore.");
}

main().catch(err => { console.error(err); process.exit(1); });
