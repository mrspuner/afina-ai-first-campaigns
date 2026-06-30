import { describe, it, expect } from "vitest";
import { appReducer, initialState, type Campaign } from "./app-state";

const draft: Campaign = {
  id: "c1",
  name: "C",
  status: "draft",
  createdAt: "x",
  sourceType: "new",
  channels: ["sms"],
  interests: ["Ипотека"],
  triggers: ["Заявка на ипотеку"],
};

describe("campaign_scoring_set (2c — editable «Интересы и триггеры» drawer)", () => {
  it("replaces a campaign's interests and triggers", () => {
    const next = appReducer(
      { ...initialState, campaigns: [draft] },
      {
        type: "campaign_scoring_set",
        id: "c1",
        interests: ["Ипотека", "Авто"],
        triggers: ["Заявка на ипотеку", "Кредитный калькулятор"],
      }
    );
    expect(next.campaigns[0].interests).toEqual(["Ипотека", "Авто"]);
    expect(next.campaigns[0].triggers).toEqual([
      "Заявка на ипотеку",
      "Кредитный калькулятор",
    ]);
  });

  it("can clear interests and triggers (empty arrays)", () => {
    const next = appReducer(
      { ...initialState, campaigns: [draft] },
      { type: "campaign_scoring_set", id: "c1", interests: [], triggers: [] }
    );
    expect(next.campaigns[0].interests).toEqual([]);
    expect(next.campaigns[0].triggers).toEqual([]);
  });

  it("leaves other campaigns untouched", () => {
    const other: Campaign = { ...draft, id: "c2", interests: ["Авто"] };
    const next = appReducer(
      { ...initialState, campaigns: [draft, other] },
      { type: "campaign_scoring_set", id: "c1", interests: ["X"], triggers: ["Y"] }
    );
    expect(next.campaigns[1].interests).toEqual(["Авто"]);
  });

  it("is a no-op for an unknown campaign id", () => {
    const base = { ...initialState, campaigns: [draft] };
    const next = appReducer(base, {
      type: "campaign_scoring_set",
      id: "nope",
      interests: ["X"],
      triggers: ["Y"],
    });
    expect(next).toBe(base);
  });
});
