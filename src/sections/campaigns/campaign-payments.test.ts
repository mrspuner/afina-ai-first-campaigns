import { describe, it, expect } from "vitest";
import { splitCampaignPayments } from "./campaign-payments";

describe("splitCampaignPayments", () => {
  it("own + channels: scoring free, communication charged (one payment)", () => {
    const p = splitCampaignPayments({ sourceType: "own", channels: ["sms"], baseSize: 1000 });
    expect(p.scoring).toBe(0);
    expect(p.communication).toBeGreaterThan(0);
    expect(p.payments.length).toBe(1);
    expect(p.payments[0].kind).toBe("communication");
  });
  it("degenerate new: one scoring payment, no communication", () => {
    const p = splitCampaignPayments({ sourceType: "new", channels: [], baseSize: 1000 });
    expect(p.payments.map((x) => x.kind)).toEqual(["scoring"]);
  });
  it("degenerate own: no payments at all", () => {
    const p = splitCampaignPayments({ sourceType: "own", channels: [], baseSize: 1000 });
    expect(p.payments).toEqual([]);
  });
  it("new + channels: two payments (scoring + communication)", () => {
    const p = splitCampaignPayments({ sourceType: "new", channels: ["sms"], baseSize: 1000 });
    expect(p.payments.map((x) => x.kind)).toEqual(["scoring", "communication"]);
  });
  it("stream carries a dailyBudget on the communication payment", () => {
    const p = splitCampaignPayments({ sourceType: "stream", channels: ["push"], baseSize: 5000 });
    const comm = p.payments.find((x) => x.kind === "communication")!;
    expect(comm.dailyBudget).toBeGreaterThan(0);
  });
});
