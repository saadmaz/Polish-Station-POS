// Plans (never writes) the Job/JobEvent backfill from existing Booking
// documents. Booking itself is unchanged in this stage — it keeps its
// status/tech/bay/price fields for now, so booking-sheet.tsx, the Bookings
// calendar, and the public booking widget keep working exactly as they do
// today. This migration reads that unchanged Booking shape and produces the
// Job/JobEvent pair that should exist alongside it; wiring the *creation*
// paths (booking-sheet.tsx, the public widget) to also create a Job is a
// separate, later step — this only backfills what already exists.
//
// Status mapping (confirmed):
//   Pending, Confirmed -> booked
//   Checked-In         -> arrived   (the old status never captured condition
//                                    photos/signature, so it can't honestly
//                                    become "checked_in" under the new
//                                    check-in requirements)
//   Completed          -> delivered (walk-in POS sales: serviced and paid
//                                    for in one visit)
//   No-Show             -> no_show
//   Cancelled           -> cancelled
//
// A mapped status other than "booked" requires having legally passed
// through every state before it (see job.ts's LEGAL_TRANSITIONS), so this
// synthesizes the full intermediate chain rather than a single event
// straight to the mapped status — every JobEvent in that synthesized chain
// is stamped at the booking's own createdAt (the only timestamp available)
// and carries a note saying so, rather than pretending to have finer-grained
// history the old system never recorded.
import { assertLegalTransition, type Job, type JobEvent, type JobStatus } from "./job";
import type { Booking, BookingStatus } from "./db";

const STATUS_MAP: Record<BookingStatus, JobStatus> = {
  Pending: "booked",
  Confirmed: "booked",
  "Checked-In": "arrived",
  Completed: "delivered",
  "No-Show": "no_show",
  Cancelled: "cancelled",
};

// The full legal chain each mapped status must have passed through.
const CHAIN_TO: Record<JobStatus, readonly JobStatus[]> = {
  booked: ["booked"],
  arrived: ["booked", "arrived"],
  checked_in: ["booked", "arrived", "checked_in"],
  in_progress: ["booked", "arrived", "checked_in", "in_progress"],
  qc: ["booked", "arrived", "checked_in", "in_progress", "qc"],
  ready: ["booked", "arrived", "checked_in", "in_progress", "qc", "ready"],
  delivered: ["booked", "arrived", "checked_in", "in_progress", "qc", "ready", "delivered"],
  cancelled: ["booked", "cancelled"],
  no_show: ["booked", "no_show"],
};

const SYNTHESIZED_NOTE =
  "Synthesized during Booking/Job migration — the original system recorded no intermediate status history.";

export interface BookingJobMigrationResult {
  jobs: Job[];
  jobEvents: JobEvent[];
  report: {
    totalBookings: number;
    byMappedStatus: Record<JobStatus, number>;
  };
}

export function buildBookingJobMigration(
  bookings: Booking[],
  actor: { id: string; name: string },
  generateId: () => string = () => crypto.randomUUID(),
): BookingJobMigrationResult {
  const jobs: Job[] = [];
  const jobEvents: JobEvent[] = [];
  const byMappedStatus: Record<JobStatus, number> = {
    booked: 0,
    arrived: 0,
    checked_in: 0,
    in_progress: 0,
    qc: 0,
    ready: 0,
    delivered: 0,
    cancelled: 0,
    no_show: 0,
  };

  for (const b of bookings) {
    const mapped = STATUS_MAP[b.status];
    const jobId = generateId();
    const chain = CHAIN_TO[mapped];

    let prev: JobStatus | null = null;
    for (const step of chain) {
      if (prev !== null) assertLegalTransition(prev, step);
      jobEvents.push({
        id: generateId(),
        jobId,
        fromStatus: prev,
        toStatus: step,
        actorId: actor.id,
        actorName: actor.name,
        at: b.createdAt,
        note: chain.length > 1 ? SYNTHESIZED_NOTE : null,
      });
      prev = step;
    }

    jobs.push({
      id: jobId,
      bookingId: b.id,
      vehicleId: null, // Vehicle cutover not wired into Booking/Job in this stage
      customerId: b.customerId,
      customerName: b.customerName,
      serviceId: b.serviceId,
      serviceName: b.serviceName,
      category: b.category,
      durationMin: b.durationMin,
      price: b.price,
      date: b.date,
      time: b.time,
      tech: b.tech,
      bay: b.bay,
      status: mapped,
      notes: b.notes,
      createdAt: b.createdAt,
      updatedAt: b.createdAt,
    });
    byMappedStatus[mapped]++;
  }

  return { jobs, jobEvents, report: { totalBookings: bookings.length, byMappedStatus } };
}
