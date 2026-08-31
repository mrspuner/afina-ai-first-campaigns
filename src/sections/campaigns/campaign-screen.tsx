"use client";

import { useEffect } from "react";
import Image from "next/image";
import { nanoid } from "nanoid";
import { BarChart3, Copy, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePromptChips } from "@/state/prompt-chips-context";
import {
  EntityCardShell,
  CardTag,
  CardSection,
  type EntityCardAction,
} from "@/components/ui/entity-card";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { WorkflowMiniPreview } from "./workflow-mini-preview";
import { WorkflowDescription } from "./workflow-description";
import {
  describeWorkflow,
  type CampaignFacts,
  type DescriptionTag,
} from "@/state/graph-description";
import { resolveDomainStatus } from "@/lib/domain-add";
import { copyCachedGraph } from "./workflow-graph-cache";
import {
  CampaignProgress,
  campaignStageList,
  communicatingThresholdMs,
} from "./campaign-progress";
import { canLaunchWithGraph } from "./campaign-launch-gate";
import { getCachedGraph, useCachedGraphVersion } from "./workflow-graph-cache";
import { useCampaignGraphApplier } from "./use-campaign-graph-applier";
import { createTemplate } from "@/state/workflow-templates";
import { CampaignStatsBlock } from "./campaign-stats-block";
import { CampaignArtifactsBlock } from "./campaign-artifacts-block";
import { StatusBadge } from "./status-badge";
import { campaignCadenceLabel } from "./campaign-cadence";
import { getScenario } from "@/data/scenarios";
// «Запуск» block (A2.3) reuses the SAME cost modules the payment screen uses,
// imported from the exact same paths as campaign-payment-screen.tsx, so the
// payments figure shown here is guaranteed to equal the payment screen's.
import { estimateTouches, computeCampaignCost } from "./campaign-cost";
import { splitCampaignPayments } from "./campaign-payments";
import { BudgetBreakdown } from "./budget-breakdown";
import { groupCommunicationLines } from "./communication-breakdown";
import { campaignBaseRows } from "./campaign-metrics";
import { formatRubPlain } from "@/lib/format-rub";
import { scoringLineDisplay, FALLBACK_BASE } from "./campaign-payment-screen";
import { stepsForIntent } from "./wizard/wizard-steps";
import type { AnalysisMode } from "@/types/campaign";
import type { NodeParams, WorkflowNodeType } from "@/types/workflow";

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU");
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function CampaignScreen() {
  const { view, campaigns, artifacts, templates, accountSettings } = useAppState();
  const dispatch = useAppDispatch();
  const { pushChip } = usePromptChips();

  const campaign =
    view.kind === "campaign"
      ? campaigns.find((c) => c.id === view.campaign.id)
      : undefined;

  const campaignId = campaign?.id;

  // Headless applier: consumes the workflow mailbox slot (structural ops /
  // rebuild) submitted from the CARD — where the graph view is unmounted and
  // would otherwise never apply the edit (chat bubble spinning forever). Mounted
  // unconditionally (hooks rules) and self-guards to `view.kind === "campaign"`.
  useCampaignGraphApplier(campaignId);
  // Re-render when the applier writes the cache, so `launchGraph` /
  // `describeWorkflow` below re-read the freshly edited graph. Threaded into the
  // mini-preview so its memoized graph rebuilds too.
  const graphVersion = useCachedGraphVersion();

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

  const signalType = campaign?.scenario
    ? getScenario(campaign.scenario.id)?.signalType
    : undefined;
  // Гейт «Запустить»: базовый статус-гейт И валидность workflow-графа
  // (незаполненный шаблон = needs-attention блокирует запуск). Граф берём из
  // durable-кэша (учитывает ручные правки) либо строим из шаблона по сценарию
  // — тот же приём, что в campaign-payment-screen.
  const launchGraph = campaign
    ? (getCachedGraph(campaign.id) ??
      (signalType
        ? createTemplate(signalType, campaign.sourceType, campaign.channels ?? [])
        : null))
    : null;
  // Описание собирается из ТОГО ЖЕ launchGraph, что и мини-превью, поэтому
  // текст и миниатюра не могут разойтись (в т.ч. после ручных правок графа).
  // Все домены триггеров кампании со статусами — и для фразы о модерации, и
  // для поповера тега: одобренные и отклонённые сегодня не видны нигде, хотя
  // именно они решают итоговый состав аудитории.
  const campaignDomains = campaign
    ? [
        ...new Set(
          Object.values(campaign.triggerConfig ?? {}).flatMap((delta) => delta.added),
        ),
      ].map((domain) => ({
        domain,
        status: resolveDomainStatus(domain, accountSettings.ownDomains),
      }))
    : [];

  // Режим анализа выводится ИЗ sourceType, а не из снапшота: снапшот удаляется
  // при запуске, а тег обязан продолжать нести значение (§2.3 спеки).
  const analysisMode: AnalysisMode | undefined =
    campaign?.sourceType === "stream"
      ? "stream"
      : campaign?.sourceType === "new"
        ? "once"
        : undefined;

  // Пустой список = правка недоступна: запущенная кампания или потерянный
  // снапшот. Тогда шаговые теги рендерятся носителями значений без клика.
  const editableSteps =
    campaign?.status === "draft" && campaign.wizardData
      ? stepsForIntent(campaign.wizardData.intent)
      : [];

  // Отдельный от editableSteps сигнал: «можно ли править граф» требует только
  // статуса draft — снапшот визарда тут ни при чём. Сидовые черновики без
  // wizardData тоже правятся (так разрешал снятый нодо-блок через
  // readOnly={status !== "draft"}), поэтому гейтить шаблон/паузу на
  // editableSteps было бы неверно — увело бы их в read-only для сидовых
  // черновиков наравне с запущенными кампаниями.
  const graphEditable = campaign?.status === "draft";

  const facts: CampaignFacts = {
    pending: campaignDomains.filter((d) => d.status === "pending").map((d) => d.domain),
    domains: campaignDomains,
    baseRows: campaign ? campaignBaseRows(campaign) : undefined,
    triggers: campaign?.triggers,
    channels: campaign?.channels,
    budget: campaign?.budget,
    analysisMode,
    scenarioName: campaign?.scenario?.name,
    editableSteps,
    graphEditable,
  };

  const descriptionStages = launchGraph
    ? describeWorkflow(launchGraph, templates, facts)
    : [];

  // nodeId → nodeType — раскрашивает пилюли тегов template/node-fields под цвет
  // узла графа (тот же NODE_STYLES/NODE_ICON, что раньше несли снятые нодо-
  // блоки). Тег сам по себе типа ноды не хранит (Task 5) — лукап строится
  // здесь, где launchGraph уже под рукой, и передаётся вниз в WorkflowDescription.
  const nodeTypes = new Map<string, WorkflowNodeType>(
    (launchGraph?.nodes ?? []).map((n) => [n.id, n.data.nodeType]),
  );
  // nodeId → params — содержимое поповера паузы (Task 8): пилюля `node-fields`
  // получает WaitParams этим же лукапом, а не читает кэш графа сама (см.
  // description-tag.tsx). Ноды без params (не comm/wait-ноды) не попадают в
  // карту — .filter отсеивает их, а не молча кладёт undefined в значение.
  const nodeParams = new Map<string, NodeParams>(
    (launchGraph?.nodes ?? [])
      .filter((n) => n.data.params !== undefined)
      .map((n) => [n.id, n.data.params as NodeParams]),
  );

  if (view.kind !== "campaign") return null;
  if (!campaign) return null;

  const status = campaign.status;
  const isActive = status === "active";
  const isCompleted = status === "completed";
  const hasStats = isActive || isCompleted;
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

  // Клик по пилюле в описании: только цель wizard-step уводит с карточки — в
  // изолированный режим правки одного шага (Task 11). Поповерные цели
  // (шаблон/поля ноды/домены) обрабатываются внутри самой пилюли (Task 7–8),
  // сюда доходят только wizard-step клики; «носители значений» (target:
  // "none" — запущенная кампания или шаг вне визарда её intent) клика вообще
  // не поднимают — resolveVisual/DescriptionTagPill не делает их кнопкой.
  function handleTagActivate(tag: DescriptionTag) {
    if (tag.target.kind !== "wizard-step" || !campaignId) return;
    dispatch({
      type: "campaign_step_edit_requested",
      campaignId,
      step: tag.target.step,
    });
  }

  // ИИ-иконка у «Сценарий кампании» (spec §2): кладёт тег «Логика кампании» в
  // промпт-бар и запускает правку СТРУКТУРЫ графа через тот же ИИ-движок, что в
  // графе. Фокус на бар следует автоматически — ChipEditableInput фокусируется
  // при вставке нового чипа, а свёрнутый бар смонтирован на экране карточки.
  // Только до запуска (draft) — правки логики допустимы лишь до старта.
  function editLogic() {
    if (!campaignId) return;
    pushChip({
      id: `campaign-logic_${campaignId}`,
      kind: "campaign-logic",
      label: "Логика кампании",
      payload: { campaignId },
      removable: true,
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

  // Блок «Запуск» (A2.3, только draft): прогноз касаний → платежи → «К
  // оплате». Считаем ТЕМИ ЖЕ модулями и по ТЕМ ЖЕ входам (launchGraph,
  // audienceSize), что и экран оплаты (campaign-payment-screen.tsx) —
  // поэтому число здесь и там совпадает; при смене базы/шаблонов launchGraph
  // меняется на ре-рендере, и число пересчитывается вместе с ним.
  const audienceSize =
    campaignBaseRows(campaign) ?? campaignArtifact?.count ?? FALLBACK_BASE;
  const draftCost =
    status === "draft" && launchGraph
      ? computeCampaignCost(launchGraph.nodes, launchGraph.edges, audienceSize)
      : null;
  const draftPaymentSplit =
    status === "draft"
      ? (() => {
          const flat = splitCampaignPayments({
            sourceType: campaign.sourceType ?? "new",
            channels: campaign.channels ?? [],
            baseSize: audienceSize,
          });
          const communication = draftCost ? draftCost.total : flat.communication;
          return { ...flat, communication, total: flat.scoring + communication };
        })()
      : null;
  const draftRecommended = draftPaymentSplit?.total ?? 0;
  const draftTouches = estimateTouches(draftRecommended, audienceSize);
  const draftCommGroups = draftCost ? groupCommunicationLines(draftCost.lines) : null;

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
      {/* Сценарий кампании — описание и мини-граф про одно и то же, поэтому
          живут в одном блоке: текст (значения параметров — кликабельные
          пилюли, Task 4–6) → кликабельная миниатюра, открывающая полный граф
          (правка логики — там, инлайн-«Изменить» на карточке снят). */}
      <CardSection
        label="Сценарий кампании"
        action={
          status === "draft" ? (
            <button
              type="button"
              aria-label="Изменить логику кампании с ИИ"
              title="Изменить логику кампании с ИИ"
              onClick={editLogic}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-muted transition-colors hover:bg-brand/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Image src="/mascot-icon.svg" width={14} height={14} alt="" aria-hidden />
            </button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-5">
          <WorkflowDescription
            stages={descriptionStages}
            nodeTypes={nodeTypes}
            nodeParams={nodeParams}
            domains={facts.domains}
            onTagActivate={handleTagActivate}
          />
          <div className="flex flex-col gap-3 border-t border-border pt-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Граф кампании
            </p>
            {/* Мини-граф кликабелен, но об этом ниоткуда не узнать (коммент
                от 31.08). Показываем только пока граф правится — после
                запуска подсказка обещала бы недоступное действие. */}
            {graphEditable && (
              <p className="text-xs text-muted-foreground">
                Кликните на граф, чтобы точечно поправить кампанию
              </p>
            )}
            <WorkflowMiniPreview
              campaignId={campaign.id}
              signalType={signalType}
              sourceType={campaign.sourceType}
              channels={campaign.channels}
              graphVersion={graphVersion}
              onClick={openWorkflow}
            />
          </div>
        </div>
      </CardSection>

      {/* Прогресс кампании — единый канонический прогресс: раскрываемый степпер
          этапов (по типу источника и наличию коммуникации), с провайдерами под
          текущим этапом обработки. Показывается, когда кампания в работе. */}
      {started && (
        <CardSection>
          <CampaignProgress campaign={campaign} defaultExpanded />
        </CardSection>
      )}

      {/* Завершённая → статус; пауза → «Возобновить» (без оплаты); черновик →
          прогноз касаний → платежи → «К оплате» (A2.3). */}
      {isCompleted ? (
        <CardSection label="Статус">
          <p className="text-sm text-muted-foreground">
            Кампания завершена. Дублируйте её, чтобы запустить новый прогон или
            A-B-тест.
          </p>
        </CardSection>
      ) : showLaunch ? (
        <CardSection label="Запуск">
          {status === "paused" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Кампания остановлена. Возобновите её, чтобы снова подключить
                провайдеров.
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
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Запустите кампанию — провайдеры начнут подключаться после
                оплаты.
              </p>
              {/* Прогноз касаний — та же оценка (estimateTouches), что и на
                  экране оплаты, на рекомендуемой сумме. */}
              <p className="text-sm text-muted-foreground">
                Прогноз касаний:{" "}
                <span className="font-medium text-foreground">
                  {draftTouches > 0 ? formatNumber(draftTouches) : "—"}
                </span>
              </p>
              {/* Платежи — BudgetBreakdown на splitCampaignPayments +
                  computeCampaignCost, рекомендуемая сумма. То же число, что на
                  экране оплаты (общие модули, см. campaign-cost-parity.test.ts). */}
              {draftPaymentSplit && draftPaymentSplit.total > 0 && (
                <div className="rounded-lg border border-border bg-card px-4 py-3.5">
                  <BudgetBreakdown
                    signalsDisplay={scoringLineDisplay({
                      sourceType: campaign.sourceType ?? "new",
                      scoring: draftPaymentSplit.scoring,
                    })}
                    communicationDisplay={formatRubPlain(
                      draftPaymentSplit.communication,
                    )}
                    totalDisplay={formatRubPlain(draftPaymentSplit.total)}
                    commGroups={draftCommGroups}
                    formatCell={formatRubPlain}
                  />
                </div>
              )}
              <Button
                onClick={launch}
                disabled={!canLaunch}
                className="gap-2 self-start"
              >
                <Play className="h-4 w-4" />
                К оплате
              </Button>
            </div>
          )}
        </CardSection>
      ) : null}

      {/* Статистика — сводка в карточке (дополняет переход в полный отчёт) */}
      {hasStats && (
        <CardSection label="Статистика">
          <CampaignStatsBlock
            campaign={campaign}
            artifact={campaignArtifact}
            populated={campaign.phase === "communicating" || isCompleted}
          />
        </CardSection>
      )}

      {/* Артефакты — что произвела кампания (Сигналы / Сигналы и конверсии) */}
      {campaignArtifacts.length > 0 && (
        <CardSection label="Артефакты">
          <CampaignArtifactsBlock
            artifacts={campaignArtifacts}
            onOpen={(id) => dispatch({ type: "artifact_opened", id, origin: "campaign" })}
          />
        </CardSection>
      )}
    </EntityCardShell>
  );
}
