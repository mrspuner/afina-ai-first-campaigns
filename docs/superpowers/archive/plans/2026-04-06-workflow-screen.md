# Workflow Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen workflow graph editor that opens after selecting any campaign type, lets users edit the pipeline via chat commands, launches a campaign, and shows an animated live-status screen.

**Architecture:** React Flow renders the node graph inside a `WorkflowGraph` component; `WorkflowView` wraps it and owns graph + status state; `page.tsx` adds a `selectedCampaign` state, wires `CampaignTypeView.onSelect`, and forwards chat submissions as commands when workflow is active.

**Tech Stack:** `@xyflow/react` (already installed at ^12.10.2), `motion/react` v12, TypeScript, Tailwind CSS v4.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/workflow.ts` | Create | Node/edge types, command parser |
| `src/components/workflow-node.tsx` | Create | Custom React Flow node component |
| `src/components/workflow-graph.tsx` | Create | ReactFlow canvas + fade overlays + controls |
| `src/components/workflow-status.tsx` | Create | Animated status/counter screen |
| `src/components/workflow-view.tsx` | Create | Container: graph ↔ status transition, command dispatch |
| `src/app/page.tsx` | Modify | `selectedCampaign` state, `workflowLaunched`, launch button, command forwarding |

---

## Task 1: Types and command parser

**Files:**
- Create: `src/types/workflow.ts`

- [ ] **Step 1: Create the file**

```ts
// src/types/workflow.ts
import type { Node, Edge } from "@xyflow/react";

export type WorkflowNodeType =
  | "default"
  | "split"
  | "channel"
  | "retarget"
  | "result"
  | "new";

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  sublabel?: string;
  nodeType: WorkflowNodeType;
}

export type WorkflowNode = Node<WorkflowNodeData, "workflowNode">;
export type WorkflowEdge = Edge;

/** A command updater returns new nodes/edges given current state, or null if command not recognised. */
export type CommandUpdater = (
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
) => { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

function makeNode(
  id: string,
  label: string,
  nodeType: WorkflowNodeType,
  x: number,
  y: number,
  sublabel?: string
): WorkflowNode {
  return {
    id,
    type: "workflowNode",
    position: { x, y },
    data: { label, nodeType, sublabel },
  };
}

function makeEdge(source: string, target: string): WorkflowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    style: { stroke: "#2a2a2a" },
  };
}

/** Base reactivation pipeline — shown on first render. */
export function createBaseNodes(): WorkflowNode[] {
  return [
    makeNode("signals", "Сигналы", "default",   0,    0, "источник"),
    makeNode("split",   "Сплит",   "split",    200,   0, "HL / L / M"),
    makeNode("push",    "Push",    "channel",  400, -80),
    makeNode("email",   "Email",   "channel",  400,   0),
    makeNode("sms",     "SMS",     "channel",  400,  80),
    makeNode("check",   "Проверка","default",  600,   0, "отклик"),
    makeNode("engaged", "Engaged", "result",   800, -40, "YES"),
    makeNode("retarget","Retarget","retarget", 800,  40, "NO"),
    makeNode("result",  "Результат","result", 1000,   0),
  ];
}

export function createBaseEdges(): WorkflowEdge[] {
  return [
    makeEdge("signals", "split"),
    makeEdge("split",   "push"),
    makeEdge("split",   "email"),
    makeEdge("split",   "sms"),
    makeEdge("push",    "check"),
    makeEdge("email",   "check"),
    makeEdge("sms",     "check"),
    makeEdge("check",   "engaged"),
    makeEdge("check",   "retarget"),
    makeEdge("engaged", "result"),
    makeEdge("retarget","result"),
  ];
}

/** Shift all nodes whose x >= fromX rightward by amount. */
function shiftRight(
  nodes: WorkflowNode[],
  fromX: number,
  amount: number
): WorkflowNode[] {
  return nodes.map((n) =>
    n.position.x >= fromX
      ? { ...n, position: { ...n.position, x: n.position.x + amount } }
      : n
  );
}

/**
 * Parse a natural-language command and return an updater function,
 * or null when the command is not recognised.
 */
export function parseWorkflowCommand(msg: string): CommandUpdater | null {
  const lower = msg.toLowerCase();

  // 1. Remove SMS channel
  if (lower.includes("убери sms") || lower.includes("удали sms") || lower.includes("убрать sms")) {
    return (nodes, edges) => ({
      nodes: nodes.filter((n) => n.id !== "sms"),
      edges: edges.filter((e) => e.source !== "sms" && e.target !== "sms"),
    });
  }

  // 2. Add activity filter before split
  if (lower.includes("добавь фильтр") || lower.includes("фильтр активности") || lower.includes("добавить фильтр")) {
    return (nodes, edges) => {
      if (nodes.find((n) => n.id === "filter")) return { nodes, edges }; // idempotent
      const signalsNode = nodes.find((n) => n.id === "signals")!;
      const filterX = signalsNode.position.x + 200;
      const shifted = shiftRight(nodes, filterX, 200);
      const filterNode = makeNode(
        "filter", "Фильтр 24ч", "new", filterX, signalsNode.position.y
      );
      const newEdges = edges.filter(
        (e) => !(e.source === "signals" && e.target === "split")
      );
      newEdges.push(makeEdge("signals", "filter"), makeEdge("filter", "split"));
      return { nodes: [...shifted, filterNode], edges: newEdges };
    };
  }

  // 3. Add delay in retarget branch
  if (lower.includes("добавь задержку") || lower.includes("задержка") || lower.includes("delay")) {
    return (nodes, edges) => {
      if (nodes.find((n) => n.id === "delay")) return { nodes, edges };
      const retargetNode = nodes.find((n) => n.id === "retarget")!;
      const resultNode   = nodes.find((n) => n.id === "result")!;
      const delayX = (retargetNode.position.x + resultNode.position.x) / 2;
      const delayNode = makeNode(
        "delay", "Задержка 24ч", "new", delayX, retargetNode.position.y
      );
      const newEdges = edges.filter(
        (e) => !(e.source === "retarget" && e.target === "result")
      );
      newEdges.push(makeEdge("retarget", "delay"), makeEdge("delay", "result"));
      return { nodes: [...nodes, delayNode], edges: newEdges };
    };
  }

  // 4. Add email-opened condition inside engaged branch
  if (
    lower.includes("условие email") ||
    lower.includes("email открыт") ||
    lower.includes("добавь условие")
  ) {
    return (nodes, edges) => {
      if (nodes.find((n) => n.id === "email-condition")) return { nodes, edges };
      const engagedNode = nodes.find((n) => n.id === "engaged")!;
      const resultNode  = nodes.find((n) => n.id === "result")!;
      const condX = (engagedNode.position.x + resultNode.position.x) / 2;
      const condNode = makeNode(
        "email-condition", "Email открыт?", "new", condX, engagedNode.position.y
      );
      const newEdges = edges.filter(
        (e) => !(e.source === "engaged" && e.target === "result")
      );
      newEdges.push(
        makeEdge("engaged", "email-condition"),
        makeEdge("email-condition", "result")
      );
      return { nodes: [...nodes, condNode], edges: newEdges };
    };
  }

  return null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/macintosh/Documents/work/afina-ai-first && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to `workflow.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/types/workflow.ts
git commit -m "feat: add workflow types and command parser"
```

---

## Task 2: Custom React Flow node component

**Files:**
- Create: `src/components/workflow-node.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/workflow-node.tsx
"use client";

import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { WorkflowNodeData, WorkflowNodeType } from "@/types/workflow";

const STYLES: Record<WorkflowNodeType, { border: string; bg: string; color: string }> = {
  default:  { border: "#2a2a2a", bg: "#111111", color: "#e5e5e5" },
  split:    { border: "#4c1d95", bg: "#0d0819", color: "#a78bfa" },
  channel:  { border: "#134e4a", bg: "#030f0e", color: "#5eead4" },
  retarget: { border: "#7f1d1d", bg: "#110505", color: "#f87171" },
  result:   { border: "#14532d", bg: "#030d06", color: "#4ade80" },
  new:      { border: "#78350f", bg: "#0f0a03", color: "#fbbf24" },
};

const HANDLE_STYLE = {
  background: "#2a2a2a",
  border: "none",
  width: 8,
  height: 8,
};

export function WorkflowNodeComponent({ data }: NodeProps<WorkflowNodeData>) {
  const s = STYLES[data.nodeType] ?? STYLES.default;
  return (
    <div
      style={{
        border: `1px solid ${s.border}`,
        background: s.bg,
        borderRadius: 8,
        padding: "10px 14px",
        minWidth: 110,
      }}
    >
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: s.color,
          whiteSpace: "nowrap",
          lineHeight: "1.4",
        }}
      >
        {data.label}
      </div>
      {data.sublabel && (
        <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>
          {data.sublabel}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/macintosh/Documents/work/afina-ai-first && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/workflow-node.tsx
git commit -m "feat: add WorkflowNodeComponent for React Flow"
```

---

## Task 3: WorkflowGraph — React Flow canvas with fade overlays

**Files:**
- Create: `src/components/workflow-graph.tsx`

- [ ] **Step 1: Create the component**

The graph must:
- Use `fitView` to center when content fits
- Allow horizontal pan on scroll (`panOnScroll` + `panOnScrollMode="horizontal"`)
- Disable scroll-zoom (`zoomOnScroll={false}`) and drag-pan (`panOnDrag={false}`)
- Show left/right fade gradients only when graph overflows (detected via `onViewportChange`)
- Use the existing `Controls` from `ai-elements/controls.tsx`
- Import React Flow CSS (needed since we're not using the `Canvas` wrapper from ai-elements)

```tsx
// src/components/workflow-graph.tsx
"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Viewport,
  PanOnScrollMode,
} from "@xyflow/react";
import { Controls } from "@/components/ai-elements/controls";
import { WorkflowNodeComponent } from "@/components/workflow-node";
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

// Defined outside component — React Flow requires stable nodeTypes reference
const nodeTypes = { workflowNode: WorkflowNodeComponent };

interface WorkflowGraphProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

function GraphInner({ nodes, edges }: WorkflowGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { getNodes } = useReactFlow();
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
        panOnDrag={false}
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Horizontal}
        zoomOnScroll={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onViewportChange={updateFades}
        style={{ background: "#0a0a0a" }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} position="top-right" />
      </ReactFlow>
    </div>
  );
}

export function WorkflowGraph({ nodes, edges }: WorkflowGraphProps) {
  return (
    <ReactFlowProvider>
      <GraphInner nodes={nodes} edges={edges} />
    </ReactFlowProvider>
  );
}
```

- [ ] **Step 2: Start the dev server and verify the graph renders**

```bash
cd /Users/macintosh/Documents/work/afina-ai-first && lsof -ti:3000 | xargs kill -9 2>/dev/null; npm run dev > /tmp/dev.log 2>&1 &
sleep 4 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected: `200`.

WorkflowGraph isn't wired to the page yet, but verify there are no import/compile errors by checking the dev server log:

```bash
grep -i "error\|failed" /tmp/dev.log | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/workflow-graph.tsx
git commit -m "feat: add WorkflowGraph with React Flow, fade overlays, horizontal scroll"
```

---

## Task 4: WorkflowStatus — animated counter screen

**Files:**
- Create: `src/components/workflow-status.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/workflow-status.tsx
"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";

interface CounterCardProps {
  label: string;
  target: number;
  delay: number;
  accent?: boolean;
}

function CounterCard({ label, target, delay, accent }: CounterCardProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (startedRef.current || !elRef.current) return;
      startedRef.current = true;
      const el = elRef.current;
      const duration = 4000;
      const start = performance.now();
      function step(now: number) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(target * eased).toLocaleString("ru");
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }, delay);
    return () => clearTimeout(timer);
  }, [target, delay]);

  return (
    <div className="flex min-w-[140px] flex-col items-center rounded-xl border border-border bg-card px-7 py-5">
      <div
        ref={elRef}
        className="text-[32px] font-bold leading-none"
        style={{ color: accent ? "#4ade80" : undefined }}
      >
        0
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

interface WorkflowStatusProps {
  onGoToStats: () => void;
}

export function WorkflowStatus({ onGoToStats }: WorkflowStatusProps) {
  return (
    <motion.div
      className="flex flex-1 flex-col items-center justify-center gap-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Status badge */}
      <div className="flex items-center gap-2 rounded-full border border-[#14532d] bg-[#030d06] px-4 py-1.5">
        <span
          className="h-1.5 w-1.5 rounded-full bg-[#4ade80]"
          style={{ animation: "wf-pulse 1.5s ease-in-out infinite" }}
        />
        <span className="text-xs font-medium text-[#4ade80]">Кампания запущена</span>
      </div>

      {/* Stat cards — counters start after 3 s */}
      <div className="flex gap-5">
        <CounterCard label="Отправлено"  target={847} delay={3000} />
        <CounterCard label="Доставлено"  target={791} delay={3300} accent />
        <CounterCard label="Открыто"     target={214} delay={3700} />
      </div>

      <button
        type="button"
        onClick={onGoToStats}
        className="rounded-lg border border-border bg-card px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
      >
        Посмотреть статистику →
      </button>

      {/* Pulse keyframe injected once */}
      <style>{`
        @keyframes wf-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/macintosh/Documents/work/afina-ai-first && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/workflow-status.tsx
git commit -m "feat: add WorkflowStatus with animated counters"
```

---

## Task 5: WorkflowView — container with graph ↔ status transition

**Files:**
- Create: `src/components/workflow-view.tsx`

- [ ] **Step 1: Create the component**

`WorkflowView` owns:
- `nodes` / `edges` state (graph data)
- `launched` — controlled externally via prop
- `pendingCommand` — received from page.tsx when user submits chat while workflow is active
- On `pendingCommand` change: run parser, update graph or ignore

```tsx
// src/components/workflow-view.tsx
"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { WorkflowGraph } from "@/components/workflow-graph";
import { WorkflowStatus } from "@/components/workflow-status";
import {
  createBaseNodes,
  createBaseEdges,
  parseWorkflowCommand,
} from "@/types/workflow";
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

interface GraphState {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface WorkflowViewProps {
  launched: boolean;
  pendingCommand: string | null;
  onCommandHandled: () => void;
  onGoToStats: () => void;
}

export function WorkflowView({
  launched,
  pendingCommand,
  onCommandHandled,
  onGoToStats,
}: WorkflowViewProps) {
  // Combined state prevents stale-closure bugs when updater reads both nodes and edges
  const [graph, setGraph] = useState<GraphState>({
    nodes: createBaseNodes(),
    edges: createBaseEdges(),
  });

  // Process incoming command from the shared chat input
  useEffect(() => {
    if (!pendingCommand) return;
    const updater = parseWorkflowCommand(pendingCommand);
    if (updater) {
      setGraph((prev) => updater(prev.nodes, prev.edges));
    }
    onCommandHandled();
  }, [pendingCommand, onCommandHandled]);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <AnimatePresence mode="wait">
        {!launched ? (
          <motion.div
            key="graph"
            className="flex flex-1 flex-col"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <WorkflowGraph nodes={graph.nodes} edges={graph.edges} />
          </motion.div>
        ) : (
          <WorkflowStatus key="status" onGoToStats={onGoToStats} />
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/macintosh/Documents/work/afina-ai-first && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/workflow-view.tsx
git commit -m "feat: add WorkflowView container with graph/status transition"
```

---

## Task 6: Wire everything into page.tsx

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Read the current file**

Read `src/app/page.tsx` to confirm current state before editing.

- [ ] **Step 2: Replace page.tsx**

Replace the full file content:

```tsx
// src/app/page.tsx
"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Mic, ChevronRight } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { CampaignWorkspace } from "@/components/campaign-workspace";
import { StatisticsView } from "@/components/statistics-view";
import { LaunchFlyout } from "@/components/launch-flyout";
import { WelcomeView } from "@/components/welcome-view";
import { CampaignTypeView } from "@/components/campaign-type-view";
import { WorkflowView } from "@/components/workflow-view";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";

const WELCOME_STEPS = [
  { n: 1, label: "Получение сигнала",  active: true  },
  { n: 2, label: "Запуск кампании",    active: false },
  { n: 3, label: "Статистика кампании",active: false },
];

interface SelectedCampaign {
  id: string;
  name: string;
}

export default function Home() {
  const [activeNav,        setActiveNav]        = useState<string | null>(null);
  const [launchOpen,       setLaunchOpen]       = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<SelectedCampaign | null>(null);
  const [workflowLaunched, setWorkflowLaunched] = useState(false);
  const [workflowCommand,  setWorkflowCommand]  = useState<string | null>(null);

  function handleNavChange(nav: string | null) {
    setActiveNav(nav);
    // Reset workflow state when leaving campaigns
    if (nav !== "Кампании") {
      setSelectedCampaign(null);
      setWorkflowLaunched(false);
      setWorkflowCommand(null);
    }
  }

  function handleCampaignSelect(id: string, name: string) {
    setSelectedCampaign({ id, name });
    setWorkflowLaunched(false);
    setWorkflowCommand(null);
  }

  function handlePromptSubmit(msg: string) {
    if (selectedCampaign && !workflowLaunched) {
      setWorkflowCommand(msg);
    }
  }

  function handleCommandHandled() {
    setWorkflowCommand(null);
  }

  function handleGoToStats() {
    setActiveNav("Статистика");
    setSelectedCampaign(null);
    setWorkflowLaunched(false);
  }

  const isWorkflow = activeNav === "Кампании" && selectedCampaign !== null;

  function renderMain() {
    if (activeNav === null) {
      return <WelcomeView onStep1Click={() => setActiveNav("Кампании")} />;
    }
    if (activeNav === "Статистика") {
      return <StatisticsView />;
    }
    if (activeNav === "Кампании" && selectedCampaign === null) {
      return <CampaignTypeView onSelect={handleCampaignSelect} />;
    }
    if (activeNav === "Кампании" && selectedCampaign !== null) {
      return (
        <WorkflowView
          launched={workflowLaunched}
          pendingCommand={workflowCommand}
          onCommandHandled={handleCommandHandled}
          onGoToStats={handleGoToStats}
        />
      );
    }
    return <CampaignWorkspace />;
  }

  // Derive chat placeholder
  const chatPlaceholder =
    activeNav === null
      ? "Выберите шаг или задайте вопрос…"
      : isWorkflow
      ? "Опишите изменение сценария..."
      : "Опишите вашу кампанию...";

  // Bottom bar hidden during status phase
  const showBottomBar = !workflowLaunched;

  return (
    <PromptInputProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <AppSidebar
          activeNav={activeNav ?? undefined}
          onNavChange={handleNavChange}
          onLaunchOpen={() => setLaunchOpen(true)}
          flyoutOpen={launchOpen}
        />
        <LaunchFlyout open={launchOpen} onClose={() => setLaunchOpen(false)} />

        <div className="relative flex flex-1 flex-col overflow-hidden">
          {renderMain()}

          {/* Floating group: launch button + chat input + step badges */}
          {showBottomBar && (
            <motion.div
              className="fixed left-[120px] right-0 z-30 px-8"
              initial={false}
              animate={{ bottom: activeNav === null ? "40%" : "3%" }}
              transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">

                {/* Launch button — only in workflow graph mode */}
                {isWorkflow && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setWorkflowLaunched(true)}
                      className="rounded-lg bg-foreground px-5 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
                    >
                      Начать кампанию →
                    </button>
                  </div>
                )}

                <PromptInput onSubmit={handlePromptSubmit}>
                  <PromptInputBody>
                    <PromptInputTextarea placeholder={chatPlaceholder} />
                  </PromptInputBody>
                  <PromptInputFooter>
                    <PromptInputTools>
                      <PromptInputButton tooltip="Голосовой ввод">
                        <Mic className="h-4 w-4" />
                      </PromptInputButton>
                    </PromptInputTools>
                    <PromptInputSubmit />
                  </PromptInputFooter>
                </PromptInput>

                {/* Step badges — always visible */}
                <div className="flex gap-2">
                  {WELCOME_STEPS.map(({ n, label, active }) => (
                    <button
                      key={n}
                      type="button"
                      disabled={!active}
                      onClick={
                        active && activeNav === null
                          ? () => setActiveNav("Кампании")
                          : undefined
                      }
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                        active
                          ? "cursor-pointer border-border bg-card hover:bg-accent"
                          : "cursor-not-allowed border-border/40 bg-card/40 opacity-35"
                      )}
                    >
                      <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                        Шаг {n}
                      </span>
                      <div className="h-3 w-px shrink-0 bg-border" />
                      <span className="text-sm font-medium text-foreground">{label}</span>
                      {active && (
                        <ChevronRight className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </PromptInputProvider>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/macintosh/Documents/work/afina-ai-first && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Open the app and verify the full flow**

The dev server should already be running. Open http://localhost:3000 and test:

1. Welcome screen visible → click "Шаг 1" → `CampaignTypeView` opens
2. Click any campaign card → `WorkflowGraph` renders with base pipeline nodes
3. Type `убери sms` in chat → SMS node disappears from graph
4. Type `добавь фильтр` → Filter node inserted between Сигналы and Сплит, others shift right
5. Click "Начать кампанию →" → graph fades out, status screen appears with badge "Кампания запущена"
6. After 3 seconds → counters animate up (Отправлено 847, Доставлено 791, Открыто 214)
7. Click "Посмотреть статистику →" → navigates to StatisticsView

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire WorkflowView into page — campaign selection, launch, stats navigation"
```
