"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps } from "@/types/campaign";
import { CHANNELS, type Channel } from "@/types/campaign";
import { CHANNEL_LABEL, UNIT_COST } from "@/sections/campaigns/campaign-cost";
import { cn } from "@/lib/utils";

/** Pure selection toggle keeping channels in canonical CHANNELS order. */
export function toggleChannel(channels: Channel[], channel: Channel): Channel[] {
  const set = new Set(channels);
  if (set.has(channel)) set.delete(channel);
  else set.add(channel);
  return CHANNELS.filter((c) => set.has(c));
}

/** «5 ₽ / отправка», «0,5 ₽ / отправка» — стоимость канала за одну отправку из UNIT_COST. */
export function formatUnitCost(channel: Channel): string {
  const cost = UNIT_COST[channel];
  const rub = Number.isInteger(cost) ? String(cost) : String(cost).replace(".", ",");
  return `${rub} ₽ / отправка`;
}

export function StepChannels({
  data,
  onNext,
  onBack,
  onValueChange,
  footerOverride,
}: StepProps) {
  const [channels, setChannels] = useState<Channel[]>(data.channels);

  function toggle(channel: Channel) {
    // `onValueChange` уведомляет РОДИТЕЛЯ (изолированную сессию правки) —
    // вызывать его нужно из обработчика клика напрямую, а не из функционального
    // апдейтера `setChannels`: апдейтер выполняется React во время рендера
    // ЭТОГО компонента, и setState другого компонента оттуда — ошибка
    // "Cannot update a component while rendering a different component"
    // (проверено вживую в браузере при точечной правке шага «Каналы»).
    const next = toggleChannel(channels, channel);
    setChannels(next);
    onValueChange?.({ channels: next });
  }

  // Communication is mandatory here; signals-only is now path A at step 2.
  const canContinue = channels.length > 0;

  return (
    <StepContent
      title="Как будем общаться с аудиторией?"
      subtitle="Выберите каналы коммуникации."
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          {CHANNELS.map((channel) => {
            const selected = channels.includes(channel);
            return (
              <button
                key={channel}
                type="button"
                role="checkbox"
                aria-checked={selected}
                onClick={() => toggle(channel)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  selected
                    ? "border-brand/50 bg-brand-muted text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background"
                  )}
                >
                  {selected && <Check className="h-3 w-3" />}
                </span>
                <span className="flex flex-col">
                  <span>{CHANNEL_LABEL[channel]}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatUnitCost(channel)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {!footerOverride?.hidden && (
          <StepFooter
            onBack={onBack}
            onContinue={() => onNext({ channels })}
            continueLabel={footerOverride?.continueLabel ?? "Далее"}
            backLabel={footerOverride?.backLabel}
            continueDisabled={!canContinue}
          />
        )}
      </div>
    </StepContent>
  );
}
