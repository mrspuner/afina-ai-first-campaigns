// Single deterministic source of truth for every "magic" number in the
// prototype. Signal counts, segment splits, budget estimates and the
// statistics funnel are all derived here from stable inputs (entity ids,
// labels, budgets). The same input always yields the same number, and numbers
// that describe the same thing — a signal's count, its segment breakdown, the
// statistics of a campaign built on that signal — stay consistent on every
// screen. No `Math.random`, no per-module PRNGs: one engine, used everywhere.

import type { Currency } from "@/sections/statistics/statistics-state";

// ---------------------------------------------------------------------------
// Core primitives
// ---------------------------------------------------------------------------

/** FNV-1a hash → 32-bit unsigned seed. Stable across runs for equal inputs. */
export function hashSeed(...parts: Array<string | number>): number {
  let h = 2166136261;
  const s = parts.join("");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — the one PRNG used across the app. Deterministic per seed. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience: a deterministic RNG seeded by arbitrary stable parts. */
export function rngFor(...parts: Array<string | number>): () => number {
  return makeRng(hashSeed(...parts));
}

export function seededInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Signal segments
// ---------------------------------------------------------------------------

export type Segments = { max: number; high: number; mid: number; low: number };

/**
 * Splits a total into the four signal-quality buckets. The low bucket absorbs
 * the rounding remainder so the four parts always sum to EXACTLY `count` — the
 * invariant that keeps "сигналов найдено" (sum of segments) equal to the
 * signal's `count` shown on its card.
 */
export function splitSegments(count: number, rng: () => number): Segments {
  const weights = [rng(), rng(), rng(), rng()];
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const max = Math.floor((count * weights[0]) / total);
  const high = Math.floor((count * weights[1]) / total);
  const mid = Math.floor((count * weights[2]) / total);
  const low = count - max - high - mid;
  return { max, high, mid, low };
}

/**
 * Stable segment breakdown for a signal, keyed by its id so it never drifts
 * between renders and always sums to `count`. Use this anywhere a signal's
 * segments are materialised (wizard launch, file upload, presets).
 */
export function segmentsForSignal(signalId: string, count: number): Segments {
  return splitSegments(count, rngFor("segments", signalId));
}

// ---------------------------------------------------------------------------
// Budget → reachable signal count (single canonical formula)
// ---------------------------------------------------------------------------

/** Segment key → per-signal price (prototype pricing). The one true table. */
export const SEGMENT_PRICES: Record<string, number> = {
  max: 0.45,
  "very-high": 0.35,
  high: 0.25,
  medium: 0.07,
};

function selectedPrices(segments: readonly string[]): number[] {
  return segments.map((s) => SEGMENT_PRICES[s] ?? 0).filter(Boolean);
}

/**
 * The maximum number of signals a budget can reach — budget divided by the
 * cheapest selected segment. This is the figure a launched signal carries as
 * its `count`, so the wizard's upper estimate and the resulting card always
 * agree.
 */
export function estimateSignalCount(
  segments: readonly string[],
  budget: number,
): number {
  const prices = selectedPrices(segments);
  if (!prices.length || budget <= 0) return 0;
  return Math.floor(budget / Math.min(...prices));
}

/**
 * Inclusive [min, max] band of reachable signals for the budget. The upper
 * bound equals {@link estimateSignalCount}, so the range the user sees on
 * step-5/step-6 always contains the count the signal ends up with.
 */
export function signalCountRange(
  segments: readonly string[],
  budget: number,
): { min: number; max: number } {
  const prices = selectedPrices(segments);
  if (!prices.length || budget <= 0) return { min: 0, max: 0 };
  return {
    min: Math.floor(budget / Math.max(...prices)),
    max: Math.floor(budget / Math.min(...prices)),
  };
}

/** Deterministic budget recommendation from a parsed base size. */
export function recommendBudget(rowCount: number): number {
  if (rowCount <= 0) return 0;
  const rng = rngFor("budget", rowCount);
  return Math.max(50, Math.round(rowCount * (0.05 + rng() * 0.4)));
}

// ---------------------------------------------------------------------------
// Statistics funnel
// ---------------------------------------------------------------------------

/**
 * Numeric funnel — raw metric counts kept as numbers so they can be summed
 * exactly during aggregation (see {@link addFunnel}). Money is carried in a USD
 * base; currency conversion + formatting happen once at the end via
 * {@link formatFunnel}.
 */
export type FunnelNumbers = {
  sends: number;
  clicks: number;
  actions: number;
  holds: number;
  approves: number;
  rejects: number;
  expensesUsd: number;
  incomeUsd: number;
};

export const EMPTY_FUNNEL: FunnelNumbers = {
  sends: 0,
  clicks: 0,
  actions: 0,
  holds: 0,
  approves: 0,
  rejects: 0,
  expensesUsd: 0,
  incomeUsd: 0,
};

/** Formatted funnel row for display: money strings + recomputed % rates. */
export type FunnelDisplay = {
  expenses: string;
  income: string;
  sends: number;
  actions: number;
  holds: number;
  approves: number;
  ar: string;
  rejects: number;
  rr: string;
  clicks: number;
};

const CURRENCY_SYMBOL: Record<Currency, string> = {
  usd: "$",
  eur: "€",
  rub: "₽",
};

const CURRENCY_RATE: Record<Currency, number> = {
  usd: 1,
  eur: 0.92,
  rub: 93,
};

function formatMoney(value: number, currency: Currency): string {
  const fmt = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${fmt} ${CURRENCY_SYMBOL[currency]}`;
}

/**
 * Derives a numeric marketing funnel from a seeded RNG and a base send volume.
 * Pure numbers (no currency, no formatting) so atomic facts can be aggregated
 * losslessly. Downstream ratios (clicks/actions/holds/…) match the previous
 * implementation, so individual rows read the same as before.
 */
export function computeFunnel(rng: () => number, baseSends: number): FunnelNumbers {
  const sends = Math.max(0, Math.floor(baseSends));
  if (sends === 0) return { ...EMPTY_FUNNEL };
  const clicks = Math.floor(sends * (0.35 + rng() * 0.35));
  const actions = Math.floor(sends * (0.04 + rng() * 0.08));
  const holds = Math.floor(actions * (0.2 + rng() * 0.25));
  const approves = Math.floor(actions * (0.45 + rng() * 0.25));
  const rejects = Math.max(0, actions - holds - approves);
  const expensesUsd = 300 + rng() * 5000;
  const incomeUsd = expensesUsd * (4 + rng() * 18);
  return { sends, clicks, actions, holds, approves, rejects, expensesUsd, incomeUsd };
}

/** Масштабирует воронку долей прошедшего дня (0..1). Аддитивные целочисленные
 *  поля округляются вниз — чтобы рост по мере увеличения доли был монотонным.
 *  rejects пересчитывается из actions/holds/approves после округления, чтобы
 *  не разъезжался внутренний баланс (actions === holds + approves + rejects). */
export function scaleFunnel(n: FunnelNumbers, fraction: number): FunnelNumbers {
  const f = Math.max(0, Math.min(1, fraction));
  const actions = Math.floor(n.actions * f);
  const holds = Math.floor(n.holds * f);
  const approves = Math.floor(n.approves * f);
  return {
    sends: Math.floor(n.sends * f),
    clicks: Math.floor(n.clicks * f),
    actions,
    holds,
    approves,
    // Пересчитываем rejects из остатка — так же, как computeFunnel строит их.
    rejects: Math.max(0, actions - holds - approves),
    expensesUsd: n.expensesUsd * f,
    incomeUsd: n.incomeUsd * f,
  };
}

/** Sums two funnels field-by-field. Additive metrics roll up; rates are
 *  derived later from the aggregate, never summed. */
export function addFunnel(a: FunnelNumbers, b: FunnelNumbers): FunnelNumbers {
  return {
    sends: a.sends + b.sends,
    clicks: a.clicks + b.clicks,
    actions: a.actions + b.actions,
    holds: a.holds + b.holds,
    approves: a.approves + b.approves,
    rejects: a.rejects + b.rejects,
    expensesUsd: a.expensesUsd + b.expensesUsd,
    incomeUsd: a.incomeUsd + b.incomeUsd,
  };
}

/** Converts an aggregated numeric funnel into a formatted display row. AR/RR
 *  are recomputed from the aggregate (rates never aggregate additively). */
export function formatFunnel(n: FunnelNumbers, currency: Currency): FunnelDisplay {
  const rate = CURRENCY_RATE[currency];
  const ar = (n.approves / Math.max(n.sends, 1)) * 100;
  const rr = (n.rejects / Math.max(n.sends, 1)) * 100;
  return {
    expenses: formatMoney(n.expensesUsd * rate, currency),
    income: formatMoney(n.incomeUsd * rate, currency),
    sends: n.sends,
    clicks: n.clicks,
    actions: n.actions,
    holds: n.holds,
    approves: n.approves,
    rejects: n.rejects,
    ar: `${ar.toFixed(2)}%`,
    rr: `${rr.toFixed(2)}%`,
  };
}

/**
 * Deterministic total send volume for a campaign, anchored to its reach and
 * capped by it — you can't message more people than the campaign reached.
 * Reach is campaign-first: the sum of the campaign's Artifact counts (keyed by
 * campaignId). The statistics cube distributes this total across the campaign's
 * active days and channels, so every breakdown rolls back up to it.
 */
export function campaignBaseSends(
  campaignId: string,
  reachCount: number | undefined,
): number {
  const reach = reachCount ?? 0;
  if (reach <= 0) return 0;
  const rng = rngFor("campaign-sends", campaignId);
  return Math.max(1, Math.floor(reach * (0.4 + rng() * 0.5)));
}
