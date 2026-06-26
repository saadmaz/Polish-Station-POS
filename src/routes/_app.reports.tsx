import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Download } from "lucide-react";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "Reports — Polish Station OS" }] }),
  component: Reports,
});

type Period = "today" | "7d" | "30d" | "all";

function dateFrom(period: Period): string {
  const d = new Date();
  if (period === "today") return d.toISOString().slice(0, 10);
  if (period === "7d") { d.setDate(d.getDate() - 7); return d.toISOString(); }
  if (period === "30d") { d.setDate(d.getDate() - 30); return d.toISOString(); }
  return "1970-01-01";
}

function Sparkline() {
  return (
    <svg viewBox="0 0 80 28" className="h-10 w-24">
      <polyline points="0,22 10,18 20,20 30,14 40,16 50,8 60,11 70,5 80,7" fill="none" stroke="var(--primary)" strokeWidth="1.5" />
    </svg>
  );
}

function Reports() {
  const { invoices, jobs, bookings, customers, inventory, shifts } = useStore();
  const [period, setPeriod] = useState<Period>("30d");

  const since = dateFrom(period);
  const filteredInvoices = invoices.filter((i) => i.createdAt >= since && i.status !== "Void");
  const filteredJobs = jobs.filter((j) => j.createdAt >= since);
  const filteredBookings = bookings.filter((b) => (b.date + "T00:00:00") >= since);

  // Revenue stats
  const totalRevenue = filteredInvoices.reduce((s, i) => s + i.total, 0);
  const cashRevenue = filteredInvoices.filter((i) => i.method === "Cash").reduce((s, i) => s + i.total, 0);
  const cardRevenue = filteredInvoices.filter((i) => i.method !== "Cash").reduce((s, i) => s + i.total, 0);
  const avgInvoice = filteredInvoices.length > 0 ? Math.round(totalRevenue / filteredInvoices.length) : 0;

  // Job stats
  const completedJobs = filteredJobs.filter((j) => j.status === "Done Today" || j.completedAt);
  const onTimeJobs = completedJobs.filter((j) => j.elapsedMin <= j.estimateMin);
  const onTimePct = completedJobs.length > 0 ? Math.round((onTimeJobs.length / completedJobs.length) * 100) : 0;
  const avgDuration = completedJobs.length > 0 ? Math.round(completedJobs.reduce((s, j) => s + j.elapsedMin, 0) / completedJobs.length) : 0;

  // Booking stats
  const noShows = filteredBookings.filter((b) => b.status === "No-Show").length;
  const noShowPct = filteredBookings.length > 0 ? Math.round((noShows / filteredBookings.length) * 100) : 0;
  const checkedIn = filteredBookings.filter((b) => b.status === "Checked-In").length;

  // Customer stats
  const returningPlates = new Set<string>();
  const newPlates = new Set<string>();
  const sinceDate = since.slice(0, 10);
  filteredJobs.forEach((j) => {
    if (!j.plate) return;
    const hadPriorJob = jobs.some((x) => x.plate === j.plate && x.createdAt.slice(0, 10) < sinceDate);
    if (hadPriorJob) returningPlates.add(j.plate);
    else newPlates.add(j.plate);
  });
  const retentionPct = (returningPlates.size + newPlates.size) > 0
    ? Math.round((returningPlates.size / (returningPlates.size + newPlates.size)) * 100)
    : 0;

  // Inventory stats
  const stockValue = inventory.reduce((s, i) => s + i.stock * i.cost, 0);
  const lowCount = inventory.filter((i) => i.stock > 0 && i.stock <= i.reorder).length;
  const outCount = inventory.filter((i) => i.stock === 0).length;

  // Shift stats
  const closedShifts = shifts.filter((s) => s.status === "CLOSED");
  const avgVariance = closedShifts.length > 0
    ? Math.round(closedShifts.reduce((s, sh) => s + Math.abs(sh.variance ?? 0), 0) / closedShifts.length)
    : 0;

  const reports = [
    {
      name: "Revenue Summary",
      desc: `Cash LKR ${cashRevenue.toLocaleString()} · Card LKR ${cardRevenue.toLocaleString()}`,
      metric: totalRevenue > 0 ? `LKR ${totalRevenue.toLocaleString()}` : "LKR 0",
      delta: `Avg invoice LKR ${avgInvoice.toLocaleString()}`,
      color: "text-success",
      exportFn: () => exportCSV(
        ["Invoice ID", "Customer", "Date", "Total", "Method", "Status"],
        filteredInvoices.map((i) => [i.id, i.customerName, i.createdAt.slice(0, 10), i.total, i.method, i.status]),
        "revenue-report",
      ),
    },
    {
      name: "Job Performance",
      desc: `${completedJobs.length} completed · ${avgDuration}m avg duration`,
      metric: `${filteredJobs.length} jobs`,
      delta: `${onTimePct}% on-time`,
      color: "text-info",
      exportFn: () => exportCSV(
        ["Job ID", "Customer", "Service", "Tech", "Status", "Elapsed", "Estimate"],
        filteredJobs.map((j) => [j.id, j.customerName, j.serviceName, j.tech, j.status, j.elapsedMin, j.estimateMin]),
        "job-performance",
      ),
    },
    {
      name: "Booking Analytics",
      desc: `${checkedIn} checked in · ${noShows} no-shows`,
      metric: `${filteredBookings.length} bookings`,
      delta: `${noShowPct}% no-show rate`,
      color: "text-warning",
      exportFn: () => exportCSV(
        ["Booking ID", "Customer", "Service", "Date", "Time", "Status"],
        filteredBookings.map((b) => [b.id, b.customerName, b.serviceName, b.date, b.time, b.status]),
        "bookings-report",
      ),
    },
    {
      name: "Customer Report",
      desc: `${returningPlates.size} returning · ${newPlates.size} new vehicles`,
      metric: `${retentionPct}% retention`,
      delta: `${customers.length} total customers`,
      color: "text-primary",
      exportFn: () => exportCSV(
        ["Name", "Phone", "Tier", "Visits", "Spend", "Last Visit"],
        customers.map((c) => [c.name, c.phone, c.tier, c.visits, c.spend, c.lastVisit?.slice(0, 10) ?? ""]),
        "customers-report",
      ),
    },
    {
      name: "Inventory Report",
      desc: `${lowCount} low · ${outCount} out of stock`,
      metric: `LKR ${stockValue.toLocaleString()}`,
      delta: `${inventory.length} SKUs on file`,
      color: "text-warning",
      exportFn: () => exportCSV(
        ["Item", "SKU", "Category", "Stock", "Reorder", "Unit Cost", "Value"],
        inventory.map((i) => [i.name, i.sku, i.category, i.stock, i.reorder, i.cost, i.stock * i.cost]),
        "inventory-report",
      ),
    },
    {
      name: "Shift Summary",
      desc: `${closedShifts.length} shifts closed · avg variance LKR ${avgVariance}`,
      metric: `${shifts.length} shifts`,
      delta: shifts.filter((s) => s.status === "OPEN").length > 0 ? "1 shift open" : "No open shift",
      color: "text-info",
      exportFn: () => exportCSV(
        ["Shift ID", "Staff", "Opened", "Closed", "Cash Sales", "Card Sales", "Expenses", "Variance"],
        shifts.map((s) => [s.id, s.staffName, s.openedAt.slice(0, 16), s.closedAt?.slice(0, 16) ?? "", s.cashSales, s.cardSales, s.totalExpenses, s.variance ?? ""]),
        "shift-summary",
      ),
    },
  ];

  function exportCSV(headers: string[], rows: (string | number)[][], filename: string) {
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = `${filename}.csv`;
    a.click();
  }

  const periodLabel: Record<Period, string> = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", all: "All time" };

  return (
    <div className="p-6">
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {reports.map((r) => (
          <div key={r.name} className="rounded-xl border border-border bg-card p-5 shadow-card hover:shadow-elevated transition-shadow">
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
            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className={`font-display text-2xl font-extrabold ${r.color}`}>{r.metric}</div>
                <div className="text-[11px] text-muted-foreground font-semibold mt-0.5">{r.delta}</div>
              </div>
              <Sparkline />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
