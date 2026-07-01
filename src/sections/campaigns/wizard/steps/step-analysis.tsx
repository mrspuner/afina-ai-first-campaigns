"use client";

import { useState } from "react";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps, deriveSourceType, type AnalysisMode } from "@/types/campaign";
import { cn } from "@/lib/utils";

interface AnalysisOption {
  value: AnalysisMode;
  label: string;
  description: string;
}

const ANALYSIS_OPTIONS: AnalysisOption[] = [
  { value: "once", label: "Разовый", description: "Проверим базу один раз и соберём аудиторию." },
  { value: "stream", label: "Потоковый", description: "Будем постоянно отслеживать новые сигналы." },
];

/** Pure continue-gate: a mode must be selected (always true given the default). */
export function canContinueFromAnalysis(mode: AnalysisMode): boolean {
  return Boolean(mode);
}

function RadioDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute right-3 top-3 h-3 w-3 rounded-full border-2 transition-colors",
        active ? "border-foreground bg-foreground" : "border-border bg-transparent",
      )}
    />
  );
}

export function StepAnalysis({ data, onNext, onBack }: StepProps) {
  const [mode, setMode] = useState<AnalysisMode>(() => data.analysisMode);
  const canContinue = canContinueFromAnalysis(mode);

  return (
    <StepContent
      title="Разовый или потоковый анализ?"
      subtitle="Как собирать сигналы — один раз или непрерывно."
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3">
          {ANALYSIS_OPTIONS.map((opt) => {
            const active = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                aria-pressed={active}
                className={cn(
                  "relative flex h-[120px] flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  active ? "border-brand/60 bg-brand-muted" : "border-border bg-card hover:bg-accent/50",
                )}
              >
                <RadioDot active={active} />
                <span className={cn("text-sm font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                  {opt.label}
                </span>
                <span className="text-xs text-muted-foreground">{opt.description}</span>
              </button>
            );
          })}
        </div>

        <StepFooter
          onBack={onBack}
          onContinue={() => onNext({ analysisMode: mode, sourceType: deriveSourceType(data.intent, mode) })}
          continueLabel="Далее"
          continueDisabled={!canContinue}
        />
      </div>
    </StepContent>
  );
}
