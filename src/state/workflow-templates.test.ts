import { describe, it, expect } from "vitest";
import {
  TEMPLATE_BY_TYPE,
  createTemplate,
  applyCampaignContext,
  fileSummaryLine,
  mergeChannelNodes,
} from "./workflow-templates";
import { validateWorkflow } from "./workflow-validation";
import { computeCampaignCost } from "@/sections/campaigns/campaign-cost";
import type { SignalType } from "./app-state";
import type { Channel, SourceType } from "@/types/campaign";
import type { SignalParams, WorkflowNode, WorkflowEdge } from "@/types/workflow";

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
  it("createTemplate with channels=[sms,email] has split, sms, email and NO merge for Регистрация", () => {
    const t = createTemplate("Регистрация", "own", ["sms", "email"]);
    const types = t.nodes.map((n) => n.data.nodeType);
    expect(types).toContain("split");
    expect(types).toContain("sms");
    expect(types).toContain("email");
    // Слияние удалено — ветки каналов сходятся напрямую в следующую ноду.
    expect(types).not.toContain("merge");
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

  it("createTemplate with channels авто-заполняет шаблоны → валиден сразу (#2 магия)", () => {
    const t = createTemplate("Регистрация", "own", ["sms", "email"]);
    // Комм-ноды авто-заполняются шаблонами («магия» #2), поэтому граф валиден
    // сразу — запуск не блокируется незаполненным текстом.
    expect(validateWorkflow(t, true).ok).toBe(true);

    // А если пользователь ОЧИСТИТ текст комм-нод — это неблокирующее
    // предупреждение (needs-attention → warning), запуск всё равно разрешён.
    const cleared = {
      ...t,
      nodes: t.nodes.map((n) => {
        if (n.data.params?.kind === "sms") {
          return { ...n, data: { ...n.data, params: { ...n.data.params, text: "" } } };
        }
        if (n.data.params?.kind === "email") {
          return { ...n, data: { ...n.data, params: { ...n.data.params, subject: "", body: "" } } };
        }
        return n;
      }),
    };
    const v = validateWorkflow(cleared, true);
    expect(v.ok).toBe(true);
    expect(v.warnings).toContain("needs-attention");
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

  it("segmented scenario Апсейл with channels has comm units and NO merge", () => {
    const t = createTemplate("Апсейл", "own", ["sms", "email"]);
    const types = t.nodes.map((n) => n.data.nodeType);
    // Must have split (by segment); Слияние удалено.
    expect(types).toContain("split");
    expect(types).not.toContain("merge");
    // Must have conditions (from comm units)
    const condCount = types.filter((t) => t === "condition").length;
    expect(condCount).toBeGreaterThanOrEqual(1);
  });

  it("no built graph contains a merge node (all channel counts, all scenarios)", () => {
    const channelSets: Channel[][] = [["sms"], ["sms", "email"], ["sms", "email", "push", "ivr"]];
    for (const s of SIGNAL_TYPES) {
      for (const chs of channelSets) {
        const t = createTemplate(s, "new", chs);
        expect(
          t.nodes.map((n) => n.data.nodeType),
          `${s}/${chs.join("+")}`,
        ).not.toContain("merge");
      }
    }
  });

  it("legacy Регистрация has no orphan node (every non-entry node has an incoming edge)", () => {
    const t = TEMPLATE_BY_TYPE["Регистрация"]();
    const entryId = t.nodes[0].id; // signal/source entry
    const targeted = new Set(t.edges.map((e) => e.target));
    for (const node of t.nodes) {
      if (node.id === entryId) continue;
      expect(targeted.has(node.id), `orphan node: ${node.id}`).toBe(true);
    }
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


describe("applyCampaignContext — signal node files (spec C)", () => {
  it("populates the signal node's files list from the campaign bases", () => {
    const t = createTemplate("Регистрация", "own");
    const ctx = {
      files: [
        { name: "base-a.csv", rowCount: 1000 },
        { name: "base-b.csv", rowCount: 2000 },
      ],
    };
    const out = applyCampaignContext(t, ctx);
    const signal = out.nodes.find((n) => n.data.params?.kind === "signal");
    const params = signal!.data.params as SignalParams;
    expect(params.files).toEqual(["base-a.csv", "base-b.csv"]);
  });

  it("leaves files empty when the campaign has no bases", () => {
    const t = createTemplate("Регистрация", "own");
    const out = applyCampaignContext(t, { files: [] });
    const signal = out.nodes.find((n) => n.data.params?.kind === "signal");
    const params = signal!.data.params as SignalParams;
    expect(params.files ?? []).toEqual([]);
  });
});

/**
 * Все узлы, достижимые из единственного корня графа (нода без входящих
 * рёбер), проверяются обходом в ширину — переиспользуется в тестах ниже,
 * чтобы не дублировать одну и ту же проверку связности графа.
 */
function assertFullyReachableFromSingleRoot(graph: {
  nodes: { id: string }[];
  edges: { source: string; target: string }[];
}) {
  const hasIncoming = new Set(graph.edges.map((e) => e.target));
  const roots = graph.nodes.filter((n) => !hasIncoming.has(n.id));
  expect(roots).toHaveLength(1);

  const adjacency = new Map<string, string[]>();
  for (const e of graph.edges) {
    adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);
  }
  const seen = new Set([roots[0].id]);
  const queue = [roots[0].id];
  while (queue.length) {
    for (const next of adjacency.get(queue.shift()!) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  expect(seen.size).toBe(graph.nodes.length);
}

// "Реактивация" — реальный SignalType (не сегментированный: не входит в
// SEGMENTED_TYPES). Через channel-aware путь (createTemplate с channels)
// buildCommUnit гарантированно добавляет wait + 2 condition-ноды независимо
// от типа сигнала, так что тест "задержки и условия остаются нетронутыми"
// действительно что-то проверяет.
describe("mergeChannelNodes", () => {
  const REACT_CTX = { signalType: "Реактивация" as SignalType, sourceType: "new" as SourceType };

  it("снятый канал уходит вместе со своими рёбрами", () => {
    const graph = createTemplate("Реактивация", "new", ["sms", "email"]);
    const merged = mergeChannelNodes(graph, ["sms"], REACT_CTX);
    expect(merged.nodes.some((n) => n.data.nodeType === "email")).toBe(false);
    const ids = new Set(merged.nodes.map((n) => n.id));
    for (const e of merged.edges) {
      expect(ids.has(e.source), `висячее ребро ${e.source}→${e.target}`).toBe(true);
      expect(ids.has(e.target), `висячее ребро ${e.source}→${e.target}`).toBe(true);
    }
  });

  it("цепочка не рвётся: путь от корня до конца сохраняется", () => {
    const graph = createTemplate("Реактивация", "new", ["sms", "email"]);
    const merged = mergeChannelNodes(graph, ["sms"], REACT_CTX);
    assertFullyReachableFromSingleRoot(merged);
  });

  it("отредактированные вручную тексты остальных узлов сохраняются", () => {
    const graph = createTemplate("Реактивация", "new", ["sms", "email"]);
    const sms = graph.nodes.find((n) => n.data.nodeType === "sms")!;
    sms.data.params = { ...sms.data.params, text: "Правка руками" } as typeof sms.data.params;
    const merged = mergeChannelNodes(graph, ["sms"], REACT_CTX);
    const keptSms = merged.nodes.find((n) => n.data.nodeType === "sms")!;
    expect((keptSms.data.params as { text: string }).text).toBe("Правка руками");
  });

  it("новый канал добавляется нодой по умолчанию", () => {
    const graph = createTemplate("Реактивация", "new", ["sms"]);
    const merged = mergeChannelNodes(graph, ["sms", "push"], REACT_CTX);
    expect(merged.nodes.some((n) => n.data.nodeType === "push")).toBe(true);
  });

  it("задержки и условия остаются нетронутыми", () => {
    // Сплиттеры НЕ входят в этот список намеренно: channel-сплиттер
    // (by:"equal") — часть комм-блока и обязан схлопнуться, когда каналов
    // остаётся 1 (иначе он продолжил бы делить аудиторию 50/50 между
    // уцелевшим каналом и обходом коммуникации — Finding 1). wait/condition
    // от количества каналов не зависят вовсе.
    const graph = createTemplate("Реактивация", "new", ["sms", "email"]);
    const before = graph.nodes.filter((n) =>
      ["wait", "condition"].includes(n.data.nodeType),
    ).length;
    const merged = mergeChannelNodes(graph, ["sms"], REACT_CTX);
    const after = merged.nodes.filter((n) =>
      ["wait", "condition"].includes(n.data.nodeType),
    ).length;
    expect(after).toBe(before);

    // Ветка-регресс для Finding 1: ни один уцелевший sms (первый проход И
    // повтор) не должен остаться под сплиттером — сплиттер с одной веткой
    // означает скрытый обход коммуникации для половины аудитории.
    const survivingSmsNodes = merged.nodes.filter((n) => n.data.nodeType === "sms");
    expect(survivingSmsNodes.length).toBeGreaterThan(0);
    for (const smsNode of survivingSmsNodes) {
      const incoming = merged.edges.filter((e) => e.target === smsNode.id);
      expect(incoming).toHaveLength(1);
      const predecessor = merged.nodes.find((n) => n.id === incoming[0].source)!;
      expect(predecessor.data.nodeType, `${smsNode.id} всё ещё под сплиттером`).not.toBe("split");
    }
  });

  it("тот же набор каналов граф не меняет", () => {
    const graph = createTemplate("Реактивация", "new", ["sms", "email"]);
    const merged = mergeChannelNodes(graph, ["sms", "email"], REACT_CTX);
    expect(merged.nodes.map((n) => n.id)).toEqual(graph.nodes.map((n) => n.id));
  });

  // "Апсейл" — сегментированный сценарий (SEGMENTED_TYPES): buildSegmentedChannelTemplate
  // строит по одному comm-юниту НА КАЖДЫЙ из трёх активных сегментов (макс/выс/ср),
  // а каждый comm-юнит сам дублирует каналы (первый проход + повтор). Значит
  // "email" при channels=["sms","email"] встречается тут 6 раз (3 сегмента × 2
  // прохода) — ровно тот случай, где мерж "по одной ноде на канал" бы сломался.
  const UPSELL_CTX = { signalType: "Апсейл" as SignalType, sourceType: "new" as SourceType };

  describe("сегментированный сценарий (несколько параллельных юнитов на канал)", () => {
    it("снятый канал уходит из ВСЕХ сегментов без висячих рёбер", () => {
      const graph = createTemplate("Апсейл", "new", ["sms", "email"]);
      const emailCountBefore = graph.nodes.filter((n) => n.data.nodeType === "email").length;
      expect(emailCountBefore).toBeGreaterThan(1); // предпосылка теста — каналов правда несколько

      const merged = mergeChannelNodes(graph, ["sms"], UPSELL_CTX);
      expect(merged.nodes.some((n) => n.data.nodeType === "email")).toBe(false);

      const ids = new Set(merged.nodes.map((n) => n.id));
      for (const e of merged.edges) {
        expect(ids.has(e.source), `висячее ребро ${e.source}→${e.target}`).toBe(true);
        expect(ids.has(e.target), `висячее ребро ${e.source}→${e.target}`).toBe(true);
      }
    });

    it("после удаления канала из всех сегментов граф остаётся полностью связным", () => {
      const graph = createTemplate("Апсейл", "new", ["sms", "email"]);
      const merged = mergeChannelNodes(graph, ["sms"], UPSELL_CTX);
      assertFullyReachableFromSingleRoot(merged);
    });

    it("сплиттер сегментов (by:segment) не трогается; внутренние channel-сплиттеры схлопываются до 1 канала", () => {
      // Наружный сплиттер "по сегменту" — защищённый (никогда не создаётся и
      // не удаляется мержем), а внутренние channel-сплиттеры (by:"equal",
      // по одному на сегмент × проход) — часть комм-блока и обязаны
      // схлопнуться, когда в сегменте остаётся 1 канал (Finding 1).
      const graph = createTemplate("Апсейл", "new", ["sms", "email"]);
      const segmentSplitBefore = graph.nodes.filter(
        (n) => n.data.nodeType === "split" && n.data.params?.kind === "split" && n.data.params.by === "segment",
      );
      expect(segmentSplitBefore).toHaveLength(1);
      const equalSplitsBefore = graph.nodes.filter(
        (n) => n.data.nodeType === "split" && n.data.params?.kind === "split" && n.data.params.by === "equal",
      );
      expect(equalSplitsBefore.length).toBeGreaterThan(0); // предпосылка — они правда есть (2-канальные юниты)

      const merged = mergeChannelNodes(graph, ["sms"], UPSELL_CTX);

      const segmentSplitAfter = merged.nodes.filter(
        (n) => n.data.nodeType === "split" && n.data.params?.kind === "split" && n.data.params.by === "segment",
      );
      expect(segmentSplitAfter).toHaveLength(1);
      expect(segmentSplitAfter[0].id).toBe(segmentSplitBefore[0].id); // тот же узел, не пересобран

      // Единственный оставшийся канал — sms — везде схлопнут до прямой связи,
      // ни одного channel-сплиттера с одной веткой не осталось.
      const equalSplitsAfter = merged.nodes.filter(
        (n) => n.data.nodeType === "split" && n.data.params?.kind === "split" && n.data.params.by === "equal",
      );
      expect(equalSplitsAfter).toHaveLength(0);
    });
  });

  // Оба сценария ниже не описаны в брифе явно, но их код-путь — "коммуникационных
  // нод не осталось вовсе" (шаг 5 брифа) — иначе не покрыт ни одним тестом.
  describe("добавление, когда коммуникационных нод не осталось вовсе", () => {
    it("канал, добавленный к «без коммуникации» графу (bug 2a/2b), встаёт в полноценный retry-юнит (условие/задержка/повтор)", () => {
      // own + explicitly empty channels[] → minimalTemplate: Сигнал → Успех, без comm-нод вовсе.
      const graph = createTemplate("Реактивация", "own", []);
      const signal = graph.nodes.find((n) => n.data.nodeType === "signal")!;
      const success = graph.nodes.find((n) => n.data.isSuccess)!;
      expect(graph.edges).toContainEqual(
        expect.objectContaining({ source: signal.id, target: success.id }),
      );

      const merged = mergeChannelNodes(graph, ["push"], { signalType: "Реактивация", sourceType: "own" });
      expect(merged.nodes.some((n) => n.data.nodeType === "push")).toBe(true);
      assertFullyReachableFromSingleRoot(merged);

      // Fix round 2: канал не просто "встаёт между Сигналом и Успехом" —
      // он встаёт в ПОЛНОЦЕННЫЙ retry-юнит (condition/wait/repeat/condition),
      // как чистая пересборка createTemplate(...,["push"]) — иначе стоимость
      // разойдётся (нет "repeat"-доли по DYNAMIC_RATE).
      expect(merged.nodes.filter((n) => n.data.nodeType === "condition")).toHaveLength(2);
      expect(merged.nodes.filter((n) => n.data.nodeType === "wait")).toHaveLength(1);
      expect(merged.nodes.filter((n) => n.data.nodeType === "push")).toHaveLength(2); // первый проход + повтор
      expect(merged.nodes.some((n) => n.data.nodeType === "end")).toBe(true); // «без коммуникации» его не строил

      // Прямой обход коммуникации убран — иначе письмо получило бы окольный
      // путь мимо только что добавленного канала.
      expect(merged.edges).not.toContainEqual(
        expect.objectContaining({ source: signal.id, target: success.id }),
      );

      const mergedCost = computeCampaignCost(merged.nodes, merged.edges, 10_000);
      const freshCost = computeCampaignCost(
        createTemplate("Реактивация", "own", ["push"]).nodes,
        createTemplate("Реактивация", "own", ["push"]).edges,
        10_000,
      );
      expect(mergedCost.total).toBe(freshCost.total);
    });

    it("замена канала другим за один вызов: старый уходит из обоих проходов, новый встаёт на оба освободившихся места", () => {
      const graph = createTemplate("Реактивация", "own", ["sms"]);
      const merged = mergeChannelNodes(graph, ["push"], { signalType: "Реактивация", sourceType: "own" });

      expect(merged.nodes.some((n) => n.data.nodeType === "sms")).toBe(false);
      expect(merged.nodes.filter((n) => n.data.nodeType === "push")).toHaveLength(2);
      assertFullyReachableFromSingleRoot(merged);

      const ids = new Set(merged.nodes.map((n) => n.id));
      for (const e of merged.edges) {
        expect(ids.has(e.source), `висячее ребро ${e.source}→${e.target}`).toBe(true);
        expect(ids.has(e.target), `висячее ребро ${e.source}→${e.target}`).toBe(true);
      }
    });
  });

  // Ни один шаблон в проекте не строит комм-ноду с несколькими входящими И
  // несколькими исходящими рёбрами (комм-ноды либо под сплиттером — один вход,
  // либо одиночные — один вход/выход). Фикстура собрана вручную, чтобы
  // проверить именно декартово произведение при переподключении и дедуп
  // против уже существующего ребра — код-путь, который иначе не проверен ничем.
  it("узел с несколькими входящими и исходящими рёбрами: переподключение — декартово произведение с дедупом", () => {
    const nodes: WorkflowNode[] = [
      { id: "a", type: "workflowNode", position: { x: 0, y: 0 }, data: { label: "A", nodeType: "condition", params: { kind: "condition", trigger: "opened" } } },
      { id: "b", type: "workflowNode", position: { x: 0, y: 100 }, data: { label: "B", nodeType: "condition", params: { kind: "condition", trigger: "clicked" } } },
      { id: "sms", type: "workflowNode", position: { x: 210, y: 50 }, data: { label: "SMS", nodeType: "sms", params: { kind: "sms", text: "x", alphaName: "BRAND", scheduledAt: "immediate" } } },
      { id: "c", type: "workflowNode", position: { x: 420, y: 0 }, data: { label: "C", nodeType: "success", isSuccess: true, params: { kind: "success", goal: "g" } } },
      { id: "d", type: "workflowNode", position: { x: 420, y: 100 }, data: { label: "D", nodeType: "end", params: { kind: "end" } } },
    ];
    const edges: WorkflowEdge[] = [
      { id: "a-sms", source: "a", target: "sms", type: "default" },
      { id: "b-sms", source: "b", target: "sms", type: "default" },
      { id: "sms-c", source: "sms", target: "c", type: "default" },
      { id: "sms-d", source: "sms", target: "d", type: "default" },
      // Уже существующее a→c — не должно задублироваться декартовым произведением.
      { id: "a-c", source: "a", target: "c", type: "default" },
    ];

    // nextChannels=[] здесь ничего не добавляет — context не используется этой
    // веткой, но обязателен по сигнатуре; значение произвольное.
    const merged = mergeChannelNodes({ nodes, edges }, [], { signalType: "Реактивация", sourceType: "new" });

    expect(merged.nodes.some((n) => n.data.nodeType === "sms")).toBe(false);
    const pairs = new Set(merged.edges.map((e) => `${e.source}|${e.target}`));
    expect(pairs.has("a|c")).toBe(true);
    expect(pairs.has("a|d")).toBe(true);
    expect(pairs.has("b|c")).toBe(true);
    expect(pairs.has("b|d")).toBe(true);
    // Дедуп: a→c встречалось и до удаления, и в декартовом произведении — один раз.
    expect(merged.edges.filter((e) => e.source === "a" && e.target === "c")).toHaveLength(1);
    // Итого 4 уникальных ребра (a-c, a-d, b-c, b-d), не 5.
    expect(merged.edges).toHaveLength(4);
  });
});

/**
 * Инвариант, который ловит все находки code review разом: для графа БЕЗ
 * ручных структурных правок мерж на набор каналов S обязан давать ТУ ЖЕ
 * стоимость (`computeCampaignCost`), что и чистая пересборка
 * `createTemplate(signalType, sourceType, S)`. Раньше вырожденный сплиттер
 * (Finding 1) и голое параллельное ребро вместо ветки сплиттера (Finding 2)
 * проходили все структурные проверки (нет висячих рёбер, всё достижимо), но
 * тайком меняли стоимость — только этот тест их ловит.
 */
describe("mergeChannelNodes — паритет стоимости с чистой пересборкой (инвариант)", () => {
  const N = 10_000;

  function assertCostParity(
    signalType: SignalType,
    sourceType: SourceType,
    from: Channel[],
    to: Channel[],
  ) {
    const graph = createTemplate(signalType, sourceType, from);
    const merged = mergeChannelNodes(graph, to, { signalType, sourceType });
    const fresh = createTemplate(signalType, sourceType, to);

    // computeReach молча пропускает рёбра на несуществующие ноды (не падает и
    // не искажает total предсказуемо) — паритет стоимости САМ ПО СЕБЕ не
    // ловит висячее ребро. Проверяем структуру отдельно и явно на каждом
    // параметризованном случае, а не только на нескольких примерах вручную.
    const ids = new Set(merged.nodes.map((n) => n.id));
    for (const edge of merged.edges) {
      expect(ids.has(edge.source), `merge(${from.join("+")}→${to.join("+")}) висячее ребро ${edge.source}→${edge.target}`).toBe(true);
      expect(ids.has(edge.target), `merge(${from.join("+")}→${to.join("+")}) висячее ребро ${edge.source}→${edge.target}`).toBe(true);
    }
    assertFullyReachableFromSingleRoot(merged);

    const mergedCost = computeCampaignCost(merged.nodes, merged.edges, N);
    const freshCost = computeCampaignCost(fresh.nodes, fresh.edges, N);

    expect(mergedCost.total, `merge(${from.join("+")}→${to.join("+")}) total`).toBe(freshCost.total);
    expect(mergedCost.primary).toBe(freshCost.primary);
    expect(mergedCost.repeat).toBe(freshCost.repeat);
  }

  const linearCases: [Channel[], Channel[]][] = [
    [["sms"], ["sms", "email"]], // добавление: одиночный старт → несколько каналов
    [["sms", "email"], ["sms"]], // удаление: несколько → один (Finding 1)
    [["sms"], ["push"]], // замена: одиночный → одиночный
    [["sms", "email"], ["push", "ivr"]], // замена: несколько → несколько
    [["sms", "email", "push"], ["sms"]], // удаление нескольких сразу: 3 → 1
    [["sms"], ["sms", "email", "push"]], // добавление нескольких сразу: 1 → 3 (Finding 2)
    [["sms", "email"], ["sms", "email"]], // без изменений
  ];

  it.each(linearCases)("линейный сценарий («Реактивация»): %j → %j", (from, to) => {
    assertCostParity("Реактивация", "new", from, to);
  });

  // Сегментированный: та же матрица, но каждый случай размножен на 3 сегмента
  // × 2 прохода (первый/повтор) — ровно то, что сломал Finding 2 (сегменты не
  // тронутые пользователем меняли стоимость при добавлении канала только в
  // один сегмент).
  const segmentedCases: [Channel[], Channel[]][] = [
    [["sms"], ["sms", "email"]],
    [["sms", "email"], ["sms"]],
    [["sms"], ["push"]],
    [["sms", "email"], ["push", "ivr"]],
    [["sms", "email", "push"], ["sms"]],
    [["sms"], ["sms", "email", "push"]],
  ];

  it.each(segmentedCases)("сегментированный сценарий («Апсейл»): %j → %j", (from, to) => {
    assertCostParity("Апсейл", "new", from, to);
  });

  it("тот же сценарий, own-источник (без скоринга) — линейный", () => {
    assertCostParity("Возврат", "own", ["sms", "email"], ["push"]);
  });

  // Fix round 2 (Important finding) — граф БЕЗ единой коммуникационной ноды:
  // либо «без коммуникации» с самого начала (channels=[], bug 2a/2b), либо
  // результат отдельного предыдущего merge, опустошившего канал. Раньше
  // добавление сюда ориентировалось на "рёбра, ведущие в success" — ломается,
  // как только в графе есть condition-ноды (у обоих — cond1 и cond2 — YES
  // ведёт в success, так что этот ориентир перестаёт быть однозначным).
  it("«без коммуникации» с самого начала: [] → [\"sms\"] даёт ту же стоимость, что и чистая пересборка", () => {
    assertCostParity("Реактивация", "new", [], ["sms"]);
  });

  // Fix round 3 (Important finding) — та же "без коммуникации с самого
  // начала" точка входа, но для СЕГМЕНТИРОВАННОГО сценария: у mergeChannelNodes
  // нет signalType, так что ручная реконструкция (round 2) всегда строила
  // линейный юнит вместо сплита "по сегменту" — паритет по стоимости
  // проходил только там, где condition-ноды выживали от непустого состояния
  // (двухшаговый сценарий ниже), но не для by-scratch-пустого графа. Ровно
  // два случая, которые ревьюер измерил напрямую.
  it.each<[SignalType, Channel]>([
    ["Апсейл", "sms"],
    ["Удержание", "ivr"],
  ])("«без коммуникации» с самого начала, сегментированный сценарий: [] → [\"%s\"→%s]", (signalType, channel) => {
    assertCostParity(signalType, "new", [], [channel]);
  });

  it("«без коммуникации» с самого начала, сегментированный сценарий: структура сравнима с чистой пересборкой", () => {
    const graph = createTemplate("Апсейл", "new", []);
    const merged = mergeChannelNodes(graph, ["sms"], { signalType: "Апсейл", sourceType: "new" });
    const fresh = createTemplate("Апсейл", "new", ["sms"]);

    // Не только совпадающая стоимость — тот же НАБОР типов нод (в частности,
    // сплиттер "по сегменту", которого ручная реконструкция построить не могла).
    const kindsOf = (g: { nodes: { data: { nodeType: string } }[] }) =>
      [...new Set(g.nodes.map((n) => n.data.nodeType))].sort();
    expect(kindsOf(merged)).toEqual(kindsOf(fresh));
    expect(merged.nodes.some((n) => n.data.nodeType === "split")).toBe(true);
    expect(merged.nodes.filter((n) => n.data.nodeType === "sms")).toHaveLength(
      fresh.nodes.filter((n) => n.data.nodeType === "sms").length,
    );

    // Узел "Конец" несёт тот же reason, что и в чистой пересборке (не «—» —
    // из-за отсутствия context ручная реконструкция не могла его знать).
    const mergedEnd = merged.nodes.find((n) => n.data.nodeType === "end")!;
    const freshEnd = fresh.nodes.find((n) => n.data.nodeType === "end")!;
    expect(mergedEnd.data.params?.kind === "end" ? mergedEnd.data.params.reason : undefined).toBe(
      freshEnd.data.params?.kind === "end" ? freshEnd.data.params.reason : undefined,
    );
    expect(mergedEnd.data.params?.kind === "end" ? mergedEnd.data.params.reason : undefined).toBe(
      "Без апсейла",
    );
  });

  it("двухшаговый сценарий «опустошили → заполнили» (ровно то, что делает пользователь свапом каналов за 2 клика)", () => {
    const reactCtx = { signalType: "Реактивация" as SignalType, sourceType: "new" as SourceType };
    const original = createTemplate("Реактивация", "new", ["sms", "email"]);
    const emptied = mergeChannelNodes(original, [], reactCtx); // шаг 1: канал очищен — этот вызов НЕ добавляет ничего
    const refilled = mergeChannelNodes(emptied, ["sms"], reactCtx); // шаг 2: отдельный вызов, bridgesCreated этого вызова пуст
    const fresh = createTemplate("Реактивация", "new", ["sms"]);

    const ids = new Set(refilled.nodes.map((n) => n.id));
    for (const edge of refilled.edges) {
      expect(ids.has(edge.source), `висячее ребро ${edge.source}→${edge.target}`).toBe(true);
      expect(ids.has(edge.target), `висячее ребро ${edge.source}→${edge.target}`).toBe(true);
    }
    assertFullyReachableFromSingleRoot(refilled);

    const refilledCost = computeCampaignCost(refilled.nodes, refilled.edges, N);
    const freshCost = computeCampaignCost(fresh.nodes, fresh.edges, N);
    expect(refilledCost.total).toBe(freshCost.total);
    expect(refilledCost.primary).toBe(freshCost.primary);
    expect(refilledCost.repeat).toBe(freshCost.repeat);
  });

  it("двухшаговый сценарий, сегментированный сценарий («Апсейл»)", () => {
    const upsellCtx = { signalType: "Апсейл" as SignalType, sourceType: "new" as SourceType };
    const original = createTemplate("Апсейл", "new", ["sms"]);
    const emptied = mergeChannelNodes(original, [], upsellCtx);
    const refilled = mergeChannelNodes(emptied, ["sms", "push"], upsellCtx);
    const fresh = createTemplate("Апсейл", "new", ["sms", "push"]);

    assertFullyReachableFromSingleRoot(refilled);
    const refilledCost = computeCampaignCost(refilled.nodes, refilled.edges, N);
    const freshCost = computeCampaignCost(fresh.nodes, fresh.edges, N);
    expect(refilledCost.total).toBe(freshCost.total);

    // Метки сегментов на рёбрах сплиттера "по сегменту" не теряются через
    // опустошение и повторное заполнение (дёшево проверить, раз уже здесь).
    const segSplit = refilled.nodes.find(
      (nd) => nd.data.nodeType === "split" && nd.data.params?.kind === "split" && nd.data.params.by === "segment",
    )!;
    const segLabels = refilled.edges
      .filter((ed) => ed.source === segSplit.id)
      .map((ed) => ed.label)
      .sort();
    expect(segLabels).toEqual(["Выс", "Низ", "Макс", "Ср"].sort());
  });
});
