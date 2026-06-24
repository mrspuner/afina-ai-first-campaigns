"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/state/app-state-context";
import type { Survey } from "@/types/survey";

import { SurveyAwaiting } from "./survey-awaiting";
import { SurveyForm } from "./survey-form";
import { OnboardingInterestsScreen } from "./onboarding-interests-screen";
import { OnboardingScenariosScreen } from "./onboarding-scenarios-screen";

type Phase =
  | { kind: "form" }
  | { kind: "awaiting"; survey: Survey }
  | { kind: "interests"; survey: Survey }
  | { kind: "matching"; survey: Survey }
  | { kind: "scenarios"; survey: Survey };

interface SurveySectionProps {
  // Called once the user finishes onboarding. The first-visit flow opens the
  // scenario catalog from inside this section; gate-mode flows just need the
  // user handed off to the wizard. The caller decides what to do next.
  onComplete: () => void;
  // When true, run the full 3-screen onboarding (form → enrich → interests →
  // scenarios → caller). When false (legacy gate before the wizard), stop
  // after the enrich animation and hand off to the wizard.
  withOnboardingScreens?: boolean;
  title?: string;
  subtitle?: string;
}

export function SurveySection({
  onComplete,
  withOnboardingScreens = false,
  title,
  subtitle,
}: SurveySectionProps) {
  const dispatch = useAppDispatch();
  const [phase, setPhase] = useState<Phase>({ kind: "form" });

  // Escape exits fullscreen survey — sidebar/promptbar are hidden, so without
  // it the user is trapped until completion.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") dispatch({ type: "go_welcome" });
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dispatch]);

  function handleSubmit(survey: Survey) {
    setPhase({ kind: "awaiting", survey });
  }

  function handleAwaitingDone() {
    if (phase.kind !== "awaiting") return;
    if (withOnboardingScreens) {
      setPhase({ kind: "interests", survey: phase.survey });
      return;
    }
    dispatch({ type: "survey_completed", survey: phase.survey });
    onComplete();
  }

  function handleInterestsContinue() {
    if (phase.kind !== "interests") return;
    setPhase({ kind: "matching", survey: phase.survey });
  }

  function handleInterestsBack() {
    if (phase.kind !== "interests") return;
    setPhase({ kind: "form" });
  }

  function handleMatchingDone() {
    if (phase.kind !== "matching") return;
    setPhase({ kind: "scenarios", survey: phase.survey });
  }

  function handleChooseScenario() {
    if (phase.kind !== "scenarios") return;
    dispatch({ type: "survey_completed", survey: phase.survey });
    dispatch({ type: "start_campaign_flow" });
    onComplete();
  }

  function handleScenariosBack() {
    if (phase.kind !== "scenarios") return;
    setPhase({ kind: "form" });
  }

  return (
    <div className="relative flex flex-1 items-center justify-center px-8 pb-16 pt-[120px]">
      <motion.div
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.28, delay: 0.15, ease: [0.32, 0.72, 0, 1] }}
        className="absolute right-6 top-6"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => dispatch({ type: "go_welcome" })}
          aria-label="Закрыть и вернуться на главную"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      </motion.div>
      <AnimatePresence mode="wait">
        {phase.kind === "form" && (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="flex w-full justify-center"
          >
            <SurveyForm
              onSubmit={handleSubmit}
              title={title}
              subtitle={subtitle}
            />
          </motion.div>
        )}
        {phase.kind === "awaiting" && (
          <motion.div
            key="awaiting"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="flex w-full justify-center"
          >
            <SurveyAwaiting onDone={handleAwaitingDone} />
          </motion.div>
        )}
        {phase.kind === "interests" && (
          <motion.div
            key="interests"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="flex w-full justify-center"
          >
            <OnboardingInterestsScreen
              onContinue={handleInterestsContinue}
              onBack={handleInterestsBack}
            />
          </motion.div>
        )}
        {phase.kind === "matching" && (
          <motion.div
            key="matching"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="flex w-full justify-center"
          >
            <SurveyAwaiting
              onDone={handleMatchingDone}
              title="Подбираем сценарии"
              subtitle="Готовим подходящие сценарии под ваш бизнес…"
            />
          </motion.div>
        )}
        {phase.kind === "scenarios" && (
          <motion.div
            key="scenarios"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="flex w-full justify-center"
          >
            <OnboardingScenariosScreen
              onChooseScenario={handleChooseScenario}
              onBack={handleScenariosBack}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
