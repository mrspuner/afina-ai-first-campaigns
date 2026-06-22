import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

export interface GraphNodeSummary {
  id: string;
  label: string;
  nodeType: string;
  sublabel?: string;
}

/**
 * Компактная сводка графа для контекста оркестратора: id, подпись, тип,
 * сабтлейбл (там длительность паузы / триггер условия). Параметры нод
 * НЕ уходят — privacy-граница и токен-бюджет.
 */
export function summarizeGraph(graph: {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}): { nodes: GraphNodeSummary[]; edges: Array<{ from: string; to: string; label?: string }> } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      label: n.data.label,
      nodeType: n.data.nodeType,
      ...(n.data.sublabel ? { sublabel: n.data.sublabel } : {}),
    })),
    edges: graph.edges.map((e) => ({
      from: e.source,
      to: e.target,
      ...(typeof e.label === "string" && e.label ? { label: e.label } : {}),
    })),
  };
}
