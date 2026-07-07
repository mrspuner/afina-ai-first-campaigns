import { describe, it, expect } from "vitest";
import { isNodeQuestion } from "./node-prompt-intent";

describe("isNodeQuestion (#7 — офлайн-fallback: вопрос по ноде vs изменение)", () => {
  it("treats leading interrogatives as questions", () => {
    for (const q of [
      "Как работает эта нода?",
      "что делает условие",
      "почему тут задержка",
      "зачем нужен сплиттер",
      "какой шаблон сейчас выбран?",
      "сколько веток у сплиттера",
    ]) {
      expect(isNodeQuestion(q)).toBe(true);
    }
  });

  it("treats a trailing «?» as a question", () => {
    expect(isNodeQuestion("тут точно две ветки?")).toBe(true);
  });

  it("treats explicit change verbs as change requests", () => {
    for (const c of [
      "добавь ещё одну ветку",
      "поменяй текст покороче",
      "удали задержку",
      "сделай три ветки",
      "измени шаблон на акцию",
      "переименуй условие",
    ]) {
      expect(isNodeQuestion(c)).toBe(false);
    }
  });

  it("a change verb wins even with «?»", () => {
    expect(isNodeQuestion("можешь добавить ветку?")).toBe(false);
  });

  it("blank input is not a question", () => {
    expect(isNodeQuestion("   ")).toBe(false);
  });
});
