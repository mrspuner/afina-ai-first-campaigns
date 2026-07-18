import { describe, it, expect } from "vitest";
import {
  applyStructuralOps,
  applyRebuild,
  buildStructuralOpsReply,
} from "./graph-applier";
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

// Same fixture shape as src/state/structural-commands.test.ts — pins the
// exact behavior of the useEffect that used to live in workflow-view.tsx
// (structuralOps effect ~462-526, rebuild effect ~528-551).
function makeGraph(): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  return {
    nodes: [
      {
        id: "signal",
        type: "workflowNode",
        position: { x: 0, y: 0 },
        data: {
          label: "Сигнал",
          nodeType: "signal",
          params: {
            kind: "signal",
            fileName: "x.json",
            count: 0,
            segments: { max: 0, high: 0, mid: 0, low: 0 },
          },
        },
      },
      {
        id: "sms1",
        type: "workflowNode",
        position: { x: 200, y: 0 },
        data: {
          label: "СМС",
          nodeType: "sms",
          params: {
            kind: "sms",
            text: "hi",
            alphaName: "BRAND",
            scheduledAt: "immediate",
          },
        },
      },
      {
        id: "success",
        type: "workflowNode",
        position: { x: 400, y: 0 },
        data: {
          label: "Успех",
          nodeType: "success",
          isSuccess: true,
          params: { kind: "success", goal: "Test" },
        },
      },
    ],
    edges: [
      { id: "e1", source: "signal", target: "sms1", type: "default" },
      { id: "e2", source: "sms1", target: "success", type: "default" },
    ],
  };
}

describe("applyStructuralOps", () => {
  it("ADD — inserts a node, marks it changed, and builds a single-line reply", () => {
    const graph = makeGraph();
    const r = applyStructuralOps(graph, [
      {
        kind: "add",
        nodeType: "email",
        placement: { mode: "after", ref: "СМС" },
      },
    ]);
    expect(r.graph.nodes).toHaveLength(4);
    const newEmail = r.graph.nodes.find((n) => n.data.nodeType === "email")!;
    expect(newEmail).toBeDefined();
    expect(r.changedIds.has(newEmail.id)).toBe(true);
    expect(r.appliedCount).toBe(1);
    expect(r.skippedCount).toBe(0);
    expect(r.reply).toBe(`Добавил Email после СМС`);
    // Original graph is untouched (pure function).
    expect(graph.nodes).toHaveLength(3);
  });

  it("REMOVE — deletes the node and reports it in the reply", () => {
    const graph = makeGraph();
    const r = applyStructuralOps(graph, [{ kind: "remove", ref: "СМС" }]);
    expect(r.graph.nodes.find((n) => n.id === "sms1")).toBeUndefined();
    expect(r.appliedCount).toBe(1);
    expect(r.reply).toBe("Убрал СМС");
    // Bypass edge signal → success exists after removal.
    expect(
      r.graph.edges.find((e) => e.source === "signal" && e.target === "success")
    ).toBeDefined();
  });

  it("REPLACE — changed set includes the replaced node id (reorder/retype)", () => {
    const graph = makeGraph();
    const r = applyStructuralOps(graph, [
      { kind: "replace", ref: "СМС", newType: "email" },
    ]);
    expect(r.changedIds.has("sms1")).toBe(true);
    expect(r.graph.nodes.find((n) => n.id === "sms1")!.data.nodeType).toBe(
      "email"
    );
  });

  it("multiple ops — joins reply with bullet lines", () => {
    const graph = makeGraph();
    const r = applyStructuralOps(graph, [
      { kind: "add", nodeType: "email", placement: { mode: "after", ref: "СМС" } },
      { kind: "add", nodeType: "push", placement: { mode: "before", ref: "Успех" } },
    ]);
    expect(r.appliedCount).toBe(2);
    expect(r.reply).toBe(
      "Готово:\n• Добавил Email после СМС\n• Добавил Push перед Успех"
    );
  });

  it("all ops skipped — appliedCount 0, reply lists reasons, graph unchanged", () => {
    const graph = makeGraph();
    const r = applyStructuralOps(graph, [{ kind: "remove", ref: "Сигнал" }]);
    expect(r.appliedCount).toBe(0);
    expect(r.skippedCount).toBe(1);
    expect(r.changedIds.size).toBe(0);
    expect(r.reply).toBe("Не выполнено:\n• Сигнал — точка входа, удалять нельзя");
    expect(r.graph.nodes).toHaveLength(3);
  });

  it("empty applied AND empty skipped → reply is null", () => {
    const graph = makeGraph();
    const r = applyStructuralOps(graph, []);
    expect(r.appliedCount).toBe(0);
    expect(r.skippedCount).toBe(0);
    expect(r.reply).toBeNull();
  });
});

describe("buildStructuralOpsReply", () => {
  it("empty applied/skipped → empty string", () => {
    expect(buildStructuralOpsReply([], [])).toBe("");
  });
});

describe("applyRebuild", () => {
  it("swaps in the rebuilt nodes/edges wholesale and marks every node changed", () => {
    const rebuild = {
      nodes: makeGraph().nodes,
      edges: makeGraph().edges,
      assumptions: "Взял дефолтные каналы.",
    };
    const r = applyRebuild(rebuild);
    expect(r.graph.nodes).toBe(rebuild.nodes);
    expect(r.graph.edges).toBe(rebuild.edges);
    expect(r.changedIds).toEqual(new Set(["signal", "sms1", "success"]));
    expect(r.reply).toBe("Собрал заново. Взял дефолтные каналы.");
  });
});
