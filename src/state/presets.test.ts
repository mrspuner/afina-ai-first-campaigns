import { describe, it, expect } from "vitest";
import { PRESETS, generateCampaigns } from "./presets";

describe("presets are campaign-first", () => {
  it("empty preset is empty", () => {
    expect(PRESETS.empty.campaigns).toHaveLength(0);
    expect(PRESETS.empty.artifacts).toHaveLength(0);
  });

  it("full preset seeds campaigns + at least one artifact, each artifact linked to a campaign", () => {
    expect(PRESETS.full.campaigns.length).toBeGreaterThan(0);
    expect(PRESETS.full.artifacts.length).toBeGreaterThan(0);
    for (const a of PRESETS.full.artifacts) {
      expect(PRESETS.full.campaigns.some((c) => c.id === a.campaignId)).toBe(true);
    }
  });

  it("every launched campaign has exactly one artifact; drafts have none", () => {
    const launched = PRESETS.full.campaigns.filter((c) => c.status !== "draft");
    const drafts = PRESETS.full.campaigns.filter((c) => c.status === "draft");
    for (const c of launched) {
      expect(PRESETS.full.artifacts.filter((a) => a.campaignId === c.id)).toHaveLength(1);
    }
    for (const c of drafts) {
      expect(PRESETS.full.artifacts.filter((a) => a.campaignId === c.id)).toHaveLength(0);
    }
  });

  it("no preset campaign carries a signalId (campaign-first)", () => {
    for (const c of PRESETS.full.campaigns) {
      expect("signalId" in c).toBe(false);
    }
  });

  it("launched preset campaigns are in the communicating phase (scoring finished)", () => {
    for (const c of PRESETS.full.campaigns) {
      if (c.status === "draft") continue;
      expect(c.phase).toBe("communicating");
    }
  });
});

describe("PRESETS.mid", () => {
  it("has 8 campaigns with expected status distribution", () => {
    expect(PRESETS.mid.campaigns).toHaveLength(8);
    const counts = { draft: 0, active: 0, paused: 0, completed: 0 };
    for (const c of PRESETS.mid.campaigns) counts[c.status as keyof typeof counts]++;
    expect(counts).toEqual({ active: 2, paused: 1, completed: 3, draft: 2 });
  });

  it("seeds one artifact per launched campaign (6 launched, 2 drafts)", () => {
    expect(PRESETS.mid.artifacts).toHaveLength(6);
    for (const a of PRESETS.mid.artifacts) {
      expect(PRESETS.mid.campaigns.some((c) => c.id === a.campaignId)).toBe(true);
    }
  });
});

describe("PRESETS.full", () => {
  it("has 26 campaigns with expected status distribution", () => {
    expect(PRESETS.full.campaigns).toHaveLength(26);
    const counts = { draft: 0, active: 0, paused: 0, completed: 0 };
    for (const c of PRESETS.full.campaigns) counts[c.status as keyof typeof counts]++;
    expect(counts).toEqual({ active: 8, paused: 2, completed: 10, draft: 6 });
  });

  it("seeds one artifact per launched campaign (20 launched, 6 drafts)", () => {
    expect(PRESETS.full.artifacts).toHaveLength(20);
  });
});

describe("generateCampaigns", () => {
  it("sets launchedAt + communicating phase for active campaigns, no signalId", () => {
    const campaigns = generateCampaigns({
      seed: 2,
      distribution: { active: 2, paused: 0, completed: 0, draft: 0 },
      dateSpanDays: 10,
      now: Date.UTC(2026, 3, 18),
    });
    expect(campaigns).toHaveLength(2);
    for (const c of campaigns) {
      expect(c.status).toBe("active");
      expect(c.launchedAt).toBeDefined();
      expect(c.phase).toBe("communicating");
      expect("signalId" in c).toBe(false);
      expect(c.scenario).toBeDefined();
    }
  });

  it("is deterministic for the same seed", () => {
    const opts = {
      seed: 99,
      distribution: { active: 3, paused: 1, completed: 2, draft: 1 } as Record<
        import("./app-state").CampaignStatus,
        number
      >,
      dateSpanDays: 30,
      now: 0,
    };
    const a = generateCampaigns(opts);
    const b = generateCampaigns(opts);
    expect(a.map((c) => c.name)).toEqual(b.map((c) => c.name));
    expect(a.map((c) => c.status)).toEqual(b.map((c) => c.status));
  });
});
