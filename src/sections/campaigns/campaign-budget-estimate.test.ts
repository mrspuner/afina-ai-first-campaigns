import { describe, expect, it } from "vitest";
import { estimateCampaignBudget } from "./campaign-budget-estimate";

describe("estimateCampaignBudget", () => {
  it("own source: scoring (signals) line is free", () => {
    const r = estimateCampaignBudget({ sourceType: "own", channels: ["sms"], baseSize: 10_000 });
    expect(r.signals).toBe(0);
    expect(r.communication).toBeGreaterThan(0);
    expect(r.total).toBe(r.communication);
  });
  it("new source: signals line is charged", () => {
    const r = estimateCampaignBudget({ sourceType: "new", channels: ["sms"], baseSize: 10_000 });
    expect(r.signals).toBeGreaterThan(0);
  });
  it("degenerate campaign (no channels): communication is 0, only signals", () => {
    const r = estimateCampaignBudget({ sourceType: "new", channels: [], baseSize: 5_000 });
    expect(r.communication).toBe(0);
    expect(r.total).toBe(r.signals);
  });
  it("stream source: exposes dailyBudget alongside the total cap", () => {
    const r = estimateCampaignBudget({ sourceType: "stream", channels: ["push"], baseSize: 20_000 });
    expect(r.dailyBudget).toBeGreaterThan(0);
    expect(r.total).toBeGreaterThanOrEqual(r.dailyBudget!);
  });
  it("falls back to a scenario-derived base when baseSize is absent", () => {
    const r = estimateCampaignBudget({ sourceType: "stream", channels: ["sms"] });
    expect(r.total).toBeGreaterThan(0);
  });
});
