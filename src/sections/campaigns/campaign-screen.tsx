"use client";

import { useEffect } from "react";
import { nanoid } from "nanoid";
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
import { copyCachedGraph } from "./workflow-graph-cache";
import {
  CampaignProgress,
  campaignStageList,
  communicatingThresholdMs,
} from "./campaign-progress";
import { canLaunchWithGraph } from "./campaign-launch-gate";
import { getCachedGraph } from "./workflow-graph-cache";
import { createTemplate } from "@/state/workflow-templates";
import { CampaignStatsBlock } from "./campaign-stats-block";
import { CampaignArtifactsBlock } from "./campaign-artifacts-block";
import { StatusBadge } from "./status-badge";
import { campaignCadenceLabel } from "./campaign-cadence";
import { getScenario } from "@/data/scenarios";

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

  const campaignId = campaign?.id;
  // Пост-лонч: на пороге коммуникации (после «Обработки базы») переводим фазу и
  // создаём артефакт. Старые кампании (elapsed > порога) — сразу без таймера.
  const launchedAtMs =
    campaign?.launchedAt ? Date.parse(campaign.launchedAt) : null;
  const needsAdvance =
    !!campaign && campaign.status === "active" && campaign.phase === "scoring";
  useEffect(() => {
    if (!campaignId || !needsAdvance || launchedAtMs === null) return;
    const stages = campaignStageList(campaign!);
    const remaining =
      communicatingThresholdMs(stages) - (Date.now() - launchedAtMs);
    const t = setTimeout(
      () => dispatch({ type: "campaign_phase_advanced", id: campaignId }),
      Math.max(0, remaining),
    );
    return () => clearTimeout(t);
  }, [campaignId, needsAdvance, launchedAtMs, campaign, dispatch]);

  if (view.kind !== "campaign") return null;
  if (!campaign) return null;
  const signalType = campaign.scenario
    ? getScenario(campaign.scenario.id)?.signalType
    : undefined;

  const status = campaign.status;
  const isActive = status === "active";
  const isCompleted = status === "completed";
  const hasStats = isActive || isCompleted;
  // Гейт «Запустить»: базовый статус-гейт И валидность workflow-графа
  // (незаполненный шаблон = needs-attention блокирует запуск). Граф берём из
  // durable-кэша (учитывает ручные правки) либо строим из шаблона по сценарию
  // — тот же приём, что в campaign-payment-screen.
  const launchGraph =
    getCachedGraph(campaign.id) ??
    (signalType
      ? createTemplate(signalType, campaign.sourceType, campaign.channels ?? [])
      : null);
  const canLaunch = canLaunchWithGraph(campaign, launchGraph);
  // The «Прогресс кампании» stepper is the canonical progress view — shown once
  // the campaign has entered its run (active, paused, or completed). A
  // not-yet-started draft shows the «Запуск» CTA.
  const started = isActive || status === "paused" || isCompleted;
  // «Запуск»/«Возобновить» CTA — a draft ready to launch, or a paused run.
  const showLaunch = status === "draft" || status === "paused";

  // Artifacts produced by this campaign (newest first).
  const campaignArtifacts = artifacts
    .filter((a) => a.campaignId === campaign.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const campaignArtifact = campaignArtifacts[0];

  const scenarioName = campaign.scenario?.name ?? "—";
  const cadenceLabel = campaignCadenceLabel(campaign.sourceType);

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
    onClick: () => {
      // Pre-generate the copy's id so we can carry the original's exact,
      // edited graph from the module cache (#10 — «один в один»), not just a
      // scenario-template rebuild. The reducer honours the passed newId.
      const newId = `cmp_${nanoid(6)}`;
      copyCachedGraph(campaign.id, newId);
      dispatch({ type: "campaign_duplicated", id: campaign.id, newId });
    },
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
          {cadenceLabel && <CardTag>{cadenceLabel}</CardTag>}
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

      {/* Прогресс кампании — единый канонический прогресс: раскрываемый степпер
          этапов (по типу источника и наличию коммуникации), с провайдерами под
          текущим этапом обработки. Показывается, когда кампания в работе. */}
      {started && (
        <CardSection>
          <CampaignProgress campaign={campaign} defaultExpanded />
        </CardSection>
      )}

      {/* Завершённая → статус; готовый черновик/пауза → CTA «Запустить». */}
      {isCompleted ? (
        <CardSection label="Статус">
          <p className="text-sm text-muted-foreground">
            Кампания завершена. Дублируйте её, чтобы запустить новый прогон или
            A-B-тест.
          </p>
        </CardSection>
      ) : showLaunch ? (
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
      ) : null}

      {/* Статистика — сводка в карточке (дополняет переход в полный отчёт) */}
      {hasStats && (
        <CardSection label="Статистика">
          <CampaignStatsBlock campaign={campaign} artifact={campaignArtifact} />
        </CardSection>
      )}

      {/* Артефакты — что произвела кампания (Сигналы / Сигналы и конверсии) */}
      {campaignArtifacts.length > 0 && (
        <CardSection label="Артефакты">
          <CampaignArtifactsBlock
            artifacts={campaignArtifacts}
            onOpen={(id) => dispatch({ type: "artifact_opened", id })}
          />
        </CardSection>
      )}
    </EntityCardShell>
  );
}
