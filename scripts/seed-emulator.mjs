// Seeds the Firebase emulator (never the real project) with the minimum
// fixture Playwright's e2e specs need: one login-able staff account and a
// couple of bookable services. Run only against FIRESTORE_EMULATOR_HOST /
// FIREBASE_AUTH_EMULATOR_HOST, refuses to run otherwise, so this can never
// accidentally seed test data into the live production Firestore project.
//
//   firebase emulators:exec --only firestore,auth "node scripts/seed-emulator.mjs && node ..."
//
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("❌ FIRESTORE_EMULATOR_HOST is not set, refusing to run against a real project.");
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-pos-polishstation" });
}

const db = getFirestore();
const auth = getAuth();

// Plain node (no TS loader) runs this script, so it can't import
// src/lib/staff-auth.ts directly -- these must be kept byte-for-byte in sync
// with that file's derivation, or a seeded login won't resolve.
const usernameKey = (u) => u.trim().toLowerCase();
const toStaffEmail = (username) => `${usernameKey(username)}@staff.polishstation.internal`;
const toStaffPassword = (pin) => `ps-pin-${pin}`;

/** Provisions the Firebase Auth account (email/password + custom claims)
 *  backing a seeded staff fixture, mirroring syncAuthUser in
 *  src/server/staff-admin.ts. The emulator starts empty every run, so this
 *  is always a fresh create, not an update-or-create fallback. */
async function seedAuthUser({ staffId, username, pin, role, perms, name }) {
  await auth.createUser({
    uid: staffId,
    email: toStaffEmail(username),
    password: toStaffPassword(pin),
    disabled: false,
  });
  await auth.setCustomUserClaims(staffId, { role, perms, name, mustChangePin: false });
}

export const TEST_STAFF = { username: "e2e_admin", pin: "4242", staffId: "e2e-admin" };
export const TEST_SERVICES = [
  { id: "svc-e2e-1", name: "Express Wash", category: "Exterior", durationMin: 30, price: 1500 },
  { id: "svc-e2e-2", name: "Full Detail", category: "Full Detail", durationMin: 180, price: 12000 },
];

// Pass --ui-test to additionally seed a much larger, deliberately hostile
// dataset for manually exercising the UI against a *running* emulator (start
// it yourself with `firebase emulators:start` and export
// FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 first — unlike the e2e suite this
// isn't wrapped in `emulators:exec`, since the whole point is to keep
// browsing the app against the emulator after the seed finishes).
// See seedUiTestData() below.
const UI_TEST = process.argv.includes("--ui-test");

async function main() {
  const batch = db.batch();

  const pinHash = await bcrypt.hash(TEST_STAFF.pin, 10);
  batch.set(db.collection("staff").doc(TEST_STAFF.staffId), {
    username: TEST_STAFF.username,
    name: "E2E Admin",
    role: "SuperAdmin",
    color: "oklch(0.55 0.21 27)",
    permissions: [
      "dashboard",
      "bookings",
      "customers",
      "inventory",
      "equipment",
      "purchase-orders",
      "notifications",
      "pos",
      "staff",
      "reports",
      "settings",
    ],
    pinHash,
    active: true,
    mustChangePin: false,
    failCount: 0,
    lockedUntil: null,
  });
  batch.set(db.collection("staff_public").doc(TEST_STAFF.staffId), {
    username: TEST_STAFF.username,
    name: "E2E Admin",
    role: "SuperAdmin",
    color: "oklch(0.55 0.21 27)",
    active: true,
  });
  batch.set(db.collection("usernames").doc(TEST_STAFF.username.toLowerCase()), {
    staffId: TEST_STAFF.staffId,
  });

  for (const s of TEST_SERVICES) {
    const { id, ...data } = s;
    batch.set(db.collection("services").doc(id), data);
  }

  await batch.commit();

  await seedAuthUser({
    staffId: TEST_STAFF.staffId,
    username: TEST_STAFF.username,
    pin: TEST_STAFF.pin,
    role: "SuperAdmin",
    perms: [
      "dashboard",
      "bookings",
      "customers",
      "inventory",
      "equipment",
      "purchase-orders",
      "notifications",
      "pos",
      "staff",
      "reports",
      "settings",
    ],
    name: "E2E Admin",
  });

  console.log(
    "✅ Emulator seeded:",
    TEST_STAFF.username,
    "/",
    TEST_STAFF.pin,
    "+",
    TEST_SERVICES.length,
    "services",
  );

  if (UI_TEST) {
    await seedUiTestData();
  }
}

// ─────────────────────────────────────────────────────────────────────────
// UI test dataset ("npm run seed:ui-test")
//
// A realistic-hostile dataset sized and shaped to stress the UI, not just
// exercise the happy path: mixed scripts and punctuation in names, mixed
// phone/plate formats, a calendar day with 25+ bookings, timezone-boundary
// booking times, extreme invoice amounts, zero/below-reorder stock, and an
// overdue equipment service. Every doc id is prefixed "UI-"/"U..." so this can be told apart
// from the minimal TEST_STAFF/TEST_SERVICES fixture at a glance.
// ─────────────────────────────────────────────────────────────────────────

function mulberry32(seed) {
  return function rand() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Fixed seed: reruns produce the same dataset, so screenshots/bug reports
// referencing "customer #7" or "UB-133" stay reproducible.
const rand = mulberry32(0xc0ffee);
const ri = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const rf = (min, max, decimals = 2) => {
  const p = 10 ** decimals;
  return Math.round((rand() * (max - min) + min) * p) / p;
};
const pick = (arr) => arr[ri(0, arr.length - 1)];
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = ri(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const isoDaysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString();
const dateStrDaysFromNow = (n) => isoDaysFromNow(n).slice(0, 10);

async function writeAll(collName, docs) {
  const CHUNK = 400; // stay under Firestore's 500-write batch limit
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + CHUNK)) {
      const { id, ...data } = d;
      batch.set(db.collection(collName).doc(id), data);
    }
    await batch.commit();
  }
}

// ── Name / phone / plate pools ──────────────────────────────────────────

const FIRST_NAMES = [
  "Hasini", "Marcus", "Priya", "Sahan", "Lakmal", "Anjali", "Roshan", "Dilani", "Nuwan",
  "Chathurika", "Ishara", "Tharindu", "Sanduni", "Malith", "Kavindi", "Ruwan", "Achini",
  "Dinesh", "Nilmini", "Kusal",
];
const LAST_NAMES = [
  "Wijesuriya", "Fernando", "Jayasinghe", "De Silva", "Perera", "Mendis", "Karunaratne",
  "Rathnayake", "Wickramasinghe", "Gunawardena", "Bandara", "Abeysekera", "Ranasinghe",
  "Senanayake", "Dissanayake", "Herath", "Weerasinghe", "Amarasekara", "Kodithuwakku",
  "Ekanayake",
];
// Real Sinhala- and Tamil-script names — the UI must render these correctly
// wherever a customer name shows up (bookings, invoices, PDFs, search).
const SINHALA_NAMES = [
  "සුනිල් පෙරේරා", "නිශාන්ති ජයවර්ධන", "චමින්ද රත්නායක", "දිල්හානි විජේසිංහ", "කසුන් බණ්ඩාර",
  "අනුෂා ගුණවර්ධන", "ප්‍රියන්ත සේනානායක", "තිළිණි අබේසේකර", "මධුෂංක ද සිල්වා", "හසිත කරුණාරත්න",
];
const TAMIL_NAMES = [
  "முருகன் சிவலிங்கம்", "பிரியா குமார்", "கமலா சுப்ரமணியம்", "விஜய் ராஜேந்திரன்", "அனிதா செல்வராஜ்",
  "ரவீந்திரன் நடராஜா", "சரோஜா பாலசுப்ரமணியம்", "கோபால் கிருஷ்ணன்", "மீனா ஆறுமுகம்", "சுரேஷ் ராமநாதன்",
];
const EDGE_NAMES = [
  "A",
  "D'Silva",
  "Anne-Marie de Silva-Fonseka",
  "O'Brien-Jayasuriya",
  "Kumari-Anne Wijeratne Gunasekara Rajapakshage Don Sampath Kumara Ranasinghe Arachchige",
  "Jean-Pierre D'Almeida",
];

const PHONE_FORMATS = [
  (d) => `+94 7${d[0]} ${d.slice(1, 4)} ${d.slice(4)}`, // +94, spaced
  (d) => `+947${d}`, // +94, no spaces
  (d) => `07${d[0]} ${d.slice(1, 4)} ${d.slice(4)}`, // 0XX, spaced
  (d) => `07${d}`, // 0XX, no spaces
];
function makePhone() {
  const digits = String(ri(0, 9999999)).padStart(7, "0");
  return pick(PHONE_FORMATS)(digits);
}

// Old format: 2 letters + 4 digits, no province prefix.
// New format: 3 letters + 4 digits, optionally province-prefixed.
const PROVINCES = ["WP", "CP", "SP", "EP", "NP", "NW", "NC", "UP", "SG"];
const LETTERS = "ABCEFGHKLMNPRSTVWZ";
function randLetters(n) {
  let s = "";
  for (let i = 0; i < n; i++) s += LETTERS[ri(0, LETTERS.length - 1)];
  return s;
}
function makePlate(style) {
  const num = String(ri(1, 9999)).padStart(4, "0");
  if (style === "old") return `${randLetters(2)}-${num}`;
  const province = rand() < 0.5 ? `${pick(PROVINCES)} ` : "";
  return `${province}${randLetters(3)}-${num}`;
}
// How a plate might actually get typed at the counter: lowercase, no dash,
// or both — normalizePlate() in src/lib/vehicle.ts is supposed to absorb
// exactly this at the boundary.
function hostilePlateEntry(plate) {
  const r = rand();
  if (r < 0.34) return plate.toLowerCase();
  if (r < 0.6) return plate.replace(/-/g, " ");
  if (r < 0.8) return plate.toLowerCase().replace(/-/g, " ");
  return plate;
}

const MAKES_MODELS = [
  ["Toyota", "Aqua"], ["Toyota", "Prius"], ["Toyota", "Vitz"], ["Toyota", "Corolla"],
  ["Honda", "Vezel"], ["Honda", "Fit"], ["Honda", "Civic"], ["Honda", "CR-V"],
  ["Suzuki", "Alto"], ["Suzuki", "Swift"], ["Suzuki", "Wagon R"],
  ["Nissan", "X-Trail"], ["Nissan", "Leaf"], ["Mazda", "CX-5"], ["Mazda", "Demio"],
  ["BMW", "320i"], ["Mercedes-Benz", "C200"], ["KIA", "Picanto"],
  ["Micro", "Panda"], ["Perodua", "Axia"],
];
const COLOURS = [
  "Pearl White", "Silver", "Crystal Black", "Gunmetal", "Solid Red", "Soul Red",
  "Alpine White", "Blue", "Beige", "Bronze", "Champagne Gold", "Metallic Grey",
];
const SIZE_CLASSES = ["hatchback", "sedan", "suv", "van", "cab", "motorcycle", "other"];

function slug(name) {
  const ascii = name.normalize("NFKD").replace(/[^\w]+/g, "").toLowerCase();
  return ascii.length > 0 ? ascii.slice(0, 20) : "customer";
}

async function seedUiTestData() {
  console.log("\nSeeding UI test dataset (--ui-test)…");

  // ── Customers (60) ────────────────────────────────────────────────────
  const CUSTOMER_COUNT = 60;
  const customerNames = [...EDGE_NAMES, ...SINHALA_NAMES, ...TAMIL_NAMES];
  outer: for (const f of shuffled(FIRST_NAMES)) {
    for (const l of shuffled(LAST_NAMES)) {
      if (customerNames.length >= CUSTOMER_COUNT) break outer;
      const name = `${f} ${l}`;
      if (!customerNames.includes(name)) customerNames.push(name);
    }
  }
  customerNames.length = CUSTOMER_COUNT;
  const customerIds = customerNames.map((_, i) => `CUI-${i + 1}`);

  // ── Vehicles (90 across the 60 customers, one customer owns 4) ─────────
  const VEHICLE_TOTAL = 90;
  const vehicleCounts = Array(CUSTOMER_COUNT).fill(1);
  vehicleCounts[0] = 4; // this customer must own 4 vehicles
  let assigned = vehicleCounts.reduce((a, b) => a + b, 0);
  while (assigned < VEHICLE_TOTAL) {
    vehicleCounts[ri(1, CUSTOMER_COUNT - 1)]++;
    assigned++;
  }

  const usedPlates = new Set();
  function uniquePlate(style) {
    let p;
    do {
      p = makePlate(style);
    } while (usedPlates.has(p));
    usedPlates.add(p);
    return p;
  }

  const vehicleRecords = [];
  let vIdx = 0;
  for (let ci = 0; ci < CUSTOMER_COUNT; ci++) {
    for (let k = 0; k < vehicleCounts[ci]; k++) {
      vIdx++;
      const style = rand() < 0.35 ? "old" : "new";
      const plateCanonical = uniquePlate(style);
      const [make, modelBase] = pick(MAKES_MODELS);
      const year = ri(2008, 2024);
      let modelFull = `${make} ${modelBase} ${year}`;
      let colour = pick(COLOURS);
      if (vIdx === 5) {
        // Deliberately very long model string.
        modelFull =
          "Toyota Land Cruiser Prado TX Limited Edition VX Premium Diesel Automatic 4WD " +
          "(Reconditioned, Full Option, Panoramic Sunroof, Leather Interior, Reverse Camera, JBL Sound System)";
      }
      if (vIdx === 9) colour = ""; // empty colour
      vehicleRecords.push({
        idx: vIdx,
        ownerIndex: ci,
        plateCanonical,
        plateDisplay: hostilePlateEntry(plateCanonical),
        make,
        modelBase,
        year,
        modelFull,
        colour,
        sizeClass: pick(SIZE_CLASSES),
        createdAt: isoDaysFromNow(-ri(1, 900)),
      });
    }
  }

  const customers = customerNames.map((name, i) => {
    const ownVehicles = vehicleRecords
      .filter((v) => v.ownerIndex === i)
      .map((v) => ({ plate: v.plateDisplay, model: v.modelFull, color: v.colour }));
    const visits = ri(0, 45);
    const spend = visits * ri(1500, 9000);
    const tier =
      spend > 150000 ? "Platinum" : spend > 70000 ? "Gold" : spend > 20000 ? "Silver" : "Bronze";
    return {
      id: customerIds[i],
      name,
      phone: makePhone(),
      email: `${slug(name)}${i}@example.lk`,
      vehicles: ownVehicles,
      visits,
      spend,
      lastVisit: visits > 0 ? isoDaysFromNow(-ri(0, 89)) : null,
      tier,
      loyaltyPoints: Math.floor(spend / 100),
      createdAt: isoDaysFromNow(-ri(30, 900)),
    };
  });

  // First-class vehicle entities (src/lib/vehicle.ts), mirroring the same 90
  // records — kept alongside the legacy Customer.vehicles[] above rather
  // than replacing it, since the UI still reads the embedded array.
  const vehiclesColl = vehicleRecords.map((v) => ({
    id: `VUI-${v.idx}`,
    plate: v.plateCanonical.replace(/[^A-Z0-9]/gi, "").toUpperCase(),
    plateDisplay: v.plateDisplay,
    make: v.make,
    model: v.modelBase,
    year: v.year,
    colour: v.colour,
    sizeClass: v.sizeClass,
    notes: "",
    createdAt: v.createdAt,
    updatedAt: v.createdAt,
  }));
  const platesColl = vehiclesColl.map((v) => ({
    id: v.plate,
    vehicleId: v.id,
    createdAt: v.createdAt,
  }));
  const vehicleOwnershipsColl = vehiclesColl.map((v, i) => ({
    id: `VOWN-${i + 1}`,
    vehicleId: v.id,
    customerId: customerIds[vehicleRecords[i].ownerIndex],
    startDate: v.createdAt,
    endDate: null,
    createdAt: v.createdAt,
  }));

  // ── Services ─────────────────────────────────────────────────────────
  const SERVICES = [
    { id: "UISV-1", name: "Express Exterior Wash", category: "Exterior", price: 2500, durationMin: 30 },
    { id: "UISV-2", name: "Premium Hand Wash", category: "Exterior", price: 4500, durationMin: 60 },
    { id: "UISV-3", name: "Interior Deep Clean", category: "Interior", price: 6500, durationMin: 90 },
    { id: "UISV-4", name: "Full Detail Package", category: "Full Detail", price: 18500, durationMin: 240 },
    { id: "UISV-5", name: "Ceramic Coating", category: "Coating", price: 75000, durationMin: 480 },
    { id: "UISV-6", name: "Paint Correction", category: "Paint Protection", price: 28000, durationMin: 300 },
  ];

  // ── Bookings (400) ───────────────────────────────────────────────────
  const BOOKING_STATUSES = ["Pending", "Confirmed", "Checked-In", "Completed", "No-Show", "Cancelled"];
  const TECHS = ["Imran S.", "Dilshan H.", "Kasun P.", "Nadeesha W."];
  const BAYS = ["Bay 1", "Bay 2", "Bay 3"];
  const BUSY_DAY_OFFSET = 0; // "today" — visible without navigating the calendar
  const BUSY_DAY_COUNT = 28;

  function randomVehicleForCustomer(ci) {
    const vs = vehicleRecords.filter((v) => v.ownerIndex === ci);
    return pick(vs.length ? vs : vehicleRecords);
  }

  function makeBooking(id, dayOffset, timeOverride) {
    const ci = ri(0, CUSTOMER_COUNT - 1);
    const customer = customers[ci];
    const veh = randomVehicleForCustomer(ci);
    const svc = pick(SERVICES);
    const time = timeOverride ?? `${String(ri(8, 17)).padStart(2, "0")}:${String(pick([0, 15, 30, 45])).padStart(2, "0")}`;
    return {
      id,
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      plate: veh.plateDisplay,
      vehicleModel: veh.modelFull,
      serviceId: svc.id,
      serviceName: svc.name,
      category: svc.category,
      durationMin: svc.durationMin,
      price: svc.price,
      date: dateStrDaysFromNow(dayOffset),
      time,
      tech: pick(TECHS),
      bay: pick(BAYS),
      status: pick(BOOKING_STATUSES),
      notes: rand() < 0.15 ? "Customer requested extra attention to wheels" : "",
      createdAt: isoDaysFromNow(dayOffset - ri(0, 3)),
    };
  }

  const bookings = [];
  let bi = 1;
  for (let k = 0; k < BUSY_DAY_COUNT; k++, bi++) {
    bookings.push(makeBooking(`UB-${bi}`, BUSY_DAY_OFFSET));
  }
  while (bookings.length < 398) {
    bookings.push(makeBooking(`UB-${bi}`, ri(-90, 14)));
    bi++;
  }
  bookings.push(makeBooking(`UB-${bi++}`, ri(-90, 14), "00:15")); // timezone-boundary: just after local midnight
  bookings.push(makeBooking(`UB-${bi++}`, ri(-90, 14), "23:45")); // timezone-boundary: just before local midnight

  // Guarantee every status appears at least once, regardless of the random draws above.
  BOOKING_STATUSES.forEach((s, i) => {
    bookings[i].status = s;
  });

  for (const b of bookings) {
    if (rand() < 0.12) {
      b.depositAmount = Math.round(b.price * 0.3);
      b.depositStatus = pick(["required", "paid"]);
    }
  }

  // ── Invoices (250) ───────────────────────────────────────────────────
  const LINE_ITEMS = [
    { name: "Express Exterior Wash", unitPrice: 2500 },
    { name: "Premium Hand Wash", unitPrice: 4500 },
    { name: "Interior Deep Clean", unitPrice: 6500 },
    { name: "Full Detail Package", unitPrice: 18500 },
    { name: "Ceramic Coating", unitPrice: 75000 },
    { name: "Paint Correction", unitPrice: 28000 },
    { name: "Air Freshener", unitPrice: 500 },
    { name: "Tire Shine", unitPrice: 800 },
    { name: "Engine Bay Clean", unitPrice: 3500 },
    { name: "Headlight Restoration", unitPrice: 4200 },
  ];
  const METHODS = ["Cash", "Card", "Transfer"];

  function randomLine() {
    const li = pick(LINE_ITEMS);
    const unitPrice = li.unitPrice;
    return {
      name: li.name,
      qty: ri(1, 3),
      unitPrice,
      discount: rand() < 0.1 ? Math.round(unitPrice * 0.1) : 0,
    };
  }
  // Mirrors the pos.tsx checkout formula: subtotal -> coupon -> +tip -> -points.
  function computeInvoiceTotals(lines, tip = 0, couponDiscount = 0, pointsValue = 0) {
    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty - l.discount, 0);
    const discountedSubtotal = Math.max(0, subtotal - couponDiscount);
    const total = Math.max(0, discountedSubtotal + tip - pointsValue);
    return { subtotal, total };
  }

  function makeInvoice(id, opts = {}) {
    const ci = opts.customerIndex ?? ri(0, CUSTOMER_COUNT - 1);
    const customer = customers[ci];
    const lines = opts.lines ?? Array.from({ length: opts.lineCount ?? ri(1, 4) }, randomLine);
    const tip = opts.tip ?? (rand() < 0.2 ? pick([100, 200, 500]) : 0);
    const { subtotal, total } = computeInvoiceTotals(lines, tip);
    return {
      id,
      customerId: customer.id,
      customerName: customer.name,
      lines,
      subtotal,
      tip,
      total,
      method: opts.method ?? pick(METHODS),
      status: opts.status ?? "Paid",
      createdAt: opts.createdAt ?? isoDaysFromNow(-ri(0, 90)),
      jobId: null,
      bookingId: null,
    };
  }

  const invoices = [];
  let invN = 1;
  const nextInvId = () => `UINV-${invN++}`;

  invoices.push(makeInvoice(nextInvId(), { lines: Array.from({ length: 20 }, randomLine), tip: 0 })); // 20 line items
  invoices.push(
    makeInvoice(nextInvId(), {
      lines: [{ name: "Full Vehicle Ceramic Coating — Premium 9H Package", qty: 1, unitPrice: 1850000, discount: 0 }],
      tip: 0,
    }),
  ); // LKR 1,850,000
  invoices.push(
    makeInvoice(nextInvId(), { lines: [{ name: "Air Freshener", qty: 1, unitPrice: 50, discount: 0 }], tip: 0 }),
  ); // LKR 50
  invoices.push(makeInvoice(nextInvId(), { status: "Void" }));

  {
    const inv = makeInvoice(nextInvId(), { status: "Refunded" });
    inv.refunds = [
      {
        id: `${inv.id}-R1`,
        amount: inv.total,
        method: inv.method,
        reason: "Customer complaint — redo required",
        staffName: "Chamari Rodrigo",
        at: isoDaysFromNow(-ri(0, 5)),
      },
    ];
    invoices.push(inv);
  }

  {
    const inv = makeInvoice(nextInvId(), { status: "Partially Paid" });
    const paidAmount = Math.round(inv.total * 0.4);
    inv.payments = [
      {
        id: `${inv.id}-P1`,
        method: inv.method,
        amount: paidAmount,
        reference: "",
        staffName: "Kasun Bandara",
        at: inv.createdAt,
      },
    ];
    invoices.push(inv);
  }

  const SPAN_CUSTOMER = 3; // same customer, invoices across several months
  for (let m = 0; m < 5; m++) {
    invoices.push(
      makeInvoice(nextInvId(), {
        customerIndex: SPAN_CUSTOMER,
        createdAt: isoDaysFromNow(-(m * 31 + ri(0, 5))),
      }),
    );
  }

  while (invoices.length < 250) {
    const r = rand();
    const status =
      r < 0.7 ? "Paid" : r < 0.85 ? "Issued" : r < 0.92 ? "Draft" : r < 0.97 ? "Partially Paid" : "Void";
    invoices.push(makeInvoice(nextInvId(), { status }));
  }

  // ── Inventory (40) ───────────────────────────────────────────────────
  const INVENTORY_BASE = [
    ["Meguiar's Gold Class Shampoo", "Wash & Rinse", "L"],
    ["Sonax Clay Bar Kit", "Clay Bar", "kit"],
    ["Gtechniq Crystal Serum Light", "Sealants & Coatings", "50ml"],
    ["Microfiber Towel 40x40", "Microfiber", "pc"],
    ["Foam Cannon Snow Soap", "Wash & Rinse", "5L"],
    ["Interior All-Purpose Cleaner", "Interior Cleaners", "L"],
    ["Polish Compound Cut", "Polish & Compound", "L"],
    ["Tire Shine Gel", "Tyre & Trim", "L"],
    ["Glass Cleaner Streak-Free", "Glass Care", "L"],
    ["Wheel Acid Cleaner", "Wheel Care", "5L"],
    ["Leather Conditioner", "Interior Cleaners", "250ml"],
    ["Ceramic Spray Sealant", "Sealants & Coatings", "500ml"],
    ["Applicator Pad Foam", "Applicators", "pc"],
    ["Drying Towel Waffle Weave", "Microfiber", "pc"],
    ["Wax Paste Carnauba", "Wax & Sealant", "200g"],
  ];
  const SUPPLIERS = ["AutoCare Lanka", "Detail Imports", "Local Textiles", "Shine Supplies Co.", "Prestige Chemicals"];

  const inventory = [];
  for (let i = 0; i < 40; i++) {
    const base = INVENTORY_BASE[i % INVENTORY_BASE.length];
    inventory.push({
      id: `UI-INV-${i + 1}`,
      name: base[0],
      sku: `${base[0].slice(0, 3).toUpperCase()}-${1000 + i}`,
      category: base[1],
      unit: base[2],
      stock: ri(0, 200),
      reorder: ri(5, 60),
      cost: rf(300, 40000, 2),
      supplier: pick(SUPPLIERS),
      lastUpdated: isoDaysFromNow(-ri(0, 30)),
    });
  }
  inventory[0].stock = 3;
  inventory[0].reorder = 10; // below reorder point
  inventory[1].stock = 4;
  inventory[1].reorder = 15; // below reorder point
  inventory[2].stock = 0; // zero stock
  inventory[3].name =
    "Gtechniq Crystal Serum Ultra Nano Ceramic Coating Kit — Professional Grade 9H Hardness " +
    "Long-Lasting Hydrophobic Paint Protection System with Complimentary Applicator Pads " +
    "and Microfiber Buffing Cloths (Limited Edition Anniversary Packaging)"; // very long name
  inventory[4].cost = 4582.73916; // 5-decimal unit cost

  // ── Staff (3 roles) ──────────────────────────────────────────────────
  const UI_STAFF = [
    { id: "ui-staff-superadmin", username: "priyantha", name: "Priyantha Wickramasinghe", role: "SuperAdmin", pin: "9821", color: "oklch(0.55 0.21 27)" },
    { id: "ui-staff-manager", username: "chamari", name: "Chamari Rodrigo", role: "Manager", pin: "5533", color: "oklch(0.6 0.18 145)" },
    { id: "ui-staff-cashier", username: "kasun", name: "Kasun Bandara", role: "Cashier", pin: "1120", color: "oklch(0.65 0.19 250)" },
  ];
  const ROLE_PERMISSIONS = {
    SuperAdmin: ["dashboard", "bookings", "customers", "leads", "inventory", "equipment", "purchase-orders", "notifications", "pos", "staff", "reports", "settings"],
    Manager: ["dashboard", "bookings", "customers", "leads", "inventory", "equipment", "purchase-orders", "notifications", "pos", "staff", "reports"],
    Cashier: ["dashboard", "bookings", "customers", "pos"],
  };

  // ── Leads (30, every source and status) ─────────────────────────────
  const LEAD_SOURCES = ["polishstation.lk", "walk-in", "phone", "referral", "instagram", "facebook", "google"];
  const LEAD_STATUSES = ["new", "contacted", "converted", "archived"];
  const LEAD_TYPES = ["contact", "booking"];

  const leads = [];
  for (let i = 1; i <= 30; i++) {
    const type = pick(LEAD_TYPES);
    const isBooking = type === "booking";
    leads.push({
      id: `UI-LEAD-${i}`,
      type,
      name: pick(customerNames),
      // Optional fields: only ever added when present, never set to
      // `undefined` — Firestore rejects/mishandles that (see
      // feedback_firestore_undefined_fields memory).
      ...(rand() < 0.7 ? { email: `lead${i}@example.lk` } : {}),
      ...(rand() < 0.8 ? { phone: makePhone() } : {}),
      ...(rand() < 0.6 ? { message: "Interested in a full detail package for my car, please call back." } : {}),
      ...(isBooking
        ? {
            vehicle: pick(MAKES_MODELS).join(" "),
            serviceId: pick(SERVICES).id,
            preferredDate: dateStrDaysFromNow(ri(1, 14)),
            timeWindow: pick(["Morning", "Afternoon", "Evening"]),
          }
        : {}),
      ...(rand() < 0.3 ? { notes: "Follow up next week" } : {}),
      status: LEAD_STATUSES[(i - 1) % LEAD_STATUSES.length],
      source: LEAD_SOURCES[(i - 1) % LEAD_SOURCES.length],
      createdAt: isoDaysFromNow(-ri(0, 60)),
      ip: rand() < 0.5 ? `${ri(1, 255)}.${ri(0, 255)}.${ri(0, 255)}.${ri(0, 255)}` : null,
    });
  }

  // ── Equipment (12, one overdue for service) ─────────────────────────
  const EQUIPMENT_BASE = [
    ["RUPES LHR21 Mark III", "Polishing Machine", "RUPES", "LHR21 Mark III", 90],
    ["Karcher SC5 Steam Cleaner", "Steam Cleaner", "Karcher", "SC5", 180],
    ["Nilfisk C145 Pressure Washer", "Pressure Washer", "Nilfisk", "C 145.6 X-TRA", 180],
    ["Silverline Air Compressor 50L", "Air Compressor", "Silverline", "50L 2HP", 365],
    ["Flex PE14-2 Rotary Polisher", "Polishing Machine", "Flex", "PE14-2 150", 90],
    ["Karcher HDS Hot Water Washer", "Pressure Washer", "Karcher", "HDS 8/18-4M", 180],
    ["Festool Vacuum Extractor", "Vacuum", "Festool", "CTL 36 E", 365],
    ["Rupes BigFoot Mille", "Polishing Machine", "RUPES", "BigFoot Mille", 90],
    ["Ionic Air Purifier Pro", "Air Purifier", "IonAir", "Pro 2000", 180],
    ["Ozone Generator Cabin", "Ozone Generator", "OzoneTech", "OG-500", 120],
    ["Steam Vapor Interior System", "Steam Cleaner", "Vapamore", "MR-1000", 180],
    ["Hydraulic Vehicle Lift", "Lift", "BendPak", "XPR-10", 365],
  ];
  const OVERDUE_INDEX = 3;
  const equipment = EQUIPMENT_BASE.map(([name, type, make, model, interval], i) => {
    const overdue = i === OVERDUE_INDEX;
    return {
      id: `UI-EQ-${i + 1}`,
      name,
      type,
      make,
      model,
      serial: `${make.slice(0, 2).toUpperCase()}-${1000 + i}`,
      purchasedAt: dateStrDaysFromNow(-ri(200, 1500)),
      status: overdue ? "Active" : pick(["Active", "Active", "Active", "In Maintenance"]),
      serviceIntervalDays: interval,
      lastServiceDate: overdue
        ? dateStrDaysFromNow(-(interval + ri(20, 100)))
        : dateStrDaysFromNow(-ri(0, Math.floor(interval * 0.6))),
      notes: overdue ? "Service overdue — schedule ASAP" : "",
      createdAt: isoDaysFromNow(-ri(200, 1500)),
    };
  });

  // ── Purchase orders (6, one per status) ──────────────────────────────
  const PO_STATUSES = ["Draft", "Sent", "Received", "Partially Received", "Cancelled", "Sent"];
  const purchaseOrders = PO_STATUSES.map((status, i) => {
    const n = i + 1;
    const lines = Array.from({ length: ri(1, 3) }, () => {
      const item = pick(inventory);
      const qty = ri(2, 20);
      return {
        inventoryItemId: item.id,
        itemName: item.name,
        sku: item.sku,
        unit: item.unit,
        qtyOrdered: qty,
        unitCost: item.cost,
        qtyReceived: status === "Received" ? qty : status === "Partially Received" ? Math.floor(qty / 2) : 0,
      };
    });
    return {
      id: `UI-PO-${1000 + n}`,
      poNumber: `PO-UI-${1000 + n}`,
      supplier: pick(SUPPLIERS),
      status,
      lines,
      notes: "",
      createdAt: isoDaysFromNow(-ri(1, 30)),
      sentAt: status === "Draft" ? null : isoDaysFromNow(-ri(0, 20)),
      receivedAt: status === "Received" || status === "Partially Received" ? isoDaysFromNow(-ri(0, 10)) : null,
      createdBy: pick(UI_STAFF).name,
    };
  });

  // ── Write everything ─────────────────────────────────────────────────
  await writeAll("customers", customers);
  await writeAll("vehicles", vehiclesColl);
  await writeAll("plates", platesColl);
  await writeAll("vehicleOwnerships", vehicleOwnershipsColl);
  await writeAll("services", SERVICES);
  await writeAll("bookings", bookings);
  await writeAll("invoices", invoices);
  await writeAll("inventory", inventory);
  await writeAll("equipment", equipment);
  await writeAll("purchaseOrders", purchaseOrders);
  await writeAll("leads", leads);
  // Bookings above are assigned across all of BAYS, so the settings/bays doc
  // has to list them all too -- otherwise Day view's grid only renders
  // columns for whatever `bays` the store falls back to (just "Bay 1"),
  // and every booking on an unlisted bay silently disappears from view.
  await db.collection("settings").doc("bays").set({ bays: BAYS });

  const staffBatch = db.batch();
  for (const s of UI_STAFF) {
    const staffPinHash = await bcrypt.hash(s.pin, 10);
    staffBatch.set(db.collection("staff").doc(s.id), {
      username: s.username,
      name: s.name,
      role: s.role,
      color: s.color,
      permissions: ROLE_PERMISSIONS[s.role],
      pinHash: staffPinHash,
      active: true,
      mustChangePin: false,
      failCount: 0,
      lockedUntil: null,
    });
    staffBatch.set(db.collection("staff_public").doc(s.id), {
      username: s.username,
      name: s.name,
      role: s.role,
      color: s.color,
      active: true,
    });
    staffBatch.set(db.collection("usernames").doc(s.username.toLowerCase()), { staffId: s.id });
  }
  await staffBatch.commit();

  for (const s of UI_STAFF) {
    await seedAuthUser({
      staffId: s.id,
      username: s.username,
      pin: s.pin,
      role: s.role,
      perms: ROLE_PERMISSIONS[s.role],
      name: s.name,
    });
  }

  const busyDate = dateStrDaysFromNow(BUSY_DAY_OFFSET);
  console.log("\n──────────────────────────────────────────────────");
  console.log("UI test dataset seeded:");
  console.log(`  customers              ${customers.length}`);
  console.log(`  vehicles (first-class) ${vehiclesColl.length}`);
  console.log(`  bookings               ${bookings.length}  (${busyDate} has ${bookings.filter((b) => b.date === busyDate).length})`);
  console.log(`  invoices               ${invoices.length}`);
  console.log(`  inventory items        ${inventory.length}`);
  console.log(`  equipment              ${equipment.length}  (overdue: ${equipment[OVERDUE_INDEX].name})`);
  console.log(`  purchase orders        ${purchaseOrders.length}`);
  console.log(`  leads                  ${leads.length}`);
  console.log("\nStaff accounts (username / PIN):");
  for (const s of UI_STAFF) {
    console.log(`  ${s.role.padEnd(10)} ${s.username} / ${s.pin}`);
  }
  console.log("──────────────────────────────────────────────────\n");
}

// Guarded: the e2e specs import TEST_STAFF/TEST_SERVICES from this module
// for their own fixtures. Without this check, every one of those imports
// would re-run the seed (harmless since it's idempotent, but noisy and slow).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
