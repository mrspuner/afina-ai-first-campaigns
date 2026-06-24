import { describe, it, expect } from "vitest";
import { TEMPLATE_BY_TYPE, createTemplate } from "./workflow-templates";
import { validateWorkflow } from "./workflow-validation";
import type { SignalType } from "./app-state";

const SIGNAL_TYPES: SignalType[] = [
  "Регистрация",
  "Первая сделка",
  "Апсейл",
  "Реактивация",
  "Возврат",
  "Удержание",
];

describe("workflow templates", () => {
  it.each(SIGNAL_TYPES)("creates a valid template for %s", (type) => {
    const t = createTemplate(type);
    expect(t.nodes.length).toBeGreaterThan(2);

    // at least one success node
    const successNodes = t.nodes.filter((n) => n.data.isSuccess);
    expect(successNodes.length).toBeGreaterThanOrEqual(1);

    // all ids unique
    const ids = t.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);

    // edges reference existing nodes
    const idSet = new Set(ids);
    for (const edge of t.edges) {
      expect(idSet.has(edge.source)).toBe(true);
      expect(idSet.has(edge.target)).toBe(true);
    }

    // graph validates ok with signal bound
    const v = validateWorkflow(t, true);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("exports all 6 types in TEMPLATE_BY_TYPE", () => {
    expect(Object.keys(TEMPLATE_BY_TYPE)).toHaveLength(6);
    for (const type of SIGNAL_TYPES) {
      expect(TEMPLATE_BY_TYPE[type]).toBeTypeOf("function");
    }
  });

  // The graph entry node is now typed `source` (replaces the legacy `signal`
  // root). Its params stay the `signal` NodeParams member — there is no
  // `source` params kind — so it is exempt from the params.kind===nodeType
  // invariant below.
  it.each(SIGNAL_TYPES)("entry node of %s is of type source", (type) => {
    const { nodes } = createTemplate(type);
    expect(nodes[0].data.nodeType).toBe("source");
  });

  // Block A5 — numeric-suffix rule: within a template, every label must be unique.
  // If the rule is applied correctly: single occurrence → bare canonical label,
  // multiple occurrences → "<label> 1", "<label> 2", … so all labels stay unique.
  it.each(SIGNAL_TYPES)("all labels are unique within %s template", (type) => {
    const t = createTemplate(type);
    const labels = t.nodes.map((n) => n.data.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("all template nodes have matching params.kind", () => {
  it.each(SIGNAL_TYPES)("template \"%s\" — каждая нода имеет params.kind === nodeType", (type) => {
    const { nodes } = createTemplate(type);
    for (const node of nodes) {
      expect(
        node.data.params,
        `node ${node.id} (${node.data.nodeType}) has no params`
      ).toBeDefined();
      if (node.data.params) {
        // Entry node is typed `source` but keeps the `signal` params member
        // (no `source` NodeParams kind exists). Exempt it from the invariant.
        const expectedKind =
          node.data.nodeType === "source" ? "signal" : node.data.nodeType;
        expect(node.data.params.kind).toBe(expectedKind);
      }
    }
  });
});

describe("graph path Файл → Скоринг → Сигнал → Коммуникация (group C #8)", () => {
  it.each(SIGNAL_TYPES)("entry node of %s is labelled «Файл»", (type) => {
    const { nodes } = createTemplate(type, "new");
    expect(nodes[0].data.label).toBe("Файл");
    expect(nodes[0].data.nodeType).toBe("source");
  });

  it("new/stream: path is Файл → Скоринг → Сигнал → <comm>", () => {
    for (const st of ["new", "stream"] as const) {
      const { nodes, edges } = createTemplate("Регистрация", st);
      const entry = nodes[0];
      const scoring = nodes.find((n) => n.data.nodeType === "scoring")!;
      const signal = nodes.find((n) => n.id === "signal_result")!;
      expect(scoring).toBeDefined();
      expect(signal.data.nodeType).toBe("signal");
      expect(signal.data.label).toBe("Сигнал");
      // entry → scoring → signal chain
      expect(edges.some((e) => e.source === entry.id && e.target === scoring.id)).toBe(true);
      expect(edges.some((e) => e.source === scoring.id && e.target === signal.id)).toBe(true);
    }
  });

  it("own: path is Файл → Сигнал → <comm> (no scoring)", () => {
    const { nodes, edges } = createTemplate("Регистрация", "own");
    expect(nodes.some((n) => n.data.nodeType === "scoring")).toBe(false);
    const entry = nodes[0];
    const signal = nodes.find((n) => n.id === "signal_result")!;
    expect(signal).toBeDefined();
    expect(edges.some((e) => e.source === entry.id && e.target === signal.id)).toBe(true);
  });

  it("scoring node carries ScoringParams (interests/triggers) and never needs attention", () => {
    const { nodes } = createTemplate("Регистрация", "new");
    const scoring = nodes.find((n) => n.data.nodeType === "scoring")!;
    expect(scoring.data.params).toMatchObject({ kind: "scoring", interests: [], triggers: [] });
    expect(scoring.data.needsAttention ?? false).toBe(false);
  });
});

describe("withScoring spacing (no overlap)", () => {
  it("keeps every adjacent node at least STEP apart on x", () => {
    const { nodes } = createTemplate("Регистрация", "new"); // new → has scoring
    const xs = [...new Set(nodes.map((n) => n.position.x))].sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(210);
    }
  });
});

describe("source-aware generation (A3)", () => {
  it("own source has NO scoring node", () => {
    const g = createTemplate("Регистрация", "own");
    expect(g.nodes.some((n) => n.data.nodeType === "scoring")).toBe(false);
  });
  it("new source inserts a scoring node after source", () => {
    const g = createTemplate("Регистрация", "new");
    const idx = g.nodes.findIndex((n) => n.data.nodeType === "scoring");
    expect(idx).toBeGreaterThan(-1);
  });
  it("stream source also inserts scoring", () => {
    const g = createTemplate("Регистрация", "stream");
    expect(g.nodes.some((n) => n.data.nodeType === "scoring")).toBe(true);
  });
  it("entry node stays type source even after scoring insertion", () => {
    const g = createTemplate("Регистрация", "new");
    expect(g.nodes[0].data.nodeType).toBe("source");
  });
  it("scoring node sits between source and the first communication", () => {
    const g = createTemplate("Регистрация", "new");
    const entryId = g.nodes[0].id;
    // No edge directly from entry to a non-scoring node remains.
    const entryEdges = g.edges.filter((e) => e.source === entryId);
    expect(entryEdges).toHaveLength(1);
    const scoringNode = g.nodes.find((n) => n.data.nodeType === "scoring")!;
    expect(entryEdges[0].target).toBe(scoringNode.id);
  });
  it("source-aware graph still validates ok", () => {
    for (const st of ["new", "stream", "own"] as const) {
      const g = createTemplate("Удержание", st);
      expect(validateWorkflow(g, true).ok).toBe(true);
    }
  });
});

describe("channel-aware template generation", () => {
  it("createTemplate with channels=[sms,email] has split, sms, email, merge nodes for Регистрация", () => {
    const t = createTemplate("Регистрация", "own", ["sms", "email"]);
    const types = t.nodes.map((n) => n.data.nodeType);
    expect(types).toContain("split");
    expect(types).toContain("sms");
    expect(types).toContain("email");
    expect(types).toContain("merge");
  });

  it("createTemplate with single channel has no split/merge but has condition", () => {
    const t = createTemplate("Регистрация", "own", ["sms"]);
    const types = t.nodes.map((n) => n.data.nodeType);
    // Single channel: no split/merge for the channel block
    expect(types).toContain("sms");
    // But must have condition (even for single channel, per spec)
    expect(types).toContain("condition");
  });

  it("createTemplate with channels has 2 condition nodes (one per repeat iteration)", () => {
    const t = createTemplate("Регистрация", "own", ["sms"]);
    const conditionCount = t.nodes.filter((n) => n.data.nodeType === "condition").length;
    expect(conditionCount).toBe(2);
  });

  it("createTemplate with channels has 2 channel nodes (original + repeat) for single channel", () => {
    const t = createTemplate("Регистрация", "own", ["push"]);
    const pushCount = t.nodes.filter((n) => n.data.nodeType === "push").length;
    expect(pushCount).toBe(2);
  });

  it("createTemplate with channels still validates ok", () => {
    const t = createTemplate("Регистрация", "own", ["sms", "email"]);
    const v = validateWorkflow(t, true);
    expect(v.ok).toBe(true);
  });

  it("createTemplate without channels falls back to legacy template", () => {
    const t = createTemplate("Регистрация");
    // Legacy template has email and push for Регистрация
    const types = t.nodes.map((n) => n.data.nodeType);
    expect(types).toContain("email");
    expect(types).toContain("push");
    // No condition node in legacy registration template
    expect(types).not.toContain("condition");
  });

  it("segmented scenario Апсейл with channels has comm units for non-lowest segments", () => {
    const t = createTemplate("Апсейл", "own", ["sms", "email"]);
    const types = t.nodes.map((n) => n.data.nodeType);
    // Must have split (by segment) and merge
    expect(types).toContain("split");
    expect(types).toContain("merge");
    // Must have conditions (from comm units)
    const condCount = types.filter((t) => t === "condition").length;
    expect(condCount).toBeGreaterThanOrEqual(1);
  });

  it("all ids are unique when channels are provided", () => {
    const t = createTemplate("Регистрация", "own", ["sms", "email"]);
    const ids = t.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all edges reference existing node ids when channels are provided", () => {
    const t = createTemplate("Регистрация", "own", ["sms", "email", "push"]);
    const idSet = new Set(t.nodes.map((n) => n.id));
    for (const edge of t.edges) {
      expect(idSet.has(edge.source), `source ${edge.source} missing`).toBe(true);
      expect(idSet.has(edge.target), `target ${edge.target} missing`).toBe(true);
    }
  });
});
