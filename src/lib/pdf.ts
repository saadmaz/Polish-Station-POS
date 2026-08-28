import jsPDF from "jspdf";
import type { Invoice, InvoiceLine, PurchaseOrder } from "./db";
import { getPayments, getAmountRefunded, getBusinessInfo } from "./db";
import { LOGO_PNG_BASE64 } from "./logo-asset";

// Letterhead details come from the settings/business Firestore doc (cached in
// db.ts by the store) so documents always print what Settings → Business says.
const contactLine = () => {
  const b = getBusinessInfo();
  return `${b.address}  ·  ${b.phone}  ·  ${b.email}`;
};

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return "LKR " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

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

function badge(
  doc: jsPDF,
  label: string,
  x: number,
  y: number,
  bg: [number, number, number],
  fg: [number, number, number] = WHITE,
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  const tw = doc.getTextWidth(label);
  const ph = 4.5;
  const pw = tw + 6;
  doc.setFillColor(...bg);
  doc.roundedRect(x, y - ph + 0.8, pw, ph, 1, 1, "F");
  doc.setTextColor(...fg);
  doc.text(label, x + 3, y);
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
  doc.setFontSize(7);
  doc.setTextColor(255, 220, 220);
  doc.text(contactLine(), TX, 28);

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

  // Status badge (right)
  const statusColor =
    opts.status === "Paid"
      ? SUCCESS
      : opts.status === "Void" || opts.status === "Refunded"
        ? SLATE
        : opts.status === "ESTIMATE"
          ? AMBER
          : SLATE;
  badge(
    doc,
    opts.status.toUpperCase(),
    MR - doc.getTextWidth(opts.status.toUpperCase()) - 8,
    y + 0.5,
    statusColor,
  );

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...CHARCOAL);
  doc.text(opts.customerName, ML, y);

  y += 5.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE);
  if (opts.phone) {
    doc.text(opts.phone, ML, y);
    y += 4.5;
  }

  if (opts.plate || opts.vehicleModel) {
    const vehicleLine = [opts.plate, opts.vehicleModel].filter(Boolean).join("  ·  ");
    doc.text(`Vehicle:  ${vehicleLine}`, ML, y);
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

  const C1 = ML + 3; // description start
  const C2 = ML + 94; // qty
  const C3 = ML + 124; // unit price
  const C4 = ML + 150; // discount
  const C5 = MR; // total (right-aligned)

  const C0 = ML + 2; // row number, shared x with the header "#"

  doc.text("#", C0, y, { align: "left" });
  doc.text("DESCRIPTION", C1 + 6, y);
  doc.text("QTY", C2, y, { align: "right" });
  doc.text("UNIT PRICE", C3, y, { align: "right" });
  doc.text("DISCOUNT", C4, y, { align: "right" });
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

    // Wrap long description (kept clear of the QTY column that starts at C2)
    const descLines = doc.splitTextToSize(line.name, 68);
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
    doc.text(fmt(line.unitPrice), C3, y, { align: "right" });

    if (line.discount > 0) {
      doc.setTextColor(200, 50, 50);
      doc.text(`- ${fmt(line.discount)}`, C4, y, { align: "right" });
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...CHARCOAL);
    doc.text(fmt(lineTotal), C5, y, { align: "right" });

    const thisRowH = descLines.length > 1 ? rowH + 4 : rowH;
    rule(doc, y - ROW_TOP_PAD + thisRowH);
    y += thisRowH;
  });

  // A heavier rule right under the last row's light one marks the definitive
  // end of the table, rather than reading as just another row divider.
  y += 1;
  rule(doc, y, CHARCOAL);
  y += 8;

  // ── Totals ────────────────────────────────────────────────────────────────────
  const TL = MR - 78; // totals label start
  const TV = MR; // totals value (right-aligned)

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

  y += 1;
  // Total box
  doc.setFillColor(...RED);
  doc.roundedRect(TL - 4, y - 5.5, TV - TL + 8, 10, 1.5, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text("TOTAL DUE", TL, y);
  doc.setFontSize(11);
  doc.text(fmt(opts.total), TV, y, { align: "right" });

  y += 14;

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
    const boxH = 9 + pays.length * 4.5;
    doc.setFillColor(...ROW_ALT);
    doc.roundedRect(ML, y - 5, 95, boxH, 1.5, 1.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("PAYMENT", ML + 4, y);

    let py = y + 5;
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
      py += 4.5;
    });

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
  const footerY = 277;
  rule(doc, footerY - 5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...RED);
  doc.text("POLISH STATION", ML, footerY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...SLATE);
  doc.text(contactLine(), ML, footerY + 5);

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
  doc.setFontSize(7);
  doc.setTextColor(255, 220, 220);
  doc.text(contactLine(), TX, 28);

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

  const C1 = ML + 3;
  const C2 = ML + 85;
  const C3 = ML + 110;
  const C4 = ML + 135;
  const C5 = MR;

  const C0 = ML + 2;

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
  y += 8;

  // Total box
  const TL = MR - 78;
  doc.setFillColor(...RED);
  doc.roundedRect(TL - 4, y - 5.5, MR - TL + 8, 10, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text("ORDER TOTAL", TL, y);
  doc.setFontSize(11);
  doc.text(fmt(grandTotal), MR, y, { align: "right" });
  y += 16;

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
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...SLATE);
  doc.text(contactLine(), ML, footerY + 5);
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
    validUntil: validDate.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
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
