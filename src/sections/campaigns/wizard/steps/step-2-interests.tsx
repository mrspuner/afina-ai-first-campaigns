"use client";

import { useMemo, useState } from "react";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps } from "@/types/campaign";
import {
  InterestsTriggersEditor,
  resolveSelectionIds,
  type InterestsTriggersEditorSelection,
} from "@/sections/campaigns/wizard/steps/interests-triggers-editor";
import { useAppState } from "@/state/app-state-context";
import { useScreenHints } from "@/hooks/use-screen-hints";
import { interestsScreenHints } from "./screen-hints";

/**
 * Wizard step «Интересы и триггеры». Thin wrapper around the shared
 * {@link InterestsTriggersEditor} — the exact same editor the scoring node's
 * «Афина ИИ» drawer renders — plus the wizard chrome (typewriter title +
 * «Продолжить» footer) and the co-located PromptBar hints. Keeping the editor
 * shared means the wizard and the drawer are visually + functionally identical.
 */
export function Step2Interests({
  data,
  onNext,
  onBack,
  active,
  footerOverride,
}: StepProps) {
  const { clientDirection } = useAppState();

  // `data.interests`/`data.triggers` are LABEL arrays (the `StepData`
  // convention — see the doc comment on `StepData.triggerConfig`), but the
  // editor's `initial*Ids` props expect internal ids. Resolve once per mount
  // via the SAME helper `ScoringInterestsPanel` (the graph node's «Афина ИИ»
  // drawer) uses for the identical seeding problem — without it, an isolated
  // edit session hydrated from a real campaign snapshot showed zero
  // selections, and applying anything silently replaced the campaign's real
  // targeting instead of merging into it (`triggerConfig` was unaffected: it
  // is keyed by trigger id on both sides already).
  const initialIds = useMemo(
    () =>
      resolveSelectionIds(clientDirection, {
        interests: data.interests,
        triggers: data.triggers,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

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
      subtitle="Мы уже сгенерили настройки под вас — выберите интересы и триггеры в любом порядке. Если нужного нет в списке — напишите в поле чата."
    >
      <div className="flex flex-col gap-6">
        <InterestsTriggersEditor
          initialInterestIds={initialIds.interestIds}
          initialTriggerIds={initialIds.triggerIds}
          initialDeltas={data.triggerConfig}
          seedWhenEmpty
          enableRemix
          onChange={setSelection}
        />

        {!footerOverride?.hidden && (
          <StepFooter
            onBack={onBack}
            onContinue={handleContinue}
            continueLabel={footerOverride?.continueLabel}
            backLabel={footerOverride?.backLabel}
            continueDisabled={!canContinue}
          />
        )}
      </div>
    </StepContent>
  );
}
