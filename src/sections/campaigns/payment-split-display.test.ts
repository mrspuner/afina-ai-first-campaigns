import { describe, it, expect } from "vitest";
import { paymentSplitDisplay } from "./payment-split-display";

const split = { scoring: 184, communication: 1000, total: 1184 };

describe("paymentSplitDisplay (aim #24 — scoring locked)", () => {
  it("recommended mode returns the split untouched", () => {
    const out = paymentSplitDisplay({
      split,
      mode: "recommended",
      customTotal: 5000,
      recommendedTotal: 1000,
    });
    expect(out).toEqual(split);
  });

  it("custom mode: scoring stays LOCKED regardless of the custom amount", () => {
    const a = paymentSplitDisplay({
      split,
      mode: "custom",
      customTotal: 2000,
      recommendedTotal: 1000,
    });
    const b = paymentSplitDisplay({
      split,
      mode: "custom",
      customTotal: 500,
      recommendedTotal: 1000,
    });
    // Scoring must NOT change when the custom amount changes.
    expect(a.scoring).toBe(184);
    expect(b.scoring).toBe(184);
  });

  it("custom mode: only communication scales (all new payment → communications)", () => {
    const out = paymentSplitDisplay({
      split,
      mode: "custom",
      customTotal: 2000, // 2x the recommended communication
      recommendedTotal: 1000,
    });
    expect(out.communication).toBe(2000);
    expect(out.scoring).toBe(184);
    // total = locked scoring + scaled communication
    expect(out.total).toBe(184 + 2000);
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
