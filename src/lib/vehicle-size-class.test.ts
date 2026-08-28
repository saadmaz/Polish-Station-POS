import { describe, it, expect } from "vitest";
import { deriveSizeClass } from "./vehicle-size-class";

describe("deriveSizeClass", () => {
  it("matches a known make+model case-insensitively", () => {
    expect(deriveSizeClass("Toyota", "Aqua")).toBe("hatchback");
    expect(deriveSizeClass("toyota", "aqua")).toBe("hatchback");
    expect(deriveSizeClass("TOYOTA", "AQUA")).toBe("hatchback");
  });

  it("covers one representative model per size class", () => {
    expect(deriveSizeClass("Suzuki", "Alto")).toBe("hatchback");
    expect(deriveSizeClass("Toyota", "Corolla")).toBe("sedan");
    expect(deriveSizeClass("Nissan", "X-Trail")).toBe("suv");
    expect(deriveSizeClass("Toyota", "KDH")).toBe("van");
    expect(deriveSizeClass("Toyota", "Hilux")).toBe("cab");
    expect(deriveSizeClass("Bajaj", "Pulsar")).toBe("motorcycle");
  });

  it("returns null (not a guess) for an unknown model", () => {
    expect(deriveSizeClass("Toyota", "SomeUnknownModel")).toBeNull();
  });

  it("returns null for an empty make or model", () => {
    expect(deriveSizeClass("", "Aqua")).toBeNull();
    expect(deriveSizeClass("Toyota", "")).toBeNull();
  });
});
