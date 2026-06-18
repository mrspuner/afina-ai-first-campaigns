"use client";

import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps } from "@/types/campaign";
import {
  estimateCampaignBudget,
  type BudgetEstimateInput,
} from "@/sections/campaigns/campaign-budget-estimate";
import { cn } from "@/lib/utils";

function formatRub(amount: number): string {
  return `₽ ${amount.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`;
}

export interface BudgetRow {
  key: "signals" | "communication" | "total";
  label: string;
  amount: number;
  display: string;
}

/** Pure forecast rows for the Бюджет step (own's signals line reads «бесплатно»). */
export function buildBudgetRows(input: BudgetEstimateInput): BudgetRow[] {
  const est = estimateCampaignBudget(input);
  return [
    {
      key: "signals",
      label: "Сигналы",
      amount: est.signals,
      display:
        input.sourceType === "own" || est.signals === 0
          ? "бесплатно"
          : formatRub(est.signals),
    },
    {
      key: "communication",
      label: "Коммуникация",
      amount: est.communication,
      display: formatRub(est.communication),
    },
    {
      key: "total",
      label: "Итого",
      amount: est.total,
      display: formatRub(est.total),
    },
  ];
}

type Mode = "recommended" | "custom";

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

export function StepBudget({ data, onNext, onBack }: StepProps) {
  const estimateInput: BudgetEstimateInput = {
    sourceType: data.sourceType,
    channels: data.channels,
    baseSize: data.fileRowCount,
  };
  const estimate = useMemo(
    () => estimateCampaignBudget(estimateInput),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.sourceType, data.channels, data.fileRowCount]
  );
  const rows = useMemo(
    () => buildBudgetRows(estimateInput),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.sourceType, data.channels, data.fileRowCount]
  );

  const recommendedValue = estimate.total;
  const isStream = data.sourceType === "stream";

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
    window.requestAnimationFrame(() => customInputRef.current?.focus());
  }

  function handleContinue() {
    onNext({
      budget: activeValue,
      budgetMode: mode,
      ...(isStream && estimate.dailyBudget !== undefined
        ? { dailyBudget: estimate.dailyBudget }
        : {}),
    });
  }

  return (
    <StepContent
      title="Прогноз бюджета"
      subtitle="Рассчитали стоимость по выбранному источнику и каналам."
      maxWidth="max-w-xl"
    >
      <div className="flex flex-col gap-5">
        {/* Forecast rows: Сигналы / Коммуникация / Итого (plain text rows) */}
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
          {rows.map((row) => (
            <div
              key={row.key}
              className={cn(
                "flex items-center justify-between text-sm",
                row.key === "total" &&
                  "mt-1 border-t border-border pt-3 font-semibold text-foreground"
              )}
            >
              <span
                className={
                  row.key === "total" ? "text-foreground" : "text-muted-foreground"
                }
              >
                {row.label}
              </span>
              <span className="tabular-nums">{row.display}</span>
            </div>
          ))}
          {isStream && estimate.dailyBudget !== undefined && (
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Дневной бюджет</span>
              <span className="tabular-nums">
                {formatRub(estimate.dailyBudget)} · потолок {formatRub(estimate.total)}
              </span>
            </div>
          )}
        </div>

        {/* Recommended / custom budget cards (reuses step-5 RadioDot pattern) */}
        <div className="grid grid-cols-2 gap-3">
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
                mode === "recommended" ? "text-foreground" : "text-muted-foreground"
              )}
            >
              Рекомендуемая
            </span>
            <span
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums",
                mode === "recommended" ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {recommendedValue > 0 ? formatRub(recommendedValue) : "—"}
            </span>
            <span className="mt-auto text-xs text-muted-foreground">
              По источнику и каналам
            </span>
          </button>

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
                placeholder="Например, 5000"
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

        <StepFooter
          onBack={onBack}
          onContinue={handleContinue}
          continueLabel="Запустить"
          continueDisabled={!canContinue}
        />
      </div>
    </StepContent>
  );
}
