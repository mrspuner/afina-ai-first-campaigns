import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

export type AiGraphError =
  | "no-signal-entry"      // нет ноды типа signal
  | "no-success-terminal"  // нет ноды success
  | "dangling-edge"        // ребро ссылается на несуществующую ноду
  | "unreachable-node"     // нода недостижима из signal
  | "condition-degree";    // у condition не ровно 2 исходящих ребра

/**
 * Валидирует граф воркфлоу, собранный AI или билдером.
 *
 * Намеренные ослабления (подтверждены шаблонами):
 * 1. end-нода опциональна. Шаблон "Удержание" не содержит ноды типа end:
 *    граф с единственным happy-path (только success) допустим.
 *    Причина: end-нода опциональна в закрытых потоках без ветки «без конверсии».
 *    Проверка сознательно не выполняется (нет ошибки "no-end-terminal").
 *
 * 2. "unreachable-node" — исключает terminal-ноды (success/end) без входящих
 *    рёбер. Шаблон "Регистрация" содержит end-ноду как визуальный placeholder
 *    без входящего ребра; удалять такой граф было бы слишком строго.
 *    Причина: terminal-нода без входящего ребра — UI-артефакт (пользователь
 *    может добавить ребро позже); нетерминальная нода без входа — реальная ошибка.
 */
export function validateAiGraph(graph: {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}): { ok: boolean; errors: AiGraphError[] } {
  const errors: AiGraphError[] = [];
  const ids = new Set(graph.nodes.map((n) => n.id));
  const byType = (t: string) => graph.nodes.filter((n) => n.data.nodeType === t);

  // Entry node was renamed `signal` → `source` (campaign-first inversion).
  // Accept `source` as the entry; keep `signal` for any legacy graph.
  const signals = [...byType("source"), ...byType("signal")];
  if (signals.length === 0) errors.push("no-signal-entry");
  if (byType("success").length === 0) errors.push("no-success-terminal");
  // "no-end-terminal" intentionally omitted — see jsdoc above

  for (const e of graph.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      errors.push("dangling-edge");
      break;
    }
  }

  if (signals.length > 0 && !errors.includes("dangling-edge")) {
    const adj = new Map<string, string[]>();
    for (const e of graph.edges) {
      adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
    }
    const seen = new Set<string>();
    const queue = [signals[0].id];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(...(adj.get(id) ?? []));
    }

    // Relaxation: terminal nodes (success/end) without incoming edges are allowed
    // as UI placeholders. Only flag non-terminal unreachable nodes.
    const terminalTypes = new Set(["success", "end"]);
    if (graph.nodes.some((n) => !seen.has(n.id) && !terminalTypes.has(n.data.nodeType)))
      errors.push("unreachable-node");

    for (const c of byType("condition")) {
      if ((adj.get(c.id) ?? []).length !== 2) {
        errors.push("condition-degree");
        break;
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
