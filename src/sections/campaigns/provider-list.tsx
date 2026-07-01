"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PROVIDERS, type Provider, type ProviderStage } from "@/data/providers";
import { cn } from "@/lib/utils";
import {
  providerSignalsPerDay,
  connectedSignalsPerDay,
} from "./campaign-progress";

/**
 * Animated data-provider status list shown inside the «Обработка базы» /
 * «Обработка и коммуникация» stage of the campaign progress stepper. On mount
 * each provider with a `connectAfterMs` timer walks Подключение → Премодерация →
 * Подключён; stuck providers (Tele2) freeze on `stuckStage`. Only the status
 * text and dot change — no layout shifts.
 *
 * Per-provider «~N сигналов/день» is a deterministic, seeded estimate keyed by
 * `campaignId` (never Math.random). When `showSummary` is set (streaming) a
 * running total across the connected providers is appended.
 */
export function ProviderList({
  campaignId,
  showSummary = false,
}: {
  campaignId: string;
  showSummary?: boolean;
}) {
  const [stages, setStages] = useState<Record<string, ProviderStage>>(() =>
    Object.fromEntries(PROVIDERS.map((p) => [p.id, "Подключение" as ProviderStage]))
  );

  const timeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    const timeouts = timeoutsRef.current;

    for (const p of PROVIDERS) {
      if (p.connectAfterMs === null) {
        if (p.stuckStage && p.stuckStage !== "Подключение") {
          // Move stuck providers off "Подключение" to their stuck stage so
          // they read as "in progress" rather than "untouched".
          const halfway = setTimeout(() => {
            setStages((prev) => ({ ...prev, [p.id]: p.stuckStage! }));
          }, 800);
          timeouts.push(halfway);
        }
        continue;
      }
      // Premoderation kicks in at ~40% of the connect duration.
      const premoderationAt = Math.max(400, Math.round(p.connectAfterMs * 0.4));
      const t1 = setTimeout(() => {
        setStages((prev) => ({ ...prev, [p.id]: "Премодерация" }));
      }, premoderationAt);
      const t2 = setTimeout(() => {
        setStages((prev) => ({ ...prev, [p.id]: "Подключён" }));
      }, p.connectAfterMs);
      timeouts.push(t1, t2);
    }

    return () => {
      for (const t of timeouts) clearTimeout(t);
      timeoutsRef.current = [];
    };
    // PROVIDERS is module-level; intentionally run once.
  }, []);

  const connectedIds = useMemo(
    () => PROVIDERS.filter((p) => stages[p.id] === "Подключён").map((p) => p.id),
    [stages]
  );
  const summaryTotal = connectedSignalsPerDay(campaignId, connectedIds);

  return (
    <div className="flex flex-col">
      {PROVIDERS.map((p) => (
        <ProviderRow
          key={p.id}
          provider={p}
          stage={stages[p.id] ?? "Подключение"}
          signalsPerDay={providerSignalsPerDay(campaignId, p.id)}
        />
      ))}
      {showSummary && (
        <div className="flex items-center justify-between border-t border-border/40 pt-2.5 text-sm">
          <span className="text-muted-foreground">Суммарно</span>
          <span className="tabular-nums text-foreground/90">
            ≈ {formatNumber(summaryTotal)} сигналов/день
          </span>
        </div>
      )}
    </div>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

function ProviderRow({
  provider,
  stage,
  signalsPerDay,
}: {
  provider: Provider;
  stage: ProviderStage;
  signalsPerDay: number;
}) {
  const connected = stage === "Подключён";
  const statusText = connected
    ? `подключено · ~${formatNumber(signalsPerDay)} сигналов/день`
    : "ожидание подключения";

  return (
    <div className="flex items-center gap-3 border-t border-border/40 py-2.5 text-sm first:border-t-0">
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          connected ? "bg-emerald-500" : "border border-muted-foreground/60"
        )}
        aria-hidden
      />
      <span className="w-20 shrink-0 font-medium text-foreground">{provider.name}</span>
      <span className="tabular-nums text-muted-foreground">{statusText}</span>
    </div>
  );
}
