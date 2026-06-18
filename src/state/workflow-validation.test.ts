import { describe, it, expect } from "vitest";
import { validateWorkflow } from "./workflow-validation";
import { createBaseNodes, createBaseEdges } from "@/types/workflow";
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

function baseGraph() {
  return { nodes: createBaseNodes("сигнал_test.json"), edges: createBaseEdges() };
}

describe("validateWorkflow", () => {
  it("returns ok for base graph with signal bound", () => {
    const result = validateWorkflow(baseGraph(), true);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("reports no-signal when signalBound=false", () => {
    const result = validateWorkflow(baseGraph(), false);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("no-signal");
  });

  it("reports needs-attention when a communication node has an empty required field", () => {
    const g = baseGraph();
    g.nodes.push({
      id: "sms-empty",
      type: "workflowNode",
      position: { x: 0, y: 200 },
      data: {
        label: "SMS",
        nodeType: "sms",
        params: { kind: "sms", text: "", alphaName: "A", scheduledAt: "immediate" },
      },
    });
    const result = validateWorkflow(g, true);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("needs-attention");
  });

  it("reports no-success-path when no node is isSuccess", () => {
    const g = baseGraph();
    g.nodes = g.nodes.map((n) => ({ ...n, data: { ...n.data, isSuccess: false } }));
    const result = validateWorkflow(g, true);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("no-success-path");
  });

  it("reports no-success-path when success node is unreachable", () => {
    const nodes: WorkflowNode[] = [
      {
        id: "a",
        type: "workflowNode",
        position: { x: 0, y: 0 },
        data: { label: "Start", nodeType: "default" },
      },
      {
        id: "b",
        type: "workflowNode",
        position: { x: 100, y: 0 },
        data: { label: "Detached success", nodeType: "default", isSuccess: true },
      },
    ];
    const edges: WorkflowEdge[] = [];
    const result = validateWorkflow({ nodes, edges }, true);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("no-success-path");
  });

  it("accumulates multiple errors", () => {
    const g = baseGraph();
    g.nodes = g.nodes.map((n) => ({ ...n, data: { ...n.data, isSuccess: false } }));
    const result = validateWorkflow(g, false);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("no-signal");
    expect(result.errors).toContain("no-success-path");
  });
});

import { nodeNeedsAttention, computeNeedsAttention } from "./workflow-validation";
import type { NodeParams } from "@/types/workflow";

function paramNode(id: string, params: NodeParams): WorkflowNode {
  return {
    id,
    type: "workflowNode",
    position: { x: 0, y: 0 },
    data: { label: id, nodeType: params.kind as never, params },
  };
}

describe("nodeNeedsAttention (per-kind required fields)", () => {
  it("flags an sms node with empty text", () => {
    expect(nodeNeedsAttention(paramNode("s", { kind: "sms", text: "", alphaName: "A", scheduledAt: "immediate" }))).toBe(true);
  });
  it("passes a filled sms node", () => {
    expect(nodeNeedsAttention(paramNode("s", { kind: "sms", text: "Привет", alphaName: "A", scheduledAt: "immediate" }))).toBe(false);
  });
  it("flags an email node missing subject", () => {
    expect(nodeNeedsAttention(paramNode("e", { kind: "email", subject: "", body: "b", sender: "x@y" }))).toBe(true);
  });
  it("never flags structural nodes (merge)", () => {
    expect(nodeNeedsAttention(paramNode("m", { kind: "merge" }))).toBe(false);
  });
});

describe("computeNeedsAttention", () => {
  it("returns the graph with needsAttention recomputed per node", () => {
    const nodes = [
      paramNode("s", { kind: "sms", text: "", alphaName: "A", scheduledAt: "immediate" }),
      paramNode("ok", { kind: "push", title: "T", body: "B" }),
    ];
    const out = computeNeedsAttention(nodes);
    expect(out.find((n) => n.id === "s")!.data.needsAttention).toBe(true);
    expect(out.find((n) => n.id === "ok")!.data.needsAttention).toBe(false);
  });
});
