"use client";

import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps } from "@/types/campaign";
import { useAppState } from "@/state/app-state-context";
import { computeShortfall } from "@/sections/signals/top-up-modal";
import { cn } from "@/lib/utils";
import { SCENARIO_NAMES, SEGMENT_NAMES } from "@/sections/signals/signal-summary-data";

function formatRub(amount: number): string {
  return `₽ ${amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}`;
}

function SummaryRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "grid grid-cols-[180px_1fr] items-start gap-4 py-3 transition-colors",
        onClick && "cursor-pointer rounded px-2 -mx-2 hover:bg-accent"
      )}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{value}</span>
        {onClick && (
          <Settings
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
          />
        )}
      </div>
    </div>
  );
}

export function Step6Summary({ data, onNext, onBack, onGoToStep }: StepProps) {
  const { balance } = useAppState();
  const budget = data.budget ?? 0;

  const cost = budget;
  const shortfall = computeShortfall(balance, cost);
  const enoughBalance = shortfall <= 0;

  const goto = onGoToStep;

  return (
    <StepContent
      title="Проверьте настройки сигнала"
      subtitle="Нажмите на строку, чтобы вернуться к шагу для редактирования"
    >
      <div className="rounded-lg border border-border bg-card">
        <div className="divide-y divide-border px-4">
          <SummaryRow
            label="Сценарий"
            value={SCENARIO_NAMES[data.scenario ?? ""] ?? "—"}
            onClick={goto ? () => goto(1) : undefined}
          />
          <SummaryRow
            label="Интересы"
            value={data.interests.length ? data.interests.join(", ") : "—"}
            onClick={goto ? () => goto(2) : undefined}
          />
          <SummaryRow
            label="Триггеры"
            value={data.triggers.length ? data.triggers.join(", ") : "—"}
            onClick={goto ? () => goto(2) : undefined}
          />
          <SummaryRow
            label="Сегменты"
            value={
              data.segments.length
                ? data.segments.map((s) => SEGMENT_NAMES[s]).join("; ")
                : "—"
            }
            onClick={goto ? () => goto(3) : undefined}
          />
          <SummaryRow
            label="Файл с базой"
            value={data.file ? data.file.name : "—"}
            onClick={goto ? () => goto(4) : undefined}
          />
          <SummaryRow
            label="Максимальный бюджет"
            value={budget ? formatRub(budget) : "—"}
            onClick={goto ? () => goto(5) : undefined}
          />
        </div>
      </div>

      {/* Стоимость / Баланс */}
      <div
        className={cn(
          "mt-4 rounded-lg border bg-card px-4 py-3.5",
          enoughBalance ? "border-border" : "border-amber-500/30 bg-amber-50/40 dark:bg-amber-500/5"
        )}
      >
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Стоимость</span>
          <span className="font-semibold tabular-nums">{formatRub(cost)}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Баланс</span>
          <span className="font-medium tabular-nums">{formatRub(balance)}</span>
        </div>
        {!enoughBalance && (
          <div className="mt-2 border-t border-border pt-2 flex items-center justify-between text-sm">
            <span className="text-foreground">Не хватает</span>
            <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">
              {formatRub(shortfall)}
            </span>
          </div>
        )}
      </div>

      <Separator className="my-4" />

      <div className="flex justify-start">
        <Button
          onClick={() => onNext({})}
          className="bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {enoughBalance ? "Запустить" : "Пополнить и запустить"}
        </Button>
      </div>
    </StepContent>
  );
}
