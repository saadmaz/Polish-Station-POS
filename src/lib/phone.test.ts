import { describe, it, expect } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("folds Sri Lankan local format into country-code form", () => {
    expect(normalizePhone("0771234567")).toBe("94771234567");
  });

  it("normalizes an already-international number with a plus and spaces", () => {
    expect(normalizePhone("+94 77 123 4567")).toBe("94771234567");
  });

  it("normalizes a hyphenated local number", () => {
    expect(normalizePhone("077-123-4567")).toBe("94771234567");
  });

  it("passes through a bare country-code number unchanged", () => {
    expect(normalizePhone("94771234567")).toBe("94771234567");
  });

  it("returns digits-only for an unrecognized shape rather than guessing", () => {
    expect(normalizePhone("12345")).toBe("12345");
  });
});
