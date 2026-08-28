// Single computation for every Operations Dashboard card. Before this, each
// card (Revenue Today / Today's Timeline / Upcoming (Today) / Outstanding)
// independently recomputed "today" and independently decided which
// statuses counted, which is how they drifted out of sync. Every card must
// now read a field off the object this module returns rather than filtering
// `invoices`/`jobs` itself.
//
// Reads Job, not Booking: Job is the work record (see job.ts) — Booking is
// still just "the promise" and isn't itself something to put on a work
// timeline. Revenue links to Job via Invoice.jobId (job-linking.ts).
import { isInBusinessDay, todayBusinessDate } from "./business-day";
import type { Invoice } from "./db";
import type { Job } from "./job";

export interface DashboardMetrics {
  businessDate: string;
  /** Jobs whose `date` is `businessDate`, all statuses — completed and
   *  in-progress work included, not just future-scheduled items. */
  timelineJobs: Job[];
  /** Sum of non-void, non-draft invoice totals created within `businessDate`. */
  revenueToday: number;
  /** Count of today's jobs still ahead ("booked": not yet arrived). */
  upcomingToday: number;
  /** All-time balance still owed across every non-void invoice. */
  outstanding: number;
}

const REVENUE_EXCLUDED_STATUSES: ReadonlySet<Invoice["status"]> = new Set(["Void", "Draft"]);

export function computeDashboardMetrics(
  invoices: Invoice[],
  jobs: Job[],
  businessDate: string = todayBusinessDate(),
): DashboardMetrics {
  const timelineJobs = jobs.filter((j) => j.date === businessDate);

  const revenueToday = invoices
    .filter(
      (i) => !REVENUE_EXCLUDED_STATUSES.has(i.status) && isInBusinessDay(i.createdAt, businessDate),
    )
    .reduce((sum, i) => sum + i.total, 0);

  const upcomingToday = timelineJobs.filter((j) => j.status === "booked").length;

  const outstanding = invoices
    .filter((i) => i.status === "Issued" || i.status === "Partially Paid")
    .reduce((sum, i) => sum + i.total, 0);

  return { businessDate, timelineJobs, revenueToday, upcomingToday, outstanding };
}

/**
 * Sum of revenue attributed to each timeline item for `businessDate`, by
 * following `Invoice.jobId`. This is the audit function: it must equal
 * `computeDashboardMetrics(...).revenueToday` for any invoice/job set where
 * every invoice has a jobId pointing at a same-day job — which addInvoice()
 * now guarantees (see job-linking.ts's synthesizeWalkInJob). If they ever
 * diverge, either an invoice was created without a jobId, or the linked
 * job's `date` doesn't match the invoice's own business day.
 */
export function timelineRevenueTotal(
  invoices: Invoice[],
  jobs: Job[],
  businessDate: string = todayBusinessDate(),
): number {
  const revenueByJobId = new Map<string, number>();
  for (const inv of invoices) {
    if (REVENUE_EXCLUDED_STATUSES.has(inv.status) || !inv.jobId) continue;
    revenueByJobId.set(inv.jobId, (revenueByJobId.get(inv.jobId) ?? 0) + inv.total);
  }

  return jobs
    .filter((j) => j.date === businessDate)
    .reduce((sum, j) => sum + (revenueByJobId.get(j.id) ?? 0), 0);
}
