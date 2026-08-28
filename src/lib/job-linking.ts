// Keeps revenue and the work timeline from ever disagreeing.
//
// Root cause of the original "Revenue Today: LKR 7,080 / Today's Timeline:
// no bookings" defect: Invoice had no relationship to any work record at
// all, so a walk-in POS sale could produce revenue with nothing on the
// timeline. Two synthesis functions live here, for two different purposes:
//
// - synthesizeWalkInJob: the LIVE path. A new walk-in POS sale (no
//   pre-existing booking) gets a Job created directly — bookingId: null,
//   since nothing was ever promised — with a full synthesized JobEvent
//   chain to "delivered" (the work is already done and paid for by the
//   time checkout happens). This is what store.tsx's addInvoice() calls
//   for a new sale with no job/booking passed in.
//
// - synthesizeWalkInBooking: the HISTORICAL path, kept for
//   invoice-booking-backfill.ts, which backfills Invoice.bookingId for
//   invoices written before that field (or Job) existed at all. It still
//   produces a Booking, not a Job, because the Booking/Job split migration
//   (booking-job-migration.ts) already knows how to turn any Booking —
//   including one synthesized this way — into a Job, so there's no reason
//   for this one-time historical tool to duplicate that logic.
import { businessDateOf, businessTimeOf } from "./business-day";
import type { Booking, BookingStatus, InvoiceLine, Service } from "./db";
import type { Job, JobEvent, JobStatus } from "./job";

export interface WalkInInput {
  createdAt: string;
  customerId: string | null;
  customerName: string;
  plate: string;
  vehicleModel: string;
  lines: InvoiceLine[];
  total: number;
  servicesCatalog: Service[];
}

const FALLBACK_CATEGORY: Service["category"] = "Exterior";

interface MatchedServiceInfo {
  serviceId: string;
  serviceName: string;
  category: Service["category"];
  durationMin: number;
}

function matchServiceInfo(input: WalkInInput): MatchedServiceInfo {
  const findService = (lineName: string) => input.servicesCatalog.find((s) => s.name === lineName);

  const firstLine = input.lines[0];
  const matchedFirst = firstLine ? findService(firstLine.name) : undefined;
  const durationMin = input.lines.reduce(
    (sum, l) => sum + (findService(l.name)?.durationMin ?? 0),
    0,
  );

  const serviceName =
    input.lines.length > 1
      ? `${firstLine?.name ?? "Walk-in sale"} +${input.lines.length - 1} more`
      : (firstLine?.name ?? "Walk-in sale");

  return {
    serviceId: matchedFirst?.id ?? "",
    serviceName,
    category: matchedFirst?.category ?? FALLBACK_CATEGORY,
    durationMin,
  };
}

export interface WalkInBookingInput extends WalkInInput {
  invoiceId: string;
}

/**
 * Best-effort only for service/category/duration: InvoiceLine doesn't carry
 * a serviceId (a custom/ad-hoc line has none to carry), so this matches by
 * line name against the services catalog and falls back to a generic
 * category for anything it can't match.
 */
export function synthesizeWalkInBooking(input: WalkInBookingInput, bookingId: string): Booking {
  const matched = matchServiceInfo(input);

  return {
    id: bookingId,
    customerId: input.customerId,
    customerName: input.customerName,
    phone: "",
    plate: input.plate,
    vehicleModel: input.vehicleModel,
    ...matched,
    price: input.total,
    date: businessDateOf(input.createdAt),
    time: businessTimeOf(input.createdAt),
    tech: "",
    bay: "",
    status: "Completed" satisfies BookingStatus,
    notes: `Auto-created from POS walk-in sale ${input.invoiceId}`,
    createdAt: input.createdAt,
  };
}

export interface SynthesizedWalkInJob {
  job: Job;
  events: JobEvent[];
}

const WALK_IN_CHAIN: readonly JobStatus[] = [
  "booked",
  "arrived",
  "checked_in",
  "in_progress",
  "qc",
  "ready",
  "delivered",
];

/**
 * Builds a Job already at "delivered" for a walk-in POS sale with no
 * pre-existing booking/job, plus the full JobEvent chain leading to it — a
 * "delivered" job's history must contain that chain to stay consistent with
 * job.ts's transition graph (delivered is only legally reachable by walking
 * every step), so this collapses all of them to the sale's own instant
 * rather than skip straight to the end state.
 */
export function synthesizeWalkInJob(
  input: WalkInInput,
  jobId: string,
  actor: { id: string; name: string },
): SynthesizedWalkInJob {
  const matched = matchServiceInfo(input);

  const job: Job = {
    id: jobId,
    bookingId: null,
    vehicleId: null, // Vehicle cutover not wired into Job in this stage
    customerId: input.customerId,
    customerName: input.customerName,
    ...matched,
    price: input.total,
    date: businessDateOf(input.createdAt),
    time: businessTimeOf(input.createdAt),
    tech: "",
    bay: "",
    status: "delivered",
    notes: "Walk-in POS sale — no pre-existing booking.",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };

  let prev: JobStatus | null = null;
  const events: JobEvent[] = WALK_IN_CHAIN.map((step) => {
    const event: JobEvent = {
      id: crypto.randomUUID(),
      jobId,
      fromStatus: prev,
      toStatus: step,
      actorId: actor.id,
      actorName: actor.name,
      at: input.createdAt,
      note: "Walk-in sale: service completed and paid for in one visit, intermediate stages collapsed to the sale instant.",
    };
    prev = step;
    return event;
  });

  return { job, events };
}
