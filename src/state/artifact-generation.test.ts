import { describe, expect, it } from "vitest";
import { appReducer, initialState, type Artifact, type Campaign } from "./app-state";

function launchedState(over: Partial<Campaign>, artifacts: Artifact[] = []) {
  const c: Campaign = { id: "c1", name: "C", status: "draft", createdAt: "x", sourceType: "new", channels: [], ...over };
  return appReducer({ ...initialState, campaigns: [c], artifacts }, {
    type: "campaign_launched", id: "c1", timestamp: "2026-06-19T00:00:00.000Z", budget: 1000,
  });
}

describe("campaign_launched artifact generation", () => {
  // Progress is now a post-launch, time-derived sequence (Отправка → Проверка
  // → Обработка базы → Коммуникация): launch always starts in "scoring" and
  // never creates an artifact itself — that happens later via the post-launch
  // `campaign_phase_advanced` (see the describe block below).
  it("own → NO artifact at launch, phase scoring", () => {
    const s = launchedState({ sourceType: "own", channels: ["sms"], files: [{ name: "b.csv", rowCount: 4200 }] });
    expect(s.artifacts).toHaveLength(0);
    expect(s.campaigns[0].phase).toBe("scoring");
  });
  it("stream → NO single artifact at launch (collection comes from daily digests), phase scoring", () => {
    const s = launchedState({ sourceType: "stream", channels: [] });
    expect(s.artifacts).toHaveLength(0);
    expect(s.campaigns[0].phase).toBe("scoring");
  });
  it("new launches to scoring (post-launch phase_advanced now drives the collected-signals artifact)", () => {
    const s = launchedState({ sourceType: "new", channels: ["sms"] });
    expect(s.campaigns[0].phase).toBe("scoring");
  });
  it("new with a pre-launch artifact keeps it untouched at launch (no new artifact added)", () => {
    const preLaunch: Artifact = {
      id: "art_pre", campaignId: "c1", kind: "signals_conversions", count: 1234, createdAt: "pre",
    };
    const s = launchedState({ sourceType: "new", channels: ["sms"] }, [preLaunch]);
    expect(s.artifacts).toHaveLength(1);
    expect(s.artifacts[0].id).toBe("art_pre");
    expect(s.campaigns[0].phase).toBe("scoring");
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
