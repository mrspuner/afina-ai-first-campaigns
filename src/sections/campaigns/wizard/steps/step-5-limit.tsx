"use client";

import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps } from "@/types/campaign";
import { cn } from "@/lib/utils";
import { recommendBudget } from "@/state/metrics";
import { SegmentPriorityBreakdown } from "@/sections/signals/segment-priority-breakdown";

function formatRub(amount: number): string {
  return `₽ ${amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}`;
}

type Mode = "recommended" | "custom";

export function Step5Limit({ data, onNext, onBack }: StepProps) {
  // Рекомендация детерминирована по размеру базы (recommendBudget из движка
  // чисел), поэтому стабильна между ре-рендерами и повторными заходами на шаг.
  const recommendedValue = useMemo(
    () =>
      typeof data.fileRowCount === "number"
        ? recommendBudget(data.fileRowCount)
        : 0,
    [data.fileRowCount]
  );

  const [mode, setMode] = useState<Mode>(data.budgetMode ?? "recommended");
  const [customValue, setCustomValue] = useState<string>(() => {
    if (data.budgetMode === "custom" && data.budget != null) {
      return String(data.budget);
    }
    return recommendedValue > 0 ? String(recommendedValue) : "";
  });

  const customInputRef = useRef<HTMLInputElement | null>(null);

  const customParsed = parseFloat(customValue);
  const customIsValid = !isNaN(customParsed) && customParsed > 0;
  const activeValue =
    mode === "recommended" ? recommendedValue : customIsValid ? customParsed : 0;
  const canContinue =
    mode === "recommended" ? recommendedValue > 0 : customIsValid;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
    setCustomValue(raw);
  }

  function selectCustom() {
    setMode("custom");
    // Defer focus until the input is enabled in the next paint.
    window.requestAnimationFrame(() => customInputRef.current?.focus());
  }

  return (
    <StepContent
      title="Укажите максимальный бюджет"
      subtitle="Мы найдём максимальное количество сигналов в рамках этой суммы"
      maxWidth="max-w-xl"
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          {/* Recommended card */}
          <button
            type="button"
            onClick={() => setMode("recommended")}
            disabled={recommendedValue <= 0}
            className={cn(
              "relative flex h-[140px] flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              mode === "recommended"
                ? "border-brand/60 bg-brand-muted"
                : "border-border bg-card hover:bg-accent/50",
              recommendedValue <= 0 && "cursor-not-allowed opacity-50"
            )}
          >
            <RadioDot active={mode === "recommended"} />
            <span
              className={cn(
                "text-xs font-medium uppercase tracking-widest",
                mode === "recommended"
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              Рекомендуемая
            </span>
            <span
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums",
                mode === "recommended"
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {recommendedValue > 0 ? formatRub(recommendedValue) : "—"}
            </span>
            <span className="mt-auto text-xs text-muted-foreground">
              На основе размера базы
            </span>
          </button>

          {/* Custom card */}
          <button
            type="button"
            onClick={selectCustom}
            className={cn(
              "relative flex h-[140px] flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              mode === "custom"
                ? "border-brand/60 bg-brand-muted"
                : "border-border bg-card hover:bg-accent/50"
            )}
          >
            <RadioDot active={mode === "custom"} />
            <span
              className={cn(
                "text-xs font-medium uppercase tracking-widest",
                mode === "custom" ? "text-foreground" : "text-muted-foreground"
              )}
            >
              Своя сумма
            </span>
            <div
              className="relative mt-1 w-full"
              onClick={(e) => {
                if (mode === "custom") e.stopPropagation();
              }}
            >
              <Input
                ref={customInputRef}
                type="text"
                inputMode="decimal"
                placeholder="Например, 500"
                value={customValue}
                onChange={handleChange}
                disabled={mode !== "custom"}
                className={cn(
                  "pr-8 text-lg tabular-nums",
                  mode !== "custom" && "cursor-pointer"
                )}
                aria-label="Своя сумма"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                ₽
              </span>
            </div>
            <span className="mt-auto text-xs text-muted-foreground">
              Введите свою сумму
            </span>
          </button>
        </div>

        <SegmentPriorityBreakdown
          segments={data.segments}
          budget={activeValue}
        />

        <StepFooter
          onBack={onBack}
          onContinue={() => onNext({ budget: activeValue, budgetMode: mode })}
          continueLabel="Далее"
          continueDisabled={!canContinue}
        />
      </div>
    </StepContent>
  );
}

function RadioDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute right-3 top-3 h-3 w-3 rounded-full border-2 transition-colors",
        active
          ? "border-foreground bg-foreground"
          : "border-border bg-transparent"
      )}
    />
  );
}
