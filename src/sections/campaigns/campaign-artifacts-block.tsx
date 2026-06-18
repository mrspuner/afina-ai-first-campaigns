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
