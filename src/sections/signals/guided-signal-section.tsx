"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import type { Signal } from "@/state/app-state";
import type { SignalStatus } from "@/types/signal-status";
import type { StepData } from "@/types/campaign";
import { SCENARIO_TO_TYPE } from "@/state/scenario-map";
import { segmentsForSignal } from "@/state/metrics";
import { SCENARIO_NAMES } from "@/data/scenarios";
import { SurveySection } from "@/sections/survey/survey-section";
import { CampaignWorkspace } from "@/sections/campaigns/wizard/campaign-workspace";
import { TopUpModal, computeShortfall } from "./top-up-modal";
import { getProcessingDuration } from "@/state/dev-config";
import { shouldShowSurveyGate } from "@/state/survey-gate";

/**
 * Picks the wizard step to land on when resuming an existing signal — we
 * want the user dropped at the latest meaningful screen for that signal's
 * current state.
 */
function stepForSignalStatus(status: SignalStatus | undefined): number {
  switch (status) {
    case "ready":
    case "expired":
      return 8;
    case "processing":
    case "error":
      return 7;
    case "awaiting_payment":
    case "draft":
    default:
      return 6;
  }
}

/**
 * Lifts step-6 → step-8 control flow out of CampaignWorkspace into the
 * section so that the top-up modal, signal creation, and status transitions
 * can be coordinated against shared app state. Also gates wizard entry on
 * the registration anketa — first-time users go through the survey before
 * the wizard is rendered (smooth handoff, no return to start screen).
 */
export function GuidedSignalSection() {
  const { view, surveyStatus, balance, signals, resumingSignalId, wizardSessionId } =
    useAppState();
  const dispatch = useAppDispatch();
  const initial = view.kind === "guided-signal" ? view.initialScenario : undefined;

  // One-shot capture of the signal we're resuming. Reading the snapshot
  // straight from `signals` would let a status change (e.g. payment success)
  // re-render the section and confuse the wizard's mount-time-only inputs.
  // The snapshot is tagged with the wizard session it was taken in — when a
  // fresh `start_signal_flow` bumps the session, the stale snapshot is
  // ignored so the user lands on a clean step-1 instead of the previous
  // resume target.
  const [resumeSnapshot, setResumeSnapshot] = useState<{
    id: string;
    stepData: StepData;
    initialStep: number;
    sessionId: number;
  } | null>(() => {
    if (!resumingSignalId) return null;
    const sig = signals.find((s) => s.id === resumingSignalId);
    if (!sig || !sig.wizardData) return null;
    return {
      id: sig.id,
      stepData: sig.wizardData,
      initialStep: stepForSignalStatus(sig.status),
      sessionId: wizardSessionId,
    };
  });

  // Stale snapshots (from a prior resume) are dropped here so the wizard
  // mounts fresh after a new `start_signal_flow`.
  const activeResume =
    resumeSnapshot && resumeSnapshot.sessionId === wizardSessionId
      ? resumeSnapshot
      : null;

  // Acknowledge the resume request once we have a snapshot in hand (or have
  // determined there's nothing to resume) so the reducer flag doesn't stick.
  useEffect(() => {
    if (!resumingSignalId) return;
    dispatch({ type: "resume_signal_in_wizard_handled" });
  }, [resumingSignalId, dispatch]);

  // If `resumingSignalId` arrives AFTER mount (rare — section already
  // mounted via another route, then user clicked the menu item), capture
  // the snapshot.
  useEffect(() => {
    if (!resumingSignalId) return;
    if (
      resumeSnapshot &&
      resumeSnapshot.id === resumingSignalId &&
      resumeSnapshot.sessionId === wizardSessionId
    ) {
      return;
    }
    const sig = signals.find((s) => s.id === resumingSignalId);
    if (!sig || !sig.wizardData) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResumeSnapshot({
      id: sig.id,
      stepData: sig.wizardData,
      initialStep: stepForSignalStatus(sig.status),
      sessionId: wizardSessionId,
    });
  }, [resumingSignalId, resumeSnapshot, signals, wizardSessionId]);

  // Survey gate. Held locally so finishing the anketa lets us re-render this
  // same view as the wizard without bouncing through the start screen.
  const [gatePassed, setGatePassed] = useState(surveyStatus === "completed");

  // Pending launch context — we keep the cost/scenario around while the
  // top-up modal is open so a successful payment can flip status → processing
  // automatically without an extra click.
  const [pendingSignalId, setPendingSignalId] = useState<string | null>(null);
  const [pendingCost, setPendingCost] = useState(0);
  const [pendingLabel, setPendingLabel] = useState<string>("");
  const [topUpOpen, setTopUpOpen] = useState(false);

  // Imperative bridge: lets the workspace request "advance to next step" from
  // outside (after modal closes successfully).
  const advanceRef = useRef<() => void>(() => {});

  const startProcessing = useCallback(
    (signalId: string) => {
      dispatch({ type: "signal_status_changed", id: signalId, status: "processing" });
      const duration = getProcessingDuration();
      // `Infinity` (dev override) means "leave the signal in processing
      // forever" — useful for inspecting the in-flight UI without racing the
      // simulated provider.
      if (!Number.isFinite(duration)) return;
      window.setTimeout(() => {
        dispatch({ type: "signal_status_changed", id: signalId, status: "ready" });
      }, duration);
    },
    [dispatch]
  );

  /** Called by step-6 when the user presses the launch button. */
  const handleLaunchSignal = useCallback(
    (params: {
      scenarioId: string;
      cost: number;
      count: number;
      stepData: StepData;
      proceed: () => void;
    }) => {
      const now = new Date().toISOString();
      // When resuming an awaiting-payment signal, drop the previous draft so
      // we don't end up with two cabinet entries for the same wizard run.
      if (activeResume) {
        dispatch({ type: "signal_deleted", id: activeResume.id });
      }
      const id = `sig_${nanoid(8)}`;
      const type = SCENARIO_TO_TYPE[params.scenarioId] ?? "Регистрация";
      // Display name follows the chosen scenario ("Брошенная корзина", …), not
      // the coarse signal type. Falls back to `type` when no scenario was set
      // (free-text flow) since `name` is then left undefined.
      const scenarioName = SCENARIO_NAMES[params.scenarioId];
      const enoughBalance = computeShortfall(balance, params.cost) <= 0;

      const signal: Signal = {
        id,
        type,
        name: scenarioName,
        count: params.count,
        // Сегменты выводятся из count (сумма = count), поэтому «сигналов
        // найдено» в step-8 совпадает с count в карточке и в разделе.
        segments: segmentsForSignal(id, params.count),
        createdAt: now,
        updatedAt: now,
        status: enoughBalance ? "processing" : "awaiting_payment",
        wizardData: params.stepData,
      };
      dispatch({ type: "signal_added", signal });
      // signal_added moves view → awaiting-campaign, but page.tsx routes that
      // back to GuidedSignalSection so the workspace's internal step state
      // persists. Track the id so step-7/step-8 can read live status.
      setPendingSignalId(id);
      setPendingCost(params.cost);
      setPendingLabel(`${scenarioName ?? type} · ${params.count.toLocaleString("ru-RU")}`);

      if (enoughBalance) {
        // Schedule processing → ready transition.
        startProcessing(id);
        params.proceed();
      } else {
        // Open top-up modal; remember context so payment success can resume.
        advanceRef.current = params.proceed;
        setTopUpOpen(true);
      }
    },
    [activeResume, balance, dispatch, startProcessing]
  );

  const handlePaymentSuccess = useCallback(
    (amount: number) => {
      dispatch({ type: "balance_topup", amount });
      if (pendingSignalId) {
        startProcessing(pendingSignalId);
      }
      setTopUpOpen(false);
      // Keep pendingSignalId so step-7/step-8 can read live status. Auto-
      // advance into the processing screen — no extra click required.
      advanceRef.current();
    },
    [dispatch, pendingSignalId, startProcessing]
  );

  const handleSignalComplete = useCallback(() => {
    dispatch({ type: "signal_complete" });
  }, [dispatch]);

  // Pull the pending signal (if any) so the workspace can read its status
  // for the processing step. When resuming an existing signal, the snapshot
  // doubles as the pending signal so step-7/step-8 can render its current
  // state without going through the launch flow first.
  const pendingSignal = pendingSignalId
    ? signals.find((s) => s.id === pendingSignalId) ?? null
    : activeResume
    ? signals.find((s) => s.id === activeResume.id) ?? null
    : null;

  // Once a freshly-launched signal finishes processing, hand off to the real
  // signal card instead of the wizard's step-8 result — the final state of a
  // found signal IS its card (same total, settings table, actions, back
  // button). Keyed on `pendingSignalId` so resumed signals are untouched.
  useEffect(() => {
    if (!pendingSignalId) return;
    const sig = signals.find((s) => s.id === pendingSignalId);
    if (sig && (sig.status ?? "ready") === "ready") {
      dispatch({ type: "signal_opened", id: pendingSignalId });
      setPendingSignalId(null);
    }
  }, [pendingSignalId, signals, dispatch]);

  // Survey gate must be after all hooks — React rule.
  const showSurvey =
    !gatePassed && shouldShowSurveyGate({ surveyStatus, isResuming: Boolean(activeResume) });
  if (showSurvey) {
    return (
      <SurveySection
        onComplete={() => setGatePassed(true)}
      />
    );
  }

  return (
    <>
      <CampaignWorkspace
        // Force a fresh wizard mount whenever a new signal session begins —
        // either via "Создать сигнал" (`wizardSessionId` bump) or "Открыть и
        // редактировать" (`resume-<id>` key). Without this, hopping out of the
        // wizard mid-flight and re-entering reuses the previous session's
        // `currentStep`/`maxStep`, which causes step-1 to skip downstream
        // steps because `currentStep < maxStep` jumps to the cached max.
        key={
          activeResume
            ? `resume-${activeResume.id}-${activeResume.sessionId}`
            : `session-${wizardSessionId}`
        }
        onSignalComplete={handleSignalComplete}
        onLaunchRequested={handleLaunchSignal}
        initialScenario={initial}
        initialStepDataOverride={activeResume?.stepData}
        initialStep={activeResume?.initialStep}
        pendingSignal={pendingSignal}
      />
      <TopUpModal
        open={topUpOpen}
        onOpenChange={(open) => {
          setTopUpOpen(open);
          // Closing without paying leaves the signal in "awaiting_payment".
          // Keep pendingSignalId so the wizard's step-7 reflects the live
          // status when the workspace advances; user can also find it in the
          // cabinet at any time.
        }}
        balance={balance}
        cost={pendingCost}
        entityLabel={pendingLabel}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </>
  );
}
