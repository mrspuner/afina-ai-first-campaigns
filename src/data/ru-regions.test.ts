import { describe, it, expect } from "vitest";
import { RU_REGIONS } from "./ru-regions";

describe("RU_REGIONS", () => {
  it("includes major cities and preset groups with unique ids", () => {
    const ids = RU_REGIONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // без дубликатов
    const labels = RU_REGIONS.map((r) => r.label);
    expect(labels).toContain("Москва");
    expect(labels).toContain("Санкт-Петербург");
    expect(labels).toContain("Города-миллионники РФ"); // пресет
    expect(RU_REGIONS.length).toBeGreaterThan(20);
  });
});
