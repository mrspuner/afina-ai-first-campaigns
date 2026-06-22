import { describe, it, expect } from "vitest";
import { budgetDisplayRows } from "./budget-display";

const components = [
  { key: "signals", amount: 2_500, contactCount: 10_000 },
  { key: "communication", amount: 7_500 },
];
const recommendedTotal = 10_000;

describe("budgetDisplayRows", () => {
  it("custom 2× doubles each component, total = custom, contactCount doubles", () => {
    const { rows, total } = budgetDisplayRows({
      components,
      recommendedTotal,
      customTotal: 20_000,
    });
    const signals = rows.find((r) => r.key === "signals")!;
    const comm = rows.find((r) => r.key === "communication")!;
    expect(signals.amount).toBe(5_000);
    expect(comm.amount).toBe(15_000);
    expect(signals.contactCount).toBe(20_000);
    expect(total).toBe(20_000);
  });

  it("Итого always equals the active total (custom)", () => {
    const { rows, total } = budgetDisplayRows({
      components,
      recommendedTotal,
      customTotal: 13_333,
    });
    expect(total).toBe(13_333);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(13_333);
  });

  it("recommended mode (customTotal null) leaves components unchanged", () => {
    const { rows, total } = budgetDisplayRows({
      components,
      recommendedTotal,
      customTotal: null,
    });
    expect(rows).toEqual(components);
    expect(total).toBe(recommendedTotal);
  });

  it("custom 0 falls back to recommended", () => {
    const { rows, total } = budgetDisplayRows({
      components,
      recommendedTotal,
      customTotal: 0,
    });
    expect(rows).toEqual(components);
    expect(total).toBe(recommendedTotal);
  });

  it("recommendedTotal 0 → components scale to 0 amounts, contactCount 0", () => {
    const { rows, total } = budgetDisplayRows({
      components: [
        { key: "signals", amount: 0, contactCount: 10_000 },
        { key: "communication", amount: 0 },
      ],
      recommendedTotal: 0,
      customTotal: 5_000,
    });
    expect(total).toBe(5_000);
    expect(rows.find((r) => r.key === "signals")!.contactCount).toBe(0);
  });
});
