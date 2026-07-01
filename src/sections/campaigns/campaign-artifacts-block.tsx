"use client";

import { FileText } from "lucide-react";
import type { Artifact } from "@/state/app-state";

/** Russian label for an artifact kind (spec §2). */
export function artifactKindLabel(kind: Artifact["kind"]): string {
  return kind === "signals_conversions" ? "Сигналы и конверсии" : "Сигналы";
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

interface CampaignArtifactsBlockProps {
  artifacts: Artifact[];
  /** When the campaign is still scoring, show a «формируется» note instead. */
  forming?: boolean;
  onOpen?: (id: string) => void;
}

export function CampaignArtifactsBlock({
  artifacts,
  forming,
  onOpen,
}: CampaignArtifactsBlockProps) {
  if (artifacts.length === 0) {
    if (forming) {
      return (
        <p className="text-sm text-muted-foreground">
          Артефакт формируется — будет готов после скоринга.
        </p>
      );
    }
    return null;
  }

  // Streaming campaign: a cumulative «Все сигналы за период» artifact plus
  // daily выжимки. Render a compact collection — cumulative row, up to 3
  // most-recent dailies, and a count of the rest. Opening any row routes to
  // the collection detail (via the cumulative artifact's id).
  const cumulative = artifacts.find((a) => a.variant === "cumulative");
  if (cumulative) {
    const dailies = artifacts
      .filter((a) => a.variant === "daily")
      .sort((a, b) => {
        const ap = a.periodDate ?? "";
        const bp = b.periodDate ?? "";
        return ap < bp ? 1 : ap > bp ? -1 : 0;
      });
    const shown = dailies.slice(0, 3);
    return (
      <div className="flex flex-col">
        <button
          type="button"
          onClick={onOpen ? () => onOpen(cumulative.id) : undefined}
          disabled={!onOpen}
          className="flex items-center gap-3 py-2.5 text-left text-sm transition-colors enabled:hover:text-foreground disabled:cursor-default"
        >
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-medium text-foreground">Все сигналы за период</span>
          <span className="text-muted-foreground">{formatNumber(cumulative.count)} сигналов</span>
        </button>
        {shown.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={onOpen ? () => onOpen(cumulative.id) : undefined}
            disabled={!onOpen}
            className="flex items-center gap-3 border-t border-border/40 py-2.5 text-left text-sm transition-colors enabled:hover:text-foreground disabled:cursor-default"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-foreground">
              Выжимка · {d.periodDate ? `${d.periodDate.slice(8, 10)}.${d.periodDate.slice(5, 7)}` : "—"}
            </span>
            <span className="tabular-nums text-muted-foreground">{formatNumber(d.count)}</span>
          </button>
        ))}
        {dailies.length > shown.length && (
          <p className="border-t border-border/40 py-2.5 text-xs text-muted-foreground">
            …ещё {dailies.length - shown.length} выжимок
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {artifacts.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={onOpen ? () => onOpen(a.id) : undefined}
          disabled={!onOpen}
          className="flex items-center gap-3 border-t border-border/40 py-2.5 text-left text-sm transition-colors first:border-t-0 enabled:hover:text-foreground disabled:cursor-default"
        >
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-medium text-foreground">
            {artifactKindLabel(a.kind)}
          </span>
          <span className="text-muted-foreground">
            {formatNumber(a.count)} контактов
          </span>
        </button>
      ))}
    </div>
  );
}
