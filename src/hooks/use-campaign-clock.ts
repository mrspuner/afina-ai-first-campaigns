"use client";

import { useEffect, useReducer } from "react";
import type { Campaign } from "@/state/app-state";
import { campaignStageList, stageBoundariesMs } from "@/sections/campaigns/campaign-progress";

/**
 * Прошедшее время с запуска кампании (ms) для вывода текущего этапа прогресса.
 * `active` → now − launchedAt (перерисовка на границах этапов), `paused` →
 * заморожено на pausedAt, `completed` → Infinity (все этапы done), иначе 0.
 */
export function useCampaignClock(campaign: Campaign): number {
  const [version, tick] = useReducer((n: number) => n + 1, 0);
  const { status, launchedAt, pausedAt } = campaign;

  const elapsed = computeElapsed(status, launchedAt, pausedAt);

  useEffect(() => {
    if (status !== "active" || !launchedAt) return;
    const now = Math.max(0, Date.now() - Date.parse(launchedAt));
    const next = stageBoundariesMs(campaignStageList(campaign)).find((b) => b > now);
    if (next === undefined) return;
    const t = setTimeout(() => tick(), next - now + 50);
    return () => clearTimeout(t);
    // version: перевзвод таймера на следующую границу после каждой перерисовки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, launchedAt, version, campaign.sourceType, campaign.channels?.length]);

  return elapsed;
}

function computeElapsed(
  status: Campaign["status"],
  launchedAt: string | undefined,
  pausedAt: string | undefined,
): number {
  if (status === "completed") return Infinity;
  if (!launchedAt) return 0;
  const end = status === "paused" && pausedAt ? Date.parse(pausedAt) : Date.now();
  return Math.max(0, end - Date.parse(launchedAt));
}
