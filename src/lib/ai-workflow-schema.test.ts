import { describe, it, expect } from "vitest";
import type { StructuralOp } from "@/state/structural-commands";
import { workflowOpsResultSchema } from "./ai-workflow-schema";

// ── Валидные кейсы ────────────────────────────────────────────────────────────

describe("workflowOpsResultSchema — valid inputs", () => {
  it('парсит add с placement "after" и inlineParams', () => {
    const result = workflowOpsResultSchema.safeParse({
      ops: [
        {
          kind: "add",
          nodeType: "email",
          placement: { mode: "after", ref: "СМС" },
          inlineParams: "тема: Спецпредложение",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('парсит add с placement "auto" без inlineParams', () => {
    const result = workflowOpsResultSchema.safeParse({
      ops: [
        {
          kind: "add",
          nodeType: "push",
          placement: { mode: "auto" },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('парсит add с placement "between"', () => {
    const result = workflowOpsResultSchema.safeParse({
      ops: [
        {
          kind: "add",
          nodeType: "wait",
          placement: { mode: "between", refA: "push", refB: "email" },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('парсит add с placement "before"', () => {
    const result = workflowOpsResultSchema.safeParse({
      ops: [
        {
          kind: "add",
          nodeType: "sms",
          placement: { mode: "before", ref: "Email" },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("парсит remove", () => {
    const result = workflowOpsResultSchema.safeParse({
      ops: [{ kind: "remove", ref: "push" }],
    });
    expect(result.success).toBe(true);
  });

  it("парсит replace с inlineParams", () => {
    const result = workflowOpsResultSchema.safeParse({
      ops: [
        {
          kind: "replace",
          ref: "sms",
          newType: "ivr",
          inlineParams: "сценарий: голосовой",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("парсит replace без inlineParams", () => {
    const result = workflowOpsResultSchema.safeParse({
      ops: [{ kind: "replace", ref: "sms", newType: "email" }],
    });
    expect(result.success).toBe(true);
  });

  it("парсит пустой массив ops (LLM не уверен)", () => {
    const result = workflowOpsResultSchema.safeParse({ ops: [] });
    expect(result.success).toBe(true);
  });

  it("парсит несколько операций сразу", () => {
    const result = workflowOpsResultSchema.safeParse({
      ops: [
        {
          kind: "add",
          nodeType: "push",
          placement: { mode: "auto" },
        },
        { kind: "remove", ref: "sms" },
      ],
    });
    expect(result.success).toBe(true);
  });
});

// ── Невалидные кейсы ──────────────────────────────────────────────────────────

describe("workflowOpsResultSchema — invalid inputs", () => {
  it("отклоняет неизвестный kind", () => {
    const result = workflowOpsResultSchema.safeParse({
      ops: [{ kind: "delete", ref: "push" }],
    });
    expect(result.success).toBe(false);
  });

  it("отклоняет неизвестный nodeType в add", () => {
    const result = workflowOpsResultSchema.safeParse({
      ops: [
        {
          kind: "add",
          nodeType: "telegram", // не входит в WorkflowNodeType
          placement: { mode: "auto" },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("отклоняет неизвестный nodeType в replace", () => {
    const result = workflowOpsResultSchema.safeParse({
      ops: [{ kind: "replace", ref: "sms", newType: "whatsapp" }],
    });
    expect(result.success).toBe(false);
  });

  it("отклоняет неизвестный mode в placement", () => {
    const result = workflowOpsResultSchema.safeParse({
      ops: [
        {
          kind: "add",
          nodeType: "email",
          placement: { mode: "around", ref: "push" },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('отклоняет placement "between" без refB', () => {
    const result = workflowOpsResultSchema.safeParse({
      ops: [
        {
          kind: "add",
          nodeType: "wait",
          placement: { mode: "between", refA: "push" }, // refB отсутствует
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("отклоняет remove без ref", () => {
    const result = workflowOpsResultSchema.safeParse({
      ops: [{ kind: "remove" }],
    });
    expect(result.success).toBe(false);
  });
});

// ── Type-compat: результат присваиваем в StructuralOp[] ──────────────────────
// Компиляция этого блока без ошибок = проверка совместимости типов.

describe("type compatibility", () => {
  it("распарсенные ops присваиваемы в StructuralOp[]", () => {
    const result = workflowOpsResultSchema.safeParse({
      ops: [
        { kind: "remove", ref: "sms" },
        {
          kind: "add",
          nodeType: "email",
          placement: { mode: "auto" },
        },
      ],
    });

    expect(result.success).toBe(true);

    if (result.success) {
      // Если zod-схема разошлась с StructuralOp — TypeScript выдаст ошибку здесь
      const ops: StructuralOp[] = result.data.ops;
      expect(ops).toHaveLength(2);
    }
  });
});

// ── addCondition (Task 3) ─────────────────────────────────────────────────────

import { structuralOpSchema } from "./ai-workflow-schema";

describe("structuralOpSchema — addCondition", () => {
  it("принимает addCondition с ref и метками", () => {
    const r = structuralOpSchema.safeParse({
      kind: "addCondition",
      ref: "n2",
      yesLabel: "Да",
      noLabel: "Нет",
    });
    expect(r.success).toBe(true);
  });

  it("принимает addCondition только с ref (метки необязательны)", () => {
    const r = structuralOpSchema.safeParse({ kind: "addCondition", ref: "n2" });
    expect(r.success).toBe(true);
  });

  it("addCondition без ref отклоняется", () => {
    const r = structuralOpSchema.safeParse({ kind: "addCondition" });
    expect(r.success).toBe(false);
  });
});
