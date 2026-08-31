"use client";

import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps } from "@/types/campaign";
import { useScreenHints } from "@/hooks/use-screen-hints";
import { BUDGET_SCREEN_HINTS } from "./screen-hints";
import {
  estimateCampaignBudget,
  STREAM_DAYS,
  FALLBACK_BASE,
} from "@/sections/campaigns/campaign-budget-estimate";
import { graphCostFor } from "@/sections/campaigns/campaign-graph-cost";
import { budgetDisplayRows } from "@/sections/campaigns/wizard/steps/budget-display";
import { groupCommunicationLines } from "@/sections/campaigns/communication-breakdown";
import { BudgetBreakdown } from "@/sections/campaigns/budget-breakdown";
import { WizardSummaryTable } from "@/sections/campaigns/wizard/steps/wizard-summary-table";
import type { StepData } from "@/types/campaign";
import { cn } from "@/lib/utils";

function formatRub(amount: number): string {
  return `₽ ${amount.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`;
}

const formatRubApprox = (n: number) => `~${formatRub(n)}`;

export interface BudgetRow {
  key: "signals" | "communication" | "total";
  label: string;
  amount: number;
  display: string;
  /** Optional muted segment shown between label and amount (e.g. "~N контактов"). */
  contactLabel?: string;
}

/** Inputs the Бюджет forecast needs to share the graph cost model. */
export interface BudgetForecastInput {
  scenarioId: string | null;
  sourceType: StepData["sourceType"];
  channels: StepData["channels"];
  baseSize?: number;
}

export interface BudgetForecast {
  /** Scoring cost (0 for own bases) — priced from the source rule, not the graph. */
  signals: number;
  /** Communication cost from the workflow graph (primary + repeat). */
  communication: number;
  /** Grand total = signals + communication. Mirrors the payment screen's `recommended`. */
  total: number;
  /** Stream source only: per-day communication budget. */
  dailyBudget?: number;
}

/**
 * The wizard Budget forecast on the SAME graph cost model as the payment screen:
 *  - «Коммуникации» = graphCostFor(...).total (the scenario+source template
 *    graph priced over baseSize). Same inputs → same figure as payment.
 *  - «Сигналы» = the source-rule scoring portion (own → 0/«бесплатно»), priced
 *    separately because the graph does not model scoring cost.
 *  - «Итого» = signals + communication — signals and communications are paid
 *    together, so the grand total is what the payment screen asks to pay.
 *  - stream dailyBudget = communication / STREAM_DAYS (the recurring channel
 *    spend; the one-off signals cost is not spread across days).
 * When no scenario is selected the graph cost is unavailable; we fall back to the
 * flat communication estimate so the step never crashes / shows nothing.
 */
export function buildBudgetForecast(input: BudgetForecastInput): BudgetForecast {
  const base = input.baseSize && input.baseSize > 0 ? input.baseSize : FALLBACK_BASE;
  const flat = estimateCampaignBudget({
    sourceType: input.sourceType,
    channels: input.channels,
    baseSize: base,
  });
  const graph = graphCostFor({
    scenarioId: input.scenarioId,
    sourceType: input.sourceType,
    baseSize: base,
    channels: input.channels,
  });
  const communication = graph ? graph.total : flat.communication;
  const signals = flat.signals;
  // Итого = grand total: signals + communications are paid together.
  const total = signals + communication;
  if (input.sourceType === "stream") {
    return {
      signals,
      communication,
      total,
      dailyBudget: Math.round(communication / STREAM_DAYS),
    };
  }
  return { signals, communication, total };
}

/** Pure forecast rows for the Бюджет step (own's signals line reads «бесплатно»). */
export function buildBudgetRows(input: BudgetForecastInput): BudgetRow[] {
  const f = buildBudgetForecast(input);
  const contactCount = input.baseSize && input.baseSize > 0 ? input.baseSize : FALLBACK_BASE;
  return [
    {
      key: "signals",
      label: "Сигналы",
      amount: f.signals,
      display:
        input.sourceType === "own" || f.signals === 0
          ? "бесплатно"
          : formatRubApprox(f.signals),
      contactLabel: `~${contactCount.toLocaleString("ru-RU")} контактов`,
    },
    {
      key: "communication",
      label: "Коммуникации",
      amount: f.communication,
      display: formatRubApprox(f.communication),
    },
    {
      key: "total",
      label: "Итого",
      amount: f.total,
      display: formatRubApprox(f.total),
    },
  ];
}

type Mode = "recommended" | "custom";

/**
 * Optional ceiling line for the budget summary (aim #20). Display-only — it
 * does NOT alter the cost model. Returns null when unset so the row is
 * omitted entirely.
 */
export function maxDailyBudgetLine(
  value: number | undefined,
): { label: string; display: string } | null {
  if (value === undefined || !(value > 0)) return null;
  return { label: "Максимальный дневной бюджет", display: formatRub(value) };
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

export function StepBudget({
  data,
  onNext,
  onBack,
  active,
  onGoToStep,
  footerOverride,
}: StepProps) {
  useScreenHints(active ? BUDGET_SCREEN_HINTS : null);
  const forecastInput: BudgetForecastInput = {
    scenarioId: data.scenario,
    sourceType: data.sourceType,
    channels: data.channels,
    baseSize: data.fileRowCount,
  };
  const estimate = useMemo(
    () => buildBudgetForecast(forecastInput),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.scenario, data.sourceType, data.channels, data.fileRowCount]
  );
  const recommendedRows = useMemo(
    () => buildBudgetRows(forecastInput),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.scenario, data.sourceType, data.channels, data.fileRowCount]
  );
  // Raw graph cost (same model as the payment screen) — gives the per-channel
  // breakdown (`lines`) and the repeat-buffer amount (`repeat`). null when no
  // scenario is selected, in which case we fall back to the simple channel list.
  const cost = useMemo(
    () =>
      graphCostFor({
        scenarioId: data.scenario,
        sourceType: data.sourceType,
        baseSize: data.fileRowCount && data.fileRowCount > 0 ? data.fileRowCount : FALLBACK_BASE,
        channels: data.channels,
      }),
    [data.scenario, data.sourceType, data.channels, data.fileRowCount]
  );
  // «Коммуникация» breakdown split into «Первичные» / «Повторные», each
  // deduped + summed by channel (aim #23). Display-only transform over the
  // raw cost lines — does not change the cost model.
  const commGroups = useMemo(
    () => (cost ? groupCommunicationLines(cost.lines) : null),
    [cost]
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

  const [maxDailyValue, setMaxDailyValue] = useState<string>(
    data.maxDailyBudget != null ? String(data.maxDailyBudget) : "",
  );
  const maxDailyParsed = parseFloat(maxDailyValue.replace(",", "."));
  const maxDailyLine = maxDailyBudgetLine(
    !isNaN(maxDailyParsed) ? maxDailyParsed : undefined,
  );

  function handleMaxDailyChange(e: React.ChangeEvent<HTMLInputElement>) {
    setMaxDailyValue(e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."));
  }

  const customParsed = parseFloat(customValue);
  const customIsValid = !isNaN(customParsed) && customParsed > 0;
  const activeValue =
    mode === "recommended" ? recommendedValue : customIsValid ? customParsed : 0;
  const canContinue =
    mode === "recommended" ? recommendedValue > 0 : customIsValid;

  // In «Своя сумма» mode the forecast rows rescale proportionally to the chosen
  // budget (Итого = the custom sum); otherwise they show the recommended estimate.
  const customTotal = mode === "custom" && customIsValid ? customParsed : null;
  const rows = useMemo<BudgetRow[]>(() => {
    const components = recommendedRows
      .filter((r) => r.key !== "total")
      .map((r) => ({
        key: r.key,
        amount: r.amount,
        contactCount:
          r.key === "signals" ? data.fileRowCount ?? FALLBACK_BASE : undefined,
      }));
    const { rows: scaled, total } = budgetDisplayRows({
      components,
      recommendedTotal: estimate.total,
      customTotal,
    });
    const out: BudgetRow[] = scaled.map((c) => {
      const base = recommendedRows.find((r) => r.key === c.key)!;
      const isFreeSignals =
        c.key === "signals" && (data.sourceType === "own" || c.amount === 0);
      return {
        key: base.key,
        label: base.label,
        amount: c.amount,
        display: isFreeSignals ? "бесплатно" : formatRubApprox(c.amount),
        contactLabel:
          c.contactCount !== undefined
            ? `~${c.contactCount.toLocaleString("ru-RU")} контактов`
            : undefined,
      };
    });
    out.push({
      key: "total",
      label: "Итого",
      amount: total,
      display: formatRubApprox(total),
    });
    return out;
  }, [recommendedRows, estimate.total, customTotal, data.sourceType, data.fileRowCount]);

  const signalsRow = rows.find((r) => r.key === "signals")!;
  const commRow = rows.find((r) => r.key === "communication")!;
  const totalRow = rows.find((r) => r.key === "total")!;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
    setCustomValue(raw);
  }

  function selectCustom() {
    setMode("custom");
    window.requestAnimationFrame(() => customInputRef.current?.focus());
  }

  function proceed() {
    // Потолок вводит пользователь (только stream) — durable значение кампании.
    // Ключ передаём ВСЕГДА: пустое поле должно снимать ранее заданный потолок
    // (StepData мержится спредом, отсутствующий ключ ничего не затёр бы).
    const maxDaily =
      isStream && !isNaN(maxDailyParsed) && maxDailyParsed > 0
        ? maxDailyParsed
        : undefined;
    onNext({
      budget: activeValue,
      budgetMode: mode,
      maxDailyBudget: maxDaily,
      ...(isStream && estimate.dailyBudget !== undefined
        ? { dailyBudget: estimate.dailyBudget }
        : {}),
    });
  }

  return (
    <StepContent
      title="Проверьте кампанию"
      subtitle={`Настройки собраны, стоимость рассчитана по источнику, каналам${data.fileRowCount ? " и размеру базы" : ""}.`}
      maxWidth="max-w-xl"
    >
      <div className="flex flex-col gap-4">
        {/* Сводка заполненного визарда (возвращена из снятого Step6Summary).
            В изолированной правке шага с карточки её нет: там правится ОДИН
            шаг, соседние значения не при делах, и возвращаться некуда. */}
        {!footerOverride && (
          <WizardSummaryTable data={data} onGoToStep={onGoToStep} />
        )}

        {/* Forecast: merged «Сигналы» + collapsible «Коммуникации» table + «Итого».
            Shared with the payment screen via BudgetBreakdown. */}
        <div className="rounded-lg border border-border bg-card p-4">
          <BudgetBreakdown
            signalsDisplay={signalsRow.display}
            communicationDisplay={commRow.display}
            totalDisplay={totalRow.display}
            commGroups={commGroups}
            formatCell={formatRub}
            footer={
              isStream &&
              (estimate.dailyBudget !== undefined || maxDailyLine) ? (
                <>
                  {estimate.dailyBudget !== undefined && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Дневной бюджет</span>
                      <span className="tabular-nums">
                        ~{formatRub(estimate.dailyBudget)}/день × {STREAM_DAYS} дн · потолок ~{formatRub(estimate.total)}
                      </span>
                    </div>
                  )}
                  {maxDailyLine && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{maxDailyLine.label}</span>
                      <span className="tabular-nums">{maxDailyLine.display}</span>
                    </div>
                  )}
                </>
              ) : undefined
            }
          />
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
              Рассчитали на основе источников и каналов
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

        {isStream && (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="max-daily-budget"
              className="text-xs font-medium text-muted-foreground"
            >
              Максимальный дневной бюджет (необязательно)
            </label>
            <div className="relative">
              <Input
                id="max-daily-budget"
                type="text"
                inputMode="decimal"
                placeholder="Без ограничения"
                value={maxDailyValue}
                onChange={handleMaxDailyChange}
                className="pr-8 tabular-nums"
                aria-label="Максимальный дневной бюджет"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                ₽
              </span>
            </div>
          </div>
        )}

        {!footerOverride?.hidden && (
          <>
            {/* Последняя развилка визарда (комменты от 31.08): шаг перестаёт
                читаться как «ещё один шаг». В режиме точечной правки с
                карточки (footerOverride) ничего не создаётся — там текста нет. */}
            {!footerOverride && (
              <p className="text-sm text-muted-foreground">
                Вот прогноз бюджета. Можно вернуться назад и что-то поменять — или
                создать кампанию, готовую к запуску.
              </p>
            )}
            <StepFooter
              onBack={onBack}
              onContinue={proceed}
              continueLabel={footerOverride?.continueLabel ?? "Создать кампанию"}
              backLabel={footerOverride?.backLabel}
              continueDisabled={!canContinue}
            />
          </>
        )}
      </div>

    </StepContent>
  );
}
