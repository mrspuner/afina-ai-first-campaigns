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
        "condition", "email", "end", "ivr", "scoring",
        "push", "signal", "split", "sms", "success", "wait",
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

  it("Block 7 §1 — channel component fields move into the template (removed from the node)", () => {
    expect(getFieldMeta("sms", "Alpha-name")).toBeUndefined();
    expect(getFieldMeta("sms", "Ссылка")).toBeUndefined();
    expect(getFieldMeta("email", "Тема")).toBeUndefined();
    expect(getFieldMeta("email", "Отправитель")).toBeUndefined();
    expect(getFieldMeta("email", "Ссылка")).toBeUndefined();
    expect(getFieldMeta("push", "Deeplink")).toBeUndefined();
    expect(getFieldMeta("ivr", "Голос")).toBeUndefined();
  });

  it("Block 7 §1 — SMS «Время» is a send-time combo (timepicker)", () => {
    const m = getFieldMeta("sms", "Время");
    expect(m?.control).toBe("combo");
    expect(m?.optionsKey).toBe("smsTime");
  });

  it("Block 7 §3 — wait/condition «Событие» pull from the shared event catalog", () => {
    expect(getFieldMeta("condition", "Триггер")).toBeUndefined();
    const cond = getFieldMeta("condition", "Событие");
    expect(cond?.control).toBe("combo");
    expect(cond?.optionsKey).toBe("eventCatalog");
    const wait = getFieldMeta("wait", "Событие");
    expect(wait?.control).toBe("combo");
    expect(wait?.optionsKey).toBe("eventCatalog");
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
    const combo = getFieldMeta("ivr", "Текст");
    expect(combo?.control).toBe("combo");
    expect(combo?.optionsKey).toBe("ivrScenario");
    expect(getFieldMeta("success", "Цель")?.control).toBe("combo");
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
