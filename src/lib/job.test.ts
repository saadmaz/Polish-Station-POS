import { describe, it, expect } from "vitest";
import {
  isLegalTransition,
  assertLegalTransition,
  buildTransitionEvent,
  durationBetweenMs,
  IllegalJobTransitionError,
  TERMINAL_STATUSES,
  type JobStatus,
} from "./job";

const ACTOR = { id: "staff-1", name: "Imran S." };

describe("the happy-path chain is entirely legal", () => {
  const chain: JobStatus[] = [
    "booked",
    "arrived",
    "checked_in",
    "in_progress",
    "qc",
    "ready",
    "delivered",
  ];
  it("every consecutive step is a legal transition", () => {
    for (let i = 0; i < chain.length - 1; i++) {
      expect(isLegalTransition(chain[i], chain[i + 1])).toBe(true);
    }
  });
});

describe("the qc -> in_progress rework loop", () => {
  it("is legal", () => {
    expect(isLegalTransition("qc", "in_progress")).toBe(true);
  });
});

describe("no_show", () => {
  it("is reachable only from booked", () => {
    expect(isLegalTransition("booked", "no_show")).toBe(true);
    for (const from of ["arrived", "checked_in", "in_progress", "qc", "ready"] as JobStatus[]) {
      expect(isLegalTransition(from, "no_show")).toBe(false);
    }
  });
});

describe("cancelled", () => {
  it("is reachable from every non-terminal status", () => {
    for (const from of [
      "booked",
      "arrived",
      "checked_in",
      "in_progress",
      "qc",
      "ready",
    ] as JobStatus[]) {
      expect(isLegalTransition(from, "cancelled")).toBe(true);
    }
  });
});

describe("terminal statuses", () => {
  it("have no legal outbound transitions", () => {
    for (const status of TERMINAL_STATUSES) {
      expect(isLegalTransition(status, "booked")).toBe(false);
      expect(isLegalTransition(status, "arrived")).toBe(false);
      expect(isLegalTransition(status, "delivered")).toBe(false);
    }
  });
});

describe("illegal transitions are rejected, not silently applied", () => {
  it("assertLegalTransition throws IllegalJobTransitionError for a skipped step", () => {
    expect(() => assertLegalTransition("booked", "in_progress")).toThrow(IllegalJobTransitionError);
  });

  it("assertLegalTransition throws for a backwards move outside the rework loop", () => {
    expect(() => assertLegalTransition("ready", "checked_in")).toThrow(IllegalJobTransitionError);
  });

  it("assertLegalTransition throws for any move out of a terminal status", () => {
    expect(() => assertLegalTransition("delivered", "ready")).toThrow(IllegalJobTransitionError);
    expect(() => assertLegalTransition("cancelled", "booked")).toThrow(IllegalJobTransitionError);
  });

  it("the error carries the exact from/to that were rejected", () => {
    try {
      assertLegalTransition("booked", "in_progress");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalJobTransitionError);
      const e = err as IllegalJobTransitionError;
      expect(e.from).toBe("booked");
      expect(e.to).toBe("in_progress");
      expect(e.message).toContain("booked");
      expect(e.message).toContain("in_progress");
    }
  });

  it("buildTransitionEvent refuses to build an event for an illegal move (never silently sets the field)", () => {
    expect(() =>
      buildTransitionEvent(
        { id: "job-1", status: "booked" },
        "delivered",
        ACTOR,
        "2026-08-28T10:00:00.000Z",
      ),
    ).toThrow(IllegalJobTransitionError);
  });
});

describe("buildTransitionEvent", () => {
  it("records actor, timestamp, and an optional note on a legal transition", () => {
    const event = buildTransitionEvent(
      { id: "job-1", status: "booked" },
      "arrived",
      ACTOR,
      "2026-08-28T10:00:00.000Z",
      "Customer dropped off early",
    );
    expect(event.jobId).toBe("job-1");
    expect(event.fromStatus).toBe("booked");
    expect(event.toStatus).toBe("arrived");
    expect(event.actorId).toBe(ACTOR.id);
    expect(event.actorName).toBe(ACTOR.name);
    expect(event.at).toBe("2026-08-28T10:00:00.000Z");
    expect(event.note).toBe("Customer dropped off early");
  });

  it("defaults note to null when not given", () => {
    const event = buildTransitionEvent(
      { id: "job-1", status: "booked" },
      "arrived",
      ACTOR,
      "2026-08-28T10:00:00.000Z",
    );
    expect(event.note).toBeNull();
  });
});

describe("durationBetweenMs", () => {
  const events = [
    {
      id: "e1",
      jobId: "j1",
      fromStatus: null,
      toStatus: "booked" as const,
      actorId: "a",
      actorName: "A",
      at: "2026-08-28T08:00:00.000Z",
      note: null,
    },
    {
      id: "e2",
      jobId: "j1",
      fromStatus: "booked" as const,
      toStatus: "arrived" as const,
      actorId: "a",
      actorName: "A",
      at: "2026-08-28T09:00:00.000Z",
      note: null,
    },
    {
      id: "e3",
      jobId: "j1",
      fromStatus: "arrived" as const,
      toStatus: "checked_in" as const,
      actorId: "a",
      actorName: "A",
      at: "2026-08-28T09:15:00.000Z",
      note: null,
    },
  ];

  it("computes the duration between two named statuses from the event history", () => {
    expect(durationBetweenMs(events, "arrived", "checked_in")).toBe(15 * 60 * 1000);
    expect(durationBetweenMs(events, "booked", "checked_in")).toBe(75 * 60 * 1000);
  });

  it("returns null when a boundary status was never reached — this is never a stored/guessed field", () => {
    expect(durationBetweenMs(events, "checked_in", "delivered")).toBeNull();
  });
});
