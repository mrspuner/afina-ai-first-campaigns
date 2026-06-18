"use client";

import { useEffect, useMemo } from "react";
import { Check, CircleDashed, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import type { StepData } from "@/types/campaign";
import type { Signal } from "@/state/app-state";

interface Step7ProcessingProps {
  data: StepData;
  signal: Signal | null;
  /** Called when this signal flips out of "processing" — workspace advances. */
  onAdvance: () => void;
}

const STEPS: Array<{ id: string; label: string }> = [
  { id: "uploaded", label: "База загружена и проверена" },
  { id: "sent", label: "Отправлено провайдерам" },
  { id: "processing", label: "Идёт обработка" },
  { id: "ready", label: "Сигналы готовы" },
];

function formatRub(amount: number): string {
  return `₽ ${amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function Step7Processing({ data, signal, onAdvance }: Step7ProcessingProps) {
  const status = signal?.status ?? "processing";

  // Auto-advance once the signal flips to "ready". Safe to revisit:
  // remounting at this step won't re-trigger advance because the parent
  // already moved on.
  useEffect(() => {
    if (status === "ready") onAdvance();
  }, [status, onAdvance]);

  // The 4-step progress visualization.
  const activeIndex = useMemo(() => {
    switch (status) {
      case "awaiting_payment":
        // No payment yet → first step done, second pending.
        return 0;
      case "processing":
        return 2;
      case "ready":
        return 4;
      case "error":
        return 2;
      default:
        return 1;
    }
  }, [status]);

  const supportClick = () => window.alert("Поддержка: support@afina.ai");

  return (
    <StepContent
      title="Ваша база обрабатывается"
      subtitle="Обычно занимает несколько часов. Можно закрыть вкладку — мы пришлём уведомление, как только сигналы будут готовы."
    >
      <div className="flex flex-col gap-5">
        {/* Step-by-step progress */}
        <ol className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-5">
          {STEPS.map((s, idx) => {
            const done = idx < activeIndex;
            const active = idx === activeIndex;
            return (
              <li key={s.id} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                  {done ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin text-foreground" />
                  ) : (
                    <CircleDashed className="h-4 w-4 text-muted-foreground/60" />
                  )}
                </span>
                <span
                  className={
                    done
                      ? "text-sm text-muted-foreground line-through decoration-muted-foreground/30"
                      : active
                      ? "text-sm font-medium text-foreground"
                      : "text-sm text-muted-foreground"
                  }
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Signal info — duplicated from summary for context on revisit. */}
        {signal && (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Сигнал
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {signal.type} · {formatNumber(signal.count)}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <dt>Стоимость</dt>
              <dd className="text-right tabular-nums text-foreground">
                {formatRub(data.budget ?? 0)}
              </dd>
              <dt>Запущен</dt>
              <dd className="text-right tabular-nums text-foreground">
                {new Date(signal.createdAt).toLocaleDateString("ru-RU")}
              </dd>
              <dt>Файл</dt>
              <dd className="text-right text-foreground">
                {data.file?.name ?? "—"}
              </dd>
            </dl>
          </div>
        )}

        <div className="flex items-center justify-start">
          <Button
            variant="outline"
            onClick={supportClick}
            className="gap-2"
          >
            <MessageCircle className="h-4 w-4" />
            Связаться с поддержкой
          </Button>
        </div>
      </div>
    </StepContent>
  );
}
