import { describe, expect, it } from "vitest";
import { appReducer, initialState, type Campaign } from "./app-state";

function launchedState(over: Partial<Campaign>) {
  const c: Campaign = { id: "c1", name: "C", status: "draft", createdAt: "x", sourceType: "new", channels: [], ...over };
  return appReducer({ ...initialState, campaigns: [c] }, {
    type: "campaign_launched", id: "c1", timestamp: "2026-06-19T00:00:00.000Z", budget: 1000,
  });
}

describe("campaign_launched artifact generation", () => {
  it("own → artifact immediately + phase communicating", () => {
    const s = launchedState({ sourceType: "own", channels: ["sms"], file: { name: "b.csv", rowCount: 4200 } });
    expect(s.artifacts).toHaveLength(1);
    expect(s.artifacts[0]).toMatchObject({ campaignId: "c1", kind: "signals_conversions", count: 4200 });
    expect(s.campaigns[0].phase).toBe("communicating");
  });
  it("new → no artifact yet, phase scoring", () => {
    const s = launchedState({ sourceType: "new", channels: ["sms"] });
    expect(s.artifacts).toHaveLength(0);
    expect(s.campaigns[0].phase).toBe("scoring");
  });
  it("stream → artifact at launch + phase communicating", () => {
    const s = launchedState({ sourceType: "stream", channels: [] });
    expect(s.artifacts).toHaveLength(1);
    expect(s.artifacts[0].kind).toBe("signals");
    expect(s.campaigns[0].phase).toBe("communicating");
  });
});
