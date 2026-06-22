import { describe, expect, it } from "vitest";
import { summarizeGraph } from "./graph-summary";
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

describe("summarizeGraph", () => {
  const nodes: WorkflowNode[] = [
    {
      id: "signal-1",
      type: "workflowNode",
      position: { x: 0, y: 0 },
      data: {
        label: "Сигнал",
        nodeType: "signal",
        sublabel: "Регистрация",
        params: {
          kind: "signal",
          fileName: "test.json",
          count: 100,
          segments: { max: 10, high: 20, mid: 30, low: 40 },
        },
      },
    },
    {
      id: "push-1",
      type: "workflowNode",
      position: { x: 200, y: 0 },
      data: {
        label: "Push",
        nodeType: "push",
        params: {
          kind: "push",
          title: "Привет",
          body: "Текст",
          deeplink: "brand://home",
        },
      },
    },
  ];

  const edges: WorkflowEdge[] = [
    {
      id: "e-signal-push",
      source: "signal-1",
      target: "push-1",
      type: "default",
    },
  ];

  const graph = { nodes, edges };

  it("возвращает id, label, nodeType для каждой ноды", () => {
    const summary = summarizeGraph(graph);
    expect(summary.nodes).toHaveLength(2);
    expect(summary.nodes[0].id).toBe("signal-1");
    expect(summary.nodes[0].label).toBe("Сигнал");
    expect(summary.nodes[0].nodeType).toBe("signal");
    expect(summary.nodes[1].id).toBe("push-1");
    expect(summary.nodes[1].label).toBe("Push");
    expect(summary.nodes[1].nodeType).toBe("push");
  });

  it("включает sublabel если он есть", () => {
    const summary = summarizeGraph(graph);
    expect(summary.nodes[0].sublabel).toBe("Регистрация");
  });

  it("не включает sublabel если он отсутствует", () => {
    const summary = summarizeGraph(graph);
    expect(summary.nodes[1].sublabel).toBeUndefined();
    expect("sublabel" in summary.nodes[1]).toBe(false);
  });

  it("возвращает рёбра с from/to", () => {
    const summary = summarizeGraph(graph);
    expect(summary.edges).toHaveLength(1);
    expect(summary.edges[0].from).toBe("signal-1");
    expect(summary.edges[0].to).toBe("push-1");
  });

  it("JSON-сериализация не содержит params (privacy-граница)", () => {
    const summary = summarizeGraph(graph);
    const json = JSON.stringify(summary);
    expect(json).not.toContain("params");
  });

  it("прокидывает label ребра (ветки YES/NO)", () => {
    const labeledGraph = {
      nodes,
      edges: [
        { id: "e1", source: "signal-1", target: "push-1", type: "default", label: "YES" } as WorkflowEdge,
      ],
    };
    const summary = summarizeGraph(labeledGraph);
    expect(summary.edges[0].label).toBe("YES");
  });

  it("не добавляет label, если его нет на ребре", () => {
    const summary = summarizeGraph(graph); // graph fixture has unlabeled edge
    expect("label" in summary.edges[0]).toBe(false);
  });
});
