"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps } from "@/types/campaign";
import { CHANNELS, type Channel } from "@/types/campaign";
import { CHANNEL_LABEL } from "@/sections/campaigns/campaign-cost";
import { cn } from "@/lib/utils";

/** Pure selection toggle keeping channels in canonical CHANNELS order. */
export function toggleChannel(channels: Channel[], channel: Channel): Channel[] {
  const set = new Set(channels);
  if (set.has(channel)) set.delete(channel);
  else set.add(channel);
  return CHANNELS.filter((c) => set.has(c));
}

export function StepChannels({ data, onNext, onBack }: StepProps) {
  const [channels, setChannels] = useState<Channel[]>(data.channels);
  // "Без коммуникации" — explicit degenerate-campaign choice (empty channels).
  const [noComms, setNoComms] = useState(false);

  function toggle(channel: Channel) {
    setNoComms(false);
    setChannels((prev) => toggleChannel(prev, channel));
  }

  function selectNoComms() {
    setNoComms(true);
    setChannels([]);
  }

  // Continue is always valid: a channel set OR an explicit "no communication".
  const canContinue = channels.length > 0 || noComms;

  return (
    <StepContent
      title="Как будем общаться с аудиторией?"
      subtitle="Выберите каналы коммуникации — или запустите кампанию без неё."
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
                {CHANNEL_LABEL[channel]}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-pressed={noComms}
          onClick={selectNoComms}
          className={cn(
            "flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            noComms
              ? "border-brand/50 bg-brand-muted text-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-3 w-3 shrink-0 rounded-full border-2 transition-colors",
              noComms ? "border-foreground bg-foreground" : "border-border"
            )}
          />
          Не проводить коммуникацию
        </button>

        <StepFooter
          onBack={onBack}
          onContinue={() => onNext({ channels })}
          continueLabel="Далее"
          continueDisabled={!canContinue}
        />
      </div>
    </StepContent>
  );
}
