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
      // The `scoring` node (inserted for new/stream sources) has no params
      // kind, just like `source` — both are param-less structural endpoints.
      if (node.data.nodeType === "scoring") {
        expect(node.data.params).toBeUndefined();
        continue;
      }
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
