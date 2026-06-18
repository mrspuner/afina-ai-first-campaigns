"use client";

import { useState } from "react";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps } from "@/types/campaign";
import { SEGMENTS } from "@/sections/signals/segments-catalog";
import { cn } from "@/lib/utils";

export function Step3Segments({ data, onNext, onBack }: StepProps) {
  const [selected, setSelected] = useState<string[]>(data.segments);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  const canContinue = selected.length > 0;

  return (
    <StepContent
      title="Выберите сегменты сигнала"
      subtitle="Чем выше сегмент, тем свежее и точнее сигнал — и тем выше вероятность отклика при коммуникации и цена. Можно выбрать несколько"
    >
      <div className="flex flex-col gap-3">
        {SEGMENTS.map((seg) => {
          const isSelected = selected.includes(seg.id);
          return (
            <button
              key={seg.id}
              type="button"
              onClick={() => toggle(seg.id)}
              className={cn(
                "flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all",
                isSelected
                  ? "border-brand/50 bg-brand-muted"
                  : "border-border bg-card hover:bg-accent"
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    isSelected
                      ? "border-primary bg-primary"
                      : "border-border bg-background"
                  )}
                >
                  {isSelected && (
                    <svg
                      className="h-2.5 w-2.5 text-primary-foreground"
                      viewBox="0 0 10 10"
                      fill="none"
                    >
                      <path
                        d="M2 5l2.5 2.5L8 3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{seg.name}</p>
                  <p className="text-xs text-muted-foreground">{seg.description}</p>
                </div>
              </div>
              <span className="ml-4 shrink-0 text-sm font-medium text-foreground">
                ₽ {seg.price.toFixed(2)} / сигнал
              </span>
            </button>
          );
        })}

        <StepFooter
          onBack={onBack}
          onContinue={() => onNext({ segments: selected })}
          continueDisabled={!canContinue}
        />
      </div>
    </StepContent>
  );
}
