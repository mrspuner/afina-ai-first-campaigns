/**
 * Co-located PromptBar suggestion sets for the campaign-wizard screens.
 *
 * Each wizard step that wants hints publishes its set via {@link useScreenHints}
 * (see the step components). Keeping the content next to the steps — instead of
 * a central `step → hints` map keyed by a numeric index — means a redesigned or
 * reordered step keeps the right hints automatically. The old map drifted: the
 * wizard is source-gated (the same screen sits at different indices per source),
 * so a fixed index→hints table showed the wrong questions on most screens.
 *
 * In this "wizard = questions" model every chip is an `ask`: it drops the
 * question into the section chat-history and pulls Афина's answer. Ids/labels/
 * prompts are stable — `informational-replies` cross-checks each prompt against
 * its reply entry, and the e2e/visual baselines assert the rendered labels.
 *
 * Screens that intentionally declare NO hints (source / channels / integration)
 * simply don't call the hook — better an empty suggestion area than the wrong
 * questions. Real copy for them can be added later as its own change.
 */

import type { SuggestionItem } from "@/state/suggestion-registry";

function ask(id: string, label: string, prompt: string): SuggestionItem {
  return { id, label, action: { kind: "ask", prompt } };
}

// ─── Шаг «Сценарий» ─────────────────────────────────────────────────────────
export const SCENARIO_SCREEN_HINTS: SuggestionItem[] = [
  ask(
    "wiz-1-diff",
    "В чём разница между категориями?",
    "В чём разница между категориями сценариев? Кратко по каждой."
  ),
  ask(
    "wiz-1-which",
    "Какую мне сейчас выбрать?",
    "Какую категорию сценария мне стоит выбрать в моей ситуации?"
  ),
];

// ─── Шаг «Интересы и триггеры» ──────────────────────────────────────────────
// Branches by what the user has actually selected on THIS screen — computed
// from the step's local state, so the questions track the real screen (the
// drift the old lost-snapshot path could not). `hasDomains` ≈ "has triggers"
// (triggers carry the domains).
export function interestsScreenHints(s: {
  hasInterests: boolean;
  hasDomains: boolean;
}): SuggestionItem[] {
  if (!s.hasInterests && !s.hasDomains) {
    return [
      ask("wiz-2-where-start", "С чего начать?", "С чего лучше начать настраивать интересы и триггеры?"),
      ask("wiz-2-where-take", "Откуда вы берёте интересы?", "Откуда вы берёте интересы — что подсказывает AI?"),
      ask("wiz-2-what-trigger", "Что такое триггер?", "Что такое триггер и чем он отличается от интереса?"),
    ];
  }

  if (s.hasInterests && s.hasDomains) {
    return [
      ask("wiz-2-narrow-q", "Стоит ли сузить набор?", "Мне сузить набор интересов и триггеров?"),
      ask("wiz-2-widen-q", "Можно ли расширить охват?", "Стоит ли мне расширить охват — добавить интересы и триггеры?"),
      ask("wiz-2-quality", "Этот набор подойдёт?", "Подойдёт ли мне такой набор интересов и триггеров?"),
    ];
  }

  if (s.hasInterests) {
    return [
      ask("wiz-2-need-trigger", "Зачем триггеры?", "Зачем добавлять триггеры, если интересы уже есть?"),
      ask("wiz-2-which-domains", "Какие домены выбрать?", "Какие домены стоит добавить как триггеры?"),
      ask("wiz-2-without-trigger", "Можно ли без триггеров?", "Можно ли запустить сигнал без доменов-триггеров?"),
    ];
  }

  return [
    ask("wiz-2-need-interests", "Зачем интересы?", "Зачем добавлять интересы, если домены уже выбраны?"),
    ask("wiz-2-which-interests", "Какие интересы подойдут?", "Какие интересы подойдут к моим триггерам?"),
    ask("wiz-2-overlap", "Не пересекаются ли они?", "Не будут ли интересы пересекаться с моими доменами?"),
  ];
}

// ─── Шаг «База» (загрузка файла) ────────────────────────────────────────────
export const FILE_SCREEN_HINTS: SuggestionItem[] = [
  ask("wiz-3-format", "Какие форматы базы?", "Какие форматы файлов с базой вы принимаете?"),
  ask("wiz-3-required-fields", "Какие поля обязательны?", "Какие поля должны быть в файле базы?"),
  ask("wiz-3-no-base", "А если базы нет?", "Что делать, если у меня пока нет базы клиентов?"),
];

// ─── Шаг «Бюджет» ───────────────────────────────────────────────────────────
export const BUDGET_SCREEN_HINTS: SuggestionItem[] = [
  ask("wiz-5-budget-why", "Как рассчитывается бюджет?", "Как рассчитывается рекомендуемый бюджет?"),
  ask("wiz-5-budget-conservative", "Можно поменьше?", "Что будет, если я поставлю бюджет меньше рекомендуемого?"),
  ask("wiz-5-budget-aggressive", "Можно побольше?", "Имеет ли смысл ставить бюджет больше рекомендуемого?"),
];
