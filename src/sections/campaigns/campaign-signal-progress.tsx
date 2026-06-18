"use client";

import { Check, CircleDashed, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProviderList } from "./provider-list";
import { rngFor } from "@/state/metrics";
import type { Campaign } from "@/state/app-state";

type Phase = NonNullable<Campaign["phase"]>;

/** Salvaged from step-7-processing: the collection-stage checklist. */
const STEPS: Array<{ id: string; label: string }> = [
  { id: "uploaded", label: "База загружена и проверена" },
  { id: "sent", label: "Отправлено провайдерам" },
  { id: "processing", label: "Идёт обработка" },
  { id: "ready", label: "Сигналы готовы" },
];

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

/** Salvaged from step-7: which checklist step is active for a given phase. */
function activeIndexForPhase(phase: Phase): number {
  return phase === "communicating" ? STEPS.length : 2;
}

function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

interface CampaignSignalProgressProps {
  campaign: Campaign;
}

export function CampaignSignalProgress({ campaign }: CampaignSignalProgressProps) {
  const phase: Phase = campaign.phase ?? "scoring";
  const activeIndex = activeIndexForPhase(phase);
  const fraction = processedFraction(campaign.id, phase);

  const supportClick = () => window.alert("Поддержка: support@afina.ai");

  return (
    <div className="flex flex-col gap-5">
      {/* % of base processed */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Обработано базы
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
      </div>

      {/* Step-by-step checklist (salvaged from step-7-processing) */}
      <ol className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-5">
        {STEPS.map((s, idx) => {
          const done = idx < activeIndex;
          const active = idx === activeIndex;
          return (
            <li key={s.id} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                {done ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin text-foreground" />
                ) : (
                  <CircleDashed className="h-4 w-4 text-muted-foreground/60" />
                )}
              </span>
              <span
                className={
                  done
                    ? "text-sm text-muted-foreground line-through decoration-muted-foreground/30"
                    : active
                      ? "text-sm font-medium text-foreground"
                      : "text-sm text-muted-foreground"
                }
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Connected operators */}
      <ProviderList />

      <div className="flex items-center justify-start">
        <Button variant="outline" onClick={supportClick} className="gap-2">
          <MessageCircle className="h-4 w-4" />
          Связаться с поддержкой
        </Button>
      </div>
    </div>
  );
}
