"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { BudgetBreakdown } from "@/sections/campaigns/budget-breakdown";
import type { CommunicationGroups } from "@/sections/campaigns/communication-breakdown";
import { cn } from "@/lib/utils";

export interface CampaignForecastCardProps {
  /** «Рекомендуемый бюджет» — сумма в строке, которая раскрывает разбивку. */
  budgetDisplay: string;
  /** Прогноз касаний, уже отформатированный. */
  touchesDisplay: string;
  /** Строки разбивки — те же, что показывает экран оплаты. */
  signalsDisplay: string;
  communicationDisplay: string;
  totalDisplay: string;
  commGroups: CommunicationGroups | null;
  formatCell: (n: number) => string;
  /** Доп. строки под разбивкой (потоковый дневной бюджет, потолок). */
  breakdownFooter?: React.ReactNode;
}

/**
 * «Прогноз кампании» на финальном шаге визарда: две строки — рекомендуемый
 * бюджет (раскрывается в разбивку по сигналам и коммуникациям) и прогноз
 * касаний.
 *
 * Выбора суммы здесь нет намеренно: бюджет задаётся позже, на экране оплаты
 * при запуске, где уже живёт полный механизм «Рекомендуемая / Своя сумма» с
 * пересчётом разбивки. Подпись внизу карточки говорит об этом прямо, поэтому
 * она НЕ приглушена — это не сноска, а обещание, которое пользователь должен
 * прочитать.
 */
export function CampaignForecastCard({
  budgetDisplay,
  touchesDisplay,
  signalsDisplay,
  communicationDisplay,
  totalDisplay,
  commGroups,
  formatCell,
  breakdownFooter,
}: CampaignForecastCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        Прогноз кампании
      </p>
      <p className="mb-2 px-1 text-xs text-muted-foreground/70">
        Рассчитан на основе настроек кампании
      </p>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between rounded px-1 py-2 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="flex items-center gap-1.5 text-foreground">
          Рекомендуемый бюджет
          <ChevronDown
            aria-hidden
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </span>
        <span className="font-medium tabular-nums text-foreground">
          {budgetDisplay}
        </span>
      </button>

      {expanded && (
        <div className="mb-1 rounded-md bg-white/[0.02] px-3 py-2">
          {/* hideTotal: «Итого» повторило бы сумму из строки выше. */}
          <BudgetBreakdown
            signalsDisplay={signalsDisplay}
            communicationDisplay={communicationDisplay}
            totalDisplay={totalDisplay}
            commGroups={commGroups}
            formatCell={formatCell}
            footer={breakdownFooter}
            hideTotal
          />
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border px-1 pt-2 text-sm">
        <span className="text-foreground">Прогноз касаний</span>
        <span className="font-medium tabular-nums text-foreground">
          {touchesDisplay}
        </span>
      </div>

      <p className="mt-3 border-t border-border px-1 pt-3 text-xs leading-relaxed text-foreground">
        Вы сможете настроить подходящий бюджет при запуске кампании, если
        рекомендуемый вам не подходит
      </p>
    </div>
  );
}
