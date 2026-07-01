import { describe, it, expect } from "vitest";
import { campaignsNeedingDigest, DIGEST_INTERVAL_MS } from "./stream-digest-driver";
import type { Campaign, Artifact } from "@/state/app-state";

const stream = (id: string, status: Campaign["status"] = "active"): Campaign => ({
  id, name: id, status, createdAt: "2026-06-17T00:00:00.000Z", sourceType: "stream", channels: [],
});
const daily = (campaignId: string): Artifact => ({
  id: `${campaignId}-d`, campaignId, kind: "signals", count: 1, createdAt: "x", variant: "daily",
});

describe("campaignsNeedingDigest", () => {
  it("returns active streaming campaigns under the digest cap", () => {
    expect(campaignsNeedingDigest([stream("a")], [])).toEqual(["a"]);
  });
  it("excludes paused / non-stream", () => {
    expect(campaignsNeedingDigest([stream("a", "paused"), { ...stream("b"), sourceType: "new" }], [])).toEqual([]);
  });
  it("excludes campaigns that reached the cap", () => {
    const capped = Array.from({ length: 14 }, () => daily("a"));
    expect(campaignsNeedingDigest([stream("a")], capped)).toEqual([]);
  });
});

describe("DIGEST_INTERVAL_MS", () => {
  it("is a few seconds (accelerated demo cadence)", () => {
    expect(DIGEST_INTERVAL_MS).toBe(7000);
  });
});
