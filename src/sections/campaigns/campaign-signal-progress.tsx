"use client";

import { MessageCircle, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProviderList } from "./provider-list";
import { rngFor, seededInt } from "@/state/metrics";
import type { Campaign } from "@/state/app-state";

type Phase = NonNullable<Campaign["phase"]>;

/**
 * Deterministic fraction of the base processed (0..1). Driven by campaign id +
 * phase via the seeded RNG (never Math.random — design principle: predictable).
 * `communicating` is fully processed (scoring done).
 */
export function processedFraction(campaignId: string, phase: Phase): number {
  if (phase === "communicating") return 1;
  // Mid-progress for the scoring phase — stable per campaign.
  return 0.3 + rngFor("progress", campaignId)() * 0.5;
}

/**
 * Deterministic count of signals accumulated for a stream campaign so far —
 * stable per campaign id (seeded, no Math.random). Drives the realtime line.
 */
export function streamSignalCount(campaignId: string): number {
  return seededInt(rngFor("stream-signals", campaignId), 1_200, 48_000);
}

function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

const supportClick = () => window.alert("Поддержка: support@afina.ai");

function SupportRow() {
  return (
    <div className="flex items-center justify-start">
      <Button variant="outline" onClick={supportClick} className="gap-2">
        <MessageCircle className="h-4 w-4" />
        Связаться с поддержкой
      </Button>
    </div>
  );
}

/**
 * Stream source — the signal file is written continuously, so there is no
 * staged collection. Show a live "writing in real time" indicator + the running
 * signal count, then the connected operators.
 */
function StreamSignalRealtime({ campaign }: { campaign: Campaign }) {
  const count = streamSignalCount(campaign.id);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="text-sm font-medium text-foreground">
            Файл сигнала пишется в реальном времени
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          <Radio className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
          ~{count.toLocaleString("ru-RU")} сигналов · обновляется
        </p>
      </div>

      <ProviderList />
      <SupportRow />
    </div>
  );
}

/**
 * Non-stream sources (`new` / `own`) — a single, non-staged collection
 * indicator: a progress bar + a neutral caption. No numbered "Сбор → Скоринг →
 * Коммуникация" stages (Block 9: открытая кампания без стадий).
 */
function CollectionProgress({ campaign }: { campaign: Campaign }) {
  const phase: Phase = campaign.phase ?? "scoring";
  const fraction = processedFraction(campaign.id, phase);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-foreground">
            Идёт сбор аудитории
          </span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatPct(fraction)}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: formatPct(fraction) }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Подбираем горячую аудиторию по интент-сигналам — это занимает несколько минут.
        </p>
      </div>

      <ProviderList />
      <SupportRow />
    </div>
  );
}

interface CampaignSignalProgressProps {
  campaign: Campaign;
}

export function CampaignSignalProgress({ campaign }: CampaignSignalProgressProps) {
  return campaign.sourceType === "stream" ? (
    <StreamSignalRealtime campaign={campaign} />
  ) : (
    <CollectionProgress campaign={campaign} />
  );
}
