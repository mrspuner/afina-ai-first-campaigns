"use client";

import { useMemo, useState } from "react";
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
import { groupCommunicationLines } from "@/sections/campaigns/communication-breakdown";
import { estimateTouches } from "@/sections/campaigns/campaign-cost";
import { CampaignForecastCard } from "@/sections/campaigns/wizard/steps/campaign-forecast-card";
import { WizardSummaryTable } from "@/sections/campaigns/wizard/steps/wizard-summary-table";
import type { StepData } from "@/types/campaign";

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

  // Своей суммы на этом шаге больше нет: бюджет задаётся позже, на экране
  // оплаты при запуске, где живёт полный механизм «Рекомендуемая / Своя сумма»
  // с пересчётом разбивки. Здесь кампания всегда создаётся с рекомендуемым.
  const activeValue = recommendedValue;
  const canContinue = recommendedValue > 0;

  // Масштабирования под свою сумму больше нет, поэтому строки прогноза — это
  // ровно рекомендуемая разбивка.
  const rows = recommendedRows;

  const signalsRow = rows.find((r) => r.key === "signals")!;
  const commRow = rows.find((r) => r.key === "communication")!;
  const totalRow = rows.find((r) => r.key === "total")!;

  // Прогноз касаний — та же оценка, что на карточке кампании и экране оплаты,
  // на рекомендуемой сумме и размере загруженной базы.
  const touches = estimateTouches(
    recommendedValue,
    data.fileRowCount && data.fileRowCount > 0 ? data.fileRowCount : FALLBACK_BASE,
  );
  const touchesDisplay = touches > 0 ? touches.toLocaleString("ru-RU") : "—";

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
      budgetMode: "recommended",
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

        {/* «Прогноз кампании»: рекомендуемый бюджет (раскрывается в ту же
            разбивку, что показывает экран оплаты) и прогноз касаний. Выбора
            суммы здесь нет — он живёт на экране оплаты при запуске. */}
        <CampaignForecastCard
          budgetDisplay={totalRow.display}
          touchesDisplay={touchesDisplay}
          signalsDisplay={signalsRow.display}
          communicationDisplay={commRow.display}
          totalDisplay={totalRow.display}
          commGroups={commGroups}
          formatCell={formatRub}
          breakdownFooter={
            isStream && (estimate.dailyBudget !== undefined || maxDailyLine) ? (
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

        {/* Абзац-развилка снят: его работу делают заголовок «Проверьте
            кампанию» и подпись в карточке прогноза про настройку бюджета
            при запуске. */}
        {!footerOverride?.hidden && (
          <>
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
