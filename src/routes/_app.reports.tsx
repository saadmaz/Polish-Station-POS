import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Download } from "lucide-react";
import { useStore } from "@/lib/store";
import { sumPaymentsByMethod, describePaymentMethods, type Invoice } from "@/lib/db";
import { formatCurrency } from "@/lib/currency";
import {
  todayBusinessDate,
  addBusinessDays,
  businessDateOf,
  businessDayBoundsUtc,
  isInBusinessDay,
} from "@/lib/business-day";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "Reports · Polish Station OS" }] }),
  component: Reports,
});

type Period = "today" | "7d" | "30d" | "all";

// The business-date (YYYY-MM-DD) a period starts on — comparable against
// Booking.date directly. "7d"/"30d" are calendar-aligned business days
// counting today as day 1 (so "7d" is today + the 6 days before it), not a
// rolling 168-hour window: that keeps every period boundary defined the
// same way "today" is everywhere else in the app.
function periodStartBusinessDate(period: Period): string {
  const today = todayBusinessDate();
  if (period === "today") return today;
  if (period === "7d") return addBusinessDays(today, -6);
  if (period === "30d") return addBusinessDays(today, -29);
  return "1970-01-01";
}

// Build daily revenue data from the invoice array.
// Cash/card/transfer split is computed per-payment, not per-invoice: a
// split-tender invoice (part cash, part card) must contribute to every
// bucket it actually touches.
function buildDailyData(
  invoices: Invoice[],
  days: number,
): { date: string; cash: number; card: number; transfer: number }[] {
  const result: { date: string; cash: number; card: number; transfer: number }[] = [];
  const today = todayBusinessDate();
  for (let i = days - 1; i >= 0; i--) {
    const d = addBusinessDays(today, -i);
    const dayInvs = invoices.filter((inv) => isInBusinessDay(inv.createdAt, d));
    const { cash, card, transfer } = sumPaymentsByMethod(dayInvs);
    result.push({ date: d.slice(5), cash, card, transfer }); // MM-DD
  }
  return result;
}

function Reports() {
  const { invoices, bookings, customers, inventory, shifts, expenses } = useStore();
  const [period, setPeriod] = useState<Period>("30d");

  const sinceBusinessDate = periodStartBusinessDate(period);
  const since = businessDayBoundsUtc(sinceBusinessDate).startUtc.toISOString();
  const filteredInvoices = invoices.filter((i) => i.createdAt >= since && i.status !== "Void");
  const filteredBookings = bookings.filter((b) => b.date >= sinceBusinessDate);

  // Revenue stats. Cash/card/transfer split is per-payment (a split-tender
  // invoice contributes to every bucket it touches), not per-invoice.
  const totalRevenue = filteredInvoices.reduce((s, i) => s + i.total, 0);
  const {
    cash: cashRevenue,
    card: cardRevenue,
    transfer: transferRevenue,
  } = sumPaymentsByMethod(filteredInvoices);
  const avgInvoice =
    filteredInvoices.length > 0 ? Math.round(totalRevenue / filteredInvoices.length) : 0;

  // Booking stats
  const noShows = filteredBookings.filter((b) => b.status === "No-Show").length;
  const noShowPct =
    filteredBookings.length > 0 ? Math.round((noShows / filteredBookings.length) * 100) : 0;
  const checkedIn = filteredBookings.filter((b) => b.status === "Checked-In").length;

  // Customer stats: split customers billed in this period into returning
  // (had an invoice before the period started) vs new, keyed by customerId
  // (falling back to the typed name for walk-ins with no matched record).
  const returningCustomers = new Set<string>();
  const newCustomers = new Set<string>();
  filteredInvoices.forEach((inv) => {
    const key = inv.customerId ?? inv.customerName;
    if (!key) return;
    const hadPriorInvoice = invoices.some(
      (x) =>
        (x.customerId ?? x.customerName) === key && businessDateOf(x.createdAt) < sinceBusinessDate,
    );
    if (hadPriorInvoice) returningCustomers.add(key);
    else newCustomers.add(key);
  });
  const retentionPct =
    returningCustomers.size + newCustomers.size > 0
      ? Math.round((returningCustomers.size / (returningCustomers.size + newCustomers.size)) * 100)
      : 0;

  // Inventory stats
  const stockValue = inventory.reduce((s, i) => s + i.stock * i.cost, 0);
  const lowCount = inventory.filter((i) => i.stock > 0 && i.stock <= i.reorder).length;
  const outCount = inventory.filter((i) => i.stock === 0).length;

  // Shift stats
  const closedShifts = shifts.filter((s) => s.status === "CLOSED");
  const avgVariance =
    closedShifts.length > 0
      ? Math.round(
          closedShifts.reduce((s, sh) => s + Math.abs(sh.variance ?? 0), 0) / closedShifts.length,
        )
      : 0;

  // Customer lifetime value: ranked by total spend, with average order
  // value (spend / visits) so a customer with one big-ticket visit reads
  // differently from a customer with many small repeat visits.
  const rankedCustomers = [...customers]
    .filter((c) => c.visits > 0)
    .map((c) => ({ ...c, avgOrderValue: Math.round(c.spend / c.visits) }))
    .sort((a, b) => b.spend - a.spend);
  const topCustomer = rankedCustomers[0];
  const avgCLV =
    rankedCustomers.length > 0
      ? Math.round(rankedCustomers.reduce((s, c) => s + c.spend, 0) / rankedCustomers.length)
      : 0;

  // Profit & loss: real revenue (invoices) minus real cash-out (expenses),
  // not a fabricated per-service margin: there's no cost-of-goods link from
  // a service to the inventory it consumed, so a per-service "profit"
  // number would just be invented. This is the honest number available.
  const filteredExpenses = expenses.filter((e) => e.createdAt >= since && e.type === "EXPENSE");
  const totalExpenseAmt = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = totalRevenue - totalExpenseAmt;
  const expenseByCategory = Object.entries(
    filteredExpenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.amount;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  // Chart data: last 14 days for "today"/"7d", last 30 for "30d", last 60 for "all"
  const chartDays = period === "today" ? 14 : period === "7d" ? 14 : period === "30d" ? 30 : 60;
  const dailyData = buildDailyData(filteredInvoices, chartDays);

  const reports = [
    {
      name: "Revenue Summary",
      desc: `Cash ${formatCurrency(cashRevenue)} · Card ${formatCurrency(cardRevenue)} · Transfer ${formatCurrency(transferRevenue)}`,
      metric: formatCurrency(totalRevenue),
      delta: `Avg invoice ${formatCurrency(avgInvoice)}`,
      color: "text-success",
      exportFn: () =>
        exportCSV(
          ["Invoice ID", "Customer", "Date", "Total", "Method", "Status"],
          filteredInvoices.map((i) => [
            i.id,
            i.customerName,
            i.createdAt.slice(0, 10),
            i.total,
            describePaymentMethods(i),
            i.status,
          ]),
          "revenue-report",
        ),
    },
    {
      name: "Profit & Loss",
      desc: `Revenue ${formatCurrency(totalRevenue)} − Expenses ${formatCurrency(totalExpenseAmt)}`,
      metric: formatCurrency(netProfit),
      delta: netProfit >= 0 ? "Net profit" : "Net loss",
      color: netProfit >= 0 ? "text-success" : "text-destructive",
      exportFn: () =>
        exportCSV(
          ["Category", "Amount"],
          [...expenseByCategory, ["Total Expenses", totalExpenseAmt], ["Net Profit", netProfit]],
          "profit-and-loss",
        ),
    },
    {
      name: "Booking Analytics",
      desc: `${checkedIn} checked in · ${noShows} no-shows`,
      metric: `${filteredBookings.length} bookings`,
      delta: `${noShowPct}% no-show rate`,
      color: "text-warning",
      exportFn: () =>
        exportCSV(
          ["Booking ID", "Customer", "Service", "Date", "Time", "Status"],
          filteredBookings.map((b) => [
            b.id,
            b.customerName,
            b.serviceName,
            b.date,
            b.time,
            b.status,
          ]),
          "bookings-report",
        ),
    },
    {
      name: "Customer Report",
      desc: `${returningCustomers.size} returning · ${newCustomers.size} new customers`,
      metric: `${retentionPct}% retention`,
      delta: `${customers.length} total customers`,
      color: "text-primary",
      exportFn: () =>
        exportCSV(
          ["Name", "Phone", "Tier", "Visits", "Spend", "Last Visit"],
          customers.map((c) => [
            c.name,
            c.phone,
            c.tier,
            c.visits,
            c.spend,
            c.lastVisit?.slice(0, 10) ?? "",
          ]),
          "customers-report",
        ),
    },
    {
      name: "Customer Lifetime Value",
      desc: topCustomer
        ? `Top: ${topCustomer.name} · ${formatCurrency(topCustomer.spend)}`
        : "No repeat customers yet",
      metric: formatCurrency(avgCLV),
      delta: "Average lifetime spend",
      color: "text-primary",
      exportFn: () =>
        exportCSV(
          ["Name", "Phone", "Visits", "Lifetime Spend", "Avg Order Value", "Tier"],
          rankedCustomers.map((c) => [c.name, c.phone, c.visits, c.spend, c.avgOrderValue, c.tier]),
          "customer-lifetime-value",
        ),
    },
    {
      name: "Inventory Report",
      desc: `${lowCount} low · ${outCount} out of stock`,
      metric: formatCurrency(stockValue),
      delta: `${inventory.length} SKUs on file`,
      color: "text-warning",
      exportFn: () =>
        exportCSV(
          ["Item", "SKU", "Category", "Stock", "Reorder", "Unit Cost", "Value"],
          inventory.map((i) => [
            i.name,
            i.sku,
            i.category,
            i.stock,
            i.reorder,
            i.cost,
            i.stock * i.cost,
          ]),
          "inventory-report",
        ),
    },
    {
      name: "Shift Summary",
      desc: `${closedShifts.length} shifts closed · avg variance ${formatCurrency(avgVariance)}`,
      metric: `${shifts.length} shifts`,
      delta:
        shifts.filter((s) => s.status === "OPEN").length > 0 ? "1 shift open" : "No open shift",
      color: "text-info",
      exportFn: () =>
        exportCSV(
          [
            "Shift ID",
            "Staff",
            "Opened",
            "Closed",
            "Cash Sales",
            "Card Sales",
            "Transfer Sales",
            "Expenses",
            "Variance",
          ],
          shifts.map((s) => [
            s.id,
            s.staffName,
            s.openedAt.slice(0, 16),
            s.closedAt?.slice(0, 16) ?? "",
            s.cashSales,
            s.cardSales,
            s.transferSales,
            s.totalExpenses,
            s.variance ?? "",
          ]),
          "shift-summary",
        ),
    },
  ];

  function exportCSV(headers: string[], rows: (string | number)[][], filename: string) {
    // RFC-4180 quoting (a customer named "Silva, Nimal" must not shift every
    // column right), plus a guard against spreadsheet formula injection: a
    // leading =, +, - or @ would execute when the file opens in Excel.
    const cell = (v: string | number): string => {
      let s = String(v);
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = `${filename}.csv`;
    a.click();
  }

  const periodLabel: Record<Period, string> = {
    today: "Today",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    all: "All time",
  };

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Reports"
        subtitle={`Period · ${periodLabel[period]}`}
        actions={
          <select
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {reports.map((r) => (
          <div
            key={r.name}
            className="rounded-xl border border-border bg-card p-5 shadow-card hover:shadow-elevated transition-shadow"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-display font-bold">{r.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{r.desc}</p>
              </div>
              <button
                onClick={r.exportFn}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Export CSV"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4">
              <div className={`font-display text-2xl font-extrabold ${r.color}`}>{r.metric}</div>
              <div className="text-[11px] text-muted-foreground font-semibold mt-0.5">
                {r.delta}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-card">
        <h2 className="font-display font-bold mb-4">Daily Revenue (LKR)</h2>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={dailyData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gCash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gCard" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gTransfer" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--info))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--info))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(val: number, name: string) => [
                formatCurrency(val),
                name === "cash" ? "Cash" : name === "card" ? "Card" : "Transfer",
              ]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend
              formatter={(v) => (v === "cash" ? "Cash" : v === "card" ? "Card" : "Transfer")}
            />
            <Area
              type="monotone"
              dataKey="cash"
              stroke="hsl(var(--primary))"
              fill="url(#gCash)"
              strokeWidth={2}
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="card"
              stroke="#6366f1"
              fill="url(#gCard)"
              strokeWidth={2}
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="transfer"
              stroke="hsl(var(--info))"
              fill="url(#gTransfer)"
              strokeWidth={2}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Top customers by lifetime value */}
      <div className="mt-4 rounded-xl border border-border bg-card shadow-card">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-display font-bold">Top Customers by Lifetime Value</h2>
        </div>

        {/* Mobile: stacked cards */}
        <div className="divide-y divide-border md:hidden">
          {rankedCustomers.slice(0, 10).map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.visits} visits · {c.tier} · avg {formatCurrency(c.avgOrderValue)}
                </div>
              </div>
              <span className="shrink-0 font-mono font-semibold">{formatCurrency(c.spend)}</span>
            </div>
          ))}
          {rankedCustomers.length === 0 && (
            <div className="px-5 py-6 text-center text-sm text-muted-foreground">
              No customers with a completed visit yet
            </div>
          )}
        </div>

        {/* Tablet/desktop: table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-2.5">Customer</th>
                <th className="text-right px-3 py-2.5">Visits</th>
                <th className="text-right px-3 py-2.5">Lifetime Spend</th>
                <th className="text-right px-3 py-2.5">Avg Order Value</th>
                <th className="text-left px-3 py-2.5">Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rankedCustomers.slice(0, 10).map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-2.5 font-medium">{c.name}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{c.visits}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold">
                    {formatCurrency(c.spend)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {formatCurrency(c.avgOrderValue)}
                  </td>
                  <td className="px-3 py-2.5">{c.tier}</td>
                </tr>
              ))}
              {rankedCustomers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">
                    No customers with a completed visit yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
