import jsPDF from "jspdf";
import type { Invoice, InvoiceLine, Job, PurchaseOrder } from "./db";

// ─── Brand colours (RGB) ─────────────────────────────────────────────────────
const RED: [number, number, number] = [210, 30, 30];
const RED_DARK: [number, number, number] = [160, 20, 20];
const CHARCOAL: [number, number, number] = [18, 18, 24];
const SLATE: [number, number, number] = [71, 85, 105];
const MUTED: [number, number, number] = [148, 163, 184];
const RULE: [number, number, number] = [226, 232, 240];
const ROW_ALT: [number, number, number] = [248, 250, 252];
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
  tax: number;
  tip?: number;
  total: number;
  method?: string;
  status: string;
  notes?: string;
}

function buildDoc(opts: DocOptions): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let y = 0;

  // ── Header bar ───────────────────────────────────────────────────────────────
  doc.setFillColor(...RED);
  doc.rect(0, 0, PW, 42, "F");

  // Subtle dark overlay on right half for depth
  doc.setFillColor(...RED_DARK);
  doc.rect(PW / 2, 0, PW / 2, 42, "F");

  // Company name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...WHITE);
  doc.text("POLISH STATION", ML, 16);

  // Tagline
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 200, 200);
  doc.text("Professional Car Detailing & Protection", ML, 22);

  // Contact line
  doc.setFontSize(7);
  doc.setTextColor(255, 220, 220);
  doc.text(
    "No. 142, Havelock Rd, Colombo 05  ·  +94 11 250 8821  ·  hello@polishstation.lk",
    ML,
    28,
  );
  doc.text("VAT Reg: VAT-184220985-7000", ML, 33.5);

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
      : opts.status === "Void"
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
  // Table header background
  doc.setFillColor(...CHARCOAL);
  doc.rect(ML, y - 5, CW, 8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...WHITE);

  const C1 = ML + 3; // description start
  const C2 = ML + 90; // qty
  const C3 = ML + 111; // unit price
  const C4 = ML + 136; // discount
  const C5 = MR; // total (right-aligned)

  doc.text("#", ML + 1, y);
  doc.text("DESCRIPTION", C1 + 6, y);
  doc.text("QTY", C2, y, { align: "right" });
  doc.text("UNIT PRICE", C3, y, { align: "right" });
  doc.text("DISCOUNT", C4, y, { align: "right" });
  doc.text("TOTAL", C5, y, { align: "right" });

  y += 4.5;

  // Rows
  opts.lines.forEach((line, idx) => {
    const rowH = 9;
    // Alternating row background
    if (idx % 2 === 1) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(ML, y - 5.5, CW, rowH, "F");
    }

    const lineTotal = line.unitPrice * line.qty - line.discount;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...CHARCOAL);
    doc.text(String(idx + 1), ML + 2, y, { align: "left" });

    // Wrap long description
    const descLines = doc.splitTextToSize(line.name, 75);
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

    y += descLines.length > 1 ? rowH + 2 : rowH;
  });

  y += 2;
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
  totalRow("VAT (18%)", fmt(opts.tax));
  if (opts.tip && opts.tip > 0) totalRow("Tip / Gratuity", fmt(opts.tip));

  y += 1;
  // Total box
  doc.setFillColor(...CHARCOAL);
  doc.roundedRect(TL - 4, y - 5.5, TV - TL + 8, 10, 1.5, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text("TOTAL DUE", TL, y);
  doc.setFontSize(11);
  doc.text(fmt(opts.total), TV, y, { align: "right" });

  y += 14;

  // ── Payment / Quotation info ─────────────────────────────────────────────────
  if (opts.docType === "INVOICE" && opts.method) {
    doc.setFillColor(...ROW_ALT);
    doc.roundedRect(ML, y - 5, 80, 14, 1.5, 1.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("PAYMENT METHOD", ML + 4, y);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...CHARCOAL);
    doc.text(opts.method.toUpperCase(), ML + 4, y + 5.5);

    y += 18;
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
  doc.text(
    "No. 142, Havelock Rd, Colombo 05  ·  +94 11 250 8821  ·  hello@polishstation.lk",
    ML,
    footerY + 5,
  );

  doc.setTextColor(...MUTED);
  doc.text(
    "Thank you for choosing Polish Station — Sri Lanka's premier car care destination.",
    ML,
    footerY + 10,
  );

  // Page number
  doc.setFontSize(7);
  doc.text("Page 1 of 1", MR, footerY + 10, { align: "right" });

  return doc;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function downloadInvoicePDF(invoice: Invoice, job?: Job) {
  const doc = buildDoc({
    docType: "INVOICE",
    docId: invoice.id,
    docDate: invoice.createdAt,
    customerName: invoice.customerName,
    phone: job?.phone,
    plate: job?.plate,
    vehicleModel: job?.vehicleModel,
    lines: invoice.lines,
    subtotal: invoice.subtotal,
    tax: invoice.tax,
    tip: invoice.tip,
    total: invoice.total,
    method: invoice.method,
    status: invoice.status,
  });
  doc.save(`${invoice.id}.pdf`);
}

export function downloadPOPDF(po: PurchaseOrder) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let y = 0;

  // Header bar
  doc.setFillColor(...RED);
  doc.rect(0, 0, PW, 42, "F");
  doc.setFillColor(...RED_DARK);
  doc.rect(PW / 2, 0, PW / 2, 42, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...WHITE);
  doc.text("POLISH STATION", ML, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 200, 200);
  doc.text("Professional Car Detailing & Protection", ML, 22);
  doc.setFontSize(7);
  doc.setTextColor(255, 220, 220);
  doc.text(
    "No. 142, Havelock Rd, Colombo 05  ·  +94 11 250 8821  ·  hello@polishstation.lk",
    ML,
    28,
  );

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
  doc.text("Polish Station", MR - 60, y);

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE);
  doc.text("No. 142, Havelock Rd, Colombo 05", MR - 60, y);
  y += 4.5;
  doc.text("+94 11 250 8821", MR - 60, y);

  if (po.createdBy) {
    y += 4.5;
    doc.text(`Raised by: ${po.createdBy}`, ML, y);
  }

  y += 8;
  rule(doc, y);
  y += 8;

  // Line items table
  doc.setFillColor(...CHARCOAL);
  doc.rect(ML, y - 5, CW, 8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...WHITE);

  const C1 = ML + 3;
  const C2 = ML + 85;
  const C3 = ML + 110;
  const C4 = ML + 135;
  const C5 = MR;

  doc.text("#", ML + 1, y);
  doc.text("DESCRIPTION / SKU", C1 + 6, y);
  doc.text("UNIT", C2, y, { align: "right" });
  doc.text("QTY", C3, y, { align: "right" });
  doc.text("UNIT COST", C4, y, { align: "right" });
  doc.text("LINE TOTAL", C5, y, { align: "right" });

  y += 4.5;

  let grandTotal = 0;
  po.lines.forEach((line, idx) => {
    const rowH = 9;
    if (idx % 2 === 1) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(ML, y - 5.5, CW, rowH, "F");
    }

    const lineTotal = line.unitCost * line.qtyOrdered;
    grandTotal += lineTotal;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...CHARCOAL);
    doc.text(String(idx + 1), ML + 2, y);
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

    y += rowH + 2;
  });

  y += 2;
  rule(doc, y, CHARCOAL);
  y += 8;

  // Total box
  const TL = MR - 78;
  doc.setFillColor(...CHARCOAL);
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
  doc.text("Authorised by (Polish Station):", ML, SIG_Y + 5);
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
  doc.text(
    "No. 142, Havelock Rd, Colombo 05  ·  +94 11 250 8821  ·  hello@polishstation.lk",
    ML,
    footerY + 5,
  );
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
  const tax = Math.round(subtotal * 0.18);
  const total = subtotal + tax;

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
    tax,
    total,
    status: "ESTIMATE",
    notes: opts.notes,
  });
  doc.save(`${opts.id}.pdf`);
}
