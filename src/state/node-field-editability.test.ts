import { describe, expect, it } from "vitest";
import {
  NODE_FIELD_EDITABILITY,
  getFieldMeta,
} from "./node-field-editability";

describe("NODE_FIELD_EDITABILITY", () => {
  it("covers every node kind that has params", () => {
    const kinds = Object.keys(NODE_FIELD_EDITABILITY).sort();
    expect(kinds).toEqual(
      [
        "condition", "email", "end", "ivr", "landing", "merge", "scoring",
        "push", "signal", "split", "sms", "storefront", "success", "wait",
      ].sort()
    );
  });

  it("uses only the three editability categories", () => {
    for (const fields of Object.values(NODE_FIELD_EDITABILITY)) {
      for (const meta of Object.values(fields)) {
        expect(["manual", "ai", "readonly"]).toContain(meta.editability);
      }
    }
  });

  it("every manual field carries a paramKey for inline editing", () => {
    for (const fields of Object.values(NODE_FIELD_EDITABILITY)) {
      for (const meta of Object.values(fields)) {
        if (meta.editability === "manual") {
          expect(typeof meta.paramKey).toBe("string");
        }
      }
    }
  });

  it("classifies sms link as ai", () => {
    expect(getFieldMeta("sms", "Ссылка")?.editability).toBe("ai");
  });

  it("communication nodes expose «Шаблон» instead of free Текст/Заголовок (aim #10)", () => {
    expect(getFieldMeta("sms", "Шаблон")?.control).toBe("template");
    expect(getFieldMeta("email", "Шаблон")?.control).toBe("template");
    expect(getFieldMeta("push", "Шаблон")?.control).toBe("template");
    // free text fields removed
    expect(getFieldMeta("sms", "Текст")).toBeUndefined();
    expect(getFieldMeta("email", "Текст")).toBeUndefined();
    expect(getFieldMeta("push", "Текст")).toBeUndefined();
    expect(getFieldMeta("push", "Заголовок")).toBeUndefined();
  });

  it("«Шаблон» field is manual but carries no combo optionsKey", () => {
    const m = getFieldMeta("sms", "Шаблон");
    expect(m?.editability).toBe("manual");
    expect(m?.optionsKey).toBeUndefined();
  });

  it("classifies signal fields as readonly", () => {
    expect(getFieldMeta("signal", "Файл")?.editability).toBe("readonly");
  });

  it("returns undefined for an unknown field", () => {
    expect(getFieldMeta("sms", "Неизвестно")).toBeUndefined();
  });

  it("gives former-manual fields a combo control with an optionsKey", () => {
    const combo = getFieldMeta("ivr", "Сценарий");
    expect(combo?.control).toBe("combo");
    expect(combo?.optionsKey).toBe("ivrScenario");
    expect(getFieldMeta("landing", "Оффер")?.control).toBe("combo");
  });

  it("keeps the email subject as a normal combo", () => {
    // Email body free field is gone (aim #10) — only «Тема» stays a combo.
    expect(getFieldMeta("email", "Тема")?.control).toBe("combo");
  });

  it("leaves ai fields without a combo control", () => {
    expect(getFieldMeta("sms", "Ссылка")?.control).toBeUndefined();
  });

  it("every combo field carries an optionsKey", () => {
    for (const fields of Object.values(NODE_FIELD_EDITABILITY)) {
      for (const meta of Object.values(fields)) {
        if (meta.control === "combo") {
          expect(typeof meta.optionsKey).toBe("string");
        }
      }
    }
  });
});
