"use client";

import { Card } from "@/components/ui/card";
import type { Campaign, Artifact } from "@/state/app-state";
import type { SourceType } from "@/types/campaign";
import { StatusBadge } from "./status-badge";
import { getCampaignCardMetrics } from "./campaign-metrics";

const SOURCE_LABEL: Record<SourceType, string> = {
  new: "Новая база номеров",
  stream: "Поток",
  own: "Свои сигналы",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU");
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

/** Компактный рубль: точные значения до 10 тыс., дальше — «тыс»/«млн». */
function formatRub(value: number): string {
  const abs = Math.round(value);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)} млн ₽`;
  if (abs >= 10_000) return `${Math.round(abs / 1_000)} тыс ₽`;
  return `${abs.toLocaleString("ru-RU")} ₽`;
}

function timestampLine(c: Campaign): string {
  if (c.status === "active" && c.launchedAt) return `Запущена ${formatDate(c.launchedAt)}`;
  if (c.status === "completed" && c.completedAt) return `Завершена ${formatDate(c.completedAt)}`;
  return `Черновик от ${formatDate(c.createdAt)}`;
}

interface CampaignCardProps {
  campaign: Campaign;
  artifact?: Artifact;
  onOpen: (id: string) => void;
}

export function CampaignCard({ campaign, artifact, onOpen }: CampaignCardProps) {
  const scenarioName = campaign.scenario?.name ?? "—";
  const sourceLabel = campaign.sourceType
    ? SOURCE_LABEL[campaign.sourceType]
    : null;
  const isDegenerate = (campaign.channels?.length ?? 0) === 0;

  const metrics = getCampaignCardMetrics(campaign, artifact);

  return (
    <Card
      className="cursor-pointer gap-2 px-5 py-4 transition-colors hover:bg-accent"
      onClick={() => onOpen(campaign.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(campaign.id);
        }
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{campaign.name}</p>
        <StatusBadge status={campaign.status} />
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="shrink-0 rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground">
            Сценарий: {scenarioName}
          </span>
          {sourceLabel && (
            <span className="shrink-0 rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {sourceLabel}
            </span>
          )}
        </div>
        <p className="shrink-0 text-xs text-muted-foreground">{timestampLine(campaign)}</p>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-2 text-xs">
        {isDegenerate ? (
          <StatItem label="Коммуникация" value="Без коммуникации" />
        ) : (
          metrics.launched && (
            <>
              <StatItem label="Отправки" value={formatNumber(metrics.sends)} />
              <StatItem label="CR" value={`${metrics.crPct.toFixed(1)}%`} />
            </>
          )
        )}
        <StatItem
          label="Бюджет (расчётный)"
          value={formatRub(metrics.plannedBudget)}
        />
        {metrics.launched && (
          <StatItem
            label="Бюджет (факт)"
            value={formatRub(metrics.actualSpend)}
          />
        )}
      </div>
    </Card>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}
