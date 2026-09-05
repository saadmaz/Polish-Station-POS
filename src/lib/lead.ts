// The Lead status transition graph — the one place this is defined. Every
// status-changing write (addLead's initial "new" aside) must go through
// assertLegalLeadTransition() below rather than setting `status` directly.
// Mirrors job.ts's LEGAL_TRANSITIONS shape; firestore.rules keeps an
// independent, hand-synced copy of this same table (same precedent as
// job.ts's LEGAL_TRANSITIONS vs. the jobEvents rule).
//
//   new -> contacted -> quoted -> converted   (quoted is an optional
//                                               waypoint — skippable)
//   {new, contacted, quoted} -> lost           (requires a reason, see db.ts)
//   {new, contacted, quoted} -> duplicate      (requires duplicateOf, see db.ts)
//   {new, contacted, quoted} -> archived       (existing one-way Archive button)
//   {converted, lost, duplicate, archived}     (terminal — no way out)
//
// "contacted" is also a skippable waypoint, not a mandatory gate: a walk-in
// lead standing at the counter can convert in the same visit it was
// created, without a "mark contacted" formality first.
import type { LeadStatus } from "./db";

const LEGAL_LEAD_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  new: ["contacted", "quoted", "converted", "lost", "duplicate", "archived"],
  contacted: ["quoted", "converted", "lost", "duplicate", "archived"],
  quoted: ["converted", "lost", "duplicate", "archived"],
  converted: [],
  lost: [],
  duplicate: [],
  archived: [],
};

export class IllegalLeadTransitionError extends Error {
  constructor(
    public readonly from: LeadStatus,
    public readonly to: LeadStatus,
  ) {
    super(`Illegal lead transition: "${from}" -> "${to}"`);
    this.name = "IllegalLeadTransitionError";
  }
}

// Thrown by convertLeadToBooking/convertLeadToInvoiceLink (store.tsx) when
// the transaction's own read finds the lead already converted — the
// concurrency guard that makes "two staff converting the same lead
// simultaneously" produce exactly one artifact, not two.
export class LeadAlreadyConvertedError extends Error {
  constructor(public readonly leadId: string) {
    super(`Lead ${leadId} was already converted`);
    this.name = "LeadAlreadyConvertedError";
  }
}

export function isLegalLeadTransition(from: LeadStatus, to: LeadStatus): boolean {
  return LEGAL_LEAD_TRANSITIONS[from].includes(to);
}

/** Throws IllegalLeadTransitionError rather than allowing (or silently
 *  ignoring) an illegal move. */
export function assertLegalLeadTransition(from: LeadStatus, to: LeadStatus): void {
  if (!isLegalLeadTransition(from, to)) {
    throw new IllegalLeadTransitionError(from, to);
  }
}
