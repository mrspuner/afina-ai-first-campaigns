"use client";

import { useCallback, useState } from "react";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { SCENARIO_NAMES } from "@/data/scenarios";
import { SurveySection } from "@/sections/survey/survey-section";
import { CampaignWorkspace, type LaunchRequest } from "@/sections/campaigns/wizard/campaign-workspace";
import { shouldShowSurveyGate } from "@/state/survey-gate";

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
    />
  );
}
