import type { SignalType } from "./app-state";
import type { SourceType } from "@/types/campaign";
import {
  isCommunicationNode,
  type NodeParams,
  type WorkflowNode,
  type WorkflowEdge,
  type WorkflowNodeType,
  type WorkflowNodeData,
  type CampaignFile,
} from "@/types/workflow";

import type { Channel } from "@/types/campaign";
import { buildCommUnit, buildChannelBlock, CHANNEL_Y_SPACING } from "./channel-nodes";
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
      n("split", "Сплиттер", "split", STEP, 0, undefined, undefined,
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
      n("split", "Сплиттер", "split", STEP, 0, undefined, undefined,
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

  // Comm-ноды авто-заполняются шаблонами («магия» #2) → валидны сразу, запуск
  // не блокируется. Пустой текст (если пользователь очистит) — неблокирующее
  // предупреждение (validateWorkflow → warning), а не блок.
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
    "Сплиттер",
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

    // Each unit's YES path → success (напрямую, без Слияния), NO path → end.
    // Comm-ноды авто-заполняются шаблонами («магия» #2) — запуск не блокируется.
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
  return withSignalPath(base, sourceType);
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
    // model) AND (spec C) the signal file-name list read by <SignalFiles/>.
    // For `own` (no scoring) it also surfaces the file names on fileName/sublabel.
    if (nd.data.nodeType === "signal" && nd.data.params?.kind === "signal") {
      const showFiles = !hasScoring;
      const fileNames = files.map((f) => f.name);
      return {
        ...nd,
        data: {
          ...nd.data,
          ...(showFiles && summary ? { sublabel: summary } : {}),
          params: {
            ...nd.data.params,
            count: totalRows || nd.data.params.count,
            files: fileNames,
            ...(showFiles
              ? { fileName: fileNames.join(", ") || nd.data.params.fileName }
              : {}),
          },
        },
      };
    }
    return nd;
  });

  return { nodes, edges: t.edges };
}

// ── mergeChannelNodes ─────────────────────────────────────────────────────────

/** Убирает повторы рёбер по паре source|target — реконнект может воспроизвести уже существующее ребро. */
function dedupeEdges(edges: WorkflowEdge[]): WorkflowEdge[] {
  const seen = new Set<string>();
  const result: WorkflowEdge[] = [];
  for (const edge of edges) {
    const key = `${edge.source}|${edge.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(edge);
  }
  return result;
}

/** Сплиттер-развилка каналов (`buildChannelBlock`) — а не сплит по сегменту/random, который трогать нельзя. */
function isEqualChannelSplit(node: WorkflowNode | undefined): boolean {
  return (
    node?.data.nodeType === "split" &&
    node.data.params?.kind === "split" &&
    node.data.params.by === "equal"
  );
}

/**
 * Схлопывает channel-сплиттеры (`by:"equal"`), у которых после удаления
 * каналов осталась ровно одна исходящая ветка — иначе сплиттер продолжает
 * "делить" аудиторию 50/50 (или иначе) между уцелевшим каналом и мостиком в
 * обход коммуникации (Finding 1). Схлопывание переподключает предков
 * сплиттера напрямую на его единственную оставшуюся цель и удаляет сам
 * сплиттер; лейбл входящего ребра (например, метка сегмента "Макс")
 * переносится на новое ребро. Цикл на случай вложенных сплиттеров.
 */
function collapseDegenerateEqualSplits(
  nodesIn: WorkflowNode[],
  edgesIn: WorkflowEdge[]
): { nodes: WorkflowNode[]; edges: WorkflowEdge[]; newBridges: WorkflowEdge[] } {
  let nodes = nodesIn;
  let edges = edgesIn;
  const newBridges: WorkflowEdge[] = [];

  let changed = true;
  while (changed) {
    changed = false;
    for (const splitNode of nodes) {
      if (!isEqualChannelSplit(splitNode)) continue;
      const outs = edges.filter((ed) => ed.source === splitNode.id);
      if (outs.length !== 1) continue; // валидный (2+) или ещё не тронутый — не трогаем

      const ins = edges.filter((ed) => ed.target === splitNode.id);
      const sole = outs[0].target;
      const bridges = ins.map((inEdge) => e(inEdge.source, sole, inEdge.label as string | undefined));

      edges = dedupeEdges([
        ...edges.filter((ed) => ed.source !== splitNode.id && ed.target !== splitNode.id),
        ...bridges,
      ]);
      nodes = nodes.filter((n) => n.id !== splitNode.id);
      newBridges.push(...bridges);
      changed = true;
      break; // состав nodes/edges изменился — начинаем проход заново
    }
  }

  return { nodes, edges, newBridges };
}

/**
 * Мерж графа под новый набор каналов — смена каналов не должна стоить
 * пользователю ручных и ИИ-правок остального графа, и не должна тайком
 * менять стоимость кампании: результат обязан давать тот же
 * `computeCampaignCost`, что и чистая пересборка `createTemplate(...,
 * nextChannels)` (см. тесты-инварианты в workflow-templates.test.ts).
 *
 * Снятые каналы: коммуникационная нода удаляется. Если она была одной из
 * НЕСКОЛЬКИХ веток channel-сплиттера (`by:"equal"`) — соседние ветки не
 * трогаем, мостик не нужен: сплиттер просто лишается одной ветки. Если она
 * была последней веткой сплиттера (или вообще не под сплиттером) —
 * переподключаем входящие рёбра на цели исходящих. Отдельный проход затем
 * схлопывает сплиттеры, оставшиеся с одной веткой (`collapseDegenerateEqualSplits`)
 * — иначе сплиттер продолжил бы "делить" аудиторию между уцелевшим каналом и
 * мостиком в обход коммуникации. Канал может встречаться в графе несколько
 * раз (первый проход/повтор в `buildCommUnit`, несколько сегментов в
 * `buildSegmentedChannelTemplate`) — и удаление, и добавление обрабатывают
 * КАЖДОЕ такое место по отдельности, а не одно на канал.
 *
 * Новые каналы: каждое место, где сейчас есть коммуникация (сгруппированное
 * по общему предку — общий channel-сплиттер объединяет соседей, любой другой
 * предок держит место отдельно, иначе разные сегменты/проходы схлопнутся в
 * одно), получает недостающие каналы. Если предок — уже channel-сплиттер,
 * новый канал становится ещё одной его веткой. Если нет (одиночная нода, или
 * предок — защищённый сплит по сегменту) — между предком и каналами
 * вставляется новый channel-сплиттер, а защищённый сплит не трогаем вовсе.
 * Если коммуникаций не осталось вовсе, подключение идёт в места,
 * освободившиеся при удалении в этом же вызове, либо — если коммуникаций не
 * было никогда («без коммуникации», bug 2a/2b) — в единственный путь
 * «Сигнал → Успех» минимального шаблона.
 *
 * Задержки, условия, сплиты вне комм-блоков и отредактированные тексты
 * остальных нод не трогаются вовсе.
 *
 * Если в графе не осталось ни коммуникационных, ни condition-нод — сохранять
 * хирургически нечего (пользователю/ИИ негде было оставить правку в
 * коммуникационной области), и функция возвращает чистую пересборку
 * `createTemplate(context.signalType, context.sourceType, nextChannels)`
 * целиком. Это единственный способ корректно восстановить сегментацию
 * (Апсейл/Удержание — сколько сегментов, какие сплиты) и «Конец» с верным
 * `reason`: ни то ни другое `mergeChannelNodes` не может воспроизвести
 * вручную без знания сценария (Fix round 3, Important finding) — отсюда
 * обязательный (не опциональный) `context`.
 */
export function mergeChannelNodes(
  graph: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
  nextChannels: Channel[],
  context: { signalType: SignalType; sourceType: SourceType }
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const { signalType, sourceType } = context;
  const nextSet = new Set(nextChannels);

  let nodes = [...graph.nodes];
  let edges = [...graph.edges];
  // Рёбра, "перекинутые" на месте снятых нод в этом вызове (только там, где
  // предком НЕ был channel-сплиттер с уцелевшими соседями — там мостик не
  // нужен вовсе). Если после удаления коммуникаций не осталось совсем нигде,
  // они подсказывают, куда подключать новые каналы (см. ветку добавления).
  const bridgesCreated: WorkflowEdge[] = [];

  // ── Снятые каналы ───────────────────────────────────────────────────────
  for (const node of graph.nodes) {
    const nodeType = node.data.nodeType;
    if (!isCommunicationNode(nodeType) || nextSet.has(nodeType as Channel)) continue;

    // Живой список nodes/edges (а не исходный graph.*) — если удаляемые ноды
    // образуют цепочку, переподключение первой должно быть видно при
    // обработке следующей.
    const incoming = edges.filter((ed) => ed.target === node.id);
    const outgoing = edges.filter((ed) => ed.source === node.id);

    const soleIncoming = incoming.length === 1 ? incoming[0] : undefined;
    const predecessor = soleIncoming ? nodes.find((n) => n.id === soleIncoming.source) : undefined;
    const predecessorIsEqualSplit = isEqualChannelSplit(predecessor);
    const siblingEdgesRemaining = predecessorIsEqualSplit
      ? edges.filter((ed) => ed.source === predecessor!.id && ed.target !== node.id).length
      : 0;

    if (predecessorIsEqualSplit && siblingEdgesRemaining > 0) {
      // Одна из НЕСКОЛЬКИХ веток сплиттера — соседние ветки уже несут
      // остальную аудиторию, мостик создал бы лишнюю прямую ветку в обход
      // коммуникации (Finding 1). Просто убираем эту ветку.
      edges = edges.filter((ed) => ed.source !== node.id && ed.target !== node.id);
    } else {
      // Одиночный слот (без сплиттера) ИЛИ последняя ветка сплиттера —
      // переподключаем входящие на цели исходящих (сохраняя лейбл, если был).
      const bridges = incoming.flatMap((inEdge) =>
        outgoing.map((outEdge) => e(inEdge.source, outEdge.target, inEdge.label as string | undefined))
      );
      edges = dedupeEdges([
        ...edges.filter((ed) => ed.source !== node.id && ed.target !== node.id),
        ...bridges,
      ]);
      // Мостик от самого сплиттера (predecessorIsEqualSplit) — промежуточный:
      // сплиттер схлопнётся ниже, и итоговый мостик даст collapse-проход.
      if (!predecessorIsEqualSplit) bridgesCreated.push(...bridges);
    }
    nodes = nodes.filter((nd) => nd.id !== node.id);
  }

  const collapsed = collapseDegenerateEqualSplits(nodes, edges);
  nodes = collapsed.nodes;
  edges = collapsed.edges;
  bridgesCreated.push(...collapsed.newBridges);

  // ── Новые каналы ────────────────────────────────────────────────────────
  const remainingComm = nodes.filter((nd) => isCommunicationNode(nd.data.nodeType));
  let freshIndex = 0;

  if (remainingComm.length > 0) {
    // Группируем уцелевшие комм-ноды по общему предку: если предок — реальный
    // channel-сплиттер, его дети — однозначно соседи ОДНОЙ коммуникации
    // (объединяем). Любой другой предок (одиночная нода ИЛИ защищённый сплит
    // по сегменту, у которого разные ветки ведут в РАЗНЫЕ места) держит место
    // отдельно — иначе разные сегменты/проходы, случайно деля предка,
    // схлопнутся в одно место (ровно баг из Finding 2 про сегменты).
    const slots = new Map<string, WorkflowNode[]>(); // predecessorId → участники (если сплиттер)
    const singleSlots: { predecessorId: string; member: WorkflowNode }[] = [];

    for (const node of remainingComm) {
      const incomingEdge = edges.find((ed) => ed.target === node.id);
      if (!incomingEdge) continue;
      const predecessorNode = nodes.find((n) => n.id === incomingEdge.source);
      if (isEqualChannelSplit(predecessorNode)) {
        const list = slots.get(incomingEdge.source) ?? [];
        list.push(node);
        slots.set(incomingEdge.source, list);
      } else {
        singleSlots.push({ predecessorId: incomingEdge.source, member: node });
      }
    }

    const grouped = [
      ...[...slots.entries()].map(([predecessorId, members]) => ({ predecessorId, members })),
      ...singleSlots.map(({ predecessorId, member }) => ({ predecessorId, members: [member] })),
    ];

    for (const { predecessorId, members } of grouped) {
      const existingSlotChannels = new Set(members.map((m) => m.data.nodeType as Channel));
      const slotToAdd = nextChannels.filter((ch) => !existingSlotChannels.has(ch));
      if (slotToAdd.length === 0) continue;

      const predecessorNode = nodes.find((n) => n.id === predecessorId);
      if (!predecessorNode) continue;

      const representative = members[0];
      const successorTargets = edges
        .filter((ed) => ed.source === representative.id)
        .map((ed) => ed.target);

      if (isEqualChannelSplit(predecessorNode)) {
        // Предок — уже channel-сплиттер: новые каналы становятся ещё
        // несколькими его ветками, параллельно уцелевшим.
        for (const channel of slotToAdd) {
          const block = buildChannelBlock([channel], `merged_${freshIndex++}`, true);
          const newNode = block.nodes[0];
          const columnX = representative.position.x;
          const columnNodes = nodes.filter((nd) => nd.position.x === columnX);
          const baseY = columnNodes.length
            ? Math.max(...columnNodes.map((nd) => nd.position.y)) + CHANNEL_Y_SPACING
            : representative.position.y;
          const placed = { ...newNode, position: { x: columnX, y: baseY } };
          nodes = [...nodes, placed];
          edges = dedupeEdges([
            ...edges,
            e(predecessorId, placed.id),
            ...successorTargets.map((t) => e(placed.id, t)),
          ]);
        }
      } else {
        // Предок НЕ channel-сплиттер (одиночная нода или защищённый сплит по
        // сегменту/random) — защищённый сплит не трогаем: вставляем НОВЫЙ
        // channel-сплиттер МЕЖДУ предком и каналами этого места, сохраняя
        // лейбл ребра предка (например, метку сегмента).
        const oldLabelEdge = edges.find(
          (ed) => ed.source === predecessorId && members.some((m) => m.id === ed.target)
        );
        const splitId = `merged_split_${freshIndex++}`;
        const splitX = representative.position.x;
        const splitNode = n(
          splitId,
          "Сплиттер",
          "split",
          splitX,
          representative.position.y,
          undefined,
          undefined,
          { kind: "split", by: "equal", branches: members.length + slotToAdd.length }
        );

        // Существующие участники сдвигаются на одну колонку вправо — на их
        // место встаёт новый сплиттер (как в buildChannelBlock: сплит → канал).
        const shiftedMembers = members.map((m) => ({
          ...m,
          position: { x: m.position.x + STEP, y: m.position.y },
        }));

        nodes = nodes
          .filter((nd) => !members.some((m) => m.id === nd.id))
          .concat(shiftedMembers, splitNode);

        edges = edges.filter(
          (ed) => !(ed.source === predecessorId && members.some((m) => m.id === ed.target))
        );
        edges = dedupeEdges([
          ...edges,
          e(predecessorId, splitId, oldLabelEdge?.label as string | undefined),
          ...members.map((m) => e(splitId, m.id)),
        ]);

        slotToAdd.forEach((channel, i) => {
          const block = buildChannelBlock([channel], `merged_${freshIndex++}`, true);
          const newNode = block.nodes[0];
          const y = representative.position.y + (members.length + i) * CHANNEL_Y_SPACING;
          const placed = { ...newNode, position: { x: splitX + STEP, y } };
          nodes = [...nodes, placed];
          edges = dedupeEdges([
            ...edges,
            e(splitId, placed.id),
            ...successorTargets.map((t) => e(placed.id, t)),
          ]);
        });
      }
    }
  } else if (nextChannels.length > 0) {
    // Коммуникаций не осталось нигде, но новый набор каналов НЕ пуст. Если
    // condition-ноды («Взаимодействие») где-то ещё остались — юнит
    // retry-цепочки (условие/задержка/повтор) уже существует (например, после
    // раздельных «опустошили → заполнили» вызовов) и трогать его нельзя;
    // просто находим места входа по рёбрам, ведущим В условия (а не «в
    // успех» — у cond1 и cond2 ОБЕ YES-ветки ведут в success, так что это не
    // однозначный ориентир, Fix round 2).
    const conditionNodes = nodes.filter((nd) => nd.data.nodeType === "condition");

    if (conditionNodes.length === 0) {
      // Ни коммуникаций, ни condition-нод — сохранять хирургически нечего:
      // коммуникации не было никогда («без коммуникации», bug 2a/2b), либо
      // предыдущий merge её уже полностью стёр. mergeChannelNodes не может
      // сам знать, что "Апсейл"/"Удержание" — сегментированные сценарии
      // (нет signalType без context), поэтому ручная реконструкция здесь
      // раньше ВСЕГДА строила линейный юнит — и ломала сегментацию (Fix
      // round 3, Important finding). Чистая пересборка через createTemplate
      // (тот же билдер, что диспетчерит linear/segmented и знает про
      // «Конец» с правильным `reason`) даёт паритет с фактической
      // пересборкой по построению, а не по ручной мимикрии.
      return createTemplate(signalType, sourceType, nextChannels);
    }

    type Position = { sources: string[]; targets: string[]; label?: string };
    const seen = new Set<string>();
    const positions: Position[] = [];
    for (const cond of conditionNodes) {
      for (const inEdge of edges.filter((ed) => ed.target === cond.id)) {
        const key = `${inEdge.source}|${inEdge.target}`;
        if (seen.has(key)) continue;
        seen.add(key);
        positions.push({ sources: [inEdge.source], targets: [cond.id], label: inEdge.label as string | undefined });
      }
    }

    positions.forEach((pos) => {
      const block = buildChannelBlock(nextChannels, `merged_${freshIndex++}`, true);

      // Убираем сквозное ребро в обход коммуникации на этом месте — иначе
      // сообщение получит окольный путь мимо новых каналов.
      edges = edges.filter(
        (ed) => !(pos.sources.includes(ed.source) && pos.targets.includes(ed.target))
      );

      const baseX = (nodes.find((nd) => nd.id === pos.sources[0])?.position.x ?? 0) + STEP;
      const columnNodes = nodes.filter((nd) => nd.position.x === baseX);
      const baseY = columnNodes.length
        ? Math.max(...columnNodes.map((nd) => nd.position.y)) + CHANNEL_Y_SPACING
        : 0;

      const placedNodes = block.nodes.map((nd) => ({
        ...nd,
        position: { x: nd.position.x + baseX, y: nd.position.y + baseY },
      }));

      nodes = [...nodes, ...placedNodes];
      edges = dedupeEdges([
        ...edges,
        ...pos.sources.map((src) => e(src, block.entryId, pos.label)),
        ...block.edges,
        ...pos.targets.flatMap((tgt) => block.exitIds.map((exit) => e(exit, tgt))),
      ]);
    });
  }

  // ── Нормализация числа веток ────────────────────────────────────────────
  // params.branches у channel-сплиттеров держим в согласии с фактическим
  // числом исходящих рёбер (созданных/удалённых выше) — cost-модель читает
  // реальные рёбра, а не это поле, но оно не должно врать в карточке ноды.
  nodes = nodes.map((nd) => {
    if (!isEqualChannelSplit(nd)) return nd;
    const actual = edges.filter((ed) => ed.source === nd.id).length;
    const params = nd.data.params as Extract<NodeParams, { kind: "split" }>;
    if (params.branches === actual) return nd;
    return { ...nd, data: { ...nd.data, params: { ...params, branches: actual } } };
  });

  return { nodes, edges };
}
