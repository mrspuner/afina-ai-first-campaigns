import { describe, expect, it } from "vitest";
import { wireOpSchema, toStructuralOp, toStructuralOps } from "./ops-wire-schema";

describe("wireOpSchema validation", () => {
  it("отклоняет невалидный kind", () => {
    const r = wireOpSchema.safeParse({ kind: "unknown" });
    expect(r.success).toBe(false);
  });

  it("принимает remove без необязательных полей", () => {
    const r = wireOpSchema.safeParse({ kind: "remove", ref: "СМС" });
    expect(r.success).toBe(true);
  });

  it("принимает add с nodeType", () => {
    const r = wireOpSchema.safeParse({
      kind: "add",
      nodeType: "push",
      placementMode: "after",
      ref: "Email",
    });
    expect(r.success).toBe(true);
  });
});

describe("toStructuralOp", () => {
  it("remove с ref → StructuralOp remove", () => {
    const op = toStructuralOp({ kind: "remove", ref: "СМС" });
    expect(op).toEqual({ kind: "remove", ref: "СМС" });
  });

  it("remove без ref → null", () => {
    const op = toStructuralOp({ kind: "remove" });
    expect(op).toBeNull();
  });

  it("add с placementMode after+ref → placement {mode:'after',ref}", () => {
    const op = toStructuralOp({
      kind: "add",
      nodeType: "push",
      placementMode: "after",
      ref: "Email",
    });
    expect(op).toEqual({
      kind: "add",
      nodeType: "push",
      placement: { mode: "after", ref: "Email" },
    });
  });

  it("add без placementMode → placement auto", () => {
    const op = toStructuralOp({ kind: "add", nodeType: "sms" });
    expect(op).toEqual({
      kind: "add",
      nodeType: "sms",
      placement: { mode: "auto" },
    });
  });

  it("add с placementMode before+ref → placement {mode:'before',ref}", () => {
    const op = toStructuralOp({
      kind: "add",
      nodeType: "wait",
      placementMode: "before",
      ref: "Конец",
    });
    expect(op).toEqual({
      kind: "add",
      nodeType: "wait",
      placement: { mode: "before", ref: "Конец" },
    });
  });

  it("between без refB → null", () => {
    const op = toStructuralOp({
      kind: "add",
      nodeType: "email",
      placementMode: "between",
      refA: "СМС",
    });
    expect(op).toBeNull();
  });

  it("between с refA и refB → placement {mode:'between',refA,refB}", () => {
    const op = toStructuralOp({
      kind: "add",
      nodeType: "email",
      placementMode: "between",
      refA: "СМС",
      refB: "Конец",
    });
    expect(op).toEqual({
      kind: "add",
      nodeType: "email",
      placement: { mode: "between", refA: "СМС", refB: "Конец" },
    });
  });

  it("replace с ref+nodeType → StructuralOp replace", () => {
    const op = toStructuralOp({
      kind: "replace",
      ref: "СМС",
      nodeType: "push",
    });
    expect(op).toEqual({ kind: "replace", ref: "СМС", newType: "push" });
  });

  it("replace без nodeType → null", () => {
    const op = toStructuralOp({ kind: "replace", ref: "СМС" });
    expect(op).toBeNull();
  });

  it("replace без ref → null", () => {
    const op = toStructuralOp({ kind: "replace", nodeType: "push" });
    expect(op).toBeNull();
  });

  it("add без nodeType → null", () => {
    const op = toStructuralOp({ kind: "add", placementMode: "auto" });
    expect(op).toBeNull();
  });

  it("inlineParams пробрасывается в remove — игнорируется (remove не имеет inlineParams)", () => {
    // remove возвращает {kind:'remove',ref} без inlineParams — это корректно
    const op = toStructuralOp({ kind: "remove", ref: "Email", inlineParams: "что-то" });
    expect(op).toEqual({ kind: "remove", ref: "Email" });
  });

  it("inlineParams пробрасывается в add", () => {
    const op = toStructuralOp({
      kind: "add",
      nodeType: "sms",
      inlineParams: "текст привет",
    });
    expect(op).toEqual({
      kind: "add",
      nodeType: "sms",
      placement: { mode: "auto" },
      inlineParams: "текст привет",
    });
  });

  it("inlineParams пробрасывается в replace", () => {
    const op = toStructuralOp({
      kind: "replace",
      ref: "Email",
      nodeType: "sms",
      inlineParams: "24 часа",
    });
    expect(op).toEqual({
      kind: "replace",
      ref: "Email",
      newType: "sms",
      inlineParams: "24 часа",
    });
  });
});

describe("toStructuralOps", () => {
  it("фильтрует null'ы из массива", () => {
    const wires = [
      { kind: "remove" as const, ref: "СМС" },
      { kind: "remove" as const }, // нет ref → null
      { kind: "add" as const, nodeType: "push" as const, placementMode: "after" as const, ref: "Email" },
    ];
    const ops = toStructuralOps(wires);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual({ kind: "remove", ref: "СМС" });
    expect(ops[1]).toEqual({
      kind: "add",
      nodeType: "push",
      placement: { mode: "after", ref: "Email" },
    });
  });

  it("пустой массив → пустой массив", () => {
    expect(toStructuralOps([])).toEqual([]);
  });

  it("все валидные операции → ни одна не отброшена", () => {
    const wires = [
      { kind: "remove" as const, ref: "А" },
      { kind: "remove" as const, ref: "Б" },
    ];
    expect(toStructuralOps(wires)).toHaveLength(2);
  });
});

describe("toStructuralOp — addCondition", () => {
  it("маппит wire addCondition с ref и метками", () => {
    const op = toStructuralOp({ kind: "addCondition", ref: "n2", yesLabel: "Открыл", noLabel: "Нет" });
    expect(op).toEqual({ kind: "addCondition", ref: "n2", yesLabel: "Открыл", noLabel: "Нет" });
  });
  it("addCondition без ref → null (невалидно)", () => {
    expect(toStructuralOp({ kind: "addCondition" })).toBeNull();
  });
  it("addCondition без меток → только ref", () => {
    const op = toStructuralOp({ kind: "addCondition", ref: "n2" });
    expect(op).toEqual({ kind: "addCondition", ref: "n2" });
  });
  it("toStructuralOps отбрасывает невалидный addCondition", () => {
    expect(toStructuralOps([{ kind: "addCondition" }])).toHaveLength(0);
  });
});

describe("toStructuralOp — replace с branches (block7)", () => {
  it("replace c branches → StructuralOp.replace.branches", () => {
    const op = toStructuralOp({
      kind: "replace",
      ref: "n_wait",
      nodeType: "split",
      branches: [
        { label: "Высокий", channel: "sms" },
        { label: "Средний", channel: "ivr" },
      ],
    });
    expect(op).toEqual({
      kind: "replace",
      ref: "n_wait",
      newType: "split",
      branches: [
        { label: "Высокий", channel: "sms" },
        { label: "Средний", channel: "ivr" },
      ],
    });
  });

  it("replace без branches → branches не присутствует (как раньше)", () => {
    const op = toStructuralOp({ kind: "replace", ref: "n1", nodeType: "email" });
    expect(op).toEqual({ kind: "replace", ref: "n1", newType: "email" });
  });

  it("wireOpSchema принимает branches в replace", () => {
    const r = wireOpSchema.safeParse({
      kind: "replace",
      ref: "n1",
      nodeType: "split",
      branches: [{ label: "A", channel: "push" }],
    });
    expect(r.success).toBe(true);
  });
});
