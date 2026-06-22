import { describe, expect, it } from "vitest";
import { assistRequestSchema, assistResultSchema, assistContextSchema, assistResponseSchema } from "./assist-contract";

describe("assist-contract", () => {
  it("валидный запрос проходит", () => {
    const r = assistRequestSchema.safeParse({
      text: "какая кампания лучшая?",
      history: [{ role: "user", text: "привет" }],
      context: { screen: "section:Статистика", dataSummary: "кампаний: 3" },
    });
    expect(r.success).toBe(true);
  });
  it("история длиннее 8 отклоняется", () => {
    const history = Array.from({ length: 9 }, () => ({ role: "user" as const, text: "x" }));
    expect(assistRequestSchema.safeParse({
      text: "y", history, context: { screen: "s", dataSummary: "" },
    }).success).toBe(false);
  });
  it("clarify с 3 вопросами отклоняется", () => {
    expect(assistResultSchema.safeParse({
      kind: "clarify", questions: ["a", "b", "c"],
    }).success).toBe(false);
  });
  it("неизвестный kind отклоняется", () => {
    expect(assistResultSchema.safeParse({ kind: "magic" }).success).toBe(false);
  });

  // ── план 005: новые варианты результата ──────────────────────────────────────

  it("workflow-ops с валидной операцией проходит", () => {
    const r = assistResultSchema.safeParse({
      kind: "workflow-ops",
      ops: [{ kind: "add", nodeType: "push", placement: { mode: "auto" } }],
    });
    expect(r.success).toBe(true);
  });

  it("node-params без nodeId отклоняется", () => {
    const r = assistResultSchema.safeParse({
      kind: "node-params",
      patch: { title: "Новый заголовок" },
      confirmation: "Заголовок изменён",
    });
    expect(r.success).toBe(false);
  });

  it("node-params с nodeId проходит", () => {
    const r = assistResultSchema.safeParse({
      kind: "node-params",
      nodeId: "push-1",
      patch: { title: "Новый заголовок" },
      confirmation: "Заголовок изменён",
    });
    expect(r.success).toBe(true);
  });

  it("undo проходит", () => {
    const r = assistResultSchema.safeParse({ kind: "undo" });
    expect(r.success).toBe(true);
  });

  // ── план 005: граф в контексте ───────────────────────────────────────────────

  it("контекст с graph и selectedNode проходит", () => {
    const r = assistContextSchema.safeParse({
      screen: "workflow",
      dataSummary: "",
      graph: {
        nodes: [{ id: "signal", label: "Сигнал", nodeType: "signal", sublabel: "Тест" }],
        edges: [{ from: "signal", to: "push-1" }],
      },
      selectedNode: { id: "push-1", label: "Push", nodeType: "push" },
      undoAvailable: true,
    });
    expect(r.success).toBe(true);
  });

  it("контекст без graph по-прежнему валиден (обратная совместимость)", () => {
    const r = assistContextSchema.safeParse({
      screen: "section:Статистика",
      dataSummary: "кампаний: 3",
    });
    expect(r.success).toBe(true);
  });

  it("контекст с wizardStep и activeTrigger (план 006) проходит", () => {
    const r = assistContextSchema.safeParse({
      screen: "guided-signal:3",
      dataSummary: "",
      wizardStep: { step: 3, title: "Интересы" },
      activeTrigger: { id: "tr_1", label: "Ипотека" },
    });
    expect(r.success).toBe(true);
  });
});

// ── план 006: новые kinds + multi-tool ─────────────────────────────────────────

describe("assist-contract plan-006", () => {
  it("stats kind с патчем и confirmation проходит", () => {
    const r = assistResultSchema.safeParse({
      kind: "stats",
      patch: { rows: "campaigns", rowCount: 10 },
      confirmation: "Показываю топ-10 кампаний",
    });
    expect(r.success).toBe(true);
  });

  it("navigate с target section Статистика проходит", () => {
    const r = assistResultSchema.safeParse({
      kind: "navigate",
      target: { kind: "section", name: "Статистика" },
      confirmation: "Перехожу в Статистику",
    });
    expect(r.success).toBe(true);
  });

  it("navigate с target section Лендинги отклоняется", () => {
    const r = assistResultSchema.safeParse({
      kind: "navigate",
      target: { kind: "section", name: "Лендинги" },
      confirmation: "...",
    });
    expect(r.success).toBe(false);
  });

  it("navigate с campaign-workflow target проходит", () => {
    const r = assistResultSchema.safeParse({
      kind: "navigate",
      target: { kind: "campaign-workflow", campaignId: "cmp_abc" },
      confirmation: "Открываю кампанию",
    });
    expect(r.success).toBe(true);
  });

  it("triggers с пустыми add/exclude без clear-флагов валиден (инвариант держит промпт)", () => {
    // Схема не запрещает пустые массивы — инвариант (хотя бы что-то непусто) держит промпт
    const r = assistResultSchema.safeParse({
      kind: "triggers",
      add: [],
      exclude: [],
      confirmation: "...",
    });
    expect(r.success).toBe(true);
  });

  it("triggers с clearAdded:true проходит", () => {
    const r = assistResultSchema.safeParse({
      kind: "triggers",
      add: [],
      exclude: [],
      clearAdded: true,
      confirmation: "Сбрасываю добавленные триггеры",
    });
    expect(r.success).toBe(true);
  });

  // ── assistResponseSchema ───────────────────────────────────────────────────

  it("assistResponseSchema: ответ {results:[navigate, stats]} проходит", () => {
    const r = assistResponseSchema.safeParse({
      results: [
        {
          kind: "navigate",
          target: { kind: "section", name: "Статистика" },
          confirmation: "Перехожу в Статистику",
        },
        {
          kind: "stats",
          patch: { rows: "campaigns" },
          confirmation: "Показываю кампании",
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("assistResponseSchema: 3 результата отклоняются (max 2)", () => {
    const r = assistResponseSchema.safeParse({
      results: [
        { kind: "answer", text: "1" },
        { kind: "answer", text: "2" },
        { kind: "answer", text: "3" },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("assistResponseSchema: 1 результат проходит", () => {
    const r = assistResponseSchema.safeParse({
      results: [{ kind: "answer", text: "ok" }],
    });
    expect(r.success).toBe(true);
  });

  it("assistResponseSchema: пустой массив отклоняется (min 1)", () => {
    const r = assistResponseSchema.safeParse({ results: [] });
    expect(r.success).toBe(false);
  });
});

// ── Task 15: create_template kind ──────────────────────────────────────────────
describe("assist-contract — create_template (#15)", () => {
  const smsVariant = {
    name: "SMS — тест",
    content: { kind: "sms", text: "Текст", alphaName: "AFINA", scheduledAt: "immediate" },
  };

  it("create_template с валидными вариантами проходит", () => {
    const r = assistResultSchema.safeParse({
      kind: "create_template",
      channel: "sms",
      variants: [smsVariant, smsVariant, smsVariant],
    });
    expect(r.success).toBe(true);
  });

  it("create_template без вариантов отклоняется", () => {
    const r = assistResultSchema.safeParse({
      kind: "create_template",
      channel: "sms",
      variants: [],
    });
    expect(r.success).toBe(false);
  });

  it("create_template с неизвестным каналом отклоняется", () => {
    const r = assistResultSchema.safeParse({
      kind: "create_template",
      channel: "fax",
      variants: [smsVariant],
    });
    expect(r.success).toBe(false);
  });

  it("create_template с email-вариантом проходит", () => {
    const r = assistResultSchema.safeParse({
      kind: "create_template",
      channel: "email",
      variants: [
        {
          name: "Email — приветствие",
          content: { kind: "email", subject: "Привет", body: "Текст письма", sender: "info@afina.ru" },
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("create_template с push-вариантом проходит", () => {
    const r = assistResultSchema.safeParse({
      kind: "create_template",
      channel: "push",
      variants: [
        {
          name: "Push — уведомление",
          content: { kind: "push", title: "Заголовок", body: "Тело" },
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("create_template с ivr-вариантом проходит", () => {
    const r = assistResultSchema.safeParse({
      kind: "create_template",
      channel: "ivr",
      variants: [
        {
          name: "Звонок — приветствие",
          content: { kind: "ivr", scenario: "Привет, это Афина!", voiceType: "female" },
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});
