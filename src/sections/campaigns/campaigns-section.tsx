"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { CampaignCard } from "./campaign-card";
import { NewCampaignCard } from "./new-campaign-card";
import { CampaignFilterChips } from "./campaign-filter-chips";
import { CampaignsNoResults } from "./campaigns-no-results";
import { getCampaignCardMetrics } from "./campaign-metrics";
import type { Campaign, Signal } from "@/state/app-state";

function relevantTimestamp(c: Campaign): string {
  return c.launchedAt ?? c.completedAt ?? c.createdAt;
}

function conversionFor(c: Campaign, signal: Signal | undefined): number {
  const m = getCampaignCardMetrics(c, signal);
  if (!m.launched) return Number.NEGATIVE_INFINITY;
  return m.crPct;
}

export function CampaignsSection() {
  const { signals, campaigns, campaignFilter, campaignSort } = useAppState();
  const dispatch = useAppDispatch();

  const signalById = useMemo(
    () => new Map(signals.map((s) => [s.id, s])),
    [signals]
  );

  // TODO(wave1): campaign-first инверсия сделала Campaign.signalId опциональным.
  // Этот файл — собственность эпика «Кампании» (перейдёт на campaignId-keyed
  // Artifact). Пока просто безопасно резолвим сигнал по возможному signalId.
  const signalFor = (c: { signalId?: string }) =>
    c.signalId ? signalById.get(c.signalId) : undefined;

  const sorted = useMemo(() => {
    const arr = [...campaigns];
    if (campaignSort === "conversion-desc") {
      arr.sort(
        (a, b) =>
          conversionFor(b, signalFor(b)) -
          conversionFor(a, signalFor(a))
      );
    } else {
      arr.sort((a, b) =>
        relevantTimestamp(a) < relevantTimestamp(b) ? 1 : -1
      );
    }
    return arr;
  }, [campaigns, campaignSort, signalById]);

  const filtered = useMemo(
    () =>
      campaignFilter.length === 0
        ? sorted
        : sorted.filter((c) => campaignFilter.includes(c.status)),
    [sorted, campaignFilter]
  );

  const goToSignals = () =>
    dispatch({ type: "sidebar_nav", section: "Сигналы" });

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-8 pb-promptbar pt-[140px]">
      <div className="mx-auto flex w-full max-w-2xl flex-col">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h1 className="text-[38px] font-semibold leading-[46px] tracking-tight">
            Кампании
          </h1>
          {campaigns.length > 0 && (
            <Button
              variant="outline"
              onClick={() => dispatch({ type: "start_campaign_flow" })}
            >
              <Plus className="h-4 w-4" />
              Создать кампанию
            </Button>
          )}
        </div>

        {campaigns.length === 0 ? (
          <NewCampaignCard onGoToSignals={goToSignals} />
        ) : (
          <>
            <CampaignFilterChips
              statuses={campaignFilter}
              sort={campaignSort}
            />
            {filtered.length === 0 ? (
              <CampaignsNoResults />
            ) : (
              <div className="flex flex-col gap-3">
                {filtered.map((c) => (
                  <CampaignCard
                    key={c.id}
                    campaign={c}
                    signal={signalFor(c)}
                    onOpen={(id) => dispatch({ type: "campaign_opened", id })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
