/**
 * Pure cost model for a campaign workflow (spec A2 + A3).
 *
 * One formula, three surfaces: per-send unit cost in a communication node,
 * the campaign total in the workflow header, and the breakdown on the payment
 * screen. All numeric constants are prototype mocks, not a tariff sheet.
 */
import type {
  WorkflowNode,
  WorkflowEdge,
  WorkflowNodeType,
} from "@/types/workflow";
import { isCommunicationNode } from "@/types/workflow";

export type Channel = "sms" | "email" | "push" | "ivr";

/** Mock price in roubles per one send, by channel. */
export const UNIT_COST: Record<Channel, number> = {
  sms: 5,
  email: 1,
  push: 0.5,
  ivr: 8,
};

/** Share of the audience reserved for a repeat (dynamic) communication. */
export const DYNAMIC_RATE = 0.3;

/** Human-facing channel names for the payment breakdown. */
export const CHANNEL_LABEL: Record<Channel, string> = {
  sms: "SMS",
  email: "Email",
  push: "Push",
  ivr: "Звонок",
};

/** Reference per-touch cost for the «своя сумма» forecast. */
const TOUCH_REFERENCE_COST = UNIT_COST.sms;

type Segments = { max: number; high: number; mid: number; low: number };

export interface ReachResult {
  /** Sends that land on each node (rounded). */
  reach: Record<string, number>;
  /** True when at least one path from `signal` to the node crosses a condition. */
  dynamic: Record<string, boolean>;
}

export interface CostLine {
  nodeId: string;
  channel: Channel;
  label: string;
  unit: number;
  reach: number;
  sum: number;
  isDynamic: boolean;
}

export interface CampaignCost {
  primary: number;
  repeat: number;
  total: number;
  lines: CostLine[];
  hasDynamic: boolean;
}

/**
 * How a split node divides its incoming reach across `branches` outgoing edges.
 * by=segment → proportional to segment shares (top-B of max/high/mid/low);
 * by=random, or shares unavailable → even split.
 */
function splitShares(
  segments: Segments | undefined,
  branches: number,
  by: "segment" | "random",
): number[] {
  if (branches <= 0) return [];
  if (by === "segment" && segments && branches <= 4) {
    const buckets = [segments.max, segments.high, segments.mid, segments.low].slice(
      0,
      branches,
    );
    const sum = buckets.reduce((a, b) => a + b, 0);
    if (sum > 0) return buckets.map((v) => v / sum);
  }
  return Array(branches).fill(1 / branches);
}

/**
 * Propagate reach from the `signal` node through the workflow DAG and mark
 * every node downstream of a condition as dynamic.
 */
export function computeReach(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  N: number,
): ReachResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, WorkflowEdge[]>();
  const indeg = new Map<string, number>();
  for (const n of nodes) {
    outgoing.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    outgoing.get(e.source)!.push(e);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }

  const reach: Record<string, number> = {};
  const dynamic: Record<string, boolean> = {};
  for (const n of nodes) {
    reach[n.id] = 0;
    dynamic[n.id] = false;
  }

  const signal = nodes.find(
    (n) => n.data.nodeType === "source" || n.data.nodeType === "signal"
  );
  const segments =
    signal?.data.params?.kind === "signal" ? signal.data.params.segments : undefined;
  if (signal) reach[signal.id] = N;

  // Kahn topological order so every node is finalised after all its parents.
  const work = new Map(indeg);
  const queue = nodes.filter((n) => (work.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of outgoing.get(id) ?? []) {
      work.set(e.target, (work.get(e.target) ?? 0) - 1);
      if (work.get(e.target) === 0) queue.push(e.target);
    }
  }
  // Defensive: append any nodes left out by a cycle so they still get a value.
  for (const n of nodes) if (!order.includes(n.id)) order.push(n.id);

  for (const id of order) {
    const n = byId.get(id);
    if (!n) continue;
    reach[id] = Math.round(reach[id]);
    const r = reach[id];
    const outs = outgoing.get(id) ?? [];
    const kind = n.data.nodeType;

    function contribute(targetId: string, amount: number, dyn: boolean) {
      reach[targetId] += amount;
      if (dyn) dynamic[targetId] = true;
    }

    if (kind === "split") {
      const by = n.data.params?.kind === "split" ? n.data.params.by : "random";
      const shares = splitShares(segments, outs.length, by);
      outs.forEach((e, i) => contribute(e.target, r * shares[i], dynamic[id]));
    } else if (kind === "condition") {
      // Each YES/NO branch is a guess; everything below becomes dynamic.
      for (const e of outs) contribute(e.target, r * DYNAMIC_RATE, true);
    } else {
      for (const e of outs) contribute(e.target, r, dynamic[id]);
    }
  }

  return { reach, dynamic };
}

/** Full campaign cost broken into primary + repeat with one line per channel node. */
export function computeCampaignCost(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  N: number,
): CampaignCost {
  const { reach, dynamic } = computeReach(nodes, edges, N);
  const lines: CostLine[] = [];
  let primary = 0;
  let repeat = 0;

  for (const n of nodes) {
    const kind: WorkflowNodeType = n.data.nodeType;
    if (!isCommunicationNode(kind)) continue;
    const channel = kind as Channel;
    const unit = UNIT_COST[channel];
    const r = reach[n.id] ?? 0;
    const sum = Math.round(unit * r);
    const isDynamic = dynamic[n.id] ?? false;
    lines.push({
      nodeId: n.id,
      channel,
      label: n.data.sublabel ?? n.data.label,
      unit,
      reach: r,
      sum,
      isDynamic,
    });
    if (isDynamic) repeat += sum;
    else primary += sum;
  }

  return {
    primary,
    repeat,
    total: primary + repeat,
    lines,
    hasDynamic: lines.some((l) => l.isDynamic),
  };
}

/**
 * How many touches the active budget buys, capped at audience size, using a
 * representative per-touch cost. Negative/zero budget or audience → 0.
 */
export function estimateTouches(budget: number, audienceSize: number): number {
  if (budget <= 0) return 0;
  if (audienceSize <= 0) return 0;
  return Math.min(audienceSize, Math.floor(budget / TOUCH_REFERENCE_COST));
}
