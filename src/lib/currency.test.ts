import { describe, it, expect } from "vitest";
import { formatCurrency } from "./currency";

describe("formatCurrency (CC-currency: no shared formatter, PDF diverged to 2 decimals)", () => {
  it("adds thousands separators", () => {
    expect(formatCurrency(54870)).toBe("LKR 54,870");
    expect(formatCurrency(1850000)).toBe("LKR 1,850,000");
  });

  it("does not force decimal places on a whole-rupee amount", () => {
    expect(formatCurrency(50)).toBe("LKR 50");
    expect(formatCurrency(0)).toBe("LKR 0");
  });

  it("preserves real fractional precision when an amount genuinely has it", () => {
    expect(formatCurrency(4582.73916)).toBe("LKR 4,582.739");
  });

  it("uses a pinned locale, not the runtime's ambient default", () => {
    // en-US groups with commas and a decimal point; this is what every call
    // site should render regardless of the browser/OS locale it runs under.
    expect(formatCurrency(1234567)).toBe("LKR 1,234,567");
  });

  it("renders negative amounts (e.g. a shift's cash variance) with a leading minus", () => {
    expect(formatCurrency(-500)).toBe("LKR -500");
  });
});
