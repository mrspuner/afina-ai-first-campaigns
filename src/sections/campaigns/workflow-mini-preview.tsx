"use client";

import { useMemo } from "react";
import { WorkflowGraph } from "@/sections/campaigns/workflow-graph";
import { createTemplate } from "@/state/workflow-templates";
import { createBaseNodes, createBaseEdges } from "@/types/workflow";
import { getCachedGraph } from "./workflow-graph-cache";
import type { SignalType } from "@/state/app-state";
import type { Channel, SourceType } from "@/types/campaign";

interface WorkflowMiniPreviewProps {
  /** Кампания, чей живой граф показываем; читаем по нему кэш редактора. */
  campaignId?: string;
  signalType?: SignalType;
  /** Тип источника — нужен для fallback-шаблона (как в полном графе). */
  sourceType?: SourceType;
  /** Selected communication channels — passed to createTemplate for accurate preview. */
  channels?: Channel[];
  /**
   * When supplied, the mini preview becomes a clickable `role="button"` element
   * and invokes this handler on click / Enter / Space. It is intentionally NOT
   * a native `<button>`: the preview embeds a react-flow graph whose zoom
   * Controls are themselves `<button>`s, and a `<button>` may not contain a
   * nested `<button>` (invalid HTML). When omitted the preview stays
   * non-interactive (the surrounding card provides navigation).
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
  campaignId,
  signalType,
  sourceType,
  channels,
  onClick,
}: WorkflowMiniPreviewProps) {
  const graph = useMemo(() => {
    // Живой граф из кэша редактора — то же, что читает WorkflowView
    // (getCachedGraph). Так миниатюра совпадает с полным графом (aim #8).
    const cached = getCachedGraph(campaignId);
    if (cached) return { nodes: cached.nodes, edges: cached.edges };
    // Fallback: граф ни разу не открывали — строим шаблон с РЕАЛЬНЫМ
    // sourceType (раньше передавали undefined → расхождение, aim #8).
    if (signalType) {
      const t = createTemplate(signalType, sourceType, channels);
      return { nodes: t.nodes, edges: t.edges };
    }
    return { nodes: createBaseNodes(), edges: createBaseEdges() };
  }, [campaignId, signalType, sourceType, channels]);

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
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label="Открыть workflow"
      className="group block w-full cursor-pointer rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 [&>div]:transition-colors [&:hover>div]:border-foreground/30"
    >
      {innerGraph}
    </div>
  );
}
