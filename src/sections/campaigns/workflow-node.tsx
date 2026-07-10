"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { useAppDispatch } from "@/state/app-state-context";
import { usePromptChips } from "@/state/prompt-chips-context";
import type { WorkflowNode } from "@/types/workflow";
import { NodeCardBody } from "./node-card-content";
import { NODE_STYLES, NODE_ICON } from "./node-visuals";

const HANDLE_STYLE = {
  background: "#2a2a2a",
  border: "none",
  width: 8,
  height: 8,
};

export function WorkflowNodeComponent({ id, data, selected }: NodeProps<WorkflowNode>) {
  const s = NODE_STYLES[data.nodeType] ?? NODE_STYLES.default;
  const Icon = NODE_ICON[data.nodeType];
  const dispatch = useAppDispatch();
  const { removeChipsForNode } = usePromptChips();
  const updateNodeInternals = useUpdateNodeInternals();

  // Selecting a node resizes it (110→320 wide, taller card), which moves both
  // handles. React Flow caches handle positions per node, so without telling it
  // to re-measure, edges keep pointing at the old handle coords and visibly
  // "break" off the node. Re-measure on select toggle (and again once the
  // layout animation settles) so connectors stay anchored point-to-point.
  useEffect(() => {
    updateNodeInternals(id);
  }, [selected, id, updateNodeInternals]);

  const showReadyDot =
    !data.needsAttention && !data.processing && !data.justUpdated && !selected;

  const stateClass = [
    data.needsAttention ? "wf-node-needs-attention" : null,
    data.processing ? "wf-node-processing" : null,
    data.justUpdated ? "wf-node-just-updated" : null,
    selected ? "wf-node-selected wf-node-expanded" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <motion.div
      layout
      className={stateClass}
      data-node-type={data.nodeType}
      data-testid={selected ? "node-control-panel" : undefined}
      initial={false}
      animate={{
        opacity: 1,
        scale: 1,
      }}
      transition={{ layout: { duration: 0.28, ease: [0.32, 0.72, 0, 1] } }}
      onLayoutAnimationComplete={() => updateNodeInternals(id)}
      style={{
        position: "relative",
        border: `1px solid ${s.border}`,
        background: s.bg,
        borderRadius: selected ? 12 : 8,
        padding: selected ? "12px 14px 14px" : "10px 14px",
        width: selected ? 320 : "auto",
        minWidth: selected ? 320 : 110,
        zIndex: selected ? 50 : 1,
        boxShadow: selected
          ? "0 12px 40px -12px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04)"
          : "none",
        transition: "border-color 0.3s var(--ease-out), background 0.3s var(--ease-out)",
      }}
    >
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />

      <div className="flex items-start gap-2">
        <div
          className="min-w-0 flex-1"
          style={{
            fontSize: selected ? 13 : 11,
            fontWeight: 500,
            color: s.color,
            lineHeight: "1.4",
            transition: "color 0.3s var(--ease-out)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: selected ? "normal" : "nowrap",
            }}
          >
            {Icon ? <Icon size={selected ? 14 : 12} strokeWidth={2} /> : null}
            <span>{data.label}</span>
          </div>
          {data.sublabel && (
            <div
              style={{
                fontSize: selected ? 11 : 10,
                color: "rgba(255,255,255,0.55)",
                marginTop: 2,
                whiteSpace: selected ? "normal" : "nowrap",
              }}
            >
              {data.sublabel}
            </div>
          )}
        </div>

        {selected && (
          <button
            type="button"
            aria-label="Закрыть карточку ноды"
            onClick={(e) => {
              e.stopPropagation();
              // #2 — снимаем теги этой ноды (node_${id} + nodefield_${id}_*).
              // Направление одностороннее: закрытие ноды → чистка её тегов.
              removeChipsForNode(id);
              dispatch({ type: "workflow_node_deselected" });
            }}
            className="nodrag -mr-1 -mt-1 rounded-md p-1 text-muted-foreground opacity-70 hover:bg-accent hover:text-foreground hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {selected && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut", delay: 0.05 }}
          className="mt-2.5 border-t border-border/60 pt-2.5"
        >
          <NodeCardBody id={id} data={data} />
        </motion.div>
      )}

      {showReadyDot && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "#4ade80",
            opacity: 0.4,
          }}
        />
      )}
      {data.needsAttention && !selected && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#facc15",
            opacity: 0.95,
          }}
        />
      )}
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
    </motion.div>
  );
}

// Shared CSS for node visual states — mounted once per WorkflowGraph.
export const WORKFLOW_NODE_STATE_CSS = `
  .wf-node-selected {
    outline: 2px solid #60a5fa;
    outline-offset: 3px;
    box-shadow: 0 0 0 6px rgba(96, 165, 250, 0.18);
  }
  .wf-node-expanded {
    outline-offset: 2px;
  }
  .wf-node-needs-attention {
    border-color: #fb923c !important;
    animation: wf-needs-attention 1.4s ease-in-out infinite;
  }
  .wf-node-processing {
    animation: wf-processing 0.7s ease-in-out infinite;
  }
  .wf-node-just-updated {
    animation: wf-just-updated 600ms var(--ease-out);
  }
  @keyframes wf-needs-attention {
    0%,100% { box-shadow: 0 0 0 0 rgba(251,146,60,0.45); }
    50%     { box-shadow: 0 0 0 6px rgba(251,146,60,0);   }
  }
  @keyframes wf-processing {
    0%,100% { box-shadow: 0 0 0 0 rgba(234,179,8,0); }
    50%     { box-shadow: 0 0 0 4px rgba(234,179,8,0.55); }
  }
  @keyframes wf-just-updated {
    0%   { box-shadow: 0 0 0 3px rgba(74,222,128,0.9); }
    100% { box-shadow: 0 0 0 3px rgba(74,222,128,0);   }
  }
`;
