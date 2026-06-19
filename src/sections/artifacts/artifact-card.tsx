"use client";

import { useState } from "react";
import { Download, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Artifact } from "@/state/app-state";
import { ARTIFACT_KIND_LABEL } from "./artifact-labels";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string { return new Date(iso).toLocaleDateString("ru-RU"); }
function formatNumber(n: number): string { return n.toLocaleString("ru-RU"); }

interface ArtifactCardProps {
  artifact: Artifact;
  campaignName: string;
  onOpen: (artifactId: string) => void;
  onOpenCampaign: (campaignId: string) => void;
  onDownload: (artifactId: string) => void;
  onDelete: (artifactId: string) => void;
  index?: number;
}

export function ArtifactCard({
  artifact, campaignName, onOpen, onOpenCampaign, onDownload, onDelete, index = 0,
}: ArtifactCardProps) {
  const { id, kind, count, createdAt, campaignId } = artifact;
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <Card
        onClick={() => onOpen(id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(id); } }}
        role="button"
        tabIndex={0}
        className={cn(
          "animate-in fade-in-0 slide-in-from-bottom-2 gap-2 px-5 py-4 [--tw-animation-duration:220ms] [--tw-ease:var(--ease-out)]",
          "cursor-pointer transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
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
            onClick={(e) => { e.stopPropagation(); onOpenCampaign(campaignId); }}
            className="rounded text-foreground/80 underline-offset-2 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {campaignName}
          </button>
        </p>

        <div className="mt-2 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="icon" aria-label="Скачать сигналы" onClick={() => onDownload(id)}>
            <Download className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" aria-label="Действия с артефактом"><MoreHorizontal className="h-4 w-4" /></Button>}
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить артефакт?</DialogTitle>
            <DialogDescription>
              Артефакт «{ARTIFACT_KIND_LABEL[kind]} · {formatNumber(count)}» будет удалён из списка.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Отмена</Button>
            <Button
              variant="outline"
              className="text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => { setConfirmDelete(false); onDelete(id); }}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
