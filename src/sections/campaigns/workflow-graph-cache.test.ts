import { describe, it, expect } from "vitest";
import {
  getCachedGraph,
  setCachedGraph,
  copyCachedGraph,
  invalidateCachedGraph,
  getGraphVersion,
} from "./workflow-graph-cache";
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

// The cache stores plain data objects; structuredClone handles any shape, so
// the test uses minimal fixtures cast to the graph types.
const nodesOf = (text: string) =>
  [{ id: "n1", data: { params: { text } } }] as unknown as WorkflowNode[];
const edges = [{ id: "e1", source: "n1", target: "n2" }] as unknown as WorkflowEdge[];

describe("workflow-graph-cache — copyCachedGraph (#10 duplicate 1-to-1)", () => {
  it("deep-copies the source graph onto the target id", () => {
    setCachedGraph("src", { nodes: nodesOf("оригинал"), edges });
    copyCachedGraph("src", "dst");

    const copy = getCachedGraph("dst");
    expect(copy).toBeDefined();
    expect(copy!.nodes).toEqual(nodesOf("оригинал"));
    expect(copy!.edges).toEqual(edges);

    // Deep clone: mutating the copy must not reach back into the source.
    type P = { data: { params: { text: string } } };
    (copy!.nodes[0] as unknown as P).data.params.text = "изменено";
    expect((getCachedGraph("src")!.nodes[0] as unknown as P).data.params.text).toBe(
      "оригинал",
    );
  });

  it("is a no-op when the source has no cached graph", () => {
    copyCachedGraph("nonexistent", "dst2");
    expect(getCachedGraph("dst2")).toBeUndefined();
  });

  it("does nothing without a target id", () => {
    setCachedGraph("src3", { nodes: nodesOf("x"), edges });
    copyCachedGraph("src3", undefined);
    // no throw, source untouched
    expect(getCachedGraph("src3")).toBeDefined();
  });
});

describe("workflow-graph-cache — invalidateCachedGraph (сброс при смене сценария)", () => {
  it("удаляет закэшированный граф и поднимает версию, чтобы подписчики перерендерились", () => {
    setCachedGraph("inv1", { nodes: nodesOf("оригинал"), edges });
    expect(getCachedGraph("inv1")).toBeDefined();

    const versionBefore = getGraphVersion();
    invalidateCachedGraph("inv1");

    expect(getCachedGraph("inv1")).toBeUndefined();
    expect(getGraphVersion()).toBeGreaterThan(versionBefore);
  });

  it("не падает без campaignId (no-op)", () => {
    const versionBefore = getGraphVersion();
    invalidateCachedGraph(undefined);
    expect(getGraphVersion()).toBe(versionBefore);
  });
});
