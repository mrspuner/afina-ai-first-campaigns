"use client";

import { useMemo } from "react";
import { WorkflowGraph } from "@/sections/campaigns/workflow-graph";
import { createTemplate } from "@/state/workflow-templates";
import { createBaseNodes, createBaseEdges } from "@/types/workflow";
import type { SignalType } from "@/state/app-state";
import type { Channel } from "@/types/campaign";

interface WorkflowMiniPreviewProps {
  signalType?: SignalType;
  /** Selected communication channels — passed to createTemplate for accurate preview. */
  channels?: Channel[];
  /**
   * When supplied, the mini preview is rendered as a real `<button>` and
   * invokes this handler on click / Enter / Space. When omitted the preview
   * stays non-interactive (used in places where the surrounding card already
   * provides navigation).
   */
  onClick?: () => void;
}

/**
 * Mini-rendering of a campaign's workflow graph. Reuses the full
 * WorkflowGraph component but wraps it in a small container with
 * pointer-events disabled on the graph itself so xyflow pan/zoom/node-select
 * never fires from clicks on the preview. When an `onClick` is supplied the
 * outer container becomes a real button — the click is captured before it
 * reaches the (still pointer-events-none) graph.
 */
export function WorkflowMiniPreview({
  signalType,
  channels,
  onClick,
}: WorkflowMiniPreviewProps) {
  const graph = useMemo(() => {
    if (signalType) {
      const t = createTemplate(signalType, undefined, channels);
      return { nodes: t.nodes, edges: t.edges };
    }
    return { nodes: createBaseNodes(), edges: createBaseEdges() };
  }, [signalType, channels]);

  const innerGraph = (
    <div
      className="pointer-events-none relative h-32 w-full overflow-hidden rounded-lg border border-border bg-card"
      aria-hidden
    >
      <WorkflowGraph nodes={graph.nodes} edges={graph.edges} compact />
    </div>
  );

  if (!onClick) {
    return innerGraph;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Открыть workflow"
      className="group block w-full rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 [&>div]:transition-colors [&:hover>div]:border-foreground/30"
    >
      {innerGraph}
    </button>
  );
}
