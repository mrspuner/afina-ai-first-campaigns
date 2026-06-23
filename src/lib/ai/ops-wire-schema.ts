import { z } from "zod";
import type { StructuralOp, Placement } from "@/state/structural-commands";
import { rebuildNodeTypeSchema } from "./rebuild-schema";

/**
 * Плоская wire-схема операции для function calling.
 * Gemini ненадёжно генерирует discriminated unions (oneOf) в аргументах
 * инструментов — поэтому на проводе один плоский объект с enum kind и
 * опциональными полями, а строгий StructuralOp собирает сервер (toStructuralOp).
 */
export const wireOpSchema = z.object({
  kind: z.enum(["add", "remove", "replace", "addCondition"]),
  nodeType: rebuildNodeTypeSchema
    .optional()
    .describe("Для add/replace: тип ноды"),
  ref: z
    .string()
    .optional()
    .describe(
      "Для remove/replace: id существующей ноды (значение в [скобках] из контекста графа); для add с placement after/before: id опорной ноды"
    ),
  placementMode: z
    .enum(["after", "before", "between", "auto"])
    .optional()
    .describe("Для add: куда вставить (default auto)"),
  refA: z
    .string()
    .optional()
    .describe("Для placement between: id первой опорной ноды"),
  refB: z
    .string()
    .optional()
    .describe("Для placement between: id второй опорной ноды"),
  inlineParams: z
    .string()
    .optional()
    .describe("Краткие параметры ноды свободным текстом, например «через 2 дня»"),
  yesLabel: z
    .string()
    .optional()
    .describe("Для addCondition: метка ветки ДА (default YES)"),
  noLabel: z
    .string()
    .optional()
    .describe("Для addCondition: метка ветки НЕТ (default NO)"),
});
export type WireOp = z.infer<typeof wireOpSchema>;

/** wire → строгий StructuralOp; null если поля не складываются в валидную операцию. */
export function toStructuralOp(w: WireOp): StructuralOp | null {
  if (w.kind === "remove") {
    return w.ref ? { kind: "remove", ref: w.ref } : null;
  }
  if (w.kind === "replace") {
    return w.ref && w.nodeType
      ? {
          kind: "replace",
          ref: w.ref,
          newType: w.nodeType,
          ...(w.inlineParams ? { inlineParams: w.inlineParams } : {}),
        }
      : null;
  }
  if (w.kind === "addCondition") {
    return w.ref
      ? {
          kind: "addCondition",
          ref: w.ref,
          ...(w.yesLabel ? { yesLabel: w.yesLabel } : {}),
          ...(w.noLabel ? { noLabel: w.noLabel } : {}),
        }
      : null;
  }
  // add
  if (!w.nodeType) return null;
  let placement: Placement;
  switch (w.placementMode) {
    case "after":
      if (!w.ref) return null;
      placement = { mode: "after", ref: w.ref };
      break;
    case "before":
      if (!w.ref) return null;
      placement = { mode: "before", ref: w.ref };
      break;
    case "between":
      if (!w.refA || !w.refB) return null;
      placement = { mode: "between", refA: w.refA, refB: w.refB };
      break;
    default:
      placement = { mode: "auto" };
  }
  return {
    kind: "add",
    nodeType: w.nodeType,
    placement,
    ...(w.inlineParams ? { inlineParams: w.inlineParams } : {}),
  };
}

export function toStructuralOps(wires: WireOp[]): StructuralOp[] {
  // Невалидные wire-операции отбрасываются молча: частичное применение лучше отказа — модель часто портит одну операцию из списка. Отброшенное не попадает в skipped-репорт applyOps.
  return wires.map(toStructuralOp).filter((op): op is StructuralOp => op !== null);
}
