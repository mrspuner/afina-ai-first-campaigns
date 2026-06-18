"use client";

import { Check } from "lucide-react";
import type { SourceType } from "@/types/campaign";
import type { Campaign } from "@/state/app-state";
import { cn } from "@/lib/utils";

/**
 * Linear «путь кампании» stages per source (spec §3):
 *  - new    → Сбор → Скоринг → Коммуникация → Результат
 *  - stream → Мониторинг → Скоринг → Коммуникация → Результат
 *  - own    → База загружена → Коммуникация → Результат (no scoring)
 * All paths end in Результат.
 */
export function campaignPathStages(sourceType: SourceType): string[] {
  switch (sourceType) {
    case "new":
      return ["Сбор", "Скоринг", "Коммуникация", "Результат"];
    case "stream":
      return ["Мониторинг", "Скоринг", "Коммуникация", "Результат"];
    case "own":
      return ["База загружена", "Коммуникация", "Результат"];
  }
}

/**
 * Maps a campaign's phase to the active stage index.
 *  - scoring → the scoring/collection stage (index of «Скоринг», else 0)
 *  - communicating → the «Коммуникация» stage
 *  - completed campaign → «Результат» (last)
 */
export function activeStageIndex(
  stages: string[],
  campaign: Pick<Campaign, "phase" | "status">
): number {
  if (campaign.status === "completed") return stages.length - 1;
  if (campaign.phase === "communicating") {
    const i = stages.indexOf("Коммуникация");
    return i >= 0 ? i : stages.length - 2;
  }
  // scoring (or unset): highlight the scoring stage if present, else the entry.
  const scoringIdx = stages.indexOf("Скоринг");
  return scoringIdx >= 0 ? scoringIdx : 0;
}

interface CampaignPathIndicatorProps {
  sourceType: SourceType;
  campaign: Pick<Campaign, "phase" | "status">;
}

export function CampaignPathIndicator({
  sourceType,
  campaign,
}: CampaignPathIndicatorProps) {
  const stages = campaignPathStages(sourceType);
  const activeIdx = activeStageIndex(stages, campaign);

  return (
    <ol className="flex items-center gap-1.5">
      {stages.map((label, idx) => {
        const isActive = idx === activeIdx;
        const isCompleted = idx < activeIdx;
        const isPending = idx > activeIdx;
        return (
          <li key={label} className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium transition-colors",
                  isCompleted && "border-primary bg-primary text-primary-foreground",
                  isActive && "border-brand bg-brand text-brand-foreground ring-2 ring-brand/25",
                  isPending && "border-border bg-background text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : <span>{idx + 1}</span>}
              </span>
              <span
                className={cn(
                  "text-xs",
                  isActive ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </div>
            {idx < stages.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "h-px w-5",
                  idx < activeIdx ? "bg-primary" : "bg-border"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
