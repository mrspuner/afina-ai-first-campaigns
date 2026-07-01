"use client";

import { Download, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Artifact } from "@/state/app-state";
import { cn } from "@/lib/utils";

function formatNumber(n: number): string { return n.toLocaleString("ru-RU"); }

interface ArtifactCollectionCardProps {
  campaignName: string;
  cumulative: Artifact;
  dailyCount: number;
  onOpen: (cumulativeId: string) => void;
  onDownload: (cumulativeId: string) => void;
}

export function ArtifactCollectionCard({ campaignName, cumulative, dailyCount, onOpen, onDownload }: ArtifactCollectionCardProps) {
  const fileCount = dailyCount + 1; // dailies + the cumulative file
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onOpen(cumulative.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(cumulative.id); } }}
      aria-label={`Поток · ${campaignName}`}
      className={cn("gap-2 px-5 py-4 cursor-pointer transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            Поток · {campaignName}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fileCount} файлов · {formatNumber(cumulative.count)} сигналов · обновляется
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="sm" onClick={() => onDownload(cumulative.id)}>
            <Download className="mr-1.5 h-4 w-4" />
            Скачать общий
          </Button>
        </div>
      </div>
    </Card>
  );
}
