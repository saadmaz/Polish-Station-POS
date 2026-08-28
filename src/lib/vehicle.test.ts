import { describe, it, expect } from "vitest";
import { normalizePlate, parseVehicleDescription } from "./vehicle";

describe("normalizePlate", () => {
  it("uppercases and strips whitespace and punctuation", () => {
    expect(normalizePlate("wp car-1234")).toBe("WPCAR1234");
    expect(normalizePlate("CAR-4521")).toBe("CAR4521");
    expect(normalizePlate("  wp  cab-2204  ")).toBe("WPCAB2204");
  });

  it("treats differently-punctuated entries of the same plate as identical", () => {
    expect(normalizePlate("WP CAR-8821")).toBe(normalizePlate("WPCAR8821"));
    expect(normalizePlate("wp-car 8821")).toBe(normalizePlate("WP CAR-8821"));
  });

  it("returns empty string for a blank/whitespace-only plate", () => {
    expect(normalizePlate("")).toBe("");
    expect(normalizePlate("   ")).toBe("");
  });
});

describe("parseVehicleDescription", () => {
  it("splits make, model, and a trailing year", () => {
    expect(parseVehicleDescription("Toyota Aqua 2018")).toEqual({
      make: "Toyota",
      model: "Aqua",
      year: 2018,
    });
  });

  it("handles a multi-word model", () => {
    expect(parseVehicleDescription("Nissan X-Trail 2017")).toEqual({
      make: "Nissan",
      model: "X-Trail",
      year: 2017,
    });
  });

  it("pulls the year out regardless of position", () => {
    expect(parseVehicleDescription("2021 BMW 320i")).toEqual({
      make: "BMW",
      model: "320i",
      year: 2021,
    });
  });

  it("leaves year null when there's no plausible year token", () => {
    expect(parseVehicleDescription("Honda Vezel")).toEqual({
      make: "Honda",
      model: "Vezel",
      year: null,
    });
  });

  it("doesn't mistake a model number for a year", () => {
    // "320i" isn't a 4-digit token so it's never a year-parse risk, but a
    // genuine ambiguous 4-digit number outside the plausible range (e.g. a
    // trim code) must not be swallowed as a year.
    expect(parseVehicleDescription("Suzuki Alto 0800")).toEqual({
      make: "Suzuki",
      model: "Alto 0800",
      year: null,
    });
  });

  it("leaves model empty for a single unsplittable token (a low-confidence case for callers to flag)", () => {
    const result = parseVehicleDescription("Vehicle");
    expect(result.make).toBe("Vehicle");
    expect(result.model).toBe("");
  });

  it("returns all-empty for a blank description", () => {
    expect(parseVehicleDescription("")).toEqual({ make: "", model: "", year: null });
    expect(parseVehicleDescription("   ")).toEqual({ make: "", model: "", year: null });
  });
});
