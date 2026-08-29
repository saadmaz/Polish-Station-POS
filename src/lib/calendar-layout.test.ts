import { describe, it, expect } from "vitest";
import { layoutOverlaps } from "./calendar-layout";

interface Slot {
  id: string;
  start: number;
  end: number;
}

function layout(slots: Slot[]) {
  return layoutOverlaps(
    slots,
    (s) => s.start,
    (s) => s.end,
  );
}

describe("layoutOverlaps (audit B1: overlapping bookings rendered stacked, unclickable)", () => {
  it("gives non-overlapping items a single column each", () => {
    const result = layout([
      { id: "a", start: 0, end: 30 },
      { id: "b", start: 30, end: 60 },
    ]);
    expect(result.map((r) => ({ id: (r.item as Slot).id, col: r.col, cols: r.cols }))).toEqual([
      { id: "a", col: 0, cols: 1 },
      { id: "b", col: 0, cols: 1 },
    ]);
  });

  it("splits two overlapping items into 2 side-by-side columns, not stacked", () => {
    const result = layout([
      { id: "a", start: 0, end: 60 },
      { id: "b", start: 15, end: 45 },
    ]);
    const byId = Object.fromEntries(result.map((r) => [(r.item as Slot).id, r]));
    expect(byId.a.cols).toBe(2);
    expect(byId.b.cols).toBe(2);
    expect(byId.a.col).not.toBe(byId.b.col);
  });

  it("every item in an overlap cluster stays independently addressable (no two share a column at an overlapping time)", () => {
    // Exactly the audit's real-world case: two bookings, same bay, same
    // start time -- the old code gave both identical position, so the
    // second one in array order painted over and captured every click.
    const result = layout([
      { id: "test", start: 0, end: 60 },
      { id: "kaleel", start: 0, end: 60 },
    ]);
    const cols = new Set(result.map((r) => r.col));
    expect(cols.size).toBe(2); // two distinct columns, not one shared slot
  });

  it("a 3-way overlap gets 3 columns", () => {
    const result = layout([
      { id: "a", start: 0, end: 90 },
      { id: "b", start: 10, end: 40 },
      { id: "c", start: 20, end: 50 },
    ]);
    expect(result.every((r) => r.cols === 3)).toBe(true);
    expect(new Set(result.map((r) => r.col)).size).toBe(3);
  });

  it("reuses a column once its previous occupant has ended (doesn't grow columns forever)", () => {
    const result = layout([
      { id: "a", start: 0, end: 30 },
      { id: "b", start: 0, end: 30 }, // overlaps a -> needs its own column
      { id: "c", start: 30, end: 60 }, // starts exactly when a ends -> can reuse a's column
    ]);
    const byId = Object.fromEntries(result.map((r) => [(r.item as Slot).id, r]));
    expect(byId.a.col).toBe(0);
    expect(byId.b.col).toBe(1);
    expect(byId.c.col).toBe(0);
  });

  it("two separate, non-overlapping clusters don't inflate each other's column count", () => {
    const result = layout([
      { id: "a", start: 0, end: 30 },
      { id: "b", start: 0, end: 30 }, // cluster 1: 2 columns
      { id: "c", start: 100, end: 130 }, // cluster 2, alone: 1 column
    ]);
    const byId = Object.fromEntries(result.map((r) => [(r.item as Slot).id, r]));
    expect(byId.a.cols).toBe(2);
    expect(byId.b.cols).toBe(2);
    expect(byId.c.cols).toBe(1);
  });

  it("returns an empty layout for no items", () => {
    expect(layout([])).toEqual([]);
  });
});
