"use client";

import { CheckCircle2, Download } from "lucide-react";
import {
  EntityCardShell,
  CardSection,
} from "@/components/ui/entity-card";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import type { Artifact } from "@/state/app-state";
import { ARTIFACT_KIND_LABEL } from "./artifact-labels";

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-start gap-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{children}</span>
    </div>
  );
}

interface ArtifactScreenViewProps {
  artifact: Artifact;
  campaignName: string;
  onBack: () => void;
  onOpenCampaign: (campaignId: string) => void;
  onDownload: () => void;
}

/** Presentational artifact detail — pure, no state access. */
export function ArtifactScreenView({
  artifact,
  campaignName,
  onBack,
  onOpenCampaign,
  onDownload,
}: ArtifactScreenViewProps) {
  const kindLabel = ARTIFACT_KIND_LABEL[artifact.kind];

  return (
    <EntityCardShell
      title={kindLabel}
      onBack={onBack}
      backLabel="К артефактам"
      meta={
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
          Артефакт собран ·{" "}
          {new Date(artifact.createdAt).toLocaleString("ru-RU")}
        </span>
      }
      secondaryActions={[
        {
          label: "Скачать",
          onClick: onDownload,
          icon: <Download className="h-4 w-4" />,
        },
      ]}
    >
      <CardSection label="Всего сигналов">
        <p className="text-4xl font-bold tabular-nums text-brand">
          {formatNumber(artifact.count)}
        </p>
      </CardSection>

      <CardSection label="Об артефакте">
        <div className="divide-y divide-border">
          <SummaryRow label="Тип файла">CSV</SummaryRow>
          <SummaryRow label="Кампания">
            <button
              type="button"
              onClick={() => onOpenCampaign(artifact.campaignId)}
              className="rounded underline-offset-2 outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {campaignName}
            </button>
          </SummaryRow>
          <SummaryRow label="Тип">{kindLabel}</SummaryRow>
          <SummaryRow label="Создан">
            {new Date(artifact.createdAt).toLocaleString("ru-RU")}
          </SummaryRow>
        </div>
      </CardSection>
    </EntityCardShell>
  );
}

/** Connected artifact detail — reached via `artifact_opened`. */
export function ArtifactScreen() {
  const { view, artifacts, campaigns } = useAppState();
  const dispatch = useAppDispatch();

  if (view.kind !== "artifact") return null;

  const artifact = artifacts.find((a) => a.id === view.artifactId);
  if (!artifact) return null;

  const campaignName =
    campaigns.find((c) => c.id === artifact.campaignId)?.name ?? "—";

  function handleDownload() {
    // Prototype: a real backend would emit a CSV here.
    console.log("download artifact", artifact!.id);
    window.alert(
      `Скачивание ${formatNumber(artifact!.count)} сигналов (CSV) — в прототипе симулировано.`,
    );
  }

  return (
    <ArtifactScreenView
      artifact={artifact}
      campaignName={campaignName}
      onBack={() => dispatch({ type: "sidebar_nav", section: "Артефакты" })}
      onOpenCampaign={(id) => dispatch({ type: "campaign_opened", id })}
      onDownload={handleDownload}
    />
  );
}
