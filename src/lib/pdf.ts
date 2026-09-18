// Named import, not the default export: jsPDF ships a "node" conditional
// export (dist/jspdf.node.min.js) distinct from the browser build Vite
// bundles, and a plain `import jsPDF from "jspdf"` default binding resolves
// inconsistently between the two under Node's CJS/ESM interop (a script
// running under tsx got a `jsPDF is not a constructor` TypeError from this
// exact line -- see scripts/regenerate-inspection-report.ts, which imports
// buildInspectionReportDoc below and so pulls this file in under plain
// Node). The named `jsPDF` export is identical to `default` in both builds
// and doesn't have that ambiguity.
import { jsPDF } from "jspdf";
import { ref as storageRef, uploadBytes, getDownloadURL, getBytes } from "firebase/storage";
import type { Invoice, InvoiceLine, PurchaseOrder } from "./db";
import { getPayments, getAmountRefunded, getBusinessInfo } from "./db";
import { formatCurrency } from "./currency";
import { formatDate, formatDateTimeInColombo } from "./date-format";
import { LOGO_PNG_BASE64 } from "./logo-asset";
import { storage } from "./firebase";
import type { Job } from "./job";
import {
  type DamageMarker,
  type DamageMarkerSeverity,
  type DamageMarkerType,
  type DamageMarkerView,
  type Inspection,
} from "./inspection";
// This is the one place outside the components/ tree that imports from
// silhouette-data.ts, and deliberately so: the PDF's damage diagram must
// redraw the *exact* same artwork the screen does (see the acceptance
// criterion that marker positions match on-screen exactly), which only
// holds if both renderers embed the same PNGs at the same normalized
// coordinates. Every body type uses this same commissioned artwork now —
// the vector single-blob outline this used to fall back to for non-sedan
// vehicles is gone.
import { SEDAN_IMAGE_SRC, SEDAN_IMAGE_VIEWBOX } from "@/components/damage-diagram/silhouette-data";

// Letterhead details come from the settings/business Firestore doc (cached in
// db.ts by the store), except the website and the two landline/mobile
// numbers below: those aren't part of the Settings → Business model, so — matching
// how the header's website link was already handled — they're fixed here.
const WEBSITE_URL = "https://www.polishstation.lk";
const WEBSITE_LABEL = "www.polishstation.lk";
const CONTACT_PHONE_1 = "+94 76 788 5404";
const CONTACT_PHONE_2 = "+94 7 11 88 5252";

// Business bank account, shown on the payment box whenever the tender was a
// bank Transfer — customers paying that way need the account to pay into.
const BANK_ACCOUNT_NO = "1000 923 474";
const BANK_ACCOUNT_NAME = "STOPWASH PVT LTD";
const BANK_NAME = "Commercial Bank";

// Header: address, clickable website, and (as a mailto link) the
// settings/business email -- there's ample width here (this line alone,
// nothing else shares it), unlike the denser footer contact line below.
function drawHeaderContact(doc: jsPDF, x: number, y: number) {
  const info = getBusinessInfo();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(255, 220, 220);
  let cx = x;
  const put = (text: string, url?: string) => {
    if (url) doc.textWithLink(text, cx, y, { url });
    else doc.text(text, cx, y);
    cx += doc.getTextWidth(text);
  };
  put(`${info.address}  ·  `);
  put(WEBSITE_LABEL, WEBSITE_URL);
  if (info.email) {
    put("  ·  ");
    put(info.email, `mailto:${info.email}`);
  }
}

// Footer: address, clickable website, both contact numbers, and opening
// hours -- NOT email, which already has room on the header line above but
// would overflow the page margin if appended here too (measured: this line
// already reaches ~145mm of the ~178mm available before hours; adding both
// hours and email pushes it past the page edge entirely). Built as a
// sequence of segments (each measured before the next is placed) rather
// than one joined string, so the pipe separators land at consistent gaps
// regardless of how wide any one segment renders.
function drawFooterContact(doc: jsPDF, x: number, y: number, color: [number, number, number]) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  let cx = x;
  const sep = "   |   ";

  const put = (text: string, url?: string) => {
    doc.setTextColor(...color);
    if (url) {
      doc.textWithLink(text, cx, y, { url });
    } else {
      doc.text(text, cx, y);
    }
    cx += doc.getTextWidth(text);
  };

  const info = getBusinessInfo();
  put(info.address);
  put(sep);
  put(WEBSITE_LABEL, WEBSITE_URL);
  put(sep);
  put(CONTACT_PHONE_1);
  put(sep);
  put(CONTACT_PHONE_2);
  if (info.hours) {
    put(sep);
    put(info.hours);
  }
}

// ─── Brand colours (RGB) ─────────────────────────────────────────────────────
// Neutral grays (equal-ish R/G/B) on purpose: the previous slate/blue-gray
// tones (Tailwind slate-*) read as distinctly blue on a white invoice, which
// looked off. Everything below is genuinely gray or the brand red.
const RED: [number, number, number] = [200, 28, 28];
const CHARCOAL: [number, number, number] = [26, 26, 26];
const SLATE: [number, number, number] = [92, 92, 94];
const MUTED: [number, number, number] = [142, 142, 145];
const RULE: [number, number, number] = [224, 224, 226];
const ROW_ALT: [number, number, number] = [248, 248, 249];
const WHITE: [number, number, number] = [255, 255, 255];
const SUCCESS: [number, number, number] = [22, 163, 74];
const AMBER: [number, number, number] = [180, 120, 0];

// ─── Page constants (mm, A4) ──────────────────────────────────────────────────
const PW = 210;
const ML = 16;
const MR = PW - ML;
const CW = PW - ML * 2;
// Every right-aligned number (table totals, totals-block values, the
// TOTAL DUE/ORDER TOTAL box) stops here — 2mm shy of MR — rather than
// flush at MR itself, mirroring the ~2mm left inset already used on the
// row-number column so both edges of the table read as evenly padded.
const RCOL = MR - 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Used to always force 2 decimal places here (LKR 1,234.00), independent of
// every other screen in the app (LKR 1,234) -- see src/lib/currency.ts's
// header comment for why that was the actual bug (CC-currency), not a
// deliberate PDF convention. Delegating puts this document on the same
// formatting everywhere else already uses.
const fmt = formatCurrency;

const fmtDate = formatDate;

function rule(doc: jsPDF, y: number, color = RULE) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.25);
  doc.line(ML, y, MR, y);
}

function drawLogo(doc: jsPDF, x: number, y: number, box: number) {
  // No background plate: the source PNG is already transparent outside the
  // circular badge, so it sits directly on the (now black) header without
  // needing a white placeholder square behind it.
  doc.addImage(LOGO_PNG_BASE64, "PNG", x, y, box, box);
}

// Helvetica Bold's cap height as a fraction of font size, used below to
// centre a pill's fill rect on the actual ink of its text rather than on
// jsPDF's baseline (which sits near the bottom of the glyphs, not the
// middle) — the previous fixed "-ph + 0.8" offset put roughly 4x more
// padding above the label than below it.
const CAP_HEIGHT_RATIO = 0.72;

function badge(
  doc: jsPDF,
  label: string,
  x: number,
  y: number,
  bg: [number, number, number],
  fg: [number, number, number] = WHITE,
) {
  doc.setFont("helvetica", "bold");
  const fontSize = 7.5;
  doc.setFontSize(fontSize);
  const tw = doc.getTextWidth(label);
  const padX = 3;
  const padY = 1.3;
  const capH = fontSize * CAP_HEIGHT_RATIO * 0.3528; // pt -> mm
  const pw = tw + padX * 2;
  const ph = capH + padY * 2;
  doc.setFillColor(...bg);
  doc.roundedRect(x, y - capH - padY, pw, ph, 1, 1, "F");
  doc.setTextColor(...fg);
  doc.text(label, x + padX, y);
}

// ─── Shared document builder ──────────────────────────────────────────────────

interface DocOptions {
  docType: "INVOICE" | "QUOTATION";
  docId: string;
  docDate: string;
  validUntil?: string;
  customerName: string;
  phone?: string;
  plate?: string;
  vehicleModel?: string;
  lines: InvoiceLine[];
  subtotal: number;
  couponCode?: string;
  couponDiscount?: number;
  pointsDiscount?: number;
  tip?: number;
  total: number;
  method?: string;
  payments?: { method: string; amount: number; reference: string }[];
  refundedTotal?: number;
  status: string;
  notes?: string;
}

function buildDoc(opts: DocOptions): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let y = 0;

  // ── Header bar ───────────────────────────────────────────────────────────────
  // Black, not brand red: lets the logo's own red/silver badge sit directly on
  // it with no white placeholder plate behind it. Red is used as the accent
  // for the black structural blocks lower on the page instead (table header,
  // total box) rather than being spent on the banner.
  doc.setFillColor(...CHARCOAL);
  doc.rect(0, 0, PW, 42, "F");

  // Logo mark
  const LOGO_BOX = 15;
  drawLogo(doc, ML, 5, LOGO_BOX);
  const TX = ML + LOGO_BOX + 4;

  // Company name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...WHITE);
  doc.text(getBusinessInfo().trading.toUpperCase(), TX, 16);

  // Tagline
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 200, 200);
  doc.text("Professional Car Detailing & Protection", TX, 22);

  // Contact line
  drawHeaderContact(doc, TX, 28);

  // Doc type (right side)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...WHITE);
  doc.text(opts.docType, MR, 16, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 220, 220);
  doc.text(`No:  ${opts.docId}`, MR, 23, { align: "right" });
  doc.text(`Date:  ${fmtDate(opts.docDate)}`, MR, 28.5, { align: "right" });

  if (opts.validUntil) {
    doc.text(`Valid until:  ${opts.validUntil}`, MR, 34, { align: "right" });
  }

  y = 52;

  // ── Bill To + Status ─────────────────────────────────────────────────────────
  // Bill-to label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text("BILL TO", ML, y);

  // Status badge (right) — Draft/Issued read as plainly "UNPAID" rather than
  // a raw status word, since the ask here is a quick paid/not-paid glance;
  // Partially Paid, Void, Refunded and ESTIMATE stay as themselves since
  // collapsing those into "unpaid" would lose real information.
  const statusLabel =
    opts.status === "Draft" || opts.status === "Issued" ? "UNPAID" : opts.status.toUpperCase();
  const statusColor =
    opts.status === "Paid"
      ? SUCCESS
      : opts.status === "Void" || opts.status === "Refunded"
        ? SLATE
        : AMBER;
  badge(doc, statusLabel, MR - doc.getTextWidth(statusLabel) - 8, y + 0.5, statusColor);

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...CHARCOAL);
  doc.text(opts.customerName, ML, y);

  y += 5.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE);
  if (opts.plate || opts.vehicleModel) {
    const vehicleLine = [opts.vehicleModel, opts.plate].filter(Boolean).join("  ·  ");
    doc.text(`Vehicle:  ${vehicleLine}`, ML, y);
    y += 4.5;
  }

  if (opts.phone) {
    doc.text(`Contact:  ${opts.phone}`, ML, y);
    y += 4.5;
  }

  y += 4;
  rule(doc, y);
  y += 8;

  // ── Line items table ──────────────────────────────────────────────────────────
  // Table header background — brand red, freed up now the top banner is black.
  doc.setFillColor(...RED);
  doc.rect(ML, y - 5, CW, 8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...WHITE);

  // DISCOUNT is dropped from the table entirely when no line item actually
  // carries one — a header with nothing under it in every row read as an
  // unfinished table rather than a deliberate empty column, and dropping it
  // gives DESCRIPTION/QTY/UNIT PRICE the room back.
  const hasDiscount = opts.lines.some((l) => l.discount > 0);

  const C0 = ML + 2; // row number, shared x with the header "#"
  const C1 = ML + 3; // description start
  const C5 = RCOL; // total (right-aligned) — every column below is relative to this
  const C3 = hasDiscount ? C5 - 70 : C5 - 40; // unit price
  const C4 = hasDiscount ? C5 - 44 : 0; // discount (unused when !hasDiscount)
  const C2 = hasDiscount ? C5 - 100 : C5 - 74; // qty

  doc.text("#", C0, y, { align: "left" });
  doc.text("DESCRIPTION", C1 + 6, y);
  doc.text("QTY", C2, y, { align: "right" });
  doc.text("UNIT PRICE", C3, y, { align: "right" });
  if (hasDiscount) doc.text("DISCOUNT", C4, y, { align: "right" });
  doc.text("TOTAL", C5, y, { align: "right" });

  // The header bar's bottom edge sits 3mm below this y (rect drawn at y-5,
  // height 8), so the gap to the first row's baseline must clear that plus
  // the row text's own cap-height (~2.3mm at 8.5pt) or the header background
  // clips the tops of the first row's glyphs — most visible as a dark sliver
  // through light-colored cells like the unit price column.
  y += 7;

  // Rows: a plain bordered table (thin rule under every row) rather than
  // alternating shading — shading only every other row read as broken on a
  // 1- or 2-line invoice (a single unshaded row, or one shaded / one not),
  // and a consistent grid reads as more deliberately "formal invoice" than a
  // zebra stripe anyway.
  const ROW_TOP_PAD = 6; // space above the baseline reserved for the row's own text
  opts.lines.forEach((line, idx) => {
    const rowH = 10;
    const lineTotal = line.unitPrice * line.qty - line.discount;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...CHARCOAL);
    doc.text(String(idx + 1), C0, y, { align: "left" });

    // Wrap long description, using the full width up to the QTY column (with
    // a small gutter) rather than a much narrower fixed guess — the old 68mm
    // wrapped early and left a dead gap of blank space before QTY.
    const descLines = doc.splitTextToSize(line.name, C2 - (C1 + 6) - 4);
    doc.text(descLines[0], C1 + 6, y);
    if (descLines[1]) {
      doc.setFontSize(7.5);
      doc.setTextColor(...SLATE);
      doc.text(descLines[1], C1 + 6, y + 4);
    }

    doc.setFontSize(8.5);
    doc.setTextColor(...CHARCOAL);
    doc.text(String(line.qty), C2, y, { align: "right" });

    doc.setTextColor(...SLATE);
    if (!line.hideUnitPrice) {
      doc.text(fmt(line.unitPrice), C3, y, { align: "right" });
    }

    if (line.discount > 0) {
      doc.setTextColor(200, 50, 50);
      doc.text(`- ${fmt(line.discount)}`, C4, y, { align: "right" });
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...CHARCOAL);
    doc.text(fmt(lineTotal), C5, y, { align: "right" });

    const thisRowH = descLines.length > 1 ? rowH + 4 : rowH;
    // Skip the light per-row divider under the last item — the heavier
    // closing rule lands 1mm below it, and the two together previously read
    // as a stray doubled line rather than one deliberate border.
    if (idx < opts.lines.length - 1) {
      rule(doc, y - ROW_TOP_PAD + thisRowH);
    }
    y += thisRowH;
  });

  // A heavier rule marks the definitive end of the table.
  y += 1;
  rule(doc, y, CHARCOAL);
  y += 8;

  // ── Totals ────────────────────────────────────────────────────────────────────
  const TV = RCOL; // totals value (right-aligned) — lines up with the table's TOTAL column
  const TL = TV - 78; // totals label start

  function totalRow(
    label: string,
    value: string,
    bold = false,
    color: [number, number, number] = CHARCOAL,
  ) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 9 : 8.5);
    doc.setTextColor(...SLATE);
    doc.text(label, TL, y);
    doc.setTextColor(...color);
    doc.text(value, TV, y, { align: "right" });
    y += 5.5;
  }

  totalRow("Subtotal", fmt(opts.subtotal));
  if (opts.couponDiscount && opts.couponDiscount > 0) {
    totalRow(
      opts.couponCode ? `Coupon (${opts.couponCode})` : "Coupon Discount",
      `− ${fmt(opts.couponDiscount)}`,
      false,
      SUCCESS,
    );
  }
  if (opts.pointsDiscount && opts.pointsDiscount > 0) {
    totalRow("Loyalty Points Redeemed", `− ${fmt(opts.pointsDiscount)}`, false, SUCCESS);
  }
  if (opts.tip && opts.tip > 0) totalRow("Tip / Gratuity", fmt(opts.tip));

  // Total box extends 2mm past the text on every side — enough to read as
  // real padding instead of the text sitting flush against the box edge —
  // while the TEXT itself still sits at TL/TV, the same columns as the
  // "Subtotal" row's label and value above it. The right edge lands on TV +
  // 2 = MR (RCOL is defined as MR - 2), which is the same true margin the
  // table header bar already extends to, so it isn't a new overhang.
  // Box top is placed a clear TOTAL_GAP below the last totals row's own
  // baseline (not derived from the cap-height-centred text position below,
  // which previously left only ~0.1mm before the box — cap-height centring
  // made the box taller upward without the row above ever accounting for
  // that extra height).
  const lastRowBaseline = y - 5.5; // y is 5.5 past that row's baseline (totalRow()'s own increment)
  const TOTAL_GAP = 4;
  const totalBoxH = 10;
  const totalCapH = 11 * CAP_HEIGHT_RATIO * 0.3528;
  const totalPadY = (totalBoxH - totalCapH) / 2;
  const totalPadX = 2;
  const totalBoxTop = lastRowBaseline + TOTAL_GAP;
  const totalTextY = totalBoxTop + totalCapH + totalPadY; // text baseline, centred within the box

  doc.setFillColor(...RED);
  doc.roundedRect(TL - totalPadX, totalBoxTop, TV - TL + totalPadX * 2, totalBoxH, 1.5, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text("TOTAL DUE", TL, totalTextY);
  doc.setFontSize(11);
  doc.text(fmt(opts.total), TV, totalTextY, { align: "right" });

  y = totalBoxTop + totalBoxH + 9.5;

  // ── Payment / Quotation info ─────────────────────────────────────────────────
  // Lists every tender line (split payments show one row per method), and
  // falls back to the single legacy `method` field for older invoices.
  if (opts.docType === "INVOICE" && (opts.method || (opts.payments?.length ?? 0) > 0)) {
    const pays =
      opts.payments && opts.payments.length > 0
        ? opts.payments
        : opts.method
          ? [{ method: opts.method, amount: opts.total, reference: "" }]
          : [];
    // A bank Transfer tender needs the account to pay into printed alongside
    // it — extra block appended once below the payment rows, not per-row,
    // since a split payment only has one bank account to point to.
    const hasTransfer = pays.some((p) => p.method === "Transfer");

    // Card height is derived from these same offsets (not a separate
    // hand-tuned constant), with PAD mirrored top and bottom, so the card
    // always wraps its content evenly no matter how many payment rows there
    // are or whether the bank block is shown.
    const PAD = 5;
    const ROW_GAP = 4.5;
    const BANK_GAP = 3.5;
    const BANK_LINE_GAP = 5;
    const BANK_LAST_GAP = 4;
    const lastRowBaseline = PAD + (pays.length - 1) * ROW_GAP;
    const bankAdvance = ROW_GAP + BANK_GAP + BANK_LINE_GAP + BANK_LAST_GAP;
    const contentBaseline = lastRowBaseline + (hasTransfer ? bankAdvance : 0);
    const boxH = contentBaseline + PAD * 2;

    doc.setFillColor(...ROW_ALT);
    doc.roundedRect(ML, y - PAD, 95, boxH, 1.5, 1.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("PAYMENT", ML + 4, y);

    let py = y + PAD;
    pays.forEach((p) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...CHARCOAL);
      const label = p.reference
        ? `${p.method.toUpperCase()} (${p.reference})`
        : p.method.toUpperCase();
      doc.text(label, ML + 4, py);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...SLATE);
      doc.text(fmt(p.amount), ML + 91, py, { align: "right" });
      py += ROW_GAP;
    });

    if (hasTransfer) {
      py += BANK_GAP;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...CHARCOAL);
      doc.text(BANK_ACCOUNT_NO, ML + 4, py);
      py += BANK_LINE_GAP;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...SLATE);
      doc.text(BANK_ACCOUNT_NAME, ML + 4, py);
      py += BANK_LAST_GAP;
      doc.text(BANK_NAME, ML + 4, py);
    }

    y += boxH + 4;

    if (opts.refundedTotal && opts.refundedTotal > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(200, 50, 50);
      doc.text(`REFUNDED: ${fmt(opts.refundedTotal)}`, ML, y);
      y += 7;
    }
  }

  if (opts.docType === "QUOTATION") {
    doc.setFillColor(254, 252, 232); // amber-50
    doc.setDrawColor(...AMBER);
    doc.setLineWidth(0.4);
    doc.roundedRect(ML, y - 5, CW, 13, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...AMBER);
    doc.text("QUOTATION TERMS", ML + 4, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 80, 0);
    doc.text(
      `This quotation is valid for 30 days from the date above. Prices may vary based on vehicle condition.`,
      ML + 4,
      y + 5.5,
    );

    y += 18;
  }

  // ── Notes ────────────────────────────────────────────────────────────────────
  if (opts.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("NOTES", ML, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE);
    const noteLines = doc.splitTextToSize(opts.notes, CW);
    doc.text(noteLines, ML, y);
    y += noteLines.length * 5 + 4;
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  // Always pinned at the bottom of the page, regardless of content — that's
  // what makes it read as a footer rather than just the last block of content.
  const footerY = 277;
  rule(doc, footerY - 5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...RED);
  doc.text("POLISH STATION", ML, footerY);

  drawFooterContact(doc, ML, footerY + 5, SLATE);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(
    `Thank you for choosing ${getBusinessInfo().trading}, Sri Lanka's premier car care destination.`,
    ML,
    footerY + 10,
  );

  // Page number
  doc.setFontSize(7);
  doc.text("Page 1 of 1", MR, footerY + 10, { align: "right" });

  return doc;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function downloadInvoicePDF(invoice: Invoice) {
  const doc = buildDoc({
    docType: "INVOICE",
    docId: invoice.id,
    docDate: invoice.createdAt,
    customerName: invoice.customerName,
    phone: invoice.phone,
    plate: invoice.plate,
    vehicleModel: invoice.vehicleModel,
    lines: invoice.lines,
    subtotal: invoice.subtotal,
    couponCode: invoice.couponCode,
    couponDiscount: invoice.couponDiscount,
    pointsDiscount: invoice.pointsRedeemedValue,
    tip: invoice.tip,
    total: invoice.total,
    method: invoice.method,
    payments: getPayments(invoice).map((p) => ({
      method: p.method,
      amount: p.amount,
      reference: p.reference,
    })),
    refundedTotal: getAmountRefunded(invoice),
    status: invoice.status,
  });
  doc.save(`${invoice.id}.pdf`);
}

export function downloadPOPDF(po: PurchaseOrder) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let y = 0;

  // Header bar — black, matching buildDoc(); see the comment there.
  doc.setFillColor(...CHARCOAL);
  doc.rect(0, 0, PW, 42, "F");

  const LOGO_BOX = 15;
  drawLogo(doc, ML, 5, LOGO_BOX);
  const TX = ML + LOGO_BOX + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...WHITE);
  doc.text(getBusinessInfo().trading.toUpperCase(), TX, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 200, 200);
  doc.text("Professional Car Detailing & Protection", TX, 22);
  drawHeaderContact(doc, TX, 28);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...WHITE);
  doc.text("PURCHASE ORDER", MR, 16, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 220, 220);
  doc.text(`No:  ${po.poNumber}`, MR, 23, { align: "right" });
  doc.text(`Date:  ${fmtDate(po.createdAt)}`, MR, 28.5, { align: "right" });
  doc.text(`Status:  ${po.status.toUpperCase()}`, MR, 34, { align: "right" });

  y = 52;

  // Supplier section (left) | From section (right)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text("SUPPLIER", ML, y);
  doc.text("FROM", MR - 60, y);

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...CHARCOAL);
  doc.text(po.supplier, ML, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(getBusinessInfo().trading, MR - 60, y);

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE);
  doc.text(getBusinessInfo().address, MR - 60, y);
  y += 4.5;
  doc.text(getBusinessInfo().phone, MR - 60, y);

  if (po.createdBy) {
    y += 4.5;
    doc.text(`Raised by: ${po.createdBy}`, ML, y);
  }

  y += 8;
  rule(doc, y);
  y += 8;

  // Line items table
  doc.setFillColor(...RED);
  doc.rect(ML, y - 5, CW, 8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...WHITE);

  const C0 = ML + 2;
  const C1 = ML + 3;
  const C5 = RCOL;
  const C4 = C5 - 59; // unit cost
  const C3 = C5 - 84; // qty
  const C2 = C5 - 109; // unit

  doc.text("#", C0, y, { align: "left" });
  doc.text("DESCRIPTION / SKU", C1 + 6, y);
  doc.text("UNIT", C2, y, { align: "right" });
  doc.text("QTY", C3, y, { align: "right" });
  doc.text("UNIT COST", C4, y, { align: "right" });
  doc.text("LINE TOTAL", C5, y, { align: "right" });

  // See the matching comment in buildDoc(): the header bar's bottom edge
  // clips the first row's text if this gap is under ~7mm.
  y += 7;

  // Plain bordered table (thin rule under every row), matching buildDoc() —
  // see the comment there on why this replaced alternating row shading.
  const ROW_TOP_PAD = 6;
  let grandTotal = 0;
  po.lines.forEach((line, idx) => {
    const rowH = 12; // every PO row carries a second SKU line, so it's always tall

    const lineTotal = line.unitCost * line.qtyOrdered;
    grandTotal += lineTotal;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...CHARCOAL);
    doc.text(String(idx + 1), C0, y);
    doc.text(line.itemName, C1 + 6, y);

    doc.setFontSize(7);
    doc.setTextColor(...SLATE);
    doc.text(`SKU: ${line.sku}`, C1 + 6, y + 3.5);

    doc.setFontSize(8.5);
    doc.setTextColor(...CHARCOAL);
    doc.text(line.unit, C2, y, { align: "right" });
    doc.text(String(line.qtyOrdered), C3, y, { align: "right" });

    doc.setTextColor(...SLATE);
    doc.text(fmt(line.unitCost), C4, y, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...CHARCOAL);
    doc.text(fmt(lineTotal), C5, y, { align: "right" });

    rule(doc, y - ROW_TOP_PAD + rowH);
    y += rowH;
  });

  y += 1;
  rule(doc, y, CHARCOAL);
  const ruleY = y;

  // Total box spans exactly TL to TV, matching the fix in buildDoc(). Box
  // top sits a clear TOTAL_GAP below the closing rule — not derived from
  // the cap-height-centred text position, which previously left the box
  // starting only ~2.6mm below the rule despite the "+= 8" spacer above.
  const TV = RCOL;
  const TL = TV - 78;
  const TOTAL_GAP = 4;
  const totalBoxH = 10;
  const totalCapH = 11 * CAP_HEIGHT_RATIO * 0.3528;
  const totalPadY = (totalBoxH - totalCapH) / 2;
  const totalPadX = 2;
  const totalBoxTop = ruleY + TOTAL_GAP;
  const totalTextY = totalBoxTop + totalCapH + totalPadY;

  doc.setFillColor(...RED);
  doc.roundedRect(TL - totalPadX, totalBoxTop, TV - TL + totalPadX * 2, totalBoxH, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text("ORDER TOTAL", TL, totalTextY);
  doc.setFontSize(11);
  doc.text(fmt(grandTotal), TV, totalTextY, { align: "right" });
  y = totalBoxTop + totalBoxH + 11.5;

  // Notes
  if (po.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("NOTES", ML, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE);
    const noteLines = doc.splitTextToSize(po.notes, CW);
    doc.text(noteLines, ML, y);
    y += noteLines.length * 5 + 8;
  }

  // Signature block
  const SIG_Y = Math.max(y + 10, 220);
  rule(doc, SIG_Y - 2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...CHARCOAL);
  doc.text(`Authorised by (${getBusinessInfo().trading}):`, ML, SIG_Y + 5);
  doc.setFont("helvetica", "normal");
  doc.setDrawColor(...SLATE);
  doc.setLineWidth(0.3);
  doc.line(ML, SIG_Y + 14, ML + 70, SIG_Y + 14);
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("Signature & Date", ML, SIG_Y + 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...CHARCOAL);
  doc.text("Supplier Confirmation:", MR - 70, SIG_Y + 5);
  doc.line(MR - 70, SIG_Y + 14, MR, SIG_Y + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("Signature & Date", MR - 70, SIG_Y + 18);

  // Footer
  const footerY = 277;
  rule(doc, footerY - 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...RED);
  doc.text("POLISH STATION", ML, footerY);
  drawFooterContact(doc, ML, footerY + 5, SLATE);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("Please retain a signed copy for your records.", ML, footerY + 10);
  doc.setFontSize(7);
  doc.text("Page 1 of 1", MR, footerY + 10, { align: "right" });

  doc.save(`${po.poNumber}.pdf`);
}

export function downloadQuotationPDF(opts: {
  id: string;
  customerName: string;
  phone?: string;
  plate?: string;
  vehicleModel?: string;
  lines: InvoiceLine[];
  notes?: string;
}) {
  const subtotal = opts.lines.reduce((s, l) => s + l.unitPrice * l.qty - l.discount, 0);
  const total = subtotal;

  const validDate = new Date();
  validDate.setDate(validDate.getDate() + 30);

  const doc = buildDoc({
    docType: "QUOTATION",
    docId: opts.id,
    docDate: new Date().toISOString(),
    validUntil: formatDate(validDate),
    customerName: opts.customerName,
    phone: opts.phone,
    plate: opts.plate,
    vehicleModel: opts.vehicleModel,
    lines: opts.lines,
    subtotal,
    total,
    status: "ESTIMATE",
    notes: opts.notes,
  });
  doc.save(`${opts.id}.pdf`);
}

// ─── Job card ──────────────────────────────────────────────────────────────
// Unlike every builder above (ephemeral — `doc.save()` and gone), this one
// also uploads the generated PDF to Storage and returns where it landed, so
// the job's `documents.jobCard` field (src/lib/job.ts) can point at a real,
// shareable URL — see the module note there on why a job card, specifically,
// needs to be persisted rather than regenerated on demand.

function jobField(doc: jsPDF, x: number, y: number, w: number, label: string, value: string): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...CHARCOAL);
  const lines = doc.splitTextToSize(value || "—", w);
  doc.text(lines[0] ?? "—", x, y + 5);
}

export interface JobCardResult {
  url: string;
  storagePath: string;
  version: number;
}

/**
 * Builds the job card PDF, uploads it to
 * `jobs/{jobId}/documents/job-card-v{version}.pdf` in Storage (never
 * overwriting an earlier version — see Job.documents.jobCard's header
 * comment), and returns where it landed. Supervisor/technician names are
 * passed in rather than looked up here, since this is a plain lib module
 * with no access to the staff roster (see src/lib/use-staff-list.ts) —
 * callers already have both loaded.
 */
export async function generateJobCardPDF(
  job: Job,
  names: { supervisorName: string; technicianNames: string[] },
): Promise<JobCardResult> {
  const version = job.estimate?.quoteVersion ?? 1;

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let y = 0;

  // Header bar — matches buildDoc()/downloadPOPDF().
  doc.setFillColor(...CHARCOAL);
  doc.rect(0, 0, PW, 42, "F");

  const LOGO_BOX = 15;
  drawLogo(doc, ML, 5, LOGO_BOX);
  const TX = ML + LOGO_BOX + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...WHITE);
  doc.text(getBusinessInfo().trading.toUpperCase(), TX, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 200, 200);
  doc.text("Professional Car Detailing & Protection", TX, 22);
  drawHeaderContact(doc, TX, 28);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...WHITE);
  doc.text("JOB CARD", MR, 16, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 220, 220);
  doc.text(`Ref:  ${job.id}`, MR, 23, { align: "right" });
  doc.text(`Date:  ${fmtDate(job.createdAt)}`, MR, 28.5, { align: "right" });
  doc.text(`Version:  ${version}`, MR, 34, { align: "right" });

  y = 52;

  // ── Customer / vehicle block ────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text("CUSTOMER", ML, y);

  const statusLabel = job.status.toUpperCase().replace(/_/g, " ");
  badge(doc, statusLabel, MR - doc.getTextWidth(statusLabel) - 8, y + 0.5, CHARCOAL);

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...CHARCOAL);
  doc.text(job.customerSnapshot?.name || job.customerName, ML, y);

  y += 5.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE);
  if (job.customerSnapshot?.phone) {
    doc.text(`Contact:  ${job.customerSnapshot.phone}`, ML, y);
    y += 4.5;
  }
  const v = job.vehicle;
  if (v) {
    const vehicleLine = [v.year, v.make, v.model].filter(Boolean).join(" ");
    doc.text(`Vehicle:  ${vehicleLine}  ·  ${v.plate}  ·  ${v.colour}`, ML, y);
    y += 4.5;
  }

  y += 4;
  rule(doc, y);
  y += 10;

  // ── Job detail grid (two columns, matching the Ref/Customer/Contact/
  // Vehicle/Colour/Service/Work Scheduled/Supervisor/Technician field list). ──
  const GAP = 8;
  const colW = (CW - GAP) / 2;
  const leftX = ML;
  const rightX = ML + colW + GAP;
  const ROW_H = 15;

  const scheduledAt = `${fmtDate(job.date)}  ${job.time}`;
  const rows: [string, string][] = [
    ["Colour", v?.colour ?? "—"],
    ["Service", job.serviceName],
    ["Work Scheduled", scheduledAt],
    ["Assigned Supervisor", names.supervisorName || "—"],
    ["Assigned Technician", names.technicianNames.join(", ") || "—"],
    ["Total Amount (LKR)", fmt(job.price)],
  ];
  for (let i = 0; i < rows.length; i += 2) {
    const [l1, v1] = rows[i];
    jobField(doc, leftX, y, colW, l1, v1);
    if (rows[i + 1]) {
      const [l2, v2] = rows[i + 1];
      jobField(doc, rightX, y, colW, l2, v2);
    }
    y += ROW_H;
  }

  // Estimate not yet confirmed: printed, not silently omitted — a customer
  // reading this card must see the price can still move.
  if (job.estimate?.isProvisional) {
    y += 2;
    doc.setFillColor(254, 252, 232); // amber-50
    doc.setDrawColor(...AMBER);
    doc.setLineWidth(0.4);
    doc.roundedRect(ML, y - 5, CW, 11, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...AMBER);
    doc.text("Estimate subject to on-site inspection.", ML + 4, y + 1.5);
    y += 15;
  } else {
    y += 6;
  }

  // ── Notes ────────────────────────────────────────────────────────────────
  if (job.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("NOTES", ML, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE);
    const noteLines = doc.splitTextToSize(job.notes, CW);
    doc.text(noteLines, ML, y);
    y += noteLines.length * 5 + 4;
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const footerY = 277;
  rule(doc, footerY - 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...RED);
  doc.text("POLISH STATION", ML, footerY);
  drawFooterContact(doc, ML, footerY + 5, SLATE);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("Please retain this job card for your records.", ML, footerY + 10);
  doc.setFontSize(7);
  doc.text("Page 1 of 1", MR, footerY + 10, { align: "right" });

  // ── Persist: upload, never overwriting an earlier version ──────────────────
  const storagePath = `jobs/${job.id}/documents/job-card-v${version}.pdf`;
  const blob = doc.output("blob");
  const fileRef = storageRef(storage, storagePath);
  await uploadBytes(fileRef, blob, { contentType: "application/pdf" });
  const url = await getDownloadURL(fileRef);

  doc.save(`${job.id}-v${version}.pdf`);

  return { url, storagePath, version };
}

// ─── Inspection report (Phase 5) ────────────────────────────────────────────
// Sections, in this order per the spec: header; customer+vehicle; intake
// baseline; damage diagram grid; damage table; paint history & condition
// flags; interior condition; systems check; inventory; customer priority &
// scope; photo appendix; signatures/remote-ack; disclaimer. A4 portrait
// only — every other PDF in this app is A4-only too, and this is a Sri
// Lankan business with no real Letter-size use case.
//
// Not auto-downloaded via doc.save() the way the job card is: this report
// is generated automatically (on sending for acknowledgment, and on
// signing), not from a deliberate "download this now" click, so an
// unsolicited file save on every sign-off would surprise staff. Callers
// that want a local copy (the eventual "Regenerate Report" button) can
// open the returned url themselves.

const FOOTER_Y = 285;
const PAGE_BOTTOM = 270;

const MARKER_TYPE_LABELS_PDF: Record<DamageMarkerType, string> = {
  scratch: "Scratch",
  dent: "Dent",
  chip: "Chip",
  crack: "Crack",
  rust: "Rust",
  swirl: "Swirl",
  paint_defect: "Paint defect",
  scuff: "Scuff",
  missing_part: "Missing part",
  other: "Other",
};
const SEVERITY_LABELS_PDF: Record<DamageMarkerSeverity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  severe: "Severe",
};
const FUEL_LABELS_PDF: Record<string, string> = {
  E: "Empty",
  quarter: "1/4",
  half: "1/2",
  three_quarter: "3/4",
  F: "Full",
};

/** Fetches a Storage file's bytes and returns it as a data: URL jsPDF's
 *  addImage() can embed directly. Returns null on any failure (missing
 *  file, network error) rather than throwing — one unreadable photo must
 *  not fail the whole report; the caller draws an empty frame instead. */
async function fetchDataUrl(path: string, mime: string): Promise<string | null> {
  try {
    const bytes = await getBytes(storageRef(storage, path));
    const blob = new Blob([bytes], { type: mime });
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

// Sedan diagram artwork (public/Illustrations/*.png) is a same-origin static
// asset, not a Storage object — a plain fetch() rather than fetchDataUrl()'s
// getBytes(storageRef(...)). Cached per document generation: the multi-page
// report draws several views but never the same one twice, so no request
// is ever repeated within one call.
// The sedan artwork ships at ~1700-2000px per side (crisp for the on-screen
// diagram, which can be tapped/zoomed) but is only ever drawn into a ~40-90mm
// PDF box — embedding it at source resolution produced a 20MB+ single-page
// PDF (jsPDF stores addImage() data close to verbatim, it doesn't
// recompress). Downscaling to print-adequate resolution first, and
// re-encoding as JPEG (no transparency to preserve, and these are line art
// on a flat background — JPEG compresses that far smaller than PNG at a
// quality no one will see the difference at), is what actually fixes it.
// Exported so a Node-side AssetFetcher (scripts/regenerate-inspection-report.ts)
// can match the browser path's output size/quality exactly, instead of a
// second hand-copied pair of magic numbers silently drifting out of sync.
export const SEDAN_PDF_IMAGE_MAX_DIM = 700;
export const SEDAN_PDF_IMAGE_JPEG_QUALITY = 0.85;

async function downscaleImageDataUrl(
  dataUrl: string,
  maxDim: number,
  quality: number,
): Promise<string> {
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image decode failed"));
  });
  img.src = dataUrl;
  await loaded;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl; // canvas unsupported — fall back to the original, oversized as it is
  ctx.fillStyle = "#ffffff"; // flattens any transparency to white, not JPEG's default black
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Browser-only: fetch(path) resolves relative to window.location, and
 *  downscaling goes through <canvas>. A script running under plain Node
 *  (e.g. scripts/regenerate-inspection-report.ts, which imports
 *  buildInspectionReportDoc directly) has neither — both silently failed
 *  closed the first time this ran outside a browser (caught below,
 *  drawVehicleOutline treats a null return as "just draw the box, no art"),
 *  which is why a script-generated report's diagram boxes came back
 *  completely empty. That script supplies its own Node-side implementation
 *  instead (see buildInspectionReportDoc's `fetchAsset` param below) —
 *  deliberately NOT added here as an environment branch: this file is
 *  reachable from server-rendered routes (_app.jobs.tsx etc. import it),
 *  and this repo's SSR/client bundles go through Rolldown (vite.config.ts),
 *  which statically resolves string-literal dynamic imports — a literal
 *  `import("sharp")` in this file risks the bundler trying to inline a
 *  native binary addon into a chunk it can't actually run from. Keeping any
 *  such import out of this file entirely, and injecting it instead, is what
 *  avoids that risk regardless of whether it would have actually triggered. */
async function fetchPublicAssetDataUrl(path: string): Promise<string | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const original = await blobToDataUrl(await res.blob());
    return await downscaleImageDataUrl(
      original,
      SEDAN_PDF_IMAGE_MAX_DIM,
      SEDAN_PDF_IMAGE_JPEG_QUALITY,
    );
  } catch {
    return null;
  }
}

/** Same FileReader conversion fetchDataUrl uses, exposed for callers that
 *  already hold the Blob in memory (a signature pad's own toBlob(), right
 *  before it's uploaded) and can hand it to generateInspectionReportPDF
 *  directly instead of uploading, then immediately reading the same bytes
 *  back from Storage — a round trip that has nothing to do with jsPDF and
 *  everything to do with the Storage bucket's CORS config, which the
 *  in-memory blob was never going to be subject to in the first place. */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function newPage(doc: jsPDF): number {
  doc.addPage();
  return 20;
}

/** Starts a new page if `needed` more mm wouldn't fit above the footer. */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  return y + needed > PAGE_BOTTOM ? newPage(doc) : y;
}

function sectionTitle(doc: jsPDF, y: number, title: string): number {
  y = ensureSpace(doc, y, 14);
  doc.setFillColor(...CHARCOAL);
  doc.rect(ML, y, CW, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text(title.toUpperCase(), ML + 3, y + 5);
  return y + 12;
}

/** Strokes/fills a closed polygon from absolute points — jsPDF has no
 *  polygon primitive, only relative-delta paths (lines()) and a 3-point
 *  triangle(); this covers arbitrary point counts (the body outlines) and
 *  the diamond marker shape uniformly. */
function strokePolygon(doc: jsPDF, points: [number, number][], style: "S" | "F" | "FD") {
  const [x0, y0] = points[0];
  const deltas: [number, number][] = [];
  for (let i = 1; i < points.length; i++) {
    deltas.push([points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]]);
  }
  deltas.push([x0 - points[points.length - 1][0], y0 - points[points.length - 1][1]]);
  doc.lines(deltas, x0, y0, [1, 1], style, true);
}

// ─── Baseline field icons (Customer & Vehicle strip) ───────────────────────
// Small vector-drawn glyphs, not embedded images — plain line art (stroke
// only, no fill except a couple of small accent dots), matching the same
// minimal, technical-drawing look the damage-diagram artwork already has,
// rather than a mismatched icon-font style. Each is drawn centred on (cx,cy)
// within roughly a 2*r box.
type BaselineIconKind = "mileage" | "fuel" | "warning" | "starts" | "keys";

function drawBaselineIcon(doc: jsPDF, kind: BaselineIconKind, cx: number, cy: number, r: number) {
  doc.setDrawColor(...SLATE);
  doc.setLineWidth(0.35);
  switch (kind) {
    case "mileage": {
      // Speedometer: dial + a needle pointing up-right (a stand-in for "a
      // reading", not a literal odometer digit display) + centre hub.
      doc.circle(cx, cy, r, "S");
      const angle = (-50 * Math.PI) / 180;
      doc.line(cx, cy, cx + r * 0.75 * Math.cos(angle), cy + r * 0.75 * Math.sin(angle));
      doc.setFillColor(...SLATE);
      doc.circle(cx, cy, 0.5, "F");
      break;
    }
    case "fuel": {
      // Fuel pump silhouette: tank body, nozzle, handle — the universal
      // filling-station glyph, not a gauge (which would read too similar to
      // the mileage icon right next to it).
      const bodyW = r * 1.1;
      const bodyH = r * 1.7;
      const bodyX = cx - bodyW / 2 - r * 0.25;
      const bodyY = cy - bodyH / 2;
      doc.roundedRect(bodyX, bodyY, bodyW, bodyH, 0.6, 0.6, "S");
      doc.line(bodyX + 1, cy, bodyX + bodyW - 1, cy);
      const nozzleX = bodyX + bodyW;
      doc.line(nozzleX, bodyY + 1, nozzleX + r * 0.7, bodyY - r * 0.3);
      doc.rect(nozzleX + r * 0.6, bodyY - r * 0.75, r * 0.5, r * 0.4, "S");
      break;
    }
    case "warning": {
      // Same triangle+exclamation glyph the damage-severity markers use for
      // "moderate" (drawDiagramView above) — one warning-symbol convention
      // across the whole report, not two.
      strokePolygon(
        doc,
        [
          [cx, cy - r],
          [cx + r * 0.95, cy + r * 0.7],
          [cx - r * 0.95, cy + r * 0.7],
        ],
        "S",
      );
      doc.setLineWidth(0.5);
      doc.line(cx, cy - r * 0.15, cx, cy + r * 0.25);
      doc.setFillColor(...SLATE);
      doc.circle(cx, cy + r * 0.5, 0.4, "F");
      break;
    }
    case "starts": {
      // Check-in-circle.
      doc.circle(cx, cy, r, "S");
      doc.setLineWidth(0.6);
      doc.line(cx - r * 0.45, cy, cx - r * 0.1, cy + r * 0.35);
      doc.line(cx - r * 0.1, cy + r * 0.35, cx + r * 0.5, cy - r * 0.35);
      break;
    }
    case "keys": {
      // Key silhouette: ring (bow) + shaft + two teeth.
      const headR = r * 0.42;
      const headCx = cx - r * 0.4;
      doc.circle(headCx, cy, headR, "S");
      const shaftStartX = headCx + headR;
      const shaftEndX = cx + r * 0.7;
      doc.line(shaftStartX, cy, shaftEndX, cy);
      doc.line(shaftEndX, cy, shaftEndX, cy + r * 0.4);
      doc.line(shaftEndX - r * 0.3, cy, shaftEndX - r * 0.3, cy + r * 0.28);
      break;
    }
  }
}

function sedanImageViewBoxSize(view: DamageMarkerView): [number, number] {
  const [, , w, h] = SEDAN_IMAGE_VIEWBOX[view].split(" ").map(Number);
  return [w, h];
}

/** Scale/offset transform for one diagram box (bx,by,bw,bh) — shared by the
 *  multi-page report and the single-page sheet. Letterboxes (uniform scale,
 *  centred) against the real artwork's own aspect ratio, since stretching a
 *  photo-like PNG to an arbitrary box would visibly distort it. Markers use
 *  the same toX/toY as the image, so they stay correctly positioned
 *  relative to it. Same commissioned artwork for every body type (see
 *  drawVehicleOutline below) — this used to branch on bodyType for a
 *  vector-outline fallback on non-sedan vehicles; that's gone now that every
 *  body type uses the same PNGs. */
function diagramTransform(
  view: DamageMarkerView,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): {
  vbW: number;
  vbH: number;
  toX: (x: number) => number;
  toY: (y: number) => number;
} {
  const [vbW, vbH] = sedanImageViewBoxSize(view);
  const s = Math.min(bw / vbW, bh / vbH);
  const offX = bx + (bw - vbW * s) / 2;
  const offY = by + (bh - vbH * s) / 2;
  return { vbW, vbH, toX: (x) => offX + x * s, toY: (y) => offY + y * s };
}

/** Matches fetchPublicAssetDataUrl's own signature — the browser
 *  implementation is the default everywhere; buildInspectionReportDoc's
 *  `fetchAsset` param (see its own comment) is the only way a caller ever
 *  overrides it, e.g. scripts/regenerate-inspection-report.ts supplying a
 *  Node/sharp-backed one. */
type AssetFetcher = (path: string) => Promise<string | null>;

/** Draws the vehicle artwork into a diagram box already scaled to (toX,
 *  toY) — shared by both the multi-page report (drawDiagramView) and the
 *  single-page sheet (sheetDrawDiagramView), since each needs to draw this
 *  identically. Embeds the same commissioned illustrator PNG the on-screen
 *  diagram shows (SEDAN_IMAGE_SRC), for every body type, not just sedans. */
async function drawVehicleOutline(
  doc: jsPDF,
  view: DamageMarkerView,
  toX: (x: number) => number,
  toY: (y: number) => number,
  vbW: number,
  vbH: number,
  fetchAsset: AssetFetcher = fetchPublicAssetDataUrl,
) {
  const dataUrl = await fetchAsset(SEDAN_IMAGE_SRC[view]);
  if (!dataUrl) return; // box + label still drawn by the caller; just no art if the fetch failed
  try {
    doc.addImage(dataUrl, "JPEG", toX(0), toY(0), toX(vbW) - toX(0), toY(vbH) - toY(0));
  } catch {
    // corrupt/unsupported image data — omit rather than fail the whole report
  }
}

/** Redraws the exact same outline/wheel/marker geometry the on-screen
 *  DamageDiagram renders (see silhouette-data.ts's header comment) inside
 *  the rectangle (bx,by,bw,bh) — the one thing that guarantees the spec's
 *  "marker positions in the PDF match their on-screen positions" criterion,
 *  since both renderers scale the same normalized numbers. */
async function drawDiagramView(
  doc: jsPDF,
  view: DamageMarkerView,
  markers: readonly DamageMarker[],
  bx: number,
  by: number,
  bw: number,
  bh: number,
  fetchAsset?: AssetFetcher,
) {
  const { vbW, vbH, toX, toY } = diagramTransform(view, bx, by, bw, bh);

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.rect(bx, by, bw, bh);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(view.toUpperCase(), bx, by - 1.5);

  await drawVehicleOutline(doc, view, toX, toY, vbW, vbH, fetchAsset);

  for (const m of markers) {
    if (m.view !== view) continue;
    const cx = toX(m.x * vbW);
    const cy = toY(m.y * vbH);
    // Sized for the two-row Left/Right (large) + Front/Rear/Top (smaller)
    // grid drawDiagramView's callers use — briefly shrunk to 1.8 during a
    // one-row-of-5 layout that made everything ~half this width (operator
    // reverted that layout back to this bigger one, 2026-09-19); restored
    // alongside it rather than left proportioned for boxes that no longer
    // exist.
    const r = 2.6;
    doc.setFillColor(...RED);
    doc.setDrawColor(...WHITE);
    doc.setLineWidth(0.3);
    // Shape-coded by severity, same as the screen — the report may be
    // printed in greyscale, so colour alone can't carry this.
    if (m.severity === "minor") {
      doc.circle(cx, cy, r, "FD");
    } else if (m.severity === "moderate") {
      strokePolygon(
        doc,
        [
          [cx, cy - r],
          [cx + r * 0.95, cy + r * 0.7],
          [cx - r * 0.95, cy + r * 0.7],
        ],
        "FD",
      );
    } else {
      strokePolygon(
        doc,
        [
          [cx, cy - r],
          [cx + r, cy],
          [cx, cy + r],
          [cx - r, cy],
        ],
        "FD",
      );
    }
    // Properly cap-height-centred on the baseline, not a guessed fixed
    // offset — jsPDF's y coordinate is the text baseline, so a plain "cy"
    // (or the rough hand-picked constant this used before) sits visibly low
    // inside the circle. Same CAP_HEIGHT_RATIO conversion badge() above
    // already uses for the identical problem.
    const markerFontSize = 4.5;
    const markerCapH = markerFontSize * CAP_HEIGHT_RATIO * 0.3528;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(markerFontSize);
    doc.setTextColor(...WHITE);
    doc.text(String(m.seq), cx, cy + markerCapH / 2, { align: "center" });
  }
}

interface ReportTableColumn {
  label: string;
  width: number;
  /** Right-aligns both the header label and every cell in this column
   *  against its right edge (width - 2mm inset, matching the column's own
   *  left inset) — for a price/amount column, so it reads like every other
   *  invoice-style table in this file instead of ragging left. */
  align?: "right";
}

/** Small hand-rolled table — no jspdf-autotable dependency, same DIY
 *  approach as every other layout primitive in this file. Repeats the
 *  header row if the table spans a page break. */
function drawTable(
  doc: jsPDF,
  y: number,
  columns: ReportTableColumn[],
  rows: { cells: string[]; highlight?: boolean }[],
  rowH = 7,
): number {
  const headerFontSize = rowH >= 7 ? 7 : 6;
  const cellFontSize = rowH >= 7 ? 7.5 : 6.5;
  const textBaseline = rowH - (rowH >= 7 ? 2.3 : 1.8);
  function header(yy: number): number {
    doc.setFillColor(...CHARCOAL);
    doc.rect(ML, yy, CW, rowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(headerFontSize);
    doc.setTextColor(...WHITE);
    let cx = ML + 2;
    for (const col of columns) {
      if (col.align === "right") {
        doc.text(col.label.toUpperCase(), cx + col.width - 4, yy + textBaseline, {
          align: "right",
        });
      } else {
        doc.text(col.label.toUpperCase(), cx, yy + textBaseline);
      }
      cx += col.width;
    }
    return yy + rowH;
  }
  y = ensureSpace(doc, y, rowH * 2);
  y = header(y);
  rows.forEach((row, i) => {
    if (y + rowH > PAGE_BOTTOM) {
      y = newPage(doc);
      y = header(y);
    }
    doc.setFillColor(
      ...(row.highlight
        ? ([254, 226, 226] as [number, number, number])
        : i % 2 === 0
          ? WHITE
          : ROW_ALT),
    );
    doc.rect(ML, y, CW, rowH, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(cellFontSize);
    doc.setTextColor(...CHARCOAL);
    let cx = ML + 2;
    row.cells.forEach((cell, ci) => {
      const col = columns[ci];
      const lines = doc.splitTextToSize(cell, col.width - 4);
      if (col.align === "right") {
        doc.text(lines[0] ?? "", cx + col.width - 4, y + textBaseline, { align: "right" });
      } else {
        doc.text(lines[0] ?? "", cx, y + textBaseline);
      }
      cx += col.width;
    });
    y += rowH;
  });
  rule(doc, y + 1);
  return y + (rowH >= 7 ? 7 : 5);
}

export interface InspectionReportResult {
  url: string;
  storagePath: string;
  version: number;
}

/**
 * Builds the inspection report PDF (all layout, no Storage/Firestore I/O
 * beyond read-only photo fetches) and returns the finished jsPDF doc plus
 * the version number it was built for. Split out from
 * generateInspectionReportPDF() below so a script running under the Admin
 * SDK (which can't use the client `storage`/uploadBytes/getDownloadURL this
 * file otherwise imports) can produce byte-identical output without
 * duplicating ~300 lines of layout code — see
 * scripts/regenerate-inspection-report.ts.
 *
 * Redesigned 2026-09-19 (operator request) to a fixed 4-section shape aimed
 * at fitting one page (two at worst): Customer & Vehicle -> Vehicle
 * Inspection (diagram + marked points) -> Quote -> footer. Everything the
 * previous version also printed (paint history, interior condition, systems
 * check, inventory, customer priority/scope) is intentionally dropped from
 * this document — still fully captured on the Inspection record itself and
 * visible in the app, just not in this printout, which now exists to be a
 * short customer-facing summary rather than the full internal record. No
 * signature/remote-ack section either (operator-requested, 2026-09-18 — see
 * inspection.ts); a version built for an inspection signed before that
 * change simply won't have one to redraw.
 *
 * Takes `job` alongside the Inspection purely for the Quote section — price
 * lives on Job (job.services / the legacy single serviceName+price), not on
 * Inspection at all.
 *
 * `fetchAsset` overrides how the diagram's commissioned artwork PNGs get
 * loaded — defaults to the browser implementation (relative fetch +
 * <canvas> downscale). A script running under Node has neither; rather than
 * branch on environment inside this file (see fetchPublicAssetDataUrl's own
 * comment on why not — the short version: this file is reachable from
 * server-rendered routes, and a literal `import("sharp")` here risks this
 * repo's Rolldown-based bundler trying to inline a native binary addon),
 * scripts/regenerate-inspection-report.ts supplies its own Node/sharp-backed
 * fetcher through this param instead.
 */
export async function buildInspectionReportDoc(
  inspection: Inspection,
  job: Pick<Job, "services" | "serviceName" | "price">,
  fetchAsset?: AssetFetcher,
): Promise<{ doc: jsPDF; version: number }> {
  const version = (inspection.documents?.report?.version ?? 0) + 1;

  const photoNumbers = new Map<string, number>(inspection.photos.map((p, i) => [p.id, i + 1]));

  // Every image this report needs, fetched in parallel before laying out a
  // single page — addImage() is synchronous, so all bytes must already be
  // in hand once drawing starts.
  const photoDataUrls = new Map<string, string | null>(
    await Promise.all(
      inspection.photos.map(
        async (p) => [p.id, await fetchDataUrl(p.storagePath, "image/jpeg")] as const,
      ),
    ),
  );

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let y = 0;

  // ── 1. Header ─────────────────────────────────────────────────────────────
  doc.setFillColor(...CHARCOAL);
  doc.rect(0, 0, PW, 42, "F");
  const LOGO_BOX = 15;
  drawLogo(doc, ML, 5, LOGO_BOX);
  const TX = ML + LOGO_BOX + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...WHITE);
  doc.text(getBusinessInfo().trading.toUpperCase(), TX, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 200, 200);
  doc.text("Vehicle Inspection Report", TX, 22);
  drawHeaderContact(doc, TX, 28);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...WHITE);
  doc.text("INSPECTION REPORT", MR, 16, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 220, 220);
  doc.text(`Job:  ${inspection.jobRef}`, MR, 23, { align: "right" });
  doc.text(`Inspected:  ${formatDateTimeInColombo(inspection.inspectedAt)}`, MR, 28.5, {
    align: "right",
  });
  doc.text(`Inspector:  ${inspection.inspectedByName}`, MR, 34, { align: "right" });

  y = 52;

  // ── A. Customer & Vehicle — one compact card (name/status, contact/
  // vehicle/VIN on one line, then a 5-up mileage/fuel/warning-lights/starts/
  // keys strip) rather than the two separate sections this used to be split
  // across. No black section-title bar here on purpose — it's the report's
  // lede, not a numbered section, so it reads as a header sub-block instead
  // of another chapter. ─────────────────────────────────────────────────────
  const v = inspection.vehicleSnapshot;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...CHARCOAL);
  doc.text(inspection.customerSnapshot.name, ML, y);
  const statusBadge = inspection.status.toUpperCase().replace(/_/g, " ");
  badge(doc, statusBadge, MR - doc.getTextWidth(statusBadge) - 8, y - 3.5, CHARCOAL);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE);
  const vehicleLine = [v.year, v.make, v.model].filter(Boolean).join(" ");
  const summaryLine = [
    inspection.customerSnapshot.phone || "—",
    [vehicleLine, v.plate, v.colour, v.bodyType].filter(Boolean).join(" · "),
    inspection.vin ? `VIN ${inspection.vin}` : null,
  ]
    .filter(Boolean)
    .join("    ·    ");
  doc.text(summaryLine, ML, y);
  y += 8;

  const baseline: [BaselineIconKind, string, string][] = [
    ["mileage", "Mileage", `${inspection.odometer} km`],
    ["fuel", "Fuel Level", FUEL_LABELS_PDF[inspection.fuelLevel] ?? inspection.fuelLevel],
    [
      "warning",
      "Warning Lights",
      inspection.warningLights.length ? inspection.warningLights.join(", ") : "None",
    ],
    ["starts", "Starts Normally", inspection.startsNormally ? "Yes" : "No"],
    ["keys", "Keys Handed Over", String(inspection.keysHandedOver)],
  ];
  const baselineColW = CW / baseline.length;
  const baselineIconR = 3;
  const baselineIconCy = y + baselineIconR + 1;
  baseline.forEach(([kind, label, value], i) => {
    const colX = ML + i * baselineColW;
    drawBaselineIcon(doc, kind, colX + baselineIconR + 1, baselineIconCy, baselineIconR);
    jobField(doc, colX, baselineIconCy + baselineIconR + 6, baselineColW - 4, label, value);
  });
  y = baselineIconCy + baselineIconR + 6 + 5 + 3;

  if (inspection.knownIssues) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("CUSTOMER-DECLARED ISSUES", ML, y);
    y += 4.2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE);
    const lines = doc.splitTextToSize(inspection.knownIssues, CW);
    doc.text(lines, ML, y);
    y += lines.length * 4.2 + 2;
  }
  y += 3;
  rule(doc, y);
  y += 8;

  // ── B. Vehicle Inspection — the diagram (Left/Right large on their own
  // row, Front/Rear/Top smaller on the row below). Scaled to ~78% of the
  // full content width, centred, rather than full-bleed (operator request,
  // 2026-09-19 — the full-width version pushed Quote onto a second page;
  // this size still reads as "the big two-row grid", just small enough for
  // everything to fit on one page) plus a terse legend of the numbered
  // points marked on it. Paint history/interior condition/systems/
  // inventory/customer priority all used to live in their own sections
  // after this one; all dropped now (see this function's header comment)
  // so this stays the report's one visual/data section instead of a long
  // scroll of mostly-empty ones. ────────────────────────────────────────
  y = sectionTitle(doc, y, "Vehicle Inspection");
  y = ensureSpace(doc, y, 50);
  const diagramGap = 4;
  const diagramScale = 0.78;
  const diagramW = CW * diagramScale;
  const diagramX0 = ML + (CW - diagramW) / 2;
  const bigW = (diagramW - diagramGap) / 2;
  const bigH = bigW * (180 / 400);
  await drawDiagramView(
    doc,
    "left",
    inspection.damageMarkers,
    diagramX0,
    y,
    bigW,
    bigH,
    fetchAsset,
  );
  await drawDiagramView(
    doc,
    "right",
    inspection.damageMarkers,
    diagramX0 + bigW + diagramGap,
    y,
    bigW,
    bigH,
    fetchAsset,
  );
  y += bigH + 8;
  const smallW = (diagramW - diagramGap * 2) / 3;
  const smallHFrontRear = smallW * (180 / 260);
  const smallHTop = smallW * (200 / 400);
  await drawDiagramView(
    doc,
    "front",
    inspection.damageMarkers,
    diagramX0,
    y,
    smallW,
    smallHFrontRear,
    fetchAsset,
  );
  await drawDiagramView(
    doc,
    "rear",
    inspection.damageMarkers,
    diagramX0 + smallW + diagramGap,
    y,
    smallW,
    smallHFrontRear,
    fetchAsset,
  );
  await drawDiagramView(
    doc,
    "top",
    inspection.damageMarkers,
    diagramX0 + (smallW + diagramGap) * 2,
    y,
    smallW,
    smallHTop,
    fetchAsset,
  );
  y += Math.max(smallHFrontRear, smallHTop) + 8;

  if (inspection.damageMarkers.length > 0) {
    const sorted = [...inspection.damageMarkers].sort((a, b) => a.seq - b.seq);
    y = drawTable(
      doc,
      y,
      [
        { label: "#", width: 8 },
        { label: "View", width: 16 },
        { label: "Type", width: 26 },
        { label: "Severity", width: 20 },
        { label: "Note", width: CW - 8 - 16 - 26 - 20 },
      ],
      sorted.map((m) => ({
        cells: [
          String(m.seq),
          m.view,
          MARKER_TYPE_LABELS_PDF[m.type],
          SEVERITY_LABELS_PDF[m.severity],
          m.note || "—",
        ],
      })),
      5,
    );
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text("No damage markers recorded.", ML, y);
    y += 8;
  }

  // Photos, when there are any (photo capture is off store-wide right now —
  // PHOTO_CAPTURE_ENABLED in inspection.ts — so this is normally skipped
  // entirely rather than printing an empty appendix). Folded into this same
  // section, not a separate one, since it's still "the pics."
  if (inspection.photos.length > 0) {
    y += 2;
    const THUMB = 30;
    const THUMB_GAP = 4;
    const perRow = Math.max(1, Math.floor((CW + THUMB_GAP) / (THUMB + THUMB_GAP)));
    let col = 0;
    for (const photo of inspection.photos) {
      if (col === 0) y = ensureSpace(doc, y, THUMB + 8);
      const cellX = ML + col * (THUMB + THUMB_GAP);
      const url = photoDataUrls.get(photo.id);
      doc.setDrawColor(...RULE);
      doc.rect(cellX, y, THUMB, THUMB);
      if (url) {
        try {
          doc.addImage(url, "JPEG", cellX, y, THUMB, THUMB);
        } catch {
          // corrupt/unsupported image data — leave the empty frame
        }
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(...MUTED);
      doc.text(`#${photoNumbers.get(photo.id)}`, cellX, y + THUMB + 3, { maxWidth: THUMB });
      col++;
      if (col >= perRow) {
        col = 0;
        y += THUMB + 8;
      }
    }
    if (col !== 0) y += THUMB + 8;
  }
  y += 6;

  // ── C. Quote — the service(s) and price this inspection feeds into.
  // Lives on Job, not Inspection, so it's passed in separately (see this
  // function's header comment). Falls back to Job's legacy single
  // serviceName/price when `services` is absent (an inspection signed
  // before the multi-service intake change, 2026-09-18). ───────────────────
  y = sectionTitle(doc, y, "Quote");
  const quoteLines =
    job.services && job.services.length > 0
      ? job.services
      : [{ name: job.serviceName || "—", price: job.price }];
  y = drawTable(
    doc,
    y,
    [
      { label: "Service", width: CW - 40 },
      { label: "Price", width: 40, align: "right" },
    ],
    quoteLines.map((line) => ({ cells: [line.name, fmt(line.price)] })),
    6,
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...CHARCOAL);
  doc.text("TOTAL", ML, y + 5);
  doc.text(fmt(job.price), RCOL, y + 5, { align: "right" });
  y += 10;

  // ── Footer + page numbers, stamped on every page after layout is final ──
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    rule(doc, FOOTER_Y - 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...RED);
    doc.text("POLISH STATION", ML, FOOTER_Y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`Page ${p} of ${totalPages}`, MR, FOOTER_Y, { align: "right" });
  }

  return { doc, version };
}

/**
 * Builds the inspection report PDF (via buildInspectionReportDoc above) and
 * uploads it to `jobs/{jobId}/documents/inspection-{inspectionId}-v{version}.pdf`
 * in Storage, never overwriting an earlier version. Browser-only (uses the
 * client `storage`/uploadBytes/getDownloadURL) — see buildInspectionReportDoc's
 * own comment for the Admin-SDK equivalent.
 */
export async function generateInspectionReportPDF(
  inspection: Inspection,
  job: Pick<Job, "services" | "serviceName" | "price">,
): Promise<InspectionReportResult> {
  const { doc, version } = await buildInspectionReportDoc(inspection, job);
  const storagePath = `jobs/${inspection.jobId}/documents/inspection-${inspection.id}-v${version}.pdf`;
  const blob = doc.output("blob");
  const fileRef = storageRef(storage, storagePath);
  await uploadBytes(fileRef, blob, { contentType: "application/pdf" });
  const url = await getDownloadURL(fileRef);

  return { url, storagePath, version };
}

// ─── One-page A4 inspection summary sheet ──────────────────────────────────
//
// SAMPLE / DESIGN STAGE — not wired to live sign-off yet. Per the spec this
// was built against: "Show the layout as a rendered sample PDF with
// realistic data for approval before wiring it to live records." This
// function renders and returns the jsPDF doc only; nothing here uploads to
// Storage, touches the Inspection schema, or is called from the sign-off
// flow. generateInspectionReportPDF() above is untouched and keeps its
// current role (it becomes the "evidence pack" per the spec's §7 once that
// split is approved and wired up — its content already matches what §7
// describes almost exactly: full damage table, full photo appendix,
// systems/inventory/paint-history detail).
//
// Deliberately a separate set of layout constants (12mm margin, its own
// page-bottom) rather than reusing ML/MR/CW/PAGE_BOTTOM above — those are
// the *multi-page* report's 16mm-margin geometry, shared with invoices/
// quotations/job cards via buildDoc(); changing them would move every other
// document in this file.
const SHEET_M = 12;
const SHEET_PW = 210;
const SHEET_MR = SHEET_PW - SHEET_M;
const SHEET_CW = SHEET_PW - SHEET_M * 2; // 186mm

// Severity shapes for this document only — circle/square/triangle per the
// spec, deliberately different from the multi-page report's circle/
// triangle/diamond above (matching MARKER_TYPE_COLOR/SEVERITY_SHAPE in
// marker-style.ts, the on-screen convention this codebase already ships).
// Not reconciling the two is a real inconsistency worth flagging at review:
// today a "severe" marker is a diamond on screen and in the evidence report,
// but a triangle here. Left as specified rather than silently overridden,
// since this whole layout is still pending approval.
function sheetStrokePolygon(doc: jsPDF, points: [number, number][], style: "S" | "F" | "FD") {
  strokePolygon(doc, points, style);
}

function sheetDrawSeverityShape(
  doc: jsPDF,
  severity: DamageMarkerSeverity,
  cx: number,
  cy: number,
  r: number,
  seq: number,
) {
  doc.setFillColor(...CHARCOAL);
  doc.setDrawColor(...WHITE);
  doc.setLineWidth(0.25);
  if (severity === "minor") {
    doc.circle(cx, cy, r, "FD");
  } else if (severity === "moderate") {
    sheetStrokePolygon(
      doc,
      [
        [cx - r, cy - r],
        [cx + r, cy - r],
        [cx + r, cy + r],
        [cx - r, cy + r],
      ],
      "FD",
    );
  } else {
    sheetStrokePolygon(
      doc,
      [
        [cx, cy - r * 1.15],
        [cx + r * 1.05, cy + r * 0.75],
        [cx - r * 1.05, cy + r * 0.75],
      ],
      "FD",
    );
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.2);
  doc.setTextColor(...WHITE);
  doc.text(String(seq), cx, cy + 1, { align: "center" });
}

/** Redraws one silhouette view scaled into (bx,by,bw,bh), same geometry
 *  source as drawDiagramView() above (silhouette-data.ts) so marker
 *  positions still match the on-screen diagram exactly — only the marker
 *  shape-per-severity convention differs (see sheetDrawSeverityShape). */
async function sheetDrawDiagramView(
  doc: jsPDF,
  view: DamageMarkerView,
  markers: readonly DamageMarker[],
  bx: number,
  by: number,
  bw: number,
  bh: number,
  label: string,
) {
  const { vbW, vbH, toX, toY } = diagramTransform(view, bx, by, bw, bh);

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.rect(bx, by, bw, bh);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.setTextColor(...MUTED);
  doc.text(label, bx + 1, by + 3.5);

  await drawVehicleOutline(doc, view, toX, toY, vbW, vbH);

  for (const m of markers) {
    if (m.view !== view) continue;
    sheetDrawSeverityShape(doc, m.severity, toX(m.x * vbW), toY(m.y * vbH), 2.4, m.seq);
  }
}

/** Compact table for the damage zone — the multi-page report's drawTable()
 *  uses a fixed 7mm row height (fine when it can spill across pages); this
 *  document can't spill, and the spec budgets 40mm total for up to 12 rows
 *  plus a header, so rows here are ~2.6mm — a different enough shape that
 *  reusing drawTable() would mean fighting its fixed sizing rather than
 *  saving code. */
function sheetDamageTable(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  columns: { label: string; width: number }[],
  rows: string[][],
): number {
  const rowH = 2.4;
  doc.setFillColor(...CHARCOAL);
  doc.rect(x, y, w, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.setTextColor(...WHITE);
  let cx = x + 1.5;
  for (const col of columns) {
    doc.text(col.label.toUpperCase(), cx, y + 2.2);
    cx += col.width;
  }
  y += 3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  rows.forEach((cells, i) => {
    if (i % 2 === 1) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(x, y, w, rowH, "F");
    }
    doc.setTextColor(...CHARCOAL);
    let cxx = x + 1.5;
    cells.forEach((cell, ci) => {
      const col = columns[ci];
      const lines = doc.splitTextToSize(cell, col.width - 2);
      doc.text(lines[0] ?? "", cxx, y + rowH - 0.7);
      cxx += col.width;
    });
    y += rowH;
  });
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.rect(x, y - rows.length * rowH - 3, w, rows.length * rowH + 3, "S");
  return y;
}

/** Vector-drawn state glyph — never colour, never a text character. jsPDF's
 *  core Helvetica is WinAnsi/Standard-encoded and cannot render ✓/✗ (they
 *  came out as a stray apostrophe in the first render of this layout);
 *  there's no bundled Unicode font in this pipeline to fall back on, so the
 *  correct fix is drawing the marks as line strokes the same way severity
 *  shapes already are, not swapping in some other text character and
 *  hoping it exists in the font's 256-glyph table. `x,y` is the glyph's
 *  vertical-center-left anchor, matching where a text baseline would sit. */
function sheetDrawStateGlyph(
  doc: jsPDF,
  state: "present" | "absent" | "na" | "working" | "faulty" | "not_tested",
  x: number,
  y: number,
) {
  doc.setDrawColor(...CHARCOAL);
  doc.setLineWidth(0.35);
  if (state === "present" || state === "working") {
    doc.line(x, y - 0.3, x + 0.7, y + 0.6);
    doc.line(x + 0.7, y + 0.6, x + 2, y - 1.1);
  } else if (state === "absent" || state === "faulty") {
    doc.line(x, y - 1, x + 1.6, y + 0.6);
    doc.line(x, y + 0.6, x + 1.6, y - 1);
  } else {
    doc.line(x, y - 0.3, x + 1.6, y - 0.3); // na / not_tested
  }
}

export interface InspectionSummarySheetOptions {
  /** New field per the redesign spec — a short, human-readable document id
   *  (e.g. "PS-0501-INS-01"). Not yet a schema field (see the module note
   *  above); passed in until the sample layout is approved and this
   *  actually lands on Inspection. */
  documentId: string;
  /** Option A/B from the spec, or a caller-supplied final wording — kept as
   *  a parameter rather than a second constant so this function has
   *  exactly one place that decides the printed disclaimer, per §6's
   *  "single configurable constant" requirement; inspection-sheet.tsx's
   *  on-screen disclaimer is the other reader of that same constant. */
  disclaimerText: string;
}

/**
 * Renders the one-page A4 inspection summary sheet per the redesign spec.
 * Pure layout function: takes an Inspection (+ the options above) and
 * returns the built jsPDF doc. No Storage upload, no photo/signature
 * fetches (this document never renders photos or signature images — see
 * §6: those fields stay on the schema but stop being rendered here), no
 * side effects at all. Callers decide what to do with the result
 * (doc.save(), doc.output("blob") + upload, etc.).
 *
 * Zone budget (originally had to total exactly 273mm between the 12mm top/
 * bottom margins per the spec's §2 table; H no longer fills its 25mm since
 * a later review round dropped the sign-off row and QR code — inspector/
 * date moved up into the header instead — leaving the zone as disclaimer
 * text plus trailing whitespace above the footer):
 *   A Header 18 · B Parties/vehicle 24 · C Intake 14 · D Diagram 88 ·
 *   E Damage table 40 · F Inventory/systems 48 · G Condition/priority 16 ·
 *   H Disclaimer 25
 */
export async function generateInspectionSummarySheetPDF(
  inspection: Inspection,
  options: InspectionSummarySheetOptions,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const v = inspection.vehicleSnapshot;
  let y = SHEET_M;

  // ── Zone A — Header (18mm budget: y=12→30, bar bleeds to the page edge —
  // same charcoal-bar-with-logo language as the multi-page report's header,
  // kept to this budget's existing 30mm so every zone below is unaffected) ─
  const HEADER_H = SHEET_M + 18; // 30 — bar bottom edge; content still starts here
  doc.setFillColor(...CHARCOAL);
  doc.rect(0, 0, SHEET_PW, HEADER_H, "F");
  const LOGO_BOX = 14;
  drawLogo(doc, SHEET_M, 8, LOGO_BOX);
  const TX = SHEET_M + LOGO_BOX + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.text(getBusinessInfo().trading.toUpperCase(), TX, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(255, 200, 200);
  doc.text("Vehicle Inspection Sheet", TX, 21);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...WHITE);
  doc.text("INSPECTION SHEET", SHEET_MR, 13, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(255, 220, 220);
  doc.text(`Ref: ${options.documentId}`, SHEET_MR, 18, { align: "right" });
  // Inspector + date moved up here from the old sign-off row at the bottom
  // of the sheet, which this redesign removed.
  doc.text(`Inspected by: ${inspection.inspectedByName}`, SHEET_MR, 22.5, { align: "right" });
  doc.text(formatDateTimeInColombo(inspection.inspectedAt), SHEET_MR, 27, { align: "right" });
  y = HEADER_H;

  // ── Zone B — Parties & vehicle (24mm: y=30→54) ──────────────────────────
  const halfW = (SHEET_CW - 6) / 2;
  const rightColX = SHEET_M + halfW + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text("CUSTOMER", SHEET_M, y + 4);
  doc.text("VEHICLE", rightColX, y + 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...CHARCOAL);
  doc.text(
    doc.splitTextToSize(inspection.customerSnapshot.name, halfW - 2)[0] ?? "—",
    SHEET_M,
    y + 10,
  );
  const vehicleTitle = [v.year, v.make, v.model].filter(Boolean).join(" ") || "—";
  doc.text(doc.splitTextToSize(vehicleTitle, halfW - 2)[0] ?? "—", rightColX, y + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...SLATE);
  doc.text(`Phone: ${inspection.customerSnapshot.phone || "—"}`, SHEET_M, y + 16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...CHARCOAL);
  doc.text(v.plate || "—", rightColX, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...SLATE);
  doc.text(`Colour: ${v.colour || "—"}`, rightColX + doc.getTextWidth(v.plate || "—") + 4, y + 16);
  const chassisLine = inspection.vin ? `Chassis/VIN: ${inspection.vin}` : "Chassis/VIN: —";
  doc.text(chassisLine, rightColX, y + 21);
  y += 24;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.line(SHEET_M, y - 2, SHEET_MR, y - 2);

  // ── Zone C — Intake baseline (14mm: y=54→68) ────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...CHARCOAL);
  const intakeLine1 = `ODOMETER: ${inspection.odometer.toLocaleString()} km      KEYS: ${inspection.keysHandedOver}      STARTS NORMALLY: ${inspection.startsNormally ? "Yes" : "No"}`;
  doc.text(intakeLine1, SHEET_M, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...SLATE);
  const warningLine = `Warning lights: ${inspection.warningLights.length ? inspection.warningLights.join(", ").replace(/_/g, " ") : "none"}`;
  doc.text(doc.splitTextToSize(warningLine, SHEET_CW - 44)[0] ?? "", SHEET_M, y + 9.5);
  // Fuel gauge — 4 segments, E→F, shaded left-to-right per FUEL_LEVELS order.
  const FUEL_ORDER = ["E", "quarter", "half", "three_quarter", "F"];
  const filledSegments = FUEL_ORDER.indexOf(inspection.fuelLevel); // 0..4
  const segW = 6.5;
  const segH = 5;
  const gaugeX = SHEET_MR - segW * 4 - 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(...MUTED);
  doc.text("E", gaugeX - 3.5, y + 8.2);
  doc.text("F", gaugeX + segW * 4 + 2, y + 8.2);
  for (let i = 0; i < 4; i++) {
    const sxPos = gaugeX + i * segW;
    doc.setDrawColor(...CHARCOAL);
    doc.setLineWidth(0.25);
    if (i < filledSegments) doc.setFillColor(...CHARCOAL);
    else doc.setFillColor(...WHITE);
    doc.rect(sxPos, y + 4, segW - 0.8, segH, i < filledSegments ? "FD" : "S");
  }
  y += 14;
  doc.setDrawColor(...RULE);
  doc.line(SHEET_M, y - 2, SHEET_MR, y - 2);

  // ── Zone D — Diagram (88mm: y=68→156, incl. 6mm legend strip) ───────────
  const zoneDTop = y;
  const diagH = 82;
  const legendH = 6;
  const gap = 3;
  const leftW = 118;
  const rightW = SHEET_CW - leftW - gap;
  const frH = 38;
  const frW = (leftW - gap) / 2;
  await sheetDrawDiagramView(
    doc,
    "front",
    inspection.damageMarkers,
    SHEET_M,
    zoneDTop,
    frW,
    frH,
    "FRONT",
  );
  await sheetDrawDiagramView(
    doc,
    "rear",
    inspection.damageMarkers,
    SHEET_M + frW + gap,
    zoneDTop,
    frW,
    frH,
    "REAR",
  );
  // Two gaps needed here (row1→row2, row2→row3), not one — this being `gap`
  // instead of `gap * 2` was the bug that let the legend strip below
  // overlap the right-profile box (both computed against the same 88mm
  // budget, but this one silently ran 3mm over it).
  const profileH = (diagH - frH - gap * 2) / 2;
  await sheetDrawDiagramView(
    doc,
    "left",
    inspection.damageMarkers,
    SHEET_M,
    zoneDTop + frH + gap,
    leftW,
    profileH,
    "LEFT PROFILE",
  );
  await sheetDrawDiagramView(
    doc,
    "right",
    inspection.damageMarkers,
    SHEET_M,
    zoneDTop + frH + gap + profileH + gap,
    leftW,
    profileH,
    "RIGHT PROFILE",
  );
  await sheetDrawDiagramView(
    doc,
    "top",
    inspection.damageMarkers,
    SHEET_M + leftW + gap,
    zoneDTop,
    rightW,
    diagH,
    "TOP",
  );
  // Legend strip
  const legendY = zoneDTop + diagH + 2;
  let lx = SHEET_M;
  const legendEntries: [DamageMarkerSeverity, string][] = [
    ["minor", "Minor"],
    ["moderate", "Moderate"],
    ["severe", "Severe"],
  ];
  for (const [sev, label] of legendEntries) {
    sheetDrawSeverityShape(doc, sev, lx + 2, legendY + 1.8, 2, 0);
    // Reset after sheetDrawSeverityShape — it leaves the font/colour state
    // set to bold white 4.2pt (for the number inside the shape), which
    // otherwise silently makes this label white-on-white and invisible.
    // The first render of this layout had exactly that: shapes with no
    // visible "Minor"/"Moderate"/"Severe" text next to them.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...SLATE);
    doc.text(label, lx + 5, legendY + 2.6);
    lx += 28;
  }
  y = zoneDTop + diagH + legendH;

  // ── Zone E — Damage table (40mm: y=156→196) ─────────────────────────────
  // A compact 3mm title bar, not the shared ensureSheetSection()'s 4.5mm+gap
  // — at 12 rows this zone is already tight (12 rows leaves under 1mm of
  // slack for the overflow footnote), so every mm of header overhead here
  // was coming straight out of row budget. This is what the first render's
  // 12th row bled into zone F's header for.
  doc.setFillColor(...CHARCOAL);
  doc.rect(SHEET_M, y, SHEET_CW, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.setTextColor(...WHITE);
  doc.text("DAMAGE DETAIL", SHEET_M + 2, y + 2.2);
  y += 3;
  const MAX_ROWS = 12;
  const severityRank: Record<DamageMarkerSeverity, number> = { severe: 0, moderate: 1, minor: 2 };
  const bySeverity = [...inspection.damageMarkers].sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity] || a.seq - b.seq,
  );
  const shown = bySeverity.slice(0, MAX_ROWS).sort((a, b) => a.seq - b.seq);
  if (shown.length > 0) {
    y = sheetDamageTable(
      doc,
      SHEET_M,
      y,
      SHEET_CW,
      [
        { label: "#", width: 8 },
        { label: "View", width: 18 },
        { label: "Type", width: 28 },
        { label: "Severity", width: 20 },
        { label: "Note", width: SHEET_CW - 8 - 18 - 28 - 20 },
      ],
      shown.map((m) => [
        String(m.seq),
        m.view,
        MARKER_TYPE_LABELS_PDF[m.type],
        SEVERITY_LABELS_PDF[m.severity],
        (m.note || "—").slice(0, 45),
      ]),
    );
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text("No damage recorded.", SHEET_M, y + 4);
    y += 6;
  }
  if (inspection.damageMarkers.length > MAX_ROWS) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    doc.text(
      `${MAX_ROWS} of ${inspection.damageMarkers.length} recorded defects shown — full record via QR.`,
      SHEET_M,
      y + 3,
    );
  }

  // ── Zone F — Inventory & systems (48mm: y=196→244) ──────────────────────
  type GlyphState = "present" | "absent" | "na" | "working" | "faulty" | "not_tested";
  const zoneFTop = SHEET_M + 18 + 24 + 14 + 88 + 40; // fixed budget boundary, not `y` — keeps zone F pinned even if E ran short
  doc.setFillColor(...CHARCOAL);
  doc.rect(SHEET_M, zoneFTop, SHEET_CW, 4.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(...WHITE);
  doc.text("INVENTORY & SYSTEMS", SHEET_M + 2, zoneFTop + 3.2);
  // The legend's own three marks are drawn (not typed) for the same reason
  // every glyph below is — see sheetDrawStateGlyph's comment.
  let legendKeyX = SHEET_MR - 2;
  const legendKeyParts: [GlyphState, string][] = [
    ["na", "n/a"],
    ["absent", "absent/faulty"],
    ["present", "present/working"],
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(...WHITE);
  for (const [state, label] of legendKeyParts) {
    legendKeyX -= doc.getTextWidth(label);
    doc.text(label, legendKeyX, zoneFTop + 3.2);
    legendKeyX -= 3.5;
    doc.setDrawColor(...WHITE);
    sheetDrawStateGlyph(doc, state, legendKeyX - 2, zoneFTop + 2.9);
    legendKeyX -= 5;
  }
  const fCols = 3;
  const fColW = (SHEET_CW - 4) / fCols;
  const fBodyTop = zoneFTop + 6;
  const fLineH = 3.1;
  function drawChecklist(
    colX: number,
    top: number,
    title: string,
    entries: [GlyphState, string][],
  ) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    doc.text(title, colX, top);
    let ly = top + fLineH;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    for (const [state, label] of entries) {
      sheetDrawStateGlyph(doc, state, colX, ly - 0.8);
      doc.setTextColor(...SLATE);
      doc.text(doc.splitTextToSize(label, fColW - 6)[0] ?? label, colX + 4, ly);
      ly += fLineH;
    }
    return ly;
  }
  const inventoryEntries: [GlyphState, string][] = inspection.inventoryItems
    .filter((it) => it.state !== "na")
    .map((it) => [it.state, it.key.replace(/_/g, " ")]);
  const systemsEntries: [GlyphState, string][] = inspection.systemsCheck
    .filter((s) => s.state !== "not_tested")
    .map((s) => [s.state, s.key.replace(/_/g, " ")]);
  const flagEntries: [GlyphState, string][] = inspection.conditionFlags.map((f) => [
    "absent",
    f.replace(/_/g, " "),
  ]);
  drawChecklist(SHEET_M, fBodyTop, "LOOSE ITEMS", inventoryEntries);
  drawChecklist(SHEET_M + fColW + 2, fBodyTop, "SYSTEMS CHECKED", systemsEntries);
  drawChecklist(
    SHEET_M + (fColW + 2) * 2,
    fBodyTop,
    "CONDITION FLAGS",
    flagEntries.length ? flagEntries : [["na", "none noted"]],
  );

  // ── Zone G — Condition & priority (16mm: y=244→260) ─────────────────────
  const zoneGTop = zoneFTop + 48;
  doc.setDrawColor(...RULE);
  doc.line(SHEET_M, zoneGTop - 1, SHEET_MR, zoneGTop - 1);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text("CUSTOMER PRIORITY", SHEET_M, zoneGTop + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...CHARCOAL);
  const priorityText = inspection.customerPriority || "—";
  const priorityLines = doc.splitTextToSize(priorityText, SHEET_CW);
  doc.text(priorityLines[0] + (priorityLines.length > 1 ? "…" : ""), SHEET_M, zoneGTop + 9);

  // ── Zone H — Disclaimer (25mm budget: y=260→285) ────────────────────────
  // Sign-off row (inspector/date lines + signature rules) and the QR block
  // were removed per review — inspector + date now live in the header
  // instead (see Zone A above).
  const zoneHTop = zoneGTop + 16;
  doc.setDrawColor(...RULE);
  doc.line(SHEET_M, zoneHTop - 1, SHEET_MR, zoneHTop - 1);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.setTextColor(...SLATE);
  const discLines = doc.splitTextToSize(options.disclaimerText, SHEET_CW).slice(0, 6);
  doc.text(discLines, SHEET_M, zoneHTop + 3, { align: "justify", maxWidth: SHEET_CW });

  // ── Footer — lives in the page's own bottom margin, below where zone H's
  // content ends, same "POLISH STATION" + page count style as the multi-page
  // report's footer for a consistent look. Manual SHEET_M/SHEET_MR line
  // rather than the shared rule() helper, which draws against the
  // multi-page report's own (different) ML/MR margins. ───────────────────
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.25);
  doc.line(SHEET_M, 290, SHEET_MR, 290);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...RED);
  doc.text("POLISH STATION", SHEET_M, 294);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text("Page 1 of 1", SHEET_MR, 294, { align: "right" });

  return doc;
}
