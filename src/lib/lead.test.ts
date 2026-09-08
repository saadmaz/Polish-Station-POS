import { describe, it, expect } from "vitest";
import {
  isLegalLeadTransition,
  assertLegalLeadTransition,
  IllegalLeadTransitionError,
  parsePreferredWindowFromNotes,
  reconcileServiceIds,
} from "./lead";
import type { LeadStatus } from "./db";

const NON_TERMINAL: LeadStatus[] = ["new", "contacted", "quoted"];
// lost/archived are reachable from every non-terminal status (see below) but
// are no longer fully terminal themselves -- Reopen/Restore send them back
// to "new". converted/duplicate remain the only true dead ends.
const TERMINAL: LeadStatus[] = ["converted", "duplicate"];
const REOPENABLE: LeadStatus[] = ["lost", "archived"];

describe("the happy-path chain is entirely legal", () => {
  it("new -> contacted -> quoted -> converted, each step legal", () => {
    expect(isLegalLeadTransition("new", "contacted")).toBe(true);
    expect(isLegalLeadTransition("contacted", "quoted")).toBe(true);
    expect(isLegalLeadTransition("quoted", "converted")).toBe(true);
  });
});

describe("quoted and contacted are both skippable waypoints", () => {
  it("new can go straight to converted", () => {
    expect(isLegalLeadTransition("new", "converted")).toBe(true);
  });
  it("contacted can go straight to converted", () => {
    expect(isLegalLeadTransition("contacted", "converted")).toBe(true);
  });
});

describe("lost, duplicate and archived", () => {
  it("are reachable from every non-terminal status", () => {
    for (const from of NON_TERMINAL) {
      expect(isLegalLeadTransition(from, "lost")).toBe(true);
      expect(isLegalLeadTransition(from, "duplicate")).toBe(true);
      expect(isLegalLeadTransition(from, "archived")).toBe(true);
    }
  });
});

describe("terminal statuses", () => {
  it("have no legal transitions out", () => {
    for (const from of TERMINAL) {
      for (const to of [...NON_TERMINAL, ...TERMINAL, ...REOPENABLE]) {
        if (from === to) continue;
        expect(isLegalLeadTransition(from, to)).toBe(false);
      }
    }
  });
});

describe("lost and archived can be reopened, but only back to new", () => {
  it("lost -> new is legal (Reopen)", () => {
    expect(isLegalLeadTransition("lost", "new")).toBe(true);
  });
  it("archived -> new is legal (Restore)", () => {
    expect(isLegalLeadTransition("archived", "new")).toBe(true);
  });
  it("neither has any other way out", () => {
    for (const from of REOPENABLE) {
      for (const to of [...NON_TERMINAL, ...TERMINAL, ...REOPENABLE]) {
        if (to === "new" || from === to) continue;
        expect(isLegalLeadTransition(from, to)).toBe(false);
      }
    }
  });
});

describe("assertLegalLeadTransition", () => {
  it("does not throw for a legal transition", () => {
    expect(() => assertLegalLeadTransition("new", "contacted")).not.toThrow();
  });
  it("throws IllegalLeadTransitionError for an illegal transition", () => {
    expect(() => assertLegalLeadTransition("converted", "new")).toThrow(IllegalLeadTransitionError);
  });
  it("throws for re-entering a terminal status from itself", () => {
    expect(() => assertLegalLeadTransition("converted", "converted")).toThrow(
      IllegalLeadTransitionError,
    );
  });
});

describe("parsePreferredWindowFromNotes", () => {
  it("extracts a known window and strips it from notes, matching the real prod pattern", () => {
    expect(parsePreferredWindowFromNotes("hii\n\nPreferred time: 8:00 AM - 11:00 AM")).toEqual({
      window: "08_11",
      notes: "hii",
    });
  });

  it("handles each of the four known windows", () => {
    expect(parsePreferredWindowFromNotes("Preferred time: 11:00 AM - 2:00 PM")?.window).toBe(
      "11_14",
    );
    expect(parsePreferredWindowFromNotes("Preferred time: 2:00 PM - 5:00 PM")?.window).toBe(
      "14_17",
    );
    expect(parsePreferredWindowFromNotes("Preferred time: 5:00 PM - 7:00 PM")?.window).toBe(
      "17_19",
    );
  });

  it("returns null when there's no embedded preferred-time text", () => {
    expect(parsePreferredWindowFromNotes("just a normal note")).toBeNull();
  });

  it("returns null (never guesses) when the embedded text doesn't match a known label exactly", () => {
    expect(parsePreferredWindowFromNotes("Preferred time: sometime this week")).toBeNull();
  });
});

describe("reconcileServiceIds", () => {
  it("uses the website's services[] when present, substituting otherService for 'Other'", () => {
    expect(
      reconcileServiceIds({ services: ["Paint Correction", "Other"], otherService: "Vinyl wrap" }),
    ).toEqual(["Paint Correction", "Vinyl wrap"]);
  });

  it("falls back to the staff dialog's single serviceId when services[] is absent", () => {
    expect(reconcileServiceIds({ serviceId: "svc-1" })).toEqual(["svc-1"]);
  });

  it("returns an empty array when neither is set", () => {
    expect(reconcileServiceIds({})).toEqual([]);
  });
});
