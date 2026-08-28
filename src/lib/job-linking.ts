// Keeps revenue and the bookings timeline from ever disagreeing.
//
// Root cause of the original "Revenue Today: LKR 7,080 / Today's Timeline:
// no bookings" defect: Invoice had no relationship to Booking at all, so a
// walk-in POS sale could produce revenue with nothing on the timeline. This
// module is the one place that revenue-without-a-job gap gets closed: given
// a checkout with no pre-existing booking, it synthesizes a same-day,
// already-finished Booking so the sale always has a timeline entry, dated by
// the exact same business-day rule the dashboard queries use.
import { businessDateOf, businessTimeOf } from "./business-day";
import type { Booking, BookingStatus, InvoiceLine, Service } from "./db";

export interface WalkInBookingInput {
  invoiceId: string;
  createdAt: string; // ISO instant the invoice was created at
  customerId: string | null;
  customerName: string;
  plate: string;
  vehicleModel: string;
  lines: InvoiceLine[];
  total: number;
  servicesCatalog: Service[];
}

const FALLBACK_CATEGORY: Booking["category"] = "Exterior";

/**
 * Builds (but does not write) a Booking representing a walk-in POS sale
 * that has no booking of its own. Callers are responsible for allocating
 * `bookingId` (the normal sequential-id counter, same as any other booking)
 * and persisting the result.
 *
 * Best-effort only for service/category/duration: InvoiceLine doesn't carry
 * a serviceId (a custom/ad-hoc line has none to carry), so this matches by
 * line name against the services catalog and falls back to a generic
 * category for anything it can't match. That's an acceptable approximation
 * for "does a job record exist for this day's revenue", not a claim that
 * the synthesized booking perfectly describes the work performed.
 */
export function synthesizeWalkInBooking(input: WalkInBookingInput, bookingId: string): Booking {
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
    id: bookingId,
    customerId: input.customerId,
    customerName: input.customerName,
    phone: "",
    plate: input.plate,
    vehicleModel: input.vehicleModel,
    serviceId: matchedFirst?.id ?? "",
    serviceName,
    category: matchedFirst?.category ?? FALLBACK_CATEGORY,
    durationMin,
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
