"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { CampaignStepper } from "@/sections/campaigns/wizard/campaign-stepper";
import { useAppDispatch } from "@/state/app-state-context";
import { StepData, initialStepData } from "@/types/campaign";
import { Step1Scenario } from "@/sections/campaigns/wizard/steps/step-1-scenario";
import { StepSource } from "@/sections/campaigns/wizard/steps/step-source";
import { StepChannels } from "@/sections/campaigns/wizard/steps/step-channels";
import { StepBudget } from "@/sections/campaigns/wizard/steps/step-budget";
import type { Signal } from "@/state/app-state";
import { computeStepTransition } from "@/sections/campaigns/wizard/wizard-navigation";

/** Fallback audience base when no file row-count is known (mirrors estimator). */
const FALLBACK_BASE = 10_000;

export interface LaunchRequest {
  scenarioId: string;
  cost: number;
  count: number;
  /** Snapshot of the wizard's StepData at launch — used by `Открыть и
   *  редактировать` to re-hydrate the wizard later. */
  stepData: StepData;
  proceed: () => void;
}

function WorkspaceInner({
  onLaunchRequested,
  initialScenario,
  initialStepDataOverride,
  initialStep,
}: {
  // Kept for API compatibility with the section consumer; the 4-step campaign
  // flow no longer renders the wizard's own processing/result steps, so the
  // signal-completion + pending-signal props are unused here (open-campaign
  // progress lives in the campaign card — sub-track D).
  onSignalComplete?: () => void;
  onLaunchRequested?: (req: LaunchRequest) => void;
  initialScenario?: { id: string; name: string };
  /** Hydrate the wizard with a previously captured StepData snapshot —
   *  used by the "Открыть и редактировать" path on awaiting-payment signals. */
  initialStepDataOverride?: StepData;
  /** Override the starting step. Defaults to 2 when `initialScenario` is set. */
  initialStep?: number;
  pendingSignal?: Signal | null;
}) {
  const defaultStartStep = initialScenario ? 2 : 1;
  const startStep = initialStep ?? defaultStartStep;
  const [currentStep, setCurrentStep] = useState(startStep);
  const [maxStep, setMaxStep] = useState(startStep);
  const [animatingStep, setAnimatingStep] = useState<number | null>(startStep);
  const [stepData, setStepData] = useState<StepData>(
    initialStepDataOverride
      ? initialStepDataOverride
      : initialScenario
      ? { ...initialStepData, scenario: initialScenario.id }
      : initialStepData
  );
  const stepRefs = useRef<Record<number, HTMLDivElement | null>>({});
  // Seed the scroll target on initial mount so resume entries (`initialStep`
  // > 1) land directly on the latest available step instead of opening at
  // the top and forcing the user to scroll. The post-commit effect below
  // consumes the pending scroll on the very first render.
  const pendingScroll = useRef<{ step: number; behavior: ScrollBehavior } | null>(
    startStep > 1 ? { step: startStep, behavior: "instant" } : null
  );
  const dispatch = useAppDispatch();

  // Publish the visible step into shared state so the prompt-bar can render
  // step-specific helpers (budget-help chip on step 5). Cleared on unmount
  // so navigating away kills the chip immediately.
  useEffect(() => {
    dispatch({ type: "wizard_step_changed", step: currentStep });
  }, [currentStep, dispatch]);
  useEffect(
    () => () => {
      dispatch({ type: "wizard_step_changed", step: null });
    },
    [dispatch]
  );

  function scrollToStep(step: number, behavior: ScrollBehavior = "smooth") {
    stepRefs.current[step]?.scrollIntoView({ behavior, block: "start" });
  }

  // Runs after every commit — guaranteed the new step's DOM node exists
  useEffect(() => {
    if (!pendingScroll.current) return;
    const { step, behavior } = pendingScroll.current;
    pendingScroll.current = null;
    scrollToStep(step, behavior);
  });

  const advanceTo = useCallback((next: number) => {
    setMaxStep((m) => Math.max(m, next));
    setAnimatingStep(next);
    setCurrentStep(next);
    pendingScroll.current = { step: next, behavior: "smooth" };
  }, []);

  const handleNext = useCallback(
    (partial: Partial<StepData>) => {
      const scenarioChanged =
        partial.scenario !== undefined &&
        partial.scenario !== stepData.scenario;

      const { step: next, resetData } = computeStepTransition({
        currentStep,
        maxStep,
        scenarioChanged,
      });

      // Changing scenario invalidates everything downstream (interests,
      // triggers, segments, file, budget) — reset those fields and rewind
      // progress to the step right after the scenario picker. `next` is
      // anchored to the scenario step (not `currentStep`), so picking a new
      // scenario after scrolling back to the rendered step-1 panel lands on
      // step 2 instead of overshooting. `setMaxStep(next)` collapses any
      // phantom steps that were reached under the old scenario.
      if (resetData) {
        setStepData({ ...initialStepData, ...partial });
        setMaxStep(next);
        setAnimatingStep(next);
        setCurrentStep(next);
        pendingScroll.current = { step: next, behavior: "smooth" };
        return;
      }

      setStepData((prev) => ({ ...prev, ...partial }));
      // Revisited earlier step (other than scenario): keep filled progress,
      // jump back to the furthest reached step instead of advancing linearly.
      if (currentStep < maxStep) {
        setAnimatingStep(null);
        setCurrentStep(next);
        pendingScroll.current = { step: next, behavior: "smooth" };
        return;
      }
      advanceTo(next);
    },
    [advanceTo, currentStep, maxStep, stepData.scenario]
  );

  const handleStepperClick = useCallback((step: number) => {
    setAnimatingStep(null);
    setCurrentStep(step);
    pendingScroll.current = { step, behavior: "instant" };
  }, []);

  const handleGoToStep = useCallback((step: number) => {
    setAnimatingStep(null);
    setCurrentStep(step);
    pendingScroll.current = { step, behavior: "smooth" };
  }, []);

  // Launch handoff from the Бюджет step (no summary step). Builds the
  // LaunchRequest the section consumer expects. Post-segments the audience
  // count is derived from the uploaded base size (own/new) or a scenario
  // fallback (stream). `proceed` is a no-op: open-campaign progress now lives
  // in the campaign card (sub-track D), so there is no step-7 to advance to —
  // the reducer routes the view after the signal/campaign is created.
  const handleLaunchFromBudget = useCallback(() => {
    if (!onLaunchRequested) {
      handleNext({});
      return;
    }
    onLaunchRequested({
      scenarioId: stepData.scenario ?? "",
      cost: stepData.budget ?? 0,
      count: stepData.fileRowCount ?? FALLBACK_BASE,
      stepData,
      proceed: () => {},
    });
  }, [handleNext, onLaunchRequested, stepData]);

  function renderStepContent(step: number) {
    const props = { data: stepData, onNext: handleNext };
    // «Назад» возвращает на предыдущий шаг (плавный скролл к нему). Шаг 1
    // автопереходит по выбору сценария и футера не имеет, поэтому начинаем
    // прокидывать onBack со 2-го.
    const onBack = () => handleGoToStep(step - 1);
    // 4-шаговый кампейн-флоу (spec §8):
    // 1 Сценарий · 2 Источник · 3 Каналы · 4 Бюджет → запуск
    switch (step) {
      case 1: return <Step1Scenario {...props} />;
      case 2: return <StepSource {...props} onBack={onBack} />;
      case 3: return <StepChannels {...props} onBack={onBack} />;
      case 4:
        return (
          <StepBudget
            {...props}
            onBack={onBack}
            onNext={() => handleLaunchFromBudget()}
          />
        );
      default: return null;
    }
  }

  const visibleSteps = Array.from({ length: maxStep }, (_, i) => i + 1);

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden transition-[padding] duration-300"
      style={{ paddingRight: "var(--chat-sidebar-width, 0px)" }}
    >
      {currentStep >= 1 && (
        <div
          className="absolute top-6 z-10 transition-[right] duration-300"
          style={{ right: "calc(1.5rem + var(--chat-sidebar-width, 0px))" }}
        >
          {/* Пока степпер виден — переход по любому пройденному шагу работает
              всегда, в обе стороны. Шаг 7 («Обработка») неинтерактивен сам по
              себе как активный шаг во время процесса, но не блокирует остальные
              (раньше disabled={currentStep === 7} замораживал весь степпер). */}
          <CampaignStepper
            currentStep={currentStep}
            maxStep={maxStep}
            onStepClick={handleStepperClick}
          />
        </div>
      )}

      {/* Scrollable step column — extra bottom padding so content clears the floating input */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {visibleSteps.map((step) => (
          <motion.div
            key={step}
            ref={(el) => { stepRefs.current[step] = el; }}
            initial={step === animatingStep ? { y: 60, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="flex min-h-screen shrink-0 flex-col items-center justify-center px-8 pb-promptbar pt-10"
          >
            {renderStepContent(step)}
          </motion.div>
        ))}
      </div>

    </div>
  );
}

export function CampaignWorkspace({
  onSignalComplete,
  onLaunchRequested,
  initialScenario,
  initialStepDataOverride,
  initialStep,
  pendingSignal,
}: {
  onSignalComplete?: () => void;
  onLaunchRequested?: (req: LaunchRequest) => void;
  initialScenario?: { id: string; name: string };
  initialStepDataOverride?: StepData;
  initialStep?: number;
  pendingSignal?: Signal | null;
} = {}) {
  return (
    <WorkspaceInner
      onSignalComplete={onSignalComplete}
      onLaunchRequested={onLaunchRequested}
      initialScenario={initialScenario}
      initialStepDataOverride={initialStepDataOverride}
      initialStep={initialStep}
      pendingSignal={pendingSignal}
    />
  );
}
