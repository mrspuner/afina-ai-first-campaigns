import type { SignalType } from "./app-state";
import type { SourceType } from "@/types/campaign";
import type {
  NodeParams,
  WorkflowNode,
  WorkflowEdge,
  WorkflowNodeType,
  WorkflowNodeData,
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
      n("signal", "Сигнал", "source", 0, 0, "Регистрация", undefined,
        { kind: "signal", fileName: "сигнал_регистрация.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("email", "Email", "email", STEP, 0, "Welcome", undefined,
        { kind: "email", subject: "Добро пожаловать", body: "Мы рады видеть вас в нашем сервисе.", sender: "noreply@brand.com", link: "https://brand.com/welcome" }),
      n("wait", "Задержка", "wait", STEP * 2, 0, "1 день", undefined,
        { kind: "wait", mode: "duration", durationHours: 24 }),
      n("push", "Push", "push", STEP * 3, 0, "Напоминание", undefined,
        { kind: "push", title: "Новости от бренда", body: "Есть что посмотреть", deeplink: "brand://home" }),
      n("success", "Успех", "success", STEP * 4, 0, "Активирован", { isSuccess: true },
        { kind: "success", goal: "Активация" }),
      n("end", "Конец", "end", STEP * 4, 120, "Без конверсии", undefined,
        { kind: "end", reason: "Без активации" }),
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
      n("signal", "Сигнал", "source", 0, 0, "Первая сделка", undefined,
        { kind: "signal", fileName: "сигнал_первая-сделка.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("sms", "СМС", "sms", STEP, 0, "Промо", undefined,
        { kind: "sms", text: "Готовы к первой покупке? Подарок внутри.", alphaName: "BRAND", scheduledAt: "immediate", link: "https://brand.com/first" }),
      n("condition", "Условие", "condition", STEP * 2, 0, "Открыл?", undefined,
        { kind: "condition", trigger: "opened" }),
      n("landing", "Лендинг", "landing", STEP * 3, -80, "Покупка", undefined,
        { kind: "landing", cta: "Купить", offerTitle: "Первый оффер" }),
      n("push", "Push", "push", STEP * 3, 80, "Напомни", undefined,
        { kind: "push", title: "Первая сделка", body: "Не пропустите" }),
      n("success", "Успех", "success", STEP * 4, -80, "Конверсия", { isSuccess: true },
        { kind: "success", goal: "Первая покупка" }),
      n("end", "Конец", "end", STEP * 4, 80, undefined, undefined,
        { kind: "end", reason: "Не открыл" }),
    ],
    edges: [
      e("signal", "sms"),
      e("sms", "condition"),
      e("condition", "landing", "YES"),
      e("condition", "push", "NO"),
      e("landing", "success"),
      e("push", "end"),
    ],
  };
}

function upsellTemplate(): Template {
  return {
    nodes: [
      n("signal", "Сигнал", "source", 0, 0, "Апсейл", undefined,
        { kind: "signal", fileName: "сигнал_апсейл.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("split", "Сплиттер", "split", STEP, 0, "По сегменту", undefined,
        { kind: "split", by: "segment", branches: 3 }),
      n("storefront", "Витрина", "storefront", STEP * 2, -120, "Max", undefined,
        { kind: "storefront", offers: ["Оффер А", "Оффер Б"] }),
      n("email", "Email", "email", STEP * 2, -40, "High", undefined,
        { kind: "email", subject: "Персональное предложение", body: "Специально для вас.", sender: "promo@brand.com", link: "https://brand.com/upsell" }),
      n("sms", "СМС", "sms", STEP * 2, 40, "Mid", undefined,
        { kind: "sms", text: "Скидка 20% для вашего сегмента.", alphaName: "BRAND", scheduledAt: "immediate" }),
      n("end", "Конец", "end", STEP * 2, 120, "Low", undefined,
        { kind: "end", reason: "Без апсейла" }),
      n("landing", "Лендинг", "landing", STEP * 3, -40, "Оффер", undefined,
        { kind: "landing", cta: "Забрать скидку", offerTitle: "Апсейл" }),
      n("merge", "Слияние", "merge", STEP * 4, -40, undefined, undefined,
        { kind: "merge" }),
      n("success", "Успех", "success", STEP * 5, -40, "Купил", { isSuccess: true },
        { kind: "success", goal: "Апсейл" }),
    ],
    edges: [
      e("signal", "split"),
      e("split", "storefront", "Макс"),
      e("split", "email", "Выс"),
      e("split", "sms", "Ср"),
      e("split", "end", "Низ"),
      e("storefront", "landing"),
      e("email", "landing"),
      e("sms", "landing"),
      e("landing", "merge"),
      e("merge", "success"),
    ],
  };
}

function reactivationTemplate(): Template {
  return {
    nodes: [
      n("signal", "Сигнал", "source", 0, 0, "Реактивация", undefined,
        { kind: "signal", fileName: "сигнал_реактивация.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("wait", "Задержка", "wait", STEP, 0, "3 дня", undefined,
        { kind: "wait", mode: "duration", durationHours: 72 }),
      n("sms", "СМС", "sms", STEP * 2, 0, "Оффер", undefined,
        { kind: "sms", text: "Мы скучаем, вот скидка 30% для вас.", alphaName: "BRAND", scheduledAt: "immediate" }),
      n("condition", "Условие", "condition", STEP * 3, 0, "Кликнул?", undefined,
        { kind: "condition", trigger: "clicked" }),
      n("landing", "Лендинг", "landing", STEP * 4, -80, "Оффер", undefined,
        { kind: "landing", cta: "Вернуться", offerTitle: "Реактивация" }),
      n("ivr", "Звонок", "ivr", STEP * 4, 80, "Голосовой", undefined,
        { kind: "ivr", scenario: "Возврат", voiceType: "female" }),
      n("success", "Успех", "success", STEP * 5, -80, "Вернулся", { isSuccess: true },
        { kind: "success", goal: "Реактивация" }),
      n("end", "Конец", "end", STEP * 5, 80, undefined, undefined,
        { kind: "end", reason: "Молчание" }),
    ],
    edges: [
      e("signal", "wait"),
      e("wait", "sms"),
      e("sms", "condition"),
      e("condition", "landing", "YES"),
      e("condition", "ivr", "NO"),
      e("landing", "success"),
      e("ivr", "end"),
    ],
  };
}

function returnTemplate(): Template {
  return {
    nodes: [
      n("signal", "Сигнал", "source", 0, 0, "Возврат", undefined,
        { kind: "signal", fileName: "сигнал_возврат.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("email", "Email", "email", STEP, 0, "Напоминание", undefined,
        { kind: "email", subject: "Мы ценим вас", body: "Вернитесь и получите подарок.", sender: "care@brand.com", link: "https://brand.com/return" }),
      n("wait", "Задержка", "wait", STEP * 2, 0, "3 дня", undefined,
        { kind: "wait", mode: "duration", durationHours: 72 }),
      n("push", "Push", "push", STEP * 3, 0, "Усилить", undefined,
        { kind: "push", title: "Подарок ждёт", body: "Загляните в приложение", deeplink: "brand://return" }),
      n("condition", "Условие", "condition", STEP * 4, 0, "Открыл?", undefined,
        { kind: "condition", trigger: "opened" }),
      n("storefront", "Витрина", "storefront", STEP * 5, -80, "Офферы", undefined,
        { kind: "storefront", offers: ["Возврат", "Бонус"] }),
      n("end", "Конец", "end", STEP * 5, 80, undefined, undefined,
        { kind: "end", reason: "Не открыл" }),
      n("success", "Успех", "success", STEP * 6, -80, "Купил", { isSuccess: true },
        { kind: "success", goal: "Возврат" }),
    ],
    edges: [
      e("signal", "email"),
      e("email", "wait"),
      e("wait", "push"),
      e("push", "condition"),
      e("condition", "storefront", "YES"),
      e("condition", "end", "NO"),
      e("storefront", "success"),
    ],
  };
}

function retentionTemplate(): Template {
  return {
    nodes: [
      n("signal", "Сигнал", "source", 0, 0, "Удержание", undefined,
        { kind: "signal", fileName: "сигнал_удержание.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("split", "Сплиттер", "split", STEP, 0, "По сегменту", undefined,
        { kind: "split", by: "segment", branches: 3 }),
      n("ivr", "Звонок", "ivr", STEP * 2, -100, "Персональный", undefined,
        { kind: "ivr", scenario: "Удержание", voiceType: "neutral" }),
      n("email", "Email", "email", STEP * 2, 0, "Дайджест", undefined,
        { kind: "email", subject: "Ваш дайджест", body: "Самое важное за неделю.", sender: "digest@brand.com" }),
      n("push", "Push", "push", STEP * 2, 100, "Напомни", undefined,
        { kind: "push", title: "Не забудьте заглянуть", body: "Есть новое" }),
      n("merge", "Слияние", "merge", STEP * 3, 0, undefined, undefined,
        { kind: "merge" }),
      n("wait", "Задержка", "wait", STEP * 4, 0, "7 дней", undefined,
        { kind: "wait", mode: "duration", durationHours: 168 }),
      n("success", "Успех", "success", STEP * 5, 0, "Активен", { isSuccess: true },
        { kind: "success", goal: "Удержание" }),
    ],
    edges: [
      e("signal", "split"),
      e("split", "ivr", "Выс"),
      e("split", "email", "Ср"),
      e("split", "push", "Низ"),
      e("ivr", "merge"),
      e("email", "merge"),
      e("push", "merge"),
      e("merge", "wait"),
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

/** Relabels the entry node «Сигнал» → «Файл» (Block C #8): the graph now reads
 *  as a path Файл → Скоринг → Сигнал → Коммуникация, so the entry (the uploaded
 *  base) is the «Файл», and the scored audience becomes a downstream «Сигнал». */
function relabelEntryToFile(t: Template): Template {
  const [entry, ...rest] = t.nodes;
  if (!entry) return t;
  return {
    nodes: [{ ...entry, data: { ...entry.data, label: "Файл" } }, ...rest],
    edges: t.edges,
  };
}

/**
 * Builds the campaign path between the entry `Файл` node and its first
 * downstream node (Block C #8): inserts a `scoring` node (for `new`/`stream` —
 * collected/streamed audiences are scored before communication; `own` bases are
 * pre-loaded and skip it) and always a `signal` result node (the scored
 * audience). Path: Файл → [Скоринг →] Сигнал → <original first target>.
 *
 * The scoring node carries `ScoringParams` (interests/triggers, empty by default
 * — filled from the campaign), and the signal node carries `SignalParams`;
 * neither has a required human field, so `nodeNeedsAttention` stays false and
 * the path never blocks launch.
 */
function withSignalPath(t: Template, sourceType: SourceType): Template {
  const entry = t.nodes[0];
  if (!entry) return t;
  const entryId = entry.id;
  const firstEdge = t.edges.find((edge) => edge.source === entryId);
  if (!firstEdge) return t;

  const hasScoring = sourceType !== "own";
  const inserted = hasScoring ? 2 : 1;

  // Make room: shift every non-entry node right by the inserted-node count.
  const shifted = t.nodes.map((nd) =>
    nd.id === entryId
      ? nd
      : { ...nd, position: { ...nd.position, x: nd.position.x + inserted * STEP } }
  );

  const newNodes: WorkflowNode[] = [];
  const newEdges: WorkflowEdge[] = [];
  let prevId = entryId;
  let x = entry.position.x;

  if (hasScoring) {
    x += STEP;
    newNodes.push(
      n("scoring", "Скоринг", "scoring", x, entry.position.y, "Качество базы", undefined,
        { kind: "scoring", interests: [], triggers: [] })
    );
    newEdges.push(e(prevId, "scoring"));
    prevId = "scoring";
  }

  x += STEP;
  newNodes.push(
    n("signal_result", "Сигнал", "signal", x, entry.position.y, "Готовая аудитория", undefined,
      { kind: "signal", fileName: "", count: 0, segments: EMPTY_SEGMENTS })
  );
  newEdges.push(e(prevId, "signal_result"));
  prevId = "signal_result";

  const edges = t.edges
    .filter((edge) => edge.id !== firstEdge.id)
    .concat(newEdges, [e(prevId, firstEdge.target)]);

  return { nodes: [...shifted, ...newNodes], edges };
}

// ── Channel-aware template builders ──────────────────────────────────────────

/**
 * Rough estimate of the x-width a comm unit occupies, to help position
 * success/end nodes. For 1 channel: STEP * 5 (entry→cond→wait→repeat→cond2).
 * For N channels: add STEP for split + STEP for merge.
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
 * Structure: source → split(by segment) → [comm unit per active segment] → merge → success
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
  const mergeId = "seg_merge";
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

    // Each unit's YES path → merge, NO path → end
    const unit = buildCommUnit(channels, {
      prefix,
      onEngaged: mergeId,      // YES → merge
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

  // Position merge + success after units
  const mergeX = unitStartX + unitWidth + STEP * 2;
  const mergeNode = n(mergeId, "Слияние", "merge", mergeX, -40, undefined, undefined, { kind: "merge" });

  const legacySuccess = legacy.nodes.find((nd) => nd.data.isSuccess) ?? legacy.nodes[legacy.nodes.length - 1];
  const legacyEnd = legacy.nodes.find((nd) => nd.data.nodeType === "end");

  const successNode = n(
    successId,
    legacySuccess.data.label,
    "success",
    mergeX + STEP,
    -40,
    legacySuccess.data.sublabel,
    { isSuccess: true },
    legacySuccess.data.params
  );
  const endNode = n(
    endId,
    legacyEnd?.data.label ?? "Конец",
    "end",
    unitStartX + unitWidth + STEP,
    120,
    legacyEnd?.data.sublabel,
    undefined,
    legacyEnd?.data.params
  );

  const nodes = [
    { ...signalNode, position: { x: 0, y: 0 } },
    splitNode,
    ...allUnitNodes,
    mergeNode,
    successNode,
    endNode,
  ];

  const edges = [
    e(signalNode.id, splitId),
    ...splitEdges,
    ...allUnitEdges,
    e(mergeId, successId),
  ];

  return { nodes, edges };
}

/** Segmented signal types */
const SEGMENTED_TYPES = new Set<SignalType>(["Апсейл", "Удержание"]);

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
  } else {
    // Legacy path (no channels) — existing hardcoded templates
    base = TEMPLATE_BY_TYPE[signalType]();
  }

  // Graph reads as Файл → [Скоринг →] Сигнал → Коммуникация (Block C #8).
  return withSignalPath(relabelEntryToFile(base), sourceType);
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
 * Overlays real campaign data onto a freshly-built graph (Block C #8): the entry
 * «Файл» node shows the uploaded bases (names + total rows) and the «Скоринг»
 * node carries the campaign's interests. Pure — returns a new graph; leaves
 * graphs without a matching node untouched.
 */
export function applyCampaignContext(
  t: Template,
  ctx: { files?: { name: string; rowCount: number }[]; interests?: string[] }
): Template {
  const files = ctx.files ?? [];
  const interests = ctx.interests ?? [];
  const totalRows = files.reduce((s, f) => s + f.rowCount, 0);
  const summary = fileSummaryLine(files);

  const nodes = t.nodes.map((nd) => {
    if (nd.data.nodeType === "source" && nd.data.params?.kind === "signal") {
      return {
        ...nd,
        data: {
          ...nd.data,
          ...(summary ? { sublabel: summary } : {}),
          params: {
            ...nd.data.params,
            fileName: files.map((f) => f.name).join(", ") || nd.data.params.fileName,
            count: totalRows || nd.data.params.count,
          },
        },
      };
    }
    if (nd.data.nodeType === "scoring" && nd.data.params?.kind === "scoring") {
      return { ...nd, data: { ...nd.data, params: { ...nd.data.params, interests } } };
    }
    return nd;
  });

  return { nodes, edges: t.edges };
}
