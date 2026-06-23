import { describe, it, expect } from "vitest";
import { buildBudgetForecast, launchButtonLabel, maxDailyBudgetLine } from "./step-budget";
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

describe("launchButtonLabel (aim #19 insufficient-budget wizard label)", () => {
  it("balance ≥ required → «Запустить»", () => {
    expect(launchButtonLabel({ balance: 10_000, required: 5_000 })).toBe("Запустить");
  });
  it("balance < required → «Пополнить и запустить»", () => {
    expect(launchButtonLabel({ balance: 1_000, required: 5_000 })).toBe(
      "Пополнить и запустить",
    );
  });
  it("balance exactly equal to required → «Запустить» (shortfall 0)", () => {
    expect(launchButtonLabel({ balance: 5_000, required: 5_000 })).toBe("Запустить");
  });
  it("zero required (degenerate) → «Запустить»", () => {
    expect(launchButtonLabel({ balance: 0, required: 0 })).toBe("Запустить");
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
