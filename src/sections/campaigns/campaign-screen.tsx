"use client";

import { useEffect } from "react";
import { BarChart3, Copy, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EntityCardShell,
  CardTag,
  CardSection,
  type EntityCardAction,
} from "@/components/ui/entity-card";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { WorkflowMiniPreview } from "./workflow-mini-preview";
import { ProviderList } from "./provider-list";
import { CampaignPathIndicator } from "./campaign-path-indicator";
import { CampaignSignalProgress } from "./campaign-signal-progress";
import { CampaignStatsBlock } from "./campaign-stats-block";
import { CampaignArtifactsBlock } from "./campaign-artifacts-block";
import { StatusBadge } from "./status-badge";
import { scenarioNameForSignal } from "@/state/scenario-display";

/** Prototype scoring window (ms) before a new/stream campaign auto-advances
 *  from `scoring` to `communicating`. */
const SCORING_WINDOW_MS = 8000;

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU");
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function CampaignScreen() {
  const { view, campaigns, signals, artifacts } = useAppState();
  const dispatch = useAppDispatch();

  const campaign =
    view.kind === "campaign"
      ? campaigns.find((c) => c.id === view.campaign.id)
      : undefined;

  // D3: advance a launched new/stream campaign from scoring → communicating
  // after the (simulated) scoring window. own campaigns have no scoring phase.
  // FD-4: dispatches `campaign_phase_advanced` (present in the contract).
  const campaignId = campaign?.id;
  const campaignStatus = campaign?.status;
  const campaignPhase = campaign?.phase;
  const campaignSource = campaign?.sourceType;
  useEffect(() => {
    if (!campaignId) return;
    if (campaignStatus !== "active") return;
    if (campaignSource === "own") return;
    if (campaignPhase !== "scoring") return;
    const t = setTimeout(() => {
      dispatch({ type: "campaign_phase_advanced", id: campaignId });
    }, SCORING_WINDOW_MS);
    return () => clearTimeout(t);
  }, [campaignId, campaignStatus, campaignPhase, campaignSource, dispatch]);

  if (view.kind !== "campaign") return null;
  if (!campaign) return null;
  const signal = signals.find((s) => s.id === campaign.signalId);
  const signalType = signal?.type;

  const status = campaign.status;
  const isActive = status === "active";
  const isCompleted = status === "completed";
  const hasStats = isActive || isCompleted;
  const sourceType = campaign.sourceType;
  // Scoring progress block shows while a new/stream campaign is still scoring.
  const isScoring =
    isActive &&
    sourceType !== "own" &&
    (campaign.phase ?? "scoring") === "scoring";

  // Artifacts produced by this campaign (newest first).
  const campaignArtifacts = artifacts
    .filter((a) => a.campaignId === campaign.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const campaignArtifact = campaignArtifacts[0];

  const scenarioName =
    campaign.scenario?.name ?? (signal ? scenarioNameForSignal(signal) : "—");

  const metaDate =
    status === "active"
      ? `Запущена ${formatDate(campaign.launchedAt)}`
      : status === "paused"
        ? `Остановлена ${formatDate(campaign.pausedAt)}`
        : status === "completed"
          ? `Завершена ${formatDate(campaign.completedAt)}`
          : `Создана ${formatDate(campaign.createdAt)}`;

  function openWorkflow() {
    dispatch({
      type: "open_workflow",
      campaign: { id: campaign!.id, name: campaign!.name },
      launched: isActive || status === "paused" || isCompleted,
    });
  }

  function launch() {
    if (status === "paused") {
      dispatch({
        type: "campaign_status_changed",
        id: campaign!.id,
        status: "active",
        timestamp: new Date().toISOString(),
      });
    } else {
      dispatch({ type: "open_campaign_payment", campaignId: campaign!.id });
    }
  }

  function stop() {
    dispatch({
      type: "campaign_status_changed",
      id: campaign!.id,
      status: "paused",
      timestamp: new Date().toISOString(),
    });
  }

  const duplicateAction: EntityCardAction = {
    label: "Дублировать",
    onClick: () => dispatch({ type: "campaign_duplicated", id: campaign.id }),
    icon: <Copy className="h-4 w-4" />,
  };

  // All controls live in one row: статистика (если есть) · дубль · остановить.
  const secondaryActions: EntityCardAction[] = [];
  if (hasStats) {
    secondaryActions.push({
      label: "Статистика",
      onClick: () => dispatch({ type: "goto_stats", campaignId: campaign.id }),
      icon: <BarChart3 className="h-4 w-4" />,
    });
  }
  secondaryActions.push(duplicateAction);
  if (isActive) {
    secondaryActions.push({
      label: "Остановить",
      onClick: stop,
      icon: <Square className="h-4 w-4" />,
    });
  }

  return (
    <EntityCardShell
      title={campaign.name}
      onRename={(name) =>
        dispatch({ type: "campaign_renamed", id: campaign.id, name })
      }
      onBack={() => dispatch({ type: "sidebar_nav", section: "Кампании" })}
      backLabel="К кампаниям"
      badge={<StatusBadge status={status} />}
      tags={
        <>
          <CardTag>Сценарий: {scenarioName}</CardTag>
          {signal && (
            <CardTag>
              Сигнал: {signal.type} · {formatNumber(signal.count)}
            </CardTag>
          )}
        </>
      }
      meta={metaDate}
      secondaryActions={secondaryActions}
    >
      {/* Путь кампании (read-only) — источник-зависимый линейный индикатор */}
      {sourceType && (isActive || isCompleted) && (
        <CardSection label="Путь кампании">
          <CampaignPathIndicator sourceType={sourceType} campaign={campaign} />
        </CardSection>
      )}

      {/* Workflow */}
      <CardSection label="Workflow">
        <WorkflowMiniPreview signalType={signalType} onClick={openWorkflow} />
      </CardSection>

      {/* Прогресс скоринга (new/stream, фаза scoring), иначе провайдеры */}
      {isScoring ? (
        <CardSection label="Прогресс">
          <CampaignSignalProgress campaign={campaign} />
        </CardSection>
      ) : isActive ? (
        <CardSection label="Провайдеры данных">
          <ProviderList />
        </CardSection>
      ) : isCompleted ? (
        <CardSection label="Статус">
          <p className="text-sm text-muted-foreground">
            Кампания завершена. Дублируйте её, чтобы запустить новый прогон или
            A-B-тест.
          </p>
        </CardSection>
      ) : (
        <CardSection label="Запуск">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {status === "paused"
                ? "Кампания остановлена. Возобновите её, чтобы снова подключить провайдеров."
                : "Запустите кампанию — провайдеры начнут подключаться после оплаты."}
            </p>
            <Button onClick={launch} className="gap-2 self-start">
              <Play className="h-4 w-4" />
              Запустить
            </Button>
          </div>
        </CardSection>
      )}

      {/* Статистика — сводка в карточке (дополняет переход в полный отчёт) */}
      {hasStats && !isScoring && (
        <CardSection label="Статистика">
          <CampaignStatsBlock campaign={campaign} artifact={campaignArtifact} />
        </CardSection>
      )}

      {/* Артефакты — что произвела кампания (Сигналы / Сигналы и конверсии) */}
      {(campaignArtifacts.length > 0 || isScoring) && (
        <CardSection label="Артефакты">
          <CampaignArtifactsBlock
            artifacts={campaignArtifacts}
            forming={isScoring}
            onOpen={(id) => dispatch({ type: "artifact_opened", id })}
          />
        </CardSection>
      )}
    </EntityCardShell>
  );
}
