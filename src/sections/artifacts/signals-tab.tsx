"use client";

import { useAppDispatch, useAppState } from "@/state/app-state-context";
import type { Artifact, Campaign } from "@/state/app-state";
import { downloadCsv } from "@/lib/download-csv";
import { ArtifactCard } from "./artifact-card";
import { ArtifactCollectionCard } from "./artifact-collection-card";
import { ArtifactsEmptyState } from "./artifacts-empty-state";
import { groupArtifacts } from "./artifact-grouping";
import { buildSignalsCsv } from "./signals-csv";

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

  const groups = groupArtifacts(artifacts);

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g, i) =>
        g.kind === "collection" ? (
          <ArtifactCollectionCard
            key={g.cumulative.id}
            campaignName={campaigns.find((c) => c.id === g.campaignId)?.name ?? "—"}
            cumulative={g.cumulative}
            dailyCount={g.dailyCount}
            onOpen={onOpen}
            onDownload={onDownload}
          />
        ) : (
          <ArtifactCard
            key={g.artifact.id}
            artifact={g.artifact}
            index={i}
            campaignName={campaigns.find((c) => c.id === g.campaignId)?.name ?? "—"}
            onOpen={onOpen}
            onOpenCampaign={onOpenCampaign}
            onDownload={onDownload}
            onDelete={onDelete}
          />
        ),
      )}
    </div>
  );
}

/** Connected Сигналы tab — lists campaign artifacts across all campaigns. */
export function SignalsTab() {
  const { artifacts, campaigns } = useAppState();
  const dispatch = useAppDispatch();

  function handleDownload(artifactId: string) {
    const artifact = artifacts.find((a) => a.id === artifactId);
    if (!artifact) return;
    downloadCsv(`afina-signals-${artifact.id}.csv`, buildSignalsCsv(artifact.id, artifact.count));
  }

  return (
    <SignalsTabView
      artifacts={artifacts}
      campaigns={campaigns}
      onOpen={(id) => dispatch({ type: "artifact_opened", id, origin: "artifacts" })}
      onOpenCampaign={(id) => dispatch({ type: "campaign_opened", id })}
      onDownload={handleDownload}
      onDelete={(id) => dispatch({ type: "artifact_deleted", id })}
    />
  );
}
