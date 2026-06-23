import { describe, it, expect } from "vitest";
import { buildBudgetForecast } from "./step-budget";
import { graphCostFor } from "@/sections/campaigns/campaign-graph-cost";
import type { Channel } from "@/types/campaign";

// base-first-deal → signalType "Первая сделка". "own" → scoring free, so the
// forecast total is the pure graph communication cost (no scoring noise).
const SCENARIO = "base-first-deal";
const BASE = 10_000;

describe("buildBudgetForecast channel-awareness (aim #2 mismatch fix)", () => {
  it("forecast.total equals the channel-aware graph cost (wizard ≡ payment)", () => {
    const channels: Channel[] = ["sms", "email"];
    const forecast = buildBudgetForecast({
      scenarioId: SCENARIO,
      sourceType: "own",
      channels,
      baseSize: BASE,
    });
    // The payment screen prices the SAME scenario+source+channels graph.
    const paymentGraph = graphCostFor({
      scenarioId: SCENARIO,
      sourceType: "own",
      baseSize: BASE,
      channels,
    });
    expect(paymentGraph).not.toBeNull();
    // own → signals are free, so forecast.communication === forecast.total.
    expect(forecast.communication).toBe(paymentGraph!.total);
    expect(forecast.total).toBe(paymentGraph!.total);
  });

  it("different channels yield different forecast totals (channels are actually threaded)", () => {
    const smsOnly = buildBudgetForecast({
      scenarioId: SCENARIO, sourceType: "own", channels: ["sms"], baseSize: BASE,
    });
    const ivrOnly = buildBudgetForecast({
      scenarioId: SCENARIO, sourceType: "own", channels: ["ivr"], baseSize: BASE,
    });
    // ivr (8 ₽/send) > sms (5 ₽/send): if channels were dropped these would be equal.
    expect(ivrOnly.total).toBeGreaterThan(smsOnly.total);
  });
});
