import { describe, it, expect } from "vitest";
import { groupArtifacts } from "./artifact-grouping";
import type { Artifact } from "@/state/app-state";

const single = (id: string, campaignId: string): Artifact => ({ id, campaignId, kind: "signals", count: 10, createdAt: "2026-06-01", variant: "single" });
const cum = (campaignId: string): Artifact => ({ id: `${campaignId}-c`, campaignId, kind: "signals", count: 99, createdAt: "2026-06-05", variant: "cumulative" });
const day = (id: string, campaignId: string): Artifact => ({ id, campaignId, kind: "signals", count: 5, createdAt: "2026-06-04", variant: "daily", periodDate: "2026-06-04" });

describe("groupArtifacts", () => {
  it("streaming campaign → one collection (cumulative + its dailies); one-time → singles", () => {
    const groups = groupArtifacts([single("s1", "one"), cum("str"), day("d1", "str"), day("d2", "str")]);
    const collection = groups.find((g) => g.kind === "collection");
    const singleG = groups.find((g) => g.kind === "single");
    expect(collection).toMatchObject({ kind: "collection", campaignId: "str", dailyCount: 2 });
    expect(collection!.cumulative.id).toBe("str-c");
    expect(singleG).toMatchObject({ kind: "single" });
    expect(singleG!.artifact.id).toBe("s1");
  });
  it("orders groups by recency (newest artifact first)", () => {
    const groups = groupArtifacts([single("s1", "one"), cum("str")]);
    expect(groups[0].kind).toBe("collection"); // 2026-06-05 > 2026-06-01
  });
});
