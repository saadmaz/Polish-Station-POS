// Shared, invoice-document-shaped building blocks used by both states POS
// renders: the live cart (editable, no Invoice saved yet) and a viewed
// invoice (read-only line items, payments already recorded). Same
// components either way -- only `editable` props differ -- so the on-screen
// document and the eventual print output can't structurally drift apart the
// way a second, hand-copied layout would.
import { useState } from "react";
import { Plus, Trash2, Banknote, CreditCard, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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
    <div className="space-y-2 border-t border-border pt-4">
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
                  <Plus className="mr-2 h-3.5 w-3.5 shrink-0" /> Add "{query.trim()}" as a custom line
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
    <div className="overflow-x-auto">
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
              <td colSpan={editable ? 6 : 5} className="px-2 py-6 text-center text-sm text-muted-foreground">
                {editable ? "No lines yet — add a service or a custom line above" : "No line items"}
              </td>
            </tr>
          )}
          {lines.map((l) => (
            <tr key={l.key} className="group">
              <td className="px-2 py-2">
                {editable ? (
                  <input
                    className="w-full min-h-9 bg-transparent text-sm focus:outline-none"
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
                    className="w-14 min-h-9 rounded bg-muted px-2 py-1 text-right font-mono text-sm tabular-nums focus:outline-none"
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
                    className="w-24 min-h-9 rounded bg-muted px-2 py-1 text-right font-mono text-sm tabular-nums focus:outline-none"
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
                    className="w-24 min-h-9 rounded bg-muted px-2 py-1 text-right font-mono text-sm tabular-nums text-primary focus:outline-none"
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
  );
}

// ─── Payments panel ─────────────────────────────────────────────────────

export interface TenderLine {
  key: number;
  method: "Cash" | "Card" | "Transfer";
  amount: number;
  reference: string;
}

let tenderKeyCounter = 0;

const METHOD_ICONS = { Cash: Banknote, Card: CreditCard, Transfer: ArrowRightLeft } as const;

/** The tender-entry control: "+ Cash / + Card / + Transfer" buttons that
 *  each add an editable amount/reference row. Used both pre-save (the
 *  payments about to be recorded on Issue) and to collect more against an
 *  already-issued invoice. */
export function TenderEditor({
  lines,
  onChange,
  remaining,
}: {
  lines: TenderLine[];
  onChange: (lines: TenderLine[]) => void;
  remaining: number;
}) {
  const tendered = lines.reduce((s, l) => s + l.amount, 0);
  const stillOwed = remaining - tendered;

  function addLine(method: TenderLine["method"]) {
    onChange([...lines, { key: ++tenderKeyCounter, method, amount: Math.max(0, stillOwed), reference: "" }]);
  }
  function updateLine(key: number, field: keyof Omit<TenderLine, "key">, value: string | number) {
    onChange(lines.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  }
  function removeLine(key: number) {
    onChange(lines.filter((l) => l.key !== key));
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {(["Cash", "Card", "Transfer"] as const).map((m) => {
          const Icon = METHOD_ICONS[m];
          return (
            <button
              key={m}
              type="button"
              onClick={() => addLine(m)}
              className="flex min-h-11 flex-col items-center gap-1 rounded-md border border-input py-2.5 text-xs font-medium hover:bg-accent"
            >
              <Icon className="h-4 w-4" />+ {m}
            </button>
          );
        })}
      </div>
      {lines.length > 0 && (
        <div className="mt-3 space-y-2">
          {lines.map((l) => (
            <div key={l.key} className="flex flex-wrap items-center gap-2">
              <select
                value={l.method}
                onChange={(e) => updateLine(l.key, "method", e.target.value)}
                className="min-h-9 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none"
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Transfer">Transfer</option>
              </select>
              <input
                type="number"
                min={0}
                value={l.amount}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  updateLine(l.key, "amount", Number.isFinite(n) ? Math.max(0, n) : 0);
                }}
                className="min-h-9 w-28 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-right font-mono text-sm tabular-nums focus:outline-none sm:flex-none"
              />
              <input
                type="text"
                placeholder="Ref (optional)"
                value={l.reference}
                onChange={(e) => updateLine(l.key, "reference", e.target.value)}
                className="min-h-9 min-w-24 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeLine(l.key)}
                aria-label="Remove payment line"
                className="shrink-0 rounded-md p-2 text-muted-foreground hover:text-primary"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div
        className={cn(
          "mt-3 flex justify-between rounded-md px-3 py-2 text-xs font-medium",
          remaining > 0 && stillOwed <= 0 ? "bg-success/10 text-success" : "bg-muted/50",
        )}
      >
        <span>Remaining to tender</span>
        <span className="font-mono tabular-nums">{formatCurrency(Math.max(0, stillOwed))}</span>
      </div>
    </div>
  );
}

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

