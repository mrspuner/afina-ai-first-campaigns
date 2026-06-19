import type { Campaign, Artifact } from "./app-state";

/** Fallback audience base mirrors the wizard's FALLBACK_BASE. */
const FALLBACK_BASE = 10_000;

/**
 * Prototype reach estimate for the artifact a campaign produces.
 * own → the uploaded base size; new/stream → file size if any, else a
 * deterministic scenario-independent fallback (no RNG — keeps tests stable).
 */
export function estimateArtifactCount(campaign: Campaign): number {
  if (campaign.file?.rowCount) return campaign.file.rowCount;
  return FALLBACK_BASE;
}

/** Degenerate (no comms) → "signals"; full → "signals_conversions" (spec §3). */
export function artifactKindForCampaign(campaign: Campaign): Artifact["kind"] {
  return (campaign.channels?.length ?? 0) === 0 ? "signals" : "signals_conversions";
}
