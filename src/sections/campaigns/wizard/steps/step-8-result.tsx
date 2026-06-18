"use client";

import { Download, MessageCircle, RotateCcw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import type { Signal } from "@/state/app-state";

interface Step8ResultProps {
  signal: Signal | null;
  onUseInCampaign: () => void;
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

function formatExpiry(): string {
  // Prototype copy — typical horizon for B2C verticals is ~14 days.
  const days = 14;
  return `Актуальны ещё ${days} дней`;
}

export function Step8Result({ signal, onUseInCampaign }: Step8ResultProps) {
  const errorState = signal?.status === "error";
  const totalSignals = signal
    ? signal.segments.max +
      signal.segments.high +
      signal.segments.mid +
      signal.segments.low
    : 0;
  const zeroResult = !errorState && totalSignals === 0;

  function handleDownload() {
    // Prototype: this would emit a CSV from the backend.
    console.log("Download signals", signal?.id);
    window.alert(`Скачивание ${formatNumber(totalSignals)} сигналов (CSV) — в прототипе симулировано.`);
  }

  if (errorState) {
    return (
      <StepContent
        title="Что-то пошло не так при обработке"
        subtitle="Не удалось получить сигналы от провайдеров. Деньги возвращены на баланс."
      >
        <div className="flex flex-col gap-3">
          <Button onClick={onUseInCampaign} className="w-full gap-2">
            <RotateCcw className="h-4 w-4" />
            Попробовать снова
          </Button>
          <Button
            variant="outline"
            onClick={() => window.alert("Поддержка: support@afina.ai")}
            className="w-full gap-2"
          >
            <MessageCircle className="h-4 w-4" />
            Связаться с поддержкой
          </Button>
        </div>
      </StepContent>
    );
  }

  if (zeroResult) {
    return (
      <StepContent
        title="По вашей базе не найдено сигналов"
        subtitle="Возможно, аудитория неактивна сейчас, или подобраны слишком узкие триггеры. Деньги возвращены на баланс."
      >
        <div className="flex flex-col gap-3">
          <Button onClick={onUseInCampaign} className="w-full gap-2">
            Создать новый сигнал
          </Button>
        </div>
      </StepContent>
    );
  }

  return (
    <StepContent
      title="Сигналы готовы"
      subtitle={`Получены ${signal ? new Date(signal.updatedAt).toLocaleString("ru-RU") : "—"}`}
    >
      <div className="flex flex-col gap-5">
        {/* Main count */}
        <div className="rounded-lg border border-border bg-card px-6 py-5 text-center">
          <p className="text-4xl font-bold tabular-nums text-brand">
            {formatNumber(totalSignals)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">сигналов найдено</p>
          <p className="mt-2 text-xs text-muted-foreground">{formatExpiry()}</p>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button onClick={handleDownload} variant="outline" className="w-full gap-2">
            <Download className="h-4 w-4" />
            Скачать сигналы (CSV)
          </Button>
          <Button onClick={onUseInCampaign} className="w-full gap-2">
            <Zap className="h-4 w-4" />
            Использовать в кампании
          </Button>
        </div>
      </div>
    </StepContent>
  );
}
