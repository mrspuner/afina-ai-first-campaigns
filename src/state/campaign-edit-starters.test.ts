import { describe, it, expect } from "vitest";
import { starterEditQuestions } from "./campaign-edit-starters";

describe("starterEditQuestions", () => {
  it("отдаёт ровно два вопроса — столько же, сколько просим у модели", () => {
    expect(starterEditQuestions()).toHaveLength(2);
  });

  it("у каждого вопроса есть текст и хотя бы два варианта", () => {
    for (const q of starterEditQuestions()) {
      expect(q.prompt.length).toBeGreaterThan(0);
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      for (const o of q.options) {
        expect(o.id).toBeTruthy();
        expect(o.label).toBeTruthy();
      }
    }
  });

  it("вопросы допускают свободный ввод — пользователь не заперт в вариантах", () => {
    for (const q of starterEditQuestions()) expect(q.allowFreeInput).toBe(true);
  });

  it("id опций уникальны внутри вопроса", () => {
    for (const q of starterEditQuestions()) {
      const ids = q.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
