/**
 * channel-nodes.ts — unified channel → node mapping.
 *
 * Single source of truth for:
 * - Channel type (re-export from types/campaign to avoid circular deps)
 * - Channel labels, colors, and default params
 * - buildChannelBlock: parallel split→channels (Слияние удалено) or single node
 * - buildCommUnit: channel block + condition + retry + second condition
 *
 * Deduplicate targets:
 * - defaultParamsFor (structural-commands.ts) — delegates sms/email/push/ivr here
 * - defaultParams (rebuild-schema.ts) — delegates sms/email/push/ivr here
 */

import type { WorkflowNode, WorkflowEdge, NodeParams } from "@/types/workflow";
import type { Channel } from "@/types/campaign";

export type { Channel };

// ── Node visual configuration ─────────────────────────────────────────────────

/** Border/bg/text colors for each channel (mirrors node-visuals.ts). */
const CHANNEL_COLORS: Record<Channel, string> = {
  sms:   "#5eead4",
  email: "#67e8f9",
  push:  "#93c5fd",
  ivr:   "#c4b5fd",
};

// ── Channel label map ─────────────────────────────────────────────────────────

/** Human-facing label for each channel. */
export const CHANNEL_LABEL: Record<Channel, string> = {
  sms:   "SMS",
  email: "Email",
  push:  "Push",
  ivr:   "Звонок",
};

// ── Default params (preset, fully-filled) ────────────────────────────────────

/**
 * Returns default NodeParams for a channel.
 * These are the "filled preset" variants used in templates.
 */
/**
 * Returns default NodeParams for a channel (for structural commands — empty fields
 * trigger needsAttention, prompting the user to fill them in).
 */
export function channelDefaultParams(channel: Channel): NodeParams {
  switch (channel) {
    case "sms":
      return {
        kind: "sms",
        text: "",
        alphaName: "BRAND",
        scheduledAt: "immediate",
      };
    case "email":
      return {
        kind: "email",
        subject: "",
        body: "",
        sender: "noreply@brand.com",
      };
    case "push":
      return { kind: "push", title: "", body: "" };
    case "ivr":
      return { kind: "ivr", scenario: "", voiceType: "neutral" };
  }
}

/**
 * Returns pre-filled template NodeParams for a channel. Used in template
 * generation so the graph passes validation (no needsAttention flags).
 * These are placeholder texts the user can overwrite via the prompt bar.
 */
export function channelTemplateParams(channel: Channel): NodeParams {
  switch (channel) {
    case "sms":
      // #2 — совпадает по тексту с пресетом `tpl_sms_reminder` («SMS —
      // напоминание»), поэтому селект «Шаблон» сразу показывает имя привязанного
      // шаблона (а не «—») и работает постоянный глазик превью (#6).
      return {
        kind: "sms",
        text: "Ваше предложение ждёт. Подробности на сайте.",
        alphaName: "AFINA",
        scheduledAt: "immediate",
      };
    case "email":
      return {
        kind: "email",
        subject: "Специальное предложение",
        body: "Мы подготовили для вас персональное предложение.",
        sender: "noreply@brand.com",
      };
    case "push":
      // #2 — совпадает по body с пресетом `tpl_push_back` («Push — возвращение»).
      return { kind: "push", title: "Давно вас не видели", body: "Загляните — у нас есть кое-что для вас." };
    case "ivr":
      return { kind: "ivr", scenario: "Персональное предложение", voiceType: "neutral" };
  }
}

// ── CHANNEL_NODE_MAP ─────────────────────────────────────────────────────────

export interface ChannelNodeEntry {
  label: string;
  defaultParams: NodeParams;
  color: string;
}

export const CHANNEL_NODE_MAP: Record<Channel, ChannelNodeEntry> = {
  sms:   { label: CHANNEL_LABEL.sms,   defaultParams: channelDefaultParams("sms"),   color: CHANNEL_COLORS.sms   },
  email: { label: CHANNEL_LABEL.email, defaultParams: channelDefaultParams("email"), color: CHANNEL_COLORS.email },
  push:  { label: CHANNEL_LABEL.push,  defaultParams: channelDefaultParams("push"),  color: CHANNEL_COLORS.push  },
  ivr:   { label: "IVR",   defaultParams: channelDefaultParams("ivr"),   color: CHANNEL_COLORS.ivr   },
};

// ── Node factory ─────────────────────────────────────────────────────────────

const EDGE_STYLE = { stroke: "#2a2a2a", strokeWidth: 1.5 };
const LABEL_STYLE = { fill: "rgba(255,255,255,0.9)", fontSize: 10, fontWeight: 500 };
const LABEL_BG_STYLE = { fill: "#141414", fillOpacity: 0.92, stroke: "#2a2a2a", strokeWidth: 1 };
const LABEL_BG_PADDING: [number, number] = [4, 2];
const LABEL_BG_BORDER_RADIUS = 4;

function makeNode(
  id: string,
  label: string,
  nodeType: WorkflowNode["data"]["nodeType"],
  x: number,
  y: number,
  sublabel?: string,
  params?: NodeParams
): WorkflowNode {
  return {
    id,
    type: "workflowNode",
    position: { x, y },
    data: {
      label,
      nodeType,
      ...(sublabel ? { sublabel } : {}),
      ...(params ? { params } : {}),
    },
  };
}

function makeEdge(source: string, target: string, label?: string): WorkflowEdge {
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

// ── Layout constants ──────────────────────────────────────────────────────────

const STEP = 210;
const CHANNEL_Y_SPACING = 80;

// ── buildChannelBlock ─────────────────────────────────────────────────────────

export interface ChannelBlock {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  /** ID of the entry point (split node for multi-channel, channel node for single). */
  entryId: string;
  /**
   * IDs of the block's exit points. Слияние удалено: для нескольких каналов
   * каждый канал — самостоятельный выход (все ведут напрямую в следующую ноду);
   * для одного канала — сам канал; для пустого блока — пусто.
   */
  exitIds: string[];
}

/**
 * Builds a channel communication block.
 *
 * - Multiple channels: split → [channels in parallel]; каждый канал — выход
 *   (Слияние удалено — ветки сходятся стрелками в следующую ноду напрямую).
 * - Single channel: single channel node (no split)
 * - Zero channels: empty block (entryId dummy, exitIds empty)
 *
 * All node IDs are prefixed with `idPrefix` (default: "comm").
 */
export function buildChannelBlock(channels: Channel[], idPrefix?: string, useTemplateParams?: boolean): ChannelBlock {
  const prefix = idPrefix ?? "comm";

  if (channels.length === 0) {
    return { nodes: [], edges: [], entryId: `${prefix}_empty`, exitIds: [] };
  }

  if (channels.length === 1) {
    const ch = channels[0];
    const entry = CHANNEL_NODE_MAP[ch];
    const nodeId = `${prefix}_${ch}`;
    const params = useTemplateParams ? channelTemplateParams(ch) : entry.defaultParams;
    const node = makeNode(nodeId, entry.label, ch, 0, 0, undefined, params);
    return { nodes: [node], edges: [], entryId: nodeId, exitIds: [nodeId] };
  }

  // Multiple channels: split → channels (each channel is an exit; no merge)
  const splitId = `${prefix}_split`;

  const splitNode = makeNode(
    splitId,
    "Сплиттер",
    "split",
    0,
    0,
    undefined,
    { kind: "split", by: "equal", branches: channels.length }
  );

  const totalHeight = (channels.length - 1) * CHANNEL_Y_SPACING;
  const startY = -totalHeight / 2;

  const channelNodes: WorkflowNode[] = channels.map((ch, i) => {
    const entry = CHANNEL_NODE_MAP[ch];
    const nodeId = `${prefix}_${ch}`;
    const params = useTemplateParams ? channelTemplateParams(ch) : entry.defaultParams;
    return makeNode(nodeId, entry.label, ch, STEP, startY + i * CHANNEL_Y_SPACING, undefined, params);
  });

  const edges: WorkflowEdge[] = channels.map((ch) => makeEdge(splitId, `${prefix}_${ch}`));

  return {
    nodes: [splitNode, ...channelNodes],
    edges,
    entryId: splitId,
    exitIds: channels.map((ch) => `${prefix}_${ch}`),
  };
}

// ── buildCommUnit ─────────────────────────────────────────────────────────────

export interface CommUnitOptions {
  /** ID prefix for this unit's internal nodes (e.g. "reg_comm"). */
  prefix: string;
  /** ID of the node that follows when the user engaged (YES branches). */
  onEngaged: string;
  /** ID of the node that follows when the user never engaged (final NO branch). */
  onExhausted: string;
  /** X offset for this unit (default: 0). */
  xOffset?: number;
  /** Y offset for this unit (default: 0). */
  yOffset?: number;
  /** When true, uses pre-filled template params instead of empty defaults. */
  useTemplateParams?: boolean;
}

export interface CommUnit {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  /** ID of the entry node for this unit (first split or first channel). */
  entryId: string;
}

/**
 * Builds the full "communication unit with follow-up" from the spec:
 *
 * ```
 * [channel block] → condition «взаимодействовал?»
 *   YES → onEngaged
 *   NO  → wait → [repeat channel block] → condition «взаимодействовал?»
 *                   YES → onEngaged
 *                   NO  → onExhausted
 * ```
 *
 * Condition exists even for a single channel.
 * Repeat count = 1 (not configurable per spec decision).
 */
export function buildCommUnit(channels: Channel[], opts: CommUnitOptions): CommUnit {
  const { prefix, onEngaged, onExhausted, xOffset = 0, yOffset = 0, useTemplateParams } = opts;

  const ox = xOffset;
  const oy = yOffset;

  // 1. First channel block
  const firstBlock = buildChannelBlock(channels, `${prefix}`, useTemplateParams);

  // Offset first block's nodes
  const firstNodes = firstBlock.nodes.map((n) => ({
    ...n,
    position: { x: n.position.x + ox, y: n.position.y + oy },
  }));

  // 2. First condition node ("взаимодействовал?")
  // Слияние удалено — условие идёт сразу за каналами (split col0, channels col1,
  // cond col2 для нескольких каналов), без пустой колонки на месте Слияния.
  const cond1Id = `${prefix}_cond`;
  const cond1X = ox + (channels.length > 1 ? STEP * 2 : STEP);
  const cond1 = makeNode(
    cond1Id,
    "Взаимодействие",
    "condition",
    cond1X,
    oy,
    undefined,
    { kind: "condition", trigger: "opened" }
  );

  // 3. Wait node between first NO and repeat
  const waitId = `${prefix}_wait`;
  const waitX = cond1X + STEP;
  const waitY = oy + 100;
  const waitNode = makeNode(
    waitId,
    "Задержка",
    "wait",
    waitX,
    waitY,
    undefined,
    { kind: "wait", mode: "duration", durationHours: 48 }
  );

  // 4. Repeat channel block
  const repeatPrefix = `${prefix}_repeat`;
  const repeatBlock = buildChannelBlock(channels, repeatPrefix, useTemplateParams);
  const repeatStartX = waitX + STEP;
  const repeatNodes = repeatBlock.nodes.map((n) => ({
    ...n,
    position: { x: n.position.x + repeatStartX, y: n.position.y + waitY },
  }));

  // 5. Second condition node ("взаимодействовал? [повтор]")
  const cond2Id = `${prefix}_cond2`;
  const cond2X = repeatStartX + (channels.length > 1 ? STEP * 2 : STEP);
  const cond2 = makeNode(
    cond2Id,
    "Взаимодействие",
    "condition",
    cond2X,
    waitY,
    undefined,
    { kind: "condition", trigger: "opened" }
  );

  // ── Assemble nodes ──
  const nodes: WorkflowNode[] = [
    ...firstNodes,
    cond1,
    waitNode,
    ...repeatNodes,
    cond2,
  ];

  // ── Assemble edges ──
  const edges: WorkflowEdge[] = [
    // First block's internal edges (already built)
    ...firstBlock.edges,
    // Каждый выход блока (канал или единственная нода) → первое условие напрямую
    ...firstBlock.exitIds.map((exit) => makeEdge(exit, cond1Id)),
    // First condition YES → onEngaged
    makeEdge(cond1Id, onEngaged, "ДА"),
    // First condition NO → wait
    makeEdge(cond1Id, waitId, "НЕТ"),
    // Wait → repeat block entry
    makeEdge(waitId, repeatBlock.entryId),
    // Repeat block's internal edges
    ...repeatBlock.edges,
    // Каждый выход повторного блока → второе условие напрямую
    ...repeatBlock.exitIds.map((exit) => makeEdge(exit, cond2Id)),
    // Second condition YES → onEngaged
    makeEdge(cond2Id, onEngaged, "ДА"),
    // Second condition NO → onExhausted
    makeEdge(cond2Id, onExhausted, "НЕТ"),
  ];

  return {
    nodes,
    edges,
    entryId: firstBlock.entryId,
  };
}
