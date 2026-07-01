import { describe, it, expect } from "vitest";
import {
  TEMPLATE_BY_TYPE,
  createTemplate,
  applyCampaignContext,
  fileSummaryLine,
} from "./workflow-templates";
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

  // The «Файл» entry node was removed; the graph ROOT is now the «Скоринг» node
  // for the default (`new`) source. Every node carries params whose kind matches
  // its nodeType (no `source` exemption needed anymore).
  it.each(SIGNAL_TYPES)("entry node of %s is «Скоринг» (root, default new)", (type) => {
    const { nodes } = createTemplate(type);
    expect(nodes[0].data.nodeType).toBe("scoring");
    expect(nodes.some((nd) => nd.data.nodeType === "source")).toBe(false);
    expect(nodes.some((nd) => nd.data.label === "Файл")).toBe(false);
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
        expect(node.data.params.kind).toBe(node.data.nodeType);
      }
    }
  });
});

describe("graph root Скоринг → Сигнал → Коммуникация (no «Файл» entry node)", () => {
  it.each(SIGNAL_TYPES)("has NO «Файл» entry node for %s", (type) => {
    const { nodes } = createTemplate(type, "new");
    expect(nodes.some((n) => n.data.label === "Файл")).toBe(false);
    expect(nodes.some((n) => n.data.nodeType === "source")).toBe(false);
  });

  it("new/stream: root is Скоринг → Сигнал → <comm>", () => {
    for (const st of ["new", "stream"] as const) {
      const { nodes, edges } = createTemplate("Регистрация", st);
      const root = nodes[0];
      const scoring = nodes.find((n) => n.data.nodeType === "scoring")!;
      const signal = nodes.find((n) => n.id === "signal_result")!;
      expect(scoring).toBeDefined();
      // Scoring is the root: it is nodes[0] and has no incoming edge.
      expect(root.data.nodeType).toBe("scoring");
      expect(edges.some((e) => e.target === scoring.id)).toBe(false);
      expect(signal.data.nodeType).toBe("signal");
      expect(signal.data.label).toBe("Сигнал");
      // scoring → signal chain
      expect(edges.some((e) => e.source === scoring.id && e.target === signal.id)).toBe(true);
    }
  });

  it("own: root is Сигнал → <comm> (no scoring, no «Файл»)", () => {
    const { nodes, edges } = createTemplate("Регистрация", "own");
    expect(nodes.some((n) => n.data.nodeType === "scoring")).toBe(false);
    expect(nodes.some((n) => n.data.nodeType === "source")).toBe(false);
    const root = nodes[0];
    const signal = nodes.find((n) => n.id === "signal_result")!;
    expect(signal).toBeDefined();
    // The signal result node is the root.
    expect(root.id).toBe(signal.id);
    expect(edges.some((e) => e.target === signal.id)).toBe(false);
  });

  it("scoring node carries ScoringParams (interests/triggers/files) and never needs attention", () => {
    const { nodes } = createTemplate("Регистрация", "new");
    const scoring = nodes.find((n) => n.data.nodeType === "scoring")!;
    expect(scoring.data.params).toMatchObject({ kind: "scoring", interests: [], triggers: [], files: [] });
    expect(scoring.data.needsAttention ?? false).toBe(false);
  });
});

describe("applyCampaignContext — files/interests on «Скоринг», base count on «Сигнал»", () => {
  it("fileSummaryLine pluralises bases and sums rows", () => {
    expect(fileSummaryLine([])).toBeUndefined();
    expect(fileSummaryLine([{ name: "a", rowCount: 1000 }])).toMatch(/^1 база · ~1[\s ]?000 строк$/);
    expect(
      fileSummaryLine([{ name: "a", rowCount: 1000 }, { name: "b", rowCount: 1500 }])
    ).toMatch(/^2 базы · ~2[\s ]?500 строк$/);
  });

  it("folds campaign files onto the «Скоринг» node and base count onto «Сигнал» (new)", () => {
    const t = createTemplate("Регистрация", "new");
    const files = [{ name: "base-1.csv", rowCount: 4000 }, { name: "base-2.csv", rowCount: 6000 }];
    const out = applyCampaignContext(t, { files, interests: ["Ипотека"] });
    const scoring = out.nodes.find((n) => n.data.nodeType === "scoring")!;
    expect(scoring.data.params).toMatchObject({ kind: "scoring", files });
    const signal = out.nodes.find((n) => n.id === "signal_result")!;
    expect(signal.data.params).toMatchObject({ kind: "signal", count: 10000 });
  });

  it("own (no scoring): the root «Сигнал» node shows the uploaded base", () => {
    const t = createTemplate("Регистрация", "own");
    const files = [{ name: "own-1.csv", rowCount: 4000 }, { name: "own-2.csv", rowCount: 6000 }];
    const out = applyCampaignContext(t, { files });
    const signal = out.nodes.find((n) => n.id === "signal_result")!;
    expect(signal.data.sublabel).toMatch(/2 базы/);
    expect(signal.data.params).toMatchObject({ kind: "signal", count: 10000 });
    expect((signal.data.params as { fileName: string }).fileName).toBe("own-1.csv, own-2.csv");
  });

  it("populates the «Скоринг» node interests from the campaign", () => {
    const t = createTemplate("Регистрация", "new");
    const out = applyCampaignContext(t, { interests: ["Ипотека", "Авто"] });
    const scoring = out.nodes.find((n) => n.data.nodeType === "scoring")!;
    expect(scoring.data.params).toMatchObject({ kind: "scoring", interests: ["Ипотека", "Авто"] });
  });

  it("populates the «Скоринг» node triggers from the campaign", () => {
    const t = createTemplate("Регистрация", "new");
    const out = applyCampaignContext(t, {
      interests: ["Ипотека"],
      triggers: ["Посещение сайтов застройщиков", "Ипотечные калькуляторы"],
    });
    const scoring = out.nodes.find((n) => n.data.nodeType === "scoring")!;
    expect(scoring.data.params).toMatchObject({
      kind: "scoring",
      interests: ["Ипотека"],
      triggers: ["Посещение сайтов застройщиков", "Ипотечные калькуляторы"],
    });
  });

  it("leaves a graph without files/interests untouched (no crash)", () => {
    const t = createTemplate("Регистрация", "own");
    const out = applyCampaignContext(t, {});
    expect(out.nodes.length).toBe(t.nodes.length);
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
  it("scoring node is the root (nodes[0]) for new", () => {
    const g = createTemplate("Регистрация", "new");
    expect(g.nodes[0].data.nodeType).toBe("scoring");
    expect(g.nodes.some((n) => n.data.nodeType === "source")).toBe(false);
  });
  it("scoring root has a single out-edge to the signal node", () => {
    const g = createTemplate("Регистрация", "new");
    const scoringNode = g.nodes.find((n) => n.data.nodeType === "scoring")!;
    // Root: no incoming edge.
    expect(g.edges.some((e) => e.target === scoringNode.id)).toBe(false);
    const scoringEdges = g.edges.filter((e) => e.source === scoringNode.id);
    expect(scoringEdges).toHaveLength(1);
    const signalNode = g.nodes.find((n) => n.id === "signal_result")!;
    expect(scoringEdges[0].target).toBe(signalNode.id);
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

// Bug 2a/2b — an EXPLICITLY empty channels array («без коммуникации») must
// build a MINIMAL graph: only the signal path (entry + [scoring] + signal
// result) and a success node. No communication nodes (email/sms/push/ivr) at
// all, so the budget's communication line is zero. A campaign that simply never
// passed channels (`undefined`) still falls back to the legacy template.
describe("empty-channels «без коммуникации» minimal template (bug 2a/2b)", () => {
  const COMM_TYPES = new Set(["email", "sms", "push", "ivr"]);

  it("channels=[] (new) → only scoring+signal+success (no «Файл»), ZERO comm nodes", () => {
    const { nodes } = createTemplate("Регистрация", "new", []);
    const types = nodes.map((n) => n.data.nodeType);
    expect(types.filter((t) => COMM_TYPES.has(t))).toEqual([]);
    expect(types).not.toContain("source");
    expect(types).toContain("scoring");
    expect(types).toContain("signal");
    expect(types).toContain("success");
    const allowed = new Set(["scoring", "signal", "success"]);
    expect(types.every((t) => allowed.has(t))).toBe(true);
  });

  it.each(SIGNAL_TYPES)("channels=[] has zero comm nodes for %s", (type) => {
    const { nodes } = createTemplate(type, "new", []);
    expect(nodes.filter((n) => COMM_TYPES.has(n.data.nodeType))).toEqual([]);
  });

  it("channels=[] own source → signal+success, no scoring, no source, no comm nodes", () => {
    const { nodes } = createTemplate("Регистрация", "own", []);
    const types = nodes.map((n) => n.data.nodeType);
    expect(types.filter((t) => COMM_TYPES.has(t))).toEqual([]);
    expect(types).not.toContain("scoring");
    expect(types).not.toContain("source");
    expect(types).toContain("signal");
    expect(types).toContain("success");
  });

  it("channels=[] template still validates ok with the signal bound", () => {
    for (const st of ["new", "stream", "own"] as const) {
      const t = createTemplate("Регистрация", st, []);
      expect(validateWorkflow(t, true).ok).toBe(true);
    }
  });

  it("NON-empty channels still include the expected comm nodes (normal path)", () => {
    const { nodes } = createTemplate("Регистрация", "new", ["sms", "email"]);
    const types = nodes.map((n) => n.data.nodeType);
    expect(types).toContain("sms");
    expect(types).toContain("email");
  });

  it("channels=undefined still falls back to legacy (comm nodes present)", () => {
    const { nodes } = createTemplate("Регистрация", "new");
    const types = nodes.map((n) => n.data.nodeType);
    expect(types.some((t) => COMM_TYPES.has(t))).toBe(true);
  });
});
