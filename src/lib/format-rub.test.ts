import { describe, it, expect } from "vitest";
import { formatRubPlain } from "./format-rub";

describe("formatRubPlain", () => {
  it("formats whole thousands as «12 000 ₽» (ru-RU grouping + trailing sign)", () => {
    // Ru-RU groups with a no-break space, so match flexibly.
    expect(formatRubPlain(12000)).toMatch(/^12\s000\s₽$/);
  });

  it("keeps up to two fraction digits", () => {
    expect(formatRubPlain(0.5)).toMatch(/0[.,]5\s₽/);
  });

  it("formats zero", () => {
    expect(formatRubPlain(0)).toMatch(/^0\s₽$/);
  });
});
