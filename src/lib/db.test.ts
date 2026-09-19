import { describe, it, expect } from "vitest";
import {
  sumPaymentsByMethod,
  computeInvoice,
  computeDraftInvoiceTotal,
  formatDocumentLabel,
  invoiceDocumentLabel,
  type Invoice,
  type PaymentRecord,
  type Coupon,
} from "./db";

function invoiceWithMethod(id: string, total: number, method: Invoice["method"]): Invoice {
  return {
    id,
    customerId: null,
    customerName: "Guest",
    lines: [{ name: "Express Exterior Wash", qty: 1, unitPrice: total, discount: 0 }],
    subtotal: total,
    tip: 0,
    total,
    method,
    status: "Paid",
    createdAt: "2026-08-27T08:00:00.000Z",
  };
}

describe("sumPaymentsByMethod (audit R1: Transfer was being counted as Card)", () => {
  it("buckets Cash, Card, and Transfer invoices into three distinct totals", () => {
    const invoices = [
      invoiceWithMethod("INV-1", 7080, "Cash"),
      invoiceWithMethod("INV-2", 25960, "Transfer"),
      invoiceWithMethod("INV-3", 21830, "Cash"),
    ];

    const totals = sumPaymentsByMethod(invoices);

    expect(totals).toEqual({ cash: 28910, card: 0, transfer: 25960 });
  });

  it("does not fold Transfer into the Card bucket", () => {
    const totals = sumPaymentsByMethod([invoiceWithMethod("INV-1", 1000, "Transfer")]);

    expect(totals.card).toBe(0);
    expect(totals.transfer).toBe(1000);
  });

  it("splits a multi-line payments[] across buckets per-payment, not per-invoice", () => {
    const invoice: Invoice = {
      ...invoiceWithMethod("INV-4", 5000, "Cash"),
      payments: [
        {
          id: "p1",
          method: "Cash",
          amount: 2000,
          reference: "",
          staffName: "",
          at: "",
        },
        {
          id: "p2",
          method: "Transfer",
          amount: 3000,
          reference: "",
          staffName: "",
          at: "",
        },
      ],
    };

    const totals = sumPaymentsByMethod([invoice]);

    expect(totals).toEqual({ cash: 2000, card: 0, transfer: 3000 });
  });

  it("returns all-zero totals for no invoices", () => {
    expect(sumPaymentsByMethod([])).toEqual({ cash: 0, card: 0, transfer: 0 });
  });
});

function payment(amount: number, method: Invoice["method"] = "Cash"): PaymentRecord {
  return { id: `p-${amount}-${method}`, method, amount, reference: "", staffName: "", at: "" };
}

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "INV-1",
    customerId: null,
    customerName: "Guest",
    lines: [{ name: "Express Exterior Wash", qty: 1, unitPrice: 10000, discount: 0 }],
    subtotal: 10000,
    tip: 0,
    total: 10000,
    method: "Cash",
    status: "Issued",
    createdAt: "2026-09-01T08:00:00.000Z",
    payments: [],
    ...overrides,
  };
}

describe("computeInvoice", () => {
  it("handles an empty invoice (no lines, no payments)", () => {
    const result = computeInvoice(baseInvoice({ lines: [], subtotal: 0, total: 0, payments: [] }));

    expect(result.subtotal).toBe(0);
    expect(result.total).toBe(0);
    expect(result.amountPaid).toBe(0);
    expect(result.balanceDue).toBe(0);
    // amountPaid (0) >= total (0), same ">=" rule store.tsx already uses for
    // a zero-total sale -- nothing owed reads as settled, not "awaiting payment".
    expect(result.status).toBe("Paid");
  });

  it("derives a percent invoice-level discount off the stored subtotal", () => {
    // total: 9000 reflects a checkout that already folded the discount in at
    // issue time -- discountAmount is derived here purely for display, it
    // does not itself recompute total (see the module comment on why).
    const result = computeInvoice(
      baseInvoice({ discount: { type: "percent", value: 10 }, total: 9000, payments: [] }),
    );

    expect(result.subtotal).toBe(10000);
    expect(result.discountAmount).toBe(1000);
    expect(result.total).toBe(9000);
    expect(result.status).toBe("Issued");
  });

  it("derives a fixed invoice-level discount off the stored subtotal", () => {
    const result = computeInvoice(
      baseInvoice({ discount: { type: "fixed", value: 1500 }, total: 8500, payments: [] }),
    );

    expect(result.discountAmount).toBe(1500);
    expect(result.total).toBe(8500);
  });

  it("clamps a fixed discount larger than the subtotal instead of going negative", () => {
    const result = computeInvoice(
      baseInvoice({ discount: { type: "fixed", value: 999999 }, total: 0, payments: [] }),
    );

    expect(result.discountAmount).toBe(10000);
    expect(result.total).toBe(0);
  });

  it("marks Paid and clamps balance to 0 on a single over-tender", () => {
    const result = computeInvoice(
      baseInvoice({
        total: 5000,
        subtotal: 5000,
        lines: [{ name: "x", qty: 1, unitPrice: 5000, discount: 0 }],
        payments: [payment(6000)],
      }),
    );

    expect(result.amountPaid).toBe(6000);
    expect(result.balanceDue).toBe(0);
    expect(result.status).toBe("Paid");
  });

  it("marks Partially Paid with a correct balance when only part of the total is tendered", () => {
    const result = computeInvoice(baseInvoice({ total: 10000, payments: [payment(4000)] }));

    expect(result.amountPaid).toBe(4000);
    expect(result.balanceDue).toBe(6000);
    expect(result.status).toBe("Partially Paid");
  });

  it("marks Paid and clamps balance to 0 when a sum of payments exceeds the total", () => {
    const result = computeInvoice(
      baseInvoice({
        total: 5000,
        subtotal: 5000,
        lines: [{ name: "x", qty: 1, unitPrice: 5000, discount: 0 }],
        payments: [payment(2000), payment(4000, "Card")],
      }),
    );

    expect(result.amountPaid).toBe(6000);
    expect(result.balanceDue).toBe(0);
    expect(result.status).toBe("Paid");
  });

  it("treats a zero-total invoice (fully covered by points) as settled with no tender", () => {
    const result = computeInvoice(
      baseInvoice({ subtotal: 5000, pointsRedeemedValue: 5000, total: 0, payments: [] }),
    );

    expect(result.total).toBe(0);
    expect(result.pointsValue).toBe(5000);
    expect(result.amountPaid).toBe(0);
    expect(result.balanceDue).toBe(0);
    expect(result.status).toBe("Paid");
  });

  it("reads a legacy-shaped document (no payments[] field) as fully paid via the adapter", () => {
    const legacy = baseInvoice({ total: 7000, subtotal: 7000, status: "Paid" });
    // Simulate a pre-migration document: `payments` was never written at all.
    delete (legacy as { payments?: PaymentRecord[] }).payments;

    const result = computeInvoice(legacy);

    expect(result.amountPaid).toBe(7000);
    expect(result.balanceDue).toBe(0);
    expect(result.status).toBe("Paid");
  });

  it("keeps Void and Refunded as terminal states regardless of the payment math", () => {
    const voided = computeInvoice(baseInvoice({ status: "Void", total: 10000, payments: [] }));
    expect(voided.status).toBe("Void");

    const refunded = computeInvoice(
      baseInvoice({ status: "Refunded", total: 10000, payments: [payment(10000)] }),
    );
    expect(refunded.status).toBe("Refunded");
  });
});

describe("computeDraftInvoiceTotal", () => {
  const line = (unitPrice: number, qty = 1, discount = 0) => ({
    name: "Service",
    qty,
    unitPrice,
    discount,
  });

  it("totals a plain cart with no discount, coupon, tip, or points", () => {
    const result = computeDraftInvoiceTotal({ lines: [line(10000)], tip: 0 });
    expect(result).toEqual({
      subtotal: 10000,
      discountAmount: 0,
      couponDiscount: 0,
      pointsValue: 0,
      tip: 0,
      total: 10000,
    });
  });

  it("stacks an invoice-level discount and a coupon before adding tip", () => {
    const coupon: Coupon = {
      id: "c1",
      code: "SAVE10",
      type: "percent",
      value: 10,
      active: true,
      expiresAt: null,
      maxRedemptions: null,
      redeemedCount: 0,
    } as Coupon;

    const result = computeDraftInvoiceTotal({
      lines: [line(10000)],
      discount: { type: "fixed", value: 500 },
      coupon,
      tip: 300,
    });

    // subtotal 10000 - 500 (invoice discount) - 1000 (10% coupon) + 300 tip
    expect(result.discountAmount).toBe(500);
    expect(result.couponDiscount).toBe(1000);
    expect(result.total).toBe(8800);
  });

  it("caps points redemption at what's left owed after discounts and tip", () => {
    const result = computeDraftInvoiceTotal({
      lines: [line(1000)],
      tip: 0,
      pointsToRedeem: 999999,
    });

    expect(result.pointsValue).toBe(1000);
    expect(result.total).toBe(0);
  });

  it("never goes negative when discounts exceed the subtotal", () => {
    const result = computeDraftInvoiceTotal({
      lines: [line(1000)],
      discount: { type: "fixed", value: 999999 },
      tip: 0,
    });

    expect(result.total).toBe(0);
  });
});

describe("formatDocumentLabel", () => {
  it("prefixes the plate ahead of the document label", () => {
    expect(formatDocumentLabel("CBA 2421", "INV 2091")).toBe("CBA 2421 - INV 2091");
  });

  it("falls back to the bare label when there's no plate", () => {
    expect(formatDocumentLabel(undefined, "INV 2091")).toBe("INV 2091");
    expect(formatDocumentLabel(null, "INV 2091")).toBe("INV 2091");
    expect(formatDocumentLabel("", "INV 2091")).toBe("INV 2091");
  });
});

describe("invoiceDocumentLabel", () => {
  it('formats a normal "INV-" id as "<plate> - INV <number>"', () => {
    expect(invoiceDocumentLabel({ id: "INV-2091", plate: "CBA 2421" })).toBe("CBA 2421 - INV 2091");
  });

  it("falls back to the bare INV label when there's no plate on file", () => {
    expect(invoiceDocumentLabel({ id: "INV-2091" })).toBe("INV 2091");
  });

  // Real data: a handful of invoices created before this app's current id
  // scheme carry an older id shape ("PS-0505", not "INV-####"). Naively
  // prefixing "INV " onto that produced the nonsensical "INV PS-0505" --
  // this is the regression that surfaced it.
  it("uses a legacy non-INV- id as-is instead of double-labeling it", () => {
    expect(invoiceDocumentLabel({ id: "PS-0505" })).toBe("PS-0505");
    expect(invoiceDocumentLabel({ id: "PS-0505", plate: "CBA 2421" })).toBe("CBA 2421 - PS-0505");
  });
});
