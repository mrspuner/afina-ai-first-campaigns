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
import type { Campaign, Artifact } from "@/state/app-state";

function relevantTimestamp(c: Campaign): string {
  return c.launchedAt ?? c.completedAt ?? c.createdAt;
}

function conversionFor(c: Campaign, artifact: Artifact | undefined): number {
  const m = getCampaignCardMetrics(c, artifact);
  if (!m.launched) return Number.NEGATIVE_INFINITY;
  return m.crPct;
}

export function CampaignsSection() {
  const { artifacts, campaigns, campaignFilter, campaignSort } = useAppState();
  const dispatch = useAppDispatch();

  // Campaign-first: cards no longer join a signal — they read the campaign's
  // own Artifact (keyed by campaignId) for the funnel base.
  const artifactByCampaign = useMemo(() => {
    const m = new Map<string, Artifact>();
    for (const a of artifacts) {
      // Keep the latest artifact per campaign.
      const prev = m.get(a.campaignId);
      if (!prev || a.createdAt > prev.createdAt) m.set(a.campaignId, a);
    }
    return m;
  }, [artifacts]);

  const artifactFor = (c: Campaign) => artifactByCampaign.get(c.id);

  const sorted = useMemo(() => {
    const arr = [...campaigns];
    if (campaignSort === "conversion-desc") {
      arr.sort(
        (a, b) =>
          conversionFor(b, artifactByCampaign.get(b.id)) -
          conversionFor(a, artifactByCampaign.get(a.id))
      );
    } else {
      arr.sort((a, b) =>
        relevantTimestamp(a) < relevantTimestamp(b) ? 1 : -1
      );
    }
    return arr;
  }, [campaigns, campaignSort, artifactByCampaign]);

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
                    artifact={artifactFor(c)}
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
