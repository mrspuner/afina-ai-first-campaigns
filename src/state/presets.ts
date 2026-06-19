import { nanoid } from "nanoid";
import type {
  Artifact,
  Campaign,
  CampaignStatus,
  Preset,
} from "./app-state";
import type { Channel, SourceType } from "@/types/campaign";
import { SCENARIOS } from "@/data/scenarios";
import { makeRng } from "./metrics";
import {
  artifactKindForCampaign,
  estimateArtifactCount,
} from "./artifact-metrics";

const PRETTY_NAMES = [
  "Летний апсейл премиум",
  "Возврат Q2",
  "Реактивация спящих",
  "Первая сделка — старт",
  "Регистрация онбординг",
  "Удержание VIP",
  "Апсейл флагман",
  "Возврат после месяца тишины",
];

const DAY_MS = 24 * 60 * 60 * 1000;

const ALL_CHANNELS: Channel[] = ["sms", "push", "email", "ivr"];

// PRNG (makeRng) берётся из единого движка чисел (src/state/metrics.ts) —
// никаких локальных генераторов.

function rndInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function rndPick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function rndPastDate(rng: () => number, spanDays: number, now: number): string {
  const offset = Math.floor(rng() * spanDays * DAY_MS);
  return new Date(now - offset).toISOString();
}

function rndSample<T>(rng: () => number, arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

export type PresetKey = "empty" | "mid" | "full";

const LAUNCHED_STATUSES: CampaignStatus[] = ["active", "paused", "completed"];

type GenerateCampaignsOpts = {
  seed: number;
  distribution: Record<CampaignStatus, number>;
  dateSpanDays: number;
  now: number;
};

/**
 * Campaign-first seed: campaigns are generated FROM scenarios (no top-level
 * Signal). A base scenario is picked per campaign; `name`, `scenario`,
 * `sourceType`, `channels` (drives artifact kind) and `budget` are derived.
 * `signalId` is intentionally never set.
 */
export function generateCampaigns(opts: GenerateCampaignsOpts): Campaign[] {
  const rng = makeRng(opts.seed);
  const baseScenarios = SCENARIOS.filter((s) => s.isBase);

  const statuses: CampaignStatus[] = [];
  (Object.keys(opts.distribution) as CampaignStatus[]).forEach((status) => {
    for (let i = 0; i < opts.distribution[status]; i++) statuses.push(status);
  });
  // shuffle deterministically
  for (let i = statuses.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [statuses[i], statuses[j]] = [statuses[j], statuses[i]];
  }

  const out: Campaign[] = [];
  let prettyUsed = 0;
  statuses.forEach((status, idx) => {
    const scenario = rndPick(rng, baseScenarios);
    const usePretty = rng() < 0.2 && prettyUsed < PRETTY_NAMES.length;
    const name = usePretty
      ? PRETTY_NAMES[prettyUsed++]
      : `${scenario.name} #${idx + 1}`;

    // Source mostly "new" (cold acquisition), occasionally "own"/"stream".
    const sourceRoll = rng();
    const sourceType: SourceType =
      sourceRoll < 0.7 ? "new" : sourceRoll < 0.85 ? "own" : "stream";

    // ~60% get a non-empty channel subset → "signals_conversions" artifacts;
    // the rest get [] → degenerate "signals" artifacts.
    const channels: Channel[] =
      rng() < 0.6 ? rndSample(rng, ALL_CHANNELS, rndInt(rng, 1, 3)) : [];

    const createdAt = rndPastDate(rng, opts.dateSpanDays, opts.now);
    const campaign: Campaign = {
      id: `cmp_${nanoid(6)}_${idx}`,
      name,
      status,
      createdAt,
      scenario: { id: scenario.id, name: scenario.name },
      sourceType,
      channels,
      budget: rndInt(rng, 30, 300) * 1000,
    };

    if (status === "active") {
      campaign.launchedAt = rndPastDate(rng, 30, opts.now);
    }
    if (status === "paused") {
      // Launched 5–30 days ago, paused some time AFTER launch (never before).
      const launchedMs = opts.now - (5 + Math.floor(rng() * 26)) * DAY_MS;
      campaign.launchedAt = new Date(launchedMs).toISOString();
      campaign.pausedAt = new Date(
        launchedMs + Math.floor(rng() * (opts.now - launchedMs))
      ).toISOString();
    }
    if (status === "completed") {
      // Launched within the span, completed between launch and now — so the
      // lifetime window [launchedAt, completedAt] is always valid (otherwise
      // the stats cube drops the campaign entirely).
      const launchedMs =
        opts.now - Math.floor(rng() * opts.dateSpanDays * DAY_MS);
      campaign.launchedAt = new Date(launchedMs).toISOString();
      campaign.completedAt = new Date(
        launchedMs + Math.floor(rng() * (opts.now - launchedMs))
      ).toISOString();
    }

    // Demo: scoring already finished on every launched campaign.
    if (LAUNCHED_STATUSES.includes(status)) {
      campaign.phase = "communicating";
    }

    out.push(campaign);
  });
  return out;
}

type GenerateArtifactsOpts = {
  seed: number;
  campaigns: Campaign[];
};

/**
 * Exactly one ready Artifact per LAUNCHED campaign (active/paused/completed —
 * never draft). Kind/count derive from the campaign (artifact-metrics);
 * `createdAt` mirrors the campaign's launchedAt.
 */
export function generateArtifacts(opts: GenerateArtifactsOpts): Artifact[] {
  const rng = makeRng(opts.seed);
  const out: Artifact[] = [];
  let idx = 0;
  for (const campaign of opts.campaigns) {
    if (!LAUNCHED_STATUSES.includes(campaign.status)) continue;
    const base = estimateArtifactCount(campaign);
    // Spread around the deterministic base for plausible variety.
    const count = campaign.file?.rowCount
      ? base
      : rndInt(rng, Math.round(base * 0.5), Math.round(base * 2.5));
    out.push({
      id: `art_${nanoid(6)}_${idx}`,
      campaignId: campaign.id,
      kind: artifactKindForCampaign(campaign),
      count,
      createdAt: campaign.launchedAt ?? campaign.createdAt,
    });
    idx++;
  }
  return out;
}

function buildPresets(): Record<PresetKey, Preset> {
  const now = Date.now();

  const midCampaigns = generateCampaigns({
    seed: 0xcafe,
    distribution: { active: 2, paused: 1, completed: 3, draft: 2 },
    dateSpanDays: 30,
    now,
  });
  const midArtifacts = generateArtifacts({
    seed: 0x5eed,
    campaigns: midCampaigns,
  });

  const fullCampaigns = generateCampaigns({
    seed: 0xf00d,
    distribution: { active: 8, paused: 2, completed: 10, draft: 6 },
    dateSpanDays: 90,
    now,
  });
  const fullArtifacts = generateArtifacts({
    seed: 0xb16b00b5,
    campaigns: fullCampaigns,
  });

  return {
    empty: { key: "empty", label: "Empty", campaigns: [], artifacts: [] },
    mid: {
      key: "mid",
      label: "Mid",
      campaigns: midCampaigns,
      artifacts: midArtifacts,
    },
    full: {
      key: "full",
      label: "Full",
      campaigns: fullCampaigns,
      artifacts: fullArtifacts,
    },
  };
}

export const PRESETS: Record<PresetKey, Preset> = buildPresets();
