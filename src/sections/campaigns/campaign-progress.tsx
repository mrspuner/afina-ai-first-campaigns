"use client";

import { useState } from "react";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { rngFor, seededInt } from "@/state/metrics";
import type { Campaign } from "@/state/app-state";
import { PROVIDERS } from "@/data/providers";
import { ProviderList } from "./provider-list";
import { useCampaignClock } from "@/hooks/use-campaign-clock";

// ---------------------------------------------------------------------------
// Stage model (pure) — the canonical «Прогресс кампании» sequence
// ---------------------------------------------------------------------------

export type StageStatus = "done" | "current" | "pending";

export interface ProgressStage {
  /** Stable id. The `process` id marks the stage that hosts the provider list. */
  id: string;
  label: string;
}

export interface CampaignProgress {
  stages: ProgressStage[];
  /** Index of the current stage. `=== stages.length` ⇒ every stage is done. */
  currentIndex: number;
}

const NON_STREAM_COMM: ProgressStage[] = [
  { id: "send", label: "Отправка провайдерам" },
  { id: "verify", label: "Проверка провайдерами" },
  { id: "process", label: "Обработка базы" },
  { id: "communicate", label: "Коммуникация по сигналам" },
  { id: "done", label: "Кампания завершена" },
];

const NON_STREAM_NO_COMM: ProgressStage[] = [
  { id: "send", label: "Отправка провайдерам" },
  { id: "verify", label: "Проверка провайдерами" },
  { id: "process", label: "Обработка базы" },
  { id: "done", label: "Кампания завершена" },
];

const STREAM: ProgressStage[] = [
  { id: "connect", label: "Подключение к провайдерам" },
  { id: "process", label: "Обработка и коммуникация" },
];

type ProgressCampaign = Pick<
  Campaign,
  "sourceType" | "channels" | "phase" | "status"
>;

/** Длительность этапа по id (ms). Этапы без записи и последний этап списка —
 *  терминальные (текущий «ongoing», без авто-перехода). */
const STAGE_DURATION_MS: Record<string, number> = {
  send: 8000,
  verify: 8000,
  connect: 8000,
  process: 30000,
};

/** Список этапов кампании (без индекса) — по типу источника + наличию comm. */
export function campaignStageList(c: ProgressCampaign): ProgressStage[] {
  const streaming = c.sourceType === "stream";
  if (streaming) return STREAM;
  const hasComm = (c.channels?.length ?? 0) > 0;
  return hasComm ? NON_STREAM_COMM : NON_STREAM_NO_COMM;
}

/**
 * Индекс текущего этапа по прошедшему времени с запуска. Терминальный этап
 * (последний в списке или без длительности — communicate/process-stream/done)
 * «залипает» как ongoing. `elapsedMs === Infinity` (completed) → все done.
 */
export function campaignStageAt(stages: ProgressStage[], elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs)) return stages.length;
  let acc = 0;
  for (let i = 0; i < stages.length; i++) {
    const isLast = i === stages.length - 1;
    const dur = STAGE_DURATION_MS[stages[i].id];
    if (isLast || dur === undefined) return i;
    acc += dur;
    if (elapsedMs < acc) return i;
  }
  return stages.length;
}

/** Момент (ms с запуска) старта коммуникации/артефакта — начало терминального
 *  этапа. Не-stream = 46000, stream = 8000. */
export function communicatingThresholdMs(stages: ProgressStage[]): number {
  let acc = 0;
  for (let i = 0; i < stages.length; i++) {
    const isLast = i === stages.length - 1;
    const dur = STAGE_DURATION_MS[stages[i].id];
    if (isLast || dur === undefined) return acc;
    acc += dur;
  }
  return acc;
}

/** Границы этапов (кумулятивные ms) для перерисовки часами. */
export function stageBoundariesMs(stages: ProgressStage[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < stages.length; i++) {
    const isLast = i === stages.length - 1;
    const dur = STAGE_DURATION_MS[stages[i].id];
    if (isLast || dur === undefined) break;
    acc += dur;
    out.push(acc);
  }
  return out;
}

/**
 * Derives the canonical progress stepper for a campaign — the stage list (by
 * source type + whether it communicates) and the current stage index. Pure and
 * deterministic: driven only by `sourceType`, `channels`, `phase`, `status`.
 *
 * Mapping (simulated prototype, mirrors the existing `phase` model):
 *  - streaming → «Подключение к провайдерам» → «Обработка и коммуникация».
 *    Current is the connect stage until `phase === "communicating"`.
 *  - non-streaming → Отправка → Проверка → Обработка → [Коммуникация] → Завершена.
 *    Current is «Обработка базы» while scoring; on advance to `communicating`
 *    it is «Коммуникация по сигналам» (with comms) or «Кампания завершена» (none).
 *  - `status === "completed"` → every stage is done.
 */
export function campaignProgressStages(c: ProgressCampaign): CampaignProgress {
  const streaming = c.sourceType === "stream";
  const hasComm = (c.channels?.length ?? 0) > 0;
  const completed = c.status === "completed";
  const communicating = c.phase === "communicating";

  if (streaming) {
    const stages = STREAM;
    const currentIndex = completed ? stages.length : communicating ? 1 : 0;
    return { stages, currentIndex };
  }

  const stages = hasComm ? NON_STREAM_COMM : NON_STREAM_NO_COMM;
  if (completed) return { stages, currentIndex: stages.length };

  const processIndex = stages.findIndex((s) => s.id === "process");
  // After the scoring→communicating advance the current stage becomes the
  // communication step, or — with no comms — the terminal «Кампания завершена».
  const commIndex = stages.findIndex((s) => s.id === "communicate");
  const communicatingIndex =
    commIndex >= 0 ? commIndex : stages.findIndex((s) => s.id === "done");

  return { stages, currentIndex: communicating ? communicatingIndex : processIndex };
}

/** Status of stage `i` within a derived progress (done | current | pending). */
export function stageStatus(progress: CampaignProgress, i: number): StageStatus {
  if (i < progress.currentIndex) return "done";
  if (i === progress.currentIndex) return "current";
  return "pending";
}

/** Collapsed-row summary — the current stage label, or «Кампания завершена». */
export function currentStageLabel(progress: CampaignProgress): string {
  const { stages, currentIndex } = progress;
  if (currentIndex >= stages.length) return "Кампания завершена";
  return stages[currentIndex].label;
}

// ---------------------------------------------------------------------------
// Deterministic per-provider signal estimates (no Math.random)
// ---------------------------------------------------------------------------

/** Deterministic «~N сигналов/день» for a provider on a campaign (seeded). */
export function providerSignalsPerDay(
  campaignId: string,
  providerId: string,
): number {
  return seededInt(rngFor("provider-signals", campaignId, providerId), 400, 5200);
}

/** Sum of the per-day estimates across the currently-connected providers. */
export function connectedSignalsPerDay(
  campaignId: string,
  connectedIds: readonly string[],
): number {
  return connectedIds.reduce(
    (sum, id) => sum + providerSignalsPerDay(campaignId, id),
    0,
  );
}

// ---------------------------------------------------------------------------
// Component — the expandable «Прогресс кампании» row + vertical stepper
// ---------------------------------------------------------------------------

/**
 * Compact, settled provider strip shown once the connection/process stage is
 * `done`. The live {@link ProviderList} unmounts, but the providers themselves
 * stay visible «в свёрнутом виде» — a dot + name per provider, connected
 * (emerald) or stuck (amber). Static and deterministic: no timers, no layout
 * shift, mirrors the settled end-state of the live list.
 */
function SettledProviders() {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
      {PROVIDERS.map((p) => {
        const connected = p.connectAfterMs !== null;
        return (
          <span
            key={p.id}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                connected ? "bg-emerald-500" : "bg-amber-500/70",
              )}
            />
            {p.name}
          </span>
        );
      })}
    </div>
  );
}

function StatusIcon({ status }: { status: StageStatus }) {
  if (status === "done") {
    return (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500"
        aria-hidden
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  }
  if (status === "current") {
    return (
      <Loader2
        className="h-4 w-4 shrink-0 animate-spin text-foreground"
        aria-hidden
      />
    );
  }
  return (
    <span
      className="h-4 w-4 shrink-0 rounded-full border border-dashed border-muted-foreground/50"
      aria-hidden
    />
  );
}

interface CampaignProgressProps {
  campaign: Campaign;
  /** Start expanded (used by tests / deterministic snapshots). Default collapsed. */
  defaultExpanded?: boolean;
}

export function CampaignProgress({
  campaign,
  defaultExpanded = false,
}: CampaignProgressProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const elapsed = useCampaignClock(campaign);
  const stages = campaignStageList(campaign);
  const progress: CampaignProgress = {
    stages,
    currentIndex: campaignStageAt(stages, elapsed),
  };
  const summary = currentStageLabel(progress);
  const streaming = campaign.sourceType === "stream";

  return (
    <div className="flex flex-col gap-3">
      {/* Collapsed row — «Прогресс» + chevron on the left, current stage right. */}
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between rounded-[3px] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span className="flex items-center gap-1 font-medium text-foreground">
          Прогресс
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground/70 transition-transform",
              expanded && "rotate-90",
            )}
          />
        </span>
        <span className="tabular-nums text-muted-foreground">{summary}</span>
      </button>

      {expanded && (
        <ol className="flex flex-col">
          {progress.stages.map((stage, i) => {
            const status = stageStatus(progress, i);
            const isProcess = stage.id === "process";
            // While the process stage runs — the live connection list; once it
            // completes the providers stay visible in a compact settled strip
            // (#8: они не исчезают вместе с «итоговой строкой»).
            const showLiveProviders = isProcess && status === "current";
            const showSettledProviders = isProcess && status === "done";
            const isLast = i === progress.stages.length - 1;
            return (
              <li key={stage.id} className="flex gap-3">
                {/* Icon rail + connector line */}
                <div className="flex flex-col items-center">
                  <StatusIcon status={status} />
                  {!isLast && (
                    <div
                      className={cn(
                        "w-px flex-1",
                        status === "done" ? "bg-emerald-500/30" : "bg-border",
                      )}
                    />
                  )}
                </div>

                {/* Stage label (+ provider detail under the current process stage) */}
                <div className={cn("flex-1", !isLast && "pb-3")}>
                  <span
                    className={cn(
                      "text-sm",
                      status === "current"
                        ? "font-medium text-foreground"
                        : status === "done"
                          ? "text-foreground/80"
                          : "text-muted-foreground",
                    )}
                  >
                    {stage.label}
                  </span>

                  {showLiveProviders && (
                    <div className="mt-2.5 rounded-lg border border-border/60 bg-background/40 px-3 py-1">
                      <ProviderList
                        campaignId={campaign.id}
                        showSummary={streaming}
                      />
                    </div>
                  )}

                  {showSettledProviders && <SettledProviders />}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
