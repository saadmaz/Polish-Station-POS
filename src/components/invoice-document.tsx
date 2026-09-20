// Shared, invoice-document-shaped building blocks used by both states POS
// renders: the live cart (editable, no Invoice saved yet) and a viewed
// invoice (read-only line items, payments already recorded). Same
// components either way -- only `editable` props differ -- so the on-screen
// document and the eventual print output can't structurally drift apart the
// way a second, hand-copied layout would.
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type {
  BusinessInfo,
  InvoiceLine,
  InvoiceStatus,
  PaymentRecord,
  RefundRecord,
  Service,
} from "@/lib/db";

// ─── Status stamp ────────────────────────────────────────────────────────
// A restrained document stamp, not a dashboard pill: border + letterspaced
// caps rather than a filled colour badge, sized for a document header.

const STAMP_TONE: Record<InvoiceStatus, string> = {
  Paid: "border-success text-success",
  "Partially Paid": "border-warning-foreground text-warning-foreground",
  Issued: "border-info text-info",
  Draft: "border-muted-foreground text-muted-foreground",
  Void: "border-muted-foreground text-muted-foreground line-through decoration-2",
  Refunded: "border-primary text-primary",
};

export function StatusStamp({ status, className }: { status: InvoiceStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded border-2 px-3 py-1 text-sm font-bold uppercase tracking-[0.2em]",
        STAMP_TONE[status],
        className,
      )}
    >
      {status}
    </span>
  );
}

// ─── Document header ─────────────────────────────────────────────────────

export function DocumentHeader({
  business,
  docType,
  docNumber,
  issuedAt,
  dueAt,
  status,
}: {
  business: BusinessInfo;
  docType: "INVOICE" | "QUOTATION";
  docNumber: string;
  issuedAt: string;
  dueAt?: string;
  status?: InvoiceStatus;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="font-display text-xl font-extrabold tracking-tight">{business.trading}</div>
        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          <div>{business.address}</div>
          <div>{business.phone}</div>
          <div>{business.email}</div>
        </div>
      </div>
      <div className="text-left sm:text-right">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {docType}
        </div>
        <div className="font-display text-lg font-bold tabular-nums">{docNumber}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Issued <span className="tabular-nums">{formatDate(issuedAt)}</span>
        </div>
        {dueAt && (
          <div className="text-xs text-muted-foreground">
            Due <span className="tabular-nums">{formatDate(dueAt)}</span>
          </div>
        )}
        {status && (
          <div className="mt-2">
            <StatusStamp status={status} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Totals stack ─────────────────────────────────────────────────────────

function TotalRow({
  label,
  value,
  tone,
  emphasis,
}: {
  label: string;
  value: string;
  tone?: "success" | "muted";
  emphasis?: boolean;
}) {
  return (
    <div className={cn("flex items-baseline justify-between", emphasis && "py-1")}>
      <span
        className={cn(
          emphasis
            ? "text-sm font-semibold uppercase tracking-wider"
            : "text-sm text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-mono tabular-nums",
          emphasis ? "font-display text-2xl font-extrabold" : "text-sm font-medium",
          tone === "success" && "text-success",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function TotalsStack({
  subtotal,
  discountAmount,
  discountReason,
  couponCode,
  couponDiscount,
  tip,
  total,
  amountPaid,
  amountRefunded,
  balanceDue,
}: {
  subtotal: number;
  discountAmount: number;
  discountReason?: string;
  couponCode?: string;
  couponDiscount: number;
  tip: number;
  total: number;
  amountPaid: number;
  amountRefunded: number;
  balanceDue: number;
}) {
  return (
    <div className="invoice-totals space-y-2 border-t border-border pt-4">
      <TotalRow label="Subtotal" value={formatCurrency(subtotal)} />
      {discountAmount > 0 && (
        <TotalRow
          label={discountReason ? `Discount (${discountReason})` : "Discount"}
          value={`− ${formatCurrency(discountAmount)}`}
          tone="success"
        />
      )}
      {couponDiscount > 0 && (
        <TotalRow
          label={couponCode ? `Coupon (${couponCode})` : "Coupon"}
          value={`− ${formatCurrency(couponDiscount)}`}
          tone="success"
        />
      )}
      {tip > 0 && <TotalRow label="Tip" value={formatCurrency(tip)} />}
      <div className="border-t border-border pt-2">
        <TotalRow label="Total" value={formatCurrency(total)} emphasis={balanceDue <= 0} />
      </div>
      {(amountPaid > 0 || amountRefunded > 0) && (
        <>
          <TotalRow label="Amount Paid" value={formatCurrency(amountPaid)} tone="muted" />
          {amountRefunded > 0 && (
            <TotalRow label="Refunded" value={formatCurrency(amountRefunded)} tone="muted" />
          )}
        </>
      )}
      {balanceDue > 0 && (
        <div className="border-t border-border pt-2">
          <TotalRow label="Balance Due" value={formatCurrency(balanceDue)} emphasis />
        </div>
      )}
    </div>
  );
}

// ─── Line items table ──────────────────────────────────────────────────────

export interface EditableLine extends InvoiceLine {
  key: number;
}

/** Combined "search the catalog or type a custom line" control -- one input,
 *  not a <select> plus a separate Custom button. Typing text that doesn't
 *  match any service and pressing Enter (or clicking the "Add ... as a
 *  custom line" row) adds it as a free-typed line. */
export function AddLineCombobox({
  services,
  onAddService,
  onAddCustom,
}: {
  services: Service[];
  onAddService: (serviceId: string) => void;
  onAddCustom: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const matches = query.trim()
    ? services.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
    : services;

  function pick(fn: () => void) {
    fn();
    setQuery("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="add-line-trigger"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" /> Add line
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search services or type a custom line…"
            value={query}
            onValueChange={setQuery}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim() && matches.length === 0) {
                pick(() => onAddCustom(query.trim()));
              }
            }}
          />
          <CommandList>
            {matches.length === 0 && (
              <CommandEmpty className="p-0">
                {query.trim() ? (
                  <button
                    type="button"
                    data-testid="add-custom-line"
                    onClick={() => pick(() => onAddCustom(query.trim()))}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" /> Add "{query.trim()}" as a custom line
                  </button>
                ) : (
                  <div className="px-3 py-2.5 text-sm text-muted-foreground">No services yet</div>
                )}
              </CommandEmpty>
            )}
            <CommandGroup>
              {matches.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.id}
                  onSelect={() => pick(() => onAddService(s.id))}
                  className="cursor-pointer"
                >
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="ml-2 shrink-0 font-mono text-xs text-muted-foreground">
                    {formatCurrency(s.price)}
                  </span>
                </CommandItem>
              ))}
              {matches.length > 0 && query.trim() && (
                <CommandItem
                  value={`__custom__${query}`}
                  onSelect={() => pick(() => onAddCustom(query.trim()))}
                  className="cursor-pointer text-muted-foreground"
                >
                  <Plus className="mr-2 h-3.5 w-3.5 shrink-0" /> Add "{query.trim()}" as a custom
                  line
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function LineItemsTable({
  lines,
  editable,
  onUpdateLine,
  onRemoveLine,
}: {
  lines: EditableLine[];
  editable: boolean;
  onUpdateLine?: (key: number, field: keyof InvoiceLine, value: string | number) => void;
  onRemoveLine?: (key: number) => void;
}) {
  return (
    <>
      {/* Mobile: stacked cards. Forced off at print time (print:!hidden)
          regardless of the viewport width the print engine reports, since
          the print stylesheet in _app.pos.tsx depends on the <table>
          structure (thead repeat, row break-avoidance). */}
      <div className="divide-y divide-border md:hidden print:hidden!">
        {lines.length === 0 && (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            {editable ? "No lines yet — add a service or a custom line above" : "No line items"}
          </div>
        )}
        {lines.map((l) => (
          <div key={l.key} className="p-3">
            <div className="flex items-start justify-between gap-2">
              {editable ? (
                <input
                  className="min-h-9 w-full min-w-0 bg-transparent text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset rounded"
                  value={l.name}
                  onChange={(e) => onUpdateLine?.(l.key, "name", e.target.value)}
                />
              ) : (
                <div className="text-sm font-medium">{l.name}</div>
              )}
              {editable && (
                <button
                  type="button"
                  onClick={() => onRemoveLine?.(l.key)}
                  aria-label={`Remove ${l.name || "line"}`}
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-primary"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Qty
                </div>
                {editable ? (
                  <input
                    type="number"
                    min={1}
                    className="mt-0.5 min-h-9 w-full rounded bg-muted px-2 py-1 text-right font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset"
                    value={l.qty}
                    onChange={(e) => onUpdateLine?.(l.key, "qty", Number(e.target.value))}
                  />
                ) : (
                  <div className="mt-0.5 font-mono text-sm tabular-nums">{l.qty}</div>
                )}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Unit Price
                </div>
                {l.hideUnitPrice ? (
                  <div className="mt-0.5 text-sm text-muted-foreground">—</div>
                ) : editable ? (
                  <input
                    type="number"
                    min={0}
                    className="mt-0.5 min-h-9 w-full rounded bg-muted px-2 py-1 text-right font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset"
                    value={l.unitPrice}
                    onChange={(e) => onUpdateLine?.(l.key, "unitPrice", Number(e.target.value))}
                  />
                ) : (
                  <div className="mt-0.5 font-mono text-sm tabular-nums">
                    {formatCurrency(l.unitPrice)}
                  </div>
                )}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Discount
                </div>
                {editable ? (
                  <input
                    type="number"
                    min={0}
                    className="mt-0.5 min-h-9 w-full rounded bg-muted px-2 py-1 text-right font-mono text-sm tabular-nums text-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset"
                    value={l.discount}
                    onChange={(e) => onUpdateLine?.(l.key, "discount", Number(e.target.value))}
                  />
                ) : l.discount > 0 ? (
                  <div className="mt-0.5 font-mono text-sm tabular-nums text-primary">
                    − {formatCurrency(l.discount)}
                  </div>
                ) : (
                  <div className="mt-0.5 text-sm text-muted-foreground">—</div>
                )}
              </div>
            </div>
            <div className="mt-2 text-right font-mono text-sm font-semibold tabular-nums">
              {formatCurrency(l.unitPrice * l.qty - l.discount)}
            </div>
          </div>
        ))}
      </div>

      {/* Tablet/desktop + print: table. print:!block guarantees this wins
          over the mobile card block even if the print engine reports a
          narrow virtual viewport width. */}
      <div className="hidden overflow-x-auto md:block print:block!">
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-2 py-2 text-left">Description</th>
            <th className="px-2 py-2 text-right w-16">Qty</th>
            <th className="px-2 py-2 text-right w-28">Unit Price</th>
            <th className="px-2 py-2 text-right w-24">Discount</th>
            <th className="px-2 py-2 text-right w-28">Amount</th>
            {editable && <th className="w-8" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lines.length === 0 && (
            <tr>
              <td
                colSpan={editable ? 6 : 5}
                className="px-2 py-6 text-center text-sm text-muted-foreground"
              >
                {editable ? "No lines yet — add a service or a custom line above" : "No line items"}
              </td>
            </tr>
          )}
          {lines.map((l) => (
            <tr key={l.key} className="group">
              <td className="px-2 py-2">
                {editable ? (
                  <input
                    className="w-full min-h-9 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset rounded"
                    value={l.name}
                    onChange={(e) => onUpdateLine?.(l.key, "name", e.target.value)}
                  />
                ) : (
                  l.name
                )}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {editable ? (
                  <input
                    type="number"
                    min={1}
                    className="w-14 min-h-9 rounded bg-muted px-2 py-1 text-right font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset"
                    value={l.qty}
                    onChange={(e) => onUpdateLine?.(l.key, "qty", Number(e.target.value))}
                  />
                ) : (
                  l.qty
                )}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {l.hideUnitPrice ? (
                  <span className="text-muted-foreground">—</span>
                ) : editable ? (
                  <input
                    type="number"
                    min={0}
                    className="w-24 min-h-9 rounded bg-muted px-2 py-1 text-right font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset"
                    value={l.unitPrice}
                    onChange={(e) => onUpdateLine?.(l.key, "unitPrice", Number(e.target.value))}
                  />
                ) : (
                  formatCurrency(l.unitPrice)
                )}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {editable ? (
                  <input
                    type="number"
                    min={0}
                    className="w-24 min-h-9 rounded bg-muted px-2 py-1 text-right font-mono text-sm tabular-nums text-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset"
                    value={l.discount}
                    onChange={(e) => onUpdateLine?.(l.key, "discount", Number(e.target.value))}
                  />
                ) : l.discount > 0 ? (
                  <span className="text-primary">− {formatCurrency(l.discount)}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-2 py-2 text-right font-mono text-sm font-semibold tabular-nums">
                {formatCurrency(l.unitPrice * l.qty - l.discount)}
              </td>
              {editable && (
                <td className="px-1 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onRemoveLine?.(l.key)}
                    aria-label={`Remove ${l.name || "line"}`}
                    className="rounded-md p-1.5 text-muted-foreground opacity-0 hover:text-primary focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

// ─── Payments history ─────────────────────────────────────────────────────
// The editable tender-entry control (+ Cash/+ Card/+ Transfer) already
// exists as TenderLineEditor in payment-modal.tsx, shared today by the POS
// checkout panel and the Collect Payment dialog -- reused as-is rather than
// duplicated here.

/** Read-only list of payments already recorded on a saved invoice, plus
 *  refunds if any -- the document's own record of what actually happened,
 *  separate from the (editable, not-yet-saved) TenderEditor above. */
export function PaymentsHistory({
  payments,
  refunds,
}: {
  payments: PaymentRecord[];
  refunds: RefundRecord[];
}) {
  if (payments.length === 0 && refunds.length === 0) return null;
  return (
    <div className="space-y-1.5 border-t border-border pt-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Payments
      </div>
      {payments.map((p) => (
        <div key={p.id} className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {p.method}
            {p.reference ? ` · ${p.reference}` : ""} · {formatDateTime(p.at)}
          </span>
          <span className="font-mono tabular-nums">{formatCurrency(p.amount)}</span>
        </div>
      ))}
      {refunds.map((r) => (
        <div key={r.id} className="flex items-center justify-between text-sm text-primary">
          <span>
            Refund ({r.method}) · {r.reason} · {formatDateTime(r.at)}
          </span>
          <span className="font-mono tabular-nums">− {formatCurrency(r.amount)}</span>
        </div>
      ))}
    </div>
  );
}
