import { describe, it, expect } from "vitest";
import { computeNodeSublabel, computeSublabels, conditionBranchLabel, conditionQuestionLabel } from "./node-sublabel";
import type { NodeParams, WorkflowNode } from "@/types/workflow";

describe("computeNodeSublabel", () => {
  it("wait → duration / until-event", () => {
    expect(computeNodeSublabel({ kind: "wait", mode: "duration", durationHours: 24 })).toBe("1 день");
    expect(computeNodeSublabel({ kind: "wait", mode: "duration", durationHours: 72 })).toBe("3 дня");
    expect(computeNodeSublabel({ kind: "wait", mode: "duration", durationHours: 2 })).toBe("2 ч");
    expect(computeNodeSublabel({ kind: "wait", mode: "until_event", untilEvent: "клик" })).toBe("До: клик");
  });

  // fix round 1, Finding 1 (extended): найдено при проверке фикса пилюли/поля
  // — это мини-превью графа рендерится на той же карточке кампании, и без
  // недельной ветки 840ч читались бы «35 дней» здесь, третьим несогласованным
  // значением рядом с уже исправленными пилюлей и полем.
  it("wait → duration кратна неделе — «N недель», не «N*7 дней»", () => {
    expect(computeNodeSublabel({ kind: "wait", mode: "duration", durationHours: 168 })).toBe("1 неделя");
    expect(computeNodeSublabel({ kind: "wait", mode: "duration", durationHours: 336 })).toBe("2 недели");
    expect(computeNodeSublabel({ kind: "wait", mode: "duration", durationHours: 840 })).toBe("5 недель");
    expect(computeNodeSublabel({ kind: "wait", mode: "duration", durationHours: 840 })).not.toBe("35 дней");
  });
  it("condition → interaction label", () => {
    expect(computeNodeSublabel({ kind: "condition", trigger: "opened" })).toBe("Открыто");
    expect(computeNodeSublabel({ kind: "condition", trigger: "clicked" })).toBe("Кликнуто");
    expect(computeNodeSublabel({ kind: "condition", trigger: "delivered" })).toBe("Доставлено");
  });
  it("split → splitSummary", () => {
    expect(computeNodeSublabel({ kind: "split", by: "segment", branches: 4 })).toBe("По сегменту · 4 ветки");
  });
  it("success → goal, end → reason", () => {
    expect(computeNodeSublabel({ kind: "success", goal: "Активация" })).toBe("Активация");
    expect(computeNodeSublabel({ kind: "end", reason: "Молчание" })).toBe("Молчание");
  });
  it("scoring → N interests · M triggers", () => {
    expect(
      computeNodeSublabel({ kind: "scoring", interests: ["a", "b"], triggers: ["t"], files: [] }),
    ).toBe("2 интереса · 1 триггер");
  });
  // Коммуникационные ноды (все 4 канала) подзаголовка не имеют — заголовка
  // канала достаточно, «—» и имя шаблона только шумели.
  it("каналы sms/push/email/ivr → без подзаголовка (null)", () => {
    expect(computeNodeSublabel({ kind: "sms", text: "hi", alphaName: "A", scheduledAt: "immediate" })).toBeNull();
    expect(computeNodeSublabel({ kind: "push", title: "T", body: "B" })).toBeNull();
    expect(computeNodeSublabel({ kind: "ivr", scenario: "Возврат", voiceType: "female" })).toBeNull();
    expect(
      computeNodeSublabel({
        kind: "email",
        subject: "S",
        body: "B",
        sender: "a@b.c",
        emailId: "eml_welcome",
      }),
    ).toBeNull();
    expect(
      computeNodeSublabel({ kind: "email", subject: "S", body: "B", sender: "a@b.c" }),
    ).toBeNull();
  });
});

describe("computeSublabels", () => {
  const node = (params: NodeParams, sublabel?: string): WorkflowNode => ({
    id: "n1",
    type: "workflowNode",
    position: { x: 0, y: 0 },
    data: { label: "L", nodeType: params.kind as WorkflowNode["data"]["nodeType"], params, sublabel },
  });

  it("null очищает ранее выставленный подзаголовок (канал)", () => {
    const [out] = computeSublabels([
      node({ kind: "sms", text: "hi", alphaName: "A", scheduledAt: "immediate" }, "—"),
    ]);
    expect(out.data.sublabel).toBeUndefined();
  });

  it("не трогает ноду, если подзаголовок уже отсутствует", () => {
    const input = [node({ kind: "push", title: "T", body: "B" })];
    const [out] = computeSublabels(input);
    expect(out).toBe(input[0]);
  });

  it("выставляет подзаголовок из контента", () => {
    const [out] = computeSublabels([node({ kind: "split", by: "segment", branches: 4 })]);
    expect(out.data.sublabel).toBe("По сегменту · 4 ветки");
  });
});

describe("conditionBranchLabel", () => {
  it("даёт человеческую пару для известных событий", () => {
    expect(conditionBranchLabel("opened", true)).toBe("Открыл письмо");
    expect(conditionBranchLabel("opened", false)).toBe("Не открыл письмо");
    expect(conditionBranchLabel("clicked", true)).toBe("Нажал ссылку");
    expect(conditionBranchLabel("clicked", false)).toBe("Не нажал ссылку");
  });

  it("инвертированное событие меняет пару местами", () => {
    expect(conditionBranchLabel("not_opened", true)).toBe("Не открыл письмо");
    expect(conditionBranchLabel("not_opened", false)).toBe("Открыл письмо");
  });

  it("произвольное событие справочника: ДА — как есть, НЕТ — «Иначе»", () => {
    expect(conditionBranchLabel("Заявка оформлена", true)).toBe("Заявка оформлена");
    expect(conditionBranchLabel("Заявка оформлена", false)).toBe("Иначе");
  });
});

describe("conditionQuestionLabel", () => {
  it("формулирует условие вопросом в нижнем регистре", () => {
    expect(conditionQuestionLabel("opened")).toBe("открыл письмо?");
    expect(conditionQuestionLabel("Заявка оформлена")).toBe("заявка оформлена?");
  });
});
