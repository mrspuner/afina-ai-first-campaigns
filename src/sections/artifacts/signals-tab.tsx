"use client";

import { useMemo } from "react";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import type { Artifact, Campaign } from "@/state/app-state";
import { ArtifactCard } from "./artifact-card";
import { ArtifactsEmptyState } from "./artifacts-empty-state";

interface SignalsTabViewProps {
  artifacts: Artifact[];
  campaigns: Campaign[];
  onOpen: (artifactId: string) => void;
  onOpenCampaign: (campaignId: string) => void;
  onDownload: (artifactId: string) => void;
  onDelete: (artifactId: string) => void;
}

/** Presentational list — pure, no state access (testable in isolation). */
export function SignalsTabView({
  artifacts,
  campaigns,
  onOpen,
  onOpenCampaign,
  onDownload,
  onDelete,
}: SignalsTabViewProps) {
  if (artifacts.length === 0) {
    return <ArtifactsEmptyState />;
  }

  const sorted = [...artifacts].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((artifact, i) => (
        <ArtifactCard
          key={artifact.id}
          artifact={artifact}
          index={i}
          campaignName={
            campaigns.find((c) => c.id === artifact.campaignId)?.name ?? "—"
          }
          onOpen={onOpen}
          onOpenCampaign={onOpenCampaign}
          onDownload={onDownload}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

/** Connected Сигналы tab — lists campaign artifacts across all campaigns. */
export function SignalsTab() {
  const { artifacts, campaigns } = useAppState();
  const dispatch = useAppDispatch();

  const total = useMemo(
    () => artifacts.reduce((sum, a) => sum + a.count, 0),
    [artifacts],
  );

  function handleDownload(artifactId: string) {
    const artifact = artifacts.find((a) => a.id === artifactId);
    // Prototype: a real backend would emit a CSV here.
    console.log("download artifact", artifactId);
    window.alert(
      `Скачивание ${(artifact?.count ?? total).toLocaleString("ru-RU")} сигналов (CSV) — в прототипе симулировано.`,
    );
  }

  return (
    <SignalsTabView
      artifacts={artifacts}
      campaigns={campaigns}
      onOpen={(id) => dispatch({ type: "artifact_opened", id })}
      onOpenCampaign={(id) => dispatch({ type: "campaign_opened", id })}
      onDownload={handleDownload}
      onDelete={(id) => dispatch({ type: "artifact_deleted", id })}
    />
  );
}
