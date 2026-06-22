import { describe, expect, it } from "vitest";
import { rebuildGraphSchema, buildGraphFromSpec } from "./rebuild-schema";

// Базовая спека: push → wait → email → success + end, рёбра от signal
const validSpec = {
  nodes: [
    { key: "p1", nodeType: "push" as const, label: "Push-уведомление" },
    { key: "w1", nodeType: "wait" as const, label: "Задержка", sublabel: "24 часа" },
    { key: "e1", nodeType: "email" as const, label: "Email" },
    { key: "s1", nodeType: "success" as const, label: "Успех" },
    { key: "end1", nodeType: "end" as const, label: "Конец" },
  ],
  edges: [
    { from: "signal", to: "p1" },
    { from: "p1", to: "w1" },
    { from: "w1", to: "e1" },
    { from: "e1", to: "s1" },
    { from: "e1", to: "end1" },
  ],
  assumptions: "Линейный сценарий без условий",
};

describe("rebuildGraphSchema", () => {
  it("валидная спека парсится", () => {
    const r = rebuildGraphSchema.safeParse(validSpec);
    expect(r.success).toBe(true);
  });

  it("nodeType 'signal' в nodes отклоняется", () => {
    const bad = {
      ...validSpec,
      nodes: [
        { key: "sig", nodeType: "signal", label: "Сигнал" },
        { key: "end", nodeType: "end", label: "Конец" },
      ],
    };
    const r = rebuildGraphSchema.safeParse(bad);
    expect(r.success).toBe(false);
  });

  it("пустой массив nodes отклоняется (min 2)", () => {
    const r = rebuildGraphSchema.safeParse({ ...validSpec, nodes: [] });
    expect(r.success).toBe(false);
  });

  it("пустой массив edges отклоняется (min 1)", () => {
    const r = rebuildGraphSchema.safeParse({ ...validSpec, edges: [] });
    expect(r.success).toBe(false);
  });
});

describe("buildGraphFromSpec", () => {
  const signal = { label: "Сигнал теста", sublabel: "Тест" };

  it("первая нода — signal", () => {
    const graph = buildGraphFromSpec(validSpec, signal);
    expect(graph.nodes[0].id).toBe("signal");
    expect(graph.nodes[0].data.nodeType).toBe("signal");
    expect(graph.nodes[0].data.label).toBe("Сигнал теста");
    expect(graph.nodes[0].data.sublabel).toBe("Тест");
  });

  it("у success isSuccess: true", () => {
    const graph = buildGraphFromSpec(validSpec, signal);
    const successNode = graph.nodes.find((n) => n.data.nodeType === "success");
    expect(successNode).toBeDefined();
    expect(successNode!.data.isSuccess).toBe(true);
  });

  it("у остальных нод isSuccess не задан", () => {
    const graph = buildGraphFromSpec(validSpec, signal);
    const nonSuccess = graph.nodes.filter((n) => n.data.nodeType !== "success");
    for (const n of nonSuccess) {
      expect(n.data.isSuccess).toBeUndefined();
    }
  });

  it("ребро {from:'signal', to:'p1'} → {source:'signal', target:'n_p1'}", () => {
    const graph = buildGraphFromSpec(validSpec, signal);
    const edge = graph.edges.find((e) => e.source === "signal");
    expect(edge).toBeDefined();
    expect(edge!.target).toBe("n_p1");
  });

  it("у каждой ноды есть params", () => {
    const graph = buildGraphFromSpec(validSpec, signal);
    for (const n of graph.nodes) {
      expect(n.data.params).toBeDefined();
      expect(typeof (n.data.params as { kind: string }).kind).toBe("string");
    }
  });

  it("id нод из spec формируются с префиксом n_", () => {
    const graph = buildGraphFromSpec(validSpec, signal);
    const specNodes = graph.nodes.slice(1); // пропускаем signal
    expect(specNodes[0].id).toBe("n_p1");
    expect(specNodes[1].id).toBe("n_w1");
    expect(specNodes[2].id).toBe("n_e1");
  });

  it("sublabel пробрасывается в ноду", () => {
    const graph = buildGraphFromSpec(validSpec, signal);
    const waitNode = graph.nodes.find((n) => n.id === "n_w1");
    expect(waitNode!.data.sublabel).toBe("24 часа");
  });

  it("всего нод = 1 (signal) + количество из spec", () => {
    const graph = buildGraphFromSpec(validSpec, signal);
    expect(graph.nodes).toHaveLength(validSpec.nodes.length + 1);
  });

  it("количество рёбер соответствует spec.edges", () => {
    const graph = buildGraphFromSpec(validSpec, signal);
    expect(graph.edges).toHaveLength(validSpec.edges.length);
  });
});

// ── Тесты BFS-раскладки (Task 1: layout fix) ─────────────────────────────────

const branchSpec = {
  nodes: [
    { key: "c1", nodeType: "condition" as const, label: "Открыл письмо?" },
    { key: "s1", nodeType: "success" as const, label: "Успех" },
    { key: "end1", nodeType: "end" as const, label: "Конец" },
  ],
  edges: [
    { from: "signal", to: "c1" },
    { from: "c1", to: "s1", label: "YES" },
    { from: "c1", to: "end1", label: "NO" },
  ],
  assumptions: "Условие с двумя ветками",
};

describe("buildGraphFromSpec — BFS layout", () => {
  const signal = { label: "Сигнал" };

  it("ветки условия раскладываются в одну колонку, но на разных Y (не линейно)", () => {
    const graph = buildGraphFromSpec(branchSpec, signal);
    const s1 = graph.nodes.find((n) => n.id === "n_s1")!;
    const end1 = graph.nodes.find((n) => n.id === "n_end1")!;
    expect(s1.position.x).toBe(end1.position.x); // same BFS depth → same column
    expect(s1.position.y).not.toBe(end1.position.y); // stacked, not flat
  });

  it("X растёт по глубине BFS, а не по индексу ноды в массиве", () => {
    const graph = buildGraphFromSpec(branchSpec, signal);
    const signalNode = graph.nodes.find((n) => n.id === "signal")!;
    const c1 = graph.nodes.find((n) => n.id === "n_c1")!;
    const s1 = graph.nodes.find((n) => n.id === "n_s1")!;
    expect(signalNode.position.x).toBeLessThan(c1.position.x);
    expect(c1.position.x).toBeLessThan(s1.position.x);
  });
});
