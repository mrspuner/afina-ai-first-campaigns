"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const STEPPER_ITEMS = [
  { label: "Выбор сценария", step: 1 },
  { label: "Интересы", step: 2 },
  { label: "Сегменты", step: 3 },
  { label: "База", step: 4 },
  { label: "Бюджет", step: 5 },
  { label: "Сводка", step: 6 },
  { label: "Обработка", step: 7 },
  { label: "Результат", step: 8 },
];

interface CampaignStepperProps {
  currentStep: number;
  maxStep: number;
  onStepClick: (step: number) => void;
  disabled?: boolean;
}

export function CampaignStepper({
  currentStep,
  maxStep,
  onStepClick,
  disabled = false,
}: CampaignStepperProps) {
  return (
    <div className="flex flex-col gap-1">
      {STEPPER_ITEMS.map(({ label, step }, idx) => {
        const isActive = step === currentStep;
        const isVisited = step <= maxStep;
        const isCompleted = isVisited && !isActive;
        const isPending = step > maxStep;
        const isClickable = isVisited && !isActive && !disabled;

        return (
          <div key={step} className="flex items-center gap-2.5">
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
                  <span>{idx + 1}</span>
                )}
              </div>
              <div
                className={cn(
                  "w-px flex-1",
                  idx === STEPPER_ITEMS.length - 1
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
