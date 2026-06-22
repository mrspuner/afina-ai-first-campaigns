"use client";

import { useState } from "react";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps, type SourceType } from "@/types/campaign";
import { cn } from "@/lib/utils";
import { getScenario } from "@/data/scenarios";
import { Badge } from "@/components/ui/badge";

interface SourceOption {
  value: SourceType;
  label: string;
  description: string;
}

const SOURCE_OPTIONS: SourceOption[] = [
  {
    value: "new",
    label: "Новая база номеров",
    description: "Соберём горячую аудиторию по интент-сигналам.",
  },
  {
    value: "stream",
    label: "Поток",
    description: "Непрерывный приток новых сигналов в реальном времени.",
  },
  {
    value: "own",
    label: "Свои сигналы",
    description: "Загрузите свой файл — мы оценим качество базы.",
  },
];

/** Pure continue-gate: a source must be selected (always true given the default). */
export function canContinueFromSource(sourceType: SourceType): boolean {
  return Boolean(sourceType);
}

function RadioDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute right-3 top-3 h-3 w-3 rounded-full border-2 transition-colors",
        active ? "border-foreground bg-foreground" : "border-border bg-transparent"
      )}
    />
  );
}

export function StepSource({ data, onNext, onBack }: StepProps) {
  const recommended = data.scenario
    ? getScenario(data.scenario)?.recommendedSourceType
    : undefined;
  const [sourceType, setSourceType] = useState<SourceType>(
    () => recommended ?? data.sourceType
  );

  const canContinue = canContinueFromSource(sourceType);

  return (
    <StepContent
      title="Откуда берём аудиторию?"
      subtitle="Выберите источник — остальное настроим под него автоматически."
    >
      <div className="flex flex-col gap-6">
        {/* Source selection — radio-card row (reuses step-budget RadioDot pattern) */}
        <div className="grid grid-cols-3 gap-3">
          {SOURCE_OPTIONS.map((opt) => {
            const active = sourceType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSourceType(opt.value)}
                aria-pressed={active}
                className={cn(
                  "relative flex h-[120px] flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  active
                    ? "border-brand/60 bg-brand-muted"
                    : "border-border bg-card hover:bg-accent/50"
                )}
              >
                <RadioDot active={active} />
                <span
                  className={cn(
                    "text-sm font-medium",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {opt.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {opt.description}
                </span>
                {opt.value === recommended && (
                  <Badge variant="secondary" className="mt-auto text-[10px]">
                    Рекомендуется
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        <StepFooter
          onBack={onBack}
          onContinue={() => onNext({ sourceType })}
          continueLabel="Далее"
          continueDisabled={!canContinue}
        />
      </div>
    </StepContent>
  );
}
