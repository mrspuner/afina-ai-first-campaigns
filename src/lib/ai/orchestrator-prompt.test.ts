import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildMessages } from "./orchestrator-prompt";

describe("buildSystemPrompt", () => {
  it("содержит все четыре слоя в порядке: роль → знания → контекст", () => {
    const p = buildSystemPrompt({ screen: "workflow", dataSummary: "Кампаний: 2" });
    const roleIdx = p.indexOf("Ты — Афина");
    const knowledgeIdx = p.indexOf("# База знаний");
    const contextIdx = p.indexOf("# Контекст момента");
    expect(roleIdx).toBeGreaterThanOrEqual(0);
    expect(knowledgeIdx).toBeGreaterThan(roleIdx);
    expect(contextIdx).toBeGreaterThan(knowledgeIdx);
    expect(p).toContain("Кампаний: 2");
    expect(p).toContain("workflow");
  });

  it("с graph включает label ноды и рёбра", () => {
    const p = buildSystemPrompt({
      screen: "workflow",
      dataSummary: "",
      graph: {
        nodes: [
          { id: "signal", label: "Сигнал", nodeType: "signal" },
          { id: "n1", label: "СМС", nodeType: "sms" },
        ],
        edges: [{ from: "signal", to: "n1" }],
      },
    });
    expect(p).toContain("СМС");
    expect(p).toContain("signal → n1");
  });

  it("с selectedNode включает строку 'Выбрана нода'", () => {
    const p = buildSystemPrompt({
      screen: "workflow",
      dataSummary: "",
      graph: {
        nodes: [{ id: "n1", label: "СМС", nodeType: "sms" }],
        edges: [],
      },
      selectedNode: { id: "n1", label: "СМС", nodeType: "sms" },
    });
    expect(p).toContain("Выбрана нода");
  });

  it("без graph не содержит 'Текущий граф'", () => {
    const p = buildSystemPrompt({ screen: "workflow", dataSummary: "" });
    expect(p).not.toContain("Текущий граф");
  });

  it("с wizardStep включает шаг и заголовок", () => {
    const p = buildSystemPrompt({
      screen: "guided-signal:2",
      dataSummary: "",
      wizardStep: { step: 2, title: "Настройка триггеров" },
    });
    expect(p).toContain("визарде сигнала");
    expect(p).toContain("шаг 2");
    expect(p).toContain("Настройка триггеров");
  });

  it("без wizardStep не упоминает визард", () => {
    const p = buildSystemPrompt({ screen: "workflow", dataSummary: "" });
    expect(p).not.toContain("визарде сигнала");
  });

  it("с activeTrigger включает label триггера", () => {
    const p = buildSystemPrompt({
      screen: "guided-signal:3",
      dataSummary: "",
      activeTrigger: { id: "t1", label: "Ипотека 2026" },
    });
    expect(p).toContain("Активный триггер");
    expect(p).toContain("Ипотека 2026");
  });

  it("без activeTrigger не упоминает активный триггер", () => {
    const p = buildSystemPrompt({ screen: "workflow", dataSummary: "" });
    expect(p).not.toContain("Активный триггер");
  });

  it("рендерит метки рёбер (ветки) в контексте графа", () => {
    const p = buildSystemPrompt({
      screen: "workflow",
      dataSummary: "",
      graph: {
        nodes: [
          { id: "signal", label: "Сигнал", nodeType: "signal" },
          { id: "c1", label: "Открыл?", nodeType: "condition" },
          { id: "ok", label: "Успех", nodeType: "success" },
          { id: "no", label: "Конец", nodeType: "end" },
        ],
        edges: [
          { from: "signal", to: "c1" },
          { from: "c1", to: "ok", label: "YES" },
          { from: "c1", to: "no", label: "NO" },
        ],
      },
    });
    expect(p).toContain("c1 →[YES] ok");
    expect(p).toContain("c1 →[NO] no");
    expect(p).toContain("signal → c1"); // unlabeled edge stays clean
  });
});

describe("buildMessages", () => {
  it("история идёт перед текущим вопросом", () => {
    const m = buildMessages(
      [{ role: "user", text: "сколько потратили в июне?" },
       { role: "assistant", text: "В июне — $1200." }],
      "а в мае?"
    );
    expect(m).toHaveLength(3);
    expect(m[2]).toEqual({ role: "user", content: "а в мае?" });
  });
});
