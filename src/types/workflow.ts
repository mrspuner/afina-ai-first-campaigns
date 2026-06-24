import type { Node, Edge } from "@xyflow/react";

export type WorkflowNodeType =
  // Endpoints
  | "signal"
  | "source"   // entry node (replaces "signal" as the graph root; carries sourceType + interests)
  | "scoring"  // quality/segment selection (new/stream only)
  | "success"
  | "end"
  // Logic / Flow
  | "split"
  | "wait"
  | "condition"
  | "merge"
  // Communication (active)
  | "sms"
  | "email"
  | "push"
  | "ivr"
  // Web (passive)
  | "storefront"
  | "landing"
  // Legacy (retained for base graph + parseWorkflowCommand)
  | "default"
  | "channel"
  | "retarget"
  | "result"
  | "new";

// ── Node params (internal schema per node type) ───────────────────────────────

export type SmsParams = {
  kind: "sms";
  text: string;
  alphaName: string;
  scheduledAt: "immediate" | string;
  link?: string;
};

export type EmailParams = {
  kind: "email";
  subject: string;
  body: string;
  sender: string;
  link?: string;
  /** Ссылка на письмо из справочника (A5) — какое письмо выбрано в ноде. */
  emailId?: string;
};

export type PushParams = {
  kind: "push";
  title: string;
  body: string;
  deeplink?: string;
};

export type IvrParams = {
  kind: "ivr";
  scenario: string;
  voiceType: "male" | "female" | "neutral";
};

export type WaitParams = {
  kind: "wait";
  mode: "duration" | "until_event";
  durationHours?: number;
  untilEvent?: string;
};

export type ConditionParams = {
  kind: "condition";
  trigger:
    | "delivered" | "not_delivered"
    | "opened" | "not_opened"
    | "clicked" | "not_clicked";
};

export type SplitParams = {
  kind: "split";
  /** Тип разделения: поровну (equal), случайно (random), по сегменту (A6). */
  by: "equal" | "random" | "segment";
  branches: number;
};

export type MergeParams = { kind: "merge" };

export type SignalParams = {
  kind: "signal";
  fileName: string;
  count: number;
  segments: { max: number; high: number; mid: number; low: number };
};

/**
 * Scoring node (Block C #8) — carries the campaign's interests/triggers so they
 * can be edited from the graph drawer. No required human field: empty lists are
 * valid (scoring never blocks launch), so it is exempt from `nodeNeedsAttention`.
 */
export type ScoringParams = {
  kind: "scoring";
  interests: string[];
  triggers: string[];
};

export type SuccessParams = {
  kind: "success";
  goal: string;
};

export type EndParams = {
  kind: "end";
  reason?: string;
};

export type StorefrontParams = {
  kind: "storefront";
  offers: string[];
};

export type LandingParams = {
  kind: "landing";
  cta: string;
  offerTitle: string;
};

export type NodeParams =
  | SmsParams | EmailParams | PushParams | IvrParams
  | WaitParams | ConditionParams | SplitParams | MergeParams
  | SignalParams | ScoringParams | SuccessParams | EndParams
  | StorefrontParams | LandingParams;

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  sublabel?: string;
  nodeType: WorkflowNodeType;
  needsAttention?: boolean;
  attentionReason?: string;
  isSuccess?: boolean;
  processing?: boolean;
  justUpdated?: boolean;
  /**
   * Persistent "this parameter was changed" markers — the list of NodeParams
   * keys edited via the prompt bar (e.g. ["text", "alphaName"]). Rendered as a
   * yellow dot next to each changed field in the expanded card. Unlike
   * `justUpdated` (a one-off green flash on the whole node), this stays on.
   */
  dirtyParams?: string[];
  params?: NodeParams;
}

export function patchNodeParams<N extends { id: string; data: WorkflowNodeData }>(
  nodes: N[],
  id: string,
  paramsPatch: Partial<NodeParams>
): N[] {
  return nodes.map((n) => {
    if (n.id !== id) return n;
    if (!n.data.params) return n;
    return {
      ...n,
      data: {
        ...n.data,
        params: { ...n.data.params, ...paramsPatch } as NodeParams,
      },
    };
  });
}

export type NodeCategory = "endpoint" | "logic" | "communication" | "web" | "legacy";

export const NODE_CATEGORY: Record<WorkflowNodeType, NodeCategory> = {
  signal: "endpoint",
  source: "endpoint",
  scoring: "endpoint",
  success: "endpoint",
  end: "endpoint",
  split: "logic",
  wait: "logic",
  condition: "logic",
  merge: "logic",
  sms: "communication",
  email: "communication",
  push: "communication",
  ivr: "communication",
  storefront: "web",
  landing: "web",
  default: "legacy",
  channel: "legacy",
  retarget: "legacy",
  result: "legacy",
  new: "legacy",
};

export function isCommunicationNode(t: WorkflowNodeType): boolean {
  return NODE_CATEGORY[t] === "communication";
}

export type WorkflowNode = Node<WorkflowNodeData, "workflowNode">;
export type WorkflowEdge = Edge;

export type CommandUpdater = (
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
) => { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(
  id: string,
  label: string,
  nodeType: WorkflowNodeType,
  x: number,
  y: number,
  sublabel?: string,
  extras?: Partial<Pick<WorkflowNodeData, "needsAttention" | "isSuccess">>,
): WorkflowNode {
  return {
    id,
    type: "workflowNode",
    position: { x, y },
    data: { label, nodeType, sublabel, ...extras },
  };
}

const LABEL_STYLE = { fill: "rgba(255,255,255,0.9)", fontSize: 10, fontWeight: 500 };
const LABEL_BG_STYLE = { fill: "#141414", fillOpacity: 0.92, stroke: "#2a2a2a", strokeWidth: 1 };
const LABEL_BG_PADDING: [number, number] = [4, 2];
const LABEL_BG_BORDER_RADIUS = 4;

function makeEdge(source: string, target: string, label?: string): WorkflowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    type: "default",
    style: { stroke: "#2a2a2a", strokeWidth: 1.5 },
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

function shiftRight(nodes: WorkflowNode[], fromX: number, amount: number): WorkflowNode[] {
  return nodes.map((n) =>
    n.position.x >= fromX
      ? { ...n, position: { ...n.position, x: n.position.x + amount } }
      : n
  );
}

// ── Base graph (Шаг 1 — базовый workflow) ────────────────────────────────────

export function createBaseNodes(signalName?: string): WorkflowNode[] {
  return [
    makeNode("signals",  "Сигналы + сегменты", "default",   0,    0,  signalName ?? "Вход из предыдущего шага"),
    makeNode("split",    "Split по сегментам",  "split",   220,   0),
    makeNode("push",     "Push",                "channel", 440,  -80, "Мягкий"),
    makeNode("email",    "Email",               "channel", 440,   0,  "Рассылка"),
    makeNode("sms",      "SMS",                 "channel", 440,   80, "Сообщение"),
    makeNode("check",    "Проверка отклика",    "new",     660,   0,  "Реакция / нет"),
    makeNode("engaged",  "Engaged flow",        "result",  880,  -40, "Баннер + доп. push"),
    makeNode("retarget", "Retarget flow",       "retarget",880,   40, "Смена канала + оффер"),
    makeNode("result",   "Результат",           "default",1080,   0,  "Reactivated / cold", { isSuccess: true }),
  ];
}

export function createBaseEdges(): WorkflowEdge[] {
  return [
    makeEdge("signals",  "split"),
    makeEdge("split",    "push",     "Максимальный"),
    makeEdge("split",    "email",    "Оч. высокий"),
    makeEdge("split",    "sms",      "Высокий"),
    makeEdge("push",     "check"),
    makeEdge("email",    "check"),
    makeEdge("sms",      "check"),
    makeEdge("check",    "engaged",  "YES"),
    makeEdge("check",    "retarget", "NO"),
    makeEdge("engaged",  "result"),
    makeEdge("retarget", "result"),
  ];
}

// ── Command parser ────────────────────────────────────────────────────────────

export function parseWorkflowCommand(msg: string): CommandUpdater | null {
  const lower = msg.toLowerCase();

  // 1. Replace SMS with Push (M) — mark changed in amber, update retarget sublabel
  if (lower.includes("убери sms") || lower.includes("удали sms") || lower.includes("убрать sms")) {
    return (nodes, edges) => ({
      nodes: nodes.map((n) => {
        if (n.id === "sms")
          return { ...n, data: { label: "Push", sublabel: "M — вместо SMS", nodeType: "new" as WorkflowNodeType } };
        if (n.id === "retarget")
          return { ...n, data: { ...n.data, sublabel: "Push / баннер, без SMS" } };
        return n;
      }),
      // edge split→sms keeps label "M" — now points to Push(M), correct
      edges,
    });
  }

  // 2. Add activity filter between signals and split
  if (lower.includes("добавь фильтр") || lower.includes("фильтр активности") || lower.includes("добавить фильтр")) {
    return (nodes, edges) => {
      if (nodes.find((n) => n.id === "filter")) return { nodes, edges };
      const signalsNode = nodes.find((n) => n.id === "signals");
      if (!signalsNode) return { nodes, edges };
      const filterX  = signalsNode.position.x + 220;
      const shifted  = shiftRight(nodes, filterX, 220);
      const filterNode = makeNode("filter", "Filter: Activity", "new", filterX, signalsNode.position.y, "Исключить активных за 24h");
      const filteredEdges = edges.filter((e) => !(e.source === "signals" && e.target === "split"));
      return {
        nodes: [...shifted, filterNode],
        edges: [...filteredEdges, makeEdge("signals", "filter"), makeEdge("filter", "split")],
      };
    };
  }

  // 3. Add delay (before retarget) + Повторная проверка (after retarget)
  if (lower.includes("добавь задержку") || lower.includes("delay")) {
    return (nodes, edges) => {
      if (nodes.find((n) => n.id === "delay")) return { nodes, edges };
      const retargetNode = nodes.find((n) => n.id === "retarget");
      if (!retargetNode) return { nodes, edges };

      const step     = 200;
      const delayX   = retargetNode.position.x;
      const retX     = delayX + step;
      const recheckX = retX + step;
      const resultX  = recheckX + step;
      const y        = retargetNode.position.y;

      const updatedNodes = nodes.map((n) => {
        if (n.id === "retarget") return { ...n, position: { x: retX, y } };
        if (n.id === "result")   return { ...n, position: { x: Math.max(n.position.x, resultX), y: n.position.y } };
        return n;
      });

      const delayNode   = makeNode("delay",   "Delay 24h",          "new", delayX,   y, "Ожидание");
      const recheckNode = makeNode("recheck", "Повторная проверка", "new", recheckX, y, "Реакция / нет");

      const filteredEdges = edges.filter(
        (e) =>
          !(e.source === "check"    && e.target === "retarget") &&
          !(e.source === "retarget" && e.target === "result")
      );

      return {
        nodes: [...updatedNodes, delayNode, recheckNode],
        edges: [
          ...filteredEdges,
          makeEdge("check",    "delay",   "NO"),
          makeEdge("delay",    "retarget"),
          makeEdge("retarget", "recheck"),
          makeEdge("recheck",  "result"),
        ],
      };
    };
  }

  // 4. Replace Engaged flow with Email-открыт? decision + two banner branches
  if (lower.includes("условие email") || lower.includes("email открыт") || lower.includes("добавь условие")) {
    return (nodes, edges) => {
      if (nodes.find((n) => n.id === "email-condition")) return { nodes, edges };
      const engagedNode = nodes.find((n) => n.id === "engaged");
      if (!engagedNode) return { nodes, edges };

      const condX   = engagedNode.position.x;
      const condY   = engagedNode.position.y;
      const bannerX = condX + 200;

      const condNode  = makeNode("email-condition", "Email открыт?", "new",    condX,   condY,       "Проверка события");
      const bannerYes = makeNode("banner-yes",      "Баннер",        "result", bannerX, condY - 55,  "Без push");
      const bannerNo  = makeNode("banner-no",       "Баннер",        "result", bannerX, condY + 25,  "+ push");

      const updatedNodes = nodes
        .filter((n) => n.id !== "engaged")
        .map((n) =>
          n.id === "result"
            ? { ...n, position: { x: Math.max(n.position.x, bannerX + 200), y: n.position.y } }
            : n
        );

      const filteredEdges = edges.filter(
        (e) =>
          !(e.source === "check"   && e.target === "engaged") &&
          !(e.source === "engaged" && e.target === "result")
      );

      return {
        nodes: [...updatedNodes, condNode, bannerYes, bannerNo],
        edges: [
          ...filteredEdges,
          makeEdge("check",           "email-condition", "YES"),
          makeEdge("email-condition", "banner-yes",      "YES"),
          makeEdge("email-condition", "banner-no",       "NO"),
          makeEdge("banner-yes",      "result"),
          makeEdge("banner-no",       "result"),
        ],
      };
    };
  }

  return null;
}
