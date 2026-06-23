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
import { CampaignSignalProgress } from "./campaign-signal-progress";
import { canLaunchCampaign, isCollecting } from "./campaign-launch-gate";
import { CampaignStatsBlock } from "./campaign-stats-block";
import { CampaignArtifactsBlock } from "./campaign-artifacts-block";
import { StatusBadge } from "./status-badge";
import { getScenario } from "@/data/scenarios";

/** Prototype collection window (ms) before a `new` draft auto-advances
 *  from `scoring` to `communicating` (pre-launch signal collection). */
const SCORING_WINDOW_MS = 8000;

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU");
}

export function CampaignScreen() {
  const { view, campaigns, artifacts } = useAppState();
  const dispatch = useAppDispatch();

  const campaign =
    view.kind === "campaign"
      ? campaigns.find((c) => c.id === view.campaign.id)
      : undefined;

  // Pre-launch signal collection: a `new` DRAFT collects signals on the card
  // (phase "scoring") before «Запустить» unlocks. After the (simulated) window,
  // advance scoring → communicating, which also generates the collected-signals
  // artifact. stream/own carry no pre-launch phase, so they never collect here.
  const campaignId = campaign?.id;
  const collecting = campaign ? isCollecting(campaign) : false;
  useEffect(() => {
    if (!campaignId) return;
    if (!collecting) return;
    const t = setTimeout(() => {
      dispatch({ type: "campaign_phase_advanced", id: campaignId });
    }, SCORING_WINDOW_MS);
    return () => clearTimeout(t);
  }, [campaignId, collecting, dispatch]);

  if (view.kind !== "campaign") return null;
  if (!campaign) return null;
  const signalType = campaign.scenario
    ? getScenario(campaign.scenario.id)?.signalType
    : undefined;

  const status = campaign.status;
  const isActive = status === "active";
  const isCompleted = status === "completed";
  const hasStats = isActive || isCompleted;
  // Data providers connect & generate signals during the scoring/collection
  // era. Once the campaign moves to `communicating` that block is stale, so
  // hide it (it only belongs to the signal-search stage).
  const showProviders = isActive && campaign.phase !== "communicating";
  // Pre-launch collection: a `new` draft is still gathering signals. While
  // collecting, the card shows progress and «Запустить» stays locked.
  const collectingNow = isCollecting(campaign);
  const canLaunch = canLaunchCampaign(campaign);

  // Artifacts produced by this campaign (newest first).
  const campaignArtifacts = artifacts
    .filter((a) => a.campaignId === campaign.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const campaignArtifact = campaignArtifacts[0];

  const scenarioName = campaign.scenario?.name ?? "—";

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
        </>
      }
      meta={metaDate}
      secondaryActions={secondaryActions}
    >
      {/* Workflow */}
      <CardSection label="Workflow">
        <WorkflowMiniPreview
          campaignId={campaign.id}
          signalType={signalType}
          sourceType={campaign.sourceType}
          channels={campaign.channels}
          onClick={openWorkflow}
        />
      </CardSection>

      {/* Сбор сигналов (new-черновик, фаза scoring) → прогресс; активная в
          стадии сбора/скоринга → провайдеры (скрываются после перехода в
          `communicating`); завершённая → статус; иначе (готовый черновик/
          пауза) → CTA «Запустить». */}
      {collectingNow ? (
        <CardSection label="Сбор сигналов">
          <CampaignSignalProgress campaign={campaign} />
        </CardSection>
      ) : showProviders ? (
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
      ) : isActive ? null : (
        <CardSection label="Запуск">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {status === "paused"
                ? "Кампания остановлена. Возобновите её, чтобы снова подключить провайдеров."
                : "Запустите кампанию — провайдеры начнут подключаться после оплаты."}
            </p>
            <Button
              onClick={launch}
              disabled={!canLaunch}
              className="gap-2 self-start"
            >
              <Play className="h-4 w-4" />
              Запустить
            </Button>
          </div>
        </CardSection>
      )}

      {/* Статистика — сводка в карточке (дополняет переход в полный отчёт) */}
      {hasStats && (
        <CardSection label="Статистика">
          <CampaignStatsBlock campaign={campaign} artifact={campaignArtifact} />
        </CardSection>
      )}

      {/* Артефакты — что произвела кампания (Сигналы / Сигналы и конверсии) */}
      {(campaignArtifacts.length > 0 || collectingNow) && (
        <CardSection label="Артефакты">
          <CampaignArtifactsBlock
            artifacts={campaignArtifacts}
            forming={collectingNow}
            onOpen={(id) => dispatch({ type: "artifact_opened", id })}
          />
        </CardSection>
      )}
    </EntityCardShell>
  );
}
