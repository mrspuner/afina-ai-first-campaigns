import { describe, it, expect } from "vitest";
import { paymentSplitDisplay } from "./payment-split-display";

// Grand total = scoring + communication. Signals and communications are paid
// TOGETHER, so «своя сумма» rescales BOTH lines proportionally.
const split = { scoring: 200, communication: 800, total: 1000 };

describe("paymentSplitDisplay (signals + communications paid together)", () => {
  it("recommended mode returns the split untouched", () => {
    const out = paymentSplitDisplay({
      split,
      mode: "recommended",
      customTotal: 5000,
      recommendedTotal: 1000,
    });
    expect(out).toEqual(split);
  });

  it("custom mode: both scoring AND communication scale proportionally", () => {
    const out = paymentSplitDisplay({
      split,
      mode: "custom",
      customTotal: 2000, // 2x the recommended grand total
      recommendedTotal: 1000,
    });
    // factor 2 → both lines double, «Итого» = their sum.
    expect(out.scoring).toBe(400);
    expect(out.communication).toBe(1600);
    expect(out.total).toBe(2000);
  });

  it("custom mode: scaling down shrinks both lines", () => {
    const out = paymentSplitDisplay({
      split,
      mode: "custom",
      customTotal: 500, // half the recommended grand total
      recommendedTotal: 1000,
    });
    expect(out.scoring).toBe(100);
    expect(out.communication).toBe(400);
    expect(out.total).toBe(500);
  });

  it("«Итого» always equals scoring + communication after scaling", () => {
    const out = paymentSplitDisplay({
      split,
      mode: "custom",
      customTotal: 1337,
      recommendedTotal: 1000,
    });
    expect(out.total).toBe(out.scoring + out.communication);
  });

  it("recommendedTotal <= 0 returns the split untouched (no division by zero)", () => {
    const out = paymentSplitDisplay({
      split,
      mode: "custom",
      customTotal: 999,
      recommendedTotal: 0,
    });
    expect(out).toEqual(split);
  });
});
