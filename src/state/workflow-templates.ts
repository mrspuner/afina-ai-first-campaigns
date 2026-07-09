import type { SignalType } from "./app-state";
import type { SourceType } from "@/types/campaign";
import type {
  NodeParams,
  WorkflowNode,
  WorkflowEdge,
  WorkflowNodeType,
  WorkflowNodeData,
  CampaignFile,
} from "@/types/workflow";

import type { Channel } from "@/types/campaign";
import { buildCommUnit } from "./channel-nodes";
import { pluralRu } from "@/lib/plural-ru";

export interface Template {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

type NodeExtras = Partial<Pick<WorkflowNodeData, "isSuccess" | "needsAttention">>;

function n(
  id: string,
  label: string,
  nodeType: WorkflowNodeType,
  x: number,
  y: number,
  sublabel?: string,
  extras?: NodeExtras,
  params?: NodeParams
): WorkflowNode {
  return {
    id,
    type: "workflowNode",
    position: { x, y },
    data: { label, nodeType, sublabel, ...extras, ...(params ? { params } : {}) },
  };
}

const EMPTY_SEGMENTS = { max: 0, high: 0, mid: 0, low: 0 };

const EDGE_STYLE = { stroke: "#2a2a2a", strokeWidth: 1.5 };
const LABEL_STYLE = { fill: "rgba(255,255,255,0.9)", fontSize: 10, fontWeight: 500 };
const LABEL_BG_STYLE = { fill: "#141414", fillOpacity: 0.92, stroke: "#2a2a2a", strokeWidth: 1 };
const LABEL_BG_PADDING: [number, number] = [4, 2];
const LABEL_BG_BORDER_RADIUS = 4;

function e(source: string, target: string, label?: string): WorkflowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    type: "default",
    style: EDGE_STYLE,
    ...(label
      ? {
          label,
          labelStyle: LABEL_STYLE,
          labelBgStyle: LABEL_BG_STYLE,
          labelBgPadding: LABEL_BG_PADDING,
          labelBgBorderRadius: LABEL_BG_BORDER_RADIUS,
        }
      : {}),
  };
}

const STEP = 210;

function registrationTemplate(): Template {
  return {
    nodes: [
      n("signal", "Сигнал", "source", 0, 0, undefined, undefined,
        { kind: "signal", fileName: "сигнал_регистрация.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("email", "Email", "email", STEP, 0, undefined, undefined,
        { kind: "email", subject: "Добро пожаловать", body: "Мы рады видеть вас в нашем сервисе.", sender: "noreply@brand.com", link: "https://brand.com/welcome" }),
      n("wait", "Задержка", "wait", STEP * 2, 0, undefined, undefined,
        { kind: "wait", mode: "duration", durationHours: 24 }),
      n("push", "Push", "push", STEP * 3, 0, undefined, undefined,
        { kind: "push", title: "Новости от бренда", body: "Есть что посмотреть", deeplink: "brand://home" }),
      n("success", "Успех", "success", STEP * 4, 0, undefined, { isSuccess: true },
        { kind: "success", goal: "Активация" }),
    ],
    edges: [
      e("signal", "email"),
      e("email", "wait"),
      e("wait", "push"),
      e("push", "success"),
    ],
  };
}

function firstDealTemplate(): Template {
  return {
    nodes: [
      n("signal", "Сигнал", "source", 0, 0, undefined, undefined,
        { kind: "signal", fileName: "сигнал_первая-сделка.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("sms", "СМС", "sms", STEP, 0, undefined, undefined,
        { kind: "sms", text: "Готовы к первой покупке? Подарок внутри.", alphaName: "BRAND", scheduledAt: "immediate", link: "https://brand.com/first" }),
      n("condition", "Взаимодействие", "condition", STEP * 2, 0, undefined, undefined,
        { kind: "condition", trigger: "opened" }),
      n("push", "Push", "push", STEP * 3, 80, undefined, undefined,
        { kind: "push", title: "Первая сделка", body: "Не пропустите" }),
      n("success", "Успех", "success", STEP * 3, -80, undefined, { isSuccess: true },
        { kind: "success", goal: "Первая покупка" }),
      n("end", "Конец", "end", STEP * 4, 80, undefined, undefined,
        { kind: "end", reason: "Не открыл" }),
    ],
    edges: [
      e("signal", "sms"),
      e("sms", "condition"),
      e("condition", "success", "YES"),
      e("condition", "push", "NO"),
      e("push", "end"),
    ],
  };
}

function upsellTemplate(): Template {
  return {
    nodes: [
      n("signal", "Сигнал", "source", 0, 0, undefined, undefined,
        { kind: "signal", fileName: "сигнал_апсейл.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("split", "Ветвление", "split", STEP, 0, undefined, undefined,
        { kind: "split", by: "segment", branches: 3 }),
      n("email", "Email", "email", STEP * 2, -40, undefined, undefined,
        { kind: "email", subject: "Персональное предложение", body: "Специально для вас.", sender: "promo@brand.com", link: "https://brand.com/upsell" }),
      n("sms", "СМС", "sms", STEP * 2, 40, undefined, undefined,
        { kind: "sms", text: "Скидка 20% для вашего сегмента.", alphaName: "BRAND", scheduledAt: "immediate" }),
      n("end", "Конец", "end", STEP * 2, 120, undefined, undefined,
        { kind: "end", reason: "Без апсейла" }),
      n("success", "Успех", "success", STEP * 3, -40, undefined, { isSuccess: true },
        { kind: "success", goal: "Апсейл" }),
    ],
    edges: [
      e("signal", "split"),
      // Слияние удалено: ветки High/Mid и «горячий» Макс сходятся стрелками в Успех.
      e("split", "success", "Макс"),
      e("split", "email", "Выс"),
      e("split", "sms", "Ср"),
      e("split", "end", "Низ"),
      e("email", "success"),
      e("sms", "success"),
    ],
  };
}

function reactivationTemplate(): Template {
  return {
    nodes: [
      n("signal", "Сигнал", "source", 0, 0, undefined, undefined,
        { kind: "signal", fileName: "сигнал_реактивация.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("wait", "Задержка", "wait", STEP, 0, undefined, undefined,
        { kind: "wait", mode: "duration", durationHours: 72 }),
      n("sms", "СМС", "sms", STEP * 2, 0, undefined, undefined,
        { kind: "sms", text: "Мы скучаем, вот скидка 30% для вас.", alphaName: "BRAND", scheduledAt: "immediate" }),
      n("condition", "Взаимодействие", "condition", STEP * 3, 0, undefined, undefined,
        { kind: "condition", trigger: "clicked" }),
      n("ivr", "IVR", "ivr", STEP * 4, 80, undefined, undefined,
        { kind: "ivr", scenario: "Возврат", voiceType: "female" }),
      n("success", "Успех", "success", STEP * 4, -80, undefined, { isSuccess: true },
        { kind: "success", goal: "Реактивация" }),
      n("end", "Конец", "end", STEP * 5, 80, undefined, undefined,
        { kind: "end", reason: "Молчание" }),
    ],
    edges: [
      e("signal", "wait"),
      e("wait", "sms"),
      e("sms", "condition"),
      e("condition", "success", "YES"),
      e("condition", "ivr", "NO"),
      e("ivr", "end"),
    ],
  };
}

function returnTemplate(): Template {
  return {
    nodes: [
      n("signal", "Сигнал", "source", 0, 0, undefined, undefined,
        { kind: "signal", fileName: "сигнал_возврат.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("email", "Email", "email", STEP, 0, undefined, undefined,
        { kind: "email", subject: "Мы ценим вас", body: "Вернитесь и получите подарок.", sender: "care@brand.com", link: "https://brand.com/return" }),
      n("wait", "Задержка", "wait", STEP * 2, 0, undefined, undefined,
        { kind: "wait", mode: "duration", durationHours: 72 }),
      n("push", "Push", "push", STEP * 3, 0, undefined, undefined,
        { kind: "push", title: "Подарок ждёт", body: "Загляните в приложение", deeplink: "brand://return" }),
      n("condition", "Взаимодействие", "condition", STEP * 4, 0, undefined, undefined,
        { kind: "condition", trigger: "opened" }),
      n("end", "Конец", "end", STEP * 5, 80, undefined, undefined,
        { kind: "end", reason: "Не открыл" }),
      n("success", "Успех", "success", STEP * 5, -80, undefined, { isSuccess: true },
        { kind: "success", goal: "Возврат" }),
    ],
    edges: [
      e("signal", "email"),
      e("email", "wait"),
      e("wait", "push"),
      e("push", "condition"),
      e("condition", "success", "YES"),
      e("condition", "end", "NO"),
    ],
  };
}

function retentionTemplate(): Template {
  return {
    nodes: [
      n("signal", "Сигнал", "source", 0, 0, undefined, undefined,
        { kind: "signal", fileName: "сигнал_удержание.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("split", "Ветвление", "split", STEP, 0, undefined, undefined,
        { kind: "split", by: "segment", branches: 3 }),
      n("ivr", "IVR", "ivr", STEP * 2, -100, undefined, undefined,
        { kind: "ivr", scenario: "Удержание", voiceType: "neutral" }),
      n("email", "Email", "email", STEP * 2, 0, undefined, undefined,
        { kind: "email", subject: "Ваш дайджест", body: "Самое важное за неделю.", sender: "digest@brand.com" }),
      n("push", "Push", "push", STEP * 2, 100, undefined, undefined,
        { kind: "push", title: "Не забудьте заглянуть", body: "Есть новое" }),
      n("wait", "Задержка", "wait", STEP * 3, 0, undefined, undefined,
        { kind: "wait", mode: "duration", durationHours: 168 }),
      n("success", "Успех", "success", STEP * 4, 0, undefined, { isSuccess: true },
        { kind: "success", goal: "Удержание" }),
    ],
    edges: [
      e("signal", "split"),
      e("split", "ivr", "Выс"),
      e("split", "email", "Ср"),
      e("split", "push", "Низ"),
      // Слияние удалено: три канала сходятся стрелками в «Задержку».
      e("ivr", "wait"),
      e("email", "wait"),
      e("push", "wait"),
      e("wait", "success"),
    ],
  };
}

export const TEMPLATE_BY_TYPE: Record<SignalType, () => Template> = {
  "Регистрация": registrationTemplate,
  "Первая сделка": firstDealTemplate,
  "Апсейл": upsellTemplate,
  "Реактивация": reactivationTemplate,
  "Возврат": returnTemplate,
  "Удержание": retentionTemplate,
};

/**
 * Turns the base skeleton's entry `source` node into the real campaign root:
 * the standalone «Файл» entry node is REMOVED and folded into the graph root.
 *
 * Root shapes (the entry `source` node is dropped entirely):
 *   - `new` / `stream`: Скоринг → Сигнал → <original first target>. Scoring is
 *     the root and carries the uploaded «Файлы» (plus interests/triggers).
 *   - `own`: Сигнал → <original first target>. Own bases skip scoring, so the
 *     `signal` result node is the root and hosts the uploaded base directly.
 *
 * The scoring node carries `ScoringParams` (interests/triggers/files, empty by
 * default — filled from the campaign), and the signal node carries
 * `SignalParams`; neither has a required human field, so `nodeNeedsAttention`
 * stays false and the path never blocks launch.
 */
function withSignalPath(t: Template, sourceType: SourceType): Template {
  const entry = t.nodes[0];
  if (!entry) return t;
  const entryId = entry.id;
  const firstEdge = t.edges.find((edge) => edge.source === entryId);
  if (!firstEdge) return t;
  const firstTarget = firstEdge.target;

  const hasScoring = sourceType !== "own";
  // Root nodes that REPLACE the removed entry: scoring+signal (new/stream) or
  // just signal (own).
  const rootCount = hasScoring ? 2 : 1;

  // The removed entry sat at x=0; downstream nodes at x >= STEP. The new root
  // nodes occupy x = 0 .. (rootCount-1)*STEP, so the first downstream node
  // (originally at x=STEP) must land at x = rootCount*STEP => shift every
  // non-entry node right by (rootCount-1)*STEP.
  const shift = (rootCount - 1) * STEP;
  const rest = t.nodes
    .slice(1)
    .map((nd) => ({ ...nd, position: { ...nd.position, x: nd.position.x + shift } }));

  const newNodes: WorkflowNode[] = [];
  const newEdges: WorkflowEdge[] = [];
  const y = entry.position.y;
  let x = entry.position.x;
  let prevId: string | null = null;

  if (hasScoring) {
    newNodes.push(
      n("scoring", "Скоринг", "scoring", x, y, undefined, undefined,
        { kind: "scoring", interests: [], triggers: [], files: [] })
    );
    prevId = "scoring";
    x += STEP;
  }

  newNodes.push(
    n("signal_result", "Сигнал", "signal", x, y, undefined, undefined,
      { kind: "signal", fileName: "", count: 0, segments: EMPTY_SEGMENTS })
  );
  if (prevId) newEdges.push(e(prevId, "signal_result"));
  prevId = "signal_result";

  const edges = t.edges
    .filter((edge) => edge.id !== firstEdge.id)
    .concat(newEdges, [e(prevId, firstTarget)]);

  return { nodes: [...newNodes, ...rest], edges };
}

// ── Channel-aware template builders ──────────────────────────────────────────

/**
 * Rough estimate of the x-width a comm unit occupies, to help position
 * success/end nodes. For 1 channel: STEP * 5 (entry→cond→wait→repeat→cond2).
 * For N channels: add a column for the split (Слияние удалено). A small
 * over-estimate is fine — it only adds slack before success/end, never overlap.
 */
function estimateUnitWidth(channels: Channel[]): number {
  const channelBlockWidth = channels.length > 1 ? STEP * 2 : STEP;
  // Unit: [block] → cond → wait → [block] → cond2
  return channelBlockWidth + STEP + STEP + channelBlockWidth + STEP;
}

/**
 * Builds a linear (non-segmented) channel-aware template.
 * Structure: source → [scoring] → commUnit(channels) → success/end
 *
 * The comm unit provides:
 *   channels → condition → YES: success
 *                         NO: wait → repeat channels → condition → YES: success / NO: end
 */
function buildLinearChannelTemplate(
  signalType: SignalType,
  channels: Channel[]
): Template {
  const successId = "success";
  const endId = "end";
  const prefix = "comm";

  // Use the legacy template as the skeleton to pick up signal params and success/end labels
  const legacy = TEMPLATE_BY_TYPE[signalType]();
  const signalNode = legacy.nodes[0]; // always the source node

  // Build the comm unit with pre-filled template params (validates ok immediately)
  const unit = buildCommUnit(channels, {
    prefix,
    onEngaged: successId,
    onExhausted: endId,
    useTemplateParams: true,
  });

  // Build success and end nodes — extract from legacy or use defaults
  const legacySuccess = legacy.nodes.find((nd) => nd.data.isSuccess) ?? legacy.nodes[legacy.nodes.length - 1];
  const legacyEnd = legacy.nodes.find((nd) => nd.data.nodeType === "end");

  // Position: source at x=0, unit starts at x=STEP, success/end at end of unit
  const unitWidth = estimateUnitWidth(channels);
  const successX = STEP + unitWidth + STEP;
  const endX = successX;

  const successNode = n(
    successId,
    legacySuccess.data.label,
    "success",
    successX,
    -80,
    legacySuccess.data.sublabel,
    { isSuccess: true },
    legacySuccess.data.params
  );
  const endNode = n(
    endId,
    legacyEnd?.data.label ?? "Конец",
    "end",
    endX,
    80,
    legacyEnd?.data.sublabel,
    undefined,
    legacyEnd?.data.params
  );

  // Offset unit nodes to start at x=STEP
  const offsetNodes = unit.nodes.map((nd) => ({
    ...nd,
    position: { x: nd.position.x + STEP, y: nd.position.y },
  }));

  const nodes = [
    { ...signalNode, position: { x: 0, y: 0 } },
    ...offsetNodes,
    successNode,
    endNode,
  ];

  const edges = [
    // source → comm unit entry
    e(signalNode.id, unit.entryId),
    // all comm unit internal edges (includes connections to successId and endId)
    ...unit.edges,
  ];

  return { nodes, edges };
}

/**
 * Builds a segmented channel-aware template (Апсейл, Удержание).
 * Structure: source → split(by segment) → [comm unit per active segment] → success
 * (Слияние удалено — ветки сегментов сходятся стрелками в Успех напрямую.)
 * Lowest segment (low) → end (no comm unit).
 */
function buildSegmentedChannelTemplate(
  signalType: SignalType,
  channels: Channel[]
): Template {
  const legacy = TEMPLATE_BY_TYPE[signalType]();
  const signalNode = legacy.nodes[0];

  // For segmented scenarios: 3 active segments (high, mid, max-like) + 1 lowest (low → end)
  const SEGMENTS = ["max", "high", "mid"] as const;
  const SEGMENT_LABELS: Record<string, string> = {
    max: "Макс",
    high: "Выс",
    mid: "Ср",
    low: "Низ",
  };

  const splitId = "seg_split";
  const successId = "success";
  const endId = "end";

  const splitNode = n(
    splitId,
    "Ветвление",
    "split",
    STEP,
    0,
    "По сегменту",
    undefined,
    { kind: "split", by: "segment", branches: 4 }
  );

  // Build a comm unit per active segment
  const unitWidth = estimateUnitWidth(channels);
  const unitStartX = STEP * 2;
  const segYPositions = [-120, -40, 40];

  const allUnitNodes: WorkflowNode[] = [];
  const allUnitEdges: WorkflowEdge[] = [];
  const splitEdges: WorkflowEdge[] = [];

  SEGMENTS.forEach((seg, idx) => {
    const prefix = `${seg}_comm`;
    const yOffset = segYPositions[idx];

    // Each unit's YES path → success (напрямую, без Слияния), NO path → end
    const unit = buildCommUnit(channels, {
      prefix,
      onEngaged: successId,    // YES → Успех напрямую
      onExhausted: endId,      // NO → end (exhausted)
      xOffset: unitStartX,
      yOffset,
      useTemplateParams: true,
    });

    allUnitNodes.push(...unit.nodes);
    allUnitEdges.push(...unit.edges);
    splitEdges.push(e(splitId, unit.entryId, SEGMENT_LABELS[seg]));
  });

  // Lowest segment → end directly
  splitEdges.push(e(splitId, endId, SEGMENT_LABELS["low"]));

  // Position success after units (Слияние удалено — сегменты сходятся в Успех)
  const successX = unitStartX + unitWidth + STEP;

  const legacySuccess = legacy.nodes.find((nd) => nd.data.isSuccess) ?? legacy.nodes[legacy.nodes.length - 1];
  const legacyEnd = legacy.nodes.find((nd) => nd.data.nodeType === "end");

  const successNode = n(
    successId,
    legacySuccess.data.label,
    "success",
    successX,
    -40,
    legacySuccess.data.sublabel,
    { isSuccess: true },
    legacySuccess.data.params
  );
  const endNode = n(
    endId,
    legacyEnd?.data.label ?? "Конец",
    "end",
    successX,
    120,
    legacyEnd?.data.sublabel,
    undefined,
    legacyEnd?.data.params
  );

  const nodes = [
    { ...signalNode, position: { x: 0, y: 0 } },
    splitNode,
    ...allUnitNodes,
    successNode,
    endNode,
  ];

  const edges = [
    e(signalNode.id, splitId),
    ...splitEdges,
    ...allUnitEdges,
  ];

  return { nodes, edges };
}

/** Segmented signal types */
const SEGMENTED_TYPES = new Set<SignalType>(["Апсейл", "Удержание"]);

/**
 * «Без коммуникации» minimal template (bug 2a/2b): a campaign that explicitly
 * selected NO channels gets a graph with only the signal path and a terminal
 * success node — no communication nodes (email/sms/push/ivr). `withSignalPath`
 * later inserts the [Скоринг →] Сигнал steps between the entry and success, so
 * the final graph is [Скоринг →] Сигнал → Успех. Built off the legacy
 * skeleton purely to pick up the entry's signal params and the success
 * goal/label; every other (communication) node is dropped.
 *
 * This single shape fixes both the workflow graph (no comm nodes — bug 2b) and
 * the budget forecast (the cost model only prices comm nodes, so communication
 * collapses to 0 — bug 2a).
 */
function minimalTemplate(signalType: SignalType): Template {
  const legacy = TEMPLATE_BY_TYPE[signalType]();
  const signalNode = legacy.nodes[0]; // the source/entry node
  const legacySuccess =
    legacy.nodes.find((nd) => nd.data.isSuccess) ??
    legacy.nodes[legacy.nodes.length - 1];

  // success sits one STEP past where the inserted signal path will land — it is
  // shifted right by `withSignalPath` along with every other non-entry node, so
  // adjacent nodes stay ≥ STEP apart regardless of whether scoring is inserted.
  const successNode = n(
    "success",
    legacySuccess.data.label,
    "success",
    STEP,
    0,
    legacySuccess.data.sublabel,
    { isSuccess: true },
    legacySuccess.data.params
  );

  return {
    nodes: [{ ...signalNode, position: { x: 0, y: 0 } }, successNode],
    edges: [e(signalNode.id, successNode.id)],
  };
}

const STATISTICS_ID = "statistics";

/**
 * 12b — appends the single terminal «Статистика» sink: every `success`/`end`
 * node fans into ONE `statistics` node (fan-in, not one-per-branch). No-op when
 * the graph has no terminal or already has a statistics node. Positioned one
 * STEP right of the rightmost node so the layout stays non-overlapping.
 */
export function withStatisticsSink(t: Template): Template {
  if (t.nodes.some((nd) => nd.data.nodeType === "statistics")) return t;
  const terminals = t.nodes.filter(
    (nd) => nd.data.nodeType === "success" || nd.data.nodeType === "end",
  );
  if (terminals.length === 0) return t;
  const maxX = t.nodes.reduce((m, nd) => Math.max(m, nd.position.x), 0);
  const statsNode = n(
    STATISTICS_ID, "Статистика", "statistics", maxX + STEP, 0,
    undefined, undefined, { kind: "statistics" },
  );
  const statsEdges = terminals.map((term) => e(term.id, STATISTICS_ID));
  return { nodes: [...t.nodes, statsNode], edges: [...t.edges, ...statsEdges] };
}

export function createTemplate(
  signalType: SignalType,
  sourceType: SourceType = "new",
  channels?: Channel[]
): Template {
  let base: Template;

  if (channels && channels.length > 0) {
    // Channel-aware path
    if (SEGMENTED_TYPES.has(signalType)) {
      base = buildSegmentedChannelTemplate(signalType, channels);
    } else {
      base = buildLinearChannelTemplate(signalType, channels);
    }
  } else if (channels) {
    // Explicitly empty channels[] — «без коммуникации» (bug 2a/2b): a minimal
    // graph with no communication nodes (and thus no communication budget).
    base = minimalTemplate(signalType);
  } else {
    // No channels argument at all (undefined) — legacy hardcoded templates.
    base = TEMPLATE_BY_TYPE[signalType]();
  }

  // Graph root: Скоринг → Сигнал → Коммуникация (new/stream) or Сигнал →
  // Коммуникация (own). The standalone «Файл» entry node is folded into the
  // root — new/stream carry «Файлы» on the scoring node, own on the signal node.
  // 12b — every success/end fans into a single terminal «Статистика» sink.
  return withStatisticsSink(withSignalPath(base, sourceType));
}

/** Short human summary of the uploaded bases, e.g. «2 базы · ~14 000 строк». */
export function fileSummaryLine(
  files: { name: string; rowCount: number }[]
): string | undefined {
  if (!files.length) return undefined;
  const totalRows = files.reduce((s, f) => s + f.rowCount, 0);
  return `${files.length} ${pluralRu(files.length, ["база", "базы", "баз"])} · ~${totalRows.toLocaleString("ru-RU")} строк`;
}

/**
 * Overlays real campaign data onto a freshly-built graph. Now that the «Файл»
 * entry node is gone, the uploaded base lives on the graph ROOT:
 *   - `new`/`stream`: the «Скоринг» node carries interests, triggers AND the
 *     uploaded «Файлы»; the downstream «Сигнал» node gets the base `count` (N,
 *     read by the cost model).
 *   - `own` (no scoring): the root «Сигнал» node hosts the base directly —
 *     names + total rows + count.
 * Pure — returns a new graph; leaves graphs without a matching node untouched.
 */
export function applyCampaignContext(
  t: Template,
  ctx: {
    files?: CampaignFile[];
    interests?: string[];
    triggers?: string[];
  }
): Template {
  const files = ctx.files ?? [];
  const interests = ctx.interests ?? [];
  const triggers = ctx.triggers ?? [];
  const totalRows = files.reduce((s, f) => s + f.rowCount, 0);
  const summary = fileSummaryLine(files);
  const hasScoring = t.nodes.some((nd) => nd.data.nodeType === "scoring");

  const nodes = t.nodes.map((nd) => {
    // Scoring root (new/stream): interests + triggers + the uploaded files.
    if (nd.data.nodeType === "scoring" && nd.data.params?.kind === "scoring") {
      return {
        ...nd,
        data: { ...nd.data, params: { ...nd.data.params, interests, triggers, files } },
      };
    }
    // Signal result node: always carries the base `count` (N for the cost
    // model). For `own` (no scoring) it is also the root that shows the base —
    // surface the file names + summary there so nothing is lost with «Файл» gone.
    if (nd.data.nodeType === "signal" && nd.data.params?.kind === "signal") {
      const showFiles = !hasScoring;
      return {
        ...nd,
        data: {
          ...nd.data,
          ...(showFiles && summary ? { sublabel: summary } : {}),
          params: {
            ...nd.data.params,
            count: totalRows || nd.data.params.count,
            ...(showFiles
              ? { fileName: files.map((f) => f.name).join(", ") || nd.data.params.fileName }
              : {}),
          },
        },
      };
    }
    return nd;
  });

  return { nodes, edges: t.edges };
}
