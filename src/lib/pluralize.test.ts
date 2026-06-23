import { describe, expect, it } from "vitest";
import { pluralizeRaz } from "./pluralize";

describe("pluralizeRaz", () => {
  it("одна форма: 1 раз, 21 раз, 101 раз", () => {
    expect(pluralizeRaz(1)).toBe("1 раз");
    expect(pluralizeRaz(21)).toBe("21 раз");
    expect(pluralizeRaz(101)).toBe("101 раз");
  });
  it("малая форма: 2/3/4 раза, 22 раза", () => {
    expect(pluralizeRaz(2)).toBe("2 раза");
    expect(pluralizeRaz(3)).toBe("3 раза");
    expect(pluralizeRaz(4)).toBe("4 раза");
    expect(pluralizeRaz(22)).toBe("22 раза");
  });
  it("многая форма: 0, 5..20, 11-14 раз", () => {
    expect(pluralizeRaz(0)).toBe("0 раз");
    expect(pluralizeRaz(5)).toBe("5 раз");
    expect(pluralizeRaz(11)).toBe("11 раз");
    expect(pluralizeRaz(12)).toBe("12 раз");
    expect(pluralizeRaz(14)).toBe("14 раз");
    expect(pluralizeRaz(20)).toBe("20 раз");
    expect(pluralizeRaz(25)).toBe("25 раз");
  });
});
