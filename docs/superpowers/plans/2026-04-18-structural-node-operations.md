# Structural Node Operations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать пользователю редактировать структуру workflow-графа через промпт: `добавь / убери / замени` с привязкой `после / перед / между / вместо`. Никаких блокировок — нарушения помечаются `needsAttention` с человекочитаемой причиной.

**Architecture:** Новый модуль `src/state/structural-commands.ts` — парсер + чистая функция `applyOps(graph, ops)`. ShellBottomBar расширяется двойным проходом (structural + @-tag). WorkflowSection / WorkflowView — wiring и применение. Расширение `WorkflowNodeData.attentionReason?` + блок объяснения в NodeControlPanel. Реюз `NODE_ACTIONS.parse` для inline-params в add/replace.

**Tech Stack:** TypeScript, React 19, vitest, Playwright, ReactFlow, motion/react.

**Spec:** `docs/superpowers/specs/2026-04-18-structural-node-operations-design.md`

---

### Task 1: Поле `attentionReason` + блок объяснения в NodeControlPanel

**Files:**
- Modify: `src/types/workflow.ts`
- Modify: `src/sections/campaigns/node-control-panel.tsx`

- [ ] **Step 1: Добавить поле в WorkflowNodeData**

В `src/types/workflow.ts` найти `WorkflowNodeData`, добавить поле:

```ts
export interface WorkflowNodeData {
  label: string;
  sublabel?: string;
  nodeType: WorkflowNodeType;
  isSuccess?: boolean;
  needsAttention?: boolean;
  attentionReason?: string; // NEW — человекочитаемая причина для wf-node-needs-attention
  processing?: boolean;
  justUpdated?: boolean;
  params?: NodeParams;
}
```

- [ ] **Step 2: Рендер блока в NodeControlPanel**

В `src/sections/campaigns/node-control-panel.tsx`:

Импорт:
```tsx
import { AlertTriangle, X } from "lucide-react";
```

В JSX, между `motion.div` и существующим `<div role="region">`, перед блоком `<div className="flex items-start gap-3">`, добавить:

```tsx
{data.attentionReason && (
  <div
    role="alert"
    className="mb-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
  >
    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
    <span>{data.attentionReason}</span>
  </div>
)}
```

Поместить ВНУТРИ карточки (тот же контейнер `mx-auto flex w-full max-w-2xl ...`), перед текущим `<div className="flex items-start gap-3">`. Если `attentionReason` пустой — блок не рендерится.

- [ ] **Step 3: Прогнать typecheck + текущие e2e**

```bash
npx tsc --noEmit 2>&1 | grep -E "node-control|workflow" || echo "OK"
npx playwright test
```

Expected: всё зелёное (новое поле опциональное).

- [ ] **Step 4: Commit**

```bash
git add src/types/workflow.ts src/sections/campaigns/node-control-panel.tsx
git commit -m "feat(workflow): WorkflowNodeData.attentionReason + amber alert in panel (H.1)"
```

---

### Task 2: Парсер structural-команд

**Files:**
- Create: `src/state/structural-commands.ts`
- Create: `src/state/structural-commands.test.ts`

- [ ] **Step 1: Создать модуль с типами и парсером**

Создать `src/state/structural-commands.ts`:

```ts
import type { WorkflowNodeType } from "@/types/workflow";

export type Placement =
  | { mode: "after"; ref: string }
  | { mode: "before"; ref: string }
  | { mode: "between"; refA: string; refB: string }
  | { mode: "auto" };

export type StructuralOp =
  | { kind: "add"; nodeType: WorkflowNodeType; placement: Placement; inlineParams?: string }
  | { kind: "remove"; ref: string }
  | { kind: "replace"; ref: string; newType: WorkflowNodeType; inlineParams?: string };

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

const ADD_VERBS = /^(добавь|добавить|вставь|вставить)$/i;
const REMOVE_VERBS = /^(убери|убрать|удали|удалить)$/i;
const REPLACE_VERBS = /^(замени|заменить)$/i;

function findType(word: string): WorkflowNodeType | null {
  return TYPE_LOOKUP[word.toLowerCase()] ?? null;
}

/**
 * Split prompt into top-level segments by . , ; or " и ".
 * @-tag segments are kept whole — structural verbs INSIDE @-segments
 * are content, not commands.
 */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inTagSegment = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "@") inTagSegment = true;
    if (!inTagSegment && (ch === "." || ch === "," || ch === ";")) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
    // Reset @-segment on whitespace+@ pattern OR newline
    if (ch === "\n") inTagSegment = false;
  }
  if (current.trim()) parts.push(current.trim());

  // Further split by " и " ONLY in non-@ segments
  const finalParts: string[] = [];
  for (const p of parts) {
    if (p.startsWith("@")) {
      finalParts.push(p);
      continue;
    }
    const subs = p.split(/\s+и\s+/i).map((s) => s.trim()).filter(Boolean);
    finalParts.push(...subs);
  }
  return finalParts;
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
      inlineParams: paramsText || undefined,
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
    const inlineParams = tokens.slice(naIdx + 2).join(" ").trim() || undefined;
    return { kind: "replace", ref, newType: nodeType, inlineParams };
  }

  return null;
}

/**
 * Look at trailing tokens for placement keywords. Returns placement + leftover params text.
 */
function extractPlacement(tokens: string[]): { placement: Placement; paramsText: string } {
  // Search from end for placement keyword.
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i].toLowerCase();
    if (tok === "после") {
      const ref = tokens.slice(i + 1).join(" ").trim();
      return { placement: { mode: "after", ref }, paramsText: tokens.slice(0, i).join(" ") };
    }
    if (tok === "перед") {
      const ref = tokens.slice(i + 1).join(" ").trim();
      return { placement: { mode: "before", ref }, paramsText: tokens.slice(0, i).join(" ") };
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

export function parseStructuralCommands(input: string): {
  ops: StructuralOp[];
  unrecognized: string[];
} {
  const segments = splitTopLevel(input);
  const ops: StructuralOp[] = [];
  const unrecognized: string[] = [];
  for (const seg of segments) {
    if (seg.startsWith("@")) continue; // @-сегменты — не наш домен
    const op = parseSegment(seg);
    if (op) ops.push(op);
    else if (seg.trim().length > 0) unrecognized.push(seg);
  }
  return { ops, unrecognized };
}
```

- [ ] **Step 2: Unit-тесты парсера**

Создать `src/state/structural-commands.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseStructuralCommands } from "./structural-commands";

describe("parseStructuralCommands", () => {
  it("parses simple add after", () => {
    const r = parseStructuralCommands("добавь Email после СМС");
    expect(r.ops).toEqual([
      { kind: "add", nodeType: "email", placement: { mode: "after", ref: "СМС" }, inlineParams: undefined },
    ]);
  });

  it("parses add before", () => {
    const r = parseStructuralCommands("вставь Push перед Успех");
    expect(r.ops[0]).toMatchObject({ kind: "add", nodeType: "push", placement: { mode: "before", ref: "Успех" } });
  });

  it("parses add between", () => {
    const r = parseStructuralCommands("добавь Задержка между СМС и Email");
    expect(r.ops[0]).toMatchObject({
      kind: "add",
      nodeType: "wait",
      placement: { mode: "between", refA: "СМС", refB: "Email" },
    });
  });

  it("parses add with auto placement", () => {
    const r = parseStructuralCommands("добавь Email");
    expect(r.ops[0]).toMatchObject({ kind: "add", nodeType: "email", placement: { mode: "auto" } });
  });

  it("captures inline params in add", () => {
    const r = parseStructuralCommands("добавь задержка 2 часа после СМС");
    expect(r.ops[0]).toMatchObject({
      kind: "add",
      nodeType: "wait",
      placement: { mode: "after", ref: "СМС" },
      inlineParams: "2 часа",
    });
  });

  it("parses remove", () => {
    const r = parseStructuralCommands("убери Push");
    expect(r.ops[0]).toEqual({ kind: "remove", ref: "Push" });
  });

  it("parses remove with multi-word ref", () => {
    const r = parseStructuralCommands("удали Задержка 3");
    expect(r.ops[0]).toEqual({ kind: "remove", ref: "Задержка 3" });
  });

  it("parses replace", () => {
    const r = parseStructuralCommands("замени Витрина на Лендинг");
    expect(r.ops[0]).toEqual({
      kind: "replace",
      ref: "Витрина",
      newType: "landing",
      inlineParams: undefined,
    });
  });

  it("parses replace with inline params", () => {
    const r = parseStructuralCommands("замени СМС на email тема: скидка");
    expect(r.ops[0]).toMatchObject({
      kind: "replace",
      ref: "СМС",
      newType: "email",
      inlineParams: "тема: скидка",
    });
  });

  it("splits multi-op by comma", () => {
    const r = parseStructuralCommands("добавь Email после СМС, убери Push");
    expect(r.ops).toHaveLength(2);
  });

  it("splits multi-op by 'и'", () => {
    const r = parseStructuralCommands("убери Push и убери Email");
    expect(r.ops).toHaveLength(2);
  });

  it("ignores @-segments", () => {
    const r = parseStructuralCommands("@СМС текст: новый, добавь Email после СМС");
    expect(r.ops).toHaveLength(1);
    expect(r.ops[0].kind).toBe("add");
  });

  it("treats verbs inside @-segment as content", () => {
    const r = parseStructuralCommands("@СМС добавь скидку 20%");
    expect(r.ops).toHaveLength(0);
  });

  it("returns unrecognized for non-structural non-tag", () => {
    const r = parseStructuralCommands("какая-то ерунда");
    expect(r.ops).toHaveLength(0);
    expect(r.unrecognized).toContain("какая-то ерунда");
  });

  it("rejects unknown type", () => {
    const r = parseStructuralCommands("добавь Виноват после СМС");
    expect(r.ops).toHaveLength(0);
    expect(r.unrecognized).toHaveLength(1);
  });

  it("case-insensitive verbs and types", () => {
    const r = parseStructuralCommands("ДОБАВЬ email ПОСЛЕ смс");
    expect(r.ops[0]).toMatchObject({ kind: "add", nodeType: "email" });
  });
});
```

- [ ] **Step 3: Прогнать тесты**

```bash
npx vitest run src/state/structural-commands.test.ts
```

Expected: 16/16 pass.

- [ ] **Step 4: Commit**

```bash
git add src/state/structural-commands.ts src/state/structural-commands.test.ts
git commit -m "feat(structural): parser for add/remove/replace prompt commands (H.2)"
```

---

### Task 3: applyOps — чистая функция мутации графа

**Files:**
- Modify: `src/state/structural-commands.ts`
- Modify: `src/state/structural-commands.test.ts`

- [ ] **Step 1: Добавить applyOps в structural-commands.ts**

В конец `src/state/structural-commands.ts` добавить:

```ts
import type { WorkflowNode, WorkflowEdge, NodeParams } from "@/types/workflow";
import { NODE_ACTIONS } from "./node-actions";

type GraphState = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
type AppliedOp = { op: StructuralOp; description: string };
type SkippedOp = { op: StructuralOp; reason: string };

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
};

function findNodeByLabel(nodes: WorkflowNode[], ref: string): WorkflowNode | null {
  const trimmed = ref.trim();
  return nodes.find((n) => (n.data as { label: string }).label === trimmed) ?? null;
}

function uniqueLabel(nodes: WorkflowNode[], baseType: WorkflowNodeType): string {
  const base = TYPE_LABEL[baseType];
  const sameType = nodes.filter(
    (n) => (n.data as { nodeType: WorkflowNodeType }).nodeType === baseType
  );
  if (sameType.length === 0) return base;
  // Existing labels are either "{base}" or "{base} N" — find max N, return next.
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
  // First duplicate becomes "{base} 2" since the existing one is "{base}".
  return `${base} ${maxN + 1}`;
}

function defaultParamsFor(kind: WorkflowNodeType): NodeParams | undefined {
  switch (kind) {
    case "sms":
      return { kind: "sms", text: "", alphaName: "BRAND", scheduledAt: "immediate" };
    case "email":
      return { kind: "email", subject: "", body: "", sender: "noreply@brand.com" };
    case "push":
      return { kind: "push", title: "", body: "" };
    case "ivr":
      return { kind: "ivr", scenario: "", voiceType: "neutral" };
    case "wait":
      return { kind: "wait", mode: "duration", durationHours: 24 };
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

  // Try inline params via NODE_ACTIONS.
  if (op.inlineParams && params) {
    const actions = NODE_ACTIONS[params.kind] ?? [];
    let matched = false;
    let merged: Partial<NodeParams> = {};
    for (const action of actions) {
      const p = (action.parse as (t: string, c: NodeParams) => Partial<NodeParams> | null)(
        op.inlineParams,
        params
      );
      if (p) {
        Object.assign(merged, p);
        matched = true;
      }
    }
    if (matched) {
      params = { ...params, ...merged } as NodeParams;
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
    const src = findNodeByLabel(graph.nodes, op.placement.ref);
    if (!src) return { error: `«${op.placement.ref}» — нет такой ноды` };
    srcId = src.id;
  } else if (op.placement.mode === "before") {
    const tgt = findNodeByLabel(graph.nodes, op.placement.ref);
    if (!tgt) return { error: `«${op.placement.ref}» — нет такой ноды` };
    tgtId = tgt.id;
  } else if (op.placement.mode === "between") {
    const a = findNodeByLabel(graph.nodes, op.placement.refA);
    const b = findNodeByLabel(graph.nodes, op.placement.refB);
    if (!a || !b) return { error: `Не нашёл одну из нод: «${op.placement.refA}» / «${op.placement.refB}»` };
    srcId = a.id;
    tgtId = b.id;
    // Ensure edge exists between them.
    const edge = graph.edges.find((e) => e.source === a.id && e.target === b.id);
    if (!edge) return { error: `Между «${op.placement.refA}» и «${op.placement.refB}» нет связи` };
  } else {
    // auto: вставить перед первой Успех/Конец нодой
    const terminal = graph.nodes.find(
      (n) =>
        (n.data as { isSuccess?: boolean; nodeType: WorkflowNodeType }).isSuccess ||
        (n.data as { nodeType: WorkflowNodeType }).nodeType === "end"
    );
    if (!terminal) return { error: "Нет терминальной ноды (Успех/Конец) для auto-вставки" };
    tgtId = terminal.id;
  }

  // Compute position.
  const srcNode = srcId ? graph.nodes.find((n) => n.id === srcId) : null;
  const tgtNode = tgtId ? graph.nodes.find((n) => n.id === tgtId) : null;
  let position = { x: 0, y: 0 };
  if (srcNode && tgtNode) {
    position = { x: (srcNode.position.x + tgtNode.position.x) / 2, y: (srcNode.position.y + tgtNode.position.y) / 2 };
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
  let nodes = [...graph.nodes, newNode];

  if (op.placement.mode === "between" && srcId && tgtId) {
    edges = edges.filter((e) => !(e.source === srcId && e.target === tgtId));
    edges = [
      ...edges,
      { id: `e_${nanoId()}`, source: srcId, target: newId, type: "default" },
      { id: `e_${nanoId()}`, source: newId, target: tgtId, type: "default" },
    ];
  } else if (op.placement.mode === "after" && srcId) {
    const outgoing = edges.filter((e) => e.source === srcId);
    edges = edges.filter((e) => e.source !== srcId);
    edges.push({ id: `e_${nanoId()}`, source: srcId, target: newId, type: "default" });
    for (const o of outgoing) {
      edges.push({ id: `e_${nanoId()}`, source: newId, target: o.target, type: "default" });
    }
  } else if (op.placement.mode === "before" && tgtId) {
    const incoming = edges.filter((e) => e.target === tgtId);
    edges = edges.filter((e) => e.target !== tgtId);
    for (const i of incoming) {
      edges.push({ id: `e_${nanoId()}`, source: i.source, target: newId, type: "default" });
    }
    edges.push({ id: `e_${nanoId()}`, source: newId, target: tgtId, type: "default" });
  } else if (op.placement.mode === "auto" && tgtId) {
    // same as "before" above for the auto-resolved terminal
    const incoming = edges.filter((e) => e.target === tgtId);
    edges = edges.filter((e) => e.target !== tgtId);
    for (const i of incoming) {
      edges.push({ id: `e_${nanoId()}`, source: i.source, target: newId, type: "default" });
    }
    edges.push({ id: `e_${nanoId()}`, source: newId, target: tgtId, type: "default" });
  }

  return {
    graph: { nodes, edges },
    description: `Добавил ${TYPE_LABEL[op.nodeType]} ${describePlacement(op.placement)}`,
  };
}

function describePlacement(p: Placement): string {
  switch (p.mode) {
    case "after": return `после ${p.ref}`;
    case "before": return `перед ${p.ref}`;
    case "between": return `между ${p.refA} и ${p.refB}`;
    case "auto": return "перед терминалом";
  }
}

function applyRemove(
  graph: GraphState,
  op: Extract<StructuralOp, { kind: "remove" }>
): { graph: GraphState; description: string } | { error: string } {
  const node = findNodeByLabel(graph.nodes, op.ref);
  if (!node) return { error: `«${op.ref}» — нет такой ноды` };
  const nodeType = (node.data as { nodeType: WorkflowNodeType }).nodeType;
  if (nodeType === "signal") {
    return { error: `Сигнал — точка входа, удалять нельзя` };
  }
  const incoming = graph.edges.filter((e) => e.target === node.id);
  const outgoing = graph.edges.filter((e) => e.source === node.id);
  const N = incoming.length;
  const M = outgoing.length;

  let newEdges = graph.edges.filter((e) => e.source !== node.id && e.target !== node.id);
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
      ...new Set([...incoming.map((e) => e.source), ...outgoing.map((e) => e.target)]),
    ];
  }

  let newNodes = graph.nodes
    .filter((n) => n.id !== node.id)
    .map((n) => {
      if (needsAttentionIds.includes(n.id)) {
        return {
          ...n,
          data: {
            ...n.data,
            needsAttention: true,
            attentionReason: "Перепроверь связи: после удаления соседа изменилась маршрутизация",
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
  const node = findNodeByLabel(graph.nodes, op.ref);
  if (!node) return { error: `«${op.ref}» — нет такой ноды` };
  const oldKind = (node.data as { nodeType: WorkflowNodeType }).nodeType;
  if (oldKind === "signal") return { error: `Сигнал заменить нельзя` };

  const remainingNodes = graph.nodes.filter((n) => n.id !== node.id);
  const newLabel = uniqueLabel(remainingNodes, op.newType);
  let params = defaultParamsFor(op.newType);
  let needsAttention = true;
  let attentionReason: string | undefined = "Поля сброшены — заполните параметры заново";

  if (op.inlineParams && params) {
    const actions = NODE_ACTIONS[params.kind] ?? [];
    let matched = false;
    let merged: Partial<NodeParams> = {};
    for (const action of actions) {
      const p = (action.parse as (t: string, c: NodeParams) => Partial<NodeParams> | null)(
        op.inlineParams,
        params
      );
      if (p) {
        Object.assign(merged, p);
        matched = true;
      }
    }
    if (matched) {
      params = { ...params, ...merged } as NodeParams;
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

export function applyOps(
  graph: GraphState,
  ops: StructuralOp[]
): { graph: GraphState; applied: AppliedOp[]; skipped: SkippedOp[] } {
  let g = graph;
  const applied: AppliedOp[] = [];
  const skipped: SkippedOp[] = [];

  for (const op of ops) {
    let result;
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
    }
    if ("error" in result) {
      skipped.push({ op, reason: result.error });
    } else {
      g = result.graph;
      applied.push({ op, description: result.description });
    }
  }

  return { graph: g, applied, skipped };
}
```

- [ ] **Step 2: Unit-тесты для applyOps**

В конец `src/state/structural-commands.test.ts` добавить блок `describe("applyOps", ...)` с 10+ кейсами:

```ts
import { applyOps } from "./structural-commands";
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

function makeGraph(): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  return {
    nodes: [
      {
        id: "signal",
        type: "workflowNode",
        position: { x: 0, y: 0 },
        data: {
          label: "Сигнал",
          nodeType: "signal",
          params: {
            kind: "signal",
            fileName: "x.json",
            count: 0,
            segments: { max: 0, high: 0, mid: 0, low: 0 },
          },
        },
      },
      {
        id: "sms1",
        type: "workflowNode",
        position: { x: 200, y: 0 },
        data: {
          label: "СМС",
          nodeType: "sms",
          params: { kind: "sms", text: "hi", alphaName: "BRAND", scheduledAt: "immediate" },
        },
      },
      {
        id: "success",
        type: "workflowNode",
        position: { x: 400, y: 0 },
        data: { label: "Успех", nodeType: "success", isSuccess: true, params: { kind: "success", goal: "Test" } },
      },
    ],
    edges: [
      { id: "e1", source: "signal", target: "sms1", type: "default" },
      { id: "e2", source: "sms1", target: "success", type: "default" },
    ],
  };
}

describe("applyOps", () => {
  it("ADD after — splits the outgoing edge through new node", () => {
    const r = applyOps(makeGraph(), [
      { kind: "add", nodeType: "email", placement: { mode: "after", ref: "СМС" } },
    ]);
    expect(r.applied).toHaveLength(1);
    expect(r.graph.nodes).toHaveLength(4);
    const newEdges = r.graph.edges;
    expect(newEdges.find((e) => e.source === "sms1" && e.target === "success")).toBeUndefined();
    const newEmail = r.graph.nodes.find((n) => n.data.nodeType === "email")!;
    expect(newEdges.find((e) => e.source === "sms1" && e.target === newEmail.id)).toBeDefined();
    expect(newEdges.find((e) => e.source === newEmail.id && e.target === "success")).toBeDefined();
  });

  it("ADD before — splits incoming edges", () => {
    const r = applyOps(makeGraph(), [
      { kind: "add", nodeType: "push", placement: { mode: "before", ref: "Успех" } },
    ]);
    expect(r.applied).toHaveLength(1);
    const push = r.graph.nodes.find((n) => n.data.nodeType === "push")!;
    expect(r.graph.edges.find((e) => e.source === push.id && e.target === "success")).toBeDefined();
  });

  it("ADD between — replaces specific edge", () => {
    const r = applyOps(makeGraph(), [
      { kind: "add", nodeType: "wait", placement: { mode: "between", refA: "Сигнал", refB: "СМС" } },
    ]);
    expect(r.applied).toHaveLength(1);
  });

  it("ADD with inline params disables needsAttention", () => {
    const r = applyOps(makeGraph(), [
      { kind: "add", nodeType: "wait", placement: { mode: "after", ref: "СМС" }, inlineParams: "2 часа" },
    ]);
    const wait = r.graph.nodes.find((n) => n.data.nodeType === "wait")!;
    expect(wait.data.needsAttention).toBeFalsy();
  });

  it("ADD without inline params sets needsAttention", () => {
    const r = applyOps(makeGraph(), [
      { kind: "add", nodeType: "email", placement: { mode: "after", ref: "СМС" } },
    ]);
    const email = r.graph.nodes.find((n) => n.data.nodeType === "email")!;
    expect(email.data.needsAttention).toBe(true);
    expect(email.data.attentionReason).toContain("Заполните параметры");
  });

  it("REMOVE simple 1×1 → clean bypass", () => {
    const r = applyOps(makeGraph(), [{ kind: "remove", ref: "СМС" }]);
    expect(r.applied).toHaveLength(1);
    expect(r.graph.nodes.find((n) => n.id === "sms1")).toBeUndefined();
    expect(r.graph.edges.find((e) => e.source === "signal" && e.target === "success")).toBeDefined();
  });

  it("REMOVE Сигнал → skipped", () => {
    const r = applyOps(makeGraph(), [{ kind: "remove", ref: "Сигнал" }]);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toContain("точка входа");
  });

  it("REMOVE unknown ref → skipped", () => {
    const r = applyOps(makeGraph(), [{ kind: "remove", ref: "Виноват" }]);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped[0].reason).toContain("нет такой ноды");
  });

  it("REPLACE keeps id and edges", () => {
    const r = applyOps(makeGraph(), [{ kind: "replace", ref: "СМС", newType: "email" }]);
    expect(r.applied).toHaveLength(1);
    const email = r.graph.nodes.find((n) => n.id === "sms1")!;
    expect(email.data.nodeType).toBe("email");
    // edges unchanged
    expect(r.graph.edges.find((e) => e.source === "signal" && e.target === "sms1")).toBeDefined();
    expect(r.graph.edges.find((e) => e.source === "sms1" && e.target === "success")).toBeDefined();
  });

  it("REPLACE with inline params — no attention", () => {
    const r = applyOps(makeGraph(), [
      { kind: "replace", ref: "СМС", newType: "email", inlineParams: "тема: новая" },
    ]);
    const email = r.graph.nodes.find((n) => n.id === "sms1")!;
    expect(email.data.needsAttention).toBeFalsy();
  });

  it("multi-op accumulates in graph state", () => {
    const r = applyOps(makeGraph(), [
      { kind: "add", nodeType: "email", placement: { mode: "after", ref: "СМС" } },
      { kind: "remove", ref: "СМС" },
    ]);
    expect(r.applied).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Прогнать тесты**

```bash
npx vitest run src/state/structural-commands.test.ts
```

Expected: все pass (parser ~16 + applyOps ~10).

- [ ] **Step 4: Commit**

```bash
git add src/state/structural-commands.ts src/state/structural-commands.test.ts
git commit -m "feat(structural): applyOps — pure graph mutator with attentionReason (H.3)"
```

---

### Task 4: Wiring через app-state + ShellBottomBar + WorkflowSection + WorkflowView

**Files:**
- Modify: `src/state/app-state.ts`
- Modify: `src/state/app-state.test.ts`
- Modify: `src/sections/shell/shell-bottom-bar.tsx`
- Modify: `src/sections/campaigns/workflow-section.tsx`
- Modify: `src/sections/campaigns/workflow-view.tsx`

- [ ] **Step 1: app-state.ts — новое поле + actions**

В `src/state/app-state.ts`:

Импорт:
```ts
import type { StructuralOp } from "./structural-commands";
```

В `AppState`:
```ts
workflowStructuralCommands: { ops: StructuralOp[] } | null;
```

В `Action` union:
```ts
| { type: "workflow_structural_commands_submit"; ops: StructuralOp[] }
| { type: "workflow_structural_commands_handled" }
```

В `initialState` добавить `workflowStructuralCommands: null`.

В reducer:
```ts
case "workflow_structural_commands_submit":
  return {
    ...state,
    workflowStructuralCommands: { ops: action.ops },
    selectedWorkflowNode: null,  // как у workflow_node_command_submit
  };
case "workflow_structural_commands_handled":
  return { ...state, workflowStructuralCommands: null };
```

- [ ] **Step 2: app-state.test.ts — кейсы**

Добавить в `src/state/app-state.test.ts`:

```ts
it("workflow_structural_commands_submit captures ops and deselects", () => {
  const state: AppState = {
    ...initialState,
    selectedWorkflowNode: { id: "x", label: "X" },
  };
  const ops = [{ kind: "remove" as const, ref: "X" }];
  const next = appReducer(state, { type: "workflow_structural_commands_submit", ops });
  expect(next.workflowStructuralCommands).toEqual({ ops });
  expect(next.selectedWorkflowNode).toBeNull();
});

it("workflow_structural_commands_handled clears pending", () => {
  const state: AppState = {
    ...initialState,
    workflowStructuralCommands: { ops: [{ kind: "remove" as const, ref: "X" }] },
  };
  const next = appReducer(state, { type: "workflow_structural_commands_handled" });
  expect(next.workflowStructuralCommands).toBeNull();
});
```

- [ ] **Step 3: shell-bottom-bar.tsx — двойной парсинг**

В `src/sections/shell/shell-bottom-bar.tsx`:

Импорт:
```ts
import { parseStructuralCommands } from "@/state/structural-commands";
```

Заменить тело `handlePromptSubmit` (где сейчас есть `parseTagSegments`):

```ts
function handlePromptSubmit(message: PromptInputMessage) {
  const rawText = message.text ?? "";
  if (view.kind !== "workflow" || view.launched) return;

  const structural = parseStructuralCommands(rawText);
  // Сегменты для @-режима — берём из «unrecognized» (части, не попавшие в structural)
  // плюс @-сегменты, которые парсер всегда пропускал.
  const tagSegments = parseTagSegments(rawText);

  if (structural.ops.length > 0) {
    dispatch({ type: "workflow_structural_commands_submit", ops: structural.ops });
  }
  if (tagSegments.length > 0) {
    dispatch({
      type: "workflow_node_command_submit",
      commands: tagSegments.map((s) => ({ nodeLabel: s.label, text: s.text })),
    });
  }
  if (structural.ops.length === 0 && tagSegments.length === 0 && rawText.trim()) {
    dispatch({ type: "workflow_command_submit", text: rawText });
  }

  // AI reply (общий) — для structural добавит WorkflowView, для tag-сегментов уже здесь.
  if (tagSegments.length > 0) {
    const names = tagSegments.map((s) => `@${s.label}`).join(", ");
    dispatch({
      type: "ai_reply_shown",
      text:
        tagSegments.length === 1
          ? `Готово, обновил ноду ${names}.`
          : `Готово, обновил ноды ${names}.`,
    });
  }
}
```

- [ ] **Step 4: workflow-section.tsx — проброс ops**

В `src/sections/campaigns/workflow-section.tsx`:

Из `useAppState()` достать `workflowStructuralCommands`.

Добавить useEffect (или просто вычислить и передать):
```ts
const structuralOps = workflowStructuralCommands?.ops ?? null;
```

В `<WorkflowView ...>` добавить prop:
```tsx
structuralOps={structuralOps}
onStructuralOpsHandled={() => dispatch({ type: "workflow_structural_commands_handled" })}
```

- [ ] **Step 5: workflow-view.tsx — apply + AI-reply**

В `src/sections/campaigns/workflow-view.tsx`:

Импорт:
```ts
import {
  applyOps,
  type StructuralOp,
  type AppliedOp,
  type SkippedOp,
} from "@/state/structural-commands";
import { useAppDispatch } from "@/state/app-state-context";
```

Новый prop:
```ts
structuralOps?: StructuralOp[] | null;
onStructuralOpsHandled?: () => void;
```

Внутри компонента:
```ts
const appDispatch = useAppDispatch();
useEffect(() => {
  if (!structuralOps || structuralOps.length === 0) return;
  setGraph((prev) => {
    const result = applyOps(prev, structuralOps);
    // build AI message
    const lines: string[] = [];
    if (result.applied.length > 0) {
      lines.push(result.applied.length === 1 ? result.applied[0].description : "Готово:");
      if (result.applied.length > 1) {
        for (const a of result.applied) lines.push(`• ${a.description}`);
      }
    }
    if (result.skipped.length > 0) {
      lines.push("Не выполнено:");
      for (const s of result.skipped) lines.push(`• ${s.reason}`);
    }
    appDispatch({ type: "ai_reply_shown", text: lines.join("\n") });
    return result.graph;
  });
  onStructuralOpsHandled?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [structuralOps]);
```

- [ ] **Step 6: Прогнать всё**

```bash
npx tsc --noEmit 2>&1 | grep -E "structural|workflow|shell|app-state" || echo "OK"
npx vitest run
npx playwright test
```

Expected: всё зелёное (старые тесты не должны сломаться).

- [ ] **Step 7: Commit**

```bash
git add src/state/app-state.ts src/state/app-state.test.ts src/sections/shell/shell-bottom-bar.tsx src/sections/campaigns/workflow-section.tsx src/sections/campaigns/workflow-view.tsx
git commit -m "feat(workflow): wire structural ops — submit, apply, AI reply (H.4)"
```

---

### Task 5: E2E test для блока H

**Files:**
- Create: `tests/e2e/block-h.spec.ts`

- [ ] **Step 1: Создать тест**

```ts
import { test, expect, type Page } from "@playwright/test";

async function applyPreset(page: Page, key: "empty" | "mid" | "full") {
  await page.keyboard.press("Shift+KeyT");
  const label = key.charAt(0).toUpperCase() + key.slice(1);
  await page.getByRole("button", { name: new RegExp(`^${label}\\b`) }).click();
  await page.keyboard.press("Shift+KeyT");
}

async function openAnyDraftCampaign(page: Page) {
  await page.getByRole("button", { name: "Кампании", exact: true }).click();
  const draft = page.locator("[data-slot=card]").filter({ hasText: "Не запущено" }).first();
  await draft.click();
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 5_000 });
}

test.describe("Block H — structural node operations", () => {
  test("add Email after first comms node", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    const beforeCount = await page.locator("[data-node-type]").count();
    const textarea = page.getByRole("textbox").first();
    // pick a real label visible in the graph — first one
    const firstLabel = await page.locator("[data-node-type] >> nth=1").textContent();
    const ref = (firstLabel ?? "").trim().split(/\s+/)[0];

    await textarea.fill(`добавь Email после ${ref}`);
    await textarea.press("Enter");
    await expect(page.getByText(/Добавил Email/)).toBeVisible({ timeout: 3_000 });

    const afterCount = await page.locator("[data-node-type]").count();
    expect(afterCount).toBe(beforeCount + 1);
  });

  test("remove a node (skip Сигнал)", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    const textarea = page.getByRole("textbox").first();
    await textarea.fill("убери Сигнал");
    await textarea.press("Enter");
    await expect(page.getByText(/точка входа/)).toBeVisible({ timeout: 3_000 });
  });

  test("replace node keeps position and edges", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    // Find a non-Сигнал node label.
    const labels = await page.locator("[data-node-type]").allTextContents();
    const target = labels
      .map((l) => l.trim().split("\n")[0])
      .find((l) => l && !l.toLowerCase().startsWith("сигнал") && !l.toLowerCase().startsWith("успех") && !l.toLowerCase().startsWith("конец"));
    if (!target) test.skip(true, "Нет подходящей ноды для замены");

    const textarea = page.getByRole("textbox").first();
    await textarea.fill(`замени ${target} на Email`);
    await textarea.press("Enter");
    await expect(page.getByText(/Заменил/)).toBeVisible({ timeout: 3_000 });
  });

  test("attention block shows up on add without inline params", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    const firstLabel = await page.locator("[data-node-type] >> nth=1").textContent();
    const ref = (firstLabel ?? "").trim().split(/\s+/)[0];

    const textarea = page.getByRole("textbox").first();
    await textarea.fill(`добавь Email после ${ref}`);
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    // Click the new Email node and verify attention block shows.
    const emailNode = page.locator('[data-node-type="email"]').last();
    await emailNode.click();
    const panel = page.getByTestId("node-control-panel");
    await expect(panel.getByRole("alert")).toBeVisible();
    await expect(panel.getByRole("alert")).toContainText("Заполните параметры");
  });
});
```

- [ ] **Step 2: Прогнать**

```bash
npx playwright test tests/e2e/block-h.spec.ts
```

- [ ] **Step 3: Полный прогон**

```bash
npx playwright test
```

Expected: всё зелёное, никаких регрессий.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/block-h.spec.ts
git commit -m "test(e2e): block H — add/remove/replace + attention reason (H.5)"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Грамматика → Task 2.
- ✅ Семантика add/remove/replace → Task 3.
- ✅ attentionReason + UI блок → Task 1.
- ✅ AI-сообщение + wiring → Task 4.
- ✅ E2E → Task 5.

**2. Placeholder scan:** none.

**3. Type consistency:**
- `StructuralOp`, `Placement`, `AppliedOp`, `SkippedOp` определены один раз в `structural-commands.ts`, экспортируются.
- `applyOps` сигнатура совпадает между Task 3 определением и Task 4 использованием.
- `workflowStructuralCommands` поле + actions в app-state.ts ↔ ShellBottomBar dispatch ↔ WorkflowSection useState проброс.

Готово к исполнению.
