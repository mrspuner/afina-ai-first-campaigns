"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Artifact } from "@/state/app-state";
import { ARTIFACT_KIND_LABEL } from "./artifact-labels";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU");
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

interface ArtifactCardProps {
  artifact: Artifact;
  /** Resolved name of the campaign that produced this artifact. */
  campaignName: string;
  onOpenCampaign: (campaignId: string) => void;
  onDownload: (artifactId: string) => void;
  /**
   * Page-entrance stagger position (0-based). Each step adds 40 ms of
   * animation-delay so a fresh list cascades in instead of popping at once.
   */
  index?: number;
}

export function ArtifactCard({
  artifact,
  campaignName,
  onOpenCampaign,
  onDownload,
  index = 0,
}: ArtifactCardProps) {
  const { id, kind, count, createdAt, campaignId } = artifact;

  return (
    <Card
      className="animate-in fade-in-0 slide-in-from-bottom-2 gap-2 px-5 py-4 [--tw-animation-duration:220ms] [--tw-ease:var(--ease-out)]"
      style={index > 0 ? { animationDelay: `${index * 40}ms` } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
          <span>{ARTIFACT_KIND_LABEL[kind]}</span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular-nums">{formatNumber(count)}</span>
        </p>
        <p className="text-xs text-muted-foreground">{formatDate(createdAt)}</p>
      </div>

      <p className="text-xs text-muted-foreground">
        Кампания:{" "}
        <button
          type="button"
          onClick={() => onOpenCampaign(campaignId)}
          className="rounded text-foreground/80 underline-offset-2 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {campaignName}
        </button>
      </p>

      <div className="mt-2 flex items-center justify-end gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Скачать сигналы"
          onClick={() => onDownload(id)}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
