"use client";

import { Pencil } from "lucide-react";
import { SCENARIO_NAMES } from "@/data/scenarios";
import { CHANNEL_LABEL } from "@/sections/campaigns/campaign-cost";
import { fileSummaryLine } from "@/state/workflow-templates";
import { INTENT_OPTIONS } from "@/sections/campaigns/wizard/steps/step-intent";
import { stepsForIntent, type WizardStepId } from "@/sections/campaigns/wizard/wizard-steps";
import type { StepData } from "@/types/campaign";
import { cn } from "@/lib/utils";

const DASH = "—";

export interface SummaryRow {
  /** Шаг, на который ведёт строка. */
  step: WizardStepId;
  label: string;
  value: string;
}

/**
 * Строки сводки на финальном шаге визарда.
 *
 * Состав строк идёт от `stepsForIntent`, а не от фиксированного списка: у цели
 * «коммуникация по своим сигналам» шагов интересов и анализа нет вовсе, и
 * строки про них были бы не пустыми, а выдуманными.
 *
 * Бюджет сюда НЕ входит намеренно — прогноз стоимости стоит прямо под таблицей,
 * и вторая копия числа только спорила бы с первой.
 */
export function buildSummaryRows(data: StepData): SummaryRow[] {
  const present = new Set<WizardStepId>(stepsForIntent(data.intent));
  const rows: SummaryRow[] = [];

  const add = (step: WizardStepId, label: string, value: string) => {
    if (present.has(step)) rows.push({ step, label, value });
  };

  add("scenario", "Сценарий", SCENARIO_NAMES[data.scenario ?? ""] ?? DASH);
  add(
    "intent",
    "Цель",
    INTENT_OPTIONS.find((o) => o.value === data.intent)?.label ?? DASH,
  );
  // Интересы и триггеры — одна ячейка, а не две: обе вели бы на ОДИН и тот же
  // шаг, то есть как цели клика не различались, а лишний ряд уводил основную
  // кнопку шага под промпт-бар.
  const scoring = [
    data.interests.length ? data.interests.join(", ") : null,
    data.triggers.length ? data.triggers.join(", ") : null,
  ].filter(Boolean);
  add("interests", "Интересы и триггеры", scoring.length ? scoring.join(" · ") : DASH);
  add("analysis", "Режим", data.analysisMode === "stream" ? "Потоковый" : "Разовый");
  add("file", "База", fileSummaryLine(data.files) ?? DASH);
  // Пустой набор каналов — это осознанный выбор «без коммуникации», а не
  // незаполненное поле, поэтому не прочерк.
  add(
    "channels",
    "Каналы",
    data.channels.length
      ? data.channels.map((c) => CHANNEL_LABEL[c]).join(", ")
      : "Без коммуникации",
  );

  return rows;
}

/**
 * Сводка заполненного визарда на финальном шаге. Возвращена из снятого
 * `Step6Summary` (коммит 6e42d44), но номера шагов больше не хардкодятся:
 * состав шагов зависит от цели, поэтому позиция считается от `stepsForIntent`.
 *
 * Без `onGoToStep` таблица просто читается — строки не притворяются
 * кликабельными там, где идти некуда (например, в изолированной правке шага).
 */
export function WizardSummaryTable({
  data,
  onGoToStep,
}: {
  data: StepData;
  onGoToStep?: (step: number) => void;
}) {
  const order = stepsForIntent(data.intent);
  const rows = buildSummaryRows(data);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        Настройки кампании
      </p>
      {/* Один столбец: значения бывают длинными (списки интересов и каналов),
          и в две колонки они жались. Место под это освободилось, когда со шага
          ушли карточки выбора суммы. */}
      <div className="flex flex-col gap-px">
        {rows.map((row) => {
          const target = order.indexOf(row.step) + 1;
          const content = (
            <>
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/70">
                {row.label}
                {onGoToStep && (
                  <Pencil aria-hidden className="h-3 w-3 shrink-0 text-brand" />
                )}
              </span>
              {/* Значение переносится по строкам и обрезается на третьей:
                  списки интересов и каналов бывают длиннее колонки, а обрезка
                  в одну строку («truncate») съедала бы почти всё содержимое. */}
              <span className="line-clamp-3 text-sm font-medium leading-snug text-foreground">
                {row.value}
              </span>
            </>
          );
          // Лейбл сверху, значение под ним: значению достаётся вся ширина
          // карточки, а списки интересов и каналов бывают длинными.
          const layout = "flex w-full flex-col gap-0.5 rounded px-2 py-1 text-left";

          return onGoToStep ? (
            <button
              key={row.label}
              type="button"
              onClick={() => onGoToStep(target)}
              aria-label={`${row.label}: ${row.value}. Вернуться к шагу`}
              title={row.value}
              className={cn(
                layout,
                "transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              )}
            >
              {content}
            </button>
          ) : (
            <div key={row.label} className={layout} title={row.value}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
