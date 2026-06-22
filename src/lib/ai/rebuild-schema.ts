import { z } from "zod";
import { relayoutGraph } from "@/state/structural-commands";
import type { NodeParams, WorkflowNode, WorkflowEdge } from "@/types/workflow";

/** Типы, доступные модели при пересборке. Без legacy и без signal —
 *  сигнальную ноду билдер всегда ставит сам первой. */
export const rebuildNodeTypeSchema = z.enum([
  "sms", "email", "push", "ivr", "wait", "condition", "split", "merge",
  "storefront", "landing", "success", "end",
]);

export const rebuildNodeSchema = z.object({
  /** Слаг в пределах ответа (модель ссылается на него в edges). */
  key: z.string().min(1),
  nodeType: rebuildNodeTypeSchema,
  label: z.string().min(1),
  sublabel: z.string().optional(),
});

export const rebuildGraphSchema = z.object({
  nodes: z.array(rebuildNodeSchema).min(2).max(20),
  edges: z
    .array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() }))
    .min(1),
  /** Допущения, которые модель проговаривает пользователю (§7 спеки). */
  assumptions: z.string(),
});
export type RebuildGraphSpec = z.infer<typeof rebuildGraphSchema>;

const STEP = 210;

function defaultParams(nodeType: z.infer<typeof rebuildNodeTypeSchema>): NodeParams {
  switch (nodeType) {
    case "sms": return { kind: "sms", text: "Текст сообщения", alphaName: "BRAND", scheduledAt: "immediate" };
    case "email": return { kind: "email", subject: "Тема письма", body: "Текст письма", sender: "noreply@brand.com" };
    case "push": return { kind: "push", title: "Заголовок", body: "Текст уведомления" };
    case "ivr": return { kind: "ivr", scenario: "Сценарий звонка", voiceType: "neutral" };
    case "wait": return { kind: "wait", mode: "duration", durationHours: 24 };
    case "condition": return { kind: "condition", trigger: "opened" };
    case "split": return { kind: "split", by: "equal", branches: 2 };
    case "merge": return { kind: "merge" };
    case "storefront": return { kind: "storefront", offers: [] };
    case "landing": return { kind: "landing", cta: "Перейти", offerTitle: "Предложение" };
    case "success": return { kind: "success", goal: "Конверсия" };
    case "end": return { kind: "end", reason: "Без конверсии" };
  }
}

/**
 * Спецификация модели → полный граф. Сигнальная нода добавляется первой
 * (key "signal" зарезервирован); ноды без указанных моделью текстов несут
 * дефолтные params и НЕ помечаются needsAttention — дефолты осмысленные
 * (уровень шаблонов), пользователь дозаполняет по желанию.
 */
export function buildGraphFromSpec(
  spec: RebuildGraphSpec,
  signal: { label: string; sublabel?: string }
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const nodes: WorkflowNode[] = [
    {
      id: "signal",
      type: "workflowNode",
      position: { x: 0, y: 0 },
      data: {
        label: signal.label, nodeType: "signal", sublabel: signal.sublabel,
        params: { kind: "signal", fileName: "", count: 0, segments: { max: 0, high: 0, mid: 0, low: 0 } },
      },
    },
    ...spec.nodes.map((n, i) => ({
      id: `n_${n.key}`,
      type: "workflowNode" as const,
      position: { x: STEP * (i + 1), y: n.nodeType === "end" ? 120 : 0 },
      data: {
        label: n.label,
        nodeType: n.nodeType,
        sublabel: n.sublabel,
        ...(n.nodeType === "success" ? { isSuccess: true } : {}),
        params: defaultParams(n.nodeType),
      },
    })),
  ];
  const keyToId = (k: string) => (k === "signal" ? "signal" : `n_${k}`);
  const edges: WorkflowEdge[] = spec.edges.map((e) => ({
    id: `e_${e.from}_${e.to}`,
    source: keyToId(e.from),
    target: keyToId(e.to),
    type: "default",
    ...(e.label ? { label: e.label } : {}),
  }));
  return relayoutGraph({ nodes, edges });
}
