/**
 * Подсказки, привязанные к активному trigger-тегу на шаге «Интересы и триггеры».
 *
 * Сами вопросы шагов wizard'а больше НЕ живут здесь: каждый экран wizard'а
 * объявляет свой набор через `useScreenHints` (см.
 * `sections/campaigns/wizard/steps/screen-hints.ts`). Остался только чип
 * «Проверить доступность доменов» — он зависит от активного trigger-тега в
 * баре (trigger-context scope), а не от того, какой экран открыт.
 */

import type { SuggestionItem } from "./types";

// Action chip: inserts its phrase into the bar, runs on confirm (see
// shell-bottom-bar pending-action handling). Shown ONLY when a specific
// trigger tag is active (trigger-context scope) — it checks/rebuilds the
// domains of that one trigger, so it makes no sense without a selected trigger.
const CHECK_DOMAINS: SuggestionItem = {
  id: "wiz-2-check-domains",
  label: "Проверить доступность доменов",
  action: { kind: "submit", phrase: "проверить доступность доменов" },
};

/** Подсказки при активном trigger-теге — только проверка доменов. */
export function resolveTriggerContext(): SuggestionItem[] {
  return [CHECK_DOMAINS];
}
