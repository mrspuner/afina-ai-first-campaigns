"use client";

import type { Campaign, Artifact } from "@/state/app-state";
import { getCampaignCardMetrics } from "./campaign-metrics";
import { formatRubPlain } from "@/lib/format-rub";

export interface CampaignStats {
  sends: number;
  crPct: number;
  plannedBudget: number;
  actualSpend: number;
}

/**
 * Pure in-card statistics summary for an open campaign. Reuses the same
 * `getCampaignCardMetrics` engine the list card uses (one source of truth).
 * Returns null for drafts (no facts yet).
 */
export function buildCampaignStats(
  campaign: Campaign,
  artifact?: Artifact
): CampaignStats | null {
  const m = getCampaignCardMetrics(campaign, artifact);
  if (!m.launched) return null;
  return {
    sends: m.sends,
    crPct: m.crPct,
    plannedBudget: m.plannedBudget,
    actualSpend: m.actualSpend,
  };
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

function formatRub(value: number): string {
  const abs = Math.round(value);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)} млн ₽`;
  if (abs >= 10_000) return `${Math.round(abs / 1_000)} тыс ₽`;
  return `${abs.toLocaleString("ru-RU")} ₽`;
}

interface CampaignStatsBlockProps {
  campaign: Campaign;
  artifact?: Artifact;
  /** false → метрики отправок/кликов/действий/CR пустые («—») до коммуникации. */
  populated?: boolean;
}

export function CampaignStatsBlock({ campaign, artifact, populated = true }: CampaignStatsBlockProps) {
  const stats = buildCampaignStats(campaign, artifact);
  if (!stats) return null;

  const isDegenerate = (campaign.channels?.length ?? 0) === 0;
  const dash = "—";

  return (
    <div className="flex flex-col gap-4">
      {isDegenerate ? (
        <p className="text-sm text-muted-foreground">
          Кампания без коммуникации — статистика отправок не формируется.
        </p>
      ) : (
        <>
          {/* Compact funnel: отправки → клики → действия → одобрения */}
          <div className="grid grid-cols-4 gap-2">
            <Metric label="Отправки" value={populated ? formatNumber(stats.sends) : dash} />
            <Metric
              label="Клики"
              value={populated ? formatNumber(Math.round(stats.sends * 0.18)) : dash}
            />
            <Metric
              label="Действия"
              value={populated ? formatNumber(Math.round(stats.sends * 0.07)) : dash}
            />
            <Metric
              label="CR"
              value={populated ? `${stats.crPct.toFixed(1)}%` : dash}
            />
          </div>
        </>
      )}

      <div className="flex items-baseline justify-between border-t border-border/60 pt-3 text-sm">
        <span className="text-muted-foreground">Бюджет (расчётный)</span>
        <span className="tabular-nums text-foreground">
          {formatRub(stats.plannedBudget)}
        </span>
      </div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">Бюджет (факт)</span>
        <span className="tabular-nums text-foreground">
          {formatRub(stats.actualSpend)}
        </span>
      </div>
      {/* Потолок, заданный пользователем в визарде (только stream). Точный
          формат — это введённая сумма, округлять её нельзя. */}
      {campaign.maxDailyBudget != null && (
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Макс. дневной бюджет</span>
          <span className="tabular-nums text-foreground">
            {formatRubPlain(campaign.maxDailyBudget)}
          </span>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2">
      <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="text-base font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}
