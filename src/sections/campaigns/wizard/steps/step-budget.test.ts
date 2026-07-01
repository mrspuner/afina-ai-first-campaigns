import { describe, it, expect } from "vitest";
import { buildBudgetForecast, maxDailyBudgetLine } from "./step-budget";
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

  it("new source: forecast.total is the grand total = signals + communication", () => {
    const channels: Channel[] = ["sms", "email"];
    const forecast = buildBudgetForecast({
      scenarioId: SCENARIO,
      sourceType: "new",
      channels,
      baseSize: BASE,
    });
    const paymentGraph = graphCostFor({
      scenarioId: SCENARIO,
      sourceType: "new",
      baseSize: BASE,
      channels,
    });
    expect(paymentGraph).not.toBeNull();
    // Communication mirrors the graph cost; signals are charged for new bases…
    expect(forecast.communication).toBe(paymentGraph!.total);
    expect(forecast.signals).toBeGreaterThan(0);
    // …and «Итого» = signals + communications, strictly above communications alone.
    expect(forecast.total).toBe(forecast.signals + forecast.communication);
    expect(forecast.total).toBeGreaterThan(forecast.communication);
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

describe("maxDailyBudgetLine (aim #20 optional ceiling, display-only)", () => {
  it("returns the RU label + formatted amount when a positive value is set", () => {
    expect(maxDailyBudgetLine(1000)).toEqual({
      label: "Максимальный дневной бюджет",
      display: "₽ 1 000",
    });
  });
  it("returns null when unset (undefined)", () => {
    expect(maxDailyBudgetLine(undefined)).toBeNull();
  });
  it("returns null for empty/zero/invalid (no ceiling)", () => {
    expect(maxDailyBudgetLine(0)).toBeNull();
    expect(maxDailyBudgetLine(NaN)).toBeNull();
  });
});
