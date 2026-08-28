// The work entity. Booking stays "the promise" (customer, requested
// services, requested datetime — unchanged in this stage, see the module
// note in booking-job-migration.ts for why); Job is what actually happens,
// and JobEvent is the append-only record of every status change. Duration
// between states is always derived from JobEvents (see durationBetweenMs),
// never stored as a mutable field on the Job itself.
import type { ServiceCategory } from "./db";

export type JobStatus =
  | "booked"
  | "arrived"
  | "checked_in"
  | "in_progress"
  | "qc"
  | "ready"
  | "delivered"
  | "cancelled"
  | "no_show";

export interface Job {
  id: string;
  bookingId: string | null; // nullable — walk-ins have no promise behind them
  vehicleId: string | null; // nullable until the Vehicle cutover lands (not this stage)
  customerId: string | null;
  customerName: string;
  serviceId: string;
  serviceName: string;
  category: ServiceCategory;
  durationMin: number;
  price: number;
  date: string; // YYYY-MM-DD business date — the job's own date, not necessarily the booking's
  time: string; // HH:MM
  tech: string;
  bay: string;
  status: JobStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobEvent {
  id: string;
  jobId: string;
  fromStatus: JobStatus | null; // null only for the creation event
  toStatus: JobStatus;
  actorId: string;
  actorName: string;
  at: string;
  note: string | null;
}

// ── The legal transition graph — the one place this is defined. Every
// status-changing write (live or migration) must go through
// assertLegalTransition()/buildTransitionEvent() below rather than setting
// `status` directly. ──────────────────────────────────────────────────────
//
//   booked -> arrived -> checked_in -> in_progress -> qc -> ready -> delivered
//   qc -> in_progress                          (rework loop)
//   booked -> no_show                          (no_show only makes sense
//                                                before the vehicle arrives)
//   {booked,arrived,checked_in,in_progress,qc,ready} -> cancelled
//                                               (cancellable any time before
//                                                it's actually handed back)
//   {delivered, cancelled, no_show}             (terminal — no way out)
const LEGAL_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  booked: ["arrived", "cancelled", "no_show"],
  arrived: ["checked_in", "cancelled"],
  checked_in: ["in_progress", "cancelled"],
  in_progress: ["qc", "cancelled"],
  qc: ["ready", "in_progress", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
  no_show: [],
};

export const TERMINAL_STATUSES: readonly JobStatus[] = ["delivered", "cancelled", "no_show"];

export class IllegalJobTransitionError extends Error {
  constructor(
    public readonly from: JobStatus,
    public readonly to: JobStatus,
  ) {
    super(`Illegal job transition: "${from}" -> "${to}"`);
    this.name = "IllegalJobTransitionError";
  }
}

export function isLegalTransition(from: JobStatus, to: JobStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

/** Throws IllegalJobTransitionError rather than allowing (or silently
 *  ignoring) an illegal move. */
export function assertLegalTransition(from: JobStatus, to: JobStatus): void {
  if (!isLegalTransition(from, to)) {
    throw new IllegalJobTransitionError(from, to);
  }
}

/**
 * Builds (does not write) the JobEvent a transition would record, after
 * validating it's legal. Callers commit this atomically with the Job's own
 * status update (see store.tsx wiring) — this function is deliberately
 * side-effect-free so the check can never be bypassed by a caller that
 * forgets to call it before writing.
 */
export function buildTransitionEvent(
  job: Pick<Job, "id" | "status">,
  toStatus: JobStatus,
  actor: { id: string; name: string },
  at: string,
  note: string | null = null,
): JobEvent {
  assertLegalTransition(job.status, toStatus);
  return {
    id: crypto.randomUUID(),
    jobId: job.id,
    fromStatus: job.status,
    toStatus,
    actorId: actor.id,
    actorName: actor.name,
    at,
    note,
  };
}

/**
 * Milliseconds between the first event reaching `fromStatus` and the first
 * event reaching `toStatus`, derived from `events` — this is the only way
 * "duration in a stage" is ever computed; it is never a stored field.
 * Returns null if either boundary event is missing (e.g. asking about
 * "ready -> delivered" for a job not yet delivered).
 */
export function durationBetweenMs(
  events: readonly JobEvent[],
  fromStatus: JobStatus,
  toStatus: JobStatus,
): number | null {
  const fromEvent = events.find((e) => e.toStatus === fromStatus);
  const toEvent = events.find((e) => e.toStatus === toStatus);
  if (!fromEvent || !toEvent) return null;
  return new Date(toEvent.at).getTime() - new Date(fromEvent.at).getTime();
}
