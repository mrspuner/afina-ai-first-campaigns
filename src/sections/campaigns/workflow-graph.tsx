"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Viewport,
} from "@xyflow/react";
import { Controls } from "@/components/ai-elements/controls";
import {
  WorkflowNodeComponent,
  WORKFLOW_NODE_STATE_CSS,
} from "@/sections/campaigns/workflow-node";
import { WorkflowReadOnlyProvider } from "@/sections/campaigns/workflow-readonly-context";
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

// Defined outside component — React Flow requires stable nodeTypes reference
const nodeTypes = { workflowNode: WorkflowNodeComponent };

interface WorkflowGraphProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  compact?: boolean;
  /** Launched campaigns: nodes expand for inspection but fields can't be edited. */
  readOnly?: boolean;
  onNodeClick?: (id: string, label: string, nodeType?: string) => void;
  onPaneClick?: () => void;
}

function GraphInner({
  nodes,
  edges,
  compact,
  onNodeClick,
  onPaneClick,
}: WorkflowGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { getNodes, fitView } = useReactFlow();

  // Re-fit when container shrinks (launched → compact mode)
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 60);
    return () => clearTimeout(t);
  }, [compact, fitView]);
  const [fades, setFades] = useState({ left: false, right: false });

  const updateFades = useCallback(
    (viewport: Viewport) => {
      const allNodes = getNodes();
      if (!allNodes.length || !containerRef.current) return;
      const containerW = containerRef.current.clientWidth;
      const leftmost  = Math.min(...allNodes.map((n) => n.position.x));
      const rightmost = Math.max(...allNodes.map((n) => n.position.x + 130)); // 130 ≈ node width
      setFades({
        left:  leftmost  * viewport.zoom + viewport.x < -10,
        right: rightmost * viewport.zoom + viewport.x > containerW + 10,
      });
    },
    [getNodes]
  );

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <style>{WORKFLOW_NODE_STATE_CSS}</style>
      <style>{`
        .react-flow__node {
          transition: transform 320ms var(--ease-out-strong);
        }
        .react-flow__node.dragging {
          transition: none;
        }
      `}</style>
      {/* Left fade */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 transition-opacity duration-300"
        style={{
          background: "linear-gradient(to right, #0a0a0a, transparent)",
          opacity: fades.left ? 1 : 0,
        }}
      />
      {/* Right fade */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 transition-opacity duration-300"
        style={{
          background: "linear-gradient(to left, #0a0a0a, transparent)",
          opacity: fades.right ? 1 : 0,
        }}
      />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        panOnDrag={true}
        panOnScroll={false}
        selectionOnDrag={false}
        zoomOnScroll={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        onNodeClick={(_, node) => {
          const data = node.data as { label?: string; nodeType?: string } | undefined;
          const label = data?.label ?? node.id;
          const nodeType = data?.nodeType;
          onNodeClick?.(node.id, label, nodeType);
        }}
        onPaneClick={onPaneClick}
        onViewportChange={updateFades}
        style={{ background: "#0a0a0a" }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} position="top-right" />
      </ReactFlow>
    </div>
  );
}

export function WorkflowGraph({
  nodes,
  edges,
  compact,
  readOnly = false,
  onNodeClick,
  onPaneClick,
}: WorkflowGraphProps) {
  return (
    <WorkflowReadOnlyProvider value={readOnly}>
      <ReactFlowProvider>
        <GraphInner
          nodes={nodes}
          edges={edges}
          compact={compact}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
        />
      </ReactFlowProvider>
    </WorkflowReadOnlyProvider>
  );
}
