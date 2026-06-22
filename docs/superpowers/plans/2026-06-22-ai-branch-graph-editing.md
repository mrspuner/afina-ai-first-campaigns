# AI Branch-Aware Graph Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the AI prompt-bar build and edit non-linear workflow graphs (conditions with YES/NO branches, split/merge) instead of collapsing every rebuild/edit into a flat left-to-right chain.

**Architecture:** Three sequential layers. (1) `buildGraphFromSpec` (rebuild path) stops emitting linear `x: STEP*(i+1)` positions and instead runs the existing BFS column layouter `relayoutGraph`, so emitted branch edges render as real columns/rows. (2) The graph context fed to the orchestrator prompt carries edge labels (YES/NO), so the model can see existing branches — this requires plumbing `label` through `summarizeGraph` → `assistContextSchema` → `buildSystemPrompt`. (3) A new branch-aware structural op (`add_condition` / `addCondition`) adds a `condition` node with exactly two labeled outgoing branches in one operation, wired through the flat `WireOp` → strict `StructuralOp` → `applyOps` reducer pipeline, satisfying `validateAiGraph`'s `condition-degree` rule (exactly 2 outgoing).

**Tech Stack:** Next.js 16, TypeScript, Zod v4, Vercel AI SDK tool-calling, `@xyflow/react` graph types, Vitest (jsdom), Tailwind v4. Alias `@` → `./src`.

---

## Conventions for every task

- Test runner: Vitest. Single file: `npx vitest run <path>`. All: `npm test`.
- Tests colocated: `foo.ts` → `foo.test.ts`. Env: jsdom. Alias `@` → `./src`.
- Lint: `npm run lint`. Type-check: `npx tsc --noEmit`.
- TDD: write the failing test → run it (expect FAIL) → minimal implementation → run (expect PASS) → commit.
- Commit message footer (every commit in this plan): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Reference: types/functions that already exist (verified by reading source)

- `src/lib/ai/rebuild-schema.ts`
  - `rebuildGraphSchema` (zod): `{ nodes: [{key,nodeType,label,sublabel?}], edges: [{from,to,label?}], assumptions }`. Edge `label` is ALREADY in the schema.
  - `buildGraphFromSpec(spec, signal): { nodes: WorkflowNode[]; edges: WorkflowEdge[] }` — currently lays nodes out linearly at `x: STEP*(i+1), y: n.nodeType==="end" ? 120 : 0` (lines 68-79). `STEP = 210`.
  - Edges already get `...(e.label ? { label: e.label } : {})` (line 87).
- `src/state/structural-commands.ts`
  - `type GraphState = { nodes: WorkflowNode[]; edges: WorkflowEdge[] }` (line 257, NOT exported — structurally identical to `buildGraphFromSpec`'s return type).
  - `export function relayoutGraph(graph: GraphState): GraphState` (line 696) — BFS columns from the `source`/`signal` node; `COL_WIDTH = 200`, `ROW_HEIGHT = 100`; same-depth nodes stacked vertically and centered; orphans placed after `maxDepth`.
  - `export type Placement` (line 9), `export type StructuralOp` (line 15: `add | remove | replace`), `AppliedOp`, `SkippedOp`.
  - `applyAdd`, `applyRemove`, `applyReplace` (private), `export function applyOps(graph, ops)` (line 757) — switch over `op.kind`, calls `relayoutGraph(g)` once at the end if anything applied.
  - `findNodeByRef(nodes, ref): WorkflowNode | null` (line 289), `uniqueLabel(nodes, baseType)` (line 308), `defaultParamsFor(kind): NodeParams | undefined` (line 330), `nanoId()` (line 368), `TYPE_LABEL: Record<WorkflowNodeType, string>` (line 259, has `condition: "Условие"`).
- `src/lib/ai/ops-wire-schema.ts`
  - `wireOpSchema` (zod, flat) with `kind: "add"|"remove"|"replace"`, `nodeType?`, `ref?`, `placementMode?`, `refA?`, `refB?`, `inlineParams?`.
  - `type WireOp`, `toStructuralOp(w): StructuralOp | null`, `toStructuralOps(wires): StructuralOp[]` (drops nulls).
- `src/lib/ai-workflow-schema.ts`
  - `nodeTypeSchema` (zod enum, includes `condition`), `placementSchema`, `structuralOpSchema` (zod discriminatedUnion mirror of `StructuralOp`), `workflowOpsResultSchema`. Has a type-compat assertion `const _check: StructuralOp[] = ({} as WorkflowOpsResult).ops;` (line 95) — this BREAKS the build if the zod mirror diverges from `StructuralOp`, so it MUST be kept in sync.
- `src/lib/ai/graph-summary.ts`
  - `interface GraphNodeSummary { id; label; nodeType; sublabel? }`.
  - `summarizeGraph(graph): { nodes: GraphNodeSummary[]; edges: Array<{ from: string; to: string }> }` — currently maps `e => ({ from: e.source, to: e.target })`, DROPPING `e.label`.
- `src/lib/ai/assist-contract.ts`
  - `assistContextSchema.graph` = `z.object({ nodes: array(graphNodeSummarySchema), edges: array(z.object({ from, to })) }).optional()` (lines 27-30). Edge schema has NO `label`.
- `src/lib/ai/orchestrator-prompt.ts`
  - `buildSystemPrompt(context)` renders edges (line 33): `context.graph.edges.map((e) => `${e.from} → ${e.to}`).join("; ")` — DROPS label.
- `src/state/ai-graph-validation.ts`
  - `validateAiGraph(graph)` — error `condition-degree` fires unless every `condition` node has EXACTLY 2 outgoing edges. Also `no-signal-entry` (needs `source` or `signal`), `no-success-terminal`, `dangling-edge`, `unreachable-node`.
- `src/types/workflow.ts`
  - `WorkflowNodeType` includes `condition`, `split`, `merge`. `WorkflowEdge = Edge` (xyflow); `Edge.label?: ReactNode` (a string is valid). `WorkflowNode = Node<WorkflowNodeData,"workflowNode">`; `WorkflowNodeData.label`, `.sublabel?`, `.nodeType`, `.params?`.
- Call sites:
  - `src/sections/shell/use-assist-runner.ts:107` calls `buildGraphFromSpec(r.spec, { label: d.cachedSignalLabel })` then `validateAiGraph(built)`.
  - `src/app/api/ai/assist/route.ts:120-155` defines the `edit_workflow` tool (`inputSchema: z.object({ ops: z.array(wireOpSchema).min(1) })`, `execute` calls `toStructuralOps`) and `rebuild_workflow` tool.

---

## Task 1 — Layout fix: `buildGraphFromSpec` uses BFS column layout

**Why first:** Cheapest change, biggest visible win. The rebuild path already emits branch edges; only the linear `x: STEP*(i+1)` placement hides them. Reusing `relayoutGraph` turns those edges into real columns/rows immediately.

**Approach:** `relayoutGraph` lives in `structural-commands.ts` and takes `{nodes, edges}`. Export it (it already is exported) and call it at the end of `buildGraphFromSpec`. Keep the initial per-node positions (they become irrelevant once relayout overwrites them, but leaving `x:0,y:0` is fine and clearer). Do NOT change edge construction — labels already flow through.

**Files:**
- Modify: `src/lib/ai/rebuild-schema.ts` (imports at top; `buildGraphFromSpec` body, lines 54-90; the linear position at line 71)
- Modify (tests): `src/lib/ai/rebuild-schema.test.ts` (add layout assertions to the `buildGraphFromSpec` describe block)

### Steps

- [ ] **1.1 Write failing test: branch nodes get distinct Y after a fork.** In `src/lib/ai/rebuild-schema.test.ts`, inside `describe("buildGraphFromSpec")`, add a branching spec and assert the two branch targets of a fork share an X column but differ in Y:
  ```ts
  const branchSpec = {
    nodes: [
      { key: "c1", nodeType: "condition" as const, label: "Открыл письмо?" },
      { key: "s1", nodeType: "success" as const, label: "Успех" },
      { key: "end1", nodeType: "end" as const, label: "Конец" },
    ],
    edges: [
      { from: "signal", to: "c1" },
      { from: "c1", to: "s1", label: "YES" },
      { from: "c1", to: "end1", label: "NO" },
    ],
    assumptions: "Условие с двумя ветками",
  };

  it("ветки условия раскладываются в одну колонку, но на разных Y (не линейно)", () => {
    const graph = buildGraphFromSpec(branchSpec, { label: "Сигнал" });
    const s1 = graph.nodes.find((n) => n.id === "n_s1")!;
    const end1 = graph.nodes.find((n) => n.id === "n_end1")!;
    expect(s1.position.x).toBe(end1.position.x); // same BFS depth → same column
    expect(s1.position.y).not.toBe(end1.position.y); // stacked, not flat
  });

  it("X растёт по глубине BFS, а не по индексу ноды в массиве", () => {
    const graph = buildGraphFromSpec(branchSpec, { label: "Сигнал" });
    const signal = graph.nodes.find((n) => n.id === "signal")!;
    const c1 = graph.nodes.find((n) => n.id === "n_c1")!;
    const s1 = graph.nodes.find((n) => n.id === "n_s1")!;
    expect(signal.position.x).toBeLessThan(c1.position.x);
    expect(c1.position.x).toBeLessThan(s1.position.x);
  });
  ```
- [ ] **1.2 Run it (expect FAIL):** `npx vitest run src/lib/ai/rebuild-schema.test.ts` — the linear layout puts `n_s1` and `n_end1` at different X (`STEP*2` vs `STEP*3`) and `n_end1` at `y:120`, so the "same X" assertion FAILS.
- [ ] **1.3 Implement: import and call `relayoutGraph`.** In `src/lib/ai/rebuild-schema.ts`:
  - Add import at top: `import { relayoutGraph } from "@/state/structural-commands";`
  - At the end of `buildGraphFromSpec`, replace `return { nodes, edges };` (line 89) with:
    ```ts
    return relayoutGraph({ nodes, edges });
    ```
  - (Optional cleanup, keep behavior identical) the per-node position at line 71 can stay; relayout overwrites it. Leave `STEP`/`position` as-is to minimize diff surface — relayout decides final coordinates.
- [ ] **1.4 Run it (expect PASS):** `npx vitest run src/lib/ai/rebuild-schema.test.ts` — all old assertions (signal first, isSuccess, edge mapping, counts) still pass because relayout preserves node identity, data, and edges; new layout assertions pass.
- [ ] **1.5 Run the AI-graph validation suite (regression):** `npx vitest run src/state/ai-graph-validation.test.ts` — the "граф из buildGraphFromSpec (шаг 3)" test must still be `ok:true` (relayout does not change topology, only positions).
- [ ] **1.6 Type-check:** `npx tsc --noEmit` (no errors).
- [ ] **1.7 Commit:** `git commit -am "feat(rebuild): BFS column layout for rebuilt graphs (branches render)"`

---

## Task 2 — Edge labels in orchestrator prompt context

**Why second:** Before the AI can edit branches, it must see them. Currently edge labels (YES/NO) are dropped at three points: `summarizeGraph`, `assistContextSchema.graph.edges`, and `buildSystemPrompt`'s edge rendering. Plumb `label` through all three.

**Files:**
- Modify: `src/lib/ai/graph-summary.ts` (the `edges` map, line 26; the return type signature, line 18)
- Modify (tests): `src/lib/ai/graph-summary.test.ts`
- Modify: `src/lib/ai/assist-contract.ts` (graph edge schema, line 29)
- Modify: `src/lib/ai/orchestrator-prompt.ts` (edge rendering, line 33)
- Modify (tests): `src/lib/ai/orchestrator-prompt.test.ts`

### Steps

- [ ] **2.1 Write failing test for `summarizeGraph` label passthrough.** In `src/lib/ai/graph-summary.test.ts`, add a labeled edge and a test. First extend the existing `edges` fixture (lines 40-47) with a labeled edge by adding a second node + edge, OR add a self-contained test:
  ```ts
  it("прокидывает label ребра (ветки YES/NO)", () => {
    const labeledGraph = {
      nodes,
      edges: [
        { id: "e1", source: "signal-1", target: "push-1", type: "default", label: "YES" } as WorkflowEdge,
      ],
    };
    const summary = summarizeGraph(labeledGraph);
    expect(summary.edges[0].label).toBe("YES");
  });

  it("не добавляет label, если его нет на ребре", () => {
    const summary = summarizeGraph(graph); // graph fixture has unlabeled edge
    expect("label" in summary.edges[0]).toBe(false);
  });
  ```
- [ ] **2.2 Run it (expect FAIL):** `npx vitest run src/lib/ai/graph-summary.test.ts` — `summary.edges[0].label` is `undefined` (current map drops it).
- [ ] **2.3 Implement label in `summarizeGraph`.** In `src/lib/ai/graph-summary.ts`:
  - Update the return type signature (line 18) to:
    ```ts
    ): { nodes: GraphNodeSummary[]; edges: Array<{ from: string; to: string; label?: string }> } {
    ```
  - Update the edges map (line 26). `e.label` is `ReactNode`; only forward it when it is a non-empty string (privacy/cleanliness — avoid leaking React elements):
    ```ts
    edges: graph.edges.map((e) => ({
      from: e.source,
      to: e.target,
      ...(typeof e.label === "string" && e.label ? { label: e.label } : {}),
    })),
    ```
- [ ] **2.4 Run it (expect PASS):** `npx vitest run src/lib/ai/graph-summary.test.ts` — labeled edge carries `label: "YES"`, unlabeled edge omits the key (the existing "JSON не содержит params" test is unaffected).
- [ ] **2.5 Commit:** `git commit -am "feat(graph-summary): forward edge labels (branch YES/NO) into summary"`

- [ ] **2.6 Extend `assistContextSchema` edge schema to allow `label`.** In `src/lib/ai/assist-contract.ts`, line 29, change:
  ```ts
  edges: z.array(z.object({ from: z.string(), to: z.string() })),
  ```
  to:
  ```ts
  edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })),
  ```
  (No new test file for the schema alone — it is exercised by the prompt test below; `assist-contract` has no dedicated test file.)
- [ ] **2.7 Type-check:** `npx tsc --noEmit` — confirms `summarizeGraph`'s new return type is assignable to `assistContextSchema.graph` at the call site.

- [ ] **2.8 Write failing test: prompt renders edge label.** In `src/lib/ai/orchestrator-prompt.test.ts`, inside `describe("buildSystemPrompt")`, add:
  ```ts
  it("рендерит метки рёбер (ветки) в контексте графа", () => {
    const p = buildSystemPrompt({
      screen: "workflow",
      dataSummary: "",
      graph: {
        nodes: [
          { id: "signal", label: "Сигнал", nodeType: "signal" },
          { id: "c1", label: "Открыл?", nodeType: "condition" },
          { id: "ok", label: "Успех", nodeType: "success" },
          { id: "no", label: "Конец", nodeType: "end" },
        ],
        edges: [
          { from: "signal", to: "c1" },
          { from: "c1", to: "ok", label: "YES" },
          { from: "c1", to: "no", label: "NO" },
        ],
      },
    });
    expect(p).toContain("c1 →[YES] ok");
    expect(p).toContain("c1 →[NO] no");
    expect(p).toContain("signal → c1"); // unlabeled edge stays clean
  });
  ```
- [ ] **2.9 Run it (expect FAIL):** `npx vitest run src/lib/ai/orchestrator-prompt.test.ts` — current rendering produces `c1 → ok` with no `[YES]`.
- [ ] **2.10 Implement label rendering in `buildSystemPrompt`.** In `src/lib/ai/orchestrator-prompt.ts`, replace the edge render line (line 33):
  ```ts
  context.graph.edges.map((e) => `${e.from} → ${e.to}`).join("; "),
  ```
  with:
  ```ts
  context.graph.edges
    .map((e) => (e.label ? `${e.from} →[${e.label}] ${e.to}` : `${e.from} → ${e.to}`))
    .join("; "),
  ```
- [ ] **2.11 Run it (expect PASS):** `npx vitest run src/lib/ai/orchestrator-prompt.test.ts` — labeled edges render `→[YES]`; the existing "с graph включает label ноды и рёбра" test (`signal → n1`) still passes (unlabeled path unchanged).
- [ ] **2.12 Type-check:** `npx tsc --noEmit`.
- [ ] **2.13 Commit:** `git commit -am "feat(prompt): show edge labels (branches) in graph context"`

---

## Task 3 — Branch-aware edit operation: `add_condition` (condition + two labeled branches)

**Why third / last:** Depends on layout (Task 1) to render the result and on the model seeing branches (Task 2) to use it well. This adds a NEW operation that inserts a `condition` node and immediately creates exactly two labeled outgoing edges (YES/NO), satisfying `validateAiGraph`'s `condition-degree` rule (exactly 2 outgoing) in one atomic op — instead of the model needing multiple flat `add`/manual-edge steps it cannot express.

**Design decision (resolved fork):** The spec offers two options — (a) "add a condition + two branches" op, or (b) "target a specific outgoing edge by label". Option (a) is chosen as primary because it is the smallest self-contained unit that produces a *valid* branch (a lone condition with <2 outgoing edges is invalid per `condition-degree`), and because the existing `between`/`after` placement modes already let the model position the condition. Option (b) (label-targeted edge ops) is deferred — it is only meaningful once branches exist, and re-routing an existing branch can be done today by `remove`+`add_condition`. Note in the op description that re-routing existing branches is out of scope for this op.

**Semantics of `add_condition`:** Insert a new `condition` node *after* a reference node `ref` (the condition takes over `ref`'s former outgoing edges as its trunk), then attach two NEW terminal-ish targets. To keep the op atomic and always-valid, the two branches each get their OWN new placeholder target node (default `end`), labeled `yesLabel` / `noLabel` (default "YES"/"NO"). The user/model can later `replace` those placeholders. This guarantees exactly-2 outgoing from the condition.

Concretely, applying `add_condition` with `ref = X`:
1. Create condition node `C` (label via `uniqueLabel(nodes, "condition")`, params from `defaultParamsFor("condition")`).
2. Re-point every edge `X → t` to `C → t`? — NO. To avoid degree explosion, instead: insert `C` *after* `X` like the existing `after` mode (X → C, and C inherits X's old outgoing), THEN add two fresh branch leaves. That would give C more than 2 outgoing. To keep degree==2, simpler rule: `C` is inserted on the single edge between `ref` and its first successor (like `between` with the first outgoing), and the TWO branches are: branch-1 = the existing successor (kept), branch-2 = a new `end` leaf. This yields exactly 2 outgoing from C.

**Final atomic rule (deterministic, always condition-degree==2):**
- Require `ref` to resolve to a node with **exactly one** outgoing edge `ref → succ` (the common case: a linear node). If `ref` has 0 or >1 outgoing edges, return an error (`«ref» — для условия нужна нода с одним выходом`).
- Create condition `C`. Rewire `ref → succ` into `ref → C`. Add two outgoing edges from `C`: `C →[yesLabel] succ` (keeps the existing flow as the YES branch) and `C →[noLabel] L` where `L` is a new `end` leaf node. Result: `C` has exactly 2 outgoing. `validateAiGraph` passes.

**Files:**
- Modify: `src/state/structural-commands.ts`
  - `StructuralOp` union (line 15) — add `addCondition` variant.
  - new private `applyAddCondition(graph, op)` (place near `applyAdd`, after line 563).
  - `applyOps` switch (line 765) — add `case "addCondition"`.
- Modify (tests): `src/state/structural-commands.test.ts` (CREATE if absent — see step 3.1)
- Modify: `src/lib/ai-workflow-schema.ts` — add `addCondition` to `structuralOpSchema` (keeps the `_check` type-compat assertion compiling).
- Modify: `src/lib/ai/ops-wire-schema.ts` — extend `wireOpSchema.kind` enum + new optional fields (`yesLabel`, `noLabel`), and `toStructuralOp` mapping.
- Modify (tests): `src/lib/ai/ops-wire-schema.test.ts` (CREATE if absent — see step 3.9)
- Modify: `src/app/api/ai/assist/route.ts` — extend the `edit_workflow` tool description to mention `add_condition` (no schema change there: it already uses `wireOpSchema`).

### Steps

- [ ] **3.1 Locate/seed the structural-commands test file.** Run: `ls src/state/structural-commands.test.ts 2>/dev/null || echo MISSING`. If MISSING, create `src/state/structural-commands.test.ts` with header:
  ```ts
  import { describe, expect, it } from "vitest";
  import { applyOps, relayoutGraph } from "./structural-commands";
  import { validateAiGraph } from "./ai-graph-validation";
  import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

  function node(id: string, nodeType: string, label = id): WorkflowNode {
    return { id, type: "workflowNode", position: { x: 0, y: 0 },
      data: { label, nodeType: nodeType as WorkflowNode["data"]["nodeType"] } };
  }
  function edge(source: string, target: string, label?: string): WorkflowEdge {
    return { id: `${source}-${target}`, source, target, type: "default",
      ...(label ? { label } : {}) };
  }
  // Linear graph: signal → sms → success, plus end leaf.
  function linear(): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
    return {
      nodes: [node("signal", "signal"), node("sms", "sms"), node("ok", "success"), node("end", "end")],
      edges: [edge("signal", "sms"), edge("sms", "ok")],
    };
  }
  ```
- [ ] **3.2 Write failing test: `addCondition` inserts a condition with exactly two labeled branches and stays valid.** Append to `src/state/structural-commands.test.ts`:
  ```ts
  describe("applyOps — addCondition", () => {
    it("вставляет condition после ref с двумя ветками YES/NO", () => {
      const g = linear();
      const res = applyOps(g, [{ kind: "addCondition", ref: "sms", yesLabel: "Открыл", noLabel: "Не открыл" }]);
      expect(res.skipped).toHaveLength(0);
      const cond = res.graph.nodes.find((n) => n.data.nodeType === "condition")!;
      expect(cond).toBeDefined();
      const outgoing = res.graph.edges.filter((e) => e.source === cond.id);
      expect(outgoing).toHaveLength(2);
      const labels = outgoing.map((e) => e.label).sort();
      expect(labels).toEqual(["Не открыл", "Открыл"]);
      // ref now points at the condition
      const sms = res.graph.nodes.find((n) => n.id === "sms")!;
      expect(res.graph.edges.some((e) => e.source === "sms" && e.target === cond.id)).toBe(true);
      // YES branch keeps the old successor (success); NO branch is a fresh end leaf
      const yes = outgoing.find((e) => e.label === "Открыл")!;
      expect(yes.target).toBe("ok");
    });

    it("результирующий граф проходит validateAiGraph (condition-degree==2)", () => {
      const g = linear();
      const res = applyOps(g, [{ kind: "addCondition", ref: "sms" }]);
      expect(validateAiGraph(res.graph).ok).toBe(true);
    });

    it("дефолтные метки YES/NO когда не заданы", () => {
      const res = applyOps(linear(), [{ kind: "addCondition", ref: "sms" }]);
      const cond = res.graph.nodes.find((n) => n.data.nodeType === "condition")!;
      const labels = res.graph.edges.filter((e) => e.source === cond.id).map((e) => e.label).sort();
      expect(labels).toEqual(["NO", "YES"]);
    });

    it("ошибка, если ref не имеет ровно одного выхода", () => {
      // success has 0 outgoing
      const res = applyOps(linear(), [{ kind: "addCondition", ref: "ok" }]);
      expect(res.skipped).toHaveLength(1);
      expect(res.applied).toHaveLength(0);
    });

    it("ошибка, если ref не найден", () => {
      const res = applyOps(linear(), [{ kind: "addCondition", ref: "нетакой" }]);
      expect(res.skipped).toHaveLength(1);
    });
  });
  ```
- [ ] **3.3 Run it (expect FAIL):** `npx vitest run src/state/structural-commands.test.ts` — `addCondition` is not a valid `StructuralOp` kind; TypeScript+runtime both reject it (the `applyOps` switch has no case, so it falls through to no-op / type error).
- [ ] **3.4 Implement: extend `StructuralOp` union.** In `src/state/structural-commands.ts`, add to the `StructuralOp` union (after the `replace` member, around line 28):
  ```ts
  | {
      kind: "addCondition";
      ref: string;
      yesLabel?: string;
      noLabel?: string;
    };
  ```
- [ ] **3.5 Implement: `applyAddCondition` reducer.** In `src/state/structural-commands.ts`, add after `applyAdd`/`describePlacement` (after line 576). Reuse `findNodeByRef`, `uniqueLabel`, `defaultParamsFor`, `nanoId`, `TYPE_LABEL`:
  ```ts
  function applyAddCondition(
    graph: GraphState,
    op: Extract<StructuralOp, { kind: "addCondition" }>
  ): { graph: GraphState; description: string } | { error: string } {
    const ref = findNodeByRef(graph.nodes, op.ref);
    if (!ref) return { error: `«${op.ref}» — нет такой ноды` };
    const outgoing = graph.edges.filter((e) => e.source === ref.id);
    if (outgoing.length !== 1) {
      return { error: `«${op.ref}» — для условия нужна нода с одним выходом` };
    }
    const succEdge = outgoing[0];
    const yesLabel = op.yesLabel ?? "YES";
    const noLabel = op.noLabel ?? "NO";

    // Condition node + a fresh end-leaf for the NO branch.
    const condId = `n_${nanoId()}`;
    const leafId = `n_${nanoId()}`;
    const condNode: WorkflowNode = {
      id: condId,
      type: "workflowNode",
      position: { x: 0, y: 0 },
      data: {
        label: uniqueLabel(graph.nodes, "condition"),
        nodeType: "condition",
        ...(defaultParamsFor("condition") ? { params: defaultParamsFor("condition") } : {}),
        needsAttention: true,
        attentionReason: "Настройте условие ветвления",
      } as WorkflowNode["data"],
    };
    const leafNode: WorkflowNode = {
      id: leafId,
      type: "workflowNode",
      position: { x: 0, y: 0 },
      data: {
        label: uniqueLabel([...graph.nodes, condNode], "end"),
        nodeType: "end",
        ...(defaultParamsFor("end") ? { params: defaultParamsFor("end") } : {}),
      } as WorkflowNode["data"],
    };

    const nodes = [...graph.nodes, condNode, leafNode];
    // Rewire ref → succ into ref → condition; condition → succ (YES) and condition → leaf (NO).
    const edges: WorkflowEdge[] = [
      ...graph.edges.filter((e) => e.id !== succEdge.id),
      { id: `e_${nanoId()}`, source: ref.id, target: condId, type: "default" },
      { id: `e_${nanoId()}`, source: condId, target: succEdge.target, type: "default", label: yesLabel },
      { id: `e_${nanoId()}`, source: condId, target: leafId, type: "default", label: noLabel },
    ];

    return {
      graph: { nodes, edges },
      description: `Добавил ${TYPE_LABEL.condition} после ${op.ref} (${yesLabel}/${noLabel})`,
    };
  }
  ```
- [ ] **3.6 Implement: wire `addCondition` into `applyOps`.** In `src/state/structural-commands.ts`, add a case in the `applyOps` switch (after the `replace` case, around line 778):
  ```ts
  case "addCondition":
    result = applyAddCondition(g, op);
    break;
  ```
- [ ] **3.7 Run it (expect PASS):** `npx vitest run src/state/structural-commands.test.ts` — condition has exactly 2 labeled outgoing; `validateAiGraph` ok; default labels YES/NO; error paths skip. (Note: `applyOps` runs `relayoutGraph` at the end since something applied — positions get recomputed, harmless to these topology assertions.)
- [ ] **3.8 Type-check + lint:** `npx tsc --noEmit` and `npm run lint` — the new union member must be exhaustively handled (it is, in `applyOps`). Commit: `git commit -am "feat(structural): addCondition op — condition with two labeled branches"`

- [ ] **3.9 Locate/seed the ops-wire-schema test file.** Run: `ls src/lib/ai/ops-wire-schema.test.ts 2>/dev/null || echo MISSING`. If MISSING, create it:
  ```ts
  import { describe, expect, it } from "vitest";
  import { toStructuralOp, toStructuralOps } from "./ops-wire-schema";
  ```
- [ ] **3.10 Write failing test: wire `addCondition` maps to strict op.** Append to `src/lib/ai/ops-wire-schema.test.ts`:
  ```ts
  describe("toStructuralOp — addCondition", () => {
    it("маппит wire addCondition с ref и метками", () => {
      const op = toStructuralOp({ kind: "addCondition", ref: "n2", yesLabel: "Открыл", noLabel: "Нет" });
      expect(op).toEqual({ kind: "addCondition", ref: "n2", yesLabel: "Открыл", noLabel: "Нет" });
    });
    it("addCondition без ref → null (невалидно)", () => {
      expect(toStructuralOp({ kind: "addCondition" })).toBeNull();
    });
    it("addCondition без меток → ref только", () => {
      const op = toStructuralOp({ kind: "addCondition", ref: "n2" });
      expect(op).toEqual({ kind: "addCondition", ref: "n2" });
    });
    it("toStructuralOps отбрасывает невалидный addCondition", () => {
      expect(toStructuralOps([{ kind: "addCondition" }])).toHaveLength(0);
    });
  });
  ```
- [ ] **3.11 Run it (expect FAIL):** `npx vitest run src/lib/ai/ops-wire-schema.test.ts` — `"addCondition"` is not in `wireOpSchema.kind` enum and `toStructuralOp` has no branch for it (returns the `add` fallback / null incorrectly).
- [ ] **3.12 Implement: extend `wireOpSchema` + `toStructuralOp`.** In `src/lib/ai/ops-wire-schema.ts`:
  - Add `"addCondition"` to the `kind` enum (line 12):
    ```ts
    kind: z.enum(["add", "remove", "replace", "addCondition"]),
    ```
  - Add two optional fields to `wireOpSchema` (after `inlineParams`, before the closing `})`, ~line 37):
    ```ts
    yesLabel: z
      .string()
      .optional()
      .describe("Для addCondition: метка ветки ДА (default YES)"),
    noLabel: z
      .string()
      .optional()
      .describe("Для addCondition: метка ветки НЕТ (default NO)"),
    ```
  - In `toStructuralOp`, add a branch BEFORE the `// add` section (after the `replace` block, ~line 55):
    ```ts
    if (w.kind === "addCondition") {
      return w.ref
        ? {
            kind: "addCondition",
            ref: w.ref,
            ...(w.yesLabel ? { yesLabel: w.yesLabel } : {}),
            ...(w.noLabel ? { noLabel: w.noLabel } : {}),
          }
        : null;
    }
    ```
- [ ] **3.13 Run it (expect PASS):** `npx vitest run src/lib/ai/ops-wire-schema.test.ts`.
- [ ] **3.14 Commit:** `git commit -am "feat(ops-wire): addCondition wire op → strict StructuralOp"`

- [ ] **3.15 Write failing test: zod `structuralOpSchema` accepts `addCondition`.** Locate the schema test: `ls src/lib/ai-workflow-schema.test.ts`. Add to it:
  ```ts
  it("structuralOpSchema принимает addCondition", () => {
    const r = structuralOpSchema.safeParse({ kind: "addCondition", ref: "n2", yesLabel: "Да", noLabel: "Нет" });
    expect(r.success).toBe(true);
  });
  it("addCondition без ref отклоняется", () => {
    const r = structuralOpSchema.safeParse({ kind: "addCondition" });
    expect(r.success).toBe(false);
  });
  ```
  (If `structuralOpSchema` is not already imported in that test file, add `import { structuralOpSchema } from "./ai-workflow-schema";` — check the existing imports first.)
- [ ] **3.16 Run it (expect FAIL):** `npx vitest run src/lib/ai-workflow-schema.test.ts` — `addCondition` is not a member of the discriminated union.
- [ ] **3.17 Implement: add `addCondition` to `structuralOpSchema`.** In `src/lib/ai-workflow-schema.ts`, add a member to the `structuralOpSchema` union (after the `replace` member, ~line 78):
  ```ts
  // Добавить условие с двумя помеченными ветками
  z.object({
    kind: z.literal("addCondition"),
    ref: z.string(),
    yesLabel: z.string().optional(),
    noLabel: z.string().optional(),
  }),
  ```
- [ ] **3.18 Run it (expect PASS) + type-check.** `npx vitest run src/lib/ai-workflow-schema.test.ts`. Critically run `npx tsc --noEmit` — the `_check: StructuralOp[]` assertion (line 95) confirms the zod mirror now matches the `StructuralOp` union from step 3.4; if it errors, the two definitions diverged — reconcile field-by-field.
- [ ] **3.19 Commit:** `git commit -am "feat(ai-schema): mirror addCondition in structuralOpSchema (type-compat)"`

- [ ] **3.20 Extend the `edit_workflow` tool description (prompt guidance).** In `src/app/api/ai/assist/route.ts`, in the `edit_workflow` tool `description` (lines 121-132), append a sentence about the new op (no schema change — `wireOpSchema` already updated). Add to the description string:
  ```ts
  " Для ветвления (условие YES/NO) используй op kind:\"addCondition\" с ref — это нода с ОДНИМ выходом, после которой вставится Условие: текущий поток станет веткой YES, и добавится ветка NO (по умолчанию в Конец). Метки веток можно задать через yesLabel/noLabel. " +
  'Пример: «после первой СМС развилку: открыл — успех, нет — стоп» → ops: [{"kind":"addCondition","ref":"n4","yesLabel":"Открыл","noLabel":"Не открыл"}].'
  ```
  (This is a string-literal append inside the existing `description:` concatenation — keep the `+` chaining intact.)
- [ ] **3.21 Verify nothing else broke at the route level:** `npx tsc --noEmit` (route imports `toStructuralOps`/`wireOpSchema`; both updated). There is no route unit test; the type-check is the gate.
- [ ] **3.22 Run the FULL suite:** `npm test` — confirm Task 1/2/3 tests plus all pre-existing tests (`ai-graph-validation`, `workflow-validation`, `graph-summary`, `orchestrator-prompt`, `rebuild-schema`, `ai-workflow-schema`) pass.
- [ ] **3.23 Lint:** `npm run lint`.
- [ ] **3.24 Commit:** `git commit -am "feat(route): document addCondition branch op in edit_workflow"`

---

## Final verification (do before declaring done)

- [ ] `npm test` — all green.
- [ ] `npx tsc --noEmit` — no type errors (esp. the `_check` assertion in `ai-workflow-schema.ts`).
- [ ] `npm run lint` — clean.
- [ ] Manual sanity (optional, dev server on `-p 3001` if main checkout is busy): prompt "пересобери: открыл письмо — успех, иначе стоп" → graph renders with a visible YES/NO fork (Task 1 layout + Task 3 op).

---

## Spec-requirement coverage check

- "Починить layout rebuild — заменить линейную раскладку на BFS (relayoutGraph)" → **Task 1**.
- "Метки рёбер (YES/NO) в контекст промпта" → **Task 2** (graph-summary + assist-contract + orchestrator-prompt).
- "Расширить edit_workflow/StructuralOp ветка-осведомлённой операцией (condition + две ветки)" → **Task 3** (StructuralOp + wire schema + zod mirror + reducer + tool description).
- "AI видит существующие ветки" → **Task 2** (edge labels surfaced).
- Branch op produces a *valid* graph (`condition-degree==2`) → enforced by `applyAddCondition` design and asserted in step 3.2.

Deferred (called out, not in scope): label-targeted edge re-routing op (spec's alt option b) — re-routing an existing branch is achievable via `remove` + `addCondition`; primary op covers the "make a branch" intent.

---

## Shared-file coordination note (for Plan #6 implementer)

Two shared files. Exact regions THIS plan touches:

- **`src/lib/ai/rebuild-schema.ts`**
  - Task 1.3: adds an import line at the top (`import { relayoutGraph } from "@/state/structural-commands";`) and changes ONLY the final `return` of `buildGraphFromSpec` (was line 89) to `return relayoutGraph({ nodes, edges });`.
  - Does **NOT** touch `defaultParams` (lines 31-46) — that is Plan #6's channel-default region. No conflict expected; if #6 also edits the top import block, merge both imports.

- **`src/state/structural-commands.ts`**
  - Task 3.4: adds a new member to the `StructuralOp` union (around lines 15-28).
  - Task 3.5: adds a NEW function `applyAddCondition` (inserted after `applyAdd`/`describePlacement`, ~after line 576) — net-new code, no edit to existing functions.
  - Task 3.6: adds one `case "addCondition":` to the `applyOps` switch (~line 778).
  - Does **NOT** touch `defaultParamsFor` (lines 330-366) — that is Plan #6's channel-default region. No overlap with the dedup #6 plans to do there.

Net: #6's channel-default work (`defaultParams` in rebuild-schema, `defaultParamsFor` in structural-commands) and this plan's layout/branch work occupy disjoint regions of both shared files. The only file where both add top-of-file content is the `rebuild-schema.ts` import block — trivially mergeable.
