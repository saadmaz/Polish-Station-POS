import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { auth as firebaseAuth } from "@/lib/firebase";
import { isManagerOrAbove, type StaffRole } from "@/lib/permissions";
import { formatCurrency } from "@/lib/currency";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { useConfirm } from "@/hooks/use-confirm";
import { PageHeader } from "@/components/page-header";
import { sendReceiptEmailFn, getEmailProviderStatusFn } from "@/server/notifications";
import {
  Plus,
  Search,
  FileDown,
  FileText,
  Printer,
  MessageCircle,
  Mail,
  Star,
  Ticket,
  Percent,
  Gift,
  UserPlus,
  ReceiptText,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Invoice, InvoiceDiscount, Coupon, Customer } from "@/lib/db";
import {
  getPayments,
  getAmountPaid,
  getAmountRefunded,
  getInvoiceBalance,
  describePaymentMethods,
  isCouponValid,
  computeInvoice,
  computeDraftInvoiceTotal,
  formatDocumentLabel,
  invoiceDocumentLabel,
} from "@/lib/db";
import { downloadInvoicePDF, downloadQuotationPDF } from "@/lib/pdf";
import { buildWALink, fillTemplate } from "@/lib/notifications";
import { TenderLineEditor, PaymentModal, type TenderLine } from "@/components/payment-modal";
import {
  DocumentHeader,
  TotalsStack,
  LineItemsTable,
  AddLineCombobox,
  PaymentsHistory,
  type EditableLine,
} from "@/components/invoice-document";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_app/pos")({
  head: () => ({ meta: [{ title: "POS / Checkout · Polish Station OS" }] }),
  component: POS,
});

// Invoice.email doesn't exist (the customer snapshot only carries
// phone/plate/vehicleModel -- see Invoice's module comment) so the post-
// charge email-receipt/review-request actions need this alongside
// `viewingInvoice`, not on the Invoice itself.
interface ChargedExtra {
  invoiceId: string;
  email: string;
  customerId: string | null;
  vehicleModel: string;
  plate: string;
}

const EMPTY_NEW_CUSTOMER = { name: "", phone: "", email: "", model: "", address: "" };

function POS() {
  const {
    services,
    customers,
    coupons,
    invoices,
    businessInfo,
    addInvoice,
    addCustomer,
    updateInvoice,
    voidInvoice,
    nextQuoteNumber,
    notificationSettingsData,
    recordNotification,
  } = useStore();
  const { staff } = useAuth();
  const { confirm, ConfirmDialog } = useConfirm();

  // ── Customer / Billed To ──────────────────────────────────────────────
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [manualBillingOpen, setManualBillingOpen] = useState(false);
  const [manualCustomer, setManualCustomer] = useState("");
  // The vehicle being serviced on THIS invoice -- required before Issue.
  // Independent of which vehicle (if any) is on the selected customer's
  // record: pre-filled from their first vehicle on selection, but always
  // editable, since the car in for service isn't always vehicles[0] and a
  // walk-in/manual sale has no customer record to derive it from at all.
  const [plate, setPlate] = useState("");
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState(EMPTY_NEW_CUSTOMER);

  // ── Line items ───────────────────────────────────────────────────────
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [lineCounter, setLineCounter] = useState(0);

  // ── Adjustments: invoice-level discount, coupon, loyalty points ────────
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountType, setDiscountType] = useState<InvoiceDiscount["type"]>("percent");
  const [discountValue, setDiscountValue] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<InvoiceDiscount | undefined>(undefined);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);

  // ── Payment ──────────────────────────────────────────────────────────
  const [tip, setTip] = useState(0);
  const [tenderLines, setTenderLines] = useState<TenderLine[]>([]);
  const [issuing, setIssuing] = useState(false);

  // ── Notes / terms (draft) ───────────────────────────────────────────
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");

  // ── Document / view mode ────────────────────────────────────────────
  // Set right after Issue, or by opening a past invoice from the drawer.
  // Independent of the cart above, so viewing a past invoice never loses an
  // in-progress draft sale. `viewingInvoiceRef` is a sticky pointer + the
  // last-known object (so the just-issued invoice displays immediately,
  // before the Firestore listener has necessarily caught up with it); the
  // actual `viewingInvoice` used everywhere below re-reads the live
  // `invoices` array on every render, so Collect/Refund/Void update the
  // on-screen document reactively instead of needing a manual refresh
  // wired into every mutation's callback (which would silently go stale
  // the moment a closure captured an old `invoices` array).
  const [viewingInvoiceRef, setViewingInvoice] = useState<Invoice | null>(null);
  const viewingInvoice = viewingInvoiceRef
    ? (invoices.find((i) => i.id === viewingInvoiceRef.id) ?? viewingInvoiceRef)
    : null;
  const [chargedExtra, setChargedExtra] = useState<ChargedExtra | null>(null);
  const [recentOpen, setRecentOpen] = useState(false);
  const [paymentModal, setPaymentModal] = useState<{
    invoice: Invoice;
    mode: "collect" | "refund";
  } | null>(null);

  const [emailConfigured, setEmailConfigured] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  useEffect(() => {
    getEmailProviderStatusFn()
      .then((r) => setEmailConfigured(r.configured))
      .catch(() => setEmailConfigured(false));
  }, []);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const customerName = selectedCustomer?.name ?? manualCustomer;
  const customerId =
    selectedCustomerId ??
    customers.find((c) => c.name.toLowerCase() === customerName.toLowerCase())?.id ??
    null;
  const customerRecord = customers.find((c) => c.id === customerId);
  // Which of the customer's vehicles this invoice is actually for -- the
  // typed plate may not match vehicles[0] (multi-car customer, or a car not
  // yet on file), so the model shown/stored follows whichever one matches.
  const matchedVehicle = selectedCustomer?.vehicles.find(
    (v) => v.plate.toUpperCase() === plate.trim().toUpperCase(),
  );

  // Takes the full Customer (not just an id) so the plate can be pre-filled
  // from it directly -- looking it up from `customers` here instead would
  // read a stale closure right after creating a brand-new customer, before
  // the Firestore listener has necessarily caught it up.
  function selectCustomer(c: Customer) {
    setSelectedCustomerId(c.id);
    setCustomerSearch("");
    setManualCustomer("");
    setManualBillingOpen(false);
    setNewCustomerOpen(false);
    setPlate(c.vehicles[0]?.plate ?? "");
  }

  function clearCustomer() {
    setSelectedCustomerId(null);
    setManualCustomer("");
    setPlate("");
  }

  function handleCreateCustomer() {
    // The plate is asked for exactly once -- the top-level field, already
    // required for the sale itself -- not a second time in this form. The
    // new customer's vehicle is built from that same value.
    if (!plate.trim()) {
      toast.error("Enter the vehicle's plate number");
      return;
    }
    const plateValue = plate.trim().toUpperCase();
    // Name is optional here -- the plate is what actually identifies a
    // walk-in sale. Falls back to the plate itself so the customer record
    // still has a real, traceable name rather than an empty string.
    const name = newCustomerForm.name.trim() || plateValue;
    const c = addCustomer({
      name,
      phone: newCustomerForm.phone.trim(),
      email: newCustomerForm.email.trim(),
      vehicles: [{ plate: plateValue, model: newCustomerForm.model.trim(), color: "" }],
      // Omit rather than write `address: undefined` -- Firestore's client
      // SDK throws on an explicit undefined field (see the checkout write
      // below, same precedent).
      ...(newCustomerForm.address.trim() ? { address: newCustomerForm.address.trim() } : {}),
    });
    selectCustomer(c);
    setNewCustomerForm(EMPTY_NEW_CUSTOMER);
    toast.success(`${c.name} added`);
  }

  // ── Line items ───────────────────────────────────────────────────────
  function addLineFromService(serviceId: string) {
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) return;
    const key = lineCounter + 1;
    setLineCounter(key);
    setLines((ls) => [...ls, { key, name: svc.name, qty: 1, unitPrice: svc.price, discount: 0 }]);
  }
  function addLineFromCustom(name: string) {
    const key = lineCounter + 1;
    setLineCounter(key);
    setLines((ls) => [...ls, { key, name, qty: 1, unitPrice: 0, discount: 0 }]);
  }
  function updateLine(key: number, field: keyof EditableLine, value: string | number) {
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, [field]: value };
        if (typeof value === "number" && !Number.isFinite(value)) return l;
        next.qty = Math.max(1, Math.floor(next.qty) || 1);
        next.unitPrice = Math.max(0, next.unitPrice || 0);
        next.discount = Math.min(Math.max(0, next.discount || 0), next.qty * next.unitPrice);
        return next;
      }),
    );
  }
  function removeLine(key: number) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }

  // ── Adjustments ──────────────────────────────────────────────────────
  function applyDiscount() {
    if (discountValue <= 0) {
      toast.error("Enter a discount amount");
      return;
    }
    setAppliedDiscount({
      type: discountType,
      value: discountValue,
      ...(discountReason.trim() ? { reason: discountReason.trim() } : {}),
    });
    setDiscountOpen(false);
    setDiscountValue(0);
    setDiscountReason("");
  }
  function removeDiscount() {
    setAppliedDiscount(undefined);
  }

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

  const pointsBalance = customerRecord?.loyaltyPoints ?? 0;
  const pointsRedeemed = Math.min(pointsToRedeem, pointsBalance);

  const draft = computeDraftInvoiceTotal({
    lines,
    discount: appliedDiscount,
    coupon: appliedCoupon ?? undefined,
    pointsToRedeem: pointsRedeemed,
    tip,
  });
  const tendered = tenderLines.reduce((s, l) => s + l.amount, 0);

  async function handleSaveQuote() {
    if (lines.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    if (!plate.trim()) {
      toast.error("Enter the vehicle's plate number");
      return;
    }
    const plateValue = plate.trim().toUpperCase();
    const quoteNumber = await nextQuoteNumber();
    const label = formatDocumentLabel(plateValue, `QUOTE ${quoteNumber.replace(/^QUO-/, "")}`);
    downloadQuotationPDF({
      id: label,
      customerName: customerName || "Guest",
      phone: selectedCustomer?.phone,
      plate: plateValue,
      vehicleModel: matchedVehicle?.model,
      lines: lines.map(({ key: _k, ...l }) => l),
    });
    toast.success(`Quotation ${label} downloaded`);
  }

  async function handleIssue() {
    if (lines.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    if (!plate.trim()) {
      toast.error("Enter the vehicle's plate number");
      return;
    }
    const validTenders = tenderLines.filter((l) => l.amount > 0);
    if (draft.total > 0 && validTenders.length === 0) {
      toast.error("Add at least one payment (Cash/Card/Transfer)");
      return;
    }
    setIssuing(true);
    const now = new Date().toISOString();
    const plateValue = plate.trim().toUpperCase();
    try {
      const inv = await addInvoice({
        customerId,
        customerName: customerName || "Guest",
        lines: lines.map(({ key: _k, ...l }) => l),
        subtotal: draft.subtotal,
        tip,
        total: draft.total,
        plate: plateValue,
        ...(appliedDiscount ? { discount: appliedDiscount } : {}),
        ...(appliedCoupon
          ? { couponCode: appliedCoupon.code, couponDiscount: draft.couponDiscount }
          : {}),
        ...(pointsRedeemed > 0 ? { pointsRedeemed, pointsRedeemedValue: draft.pointsValue } : {}),
        ...(selectedCustomer?.phone ? { phone: selectedCustomer.phone } : {}),
        ...(matchedVehicle?.model ? { vehicleModel: matchedVehicle.model } : {}),
        ...(selectedCustomer?.address ? { address: selectedCustomer.address } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(terms.trim() ? { terms: terms.trim() } : {}),
        payments: validTenders.map((l) => ({
          method: l.method,
          amount: l.amount,
          reference: l.reference,
          staffName: staff?.name ?? "",
          at: now,
        })),
      });

      toast.success(
        inv.status === "Partially Paid" ? "Partial payment recorded" : "Invoice issued",
        {
          description: `${invoiceDocumentLabel(inv)} · ${formatCurrency(tendered)} · ${describePaymentMethods(inv)}`,
        },
      );

      setViewingInvoice(inv);
      setChargedExtra({
        invoiceId: inv.id,
        email: selectedCustomer?.email ?? "",
        customerId,
        vehicleModel: matchedVehicle?.model ?? "",
        plate: plateValue,
      });

      // Reset the draft only on success -- a failed issue keeps the cart so
      // the cashier can just retry instead of re-entering everything.
      setLines([]);
      clearCustomer();
      setManualBillingOpen(false);
      setTip(0);
      setTenderLines([]);
      setAppliedCoupon(null);
      setAppliedDiscount(undefined);
      setPointsToRedeem(0);
      setNotes("");
      setTerms("");
    } catch (err) {
      console.error("[pos] checkout failed:", err);
      toast.error("Checkout failed, please check your connection and try again");
    } finally {
      setIssuing(false);
    }
  }

  function startNewSale() {
    setViewingInvoice(null);
    setChargedExtra(null);
  }

  async function handleSendReceipt() {
    if (!viewingInvoice || !chargedExtra?.email) return;
    setSendingReceipt(true);
    try {
      const idToken = await firebaseAuth.currentUser?.getIdToken();
      if (!idToken) throw new Error("no id token");
      const result = await sendReceiptEmailFn({
        data: {
          idToken,
          toEmail: chargedExtra.email,
          customerName: viewingInvoice.customerName,
          invoiceId: viewingInvoice.id,
          total: viewingInvoice.total,
          lines: viewingInvoice.lines,
        },
      });
      if (result.success) {
        recordNotification({
          type: "receipt_email",
          customerId: chargedExtra.customerId,
          customerName: viewingInvoice.customerName,
          phone: viewingInvoice.phone ?? "",
          email: chargedExtra.email,
        });
        toast.success("Receipt email sent");
      } else {
        toast.error(
          result.error === "not_configured"
            ? "Email isn't configured on the server"
            : "Couldn't send the receipt email, please try again",
        );
      }
    } catch {
      toast.error("Couldn't send the receipt email, please try again");
    } finally {
      setSendingReceipt(false);
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

  // Derived once and shared by the drawer table so Collect/Refund/Void
  // eligibility logic isn't duplicated per row.
  const recentInvoiceRows = [...invoices]
    .reverse()
    .slice(0, 20)
    .map((i) => {
      const paid = getAmountPaid(i);
      const refunded = getAmountRefunded(i);
      const balance = getInvoiceBalance(i);
      return {
        invoice: i,
        paid,
        refunded,
        balance,
        canCollect: balance > 0 && i.status !== "Void" && i.status !== "Refunded",
        canRefund: paid > refunded && i.status !== "Void" && isManagerOrAbove(staff?.role),
        canVoid: paid === 0 && i.status !== "Void",
      };
    });

  function viewRow(inv: Invoice) {
    setViewingInvoice(inv);
    if (chargedExtra?.invoiceId !== inv.id) setChargedExtra(null);
    setRecentOpen(false);
  }

  function renderRowActions(row: (typeof recentInvoiceRows)[number]) {
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
              if (
                await confirm({
                  title: `Void ${invoiceDocumentLabel(i)}?`,
                  description: "This cannot be undone.",
                })
              ) {
                voidInvoice(i.id);
                toast.success(`${invoiceDocumentLabel(i)} voided`);
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

  // ── Rendering ────────────────────────────────────────────────────────

  const primaryLabel =
    lines.length === 0
      ? "Issue Invoice"
      : draft.total <= 0 && draft.pointsValue > 0
        ? "Issue Invoice · Covered by Points"
        : draft.total <= 0
          ? "Issue Invoice"
          : tendered > 0 && tendered < draft.total
            ? `Record Payment · ${formatCurrency(tendered)} of ${formatCurrency(draft.total)}`
            : `Issue Invoice · ${formatCurrency(draft.total)}`;

  return (
    <div className="p-4 pb-16 sm:p-6">
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          html, body { background: #fff; }
          body * { visibility: hidden; }
          .invoice-print-area, .invoice-print-area * { visibility: visible; }
          .invoice-print-area {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            margin: 0;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
          }
          .no-print { display: none !important; }
          /* Repeat the line-item header on every page, and never split a
             row or the totals block across a page break. */
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
          .invoice-totals { break-inside: avoid; }
        }
      `}</style>
      {ConfirmDialog}

      <div className="mx-auto max-w-[900px]">
        <PageHeader
          title="POS / Checkout"
          actions={
            <Sheet open={recentOpen} onOpenChange={setRecentOpen}>
              <SheetTrigger asChild>
                <button
                  data-testid="recent-invoices-trigger"
                  className="no-print inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  <ReceiptText className="h-3.5 w-3.5" /> Recent Invoices
                </button>
              </SheetTrigger>
              <SheetContent
                data-testid="recent-invoices-drawer"
                side="right"
                className="w-full overflow-y-auto sm:max-w-xl"
              >
                <SheetHeader>
                  <SheetTitle>Recent Invoices</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-2">
                  {recentInvoiceRows.length === 0 && (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      No invoices yet
                    </div>
                  )}
                  {recentInvoiceRows.map((row) => {
                    const i = row.invoice;
                    return (
                      <div key={i.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            onClick={() => viewRow(i)}
                            className="min-w-0 text-left hover:underline"
                          >
                            <div className="font-mono text-xs text-muted-foreground">
                              {invoiceDocumentLabel(i)}
                            </div>
                            <div className="font-medium truncate">{i.customerName}</div>
                          </button>
                          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {i.status}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{formatDateTime(i.createdAt)}</span>
                          <span>{describePaymentMethods(i)}</span>
                        </div>
                        <div className="mt-2 flex items-baseline justify-between">
                          <span className="text-sm text-muted-foreground">Total</span>
                          <span className="font-mono text-sm font-semibold tabular-nums">
                            {formatCurrency(i.total)}
                          </span>
                        </div>
                        {row.balance > 0 && (
                          <div className="flex items-baseline justify-between">
                            <span className="text-sm text-muted-foreground">Balance</span>
                            <span className="font-mono text-sm font-semibold tabular-nums text-primary">
                              {formatCurrency(row.balance)}
                            </span>
                          </div>
                        )}
                        <div className="mt-2">{renderRowActions(row)}</div>
                      </div>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>
          }
        />

        {viewingInvoice ? (
          <ViewedInvoice
            key={viewingInvoice.id}
            invoice={viewingInvoice}
            justCharged={chargedExtra?.invoiceId === viewingInvoice.id}
            chargedExtra={chargedExtra}
            businessInfo={businessInfo}
            staffRole={staff?.role}
            notificationSettingsData={notificationSettingsData}
            emailConfigured={emailConfigured}
            sendingReceipt={sendingReceipt}
            onSendReceipt={handleSendReceipt}
            onRecordReview={() => {
              if (!chargedExtra) return;
              recordNotification({
                type: "review_request",
                customerId: chargedExtra.customerId,
                customerName: viewingInvoice.customerName,
                phone: viewingInvoice.phone ?? "",
              });
            }}
            onBack={startNewSale}
            onCollect={() => setPaymentModal({ invoice: viewingInvoice, mode: "collect" })}
            onRefund={() => setPaymentModal({ invoice: viewingInvoice, mode: "refund" })}
            onVoid={async () => {
              if (
                await confirm({
                  title: `Void ${invoiceDocumentLabel(viewingInvoice)}?`,
                  description: "This cannot be undone.",
                })
              ) {
                voidInvoice(viewingInvoice.id);
                setViewingInvoice({ ...viewingInvoice, status: "Void" });
                toast.success(`${invoiceDocumentLabel(viewingInvoice)} voided`);
              }
            }}
            onSaveNotes={(n, t) => {
              const updated = { ...viewingInvoice, notes: n, terms: t };
              updateInvoice(updated);
              setViewingInvoice(updated);
              toast.success("Notes saved");
            }}
          />
        ) : (
          <div className="invoice-print-area rounded-xl border border-border bg-card shadow-card p-6 sm:p-8">
            <DocumentHeader
              business={businessInfo}
              docType="INVOICE"
              docNumber="DRAFT"
              issuedAt={new Date().toISOString()}
            />

            {/* Billed To */}
            <div className="mt-6">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Billed To
              </div>

              <label className="no-print mb-3 block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Vehicle Plate *
                </span>
                <input
                  data-testid="plate-input"
                  className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm uppercase placeholder:text-muted-foreground placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="e.g. CBA 2421"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  autoFocus
                />
              </label>
              {plate.trim() && (
                <div className="no-print mb-3 text-xs text-muted-foreground">
                  {formatDocumentLabel(
                    plate.trim().toUpperCase(),
                    "INV (number assigned on issue)",
                  )}
                </div>
              )}

              {selectedCustomer ? (
                <div className="flex items-start justify-between gap-2 rounded-md bg-muted/40 px-3 py-2.5">
                  <div>
                    <div className="font-semibold">{selectedCustomer.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedCustomer.phone}
                      {selectedCustomer.vehicles[0]
                        ? ` · ${selectedCustomer.vehicles[0].plate} (${selectedCustomer.vehicles[0].model})`
                        : ""}
                    </div>
                    {selectedCustomer.address && (
                      <div className="text-xs text-muted-foreground">
                        {selectedCustomer.address}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {selectedCustomer.tier} · {selectedCustomer.visits} visits ·{" "}
                      {formatCurrency(selectedCustomer.spend)} lifetime
                      {selectedCustomer.lastVisit
                        ? ` · last visit ${formatDate(selectedCustomer.lastVisit)}`
                        : ""}
                    </div>
                    {pointsBalance > 0 && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        <Gift className="mr-1 inline h-3 w-3" />
                        {pointsBalance.toLocaleString()} loyalty points (≈{" "}
                        {formatCurrency(pointsBalance)})
                      </div>
                    )}
                  </div>
                  <button
                    onClick={clearCustomer}
                    aria-label="Change customer"
                    className="no-print shrink-0 rounded-md p-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="no-print space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      className="w-full rounded-md border border-input bg-background py-2.5 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Search by name, phone, or plate…"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                    />
                  </div>
                  {filteredCustomers.length > 0 && (
                    <div className="max-h-48 space-y-1.5 overflow-y-auto">
                      {filteredCustomers.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => selectCustomer(c)}
                          className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted/40"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold truncate">{c.name}</div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {c.phone}
                              {c.vehicles[0] ? ` · ${c.vehicles[0].plate}` : ""}
                            </div>
                          </div>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {c.tier}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {customerSearch && filteredCustomers.length === 0 && (
                    <div className="py-2 text-sm text-muted-foreground">No customers found.</div>
                  )}

                  <div className="flex flex-wrap gap-4 text-xs">
                    <button
                      onClick={() => setNewCustomerOpen((v) => !v)}
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> New customer
                    </button>
                    <button
                      data-testid="manual-billing-toggle"
                      onClick={() => setManualBillingOpen((v) => !v)}
                      className="text-muted-foreground hover:underline"
                    >
                      Bill without saving a customer
                    </button>
                  </div>

                  {newCustomerOpen && (
                    <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="min-h-9 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none"
                          placeholder="Name (optional)"
                          value={newCustomerForm.name}
                          onChange={(e) =>
                            setNewCustomerForm((f) => ({ ...f, name: e.target.value }))
                          }
                        />
                        <input
                          className="min-h-9 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none"
                          placeholder="Phone"
                          value={newCustomerForm.phone}
                          onChange={(e) =>
                            setNewCustomerForm((f) => ({ ...f, phone: e.target.value }))
                          }
                        />
                        <input
                          className="min-h-9 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none"
                          placeholder="Email"
                          value={newCustomerForm.email}
                          onChange={(e) =>
                            setNewCustomerForm((f) => ({ ...f, email: e.target.value }))
                          }
                        />
                        <input
                          className="min-h-9 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none"
                          placeholder="Vehicle model"
                          value={newCustomerForm.model}
                          onChange={(e) =>
                            setNewCustomerForm((f) => ({ ...f, model: e.target.value }))
                          }
                        />
                        <input
                          className="min-h-9 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none"
                          placeholder="Address"
                          value={newCustomerForm.address}
                          onChange={(e) =>
                            setNewCustomerForm((f) => ({ ...f, address: e.target.value }))
                          }
                        />
                      </div>
                      <button
                        onClick={handleCreateCustomer}
                        className="min-h-9 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                      >
                        Create & Bill
                      </button>
                    </div>
                  )}

                  {manualBillingOpen && (
                    <input
                      data-testid="manual-billing-input"
                      className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Customer name for this invoice…"
                      value={manualCustomer}
                      onChange={(e) => setManualCustomer(e.target.value)}
                      autoFocus
                    />
                  )}
                </div>
              )}
              {!selectedCustomer && manualCustomer && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Billing as <strong>{manualCustomer}</strong> (no customer record saved)
                </div>
              )}
            </div>

            {/* Line items */}
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Line Items
                </div>
                <div className="no-print">
                  <AddLineCombobox
                    services={services}
                    onAddService={addLineFromService}
                    onAddCustom={addLineFromCustom}
                  />
                </div>
              </div>
              <LineItemsTable
                lines={lines}
                editable
                onUpdateLine={updateLine}
                onRemoveLine={removeLine}
              />
            </div>

            {/* Adjustments: discount, coupon, points */}
            <div className="no-print mt-4 space-y-2">
              {appliedDiscount ? (
                <div className="flex items-center justify-between rounded-md bg-success/10 px-3 py-2 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-success">
                    <Percent className="h-3.5 w-3.5" />
                    {appliedDiscount.type === "percent"
                      ? `${appliedDiscount.value}% off`
                      : formatCurrency(appliedDiscount.value) + " off"}
                    {appliedDiscount.reason ? ` — ${appliedDiscount.reason}` : ""}
                  </span>
                  <button
                    onClick={removeDiscount}
                    aria-label="Remove discount"
                    className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : discountOpen ? (
                <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                  <div className="flex gap-2">
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as InvoiceDiscount["type"])}
                      className="min-h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none"
                    >
                      <option value="percent">%</option>
                      <option value="fixed">LKR</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(Number(e.target.value))}
                      className="min-h-9 w-28 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Reason (optional)"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      className="min-h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={applyDiscount}
                      className="min-h-9 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground"
                    >
                      Apply discount
                    </button>
                    <button
                      onClick={() => setDiscountOpen(false)}
                      className="min-h-9 rounded-md border border-input px-3 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setDiscountOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Percent className="h-3.5 w-3.5" /> Add discount
                </button>
              )}

              {appliedCoupon ? (
                <div className="flex items-center justify-between rounded-md bg-success/10 px-3 py-2 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-success">
                    <Ticket className="h-3.5 w-3.5" /> {appliedCoupon.code}
                  </span>
                  <button
                    onClick={removeCoupon}
                    aria-label="Remove coupon"
                    className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    className="min-h-9 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm uppercase placeholder:text-muted-foreground placeholder:normal-case focus:outline-none"
                    placeholder="Coupon code"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                  />
                  <button
                    onClick={applyCoupon}
                    className="min-h-9 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent"
                  >
                    Apply
                  </button>
                </div>
              )}

              {pointsBalance > 0 && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <label className="flex items-center gap-1.5 text-muted-foreground">
                    <Gift className="h-3.5 w-3.5" /> Redeem points
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={pointsBalance}
                    className="min-h-9 w-24 rounded-md border border-input bg-background px-2 py-1.5 text-right text-sm tabular-nums focus:outline-none"
                    value={pointsRedeemed}
                    onChange={(e) =>
                      setPointsToRedeem(
                        Math.max(0, Math.min(pointsBalance, Number(e.target.value) || 0)),
                      )
                    }
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 pt-1">
                {[150, 300, 500].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setTip(tip === amt ? 0 : amt)}
                    className={cn(
                      "min-h-9 rounded-md border py-1.5 text-xs font-medium transition-colors",
                      tip === amt
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input hover:bg-accent",
                    )}
                  >
                    Tip {formatCurrency(amt)}
                  </button>
                ))}
              </div>
            </div>

            <TotalsStack
              subtotal={draft.subtotal}
              discountAmount={draft.discountAmount}
              discountReason={appliedDiscount?.reason}
              couponCode={appliedCoupon?.code}
              couponDiscount={draft.couponDiscount}
              tip={draft.tip}
              total={draft.total}
              amountPaid={0}
              amountRefunded={0}
              balanceDue={draft.total}
            />

            {/* Payment */}
            <div
              data-testid="checkout-payment"
              className="no-print mt-6 border-t border-border pt-4"
            >
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Payment
              </div>
              <TenderLineEditor
                lines={tenderLines}
                onChange={setTenderLines}
                remaining={draft.total}
              />
            </div>

            {/* Notes / terms */}
            <div className="no-print mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Notes
                </span>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Visible on the invoice…"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Terms
                </span>
                <Textarea
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  rows={2}
                  placeholder="Payment terms, warranty, etc…"
                />
              </label>
            </div>

            {/* Actions */}
            <div className="no-print mt-6 flex flex-col gap-2 border-t border-border pt-6">
              <button
                data-testid="issue-invoice-button"
                onClick={handleIssue}
                disabled={issuing || lines.length === 0 || (tendered <= 0 && draft.total > 0)}
                className="min-h-11 w-full rounded-md gradient-brand py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-red hover:opacity-95 disabled:opacity-50"
              >
                {issuing ? "Processing…" : primaryLabel}
              </button>
              <button
                onClick={handleSaveQuote}
                disabled={lines.length === 0}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-input bg-background py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                <FileText className="h-4 w-4" /> Download Quotation PDF
              </button>
            </div>
          </div>
        )}
      </div>

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

// ─── Viewed invoice (document mode: just-issued, or opened from the drawer) ─

function ViewedInvoice({
  invoice,
  justCharged,
  chargedExtra,
  businessInfo,
  staffRole,
  notificationSettingsData,
  emailConfigured,
  sendingReceipt,
  onSendReceipt,
  onRecordReview,
  onBack,
  onCollect,
  onRefund,
  onVoid,
  onSaveNotes,
}: {
  invoice: Invoice;
  justCharged: boolean;
  chargedExtra: ChargedExtra | null;
  businessInfo: ReturnType<typeof useStore>["businessInfo"];
  staffRole: StaffRole | null | undefined;
  notificationSettingsData: ReturnType<typeof useStore>["notificationSettingsData"];
  emailConfigured: boolean;
  sendingReceipt: boolean;
  onSendReceipt: () => void;
  onRecordReview: () => void;
  onBack: () => void;
  onCollect: () => void;
  onRefund: () => void;
  onVoid: () => void;
  onSaveNotes: (notes: string, terms: string) => void;
}) {
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [terms, setTerms] = useState(invoice.terms ?? "");
  const computed = computeInvoice(invoice);
  const payments = getPayments(invoice);
  const editableLines = invoice.lines.map((l, i) => ({ ...l, key: i }));

  const paid = computed.amountPaid;
  const refunded = computed.amountRefunded;
  const canCollect =
    computed.balanceDue > 0 && invoice.status !== "Void" && invoice.status !== "Refunded";
  const canRefund = paid > refunded && invoice.status !== "Void" && isManagerOrAbove(staffRole);
  const canVoid = paid === 0 && invoice.status !== "Void";

  return (
    <div className="invoice-print-area rounded-xl border border-border bg-card shadow-card p-6 sm:p-8">
      <div className="no-print mb-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> New Sale
        </button>
      </div>

      <DocumentHeader
        business={businessInfo}
        docType="INVOICE"
        docNumber={invoiceDocumentLabel(invoice)}
        issuedAt={invoice.createdAt}
        dueAt={invoice.dueAt}
        status={invoice.status}
      />

      <div className="mt-6">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Billed To
        </div>
        <div className="rounded-md bg-muted/40 px-3 py-2.5">
          <div className="font-semibold">{invoice.customerName}</div>
          <div className="text-xs text-muted-foreground">
            {invoice.phone}
            {invoice.plate
              ? ` · ${invoice.plate}${invoice.vehicleModel ? ` (${invoice.vehicleModel})` : ""}`
              : ""}
          </div>
          {invoice.address && (
            <div className="text-xs text-muted-foreground">{invoice.address}</div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Line Items
        </div>
        <LineItemsTable lines={editableLines} editable={false} />
      </div>

      <TotalsStack
        subtotal={computed.subtotal}
        discountAmount={computed.discountAmount}
        discountReason={invoice.discount?.reason}
        couponCode={invoice.couponCode}
        couponDiscount={computed.couponDiscount}
        tip={computed.tip}
        total={computed.total}
        amountPaid={computed.amountPaid}
        amountRefunded={computed.amountRefunded}
        balanceDue={computed.balanceDue}
      />

      <PaymentsHistory payments={payments} refunds={invoice.refunds ?? []} />

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Notes
          </span>
          {(notes || terms) && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{notes || "—"}</p>
          )}
          <div className="no-print">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Terms
          </span>
          <div className="no-print">
            <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} />
          </div>
        </div>
      </div>
      {(notes !== (invoice.notes ?? "") || terms !== (invoice.terms ?? "")) && (
        <div className="no-print mt-2">
          <button
            onClick={() => onSaveNotes(notes, terms)}
            className="min-h-9 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent"
          >
            Save Notes
          </button>
        </div>
      )}

      {justCharged && (
        <div className="no-print mt-6 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800/40 dark:bg-green-900/20 space-y-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-green-700 dark:text-green-400">
            <Star className="h-4 w-4" /> Payment recorded
          </p>
          <p className="text-xs text-green-700 dark:text-green-300">
            Ask {invoice.customerName.split(" ")[0]} for a Google review?
          </p>
          {invoice.phone && notificationSettingsData.googleReviewLink ? (
            <a
              href={buildWALink(
                invoice.phone,
                fillTemplate(notificationSettingsData.reviewRequestTemplate, {
                  customerName: invoice.customerName.split(" ")[0],
                  vehicle: chargedExtra?.vehicleModel ?? "",
                  plate: chargedExtra?.plate ?? "",
                  serviceName: invoice.lines[0]?.name ?? "",
                  daysSinceVisit: "",
                  reviewLink: notificationSettingsData.googleReviewLink,
                }),
              )}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onRecordReview}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-success py-2.5 text-sm font-medium text-success-foreground hover:bg-success/90"
            >
              <MessageCircle className="h-4 w-4" /> Send Review Request via WhatsApp
            </a>
          ) : !notificationSettingsData.googleReviewLink ? (
            <p className="text-xs text-amber-600">
              Set your Google Review link in Notifications → Templates.
            </p>
          ) : null}

          {chargedExtra?.email &&
          notificationSettingsData.receiptEmailEnabled &&
          emailConfigured ? (
            <button
              onClick={onSendReceipt}
              disabled={sendingReceipt}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-green-600 py-2.5 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-60 dark:text-green-400 dark:hover:bg-green-900/20"
            >
              <Mail className="h-4 w-4" /> {sendingReceipt ? "Sending…" : "Email Receipt"}
            </button>
          ) : !chargedExtra?.email ? (
            <p className="mt-2 text-xs text-muted-foreground">
              No email on file — can't send a receipt.
            </p>
          ) : !notificationSettingsData.receiptEmailEnabled ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Receipt email is off — enable it in Settings → Notifications.
            </p>
          ) : (
            <p className="mt-2 text-xs text-amber-600">
              Receipt email isn't configured on the server yet.
            </p>
          )}
        </div>
      )}

      <div className="no-print mt-6 flex flex-wrap gap-2 border-t border-border pt-6">
        <button
          onClick={() => downloadInvoicePDF(invoice)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent"
        >
          <FileDown className="h-4 w-4" /> Download PDF
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent"
        >
          <Printer className="h-4 w-4" /> Print
        </button>
        {canCollect && (
          <button
            onClick={onCollect}
            className="min-h-10 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent"
          >
            Collect Payment
          </button>
        )}
        {canRefund && (
          <button
            onClick={onRefund}
            className="min-h-10 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent"
          >
            Refund
          </button>
        )}
        {invoice.status !== "Void" && (
          <button
            disabled={!canVoid}
            title={canVoid ? undefined : "Money already collected, use Refund instead"}
            onClick={onVoid}
            className="min-h-10 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            Void
          </button>
        )}
        <button
          onClick={onBack}
          className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New Sale
        </button>
      </div>
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
