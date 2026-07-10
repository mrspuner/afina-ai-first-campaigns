import { describe, it, expect } from "vitest";
import { computeNodeSublabel } from "./node-sublabel";

describe("computeNodeSublabel", () => {
  it("wait → duration / until-event", () => {
    expect(computeNodeSublabel({ kind: "wait", mode: "duration", durationHours: 24 })).toBe("1 день");
    expect(computeNodeSublabel({ kind: "wait", mode: "duration", durationHours: 72 })).toBe("3 дня");
    expect(computeNodeSublabel({ kind: "wait", mode: "duration", durationHours: 2 })).toBe("2 ч");
    expect(computeNodeSublabel({ kind: "wait", mode: "until_event", untilEvent: "клик" })).toBe("До: клик");
  });
  it("condition → interaction label", () => {
    expect(computeNodeSublabel({ kind: "condition", trigger: "opened" })).toBe("Открыто");
    expect(computeNodeSublabel({ kind: "condition", trigger: "clicked" })).toBe("Кликнуто");
    expect(computeNodeSublabel({ kind: "condition", trigger: "delivered" })).toBe("Доставлено");
  });
  it("split → splitSummary", () => {
    expect(computeNodeSublabel({ kind: "split", by: "segment", branches: 4 })).toBe("По сегменту · 4 ветки");
  });
  it("ivr → scenario, success → goal, end → reason", () => {
    expect(computeNodeSublabel({ kind: "ivr", scenario: "Возврат", voiceType: "female" })).toBe("Возврат");
    expect(computeNodeSublabel({ kind: "success", goal: "Активация" })).toBe("Активация");
    expect(computeNodeSublabel({ kind: "end", reason: "Молчание" })).toBe("Молчание");
  });
  it("scoring → N interests · M triggers", () => {
    expect(
      computeNodeSublabel({ kind: "scoring", interests: ["a", "b"], triggers: ["t"], files: [] }),
    ).toBe("2 интереса · 1 триггер");
  });
  it("email → имя привязанного шаблона, «—» когда шаблон не выбран", () => {
    // 12c: подзаголовок канала — привязанный шаблон, а не его id.
    expect(
      computeNodeSublabel({
        kind: "email",
        subject: "S",
        body: "B",
        sender: "a@b.c",
        emailId: "eml_welcome",
      }),
    ).toBe("Приветственное — онбординг");
    expect(
      computeNodeSublabel({ kind: "email", subject: "S", body: "B", sender: "a@b.c" }),
    ).toBe("—");
  });
  it("sms/push → «—», statistics → placeholder", () => {
    expect(computeNodeSublabel({ kind: "sms", text: "hi", alphaName: "A", scheduledAt: "immediate" })).toBe("—");
    expect(computeNodeSublabel({ kind: "push", title: "T", body: "B" })).toBe("—");
    expect(computeNodeSublabel({ kind: "statistics" })).toBe("Результаты после запуска");
  });
});
