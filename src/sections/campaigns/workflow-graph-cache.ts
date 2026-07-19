import { useSyncExternalStore } from "react";
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

// ----- version / subscription layer -----
//
// The cache is a plain module Map — React can't see writes to it. A card that
// renders from `getCachedGraph` (mini-preview, description) therefore won't
// re-render when the headless applier (use-campaign-graph-applier) mutates the
// graph from outside the graph view. This monotonic version + listener set is
// the external store React subscribes to: every cache write bumps the version
// and notifies, so `useCachedGraphVersion()` re-renders its consumers, which
// then re-read `getCachedGraph` fresh.
let version = 0;
const listeners = new Set<() => void>();

/** Bump the version and notify subscribers — called after every cache write. */
function bumpVersion(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** Subscribe to cache-version changes. Returns an unsubscribe fn. */
export function subscribeGraphVersion(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current cache version — stable across renders until a write bumps it. */
export function getGraphVersion(): number {
  return version;
}

/**
 * React hook: re-renders the caller whenever ANY cached graph is written
 * (setCachedGraph / copyCachedGraph). Consumers use the returned number as a
 * dependency to re-read `getCachedGraph` (and rebuild memoized derivations like
 * the mini-preview) after a headless graph edit. `getServerSnapshot` returns
 * the same module version so SSR/first-client hydration agree (both start 0).
 */
export function useCachedGraphVersion(): number {
  return useSyncExternalStore(
    subscribeGraphVersion,
    getGraphVersion,
    getGraphVersion,
  );
}

export function getCachedGraph(
  campaignId: string | undefined,
): CachedGraph | undefined {
  return campaignId ? graphs.get(campaignId) : undefined;
}

export function setCachedGraph(
  campaignId: string | undefined,
  graph: CachedGraph,
): void {
  if (!campaignId) return;
  graphs.set(campaignId, graph);
  bumpVersion();
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
  bumpVersion();
}
