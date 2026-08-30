import { describe, it, expect } from "vitest";
import { sumPaymentsByMethod, type Invoice } from "./db";

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
