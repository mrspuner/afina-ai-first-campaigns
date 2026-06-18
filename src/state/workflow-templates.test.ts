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

describe("createTemplate with signal", () => {
  it("patches signal node with count/segments from provided signal", () => {
    const signal = {
      id: "sig1",
      type: "Регистрация" as const,
      count: 5000,
      segments: { max: 1000, high: 1500, mid: 1500, low: 1000 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { nodes } = createTemplate("Регистрация", signal);
    // Entry node is now typed `source`; patchNodeParams still targets it by id
    // "signal" and its params remain the `signal` member.
    const signalNode = nodes.find((n) => n.data.params?.kind === "signal");
    expect(signalNode).toBeDefined();
    const params = signalNode?.data.params;
    expect(params?.kind).toBe("signal");
    if (params?.kind === "signal") {
      expect(params.count).toBe(5000);
      expect(params.segments.max).toBe(1000);
      expect(params.segments.high).toBe(1500);
      expect(params.segments.mid).toBe(1500);
      expect(params.segments.low).toBe(1000);
    }
  });
});
