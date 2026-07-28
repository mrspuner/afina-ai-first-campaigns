"use client";

import { Check, Database, Gauge, MessageSquare, Plug, Repeat, Route, Target, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardStepId } from "@/sections/campaigns/wizard/wizard-steps";

/** Russian labels for each wizard step id, rendered in the stepper rail. */
export const STEP_LABELS: Record<WizardStepId, string> = {
  scenario: "Сценарий",
  intent: "Цель",
  interests: "Интересы",
  analysis: "Режим",
  file: "Файл",
  integration: "Интеграция",
  channels: "Каналы",
  budget: "Бюджет",
};

/**
 * Иконка шага для тега-пилюли в описании кампании. Парная `STEP_LABELS`:
 * держим рядом, чтобы новый шаг нельзя было завести с подписью, но без иконки.
 */
export const STEP_ICON: Record<WizardStepId, LucideIcon> = {
  scenario: Route,
  intent: Target,
  interests: Gauge,
  analysis: Repeat,
  file: Database,
  integration: Plug,
  channels: MessageSquare,
  budget: Wallet,
};

interface CampaignStepperProps {
  /** The active, intent-dependent step sequence (1 row per id). */
  steps: WizardStepId[];
  currentStep: number;
  maxStep: number;
  onStepClick: (step: number) => void;
  disabled?: boolean;
  /**
   * Изолированная сессия правки шага (Task 12): набор позиций, доступных для
   * клика/подсвеченных как «пройденные». Колонка правки может пропускать
   * шаги ПОСЕРЕДИНЕ (например, «Анализ»(4) и «Бюджет»(7) без «Файла»(5)/
   * «Каналов»(6) между ними — правка одного не проходит через другие), так
   * что сплошная проверка `step <= maxStep` тут не подходит. Когда задано,
   * ЗАМЕНЯЕТ обычную проверку `isVisited` целиком; обычный проход визарда его
   * не передаёт и остаётся на прежней сплошной логике.
   */
  visitedSteps?: Set<number>;
}

export function CampaignStepper({
  steps,
  currentStep,
  maxStep,
  onStepClick,
  disabled = false,
  visitedSteps,
}: CampaignStepperProps) {
  return (
    <div className="flex flex-col gap-1">
      {steps.map((id, idx) => {
        const step = idx + 1;
        const label = STEP_LABELS[id];
        const isActive = step === currentStep;
        const isVisited = visitedSteps ? visitedSteps.has(step) : step <= maxStep;
        const isCompleted = isVisited && !isActive;
        const isPending = !isVisited && !isActive;
        const isClickable = isVisited && !isActive && !disabled;

        return (
          <div key={id} className="flex items-center gap-2.5">
            {/* Connector line above (except first item) */}
            <div className="flex flex-col items-center self-stretch">
              <div
                className={cn(
                  "w-px flex-1",
                  idx === 0 ? "invisible" : isVisited ? "bg-primary" : "bg-border"
                )}
              />
              {/* Circle */}
              <div
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium transition-colors duration-200 ease-out",
                  isCompleted &&
                    "border-primary bg-primary text-primary-foreground",
                  isActive &&
                    "border-brand bg-brand text-brand-foreground ring-2 ring-brand/25",
                  isPending && "border-border bg-background text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span>{step}</span>
                )}
              </div>
              <div
                className={cn(
                  "w-px flex-1",
                  idx === steps.length - 1
                    ? "invisible"
                    : isVisited
                    ? "bg-primary"
                    : "bg-border"
                )}
              />
            </div>

            {/* Label */}
            <button
              onClick={() => isClickable && onStepClick(step)}
              disabled={!isClickable}
              className={cn(
                "py-1 text-xs transition-colors duration-200 ease-out",
                isActive && "font-medium text-foreground",
                isClickable
                  ? "cursor-pointer text-foreground hover:text-primary"
                  : "cursor-default",
                isPending && "text-muted-foreground"
              )}
            >
              {label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
