import { describe, expect, it } from "vitest";
import { estimateArtifactCount, artifactKindForCampaign } from "./artifact-metrics";
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
