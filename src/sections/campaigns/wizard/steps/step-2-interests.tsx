"use client";

import { useState } from "react";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps } from "@/types/campaign";
import {
  InterestsTriggersEditor,
  type InterestsTriggersEditorSelection,
} from "@/sections/campaigns/wizard/steps/interests-triggers-editor";
import { useScreenHints } from "@/hooks/use-screen-hints";
import { interestsScreenHints } from "./screen-hints";

/**
 * Wizard step «Интересы и триггеры». Thin wrapper around the shared
 * {@link InterestsTriggersEditor} — the exact same editor the scoring node's
 * «Афина ИИ» drawer renders — plus the wizard chrome (typewriter title +
 * «Продолжить» footer) and the co-located PromptBar hints. Keeping the editor
 * shared means the wizard and the drawer are visually + functionally identical.
 */
export function Step2Interests({ data, onNext, active }: StepProps) {
  // Mirror of the editor's current selection (LABELS), kept fresh via onChange
  // so the footer can gate «Продолжить» and `handleContinue` can serialize the
  // selection into StepData for downstream steps.
  const [selection, setSelection] = useState<InterestsTriggersEditorSelection>({
    interests: [],
    triggers: [],
    triggerConfig: {},
  });

  const hasInterest = selection.interests.length > 0;
  const canContinue = hasInterest || selection.triggers.length > 0;

  // Co-located PromptBar questions: the branch tracks what's actually selected
  // on THIS screen (hasDomains ≈ has triggers — triggers carry the domains),
  // computed live from the editor's selection. Only the active step publishes.
  useScreenHints(
    active
      ? interestsScreenHints({
          hasInterests: hasInterest,
          hasDomains: selection.triggers.length > 0,
        })
      : null
  );

  function handleContinue() {
    onNext({
      interests: selection.interests,
      triggers: selection.triggers,
      triggerConfig: selection.triggerConfig,
    });
  }

  return (
    <StepContent
      title="Какие интересы и триггеры вы ищете?"
      subtitle="Мы уже сгенерили настройки под вас — выберите интересы и триггеры в любом порядке."
    >
      <div className="flex flex-col gap-6">
        <InterestsTriggersEditor
          initialInterestIds={data.interests}
          initialTriggerIds={data.triggers}
          seedWhenEmpty
          enableRemix
          onChange={setSelection}
        />

        <StepFooter
          onContinue={handleContinue}
          continueDisabled={!canContinue}
          hint="Если нужного нет в списке — напишите в поле чата"
        />
      </div>
    </StepContent>
  );
}
