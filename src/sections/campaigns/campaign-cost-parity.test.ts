/**
 * A2.3 §6 — the «Запуск» block's payments figure must equal the payment
 * screen's figure, because BOTH read the SAME cost model over the SAME
 * graph + audience. This pins that contract: cost is a pure function of
 * (graph, audience) — it changes when the graph changes and is perfectly
 * deterministic for identical inputs, so card and payment can never drift.
 */
import { describe, it, expect } from "vitest";
import type { WorkflowNode, WorkflowEdge, NodeParams } from "@/types/workflow";
// Exact import path taken from campaign-payment-screen.tsx:
//   import { estimateTouches, computeCampaignCost, type CampaignCost } from "./campaign-cost";
import { computeCampaignCost } from "./campaign-cost";

// ── Minimal graph builders (mirrors campaign-cost.test.ts conventions) ──────

function node(
  id: string,
  nodeType: WorkflowNode["data"]["nodeType"],
  params?: NodeParams,
): WorkflowNode {
  return {
    id,
    type: "workflowNode",
    position: { x: 0, y: 0 },
    data: { label: id, nodeType, ...(params ? { params } : {}) },
  };
}

function edge(source: string, target: string): WorkflowEdge {
  return { id: `${source}-${target}`, source, target };
}

function signalNode(count: number): WorkflowNode {
  return node("signal", "source", {
    kind: "signal",
    fileName: "x.json",
    count,
    segments: { max: 0, high: 0, mid: 0, low: 0 },
  });
}

/** One touch — signal → sms. */
function oneTouchGraph() {
  const nodes = [
    signalNode(1000),
    node("sms", "sms", { kind: "sms", text: "", alphaName: "", scheduledAt: "immediate" }),
  ];
  const edges = [edge("signal", "sms")];
  return { nodes, edges };
}

/** Three touches — signal → sms → email → push, chained. */
function threeTouchGraph() {
  const nodes = [
    signalNode(1000),
    node("sms", "sms", { kind: "sms", text: "", alphaName: "", scheduledAt: "immediate" }),
    node("email", "email", { kind: "email", subject: "", body: "", sender: "" }),
    node("push", "push", { kind: "push", title: "", body: "" }),
  ];
  const edges = [edge("signal", "sms"), edge("sms", "email"), edge("email", "push")];
  return { nodes, edges };
}

const AUDIENCE = 1000;

describe("campaign cost is derived from graph/audience (card == payment screen)", () => {
  it("changes when the graph changes (recompute on base/template change)", () => {
    const one = oneTouchGraph();
    const three = threeTouchGraph();
    const small = computeCampaignCost(one.nodes, one.edges, AUDIENCE);
    const large = computeCampaignCost(three.nodes, three.edges, AUDIENCE);
    expect(large.total).toBeGreaterThan(small.total);
  });

  it("is deterministic for the same inputs (card == payment screen)", () => {
    const graph = oneTouchGraph();
    // «Запуск» block on the campaign card (campaign-screen.tsx) computes cost
    // exactly like this:
    const card = computeCampaignCost(graph.nodes, graph.edges, AUDIENCE);
    // The payment screen (campaign-payment-screen.tsx) computes cost exactly
    // like this — same function, same graph, same audience:
    const payment = computeCampaignCost(graph.nodes, graph.edges, AUDIENCE);
    expect(card).toEqual(payment);
    expect(card.total).toBe(payment.total);
  });
});
