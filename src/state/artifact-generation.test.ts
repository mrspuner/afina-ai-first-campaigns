import { describe, expect, it } from "vitest";
import { appReducer, initialState, type Artifact, type Campaign } from "./app-state";

function launchedState(over: Partial<Campaign>, artifacts: Artifact[] = []) {
  const c: Campaign = { id: "c1", name: "C", status: "draft", createdAt: "x", sourceType: "new", channels: [], ...over };
  return appReducer({ ...initialState, campaigns: [c], artifacts }, {
    type: "campaign_launched", id: "c1", timestamp: "2026-06-19T00:00:00.000Z", budget: 1000,
  });
}

describe("campaign_launched artifact generation", () => {
  it("own → artifact at launch + phase communicating", () => {
    const s = launchedState({ sourceType: "own", channels: ["sms"], files: [{ name: "b.csv", rowCount: 4200 }] });
    expect(s.artifacts).toHaveLength(1);
    expect(s.artifacts[0]).toMatchObject({ campaignId: "c1", kind: "signals_conversions", count: 4200 });
    expect(s.campaigns[0].phase).toBe("communicating");
  });
  it("stream → NO single artifact at launch (collection comes from daily digests) + phase communicating", () => {
    const s = launchedState({ sourceType: "stream", channels: [] });
    expect(s.artifacts).toHaveLength(0);
    expect(s.campaigns[0].phase).toBe("communicating");
  });
  it("new launches to communicating (collection already done pre-launch)", () => {
    const s = launchedState({ sourceType: "new", channels: ["sms"] });
    expect(s.campaigns[0].phase).toBe("communicating");
  });
  it("new with a pre-launch artifact does NOT get a second at launch", () => {
    const preLaunch: Artifact = {
      id: "art_pre", campaignId: "c1", kind: "signals_conversions", count: 1234, createdAt: "pre",
    };
    const s = launchedState({ sourceType: "new", channels: ["sms"] }, [preLaunch]);
    expect(s.artifacts).toHaveLength(1);
    expect(s.artifacts[0].id).toBe("art_pre");
    expect(s.campaigns[0].phase).toBe("communicating");
  });
});

describe("campaign_phase_advanced artifact generation (new, pre-launch)", () => {
  it("creates the collected-signals artifact when a new draft finishes collecting", () => {
    const draft: Campaign = { id: "c1", name: "C", status: "draft", createdAt: "x", sourceType: "new", channels: ["sms"], phase: "scoring" };
    const advanced = appReducer({ ...initialState, campaigns: [draft] }, { type: "campaign_phase_advanced", id: "c1" });
    expect(advanced.campaigns[0].phase).toBe("communicating");
    expect(advanced.artifacts).toHaveLength(1);
    expect(advanced.artifacts[0]).toMatchObject({ campaignId: "c1", kind: "signals_conversions" });
    expect(advanced.notifications.signalsBadge).toBe(true);
  });
  it("does not double-create on a repeat advance", () => {
    const draft: Campaign = { id: "c1", name: "C", status: "draft", createdAt: "x", sourceType: "new", channels: ["sms"], phase: "scoring" };
    let s = appReducer({ ...initialState, campaigns: [draft] }, { type: "campaign_phase_advanced", id: "c1" });
    s = appReducer(s, { type: "campaign_phase_advanced", id: "c1" });
    expect(s.artifacts).toHaveLength(1);
  });
});
