import jsPDF from "jspdf";
import { ref as storageRef, uploadBytes, getDownloadURL, getBytes } from "firebase/storage";
import type { Invoice, InvoiceLine, PurchaseOrder } from "./db";
import { getPayments, getAmountRefunded, getBusinessInfo } from "./db";
import { formatCurrency } from "./currency";
import { formatDate, formatDateTimeInColombo } from "./date-format";
import { LOGO_PNG_BASE64 } from "./logo-asset";
import { storage } from "./firebase";
import type { Job, BodyType } from "./job";
import {
  INSPECTION_DISCLAIMER_TEXT,
  type DamageMarker,
  type DamageMarkerSeverity,
  type DamageMarkerType,
  type DamageMarkerView,
  type Inspection,
} from "./inspection";
// Pure geometry data, no JSX — this is the one place outside the
// components/ tree that imports from it, and deliberately so: the PDF's
// damage diagram must redraw the *exact* same shapes the screen does (see
// the acceptance criterion that marker positions match on-screen exactly),
// which only holds if both renderers read the same numbers.
import {
  bodyOutlinePoints,
  profileWheelCentres,
  viewBoxSize,
} from "@/components/damage-diagram/silhouette-data";

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
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
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

/** Redraws the exact same outline/wheel/marker geometry the on-screen
 *  DamageDiagram renders (see silhouette-data.ts's header comment) inside
 *  the rectangle (bx,by,bw,bh) — the one thing that guarantees the spec's
 *  "marker positions in the PDF match their on-screen positions" criterion,
 *  since both renderers scale the same normalized numbers. */
function drawDiagramView(
  doc: jsPDF,
  bodyType: BodyType,
  view: DamageMarkerView,
  markers: readonly DamageMarker[],
  bx: number,
  by: number,
  bw: number,
  bh: number,
) {
  const [vbW, vbH] = viewBoxSize(view);
  const sx = bw / vbW;
  const sy = bh / vbH;
  const toX = (x: number) => bx + x * sx;
  const toY = (y: number) => by + y * sy;

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.rect(bx, by, bw, bh);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(view.toUpperCase(), bx, by - 1.5);

  const outline = bodyOutlinePoints(bodyType, view).map(
    ([x, y]) => [toX(x), toY(y)] as [number, number],
  );
  doc.setDrawColor(...SLATE);
  doc.setLineWidth(0.3);
  strokePolygon(doc, outline, "S");

  if (view === "left" || view === "right") {
    const [fx, rx] = profileWheelCentres(bodyType, view);
    const wr = 20 * Math.min(sx, sy);
    doc.setFillColor(210, 210, 212);
    doc.circle(toX(fx), toY(150), wr, "F");
    doc.circle(toX(rx), toY(150), wr, "F");
  }

  for (const m of markers) {
    if (m.view !== view) continue;
    const cx = toX(m.x * vbW);
    const cy = toY(m.y * vbH);
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
    doc.setFont("helvetica", "bold");
    doc.setFontSize(4.5);
    doc.setTextColor(...WHITE);
    doc.text(String(m.seq), cx, cy + 1, { align: "center" });
  }
}

interface ReportTableColumn {
  label: string;
  width: number;
}

/** Small hand-rolled table — no jspdf-autotable dependency, same DIY
 *  approach as every other layout primitive in this file. Repeats the
 *  header row if the table spans a page break. */
function drawTable(
  doc: jsPDF,
  y: number,
  columns: ReportTableColumn[],
  rows: { cells: string[]; highlight?: boolean }[],
): number {
  const rowH = 7;
  function header(yy: number): number {
    doc.setFillColor(...CHARCOAL);
    doc.rect(ML, yy, CW, rowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...WHITE);
    let cx = ML + 2;
    for (const col of columns) {
      doc.text(col.label.toUpperCase(), cx, yy + rowH - 2.3);
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
    doc.setFontSize(7.5);
    doc.setTextColor(...CHARCOAL);
    let cx = ML + 2;
    row.cells.forEach((cell, ci) => {
      const col = columns[ci];
      const lines = doc.splitTextToSize(cell, col.width - 4);
      doc.text(lines[0] ?? "", cx, y + rowH - 2.3);
      cx += col.width;
    });
    y += rowH;
  });
  rule(doc, y + 1);
  return y + 7;
}

export interface InspectionReportResult {
  url: string;
  storagePath: string;
  version: number;
}

/**
 * Builds the inspection report PDF and uploads it to
 * `jobs/{jobId}/documents/inspection-{inspectionId}-v{version}.pdf` in
 * Storage, never overwriting an earlier version (Path B produces an
 * unsigned interim copy at "send for acknowledgment", signing produces the
 * version with real signatures — see Inspection.documents.report's header
 * comment in inspection.ts). Takes only the Inspection itself: unlike the
 * job card, every field this needs (vehicle/customer snapshot, inspector
 * attribution) already lives on the document, no Job/staff-list lookup
 * required.
 */
export async function generateInspectionReportPDF(
  inspection: Inspection,
): Promise<InspectionReportResult> {
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
  const customerSigDataUrl = inspection.customerSignature
    ? await fetchDataUrl(inspection.customerSignature.storagePath, "image/png")
    : null;
  const inspectorSigDataUrl = inspection.inspectorSignature
    ? await fetchDataUrl(inspection.inspectorSignature.storagePath, "image/png")
    : null;
  const remoteAckScreenshotDataUrl = inspection.remoteAck?.screenshotPath
    ? await fetchDataUrl(inspection.remoteAck.screenshotPath, "image/jpeg")
    : null;

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
  doc.text(`Version:  ${version}`, MR, 39, { align: "right" });

  y = 52;

  // ── 2. Customer + vehicle ───────────────────────────────────────────────
  const v = inspection.vehicleSnapshot;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...CHARCOAL);
  doc.text(inspection.customerSnapshot.name, ML, y);
  const statusBadge = inspection.status.toUpperCase().replace(/_/g, " ");
  badge(doc, statusBadge, MR - doc.getTextWidth(statusBadge) - 8, y - 3.5, CHARCOAL);
  y += 5.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE);
  doc.text(`Contact:  ${inspection.customerSnapshot.phone || "—"}`, ML, y);
  y += 4.5;
  const vehicleLine = [v.year, v.make, v.model].filter(Boolean).join(" ");
  doc.text(`Vehicle:  ${vehicleLine}  ·  ${v.plate}  ·  ${v.colour}  ·  ${v.bodyType}`, ML, y);
  y += 4.5;
  if (inspection.vin) {
    doc.text(`VIN:  ${inspection.vin}`, ML, y);
    y += 4.5;
  }
  y += 3;
  rule(doc, y);
  y += 8;

  // ── 3. Intake baseline ───────────────────────────────────────────────────
  y = sectionTitle(doc, y, "Intake Baseline");
  const clusterUrl = photoDataUrls.get(inspection.odometerPhotoId) ?? null;
  const baselineTextX = clusterUrl ? ML + 45 : ML;
  const baselineTextW = clusterUrl ? CW - 45 : CW;
  if (clusterUrl) {
    try {
      doc.addImage(clusterUrl, "JPEG", ML, y, 40, 30);
    } catch {
      // corrupt/unsupported image data — omit rather than fail the whole report
    }
  }
  const baselineRows: [string, string][] = [
    ["Odometer", `${inspection.odometer} km`],
    ["Fuel level", FUEL_LABELS_PDF[inspection.fuelLevel] ?? inspection.fuelLevel],
    [
      "Warning lights",
      inspection.warningLights.length ? inspection.warningLights.join(", ") : "none",
    ],
    ["Starts normally", inspection.startsNormally ? "Yes" : "No"],
    ["Keys handed over", String(inspection.keysHandedOver)],
  ];
  let by = y;
  for (const [label, value] of baselineRows) {
    jobField(doc, baselineTextX, by + 4, baselineTextW, label, value);
    by += 9;
  }
  y = Math.max(y + 32, by) + 2;
  if (inspection.knownIssues) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("CUSTOMER-DECLARED ISSUES", ML, y);
    y += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE);
    const lines = doc.splitTextToSize(inspection.knownIssues, CW);
    doc.text(lines, ML, y);
    y += lines.length * 4.2 + 3;
  }
  y += 4;

  // ── 4. Diagram grid ──────────────────────────────────────────────────────
  y = sectionTitle(doc, y, "Damage Diagram");
  y = ensureSpace(doc, y, 60);
  const gridGap = 4;
  const bigW = (CW - gridGap) / 2;
  const bigH = bigW * (180 / 400);
  drawDiagramView(doc, v.bodyType, "left", inspection.damageMarkers, ML, y, bigW, bigH);
  drawDiagramView(
    doc,
    v.bodyType,
    "right",
    inspection.damageMarkers,
    ML + bigW + gridGap,
    y,
    bigW,
    bigH,
  );
  y += bigH + 10;
  const smallW = (CW - gridGap * 2) / 3;
  const smallHFrontRear = smallW * (180 / 260);
  const smallHTop = smallW * (200 / 400);
  drawDiagramView(
    doc,
    v.bodyType,
    "front",
    inspection.damageMarkers,
    ML,
    y,
    smallW,
    smallHFrontRear,
  );
  drawDiagramView(
    doc,
    v.bodyType,
    "rear",
    inspection.damageMarkers,
    ML + smallW + gridGap,
    y,
    smallW,
    smallHFrontRear,
  );
  drawDiagramView(
    doc,
    v.bodyType,
    "top",
    inspection.damageMarkers,
    ML + (smallW + gridGap) * 2,
    y,
    smallW,
    smallHTop,
  );
  y += Math.max(smallHFrontRear, smallHTop) + 10;

  // ── 5. Damage table ──────────────────────────────────────────────────────
  y = sectionTitle(doc, y, "Damage Detail");
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
        { label: "Note", width: CW - 8 - 16 - 26 - 20 - 24 },
        { label: "Photo", width: 24 },
      ],
      sorted.map((m) => ({
        cells: [
          String(m.seq),
          m.view,
          MARKER_TYPE_LABELS_PDF[m.type],
          SEVERITY_LABELS_PDF[m.severity],
          m.note || "—",
          m.photoIds[0] ? `#${photoNumbers.get(m.photoIds[0])}` : "—",
        ],
      })),
    );
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text("No damage markers recorded.", ML, y);
    y += 8;
  }

  // ── 6. Paint history & condition flags ──────────────────────────────────
  y = sectionTitle(doc, y, "Paint History & Condition");
  const ph = inspection.paintHistory;
  const halfW = CW / 2;
  const paintRows: [string, string][] = [
    ["Existing coating", ph.existingCoating],
    ["Coating age", ph.coatingAgeMonths != null ? `${ph.coatingAgeMonths} months` : "—"],
    ["Prior correction", String(ph.priorCorrection)],
    ["Resprayed panels", ph.resprayedPanels.length ? ph.resprayedPanels.join(", ") : "None"],
    ["Wrap / PPF", ph.wrapOrPpf ? "Yes" : "No"],
  ];
  by = y;
  paintRows.forEach(([l, val], i) => {
    jobField(doc, i % 2 === 0 ? ML : ML + halfW, by + 4, halfW - 4, l, val);
    if (i % 2 === 1) by += 9;
  });
  if (paintRows.length % 2 === 1) by += 9;
  y = by + 2;
  if (inspection.conditionFlags.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("CONDITION FLAGS", ML, y);
    y += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE);
    doc.text(inspection.conditionFlags.join(", ").replace(/_/g, " "), ML, y);
    y += 6;
  }
  y += 3;

  // ── 7. Interior condition ────────────────────────────────────────────────
  y = sectionTitle(doc, y, "Interior Condition");
  const ic = inspection.interiorCondition;
  const interiorFlags =
    [
      ic.stains && "Stains",
      ic.tears && "Tears",
      ic.burns && "Burns",
      ic.trimDamage && "Trim damage",
      ic.headlinerStains && "Headliner stains",
    ]
      .filter(Boolean)
      .join(", ") || "None noted";
  by = y;
  jobField(doc, ML, by + 4, halfW - 4, "Material", ic.material);
  jobField(
    doc,
    ML + halfW,
    by + 4,
    halfW - 4,
    "Odours",
    ic.odours.length ? ic.odours.join(", ") : "None",
  );
  by += 9;
  jobField(doc, ML, by + 4, CW, "Condition", interiorFlags);
  y = by + 13;

  // ── 8. Systems check ─────────────────────────────────────────────────────
  y = sectionTitle(doc, y, "Systems Check");
  if (inspection.systemsCheck.length > 0) {
    y = drawTable(
      doc,
      y,
      [
        { label: "System", width: 55 },
        { label: "State", width: 30 },
        { label: "Note", width: CW - 85 },
      ],
      inspection.systemsCheck.map((s) => ({
        cells: [s.key.replace(/_/g, " "), s.state.replace(/_/g, " "), s.note || "—"],
        highlight: s.state === "faulty",
      })),
    );
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text("Not recorded.", ML, y);
    y += 8;
  }

  // ── 9. Inventory ──────────────────────────────────────────────────────────
  y = sectionTitle(doc, y, "Inventory");
  if (inspection.inventoryItems.length > 0) {
    y = drawTable(
      doc,
      y,
      [
        { label: "Item", width: 55 },
        { label: "State", width: 30 },
        { label: "Note", width: CW - 85 },
      ],
      inspection.inventoryItems.map((it) => ({
        cells: [it.key.replace(/_/g, " "), it.state, it.note || "—"],
      })),
    );
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text("Not recorded.", ML, y);
    y += 8;
  }

  // ── 10. Customer priority & scope — printed prominently, not buried ─────
  y = ensureSpace(doc, y, 30);
  const priorityLines = doc.splitTextToSize(inspection.customerPriority || "—", CW - 8);
  const scopeLines = inspection.scopeExclusions
    ? doc.splitTextToSize(`Excluded: ${inspection.scopeExclusions}`, CW - 8)
    : [];
  const boxH =
    10 + priorityLines.length * 4.2 + scopeLines.length * 4.2 + (scopeLines.length ? 3 : 0);
  doc.setFillColor(254, 252, 232);
  doc.setDrawColor(...AMBER);
  doc.setLineWidth(0.4);
  doc.roundedRect(ML, y, CW, boxH, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...AMBER);
  doc.text("CUSTOMER PRIORITY", ML + 4, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CHARCOAL);
  doc.text(priorityLines, ML + 4, y + 11);
  if (scopeLines.length) {
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    doc.text(scopeLines, ML + 4, y + 11 + priorityLines.length * 4.2 + 3);
  }
  y += boxH + 8;

  // ── 11. Photo appendix — every photo referenced above appears here full
  // size, captioned, with a generated (never manually entered) number. ────
  y = sectionTitle(doc, y, "Photo Appendix");
  const THUMB = 42;
  const THUMB_GAP = 4;
  const perRow = Math.max(1, Math.floor((CW + THUMB_GAP) / (THUMB + THUMB_GAP)));
  let col = 0;
  for (const photo of inspection.photos) {
    if (col === 0) y = ensureSpace(doc, y, THUMB + 10);
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
    doc.text(
      `#${photoNumbers.get(photo.id)} · ${formatDateTimeInColombo(photo.capturedAt)}`,
      cellX,
      y + THUMB + 3.5,
      {
        maxWidth: THUMB,
      },
    );
    col++;
    if (col >= perRow) {
      col = 0;
      y += THUMB + 10;
    }
  }
  if (col !== 0) y += THUMB + 10;
  y += 4;

  // ── 12. Signatures / remote acknowledgment, with timestamps ─────────────
  y = sectionTitle(doc, y, "Sign-off");
  y = ensureSpace(doc, y, 42);
  const sigW = (CW - 8) / 2;
  if (inspection.inspectedWithCustomer && inspection.customerSignature) {
    if (customerSigDataUrl) {
      try {
        doc.addImage(customerSigDataUrl, "PNG", ML, y, sigW, 25);
      } catch {
        // skip
      }
    }
    doc.setDrawColor(...RULE);
    doc.line(ML, y + 27, ML + sigW, y + 27);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    doc.text(
      `${inspection.customerSignature.signerName} (customer) · ${formatDateTimeInColombo(inspection.customerSignature.signedAt)}`,
      ML,
      y + 31,
    );
  } else if (inspection.remoteAck) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("REMOTE ACKNOWLEDGMENT", ML, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    doc.text(
      `Sent ${formatDateTimeInColombo(inspection.remoteAck.sentAt)} via ${inspection.remoteAck.channel}`,
      ML,
      y + 5,
    );
    if (inspection.remoteAck.replyReceivedAt) {
      doc.text(
        `Reply received ${formatDateTimeInColombo(inspection.remoteAck.replyReceivedAt)}`,
        ML,
        y + 9.5,
      );
      if (inspection.remoteAck.replyText) {
        const rlines = doc.splitTextToSize(`"${inspection.remoteAck.replyText}"`, sigW);
        doc.text(rlines, ML, y + 14);
      }
    } else {
      doc.setTextColor(...AMBER);
      doc.text("Awaiting reply", ML, y + 9.5);
    }
    if (remoteAckScreenshotDataUrl) {
      try {
        doc.addImage(remoteAckScreenshotDataUrl, "JPEG", ML + sigW, y, sigW, 25);
      } catch {
        // skip
      }
    }
  }
  if (inspectorSigDataUrl) {
    try {
      doc.addImage(inspectorSigDataUrl, "PNG", ML + sigW + 8, y, sigW, 25);
    } catch {
      // skip
    }
  }
  doc.setDrawColor(...RULE);
  doc.line(ML + sigW + 8, y + 27, MR, y + 27);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...SLATE);
  if (inspection.inspectorSignature) {
    doc.text(
      `${inspection.inspectorSignature.staffName} (inspector) · ${formatDateTimeInColombo(inspection.inspectorSignature.signedAt)}`,
      ML + sigW + 8,
      y + 31,
    );
  }
  y += 38;

  // ── 13. Disclaimer ───────────────────────────────────────────────────────
  y = ensureSpace(doc, y, 25);
  const discLines = doc.splitTextToSize(INSPECTION_DISCLAIMER_TEXT, CW - 8);
  const discH = 8 + discLines.length * 3.6;
  doc.setDrawColor(...AMBER);
  doc.setFillColor(255, 251, 235);
  doc.roundedRect(ML, y, CW, discH, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...AMBER);
  doc.text("DISCLAIMER — UNREVIEWED PLACEHOLDER WORDING", ML + 4, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...SLATE);
  doc.text(discLines, ML + 4, y + 9);

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

  // ── Persist: upload, never overwriting an earlier version ──────────────────
  const storagePath = `jobs/${inspection.jobId}/documents/inspection-${inspection.id}-v${version}.pdf`;
  const blob = doc.output("blob");
  const fileRef = storageRef(storage, storagePath);
  await uploadBytes(fileRef, blob, { contentType: "application/pdf" });
  const url = await getDownloadURL(fileRef);

  return { url, storagePath, version };
}
