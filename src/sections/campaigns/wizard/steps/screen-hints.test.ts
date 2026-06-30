import { describe, it, expect } from "vitest";
import {
  SCENARIO_SCREEN_HINTS,
  FILE_SCREEN_HINTS,
  BUDGET_SCREEN_HINTS,
  interestsScreenHints,
} from "./screen-hints";
import type { SuggestionItem } from "@/state/suggestion-registry";

function ids(items: SuggestionItem[]): string[] {
  return items.map((i) => i.id);
}

describe("wizard screen-hints — содержимое (мигрировано из central map)", () => {
  it("Сценарий → два ask-вопроса (разница + что выбрать)", () => {
    expect(SCENARIO_SCREEN_HINTS).toHaveLength(2);
    expect(SCENARIO_SCREEN_HINTS.every((i) => i.action.kind === "ask")).toBe(true);
    expect(ids(SCENARIO_SCREEN_HINTS)).toEqual(["wiz-1-diff", "wiz-1-which"]);
  });

  it("База → вопросы про формат/поля/нет базы", () => {
    expect(BUDGET_SCREEN_HINTS).not.toBe(FILE_SCREEN_HINTS);
    expect(ids(FILE_SCREEN_HINTS)).toEqual([
      "wiz-3-format",
      "wiz-3-required-fields",
      "wiz-3-no-base",
    ]);
    expect(FILE_SCREEN_HINTS.every((i) => i.action.kind === "ask")).toBe(true);
  });

  it("Бюджет → три вопроса про бюджет (все ask, без dispatch)", () => {
    expect(BUDGET_SCREEN_HINTS.every((i) => i.action.kind === "ask")).toBe(true);
    expect(ids(BUDGET_SCREEN_HINTS)).toEqual([
      "wiz-5-budget-why",
      "wiz-5-budget-conservative",
      "wiz-5-budget-aggressive",
    ]);
  });
});

describe("interestsScreenHints — ветвление по выбранному на экране", () => {
  it("пусто-пусто → 3 стартовых вопроса", () => {
    const r = interestsScreenHints({ hasInterests: false, hasDomains: false });
    expect(r.every((i) => i.action.kind === "ask")).toBe(true);
    expect(r.some((i) => i.id === "wiz-2-where-start")).toBe(true);
    // never includes the trigger-context-only domain-check chip
    expect(r.some((i) => i.id === "wiz-2-check-domains")).toBe(false);
  });

  it("интересы + домены → сужение/расширение/качество", () => {
    const r = interestsScreenHints({ hasInterests: true, hasDomains: true });
    expect(r.some((i) => i.id === "wiz-2-narrow-q")).toBe(true);
    expect(r.some((i) => i.id === "wiz-2-widen-q")).toBe(true);
    expect(r.some((i) => i.id === "wiz-2-quality")).toBe(true);
  });

  it("только интересы → 'Зачем триггеры?'", () => {
    const r = interestsScreenHints({ hasInterests: true, hasDomains: false });
    expect(r.some((i) => i.id === "wiz-2-need-trigger")).toBe(true);
  });

  it("только домены (триггеры) → 'Зачем интересы?'", () => {
    const r = interestsScreenHints({ hasInterests: false, hasDomains: true });
    expect(r.some((i) => i.id === "wiz-2-need-interests")).toBe(true);
  });
});
