"use client";

import { useState } from "react";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps } from "@/types/campaign";
import { useAppState } from "@/state/app-state-context";
import { VERTICALS, getInterestById } from "@/data/triggers-by-vertical";
import { getInterestsForDirection } from "@/data/interests-by-direction";
import type { Interest, Vertical } from "@/types/directions";
import { cn } from "@/lib/utils";

function directionToVerticalId(direction: string): string {
  if (direction === "medicine") return "health";
  return direction;
}

export function resolveVertical(direction: string): Vertical {
  const id = directionToVerticalId(direction);
  return VERTICALS.find((v) => v.id === id) ?? VERTICALS[0];
}

export function resolveInterests(direction: string, vertical: Vertical): Interest[] {
  const curated = getInterestsForDirection(direction)
    .map((id) => getInterestById(id))
    .filter((i): i is Interest => i !== undefined);
  if (curated.length > 0) return curated;
  return vertical.interests;
}

export function StepInterests({ data, onNext, onBack }: StepProps) {
  const { clientDirection } = useAppState();
  const vertical = resolveVertical(clientDirection);
  const interestsForDirection = resolveInterests(clientDirection, vertical);

  const [selectedInterests, setSelectedInterests] = useState<string[]>(
    data.interests
  );

  function toggleInterest(label: string) {
    setSelectedInterests((prev) =>
      prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label]
    );
  }

  return (
    <StepContent
      title="Интересы аудитории"
      subtitle="Уточните, что ищут люди — так мы соберём более горячий сегмент."
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-2">
          {interestsForDirection.map((interest) => {
            const selected = selectedInterests.includes(interest.label);
            return (
              <button
                key={interest.id}
                type="button"
                onClick={() => toggleInterest(interest.label)}
                aria-pressed={selected}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm transition-all",
                  selected
                    ? "border-brand/50 bg-brand-muted text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {interest.label}
              </button>
            );
          })}
        </div>

        <StepFooter
          onBack={onBack}
          onContinue={() => onNext({ interests: selectedInterests })}
          continueLabel="Далее"
        />
      </div>
    </StepContent>
  );
}
