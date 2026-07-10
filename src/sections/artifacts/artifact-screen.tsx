"use client";

import { CheckCircle2, Download, Trash2 } from "lucide-react";
import {
  EntityCardShell,
  CardSection,
} from "@/components/ui/entity-card";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import type { Artifact, Campaign } from "@/state/app-state";
import type { Channel } from "@/types/campaign";
import { downloadCsv } from "@/lib/download-csv";
import { ARTIFACT_KIND_LABEL } from "./artifact-labels";
import { buildSignalsCsv } from "./signals-csv";

const SOURCE_LABEL: Record<NonNullable<Campaign["sourceType"]>, string> = {
  new: "Новая база номеров", stream: "Поток", own: "Свои сигналы",
};
const CHANNEL_LABEL: Record<Channel, string> = {
  sms: "SMS", push: "Push", email: "Email", ivr: "IVR",
};

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
  campaign: Campaign | undefined;
  campaignName: string;
  dailies?: Artifact[];
  onBack: () => void;
  backLabel?: string;
  onOpenCampaign: (campaignId: string) => void;
  onDownload: () => void;
  onDownloadDaily?: (id: string) => void;
  onDelete: () => void;
}

/** Presentational artifact detail — pure, no state access. */
export function ArtifactScreenView({
  artifact,
  campaign,
  campaignName,
  dailies,
  onBack,
  backLabel = "К артефактам",
  onOpenCampaign,
  onDownload,
  onDownloadDaily,
  onDelete,
}: ArtifactScreenViewProps) {
  const kindLabel = ARTIFACT_KIND_LABEL[artifact.kind];
  const isCollection = artifact.variant === "cumulative";

  return (
    <EntityCardShell
      title={isCollection ? `Поток · ${campaignName}` : kindLabel}
      onBack={onBack}
      backLabel={backLabel}
      meta={
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
          Артефакт собран ·{" "}
          {new Date(artifact.createdAt).toLocaleString("ru-RU")}
        </span>
      }
      secondaryActions={[
        {
          label: isCollection ? "Скачать общий" : "Скачать",
          onClick: onDownload,
          icon: <Download className="h-4 w-4" />,
        },
        { label: "Удалить", onClick: onDelete, icon: <Trash2 className="h-4 w-4" /> },
      ]}
    >
      <CardSection label={isCollection ? "Всего сигналов за период" : "Всего сигналов"}>
        <p className="text-4xl font-bold tabular-nums text-brand">
          {formatNumber(artifact.count)}
        </p>
      </CardSection>

      {isCollection && dailies && (
        <CardSection label="Дневные выжимки">
          <div className="flex flex-col">
            {dailies.map((d) => (
              <div key={d.id} className="flex items-center gap-3 border-t border-border/40 py-2.5 text-sm first:border-t-0">
                <span className="flex-1 text-foreground">
                  Выжимка · {d.periodDate ? `${d.periodDate.slice(8, 10)}.${d.periodDate.slice(5, 7)}` : "—"}
                  <span className="ml-2 tabular-nums text-muted-foreground">{d.count.toLocaleString("ru-RU")}</span>
                </span>
                <Button variant="outline" size="icon" aria-label="Скачать выжимку" onClick={() => onDownloadDaily?.(d.id)}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardSection>
      )}

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

      {campaign && (
        <CardSection label="Настройки кампании-источника">
          <div className="divide-y divide-border">
            <SummaryRow label="Сценарий">{campaign.scenario?.name ?? "—"}</SummaryRow>
            <SummaryRow label="Источник">{SOURCE_LABEL[campaign.sourceType ?? "new"]}</SummaryRow>
            <SummaryRow label="Интересы">{campaign.interests?.length ? campaign.interests.join(", ") : "—"}</SummaryRow>
            <SummaryRow label="Каналы">{campaign.channels?.length ? campaign.channels.map((c) => CHANNEL_LABEL[c]).join(", ") : "—"}</SummaryRow>
            <SummaryRow label="Файл базы">{campaign.files?.length ? campaign.files.map((f) => f.name).join(", ") : "—"}</SummaryRow>
            <SummaryRow label="Бюджет">{campaign.budget ? `₽ ${campaign.budget.toLocaleString("ru-RU")}` : "—"}</SummaryRow>
          </div>
        </CardSection>
      )}
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

  const campaign = campaigns.find((c) => c.id === artifact.campaignId);

  const backToCampaign = view.origin === "campaign";

  const dailies =
    artifact.variant === "cumulative"
      ? artifacts
          .filter((a) => a.campaignId === artifact.campaignId && a.variant === "daily")
          .sort((a, b) => ((a.periodDate ?? "") < (b.periodDate ?? "") ? 1 : -1))
      : undefined;

  function handleDownload() {
    downloadCsv(`afina-signals-${artifact!.id}.csv`, buildSignalsCsv(artifact!.id, artifact!.count));
  }

  function handleDownloadDaily(id: string) {
    const d = artifacts.find((a) => a.id === id);
    if (d) downloadCsv(`afina-signals-${d.periodDate ?? d.id}.csv`, buildSignalsCsv(d.id, d.count));
  }

  return (
    <ArtifactScreenView
      artifact={artifact}
      campaign={campaign}
      campaignName={campaign?.name ?? "—"}
      dailies={dailies}
      backLabel={backToCampaign ? "К кампании" : "К артефактам"}
      onBack={() =>
        backToCampaign
          ? dispatch({ type: "campaign_opened", id: artifact.campaignId })
          : dispatch({ type: "sidebar_nav", section: "Артефакты" })
      }
      onOpenCampaign={(id) => dispatch({ type: "campaign_opened", id })}
      onDownload={handleDownload}
      onDownloadDaily={handleDownloadDaily}
      onDelete={() => dispatch({ type: "artifact_deleted", id: artifact.id })}
    />
  );
}
