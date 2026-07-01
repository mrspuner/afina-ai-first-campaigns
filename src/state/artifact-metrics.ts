import type { Campaign, Artifact } from "./app-state";
import { campaignBaseRows } from "@/sections/campaigns/campaign-metrics";
import { rngFor, seededInt } from "./metrics";

/** Fallback audience base mirrors the wizard's FALLBACK_BASE. */
const FALLBACK_BASE = 10_000;

/**
 * Prototype reach estimate for the artifact a campaign produces.
 * own → the uploaded base size; new/stream → file size if any, else a
 * deterministic scenario-independent fallback (no RNG — keeps tests stable).
 */
export function estimateArtifactCount(campaign: Campaign): number {
  const rows = campaignBaseRows(campaign);
  if (rows) return rows;
  return FALLBACK_BASE;
}

/** Degenerate (no comms) → "signals"; full → "signals_conversions" (spec §3). */
export function artifactKindForCampaign(campaign: Campaign): Artifact["kind"] {
  return (campaign.channels?.length ?? 0) === 0 ? "signals" : "signals_conversions";
}

/** Streaming campaigns (analysisMode «Потоковый» → sourceType "stream") accrue daily digests. */
export function isStreamingCampaign(c: Pick<Campaign, "sourceType">): boolean {
  return c.sourceType === "stream";
}

/** Accelerated-demo cap on the number of daily digests per streaming campaign. */
export const MAX_DIGESTS = 14;

/** Deterministic seeded per-day signal count for a streaming campaign's digest. */
export function digestCount(campaignId: string, dayIndex: number): number {
  return seededInt(rngFor("daily-digest", campaignId, dayIndex), 400, 5200);
}

/** `baseIso` + `days` as a YYYY-MM-DD string (the digest's covered day). */
export function addDaysIso(baseIso: string, days: number): string {
  const d = new Date(baseIso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
