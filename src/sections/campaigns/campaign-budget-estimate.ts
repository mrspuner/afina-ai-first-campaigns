/**
 * Graph-less budget forecast for the wizard's Бюджет step (spec §5).
 *
 * `computeCampaignCost` (campaign-cost.ts) works on the GRAPH, which only
 * exists on the canvas AFTER the wizard. Step-Бюджет has no graph yet — it
 * estimates from the chosen source + channels + base size. Per source:
 *  - own    → scoring (signals) line is free; only communication is charged.
 *  - new    → signals line charged; communication added when channels selected.
 *  - stream → like new, plus a per-day budget alongside the total cap.
 *  - degenerate (no channels) → communication 0; only the signals line remains.
 */
import type { SourceType, Channel } from "@/types/campaign";
import { UNIT_COST, DYNAMIC_RATE } from "./campaign-cost";

/** ₽ per scored contact for new/stream sources; own bases are free. */
const SIGNAL_UNIT_COST = 0.25;
/** Cap horizon (days) relating a stream's daily budget to its total cap. */
const STREAM_DAYS = 30;
/** Fallback base size when no file/scenario size is known. */
const FALLBACK_BASE = 10_000;

export interface BudgetEstimateInput {
  sourceType: SourceType;
  channels: Channel[];
  baseSize?: number;
}

export interface BudgetEstimate {
  /** Cost of producing the scored audience (0 for own bases). */
  signals: number;
  /** Cost of the channel touches (one primary per channel + repeat buffer). */
  communication: number;
  total: number;
  /** Stream source only: per-day budget. */
  dailyBudget?: number;
}

export function estimateCampaignBudget(input: BudgetEstimateInput): BudgetEstimate {
  const base =
    input.baseSize && input.baseSize > 0 ? input.baseSize : FALLBACK_BASE;
  const signals =
    input.sourceType === "own" ? 0 : Math.round(base * SIGNAL_UNIT_COST);
  // One primary touch per selected channel at that channel's unit cost, plus a
  // repeat buffer mirroring the canvas model (+DYNAMIC_RATE).
  const perChannel = input.channels.reduce(
    (sum, c) => sum + UNIT_COST[c] * base,
    0
  );
  const communication = Math.round(perChannel * (1 + DYNAMIC_RATE));
  const total = signals + communication;
  if (input.sourceType === "stream") {
    return {
      signals,
      communication,
      total,
      dailyBudget: Math.round(total / STREAM_DAYS),
    };
  }
  return { signals, communication, total };
}
