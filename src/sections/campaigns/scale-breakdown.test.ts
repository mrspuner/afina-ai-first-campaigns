import { describe, expect, it } from "vitest";
import { scaleBreakdown } from "./scale-breakdown";

describe("scaleBreakdown", () => {
  it("scales component rows proportionally and pins the total to customTotal", () => {
    const rows = [
      { key: "signals", amount: 2500 },
      { key: "communication", amount: 7500 },
    ];
    const out = scaleBreakdown(rows, 20000, 10000); // 2x
    expect(out.find((r) => r.key === "signals")!.amount).toBe(5000);
    expect(out.find((r) => r.key === "communication")!.amount).toBe(15000);
  });
  it("absorbs rounding into the largest row so the sum equals customTotal", () => {
    const rows = [
      { key: "a", amount: 333 },
      { key: "b", amount: 667 },
    ];
    const out = scaleBreakdown(rows, 1001, 1000);
    expect(out.reduce((s, r) => s + r.amount, 0)).toBe(1001);
  });
  it("returns zeros safely when recommendedTotal is 0", () => {
    const out = scaleBreakdown([{ key: "a", amount: 0 }], 500, 0);
    expect(out[0].amount).toBe(0);
  });
});
