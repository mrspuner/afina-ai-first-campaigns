/**
 * Zod-зеркало типов StructuralOp из src/state/structural-commands.ts.
 *
 * Зачем отдельная схема, а не zod.infer напрямую:
 * - Route handler принимает JSON от клиента / LLM — нужна runtime-валидация.
 * - discriminatedUnion даёт чёткие ошибки при неверном kind/mode.
 * - Схема передаётся в generateObject (Vercel AI SDK) как контракт для LLM.
 *
 * Важно: zod v4 — discriminatedUnion принимает два аргумента (ключ + массив),
 * поведение аналогично v3; enum строится через z.enum([...]).
 */

import { z } from "zod";
import type { StructuralOp } from "@/state/structural-commands";

// ── Тип ноды — точный список из src/types/workflow.ts ────────────────────────
// Переписан вручную; при добавлении нового типа в WorkflowNodeType —
// добавить сюда же, иначе сломается type-compat assertion ниже.

export const nodeTypeSchema = z.enum([
  "signal",
  "success",
  "end",
  "split",
  "wait",
  "condition",
  "merge",
  "sms",
  "email",
  "push",
  "ivr",
  "storefront",
  "landing",
  "default",
  "channel",
  "retarget",
  "result",
  "new",
  "source",
  "scoring",
]);

// ── Placement — куда вставить новую ноду ─────────────────────────────────────

export const placementSchema = z.discriminatedUnion("mode", [
  // «после» конкретной ноды
  z.object({ mode: z.literal("after"), ref: z.string() }),
  // «перед» конкретной нодой
  z.object({ mode: z.literal("before"), ref: z.string() }),
  // «между» двумя нодами
  z.object({ mode: z.literal("between"), refA: z.string(), refB: z.string() }),
  // автовставка — LLM не указал позицию явно
  z.object({ mode: z.literal("auto") }),
]);

// ── StructuralOp — одна команда изменения графа ──────────────────────────────

export const structuralOpSchema = z.discriminatedUnion("kind", [
  // Добавить новую ноду
  z.object({
    kind: z.literal("add"),
    nodeType: nodeTypeSchema,
    placement: placementSchema,
    // Параметры ноды в виде строки (например, «задержка 24 часа»)
    inlineParams: z.string().optional(),
  }),
  // Удалить ноду по её ref (id или метка)
  z.object({
    kind: z.literal("remove"),
    ref: z.string(),
  }),
  // Заменить тип существующей ноды
  z.object({
    kind: z.literal("replace"),
    ref: z.string(),
    newType: nodeTypeSchema,
    inlineParams: z.string().optional(),
  }),
]);

// ── Верхний уровень — ответ LLM / эндпоинта ──────────────────────────────────

export const workflowOpsResultSchema = z.object({
  // Массив операций; если LLM не уверен — пустой массив (не null)
  ops: z.array(structuralOpSchema),
});

// Выведенный TypeScript-тип для использования в клиентском коде
export type WorkflowOpsResult = z.infer<typeof workflowOpsResultSchema>;

// ── Type-compat assertion ─────────────────────────────────────────────────────
// Если StructuralOp в structural-commands.ts изменится и разойдётся
// с этой схемой — компилятор выдаст ошибку именно здесь, а не в рантайме.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _check: StructuralOp[] = ({} as WorkflowOpsResult).ops;
void _check;
