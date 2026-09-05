import { describe, it, expect } from "vitest";
import {
  isLegalLeadTransition,
  assertLegalLeadTransition,
  IllegalLeadTransitionError,
} from "./lead";
import type { LeadStatus } from "./db";

const NON_TERMINAL: LeadStatus[] = ["new", "contacted", "quoted"];
const TERMINAL: LeadStatus[] = ["converted", "lost", "duplicate", "archived"];

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
      for (const to of [...NON_TERMINAL, ...TERMINAL]) {
        if (from === to) continue;
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
    expect(() => assertLegalLeadTransition("converted", "new")).toThrow(
      IllegalLeadTransitionError,
    );
  });
  it("throws for re-entering a terminal status from itself", () => {
    expect(() => assertLegalLeadTransition("lost", "lost")).toThrow(IllegalLeadTransitionError);
  });
});
