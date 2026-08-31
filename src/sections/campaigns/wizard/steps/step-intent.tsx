"use client";

import { useState } from "react";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps, deriveSourceType, type CampaignIntent } from "@/types/campaign";
import { cn } from "@/lib/utils";

interface IntentOption {
  value: CampaignIntent;
  label: string;
  description: string;
}

/** Экспортируется ради сводки на финальном шаге: она показывает выбранную цель
 *  той же подписью, что стояла на карточке выбора, — иначе пользователь читал бы
 *  в сводке не то, что выбирал. */
export const INTENT_OPTIONS: IntentOption[] = [
  {
    value: "signals",
    label: "Только сигналы",
    description: "Соберём горячую аудиторию по интент-сигналам.",
  },
  {
    value: "signals-comms",
    label: "Сигналы + коммуникация",
    description: "Соберём аудиторию и запустим по ней рекламу.",
  },
  {
    value: "comms-own",
    label: "Коммуникация по своим сигналам",
    description: "Загрузите свою базу — запустим по ней коммуникацию.",
  },
];

/** Pure continue-gate: an intent must be selected (always true given the default). */
export function canContinueFromIntent(intent: CampaignIntent): boolean {
  return Boolean(intent);
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

export function StepIntent({ data, onNext, onBack }: StepProps) {
  const [intent, setIntent] = useState<CampaignIntent>(() => data.intent);
  const canContinue = canContinueFromIntent(intent);

  return (
    <StepContent
      title="Что хотите получить?"
      subtitle="Выберите, что нужно на выходе — остальное настроим под это."
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-3 gap-3">
          {INTENT_OPTIONS.map((opt) => {
            const active = intent === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setIntent(opt.value)}
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
          onContinue={() => onNext({ intent, sourceType: deriveSourceType(intent, data.analysisMode) })}
          continueLabel="Далее"
          continueDisabled={!canContinue}
        />
      </div>
    </StepContent>
  );
}
