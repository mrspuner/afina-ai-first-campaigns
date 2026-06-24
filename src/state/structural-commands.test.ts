import { describe, it, expect } from "vitest";
import {
  parseStructuralCommands,
  applyOps,
  normalizeNodeRef,
  diffChangedNodeIds,
  relayoutGraph,
} from "./structural-commands";
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

describe("parseStructuralCommands", () => {
  it("parses simple add after", () => {
    const r = parseStructuralCommands("добавь Email после СМС");
    expect(r.ops).toEqual([
      {
        kind: "add",
        nodeType: "email",
        placement: { mode: "after", ref: "СМС" },
        inlineParams: undefined,
      },
    ]);
  });

  it("parses add before", () => {
    const r = parseStructuralCommands("вставь Push перед Успех");
    expect(r.ops[0]).toMatchObject({
      kind: "add",
      nodeType: "push",
      placement: { mode: "before", ref: "Успех" },
    });
  });

  it("parses add between", () => {
    const r = parseStructuralCommands("добавь Задержка между СМС и Email");
    expect(r.ops[0]).toMatchObject({
      kind: "add",
      nodeType: "wait",
      placement: { mode: "between", refA: "СМС", refB: "Email" },
    });
  });

  it("parses add with auto placement", () => {
    const r = parseStructuralCommands("добавь Email");
    expect(r.ops[0]).toMatchObject({
      kind: "add",
      nodeType: "email",
      placement: { mode: "auto" },
    });
  });

  it("captures inline params in add", () => {
    const r = parseStructuralCommands("добавь задержка 2 часа после СМС");
    expect(r.ops[0]).toMatchObject({
      kind: "add",
      nodeType: "wait",
      placement: { mode: "after", ref: "СМС" },
      inlineParams: "2 часа",
    });
  });

  it("parses remove", () => {
    const r = parseStructuralCommands("убери Push");
    expect(r.ops[0]).toEqual({ kind: "remove", ref: "Push" });
  });

  it("parses remove with multi-word ref", () => {
    const r = parseStructuralCommands("удали Задержка 3");
    expect(r.ops[0]).toEqual({ kind: "remove", ref: "Задержка 3" });
  });

  it("parses replace", () => {
    const r = parseStructuralCommands("замени СМС на Push");
    expect(r.ops[0]).toEqual({
      kind: "replace",
      ref: "СМС",
      newType: "push",
      inlineParams: undefined,
    });
  });

  it("parses replace with inline params", () => {
    const r = parseStructuralCommands("замени СМС на email тема: скидка");
    expect(r.ops[0]).toMatchObject({
      kind: "replace",
      ref: "СМС",
      newType: "email",
      inlineParams: "тема: скидка",
    });
  });

  it("splits multi-op by comma", () => {
    const r = parseStructuralCommands("добавь Email после СМС, убери Push");
    expect(r.ops).toHaveLength(2);
  });

  it("splits multi-op by 'и'", () => {
    const r = parseStructuralCommands("убери Push и убери Email");
    expect(r.ops).toHaveLength(2);
  });

  it("ignores @-segments", () => {
    const r = parseStructuralCommands("@СМС текст: новый, добавь Email после СМС");
    expect(r.ops).toHaveLength(1);
    expect(r.ops[0].kind).toBe("add");
  });

  it("treats verbs inside @-segment as content", () => {
    const r = parseStructuralCommands("@СМС добавь скидку 20%");
    expect(r.ops).toHaveLength(0);
  });

  it("returns unrecognized for non-structural non-tag", () => {
    const r = parseStructuralCommands("какая-то ерунда");
    expect(r.ops).toHaveLength(0);
    expect(r.unrecognized).toContain("какая-то ерунда");
  });

  it("rejects unknown type", () => {
    const r = parseStructuralCommands("добавь Виноват после СМС");
    expect(r.ops).toHaveLength(0);
    expect(r.unrecognized).toHaveLength(1);
  });

  it("case-insensitive verbs and types", () => {
    const r = parseStructuralCommands("ДОБАВЬ email ПОСЛЕ смс");
    expect(r.ops[0]).toMatchObject({ kind: "add", nodeType: "email" });
  });
});

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

describe("applyOps", () => {
  it("ADD after — splits the outgoing edge through new node", () => {
    const r = applyOps(makeGraph(), [
      {
        kind: "add",
        nodeType: "email",
        placement: { mode: "after", ref: "СМС" },
      },
    ]);
    expect(r.applied).toHaveLength(1);
    expect(r.graph.nodes).toHaveLength(4);
    const newEdges = r.graph.edges;
    expect(
      newEdges.find((e) => e.source === "sms1" && e.target === "success")
    ).toBeUndefined();
    const newEmail = r.graph.nodes.find((n) => n.data.nodeType === "email")!;
    expect(
      newEdges.find((e) => e.source === "sms1" && e.target === newEmail.id)
    ).toBeDefined();
    expect(
      newEdges.find((e) => e.source === newEmail.id && e.target === "success")
    ).toBeDefined();
  });

  it("ADD before — splits incoming edges", () => {
    const r = applyOps(makeGraph(), [
      {
        kind: "add",
        nodeType: "push",
        placement: { mode: "before", ref: "Успех" },
      },
    ]);
    expect(r.applied).toHaveLength(1);
    const push = r.graph.nodes.find((n) => n.data.nodeType === "push")!;
    expect(
      r.graph.edges.find((e) => e.source === push.id && e.target === "success")
    ).toBeDefined();
  });

  it("ADD between — replaces specific edge", () => {
    const r = applyOps(makeGraph(), [
      {
        kind: "add",
        nodeType: "wait",
        placement: { mode: "between", refA: "Сигнал", refB: "СМС" },
      },
    ]);
    expect(r.applied).toHaveLength(1);
  });

  it("ADD with inline params disables needsAttention", () => {
    const r = applyOps(makeGraph(), [
      {
        kind: "add",
        nodeType: "wait",
        placement: { mode: "after", ref: "СМС" },
        inlineParams: "2 часа",
      },
    ]);
    const wait = r.graph.nodes.find((n) => n.data.nodeType === "wait")!;
    expect(wait.data.needsAttention).toBeFalsy();
  });

  it("ADD without inline params sets needsAttention", () => {
    const r = applyOps(makeGraph(), [
      {
        kind: "add",
        nodeType: "email",
        placement: { mode: "after", ref: "СМС" },
      },
    ]);
    const email = r.graph.nodes.find((n) => n.data.nodeType === "email")!;
    expect(email.data.needsAttention).toBe(true);
    expect(email.data.attentionReason).toContain("Заполните параметры");
  });

  it("REMOVE simple 1×1 → clean bypass", () => {
    const r = applyOps(makeGraph(), [{ kind: "remove", ref: "СМС" }]);
    expect(r.applied).toHaveLength(1);
    expect(r.graph.nodes.find((n) => n.id === "sms1")).toBeUndefined();
    expect(
      r.graph.edges.find((e) => e.source === "signal" && e.target === "success")
    ).toBeDefined();
  });

  it("REMOVE Сигнал → skipped", () => {
    const r = applyOps(makeGraph(), [{ kind: "remove", ref: "Сигнал" }]);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toContain("точка входа");
  });

  it("REMOVE Успех → skipped", () => {
    const r = applyOps(makeGraph(), [{ kind: "remove", ref: "Успех" }]);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped[0].reason).toContain("финальная нода");
  });

  it("relayouts the graph after a successful op (BFS depth columns)", () => {
    const r = applyOps(makeGraph(), [
      { kind: "add", nodeType: "email", placement: { mode: "after", ref: "СМС" } },
    ]);
    expect(r.applied).toHaveLength(1);
    const byLabel = (lbl: string) =>
      r.graph.nodes.find((n) => (n.data as { label: string }).label === lbl)!;
    expect(byLabel("Сигнал").position.x).toBe(0);
    expect(byLabel("СМС").position.x).toBe(200);
    expect(byLabel("Email").position.x).toBe(400);
    expect(byLabel("Успех").position.x).toBe(600);
  });

  it("REMOVE unknown ref → skipped", () => {
    const r = applyOps(makeGraph(), [{ kind: "remove", ref: "Виноват" }]);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped[0].reason).toContain("нет такой ноды");
  });

  it("REPLACE keeps id and edges", () => {
    const r = applyOps(makeGraph(), [
      { kind: "replace", ref: "СМС", newType: "email" },
    ]);
    expect(r.applied).toHaveLength(1);
    const email = r.graph.nodes.find((n) => n.id === "sms1")!;
    expect(email.data.nodeType).toBe("email");
    expect(
      r.graph.edges.find((e) => e.source === "signal" && e.target === "sms1")
    ).toBeDefined();
    expect(
      r.graph.edges.find((e) => e.source === "sms1" && e.target === "success")
    ).toBeDefined();
  });

  it("REPLACE with inline params — no attention", () => {
    const r = applyOps(makeGraph(), [
      {
        kind: "replace",
        ref: "СМС",
        newType: "email",
        inlineParams: "тема: новая",
      },
    ]);
    const email = r.graph.nodes.find((n) => n.id === "sms1")!;
    expect(email.data.needsAttention).toBeFalsy();
  });

  it("multi-op accumulates in graph state", () => {
    const r = applyOps(makeGraph(), [
      {
        kind: "add",
        nodeType: "email",
        placement: { mode: "after", ref: "СМС" },
      },
      { kind: "remove", ref: "СМС" },
    ]);
    expect(r.applied).toHaveLength(2);
  });
});

describe("normalizeNodeRef", () => {
  it("lowercases", () => {
    expect(normalizeNodeRef("Email")).toBe("email");
    expect(normalizeNodeRef("СМС")).toBe("смс");
  });

  it("maps English variants to Russian canonical", () => {
    expect(normalizeNodeRef("sms")).toBe("смс");
    expect(normalizeNodeRef("wait")).toBe("задержка");
    expect(normalizeNodeRef("email")).toBe("email");
    expect(normalizeNodeRef("success")).toBe("успех");
  });

  it("maps Russian variants to English canonical", () => {
    expect(normalizeNodeRef("почта")).toBe("email");
    expect(normalizeNodeRef("пуш")).toBe("push");
  });

  it("preserves suffix numbers", () => {
    expect(normalizeNodeRef("Email 2")).toBe("email 2");
    expect(normalizeNodeRef("почта 2")).toBe("email 2");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeNodeRef("")).toBe("");
    expect(normalizeNodeRef("   ")).toBe("");
  });
});

describe("applyOps — ref normalization", () => {
  it("REMOVE matches node ignoring case", () => {
    const r = applyOps(makeGraph(), [{ kind: "remove", ref: "смс" }]);
    expect(r.applied).toHaveLength(1);
    expect(r.graph.nodes.find((n) => n.id === "sms1")).toBeUndefined();
  });

  it("REMOVE matches node via English synonym", () => {
    const r = applyOps(makeGraph(), [{ kind: "remove", ref: "sms" }]);
    expect(r.applied).toHaveLength(1);
    expect(r.graph.nodes.find((n) => n.id === "sms1")).toBeUndefined();
  });

  it("ADD after accepts lowercase ref", () => {
    const r = applyOps(makeGraph(), [
      {
        kind: "add",
        nodeType: "email",
        placement: { mode: "after", ref: "смс" },
      },
    ]);
    expect(r.applied).toHaveLength(1);
  });

  it("ADD between accepts English synonyms for both refs", () => {
    const r = applyOps(makeGraph(), [
      {
        kind: "add",
        nodeType: "wait",
        placement: { mode: "between", refA: "signal", refB: "sms" },
      },
    ]);
    expect(r.applied).toHaveLength(1);
  });

  it("REPLACE accepts case-insensitive ref", () => {
    const r = applyOps(makeGraph(), [
      { kind: "replace", ref: "смс", newType: "email" },
    ]);
    expect(r.applied).toHaveLength(1);
    const replaced = r.graph.nodes.find((n) => n.id === "sms1")!;
    expect(replaced.data.nodeType).toBe("email");
  });
});

describe("diffChangedNodeIds", () => {
  it("добавленная нода попадает в diff", () => {
    const old = makeGraph();
    // Добавляем email через applyOps, чтобы получить корректный новый граф.
    const { graph: newGraph } = applyOps(old, [
      { kind: "add", nodeType: "email", placement: { mode: "after", ref: "СМС" } },
    ]);
    const diff = diffChangedNodeIds(old, newGraph);
    const emailNode = newGraph.nodes.find((n) => n.data.nodeType === "email")!;
    expect(diff.has(emailNode.id)).toBe(true);
  });

  it("нода с изменённым nodeType (replace) попадает в diff", () => {
    const old = makeGraph();
    const { graph: newGraph } = applyOps(old, [
      { kind: "replace", ref: "СМС", newType: "email" },
    ]);
    const diff = diffChangedNodeIds(old, newGraph);
    // sms1 теперь стал email — nodeType изменился, должен быть в diff.
    expect(diff.has("sms1")).toBe(true);
  });

  it("неизменённые ноды не попадают в diff", () => {
    const old = makeGraph();
    const { graph: newGraph } = applyOps(old, [
      { kind: "add", nodeType: "email", placement: { mode: "after", ref: "СМС" } },
    ]);
    const diff = diffChangedNodeIds(old, newGraph);
    // signal, sms1, success не изменились.
    expect(diff.has("signal")).toBe(false);
    expect(diff.has("sms1")).toBe(false);
    expect(diff.has("success")).toBe(false);
  });

  it("пустой diff при идентичных графах", () => {
    const g = makeGraph();
    const diff = diffChangedNodeIds(g, g);
    expect(diff.size).toBe(0);
  });
});

describe("applyOps — резолв ноды по id (AI-путь)", () => {
  it("remove по id ноды", () => {
    const r = applyOps(makeGraph(), [{ kind: "remove", ref: "sms1" }]);
    expect(r.applied).toHaveLength(1);
    expect(r.graph.nodes.find((n) => n.id === "sms1")).toBeUndefined();
  });

  it("add after по id опорной ноды", () => {
    const r = applyOps(makeGraph(), [
      { kind: "add", nodeType: "email", placement: { mode: "after", ref: "signal" } },
    ]);
    expect(r.applied).toHaveLength(1);
    const email = r.graph.nodes.find((n) => n.data.nodeType === "email")!;
    expect(r.graph.edges.find((e) => e.source === "signal" && e.target === email.id)).toBeDefined();
  });

  it("несуществующий id → операция пропущена", () => {
    const r = applyOps(makeGraph(), [{ kind: "remove", ref: "n_does_not_exist" }]);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped).toHaveLength(1);
  });
});

// ── Task 3: addCondition op ───────────────────────────────────────────────────

import { validateAiGraph } from "./ai-graph-validation";

function node(id: string, nodeType: string, label = id): WorkflowNode {
  return {
    id,
    type: "workflowNode",
    position: { x: 0, y: 0 },
    data: { label, nodeType: nodeType as WorkflowNode["data"]["nodeType"] },
  };
}
function edge(source: string, target: string, label?: string): WorkflowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    type: "default",
    ...(label ? { label } : {}),
  };
}
// Linear graph: signal → sms → success, plus end leaf.
function linear(): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  return {
    nodes: [
      node("signal", "signal", "Сигнал"),
      node("sms", "sms", "СМС"),
      node("ok", "success", "Успех"),
      node("end", "end", "Конец"),
    ],
    edges: [edge("signal", "sms"), edge("sms", "ok")],
  };
}

describe("applyOps — addCondition", () => {
  it("вставляет condition после ref с двумя ветками YES/NO", () => {
    const g = linear();
    const res = applyOps(g, [
      { kind: "addCondition", ref: "sms", yesLabel: "Открыл", noLabel: "Не открыл" },
    ]);
    expect(res.skipped).toHaveLength(0);
    const cond = res.graph.nodes.find((n) => n.data.nodeType === "condition")!;
    expect(cond).toBeDefined();
    const outgoing = res.graph.edges.filter((e) => e.source === cond.id);
    expect(outgoing).toHaveLength(2);
    const labels = outgoing.map((e) => e.label).sort();
    expect(labels).toEqual(["Не открыл", "Открыл"]);
    // ref now points at the condition
    expect(res.graph.edges.some((e) => e.source === "sms" && e.target === cond.id)).toBe(true);
    // YES branch keeps the old successor (success); NO branch is a fresh end leaf
    const yes = outgoing.find((e) => e.label === "Открыл")!;
    expect(yes.target).toBe("ok");
  });

  it("результирующий граф проходит validateAiGraph (condition-degree==2)", () => {
    const g = linear();
    const res = applyOps(g, [{ kind: "addCondition", ref: "sms" }]);
    expect(validateAiGraph(res.graph).ok).toBe(true);
  });

  it("дефолтные метки YES/NO когда не заданы", () => {
    const res = applyOps(linear(), [{ kind: "addCondition", ref: "sms" }]);
    const cond = res.graph.nodes.find((n) => n.data.nodeType === "condition")!;
    const labels = res.graph.edges
      .filter((e) => e.source === cond.id)
      .map((e) => e.label)
      .sort();
    expect(labels).toEqual(["NO", "YES"]);
  });

  it("ошибка, если ref не имеет ровно одного выхода", () => {
    // success has 0 outgoing
    const res = applyOps(linear(), [{ kind: "addCondition", ref: "ok" }]);
    expect(res.skipped).toHaveLength(1);
    expect(res.applied).toHaveLength(0);
  });

  it("ошибка, если ref не найден", () => {
    const res = applyOps(linear(), [{ kind: "addCondition", ref: "нетакой" }]);
    expect(res.skipped).toHaveLength(1);
  });
});

// ── Block 7: replace на разветвляющий тип создаёт N веток ──────────────────────
describe("applyOps — replace на split разветвляет (block7, дефект 2)", () => {
  it("replace wait→split с 2 ветками: split имеет 2 исходящих ребра, не одно", () => {
    // graph: signal → wait → success
    const g = {
      nodes: [
        node("signal", "signal", "Сигнал"),
        node("w", "wait", "Задержка"),
        node("ok", "success", "Успех"),
      ],
      edges: [edge("signal", "w"), edge("w", "ok")],
    };
    const res = applyOps(g, [
      {
        kind: "replace",
        ref: "w",
        newType: "split",
        branches: [
          { label: "Высокий", channel: "sms" },
          { label: "Средний", channel: "ivr" },
        ],
      },
    ]);
    expect(res.skipped).toHaveLength(0);
    const split = res.graph.nodes.find((n) => n.data.nodeType === "split")!;
    expect(split).toBeDefined();
    const out = res.graph.edges.filter((e) => e.source === split.id);
    // ДЕФЕКТ 2: до фикса out.length === 1 (наследует одно ребро) → тест падает.
    expect(out).toHaveLength(2);
  });

  it("каждая ветка получает ноду своего канала (Высокий→СМС, Средний→Звонок)", () => {
    const g = {
      nodes: [
        node("signal", "signal", "Сигнал"),
        node("w", "wait", "Задержка"),
        node("ok", "success", "Успех"),
      ],
      edges: [edge("signal", "w"), edge("w", "ok")],
    };
    const res = applyOps(g, [
      {
        kind: "replace",
        ref: "w",
        newType: "split",
        branches: [
          { label: "Высокий", channel: "sms" },
          { label: "Средний", channel: "ivr" },
        ],
      },
    ]);
    const split = res.graph.nodes.find((n) => n.data.nodeType === "split")!;
    const out = res.graph.edges.filter((e) => e.source === split.id);
    // Метки веток — на рёбрах
    expect(out.map((e) => e.label).sort()).toEqual(["Высокий", "Средний"]);
    // Цели рёбер — ноды-каналы нужного типа
    const targetTypes = out
      .map((e) => res.graph.nodes.find((n) => n.id === e.target)!.data.nodeType)
      .sort();
    expect(targetTypes).toEqual(["ivr", "sms"]);
  });

  it("ни один end не имеет исходящих рёбер (терминал не в середине, дефект 1)", () => {
    const g = {
      nodes: [
        node("signal", "signal", "Сигнал"),
        node("w", "wait", "Задержка"),
        node("ok", "success", "Успех"),
      ],
      edges: [edge("signal", "w"), edge("w", "ok")],
    };
    const res = applyOps(g, [
      {
        kind: "replace",
        ref: "w",
        newType: "split",
        branches: [
          { label: "Высокий", channel: "sms" },
          { label: "Средний", channel: "ivr" },
        ],
      },
    ]);
    const endIds = new Set(
      res.graph.nodes.filter((n) => n.data.nodeType === "end").map((n) => n.id)
    );
    for (const e of res.graph.edges) {
      expect(endIds.has(e.source), `end ${e.source} имеет исходящее ребро`).toBe(false);
    }
  });

  it("результирующий граф валиден (validateAiGraph.ok)", () => {
    const g = {
      nodes: [
        node("signal", "signal", "Сигнал"),
        node("w", "wait", "Задержка"),
        node("ok", "success", "Успех"),
      ],
      edges: [edge("signal", "w"), edge("w", "ok")],
    };
    const res = applyOps(g, [
      {
        kind: "replace",
        ref: "w",
        newType: "split",
        branches: [
          { label: "Высокий", channel: "sms" },
          { label: "Средний", channel: "ivr" },
        ],
      },
    ]);
    expect(validateAiGraph(res.graph).ok).toBe(true);
  });
});

// ── Block 7: инвариант размещения терминалов в relayoutGraph (дефект 1) ────────
describe("relayoutGraph — терминалы (block7, дефект 1)", () => {
  it("end-нода в конце ветки лежит правее своего предка, не в первых колонках", () => {
    // signal → split →[A] sms → end ; split →[B] end2
    const g = {
      nodes: [
        node("signal", "signal", "Сигнал"),
        node("sp", "split", "Сплиттер"),
        node("ch", "sms", "СМС"),
        node("e1", "end", "Конец"),
        node("e2", "end", "Конец 2"),
      ],
      edges: [
        edge("signal", "sp"),
        edge("sp", "ch", "A"),
        edge("ch", "e1"),
        edge("sp", "e2", "B"),
      ],
    };
    const out = relayoutGraph(g);
    const x = (id: string) => out.nodes.find((n) => n.id === id)!.position.x;
    // Терминал e1 правее своего предка ch; ни один end не в колонке signal(0).
    expect(x("e1")).toBeGreaterThan(x("ch"));
    expect(x("e1")).toBeGreaterThan(x("signal"));
    expect(x("e2")).toBeGreaterThan(x("signal"));
  });
});

// ── Block 7: e2e сценарий пользователя «замени задержку на сплиттер» ───────────
describe("applyOps — сценарий пользователя «замени задержку на сплиттер» (block7 e2e)", () => {
  function flowWithLandingWait() {
    return {
      nodes: [
        node("signal", "signal", "Сигнал"),
        node("land", "landing", "Лендинг"),
        node("w", "wait", "Задержка"),
        node("ok", "success", "Успех"),
      ],
      edges: [edge("signal", "land"), edge("land", "w"), edge("w", "ok")],
    };
  }

  it("(a) split имеет 2 различные исходящие ветки", () => {
    const res = applyOps(flowWithLandingWait(), [
      {
        kind: "replace",
        ref: "w",
        newType: "split",
        branches: [
          { label: "Высокий", channel: "sms" },
          { label: "Средний", channel: "ivr" },
        ],
      },
    ]);
    const sp = res.graph.nodes.find((n) => n.data.nodeType === "split")!;
    const out = res.graph.edges.filter((e) => e.source === sp.id);
    expect(out).toHaveLength(2);
    expect(new Set(out.map((e) => e.target)).size).toBe(2); // различные цели
  });

  it("(b) каждая ветка — нода своего канала", () => {
    const res = applyOps(flowWithLandingWait(), [
      {
        kind: "replace",
        ref: "w",
        newType: "split",
        branches: [
          { label: "Высокий", channel: "sms" },
          { label: "Средний", channel: "ivr" },
        ],
      },
    ]);
    const sp = res.graph.nodes.find((n) => n.data.nodeType === "split")!;
    const targets = res.graph.edges
      .filter((e) => e.source === sp.id)
      .map((e) => res.graph.nodes.find((n) => n.id === e.target)!.data.nodeType)
      .sort();
    expect(targets).toEqual(["ivr", "sms"]);
  });

  it("(c) ни один терминал не в середине (у end нет исходящих)", () => {
    const res = applyOps(flowWithLandingWait(), [
      {
        kind: "replace",
        ref: "w",
        newType: "split",
        branches: [
          { label: "Высокий", channel: "sms" },
          { label: "Средний", channel: "ivr" },
        ],
      },
    ]);
    const ends = new Set(
      res.graph.nodes.filter((n) => n.data.nodeType === "end").map((n) => n.id)
    );
    expect(res.graph.edges.every((e) => !ends.has(e.source))).toBe(true);
    // Лендинг по-прежнему ведёт в split, не в Успех/Конец напрямую
    const sp = res.graph.nodes.find((n) => n.data.nodeType === "split")!;
    expect(res.graph.edges.some((e) => e.source === "land" && e.target === sp.id)).toBe(true);
  });

  it("(d) граф валиден и Успех не осиротел (keepTarget)", () => {
    const res = applyOps(flowWithLandingWait(), [
      {
        kind: "replace",
        ref: "w",
        newType: "split",
        branches: [
          { label: "Высокий", channel: "sms" },
          { label: "Средний", channel: "ivr" },
        ],
      },
    ]);
    expect(validateAiGraph(res.graph).ok).toBe(true);
    // success достижим (первая ветка подключена к нему через keepTarget)
    const reachableTargets = new Set(res.graph.edges.map((e) => e.target));
    expect(reachableTargets.has("ok")).toBe(true);
  });
});
