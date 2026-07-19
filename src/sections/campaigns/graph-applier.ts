// src/sections/campaigns/graph-applier.ts
//
// Pure graph-mutation layer extracted from workflow-view.tsx's structuralOps
// and rebuild useEffects (previously ~462-551). No React, no dispatch, no
// module-level cache — inputs in, outputs out. workflow-view.tsx calls these
// same functions so graph-editing behavior INSIDE the graph view is
// unchanged; a later headless applicator (for campaign-card editing) can
// call them too without mounting the graph.
import {
  applyOps,
  diffChangedNodeIds,
  type AppliedOp,
  type SkippedOp,
  type StructuralOp,
} from "@/state/structural-commands";
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

export interface GraphState {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface StructuralOpsResult {
  graph: GraphState;
  /** Ids of nodes that were added or changed type — drives the green flash. */
  changedIds: Set<string>;
  /** Chat reply text, or null when there is nothing to say (no ops at all). */
  reply: string | null;
  appliedCount: number;
  skippedCount: number;
}

/**
 * Builds the human-readable chat reply describing which structural ops
 * applied and which were skipped (and why). Mirrors the inline
 * `buildReplyFrom` helper that used to live in workflow-view.tsx's
 * structuralOps effect verbatim.
 */
export function buildStructuralOpsReply(
  applied: AppliedOp[],
  skipped: SkippedOp[]
): string {
  const lines: string[] = [];
  if (applied.length > 0) {
    if (applied.length === 1) {
      lines.push(applied[0].description);
    } else {
      lines.push("Готово:");
      for (const a of applied) lines.push(`• ${a.description}`);
    }
  }
  if (skipped.length > 0) {
    lines.push("Не выполнено:");
    for (const s of skipped) lines.push(`• ${s.reason}`);
  }
  return lines.join("\n");
}

/**
 * Applies a batch of structural ops to a graph and computes the changed-node
 * set + chat reply text in one pass — the same computation the
 * structuralOps effect in workflow-view.tsx used to run inline, called once
 * eagerly (for the early-exit / duration calc) and once "live" inside
 * apply(prev) of the AI reveal cycle. Pure: same graph + ops in ⇒ same
 * result out, never mutates the input graph.
 */
export function applyStructuralOps(
  graph: GraphState,
  ops: StructuralOp[]
): StructuralOpsResult {
  const result = applyOps(graph, ops);
  const changedIds = diffChangedNodeIds(graph, result.graph);
  const reply = buildStructuralOpsReply(result.applied, result.skipped);
  return {
    graph: result.graph,
    changedIds,
    reply: reply || null,
    appliedCount: result.applied.length,
    skippedCount: result.skipped.length,
  };
}

/** Shape of the `workflowRebuild` mailbox slot (app-state.ts) — nodes/edges
 *  already built via buildGraphFromSpec + validated via validateAiGraph
 *  upstream in use-assist-runner.ts by the time this function sees them. */
export interface RebuildPayload {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  assumptions: string;
}

export interface RebuildResult {
  graph: GraphState;
  changedIds: Set<string>;
  reply: string;
}

/**
 * Applies a full graph rebuild — swaps in the new nodes/edges wholesale and
 * marks every node as changed (matches current behavior: a rebuild flashes
 * the whole graph, not a diff against the previous one). Mirrors the inline
 * apply(prev) body of the rebuild effect in workflow-view.tsx verbatim.
 */
export function applyRebuild(rebuild: RebuildPayload): RebuildResult {
  return {
    graph: { nodes: rebuild.nodes, edges: rebuild.edges },
    changedIds: new Set(rebuild.nodes.map((n) => n.id)),
    reply: `Собрал заново. ${rebuild.assumptions}`,
  };
}
