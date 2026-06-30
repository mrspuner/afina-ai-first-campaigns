import type { Campaign, Artifact } from "./app-state";
import { campaignBaseRows } from "@/sections/campaigns/campaign-metrics";
import { rngFor } from "./metrics";

/** Fallback audience base mirrors the wizard's FALLBACK_BASE. */
const FALLBACK_BASE = 10_000;

// Доля сматчившихся сигналов от загруженной базы: matched = rate × baseSize,
// т.е. baseSize = matched / rate. Полоса 40–70% держит «Номера» правдоподобно
// крупнее «Сигналов», не раздувая базу до абсурда.
const MATCH_RATE_MIN = 0.4;
const MATCH_RATE_MAX = 0.7;

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

/**
 * «Номера» — размер загруженной базы за артефактом, у которого «Сигналы»
 * (сматчилось) равно `matched`. Всегда ≥ `matched` (инвариант сигналы ≤ номера).
 * Детерминирован по `seed` (обычно campaignId), чтобы пресеты были
 * воспроизводимы: rate ∈ [40%, 70%], baseSize ≈ matched / rate.
 */
export function estimateBaseSize(
  matched: number,
  ...seed: Array<string | number>
): number {
  if (matched <= 0) return 0;
  const rng = rngFor("artifact-base", ...seed);
  const rate = MATCH_RATE_MIN + rng() * (MATCH_RATE_MAX - MATCH_RATE_MIN);
  return Math.max(matched, Math.round(matched / rate));
}
