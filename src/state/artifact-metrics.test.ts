import { describe, expect, it } from "vitest";
import { estimateArtifactCount, artifactKindForCampaign, isStreamingCampaign, digestCount, addDaysIso, MAX_DIGESTS } from "./artifact-metrics";
import type { Campaign } from "./app-state";

function camp(over: Partial<Campaign> = {}): Campaign {
  return { id: "c1", name: "C", status: "draft", createdAt: "x", sourceType: "new", channels: [], ...over };
}

describe("artifact-metrics", () => {
  it("own uses the uploaded file row count", () => {
    expect(estimateArtifactCount(camp({ sourceType: "own", files: [{ name: "b.csv", rowCount: 4200 }] }))).toBe(4200);
  });
  it("new/stream without a file fall back to a deterministic estimate", () => {
    const n = estimateArtifactCount(camp({ sourceType: "new" }));
    expect(n).toBeGreaterThan(0);
    expect(estimateArtifactCount(camp({ sourceType: "new" }))).toBe(n); // deterministic
  });
  it("kind is degenerate when no channels, full otherwise", () => {
    expect(artifactKindForCampaign(camp({ channels: [] }))).toBe("signals");
    expect(artifactKindForCampaign(camp({ channels: ["sms"] }))).toBe("signals_conversions");
  });
});

const streamC = { id: "c1", name: "x", status: "active", createdAt: "2026-06-01T00:00:00.000Z", sourceType: "stream" } as Campaign;
const newC = { ...streamC, sourceType: "new" } as Campaign;

describe("isStreamingCampaign", () => {
  it("true only for sourceType stream", () => {
    expect(isStreamingCampaign(streamC)).toBe(true);
    expect(isStreamingCampaign(newC)).toBe(false);
    expect(isStreamingCampaign({ ...streamC, sourceType: "own" } as Campaign)).toBe(false);
  });
});

describe("digestCount", () => {
  it("is deterministic for a (campaignId, dayIndex) and in range", () => {
    const a = digestCount("c1", 0);
    expect(a).toBe(digestCount("c1", 0));
    expect(a).toBeGreaterThanOrEqual(400);
    expect(a).toBeLessThanOrEqual(5200);
    expect(digestCount("c1", 1)).not.toBe(a);
  });
});

describe("addDaysIso", () => {
  it("adds N days and returns a YYYY-MM-DD date", () => {
    expect(addDaysIso("2026-06-28T10:00:00.000Z", 0)).toBe("2026-06-28");
    expect(addDaysIso("2026-06-28T10:00:00.000Z", 3)).toBe("2026-07-01");
  });
});

describe("MAX_DIGESTS", () => {
  it("caps daily digests at 14", () => { expect(MAX_DIGESTS).toBe(14); });
});
