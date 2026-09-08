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
import type { LeadStatus, PreferredWindow, WebsiteBookingService } from "./db";

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

// ─── Preferred time window ──────────────────────────────────────────────────
// The site's fixed four-slot menu. Exact strings matter: they're what the
// site's own "Preferred time" dropdown has always displayed, which is also
// what ends up littered through old `notes` text (see
// parsePreferredWindowFromNotes below) -- matching against these exact
// labels is what lets the migration tell a genuine time window apart from
// unrelated customer text without guessing.
export const PREFERRED_WINDOW_LABELS: Record<PreferredWindow, string> = {
  "08_11": "8:00 AM - 11:00 AM",
  "11_14": "11:00 AM - 2:00 PM",
  "14_17": "2:00 PM - 5:00 PM",
  "17_19": "5:00 PM - 7:00 PM",
};

const NOTES_PREFERRED_TIME_RE = /\n*Preferred time:\s*([^\n]+?)\s*$/i;

/**
 * Finds the site's old "Preferred time: H:MM AM/PM - H:MM AM/PM" workaround
 * at the end of a lead's `notes` and, only when it matches one of the four
 * known window labels exactly, returns the enum value plus `notes` with that
 * line removed. Returns null (never guesses) when there's no match or the
 * embedded text doesn't exactly match a known label -- callers must leave
 * those records untouched and flag them for manual review, per the Phase 1.1
 * migration's "do not guess" rule.
 */
export function parsePreferredWindowFromNotes(
  notes: string,
): { window: PreferredWindow; notes: string } | null {
  const match = NOTES_PREFERRED_TIME_RE.exec(notes);
  if (!match) return null;
  const embedded = match[1].trim();
  const window = (Object.keys(PREFERRED_WINDOW_LABELS) as PreferredWindow[]).find(
    (w) => PREFERRED_WINDOW_LABELS[w] === embedded,
  );
  if (!window) return null;
  return { window, notes: notes.slice(0, match.index).trimEnd() };
}

// ─── Service reconciliation ─────────────────────────────────────────────────
// A booking lead carries its requested service one of two ways depending on
// origin: `services`/`otherService` (the website's checkbox list) or
// `serviceId` (the staff "New Lead" dialog's real-catalog dropdown) — never
// both on the same lead. This is the single place that folds either shape
// into the canonical `serviceIds` array new writes populate (see db.ts).
export function reconcileServiceIds(lead: {
  serviceId?: string;
  services?: WebsiteBookingService[];
  otherService?: string;
}): string[] {
  if (lead.services && lead.services.length > 0) {
    return lead.services.map((s) => (s === "Other" && lead.otherService ? lead.otherService : s));
  }
  return lead.serviceId ? [lead.serviceId] : [];
}
