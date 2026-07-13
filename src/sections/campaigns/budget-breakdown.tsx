"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHANNEL_LABEL } from "@/sections/campaigns/campaign-cost";
import {
  buildChannelTable,
  type CommunicationGroups,
} from "@/sections/campaigns/communication-breakdown";

export interface BudgetBreakdownProps {
  /**
   * «Сигналы» amount, pre-formatted by the surface. This MERGES scoring +
   * signals into a single figure — the scoring term is hidden («магия скрыта»).
   * e.g. "бесплатно", "~₽ 2 500", "2 500 ₽".
   */
  signalsDisplay: string;
  /** «Коммуникации» total, pre-formatted by the surface. */
  communicationDisplay: string;
  /**
   * «Итого» = grand total (Сигналы + Коммуникации), pre-formatted by the surface.
   * With no communication it collapses to the Сигналы amount.
   */
  totalDisplay: string;
  /**
   * Per-channel «Первичные» / «Повторные» groups. When null or empty there is
   * NO communication — the «Коммуникации» row is omitted, but «Сигналы» and
   * «Итого» (= Сигналы) still render.
   */
  commGroups: CommunicationGroups | null;
  /** Formats a rouble cell inside the expanded table (per-surface ₽ convention). */
  formatCell: (n: number) => string;
  /** Extra surface-specific rows rendered after «Итого» (stream daily, max daily). */
  footer?: React.ReactNode;
  /** Start with «Коммуникации» expanded. Default collapsed (chevron ▸). */
  defaultExpanded?: boolean;
}

/**
 * Shared budget breakdown used identically by the wizard Бюджет step and the
 * campaign payment screen (DRY). Collapsed it shows «Сигналы» + a collapsible
 * «Коммуникации» row + «Итого»; expanding «Коммуникации» reveals a quiet
 * per-channel table (Канал | Первичные | Повторные | Итого). «Итого» is the
 * grand total — Сигналы contributes to it. With no communication the
 * «Коммуникации» row is omitted, but «Сигналы» and «Итого» (= Сигналы) remain.
 */
export function BudgetBreakdown({
  signalsDisplay,
  communicationDisplay,
  totalDisplay,
  commGroups,
  formatCell,
  footer,
  defaultExpanded = false,
}: BudgetBreakdownProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rows = commGroups ? buildChannelTable(commGroups) : [];
  const hasCommunication = rows.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {/* «Сигналы» — a normal contributing line: label left, amount right
          (scoring + signals merged). It feeds «Итого», never «уже оплачено». */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Сигналы</span>
        <span className="tabular-nums text-muted-foreground">
          {signalsDisplay}
        </span>
      </div>

      {hasCommunication && (
        <>
          {/* «Коммуникации» — collapsible row. Chevron sits right after the
              label (no left indent); total on the right. */}
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-[3px]"
          >
            <span className="flex items-center gap-1 text-muted-foreground">
              Коммуникации
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground/70 transition-transform",
                  expanded && "rotate-180"
                )}
              />
            </span>
            <span className="tabular-nums text-foreground">
              {communicationDisplay}
            </span>
          </button>

          {/* Expanded → a faint "appendix" table directly under the row: square
              top corners, rounded bottom, subtle top divider. */}
          {expanded && (
            <div className="mb-4 rounded-b-[7px] border-t border-white/[0.067] bg-white/[0.011] px-3 py-1.5">
              <p className="mb-2 text-[11px] leading-[1.5] text-muted-foreground">
                Первичные — первое касание по каждому получателю. Повторные —
                дополнительное касание тем, кто не отреагировал: обычно это заметно
                повышает отклик, их можно будет отключать при настройке кампании.
              </p>
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.02em] text-[#6f6f66]">
                    <th className="pb-1 text-left font-normal">Канал</th>
                    <th className="pb-1 pl-4 text-right font-normal">Первичные</th>
                    <th className="pb-1 pl-4 text-right font-normal">Повторные</th>
                    <th className="pb-1 pl-4 text-right font-normal">Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.channel} className="text-xs tabular-nums">
                      <td className="py-0.5 text-left text-foreground/80">
                        {CHANNEL_LABEL[r.channel]}
                      </td>
                      <td className="py-0.5 pl-4 text-right text-muted-foreground">
                        {formatCell(r.primary)}
                      </td>
                      <td className="py-0.5 pl-4 text-right text-muted-foreground">
                        {formatCell(r.repeat)}
                      </td>
                      <td className="py-0.5 pl-4 text-right text-foreground/90">
                        {formatCell(r.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* «Итого» — grand total (Сигналы + Коммуникации). Always renders; with no
          communication it equals «Сигналы». Stronger divider + bold label.
          Foreground (never yellow). */}
      <div
        className={cn(
          "flex items-center justify-between border-t border-border pt-3 text-sm font-semibold text-foreground",
          !expanded && "mt-1"
        )}
      >
        <span>Итого</span>
        <span className="tabular-nums">{totalDisplay}</span>
      </div>

      {footer}
    </div>
  );
}
