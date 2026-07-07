import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

/** Per-kind required-field check. A node "needs attention" when a field a
 *  human must fill is empty. Structural/auto nodes (merge, wait, condition,
 *  split, source, scoring, signal, end) are never flagged. */
export function nodeNeedsAttention(node: WorkflowNode): boolean {
  const p = node.data.params;
  if (!p) return false;
  switch (p.kind) {
    case "sms":
      return !p.text?.trim() || !p.alphaName?.trim();
    case "email":
      return !p.subject?.trim() || !p.body?.trim() || !p.sender?.trim();
    case "push":
      return !p.title?.trim() || !p.body?.trim();
    case "ivr":
      return !p.scenario?.trim();
    case "success":
      return !p.goal?.trim();
    // No required human field — auto/structural:
    case "wait":
    case "condition":
    case "split":
    case "merge":
    case "end":
    case "signal":
    case "scoring":
      return false;
    default:
      return false;
  }
}

/** Recomputes `needsAttention` for every node from its params. Returns the
 *  same node reference when the flag is unchanged (stable identity). */
export function computeNeedsAttention<N extends WorkflowNode>(nodes: N[]): N[] {
  return nodes.map((n) => {
    const next = nodeNeedsAttention(n);
    return n.data.needsAttention === next
      ? n
      : { ...n, data: { ...n.data, needsAttention: next } };
  });
}

export type WorkflowValidationError =
  | "no-signal"
  | "needs-attention"
  | "no-success-path";

export interface WorkflowValidation {
  ok: boolean;
  /** Blocking issues — gate the «Запустить» button. */
  errors: WorkflowValidationError[];
  /** Non-blocking issues — surfaced as a soft «проверьте текст» highlight but
   *  do NOT gate launch (#2). */
  warnings: WorkflowValidationError[];
}

export function validateWorkflow(
  graph: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
  signalBound: boolean
): WorkflowValidation {
  const errors: WorkflowValidationError[] = [];
  const warnings: WorkflowValidationError[] = [];

  if (!signalBound) errors.push("no-signal");

  // #2 — «требует внимания» (пустой обязательный текст) больше НЕ блокирует
  // запуск: это мягкое предупреждение (нода остаётся подсвеченной «проверьте
  // текст»), кампанию можно запустить с непроверенными текстами.
  if (graph.nodes.some((n) => nodeNeedsAttention(n))) {
    warnings.push("needs-attention");
  }

  const successIds = graph.nodes
    .filter((n) => n.data.isSuccess)
    .map((n) => n.id);

  if (successIds.length === 0) {
    errors.push("no-success-path");
  } else {
    const adj = new Map<string, string[]>();
    for (const e of graph.edges) {
      const list = adj.get(e.source) ?? [];
      list.push(e.target);
      adj.set(e.source, list);
    }
    const entry = graph.nodes[0]?.id;
    const seen = new Set<string>();
    if (entry) {
      const queue: string[] = [entry];
      while (queue.length) {
        const id = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const next of adj.get(id) ?? []) queue.push(next);
      }
    }
    const reachable = successIds.some((id) => seen.has(id));
    if (!reachable) errors.push("no-success-path");
  }

  return { ok: errors.length === 0, errors, warnings };
}
