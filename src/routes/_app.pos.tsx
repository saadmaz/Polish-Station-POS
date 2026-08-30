import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { isManagerOrAbove } from "@/lib/permissions";
import { formatCurrency } from "@/lib/currency";
import { formatDateTime } from "@/lib/date-format";
import { useConfirm } from "@/hooks/use-confirm";
import { PageHeader } from "@/components/page-header";
import { StatusChip, statusVariant } from "@/components/status-chip";
import {
  Plus,
  Trash2,
  Search,
  FileDown,
  FileText,
  MessageCircle,
  Star,
  Ticket,
  Gift,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { InvoiceLine, Invoice, Coupon } from "@/lib/db";
import {
  getAmountPaid,
  getAmountRefunded,
  getInvoiceBalance,
  describePaymentMethods,
  isCouponValid,
  calcCouponDiscount,
  calcPointsValue,
} from "@/lib/db";
import { downloadInvoicePDF, downloadQuotationPDF } from "@/lib/pdf";
import { newId } from "@/lib/db";
import { buildWALink, fillTemplate } from "@/lib/notifications";
import { TenderLineEditor, PaymentModal, type TenderLine } from "@/components/payment-modal";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/_app/pos")({
  head: () => ({ meta: [{ title: "POS / Checkout · Polish Station OS" }] }),
  component: POS,
});

interface ChargedInfo {
  customerName: string;
  phone: string;
  customerId: string | null;
  vehicleModel: string;
  plate: string;
  serviceName: string;
  invoiceId: string;
}

function POS() {
  const {
    services,
    customers,
    coupons,
    invoices,
    openShift,
    addInvoice,
    voidInvoice,
    notificationSettingsData,
    recordNotification,
  } = useStore();
  const { staff } = useAuth();

  // Customer selection
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [manualCustomer, setManualCustomer] = useState("");

  // Line items
  const [lines, setLines] = useState<(InvoiceLine & { key: number })[]>([]);
  const [lineCounter, setLineCounter] = useState(0);

  // Loyalty & coupons
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);

  // Payment
  const [tip, setTip] = useState(0);
  const [tenderLines, setTenderLines] = useState<TenderLine[]>([]);
  const [charging, setCharging] = useState(false);
  const [chargedInfo, setChargedInfo] = useState<ChargedInfo | null>(null);
  const [paymentModal, setPaymentModal] = useState<{
    invoice: Invoice;
    mode: "collect" | "refund";
  } | null>(null);
  const [mobilePaymentOpen, setMobilePaymentOpen] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const customerName = selectedCustomer?.name ?? manualCustomer;
  const customerId =
    selectedCustomerId ??
    customers.find((c) => c.name.toLowerCase() === customerName.toLowerCase())?.id ??
    null;
  const customerRecord = customers.find((c) => c.id === customerId);

  function selectCustomer(id: string) {
    setSelectedCustomerId(id);
    setCustomerSearch("");
    setManualCustomer("");
  }

  function addLine(serviceId?: string) {
    const svc = services.find((s) => s.id === serviceId);
    const key = lineCounter + 1;
    setLineCounter(key);
    setLines((ls) => [
      ...ls,
      { key, name: svc?.name ?? "Custom item", qty: 1, unitPrice: svc?.price ?? 0, discount: 0 },
    ]);
  }

  function updateLine(key: number, field: keyof InvoiceLine, value: string | number) {
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, [field]: value };
        // Keep the arithmetic fields sane no matter what was typed: a NaN or
        // negative here would flow straight into the stored invoice totals.
        if (typeof value === "number" && !Number.isFinite(value)) return l;
        next.qty = Math.max(1, Math.floor(next.qty) || 1);
        next.unitPrice = Math.max(0, next.unitPrice || 0);
        // A discount larger than the line itself would make the line (and
        // potentially the subtotal) negative.
        next.discount = Math.min(Math.max(0, next.discount || 0), next.qty * next.unitPrice);
        return next;
      }),
    );
  }

  function removeLine(key: number) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty - l.discount, 0);
  const couponDiscount = appliedCoupon ? calcCouponDiscount(appliedCoupon, subtotal) : 0;
  const discountedSubtotal = Math.max(0, subtotal - couponDiscount);
  const grossTotal = discountedSubtotal + tip;
  const pointsBalance = customerRecord?.loyaltyPoints ?? 0;
  // Clamp live so a stale value from a previously-selected customer never
  // over-redeems once the balance it was checked against has changed.
  const pointsRedeemed = Math.min(pointsToRedeem, pointsBalance);
  const pointsValue = calcPointsValue(pointsRedeemed, grossTotal);
  const total = Math.max(0, grossTotal - pointsValue);
  const tendered = tenderLines.reduce((s, l) => s + l.amount, 0);

  function applyCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    const coupon = coupons.find((c) => c.code.toUpperCase() === code);
    if (!coupon) {
      toast.error("No coupon with that code");
      return;
    }
    if (!isCouponValid(coupon)) {
      toast.error("That coupon is expired, inactive, or fully redeemed");
      return;
    }
    setAppliedCoupon(coupon);
    setCouponInput("");
    toast.success(`Coupon ${coupon.code} applied`);
  }

  function removeCoupon() {
    setAppliedCoupon(null);
  }

  function handleSaveQuote() {
    if (lines.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    const quoteId = newId("QUO");
    downloadQuotationPDF({
      id: quoteId,
      customerName: customerName || "Guest",
      phone: selectedCustomer?.phone,
      plate: selectedCustomer?.vehicles[0]?.plate,
      vehicleModel: selectedCustomer?.vehicles[0]?.model,
      lines: lines.map(({ key: _k, ...l }) => l),
    });
    toast.success(`Quotation ${quoteId} downloaded`);
  }

  async function handleCharge() {
    if (lines.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    const validTenders = tenderLines.filter((l) => l.amount > 0);
    // total can legitimately be 0 when points redemption covers the whole
    // bill: only demand a cash/card/transfer tender for what's still owed.
    if (total > 0 && validTenders.length === 0) {
      toast.error("Add at least one payment (Cash/Card/Transfer)");
      return;
    }
    setCharging(true);

    const now = new Date().toISOString();
    try {
      const inv = await addInvoice({
        customerId,
        customerName: customerName || "Guest",
        lines: lines.map(({ key: _k, ...l }) => l),
        subtotal,
        tip,
        total,
        sessionId: openShift?.id ?? null,
        // Omit the key entirely rather than setting it to `undefined`:
        // Firestore's client SDK batch.set() throws on an explicit undefined
        // field value (this previously broke every checkout with no deposit).
        ...(appliedCoupon ? { couponCode: appliedCoupon.code, couponDiscount } : {}),
        ...(pointsRedeemed > 0 ? { pointsRedeemed, pointsRedeemedValue: pointsValue } : {}),
        ...(selectedCustomer?.phone ? { phone: selectedCustomer.phone } : {}),
        ...(selectedCustomer?.vehicles[0]?.plate
          ? { plate: selectedCustomer.vehicles[0].plate }
          : {}),
        ...(selectedCustomer?.vehicles[0]?.model
          ? { vehicleModel: selectedCustomer.vehicles[0].model }
          : {}),
        payments: validTenders.map((l) => ({
          method: l.method,
          amount: l.amount,
          reference: l.reference,
          sessionId: openShift?.id ?? null,
          staffName: staff?.name ?? "",
          at: now,
        })),
      });

      toast.success(
        inv.status === "Partially Paid" ? "Partial payment recorded" : "Payment received",
        {
          description: `${inv.id} · ${formatCurrency(tendered)} · ${describePaymentMethods(inv)}`,
        },
      );

      setChargedInfo({
        customerName: customerName || "Guest",
        phone: selectedCustomer?.phone ?? "",
        customerId,
        vehicleModel: selectedCustomer?.vehicles[0]?.model ?? "",
        plate: selectedCustomer?.vehicles[0]?.plate ?? "",
        serviceName: lines[0]?.name ?? "",
        invoiceId: inv.id,
      });

      // Reset — only on success: a failed charge keeps the cart so the
      // cashier can just retry instead of re-entering everything.
      setLines([]);
      setSelectedCustomerId(null);
      setManualCustomer("");
      setCustomerSearch("");
      setTip(0);
      setTenderLines([]);
      setAppliedCoupon(null);
      setPointsToRedeem(0);
    } catch (err) {
      // addInvoice() now awaits its Firestore write instead of firing it and
      // forgetting: a network drop here throws, so the till must show that
      // instead of a false "payment received" receipt for a sale that never
      // landed.
      console.error("[pos] checkout failed:", err);
      toast.error("Checkout failed, please check your connection and try again");
    } finally {
      setCharging(false);
    }
  }

  const filteredCustomers = customerSearch
    ? customers
        .filter(
          (c) =>
            c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
            c.phone.toLowerCase().includes(customerSearch.toLowerCase()) ||
            c.vehicles.some((v) => v.plate.toLowerCase().includes(customerSearch.toLowerCase())),
        )
        .slice(0, 8)
    : [];

  // Derived once and shared by both the desktop table and the mobile card
  // list so the Collect/Refund/Void eligibility logic isn't duplicated.
  const recentInvoiceRows = [...invoices]
    .reverse()
    .slice(0, 10)
    .map((i) => {
      const paid = getAmountPaid(i);
      const refunded = getAmountRefunded(i);
      const balance = getInvoiceBalance(i);
      return {
        invoice: i,
        paid,
        refunded,
        canCollect: balance > 0 && i.status !== "Void" && i.status !== "Refunded",
        canRefund: paid > refunded && i.status !== "Void" && isManagerOrAbove(staff?.role),
        canVoid: paid === 0 && i.status !== "Void",
      };
    });

  function renderInvoiceActions(row: (typeof recentInvoiceRows)[number]) {
    const i = row.invoice;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => downloadInvoicePDF(i)}
          title="Download PDF"
          aria-label="Download PDF"
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-primary"
        >
          <FileDown className="h-3.5 w-3.5" />
        </button>
        {row.canCollect && (
          <button
            onClick={() => setPaymentModal({ invoice: i, mode: "collect" })}
            className="rounded-md border border-input px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent"
          >
            Collect
          </button>
        )}
        {row.canRefund && (
          <button
            onClick={() => setPaymentModal({ invoice: i, mode: "refund" })}
            className="rounded-md border border-input px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent"
          >
            Refund
          </button>
        )}
        {i.status !== "Void" && (
          <button
            disabled={!row.canVoid}
            title={row.canVoid ? undefined : "Money already collected, use Refund instead"}
            onClick={async () => {
              if (await confirm({ title: `Void ${i.id}?` })) {
                voidInvoice(i.id);
                toast.success(`${i.id} voided`);
              }
            }}
            className="rounded-md border border-input px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            Void
          </button>
        )}
      </div>
    );
  }

  // Shared between the desktop sticky sidebar and the mobile payment sheet so
  // the checkout/payment UI isn't maintained in two places.
  function renderPaymentPanel() {
    return (
      <>
        {customerRecord && (
          <div className="mb-3 rounded-md bg-muted/40 px-3 py-2">
            <div className="text-xs text-muted-foreground">Customer</div>
            <div className="font-display font-bold">{customerRecord.name}</div>
            <div className="text-xs text-muted-foreground">
              {customerRecord.tier} · {customerRecord.visits} visits ·{" "}
              {formatCurrency(customerRecord.spend)} lifetime
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              <Gift className="mr-1 inline h-3 w-3" />
              {pointsBalance.toLocaleString()} loyalty points (≈ {formatCurrency(pointsBalance)})
            </div>
          </div>
        )}
        {!customerRecord && customerName && (
          <div className="mb-3 text-sm font-semibold">{customerName}</div>
        )}

        {/* Coupon */}
        <div className="mb-3">
          {appliedCoupon ? (
            <div className="flex items-center justify-between rounded-md bg-success/10 px-3 py-2 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-success">
                <Ticket className="h-3.5 w-3.5" /> {appliedCoupon.code}
              </span>
              <button
                onClick={removeCoupon}
                aria-label="Remove coupon"
                className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                title="Remove coupon"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                className="min-h-11 flex-1 rounded-md border border-input bg-background px-2.5 py-2 text-sm uppercase placeholder:text-muted-foreground placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Coupon code"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
              />
              <button
                onClick={applyCoupon}
                className="min-h-11 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
              >
                Apply
              </button>
            </div>
          )}
        </div>

        {/* Loyalty points redemption */}
        {pointsBalance > 0 && (
          <div className="mb-3 flex items-center justify-between gap-2 text-sm">
            <label className="flex items-center gap-1.5 text-muted-foreground">
              <Gift className="h-3.5 w-3.5" /> Redeem points
            </label>
            <input
              type="number"
              min={0}
              max={pointsBalance}
              className="w-24 min-h-9 rounded-md border border-input bg-background px-2 py-1.5 text-right text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={pointsRedeemed}
              onChange={(e) =>
                setPointsToRedeem(Math.max(0, Math.min(pointsBalance, Number(e.target.value) || 0)))
              }
            />
          </div>
        )}

        <div className="space-y-2 text-sm border-y border-border py-4">
          <Row label="Subtotal" value={formatCurrency(subtotal)} />
          {couponDiscount > 0 && (
            <Row
              label={`Coupon (${appliedCoupon?.code})`}
              value={`− ${formatCurrency(couponDiscount)}`}
              tone="success"
            />
          )}
          <Row label="Tip" value={formatCurrency(tip)} />
          {pointsValue > 0 && (
            <Row
              label="Points redeemed"
              value={`− ${formatCurrency(pointsValue)}`}
              tone="success"
            />
          )}
        </div>
        <div className="flex items-baseline justify-between py-4">
          <span className="text-sm font-semibold uppercase tracking-wider">Total</span>
          <span className="font-display text-2xl font-extrabold text-primary">
            {formatCurrency(total)}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {[150, 300, 500].map((amt) => (
            <button
              key={amt}
              onClick={() => setTip(tip === amt ? 0 : amt)}
              className={cn(
                "min-h-11 rounded-md border py-2 text-xs font-medium transition-colors",
                tip === amt
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input hover:bg-accent",
              )}
            >
              Tip {formatCurrency(amt)}
            </button>
          ))}
        </div>

        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          Payment
        </div>
        <div className="mb-4">
          <TenderLineEditor lines={tenderLines} onChange={setTenderLines} remaining={total} />
        </div>

        {chargedInfo && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800/40 dark:bg-green-900/20 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-1.5">
                <Star className="h-4 w-4" /> Payment complete · {chargedInfo.invoiceId}
              </p>
              <button
                onClick={() => setChargedInfo(null)}
                aria-label="Dismiss"
                className="rounded-md p-1.5 text-green-600 hover:text-green-800 dark:text-green-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-green-700 dark:text-green-300">
              Ask {chargedInfo.customerName.split(" ")[0]} for a Google review?
            </p>
            {chargedInfo.phone && notificationSettingsData.googleReviewLink ? (
              <a
                href={buildWALink(
                  chargedInfo.phone,
                  fillTemplate(notificationSettingsData.reviewRequestTemplate, {
                    customerName: chargedInfo.customerName.split(" ")[0],
                    vehicle: chargedInfo.vehicleModel,
                    plate: chargedInfo.plate,
                    serviceName: chargedInfo.serviceName,
                    daysSinceVisit: "",
                    reviewLink: notificationSettingsData.googleReviewLink,
                  }),
                )}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  recordNotification({
                    type: "review_request",
                    customerId: chargedInfo.customerId,
                    customerName: chargedInfo.customerName,
                    phone: chargedInfo.phone,
                  });
                  setChargedInfo(null);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700"
              >
                <MessageCircle className="h-4 w-4" /> Send Review Request via WhatsApp
              </a>
            ) : !notificationSettingsData.googleReviewLink ? (
              <p className="text-xs text-amber-600">
                Set your Google Review link in Notifications → Templates.
              </p>
            ) : null}
          </div>
        )}

        <button
          onClick={handleCharge}
          disabled={charging || lines.length === 0 || (tendered <= 0 && total > 0)}
          className="w-full rounded-md gradient-brand py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-red hover:opacity-95 disabled:opacity-50"
        >
          {charging
            ? "Processing…"
            : lines.length === 0
              ? "Complete Sale"
              : total <= 0 && pointsValue > 0
                ? "Complete: Covered by Points"
                : total <= 0
                  ? "Complete Sale"
                  : tendered > 0 && tendered < total
                    ? `Collect ${formatCurrency(tendered)} of ${formatCurrency(total)}`
                    : `Charge ${formatCurrency(total)}`}
        </button>

        <button
          onClick={handleSaveQuote}
          disabled={lines.length === 0}
          className="mt-2 w-full flex items-center justify-center gap-2 rounded-md border border-input bg-background py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          <FileText className="h-4 w-4" /> Download Quotation PDF
        </button>

        {!openShift && (
          <p className="mt-2 text-center text-[11px] text-warning">
            No active shift, open a shift first
          </p>
        )}
      </>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 p-4 pb-28 sm:p-6 lg:h-full lg:grid-cols-[1fr_400px] lg:pb-6">
      {ConfirmDialog}
      <div className="space-y-6">
        <PageHeader
          title="POS / Checkout"
          subtitle={openShift ? `Shift active · ${openShift.staffName}` : "No active shift"}
        />

        {/* Customer selector */}
        <div className="rounded-xl border border-border bg-card shadow-card p-4">
          <h2 className="font-display font-bold mb-3">Select Customer</h2>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Search by name, phone, or plate…"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto sm:max-h-48">
            {filteredCustomers.map((c) => (
              <button
                key={c.id}
                onClick={() => selectCustomer(c.id)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm text-left transition-colors",
                  selectedCustomerId === c.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{c.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {c.phone}
                    {c.vehicles[0] ? ` · ${c.vehicles[0].plate}` : ""}
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">{c.tier}</span>
              </button>
            ))}
            {customerSearch && filteredCustomers.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">
                No customers found. Enter a name below for manual billing
              </div>
            )}
          </div>
          {!selectedCustomerId && (
            <div className="mt-3">
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Or type customer name for manual billing…"
                value={manualCustomer}
                onChange={(e) => setManualCustomer(e.target.value)}
              />
            </div>
          )}
          {selectedCustomer && (
            <div className="mt-3 flex items-center justify-between gap-2 text-sm rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
              <span className="min-w-0 truncate">
                <strong>{selectedCustomer.name}</strong>
                {selectedCustomer.vehicles[0] ? ` · ${selectedCustomer.vehicles[0].plate}` : ""}
              </span>
              <button
                onClick={() => setSelectedCustomerId(null)}
                aria-label="Clear selected customer"
                className="shrink-0 rounded-md p-2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Line items */}
        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex flex-col gap-2 p-4 border-b border-border sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-display font-bold">Line Items</h2>
            <div className="flex flex-wrap gap-2">
              <select
                className="min-h-9 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none sm:flex-none"
                value=""
                onChange={(e) => {
                  if (e.target.value) addLine(e.target.value);
                }}
              >
                <option value="">+ Add service…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {formatCurrency(s.price)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => addLine()}
                className="inline-flex min-h-9 items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" /> Custom
              </button>
            </div>
          </div>
          {lines.length > 0 ? (
            <>
              {/* Mobile: stacked cards */}
              <div className="divide-y divide-border md:hidden">
                {lines.map((l) => (
                  <div key={l.key} className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <input
                        className="min-h-9 flex-1 bg-transparent text-sm font-medium focus:outline-none"
                        value={l.name}
                        onChange={(e) => updateLine(l.key, "name", e.target.value)}
                      />
                      <button
                        onClick={() => removeLine(l.key)}
                        aria-label="Remove line"
                        className="shrink-0 rounded-md p-2 text-muted-foreground hover:text-primary"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="space-y-1">
                        <span className="text-[11px] text-muted-foreground">Qty</span>
                        <input
                          type="number"
                          min={1}
                          className="w-full min-h-9 rounded bg-muted px-2 py-1.5 text-right text-sm font-mono focus:outline-none"
                          value={l.qty}
                          onChange={(e) => updateLine(l.key, "qty", Number(e.target.value))}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] text-muted-foreground">Unit</span>
                        <input
                          type="number"
                          min={0}
                          className="w-full min-h-9 rounded bg-muted px-2 py-1.5 text-right text-sm font-mono focus:outline-none"
                          value={l.unitPrice}
                          onChange={(e) => updateLine(l.key, "unitPrice", Number(e.target.value))}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] text-muted-foreground">Disc.</span>
                        <input
                          type="number"
                          min={0}
                          className="w-full min-h-9 rounded bg-muted px-2 py-1.5 text-right text-sm font-mono text-primary focus:outline-none"
                          value={l.discount}
                          onChange={(e) => updateLine(l.key, "discount", Number(e.target.value))}
                        />
                      </label>
                    </div>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-muted-foreground">Line total</span>
                      <span className="font-mono font-semibold">
                        {formatCurrency(l.unitPrice * l.qty - l.discount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tablet/desktop: table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2">Item</th>
                      <th className="text-right px-3 py-2 w-16">Qty</th>
                      <th className="text-right px-3 py-2 w-28">Unit</th>
                      <th className="text-right px-3 py-2 w-28">Disc.</th>
                      <th className="text-right px-3 py-2 w-32">Total</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((l) => (
                      <tr key={l.key}>
                        <td className="px-4 py-2">
                          <input
                            className="w-full bg-transparent text-sm font-medium focus:outline-none"
                            value={l.name}
                            onChange={(e) => updateLine(l.key, "name", e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            className="w-14 rounded bg-muted px-2 py-1 text-right text-sm font-mono focus:outline-none"
                            value={l.qty}
                            onChange={(e) => updateLine(l.key, "qty", Number(e.target.value))}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            className="w-24 rounded bg-muted px-2 py-1 text-right text-sm font-mono focus:outline-none"
                            value={l.unitPrice}
                            onChange={(e) => updateLine(l.key, "unitPrice", Number(e.target.value))}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            className="w-24 rounded bg-muted px-2 py-1 text-right text-sm font-mono text-primary focus:outline-none"
                            value={l.discount}
                            onChange={(e) => updateLine(l.key, "discount", Number(e.target.value))}
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">
                          {formatCurrency(l.unitPrice * l.qty - l.discount)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            onClick={() => removeLine(l.key)}
                            aria-label="Remove line"
                            className="rounded-md p-2 text-muted-foreground hover:text-primary"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-center text-sm text-muted-foreground py-10">
              Select a customer above or add line items manually
            </div>
          )}
        </div>

        {/* Recent invoices */}
        <div>
          <h3 className="font-display text-sm font-bold mb-3 uppercase tracking-wider text-muted-foreground">
            Recent Invoices
          </h3>

          {recentInvoiceRows.length === 0 ? (
            <div className="rounded-xl border border-border bg-card shadow-card py-6 text-center text-sm text-muted-foreground">
              No invoices yet today
            </div>
          ) : (
            <>
              {/* Mobile: stacked cards */}
              <div className="divide-y divide-border rounded-xl border border-border bg-card shadow-card md:hidden">
                {recentInvoiceRows.map((row) => {
                  const i = row.invoice;
                  return (
                    <div key={i.id} className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-xs text-muted-foreground">{i.id}</div>
                          <div className="font-medium truncate">{i.customerName}</div>
                        </div>
                        <StatusChip variant={statusVariant(i.status)}>{i.status}</StatusChip>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{formatDateTime(i.createdAt)}</span>
                        <span>{describePaymentMethods(i)}</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm text-muted-foreground">Total</span>
                        <div className="text-right">
                          <span className="font-mono font-semibold">{formatCurrency(i.total)}</span>
                          {i.status === "Partially Paid" && (
                            <div className="text-[10px] font-normal text-muted-foreground">
                              {formatCurrency(row.paid)} paid
                            </div>
                          )}
                          {row.refunded > 0 && (
                            <div className="text-[10px] font-normal text-primary">
                              {formatCurrency(row.refunded)} refunded
                            </div>
                          )}
                        </div>
                      </div>
                      {renderInvoiceActions(row)}
                    </div>
                  );
                })}
              </div>

              {/* Tablet/desktop: table */}
              <div className="hidden overflow-x-auto rounded-xl border border-border bg-card shadow-card md:block">
                <table className="w-full text-sm">
                  <thead className="bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-4 py-2.5">Invoice</th>
                      <th className="text-left px-3 py-2.5">Customer</th>
                      <th className="text-left px-3 py-2.5">Date</th>
                      <th className="text-right px-3 py-2.5">Total</th>
                      <th className="text-left px-3 py-2.5">Method</th>
                      <th className="text-left px-3 py-2.5">Status</th>
                      <th className="px-2 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentInvoiceRows.map((row) => {
                      const i = row.invoice;
                      return (
                        <tr key={i.id} className="hover:bg-muted/40">
                          <td className="px-4 py-2.5 font-mono text-xs">{i.id}</td>
                          <td className="px-3 py-2.5 font-medium">{i.customerName}</td>
                          <td className="px-3 py-2.5 text-muted-foreground text-xs">
                            {formatDateTime(i.createdAt)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold">
                            {formatCurrency(i.total)}
                            {i.status === "Partially Paid" && (
                              <div className="text-[10px] font-normal text-muted-foreground">
                                {formatCurrency(row.paid)} paid
                              </div>
                            )}
                            {row.refunded > 0 && (
                              <div className="text-[10px] font-normal text-primary">
                                {formatCurrency(row.refunded)} refunded
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {describePaymentMethods(i)}
                          </td>
                          <td className="px-3 py-2.5">
                            <StatusChip variant={statusVariant(i.status)}>{i.status}</StatusChip>
                          </td>
                          <td className="px-2 py-2.5">{renderInvoiceActions(row)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Payment panel: desktop/tablet sticky sidebar */}
      <aside className="hidden rounded-xl border border-border bg-card shadow-card p-5 h-fit sticky top-4 lg:block">
        {renderPaymentPanel()}
      </aside>

      {/* Payment panel, mobile: totals bar pinned above the viewport bottom, full panel in a sheet */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-elevated lg:hidden">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total</div>
          <div className="font-display text-lg font-extrabold text-primary truncate">
            {formatCurrency(total)}
          </div>
        </div>
        <button
          onClick={() => setMobilePaymentOpen(true)}
          disabled={lines.length === 0}
          className="min-h-11 shrink-0 rounded-md gradient-brand px-5 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-red hover:opacity-95 disabled:opacity-50"
        >
          Checkout
        </button>
      </div>

      <Sheet open={mobilePaymentOpen} onOpenChange={setMobilePaymentOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-xl lg:hidden">
          <SheetHeader>
            <SheetTitle>Payment</SheetTitle>
          </SheetHeader>
          <div className="mt-2">{renderPaymentPanel()}</div>
        </SheetContent>
      </Sheet>

      {paymentModal && (
        <PaymentModal
          invoice={paymentModal.invoice}
          mode={paymentModal.mode}
          onClose={() => setPaymentModal(null)}
        />
      )}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono font-medium", tone === "success" && "text-success")}>
        {value}
      </span>
    </div>
  );
}

function X({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
