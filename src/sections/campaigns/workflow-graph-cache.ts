import type { WorkflowEdge, WorkflowNode } from "@/types/workflow";

export type CachedGraph = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

/**
 * Durable per-campaign workflow graph snapshot.
 *
 * The graph (nodes + their edited params/text) lives in WorkflowView's local
 * state. On launch the view flips `workflow → campaign`, which unmounts
 * WorkflowView and destroys that state; reopening rebuilds the graph from the
 * scenario template and silently discards every manual edit. This module-scope
 * cache survives the unmount, so WorkflowView can rehydrate the exact graph the
 * user left — keeping manual edits after launch (and across navigation).
 */
const graphs = new Map<string, CachedGraph>();

export function getCachedGraph(
  campaignId: string | undefined,
): CachedGraph | undefined {
  return campaignId ? graphs.get(campaignId) : undefined;
}

export function setCachedGraph(
  campaignId: string | undefined,
  graph: CachedGraph,
): void {
  if (campaignId) graphs.set(campaignId, graph);
}

/**
 * Deep-copy the cached graph of `fromId` onto `toId` — used by campaign
 * duplication (#10) so the copy carries the original's exact, edited
 * nodes/edges/params, not just a scenario-template rebuild. No-op when the
 * source has no cached graph or the target id is missing.
 */
export function copyCachedGraph(
  fromId: string | undefined,
  toId: string | undefined,
): void {
  const src = getCachedGraph(fromId);
  if (!src || !toId) return;
  graphs.set(toId, {
    nodes: src.nodes.map((n) => structuredClone(n)),
    edges: src.edges.map((e) => structuredClone(e)),
  });
}
