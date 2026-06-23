import { describe, it, expect } from "vitest";
import type { WorkflowNode, WorkflowEdge, NodeParams } from "@/types/workflow";
import {
  UNIT_COST,
  DYNAMIC_RATE,
  CHANNEL_LABEL,
  computeReach,
  computeCampaignCost,
  estimateTouches,
} from "./campaign-cost";

// ── Test graph builders ───────────────────────────────────────────────────────

function node(
  id: string,
  nodeType: WorkflowNode["data"]["nodeType"],
  params?: NodeParams,
  sublabel?: string,
): WorkflowNode {
  return {
    id,
    type: "workflowNode",
    position: { x: 0, y: 0 },
    data: { label: id, nodeType, sublabel, ...(params ? { params } : {}) },
  };
}

function edge(source: string, target: string): WorkflowEdge {
  return { id: `${source}-${target}`, source, target };
}

const EMPTY_SEG = { max: 0, high: 0, mid: 0, low: 0 };

function signalNode(count: number, segments = EMPTY_SEG): WorkflowNode {
  return node("signal", "source", {
    kind: "signal",
    fileName: "x.json",
    count,
    segments,
  });
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("UNIT_COST / DYNAMIC_RATE", () => {
  it("uses the agreed mock values", () => {
    expect(UNIT_COST).toEqual({ sms: 5, email: 1, push: 0.5, ivr: 8 });
    expect(DYNAMIC_RATE).toBe(0.3);
  });

  it("maps channels to human labels", () => {
    expect(CHANNEL_LABEL).toEqual({
      sms: "SMS",
      email: "Email",
      push: "Push",
      ivr: "Звонок",
    });
  });
});

// ── computeReach ──────────────────────────────────────────────────────────────

describe("computeReach", () => {
  it("seeds the signal node with N and marks it not dynamic", () => {
    const nodes = [signalNode(4000)];
    const { reach, dynamic } = computeReach(nodes, [], 4000);
    expect(reach.signal).toBe(4000);
    expect(dynamic.signal).toBe(false);
  });

  it("passes reach unchanged through wait / communication nodes", () => {
    const nodes = [
      signalNode(1000),
      node("sms", "sms", { kind: "sms", text: "", alphaName: "", scheduledAt: "immediate" }),
      node("wait", "wait", { kind: "wait", mode: "duration", durationHours: 24 }),
    ];
    const edges = [edge("signal", "sms"), edge("sms", "wait")];
    const { reach, dynamic } = computeReach(nodes, edges, 1000);
    expect(reach.sms).toBe(1000);
    expect(reach.wait).toBe(1000);
    expect(dynamic.sms).toBe(false);
  });

  it("applies DYNAMIC_RATE to each branch after a condition and marks them dynamic", () => {
    const nodes = [
      signalNode(4000),
      node("sms", "sms", { kind: "sms", text: "", alphaName: "", scheduledAt: "immediate" }),
      node("cond", "condition", { kind: "condition", trigger: "opened" }),
      node("landing", "landing", { kind: "landing", cta: "", offerTitle: "" }),
      node("push", "push", { kind: "push", title: "", body: "" }),
    ];
    const edges = [
      edge("signal", "sms"),
      edge("sms", "cond"),
      edge("cond", "landing"),
      edge("cond", "push"),
    ];
    const { reach, dynamic } = computeReach(nodes, edges, 4000);
    expect(reach.push).toBe(1200); // 0.3 × 4000
    expect(reach.landing).toBe(1200);
    expect(dynamic.push).toBe(true);
    expect(dynamic.landing).toBe(true);
    expect(dynamic.cond).toBe(false);
    expect(dynamic.sms).toBe(false);
  });

  it("keeps dynamic propagating downstream past the first condition", () => {
    const nodes = [
      signalNode(1000),
      node("cond", "condition", { kind: "condition", trigger: "opened" }),
      node("push", "push", { kind: "push", title: "", body: "" }),
      node("wait", "wait", { kind: "wait", mode: "duration", durationHours: 1 }),
    ];
    const edges = [edge("signal", "cond"), edge("cond", "push"), edge("push", "wait")];
    const { dynamic } = computeReach(nodes, edges, 1000);
    expect(dynamic.wait).toBe(true);
  });

  it("splits reach evenly when by=random", () => {
    const nodes = [
      signalNode(900),
      node("split", "split", { kind: "split", by: "random", branches: 3 }),
      node("a", "sms", { kind: "sms", text: "", alphaName: "", scheduledAt: "immediate" }),
      node("b", "email", { kind: "email", subject: "", body: "", sender: "" }),
      node("c", "push", { kind: "push", title: "", body: "" }),
    ];
    const edges = [
      edge("signal", "split"),
      edge("split", "a"),
      edge("split", "b"),
      edge("split", "c"),
    ];
    const { reach } = computeReach(nodes, edges, 900);
    expect(reach.a).toBe(300);
    expect(reach.b).toBe(300);
    expect(reach.c).toBe(300);
  });

  it("splits reach by segment shares when by=segment", () => {
    // segments max:600 high:300 mid:100 → shares 0.6 / 0.3 / 0.1 of 1000
    const nodes = [
      signalNode(1000, { max: 600, high: 300, mid: 100, low: 0 }),
      node("split", "split", { kind: "split", by: "segment", branches: 3 }),
      node("a", "sms", { kind: "sms", text: "", alphaName: "", scheduledAt: "immediate" }),
      node("b", "email", { kind: "email", subject: "", body: "", sender: "" }),
      node("c", "push", { kind: "push", title: "", body: "" }),
    ];
    const edges = [
      edge("signal", "split"),
      edge("split", "a"),
      edge("split", "b"),
      edge("split", "c"),
    ];
    const { reach } = computeReach(nodes, edges, 1000);
    expect(reach.a).toBe(600);
    expect(reach.b).toBe(300);
    expect(reach.c).toBe(100);
  });

  it("falls back to even split when segment shares are all zero", () => {
    const nodes = [
      signalNode(900, EMPTY_SEG),
      node("split", "split", { kind: "split", by: "segment", branches: 3 }),
      node("a", "sms", { kind: "sms", text: "", alphaName: "", scheduledAt: "immediate" }),
      node("b", "email", { kind: "email", subject: "", body: "", sender: "" }),
      node("c", "push", { kind: "push", title: "", body: "" }),
    ];
    const edges = [
      edge("signal", "split"),
      edge("split", "a"),
      edge("split", "b"),
      edge("split", "c"),
    ];
    const { reach } = computeReach(nodes, edges, 900);
    expect(reach.a).toBe(300);
    expect(reach.b).toBe(300);
    expect(reach.c).toBe(300);
  });

  it("sums incoming reach at a merge node", () => {
    const nodes = [
      signalNode(1000),
      node("split", "split", { kind: "split", by: "random", branches: 2 }),
      node("a", "email", { kind: "email", subject: "", body: "", sender: "" }),
      node("b", "push", { kind: "push", title: "", body: "" }),
      node("merge", "merge", { kind: "merge" }),
    ];
    const edges = [
      edge("signal", "split"),
      edge("split", "a"),
      edge("split", "b"),
      edge("a", "merge"),
      edge("b", "merge"),
    ];
    const { reach } = computeReach(nodes, edges, 1000);
    expect(reach.merge).toBe(1000); // 500 + 500
  });
});

// ── computeCampaignCost ───────────────────────────────────────────────────────

describe("computeCampaignCost", () => {
  // Контрольный пример «Первая сделка», N = 4000.
  function firstDealGraph() {
    const nodes = [
      signalNode(4000),
      node("sms", "sms", { kind: "sms", text: "", alphaName: "", scheduledAt: "immediate" }, "Промо"),
      node("cond", "condition", { kind: "condition", trigger: "opened" }),
      node("landing", "landing", { kind: "landing", cta: "", offerTitle: "" }),
      node("push", "push", { kind: "push", title: "", body: "" }, "Напомни"),
    ];
    const edges = [
      edge("signal", "sms"),
      edge("sms", "cond"),
      edge("cond", "landing"),
      edge("cond", "push"),
    ];
    return { nodes, edges };
  }

  it("reproduces the spec control example", () => {
    const { nodes, edges } = firstDealGraph();
    const cost = computeCampaignCost(nodes, edges, 4000);
    expect(cost.primary).toBe(20000);
    expect(cost.repeat).toBe(600);
    expect(cost.total).toBe(20600);
    expect(cost.hasDynamic).toBe(true);
  });

  it("emits one priced line per communication node only", () => {
    const { nodes, edges } = firstDealGraph();
    const cost = computeCampaignCost(nodes, edges, 4000);
    const ids = cost.lines.map((l) => l.nodeId).sort();
    expect(ids).toEqual(["push", "sms"]); // landing (web) excluded
  });

  it("describes each line with channel, label, unit, reach and sum", () => {
    const { nodes, edges } = firstDealGraph();
    const cost = computeCampaignCost(nodes, edges, 4000);
    const sms = cost.lines.find((l) => l.nodeId === "sms")!;
    expect(sms).toMatchObject({
      channel: "sms",
      label: "Промо",
      unit: 5,
      reach: 4000,
      sum: 20000,
      isDynamic: false,
    });
    const push = cost.lines.find((l) => l.nodeId === "push")!;
    expect(push).toMatchObject({ channel: "push", isDynamic: true, sum: 600 });
  });

  it("has no repeat buffer when no communication sits behind a condition", () => {
    const nodes = [
      signalNode(1000),
      node("sms", "sms", { kind: "sms", text: "", alphaName: "", scheduledAt: "immediate" }),
      node("success", "success", { kind: "success", goal: "" }),
    ];
    const edges = [edge("signal", "sms"), edge("sms", "success")];
    const cost = computeCampaignCost(nodes, edges, 1000);
    expect(cost.repeat).toBe(0);
    expect(cost.hasDynamic).toBe(false);
    expect(cost.total).toBe(5000);
  });

  it("returns zeros for an empty audience", () => {
    const { nodes, edges } = firstDealGraph();
    const cost = computeCampaignCost(nodes, edges, 0);
    expect(cost.total).toBe(0);
    expect(cost.primary).toBe(0);
    expect(cost.repeat).toBe(0);
  });
});

// ── estimateTouches (moved from campaign-payment-math) ────────────────────────

describe("estimateTouches", () => {
  it("returns 0 for budget <= 0", () => {
    expect(estimateTouches(0, 1000)).toBe(0);
    expect(estimateTouches(-50, 1000)).toBe(0);
  });

  it("returns floor(budget / reference unit) when audience is large", () => {
    expect(estimateTouches(100, 1000)).toBe(20); // 100 / 5
  });

  it("caps at audienceSize when budget would buy more touches", () => {
    expect(estimateTouches(10000, 1000)).toBe(1000);
  });

  it("uses floor for non-divisible budgets", () => {
    expect(estimateTouches(17, 1000)).toBe(3); // 17 / 5 → 3.4 → 3
  });

  it("returns 0 when audienceSize is 0", () => {
    expect(estimateTouches(100, 0)).toBe(0);
  });
});

// ── repeat = non-first-time communications (aim #3) ─────────────────────────────

describe("repeat = non-first-time communications (aim #3)", () => {
  it("splits cost lines into primary (first touch) and repeat (post-condition) buckets", () => {
    // Graph: signal → sms (first touch) → condition → push (repeat, post-condition).
    const nodes = [
      signalNode(1000),
      node("sms", "sms", { kind: "sms", text: "", alphaName: "", scheduledAt: "immediate" }),
      node("cond", "condition", { kind: "condition", field: "", op: "exists", value: "" }),
      node("push", "push", { kind: "push", title: "", text: "", scheduledAt: "immediate" }),
    ];
    const edges = [edge("signal", "sms"), edge("sms", "cond"), edge("cond", "push")];

    const cost = computeCampaignCost(nodes, edges, 1000);
    const smsLine = cost.lines.find((l) => l.channel === "sms")!;
    const pushLine = cost.lines.find((l) => l.channel === "push")!;

    // SMS is the first touch → not dynamic → counts toward primary.
    expect(smsLine.isDynamic).toBe(false);
    // Push sits after the condition → a repeat (non-first-time) communication.
    expect(pushLine.isDynamic).toBe(true);
    // Buckets reflect the split.
    expect(cost.primary).toBe(smsLine.sum);
    expect(cost.repeat).toBe(pushLine.sum);
    expect(cost.hasDynamic).toBe(true);
  });
});
