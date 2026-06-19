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
 */
export function GuidedCampaignSection() {
  const { view, surveyStatus, wizardSessionId } = useAppState();
  const dispatch = useAppDispatch();
  const initial = view.kind === "guided-campaign" ? view.initialScenario : undefined;
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

  const showSurvey =
    !gatePassed && shouldShowSurveyGate({ surveyStatus, isResuming: false });
  if (showSurvey) return <SurveySection onComplete={() => setGatePassed(true)} />;

  return (
    <CampaignWorkspace
      key={`session-${wizardSessionId}`}
      onLaunchRequested={handleLaunch}
      initialScenario={initial}
    />
  );
}
