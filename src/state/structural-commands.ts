import type {
  WorkflowNodeType,
  WorkflowNode,
  WorkflowEdge,
  NodeParams,
} from "@/types/workflow";
import type { Channel } from "@/types/campaign";
import { NODE_ACTIONS } from "./node-actions";
import { CHANNEL_NODE_MAP, CHANNEL_LABEL } from "./channel-nodes";

export type Placement =
  | { mode: "after"; ref: string }
  | { mode: "before"; ref: string }
  | { mode: "between"; refA: string; refB: string }
  | { mode: "auto" };

/** Описание одной исходящей ветки fan-out-ноды (split/condition). */
export type BranchSpec = {
  /** Подпись ребра (RU), напр. «Высокий». */
  label: string;
  /** Канал на конце ветки — создаётся нода-канал (sms/email/push/ivr). */
  channel?: Channel;
};

export type StructuralOp =
  | {
      kind: "add";
      nodeType: WorkflowNodeType;
      placement: Placement;
      inlineParams?: string;
    }
  | { kind: "remove"; ref: string }
  | {
      kind: "replace";
      ref: string;
      newType: WorkflowNodeType;
      inlineParams?: string;
      /**
       * Block 7: для замены на разветвляющий тип (split/condition) — описание
       * исходящих веток. Каждая ветка: подпись ребра (label) + опциональный
       * канал (создаётся нода-канал в конце ветки). Если не задано — поведение
       * деградирует к дефолтному ветвлению (см. applyReplace).
       */
      branches?: BranchSpec[];
    }
  | {
      kind: "addCondition";
      ref: string;
      yesLabel?: string;
      noLabel?: string;
    };

export type AppliedOp = { op: StructuralOp; description: string };
export type SkippedOp = { op: StructuralOp; reason: string };

const TYPE_LOOKUP: Record<string, WorkflowNodeType> = {
  "смс": "sms",
  "sms": "sms",
  "email": "email",
  "почта": "email",
  "push": "push",
  "пуш": "push",
  "звонок": "ivr",
  "ivr": "ivr",
  "задержка": "wait",
  "ожидание": "wait",
  "витрина": "storefront",
  "лендинг": "landing",
  "успех": "success",
  "конец": "end",
};

/**
 * Per-word synonym map used when matching a user-written node reference
 * against actual node labels. Values are the canonical form each variant
 * collapses to. Keep all keys lowercase.
 */
const REF_SYNONYMS: Record<string, string> = {
  sms: "смс",
  смс: "смс",
  email: "email",
  почта: "email",
  mail: "email",
  "e-mail": "email",
  push: "push",
  пуш: "push",
  звонок: "звонок",
  ivr: "звонок",
  call: "звонок",
  задержка: "задержка",
  ожидание: "задержка",
  пауза: "задержка",
  wait: "задержка",
  delay: "задержка",
  витрина: "витрина",
  storefront: "витрина",
  лендинг: "лендинг",
  landing: "лендинг",
  успех: "успех",
  success: "успех",
  конец: "конец",
  end: "конец",
  условие: "условие",
  condition: "условие",
  сплиттер: "сплиттер",
  split: "сплиттер",
  слияние: "слияние",
  merge: "слияние",
  сигнал: "сигнал",
  signal: "сигнал",
};

/**
 * Normalize a node reference / label for case-insensitive comparison:
 * lowercase, collapse whitespace, and map known synonyms per token.
 * Example: "SMS 2" → "смс 2", "Почта" → "email", "Задержка" → "задержка".
 */
export function normalizeNodeRef(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => REF_SYNONYMS[tok] ?? tok)
    .join(" ");
}

const ADD_VERBS = /^(добавь|добавить|вставь|вставить)$/i;
const REMOVE_VERBS = /^(убери|убрать|удали|удалить)$/i;
const REPLACE_VERBS = /^(замени|заменить)$/i;

function findType(word: string): WorkflowNodeType | null {
  return TYPE_LOOKUP[word.toLowerCase()] ?? null;
}

/**
 * Split prompt into top-level segments by . , ; or " и ".
 * @-tag segments end on comma/semicolon/period/newline — at that point
 * the user switched context. Structural verbs INSIDE @-segments are
 * content, not commands.
 */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "." || ch === "," || ch === ";" || ch === "\n") {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());

  // Further split by " и " ONLY in non-@ segments AND only when the
  // segment does not contain "между" (where ` и ` is part of the phrase
  // "между X и Y").
  const finalParts: string[] = [];
  for (const p of parts) {
    if (p.startsWith("@")) {
      finalParts.push(p);
      continue;
    }
    if (/(^|\s)между(\s|$)/i.test(p)) {
      finalParts.push(p);
      continue;
    }
    const subs = p
      .split(/\s+и\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
    finalParts.push(...subs);
  }
  return finalParts;
}

/**
 * Look at trailing tokens for placement keywords. Returns placement + leftover params text.
 */
function extractPlacement(tokens: string[]): {
  placement: Placement;
  paramsText: string;
} {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i].toLowerCase();
    if (tok === "после") {
      const ref = tokens.slice(i + 1).join(" ").trim();
      return {
        placement: { mode: "after", ref },
        paramsText: tokens.slice(0, i).join(" "),
      };
    }
    if (tok === "перед") {
      const ref = tokens.slice(i + 1).join(" ").trim();
      return {
        placement: { mode: "before", ref },
        paramsText: tokens.slice(0, i).join(" "),
      };
    }
    if (tok === "между") {
      const between = tokens.slice(i + 1);
      const iIdx = between.findIndex((t) => t.toLowerCase() === "и");
      if (iIdx === -1) continue;
      const refA = between.slice(0, iIdx).join(" ").trim();
      const refB = between.slice(iIdx + 1).join(" ").trim();
      return {
        placement: { mode: "between", refA, refB },
        paramsText: tokens.slice(0, i).join(" "),
      };
    }
  }
  return { placement: { mode: "auto" }, paramsText: tokens.join(" ") };
}

/**
 * Parse one segment as a structural op. Returns null if not structural.
 */
function parseSegment(segment: string): StructuralOp | null {
  const trimmed = segment.trim();
  if (trimmed.startsWith("@")) return null;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 2) return null;
  const verb = tokens[0];

  // ADD: <verb> <type> [...inline params...] [<placement>]
  if (ADD_VERBS.test(verb)) {
    const nodeType = findType(tokens[1]);
    if (!nodeType) return null;
    const rest = tokens.slice(2);
    const { placement, paramsText } = extractPlacement(rest);
    return {
      kind: "add",
      nodeType,
      placement,
      inlineParams: paramsText.trim() || undefined,
    };
  }

  // REMOVE: <verb> <ref...>
  if (REMOVE_VERBS.test(verb)) {
    const ref = tokens.slice(1).join(" ").trim();
    if (!ref) return null;
    return { kind: "remove", ref };
  }

  // REPLACE: <verb> <ref> на <type> [...inline params...]
  if (REPLACE_VERBS.test(verb)) {
    const naIdx = tokens.findIndex((t) => t.toLowerCase() === "на");
    if (naIdx === -1 || naIdx === 1 || naIdx === tokens.length - 1) return null;
    const ref = tokens.slice(1, naIdx).join(" ");
    const nodeType = findType(tokens[naIdx + 1]);
    if (!nodeType) return null;
    const inlineParams =
      tokens.slice(naIdx + 2).join(" ").trim() || undefined;
    return { kind: "replace", ref, newType: nodeType, inlineParams };
  }

  return null;
}

export function parseStructuralCommands(input: string): {
  ops: StructuralOp[];
  unrecognized: string[];
} {
  const segments = splitTopLevel(input);
  const ops: StructuralOp[] = [];
  const unrecognized: string[] = [];
  for (const seg of segments) {
    if (seg.startsWith("@")) continue;
    const op = parseSegment(seg);
    if (op) ops.push(op);
    else if (seg.trim().length > 0) unrecognized.push(seg);
  }
  return { ops, unrecognized };
}

// ── applyOps ──────────────────────────────────────────────────────────────────

type GraphState = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

const TYPE_LABEL: Record<WorkflowNodeType, string> = {
  signal: "Сигнал",
  success: "Успех",
  end: "Конец",
  split: "Сплиттер",
  wait: "Задержка",
  condition: "Условие",
  merge: "Слияние",
  sms: "СМС",
  email: "Email",
  push: "Push",
  ivr: "Звонок",
  storefront: "Витрина",
  landing: "Лендинг",
  default: "Нода",
  channel: "Канал",
  retarget: "Ретаргет",
  result: "Результат",
  new: "Новая",
  source: "Источник",
  scoring: "Скоринг",
};

/**
 * Резолв ссылки на ноду. Приоритет — точный id: ИИ адресует ноды по id из
 * контекста графа (`[id]`), сам сопоставляя формулировку пользователя (склонения,
 * синонимы, описание) с нужной нодой — без серверного словаря синонимов.
 * Фоллбек по нормализованной подписи оставлен для офлайн-regex-парсера команд
 * и на случай, если модель пришлёт label вместо id.
 */
function findNodeByRef(
  nodes: WorkflowNode[],
  ref: string
): WorkflowNode | null {
  const raw = ref.trim();
  if (!raw) return null;
  // 1) точный id
  const byId = nodes.find((n) => n.id === raw);
  if (byId) return byId;
  // 2) фоллбек: нормализованная подпись
  const target = normalizeNodeRef(raw);
  if (!target) return null;
  return (
    nodes.find(
      (n) => normalizeNodeRef((n.data as { label: string }).label) === target
    ) ?? null
  );
}

function uniqueLabel(
  nodes: WorkflowNode[],
  baseType: WorkflowNodeType
): string {
  const base = TYPE_LABEL[baseType];
  const sameType = nodes.filter(
    (n) => (n.data as { nodeType: WorkflowNodeType }).nodeType === baseType
  );
  if (sameType.length === 0) return base;
  let maxN = 1;
  for (const n of sameType) {
    const lbl = (n.data as { label: string }).label;
    if (lbl === base) {
      maxN = Math.max(maxN, 1);
      continue;
    }
    const m = lbl.match(new RegExp(`^${base} (\\d+)$`));
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  }
  return `${base} ${maxN + 1}`;
}

function defaultParamsFor(kind: WorkflowNodeType): NodeParams | undefined {
  switch (kind) {
    // Channel defaults delegate to CHANNEL_NODE_MAP (single source of truth)
    case "sms":
    case "email":
    case "push":
    case "ivr":
      return CHANNEL_NODE_MAP[kind].defaultParams;
    case "wait":
      return { kind: "wait", mode: "duration", durationHours: 24 };
    case "split":
      // Дефолт для новых сплитов — поровну (A6).
      return { kind: "split", by: "equal", branches: 2 };
    case "storefront":
      return { kind: "storefront", offers: [] };
    case "landing":
      return { kind: "landing", cta: "Подробнее", offerTitle: "" };
    case "success":
      return { kind: "success", goal: "Конверсия" };
    case "end":
      return { kind: "end", reason: "Без конверсии" };
    default:
      return undefined;
  }
}

function nanoId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function applyInlineParams(
  current: NodeParams,
  inlineParams: string
): { params: NodeParams; matched: boolean } {
  const actions = NODE_ACTIONS[current.kind] ?? [];
  let matched = false;
  const merged: Partial<NodeParams> = {};
  for (const action of actions) {
    const p = (
      action.parse as (
        t: string,
        c: NodeParams
      ) => Partial<NodeParams> | null
    )(inlineParams, current);
    if (p) {
      Object.assign(merged, p);
      matched = true;
    }
  }
  return {
    params: matched ? ({ ...current, ...merged } as NodeParams) : current,
    matched,
  };
}

function applyAdd(
  graph: GraphState,
  op: Extract<StructuralOp, { kind: "add" }>
): { graph: GraphState; description: string } | { error: string } {
  const newId = `n_${nanoId()}`;
  const label = uniqueLabel(graph.nodes, op.nodeType);
  let params = defaultParamsFor(op.nodeType);
  let needsAttention = true;
  let attentionReason: string | undefined =
    "Заполните параметры — нода добавлена пустой";

  if (op.inlineParams && params) {
    const res = applyInlineParams(params, op.inlineParams);
    if (res.matched) {
      params = res.params;
      needsAttention = false;
      attentionReason = undefined;
    } else {
      attentionReason = "Не разобрал параметры — заполните вручную";
    }
  }

  // Resolve placement.
  let srcId: string | null = null;
  let tgtId: string | null = null;
  if (op.placement.mode === "after") {
    const src = findNodeByRef(graph.nodes, op.placement.ref);
    if (!src) return { error: `«${op.placement.ref}» — нет такой ноды` };
    srcId = src.id;
  } else if (op.placement.mode === "before") {
    const tgt = findNodeByRef(graph.nodes, op.placement.ref);
    if (!tgt) return { error: `«${op.placement.ref}» — нет такой ноды` };
    tgtId = tgt.id;
  } else if (op.placement.mode === "between") {
    const a = findNodeByRef(graph.nodes, op.placement.refA);
    const b = findNodeByRef(graph.nodes, op.placement.refB);
    if (!a || !b) {
      return {
        error: `Не нашёл одну из нод: «${op.placement.refA}» / «${op.placement.refB}»`,
      };
    }
    srcId = a.id;
    tgtId = b.id;
    const edge = graph.edges.find(
      (e) => e.source === a.id && e.target === b.id
    );
    if (!edge) {
      return {
        error: `Между «${op.placement.refA}» и «${op.placement.refB}» нет связи`,
      };
    }
  } else {
    // auto
    const terminal = graph.nodes.find(
      (n) =>
        (n.data as { isSuccess?: boolean; nodeType: WorkflowNodeType })
          .isSuccess ||
        (n.data as { nodeType: WorkflowNodeType }).nodeType === "end"
    );
    if (!terminal) {
      return {
        error: "Нет терминальной ноды (Успех/Конец) для auto-вставки",
      };
    }
    tgtId = terminal.id;
  }

  // Compute position.
  const srcNode = srcId ? graph.nodes.find((n) => n.id === srcId) : null;
  const tgtNode = tgtId ? graph.nodes.find((n) => n.id === tgtId) : null;
  let position = { x: 0, y: 0 };
  if (srcNode && tgtNode) {
    position = {
      x: (srcNode.position.x + tgtNode.position.x) / 2,
      y: (srcNode.position.y + tgtNode.position.y) / 2,
    };
  } else if (srcNode) {
    position = { x: srcNode.position.x + 180, y: srcNode.position.y };
  } else if (tgtNode) {
    position = { x: tgtNode.position.x - 180, y: tgtNode.position.y };
  }

  const newNode: WorkflowNode = {
    id: newId,
    type: "workflowNode",
    position,
    data: {
      label,
      nodeType: op.nodeType,
      ...(params ? { params } : {}),
      ...(needsAttention ? { needsAttention: true } : {}),
      ...(attentionReason ? { attentionReason } : {}),
    } as WorkflowNode["data"],
  };

  let edges = graph.edges;
  const nodes = [...graph.nodes, newNode];

  if (op.placement.mode === "between" && srcId && tgtId) {
    edges = edges.filter(
      (e) => !(e.source === srcId && e.target === tgtId)
    );
    edges = [
      ...edges,
      { id: `e_${nanoId()}`, source: srcId, target: newId, type: "default" },
      { id: `e_${nanoId()}`, source: newId, target: tgtId, type: "default" },
    ];
  } else if (op.placement.mode === "after" && srcId) {
    const outgoing = edges.filter((e) => e.source === srcId);
    edges = edges.filter((e) => e.source !== srcId);
    edges.push({
      id: `e_${nanoId()}`,
      source: srcId,
      target: newId,
      type: "default",
    });
    for (const o of outgoing) {
      edges.push({
        id: `e_${nanoId()}`,
        source: newId,
        target: o.target,
        type: "default",
      });
    }
  } else if (op.placement.mode === "before" && tgtId) {
    const incoming = edges.filter((e) => e.target === tgtId);
    edges = edges.filter((e) => e.target !== tgtId);
    for (const i of incoming) {
      edges.push({
        id: `e_${nanoId()}`,
        source: i.source,
        target: newId,
        type: "default",
      });
    }
    edges.push({
      id: `e_${nanoId()}`,
      source: newId,
      target: tgtId,
      type: "default",
    });
  } else if (op.placement.mode === "auto" && tgtId) {
    const incoming = edges.filter((e) => e.target === tgtId);
    edges = edges.filter((e) => e.target !== tgtId);
    for (const i of incoming) {
      edges.push({
        id: `e_${nanoId()}`,
        source: i.source,
        target: newId,
        type: "default",
      });
    }
    edges.push({
      id: `e_${nanoId()}`,
      source: newId,
      target: tgtId,
      type: "default",
    });
  }

  return {
    graph: { nodes, edges },
    description: `Добавил ${TYPE_LABEL[op.nodeType]} ${describePlacement(
      op.placement
    )}`,
  };
}

function describePlacement(p: Placement): string {
  switch (p.mode) {
    case "after":
      return `после ${p.ref}`;
    case "before":
      return `перед ${p.ref}`;
    case "between":
      return `между ${p.refA} и ${p.refB}`;
    case "auto":
      return "перед терминалом";
  }
}

function applyRemove(
  graph: GraphState,
  op: Extract<StructuralOp, { kind: "remove" }>
): { graph: GraphState; description: string } | { error: string } {
  const node = findNodeByRef(graph.nodes, op.ref);
  if (!node) return { error: `«${op.ref}» — нет такой ноды` };
  const nodeType = (node.data as { nodeType: WorkflowNodeType }).nodeType;
  if (nodeType === "source" || nodeType === "signal") {
    return { error: `Сигнал — точка входа, удалять нельзя` };
  }
  if (nodeType === "success" || nodeType === "end") {
    return { error: `${TYPE_LABEL[nodeType]} — финальная нода, удалять нельзя` };
  }
  const incoming = graph.edges.filter((e) => e.target === node.id);
  const outgoing = graph.edges.filter((e) => e.source === node.id);
  const N = incoming.length;
  const M = outgoing.length;

  const newEdges = graph.edges.filter(
    (e) => e.source !== node.id && e.target !== node.id
  );
  let needsAttentionIds: string[] = [];

  for (const inc of incoming) {
    for (const out of outgoing) {
      newEdges.push({
        id: `e_${nanoId()}`,
        source: inc.source,
        target: out.target,
        type: "default",
      });
    }
  }

  if (N > 1 || M > 1) {
    needsAttentionIds = [
      ...new Set([
        ...incoming.map((e) => e.source),
        ...outgoing.map((e) => e.target),
      ]),
    ];
  }

  const newNodes = graph.nodes
    .filter((n) => n.id !== node.id)
    .map((n) => {
      if (needsAttentionIds.includes(n.id)) {
        return {
          ...n,
          data: {
            ...n.data,
            needsAttention: true,
            attentionReason:
              "Перепроверь связи: после удаления соседа изменилась маршрутизация",
          },
        };
      }
      return n;
    });

  return {
    graph: { nodes: newNodes, edges: newEdges },
    description: `Убрал ${op.ref}`,
  };
}

function applyReplace(
  graph: GraphState,
  op: Extract<StructuralOp, { kind: "replace" }>
): { graph: GraphState; description: string } | { error: string } {
  const node = findNodeByRef(graph.nodes, op.ref);
  if (!node) return { error: `«${op.ref}» — нет такой ноды` };
  const oldKind = (node.data as { nodeType: WorkflowNodeType }).nodeType;
  if (oldKind === "signal") return { error: `Сигнал заменить нельзя` };

  const remainingNodes = graph.nodes.filter((n) => n.id !== node.id);
  const newLabel = uniqueLabel(remainingNodes, op.newType);
  let params = defaultParamsFor(op.newType);
  let needsAttention = true;
  let attentionReason: string | undefined =
    "Поля сброшены — заполните параметры заново";

  if (op.inlineParams && params) {
    const res = applyInlineParams(params, op.inlineParams);
    if (res.matched) {
      params = res.params;
      needsAttention = false;
      attentionReason = undefined;
    } else {
      attentionReason = "Не разобрал параметры — заполните вручную";
    }
  }

  const newNode: WorkflowNode = {
    ...node,
    data: {
      label: newLabel,
      nodeType: op.newType,
      ...(params ? { params } : {}),
      ...(needsAttention ? { needsAttention: true } : {}),
      ...(attentionReason ? { attentionReason } : {}),
    } as WorkflowNode["data"],
  };

  return {
    graph: {
      nodes: graph.nodes.map((n) => (n.id === node.id ? newNode : n)),
      edges: graph.edges,
    },
    description: `Заменил ${op.ref} на ${TYPE_LABEL[op.newType]}`,
  };
}

function applyAddCondition(
  graph: GraphState,
  op: Extract<StructuralOp, { kind: "addCondition" }>
): { graph: GraphState; description: string } | { error: string } {
  const ref = findNodeByRef(graph.nodes, op.ref);
  if (!ref) return { error: `«${op.ref}» — нет такой ноды` };
  const outgoing = graph.edges.filter((e) => e.source === ref.id);
  if (outgoing.length !== 1) {
    return { error: `«${op.ref}» — для условия нужна нода с одним выходом` };
  }
  const succEdge = outgoing[0];
  const yesLabel = op.yesLabel ?? "YES";
  const noLabel = op.noLabel ?? "NO";

  const condId = `n_${nanoId()}`;
  const leafId = `n_${nanoId()}`;
  const condNode: WorkflowNode = {
    id: condId,
    type: "workflowNode",
    position: { x: 0, y: 0 },
    data: {
      label: uniqueLabel(graph.nodes, "condition"),
      nodeType: "condition",
      ...(defaultParamsFor("condition") ? { params: defaultParamsFor("condition") } : {}),
      needsAttention: true,
      attentionReason: "Настройте условие ветвления",
    } as WorkflowNode["data"],
  };
  const leafNode: WorkflowNode = {
    id: leafId,
    type: "workflowNode",
    position: { x: 0, y: 0 },
    data: {
      label: uniqueLabel([...graph.nodes, condNode], "end"),
      nodeType: "end",
      ...(defaultParamsFor("end") ? { params: defaultParamsFor("end") } : {}),
    } as WorkflowNode["data"],
  };

  const nodes = [...graph.nodes, condNode, leafNode];
  const edges: WorkflowEdge[] = [
    ...graph.edges.filter((e) => e.id !== succEdge.id),
    { id: `e_${nanoId()}`, source: ref.id, target: condId, type: "default" },
    { id: `e_${nanoId()}`, source: condId, target: succEdge.target, type: "default", label: yesLabel },
    { id: `e_${nanoId()}`, source: condId, target: leafId, type: "default", label: noLabel },
  ];

  return {
    graph: { nodes, edges },
    description: `Добавил ${TYPE_LABEL.condition} после ${op.ref} (${yesLabel}/${noLabel})`,
  };
}

/**
 * BFS-layout: расставить ноды столбцами по глубине от Сигнала.
 * Узлы той же глубины — вертикально по центру.
 * Сироты (не достижимые из Сигнала) — за последним столбцом.
 */
export function relayoutGraph(graph: GraphState): GraphState {
  const signal = graph.nodes.find((n) => {
    const t = (n.data as { nodeType: WorkflowNodeType }).nodeType;
    return t === "source" || t === "signal";
  });
  if (!signal) return graph;

  const COL_WIDTH = 200;
  const ROW_HEIGHT = 100;

  const depth = new Map<string, number>();
  depth.set(signal.id, 0);
  const queue: string[] = [signal.id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = depth.get(id)!;
    for (const e of graph.edges) {
      if (e.source === id && !depth.has(e.target)) {
        depth.set(e.target, d + 1);
        queue.push(e.target);
      }
    }
  }

  const byDepth = new Map<number, string[]>();
  for (const [id, d] of depth) {
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [d, ids] of byDepth) {
    const x = d * COL_WIDTH;
    const yOffset = -((ids.length - 1) * ROW_HEIGHT) / 2;
    ids.forEach((id, i) => {
      positions.set(id, { x, y: yOffset + i * ROW_HEIGHT });
    });
  }

  const maxDepth =
    byDepth.size > 0 ? Math.max(...Array.from(byDepth.keys())) : 0;
  let orphanIdx = 0;
  for (const n of graph.nodes) {
    if (!positions.has(n.id)) {
      positions.set(n.id, {
        x: (maxDepth + 1) * COL_WIDTH,
        y: orphanIdx * ROW_HEIGHT,
      });
      orphanIdx++;
    }
  }

  return {
    ...graph,
    nodes: graph.nodes.map((n) => ({
      ...n,
      position: positions.get(n.id) ?? n.position,
    })),
  };
}

export function applyOps(
  graph: GraphState,
  ops: StructuralOp[]
): { graph: GraphState; applied: AppliedOp[]; skipped: SkippedOp[] } {
  let g = graph;
  const applied: AppliedOp[] = [];
  const skipped: SkippedOp[] = [];

  for (const op of ops) {
    let result:
      | { graph: GraphState; description: string }
      | { error: string };
    switch (op.kind) {
      case "add":
        result = applyAdd(g, op);
        break;
      case "remove":
        result = applyRemove(g, op);
        break;
      case "replace":
        result = applyReplace(g, op);
        break;
      case "addCondition":
        result = applyAddCondition(g, op);
        break;
    }
    if ("error" in result) {
      skipped.push({ op, reason: result.error });
    } else {
      g = result.graph;
      applied.push({ op, description: result.description });
    }
  }

  return {
    graph: applied.length > 0 ? relayoutGraph(g) : g,
    applied,
    skipped,
  };
}

/**
 * Вычисляет множество id нод, которые изменились между двумя снапшотами графа.
 * «Изменилась» = нода добавлена (новый id) ИЛИ её nodeType сменился (replace).
 * Используется в apply(prev) цикла — чтобы зелёная подсветка отражала реальное
 * состояние на момент применения, а не снапшот при получении команды.
 */
export function diffChangedNodeIds(
  oldGraph: GraphState,
  newGraph: GraphState
): Set<string> {
  const oldIds = new Set(oldGraph.nodes.map((n) => n.id));
  const oldKindById = new Map(
    oldGraph.nodes.map(
      (n) => [n.id, (n.data as { nodeType: WorkflowNodeType }).nodeType] as const
    )
  );
  const changedIds = new Set<string>();
  for (const n of newGraph.nodes) {
    if (!oldIds.has(n.id)) {
      changedIds.add(n.id);
    } else if (
      oldKindById.get(n.id) !==
      (n.data as { nodeType: WorkflowNodeType }).nodeType
    ) {
      changedIds.add(n.id);
    }
  }
  return changedIds;
}
