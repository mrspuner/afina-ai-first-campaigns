import { describe, it, expect } from "vitest";
import { groupScenariosByCategory, sourceTypeLabel } from "./step-1-scenario";
import { SCENARIO_CATEGORIES } from "@/data/scenarios";

describe("groupScenariosByCategory (ЖЦК grouping)", () => {
  it("groups scenarios under all six ЖЦК categories with counts", () => {
    const groups = groupScenariosByCategory();
    expect(groups.map((g) => g.category)).toEqual([...SCENARIO_CATEGORIES]);
    expect(groups.every((g) => g.scenarios.length === g.count)).toBe(true);
  });
  it("every grouped scenario excludes base scenarios", () => {
    const groups = groupScenariosByCategory();
    expect(groups.every((g) => g.scenarios.every((s) => !s.isBase))).toBe(true);
  });
});

describe("sourceTypeLabel", () => {
  it("maps the three source types to Russian labels", () => {
    expect(sourceTypeLabel("new")).toMatch(/нов/i);
    expect(sourceTypeLabel("stream")).toMatch(/поток/i);
    expect(sourceTypeLabel("own")).toMatch(/сво/i);
  });
});
