import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Download, Printer } from "lucide-react";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "Reports — Polish Station OS" }] }),
  component: Reports,
});

const REPORTS = [
  {
    name: "Revenue Summary",
    desc: "By category, payment method, avg invoice value",
    metric: "LKR 1.42M",
    delta: "+18% MoM",
  },
  {
    name: "Job Performance",
    desc: "Completion rate, avg duration, overdue %, rework",
    metric: "284 jobs",
    delta: "92% on-time",
  },
  {
    name: "Booking Analytics",
    desc: "Cancellations, no-shows, conversion, peak hours",
    metric: "318 bookings",
    delta: "11% no-show",
  },
  {
    name: "Customer Report",
    desc: "New vs returning, retention, top spenders, tiers",
    metric: "67% returning",
    delta: "+12 new",
  },
  {
    name: "Inventory Report",
    desc: "Stock movement, consumption, COGS, waste",
    metric: "LKR 184k COGS",
    delta: "13% of rev",
  },
  {
    name: "Staff Report",
    desc: "Jobs per tech, revenue, commission, punctuality",
    metric: "6 active",
    delta: "94% attendance",
  },
  {
    name: "Financial P&L",
    desc: "Revenue, COGS, gross margin, discounts given",
    metric: "62% margin",
    delta: "+3pts MoM",
  },
];

function Reports() {
  return (
    <div className="p-6">
      <PageHeader
        title="Reports"
        subtitle="Period · Last 30 days"
        actions={
          <>
            <select className="rounded-md border border-input bg-background px-3 py-1.5 text-sm">
              <option>Last 30 days</option>
              <option>This Month</option>
              <option>Last Month</option>
              <option>Custom</option>
            </select>
            <button className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent">
              <Printer className="h-4 w-4" /> Print
            </button>
            <button className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90">
              <Download className="h-4 w-4" /> Export PDF
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {REPORTS.map((r) => (
          <div
            key={r.name}
            className="rounded-xl border border-border bg-card p-5 shadow-card hover:shadow-elevated cursor-pointer transition-shadow"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-display font-bold">{r.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-[80%]">{r.desc}</p>
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="font-display text-2xl font-extrabold text-primary">{r.metric}</div>
                <div className="text-[11px] text-success font-semibold mt-0.5">{r.delta}</div>
              </div>
              <svg viewBox="0 0 80 28" className="h-10 w-24">
                <polyline
                  points="0,22 10,18 20,20 30,14 40,16 50,8 60,11 70,5 80,7"
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
