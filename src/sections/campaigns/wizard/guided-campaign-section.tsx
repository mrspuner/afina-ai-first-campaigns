"use client";

import { useCallback, useState } from "react";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { SCENARIO_NAMES, getScenario } from "@/data/scenarios";
import { SurveySection } from "@/sections/survey/survey-section";
import { CampaignWorkspace, type LaunchRequest } from "@/sections/campaigns/wizard/campaign-workspace";
import { shouldShowSurveyGate } from "@/state/survey-gate";
import type { StepData } from "@/types/campaign";
import { createTemplate, mergeChannelNodes } from "@/state/workflow-templates";
import { getCachedGraph, setCachedGraph } from "@/sections/campaigns/workflow-graph-cache";

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
  // (workflow-graph-cache.ts), поэтому его пересборка при смене каналов
  // происходит здесь, ДО диспатча самого коммита — тот только проецирует
  // stepData на поля кампании (см. campaign_wizard_edit_applied в app-state.ts).
  const handleEditCommit = useCallback(
    (stepData: StepData) => {
      if (!editing) return;
      const { campaignId } = editing;
      const channelsChanged =
        editingCampaign &&
        JSON.stringify(editingCampaign.channels ?? []) !==
          JSON.stringify(stepData.channels);
      if (channelsChanged) {
        const signalType = editingCampaign.scenario
          ? getScenario(editingCampaign.scenario.id)?.signalType
          : undefined;
        if (signalType) {
          // Тот же порядок разрешения графа, что и use-campaign-graph-applier.ts's
          // resolveBaseGraph: durable-кэш побеждает, иначе — свежий шаблон по
          // ДОкоммитным каналам кампании (то, от чего мержим).
          const cached = getCachedGraph(campaignId);
          const baseGraph = cached
            ? { nodes: cached.nodes, edges: cached.edges }
            : (() => {
                const t = createTemplate(
                  signalType,
                  editingCampaign.sourceType ?? "new",
                  editingCampaign.channels ?? [],
                );
                return { nodes: t.nodes, edges: t.edges };
              })();
          const merged = mergeChannelNodes(baseGraph, stepData.channels, {
            signalType,
            sourceType: stepData.sourceType,
          });
          setCachedGraph(campaignId, merged);
        }
      }
      // Перестройка графа при смене сценария — Task 13.
      dispatch({ type: "campaign_wizard_edit_applied", campaignId, stepData });
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
