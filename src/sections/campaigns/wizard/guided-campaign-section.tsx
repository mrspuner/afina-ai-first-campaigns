"use client";

import { useCallback, useState } from "react";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { SCENARIO_NAMES, getScenario } from "@/data/scenarios";
import { SurveySection } from "@/sections/survey/survey-section";
import { CampaignWorkspace, type LaunchRequest } from "@/sections/campaigns/wizard/campaign-workspace";
import { shouldShowSurveyGate } from "@/state/survey-gate";
import type { StepData } from "@/types/campaign";
import {
  createTemplate,
  mergeChannelNodes,
  applyCampaignContext,
} from "@/state/workflow-templates";
import { computeNeedsAttention } from "@/state/workflow-validation";
import { computeSublabels } from "@/state/node-sublabel";
import {
  getCachedGraph,
  setCachedGraph,
  invalidateCachedGraph,
  type CachedGraph,
} from "@/sections/campaigns/workflow-graph-cache";

/**
 * Thin host for the campaign-creation wizard: gates on the survey, then renders
 * the 4-step CampaignWorkspace. On launch it creates a Campaign root (no
 * top-level Signal) and routes to the workflow editor; payment/launch happen
 * downstream in the campaign card → campaign-payment-screen.
 *
 * Also hosts точечную правку шага (клик по пилюле в описании карточки):
 * `view.editing` называет кампанию + шаг, снапшот гидрирует визард через
 * `initialStepDataOverride`. Кампания в этом режиме уже существует и уже
 * прошла анкету при создании — гейт анкеты за неё повторно не проходится.
 */
export function GuidedCampaignSection() {
  const { view, campaigns, surveyStatus, wizardSessionId, wizardSeed } = useAppState();
  const dispatch = useAppDispatch();
  const initial = view.kind === "guided-campaign" ? view.initialScenario : undefined;
  const editing = view.kind === "guided-campaign" ? view.editing : undefined;
  const editingCampaign = editing
    ? campaigns.find((c) => c.id === editing.campaignId)
    : undefined;
  const [gatePassed, setGatePassed] = useState(surveyStatus === "completed");

  const handleLaunch = useCallback(
    (req: LaunchRequest) => {
      const scenarioName =
        SCENARIO_NAMES[req.scenarioId] ?? initial?.name ?? "Кампания";
      dispatch({
        type: "campaign_created_from_wizard",
        stepData: req.stepData,
        scenarioName,
      });
    },
    [dispatch, initial?.name],
  );

  // Коммит изолированной сессии правки (Task 12) — вызывается ОДИН раз, на
  // «Применить и вернуться». Граф живёт в отдельном, не-redux кэше
  // (workflow-graph-cache.ts), поэтому его пересборка при смене сценария/
  // каналов происходит здесь, ДО диспатча самого коммита — тот только
  // проецирует stepData на поля кампании (см. campaign_wizard_edit_applied
  // в app-state.ts).
  const handleEditCommit = useCallback(
    (stepData: StepData) => {
      if (!editing) return;
      const { campaignId } = editing;
      // Снапшот кампании ДО этого коммита — сравнение против него, а не
      // против `editingCampaign.scenario?.id`/`.channels`: `wizardData`
      // всегда актуален (пишется на каждом коммите, см. projectStepDataOntoCampaign),
      // тогда как поле `scenario` кампании обновляется НИЖЕ в этом же коммите,
      // так что сравнивать с ним было бы сравнением с самим собой.
      const before = editingCampaign?.wizardData;
      // `!!editingCampaign &&` — тот же guard, что был у channelsChanged до
      // Task 13: без найденной кампании сравнивать не с чем, обе ветки ниже
      // должны молчать, а не спотыкаться об `undefined`.
      const scenarioChanged =
        !!editingCampaign && stepData.scenario !== (before?.scenario ?? null);
      const channelsChanged =
        !!editingCampaign &&
        JSON.stringify(before?.channels ?? []) !== JSON.stringify(stepData.channels);
      const scenario = stepData.scenario ? getScenario(stepData.scenario) : undefined;

      // Финальное ревью, Item 1: раньше кэш переписывался ТОЛЬКО в двух
      // структурных ветках (сценарий/каналы), и даже там сценарийная ветка
      // писала голый `createTemplate(...)`, минуя ту же цепочку деривации,
      // что применяет `initialGraph` в workflow-view.tsx
      // (applyCampaignContext → computeNeedsAttention → computeSublabels).
      // Три следствия одного корня: смена сценария стирала базу/интересы/
      // триггеры со «Скоринга»/«Сигнала» (голый шаблон их не несёт); правка
      // ТОЛЬКО интересов/базы (без смены сценария/каналов) не писала кэш
      // вовсе — карточка и граф расходились сразу под текстом карточки; мерж
      // каналов добавлял ноды без пересчёта подзаголовков (у нового
      // сплиттера подзаголовка не было, пока graph-tab не откроют заново).
      //
      // Фикс: считаем БАЗОВЫЙ граф (голый шаблон при смене сценария, мерж при
      // смене каналов, иначе — текущий кэш как есть), затем ВСЕГДА прогоняем
      // его через ту же цепочку, что и `initialGraph`, с контекстом из ТОЛЬКО
      // ЧТО закоммиченного `stepData` (а не `editingCampaign`, который на
      // этой строке ещё дореформенный — проекция в `campaign.*` происходит
      // НИЖЕ, диспатчем). Так граф согласуется с карточкой на КАЖДОМ коммите,
      // а не только на структурных.
      let baseGraph: CachedGraph | undefined;

      if (scenarioChanged) {
        // Полная пересборка: диалог на шаге «Сценарий» (Task 13) уже
        // предупредил, что ручные и ИИ-правки структуры теряются — это ровно
        // то, что здесь происходит. Мержить НЕ нужно (и нельзя): свежий
        // шаблон уже строится под АКТУАЛЬНЫЙ набор каналов, так что даже если
        // каналы поменялись в той же сессии, мерж поверх свежего шаблона был
        // бы лишним и мог бы исказить только что собранную структуру.
        invalidateCachedGraph(campaignId);
        if (scenario) {
          const t = createTemplate(scenario.signalType, stepData.sourceType, stepData.channels);
          baseGraph = { nodes: t.nodes, edges: t.edges };
        }
      } else if (channelsChanged && scenario) {
        // Тот же порядок разрешения графа, что и use-campaign-graph-applier.ts's
        // resolveBaseGraph: durable-кэш побеждает, иначе — свежий шаблон по
        // ДОкоммитным каналам кампании (то, от чего мержим).
        const cached = getCachedGraph(campaignId);
        const priorGraph = cached
          ? { nodes: cached.nodes, edges: cached.edges }
          : (() => {
              const t = createTemplate(
                scenario.signalType,
                editingCampaign?.sourceType ?? "new",
                editingCampaign?.channels ?? [],
              );
              return { nodes: t.nodes, edges: t.edges };
            })();
        baseGraph = mergeChannelNodes(priorGraph, stepData.channels, {
          signalType: scenario.signalType,
          sourceType: stepData.sourceType,
        });
      } else {
        // Ничего структурного не поменялось (интересы/триггеры/база/бюджет) —
        // берём кэш как есть; если его ещё нет (правка раньше самого первого
        // открытия графа-таба), деривировать не от чего — первый рендер
        // WorkflowView сам построит `initialGraph` с уже актуальным
        // (закоммиченным этой же функцией) контекстом кампании.
        const cached = getCachedGraph(campaignId);
        baseGraph = cached ? { nodes: cached.nodes, edges: cached.edges } : undefined;
      }

      if (baseGraph) {
        // Тот же контекст, что `projectStepDataOntoCampaign` спроецирует на
        // кампанию НИЖЕ — то есть граф увидит РОВНО то, что увидит карточка.
        const withContext = applyCampaignContext(baseGraph, {
          files: stepData.files,
          interests: stepData.interests,
          triggers: stepData.triggers,
        });
        setCachedGraph(campaignId, {
          nodes: computeSublabels(computeNeedsAttention(withContext.nodes)),
          edges: withContext.edges,
        });
      }

      dispatch({
        type: "campaign_wizard_edit_applied",
        campaignId,
        stepData,
        scenarioName: scenario?.name,
      });
    },
    [dispatch, editing, editingCampaign],
  );

  const handleEditCancel = useCallback(() => {
    if (!editing) return;
    dispatch({ type: "campaign_opened", id: editing.campaignId });
  }, [dispatch, editing]);

  // Правка уже созданной кампании — не новый вход в воронку, так что анкету
  // повторно не спрашиваем (тот же смысл, что и `isResuming` для resume).
  const showSurvey =
    !gatePassed &&
    shouldShowSurveyGate({ surveyStatus, isResuming: Boolean(editing) });
  if (showSurvey) return <SurveySection onComplete={() => setGatePassed(true)} />;

  return (
    <CampaignWorkspace
      key={`session-${wizardSessionId}`}
      onLaunchRequested={handleLaunch}
      initialScenario={initial}
      initialStep={wizardSeed?.step}
      initialStepDataOverride={editingCampaign?.wizardData ?? wizardSeed?.stepData}
      editing={editing}
      onCommit={handleEditCommit}
      onCancel={handleEditCancel}
    />
  );
}
