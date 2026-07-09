# Spec A — Graph backend (merge cleanup, Statistics node, sublabels) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Spec A (items 12a/12b/12c) on the campaign graph backend: (12a) fully remove the dead `merge` node type and all its wiring; (12b) add a single, param‑less `statistics` terminal sink that every `success`/`end` fans into and whose click opens the campaign statistics screen; (12c) formalize node titles/sublabels — content‑derived sublabels via one mapper, plus the renames `condition→Взаимодействие`, `split→Ветвление`, `ivr→IVR`. A also exports the shared contract `isDeletableNodeType` (deletion gating) and `splitSummary` (split summary) that Spec B consumes.

**Architecture:** The node model is a discriminated union `NodeParams` keyed by `kind`, mirrored by `WorkflowNodeType`. Many *exhaustive* maps key off these (`NODE_CATEGORY`, `NODE_STYLES`, `TYPE_LABEL`, `NODE_ACTIONS`, `NODE_FIELD_EDITABILITY`, `PARAM_RENDERERS`, plus exhaustive `switch`es and the `PARAMS_KINDS`/`nodeTypeSchema` mirrors). Adding/removing a `kind` therefore breaks every exhaustive map at once — so each type change and all its map updates land as **one coherent commit** to keep `tsc` at a clean boundary. Templates are pure builders (`workflow-templates.ts` + `channel-nodes.ts`); the statistics sink is appended by a single post‑processor `withStatisticsSink` inside `createTemplate` (fan‑in, one node per graph). Sublabels are static `data.sublabel` strings rendered by the (B‑owned) node component, so A makes them content‑derived by running a new `computeSublabels` pass (using `computeNodeSublabel`) everywhere `computeNeedsAttention` already runs.

**Tech Stack:** Next.js 16, TypeScript (strict, exhaustive discriminated unions), Tailwind v4, lucide‑react icons, motion v12, Zod (AI schemas), Vitest + @testing-library/react. Test runner: `npx vitest run <path>` (single), `npm test` (all), `npx tsc --noEmit` (types), `npm run lint`.

---

## ⚠️ Known cross‑spec compile state (read before starting)

`src/sections/campaigns/node-card-content.tsx` is **owned by Spec B**. Its `PARAM_RENDERERS` is a mapped type `{ [K in NodeParams["kind"]]: … }` containing `merge: () => []`. The moment Task 1 adds `statistics` to `NodeParams`, and again when Task 5 removes `merge`, this B‑owned file will report exhaustive‑map `tsc` errors:

- `error TS2741: Property 'statistics' is missing …` (after Task 1)
- `'merge' does not exist in type …` / excess property (after Task 5)

**These errors are the intended forcing function for Spec B** (per the workflow overview: "B на ребейзе увидит ошибку exhaustive‑типа и уберёт строку `merge: () => []`, добавит `statistics: () => []`"). **Do NOT edit `node-card-content.tsx` in Spec A.** From Task 1 onward, every `npx tsc --noEmit` in this plan is "green" when the **only** remaining errors are these two in `node-card-content.tsx`; all A‑owned files must compile clean. When B rebases, the single two‑line edit it owns is: drop `merge: () => []`, add `statistics: () => []`. Runtime (`npm test`) is unaffected — vitest transpiles without full typechecking, and no test renders an expanded `statistics` card (statistics clicks route to `goto_stats`, never expanding).

---

## Task 0 — Worktree preflight (per repo AGENTS.md)

- [ ] From the **repo root** create the worktree off the active branch and install:
  ```bash
  git worktree add .worktrees/spec-a -b feature/spec-a-graph-backend integration && cd .worktrees/spec-a && npm install
  ```
- [ ] Verify the base is clean and level with `integration` (run inside `.worktrees/spec-a`):
  ```bash
  git status --short                        # expect: no output (clean)
  git merge --ff-only integration           # expect: "Already up to date." (non-destructive)
  git rev-list --count HEAD..integration    # MUST print 0
  ```
  **STOP and report if the count is not 0 or the merge fails** — do not work on a stale base. (`git reset --hard` is blocked here; use `git merge --ff-only`.)
- [ ] Baseline the suite so later diffs are attributable:
  ```bash
  npx tsc --noEmit          # expect: clean (no errors)
  npm test                  # expect: all green
  ```

---

## File Structure

**Modified (A‑owned):**
- `src/types/workflow.ts` — add `statistics` to `WorkflowNodeType`, `StatisticsParams`, `NodeParams`, `NODE_CATEGORY`; remove `merge`/`MergeParams` (shared A/C — A owns the `merge`/`statistics` region).
- `src/sections/campaigns/node-visuals.ts` — `NODE_STYLES` + `NODE_ICON` for `statistics`; drop `merge` + `Merge` import.
- `src/state/node-actions.ts` — `NODE_ACTIONS`: add `statistics: []`, drop `merge: []`.
- `src/state/node-field-editability.ts` — `NODE_FIELD_EDITABILITY`: add `statistics: {}`, drop `merge: {}`.
- `src/state/workflow-validation.ts` — `nodeNeedsAttention`: add `case "statistics"`, drop `case "merge"`.
- `src/state/structural-commands.ts` — `TYPE_LABEL` (`statistics`; rename `condition`/`split`/`ivr`; drop `merge`); new `isDeletableNodeType`; `applyRemove` guard uses it; drop `merge` synonyms.
- `src/state/workflow-templates.ts` — new `withStatisticsSink` + wire into `createTemplate`; title renames; strip arbitrary template sublabels.
- `src/state/channel-nodes.ts` — title renames (`Сплиттер→Ветвление`, `Условие→Взаимодействие`, ivr node title `→IVR`); `merge` comments cleanup.
- `src/state/split-segments.ts` — new export `splitSummary`.
- `src/sections/campaigns/workflow-view.tsx` — `fallbackParamsPatch` case updates; replace `computeDynamicSublabel` with `computeNodeSublabel` + `computeSublabels` wiring (shared A/C — A owns the sublabel/`fallbackParamsPatch` region).
- `src/sections/campaigns/workflow-section.tsx` — `handleNodeClick`: `statistics` → `goto_stats` branch.
- `src/lib/ai-workflow-schema.ts` — drop `"merge"` from `nodeTypeSchema`.
- `src/lib/ai/rebuild-schema.ts` — doc comment: `statistics` deliberately excluded (auto terminal, template‑only).
- `src/state/suggestion-registry/node-context.ts` — drop `MERGE`/`merge: MERGE`; comment cleanup.
- `src/lib/ai/afina-knowledge.ts` — drop «слияние» from the graph prose.

**Created:**
- `src/state/node-sublabel.ts` — `computeNodeSublabel(params)` + `computeSublabels(nodes)` (12c).
- `src/state/node-sublabel.test.ts` — unit tests for the sublabel mapper.

**Modified tests:**
- `src/state/suggestion-registry/registry.test.ts` — `PARAMS_KINDS`/`NODE_FIXTURE`: +`statistics`, −`merge`.
- `src/state/node-field-editability.test.ts` — expected keys: +`statistics`, −`merge`.
- `src/state/workflow-validation.test.ts` — +statistics never‑flag test, −merge never‑flag test.
- `src/sections/campaigns/campaign-cost.test.ts` — `merge` fixtures → `statistics`; delete the merge‑only reach test.
- `src/state/workflow-templates.test.ts` — `allowed` set +`statistics`; new statistics‑sink tests.
- `src/state/structural-commands.test.ts` — `isDeletableNodeType` + scoring/statistics remove‑guard tests.
- `src/state/split-segments.test.ts` — `splitSummary` tests.

**NOT edited by A (documented above):** `src/sections/campaigns/node-card-content.tsx` (B‑owned; forced compile edit is B's on rebase).

---

# TASKS

The order realizes the required sequence: **(a) add `statistics`** → **(b) remove `merge`** → **(c) sublabels/titles**. `tsc` stays clean at every commit except the two documented B‑owned `node-card-content.tsx` errors that begin at Task 1.

---

## Task 1 — Add the `statistics` node type + every exhaustive map (12b, part 1)

Adding one `kind` breaks all exhaustive maps and the two runtime assertion tests simultaneously, so this is **one coherent commit**. Implement all edits, then run `tsc` + targeted tests together (the compiler *is* the failing test here — if any map is forgotten, `tsc` names the exact missing key).

### 1.1 Type model — `src/types/workflow.ts`

- [ ] Add `| "statistics"` under the Endpoints group of `WorkflowNodeType` (after `end`):
  ```ts
  export type WorkflowNodeType =
    // Endpoints
    | "signal"
    | "source"
    | "scoring"
    | "success"
    | "end"
    | "statistics"   // terminal sink — all success/end fan into it; click → goto_stats (12b)
    // Logic / Flow
    | "split"
    | "wait"
    | "condition"
    | "merge"
    // … unchanged …
  ```
- [ ] Add the param type next to `MergeParams` (line ~84):
  ```ts
  export type MergeParams = { kind: "merge" };

  /** Terminal statistics sink — no params (footprint symmetric to the removed merge). */
  export type StatisticsParams = { kind: "statistics" };
  ```
- [ ] Add `StatisticsParams` to the `NodeParams` union:
  ```ts
  export type NodeParams =
    | SmsParams | EmailParams | PushParams | IvrParams
    | WaitParams | ConditionParams | SplitParams | MergeParams
    | SignalParams | ScoringParams | SuccessParams | EndParams
    | StatisticsParams;
  ```
- [ ] Add the `NODE_CATEGORY` entry (exhaustive `Record<WorkflowNodeType, NodeCategory>`), grouped with the other endpoints:
  ```ts
  export const NODE_CATEGORY: Record<WorkflowNodeType, NodeCategory> = {
    signal: "endpoint",
    source: "endpoint",
    scoring: "endpoint",
    success: "endpoint",
    end: "endpoint",
    statistics: "endpoint",
    split: "logic",
    // … unchanged …
  ```

### 1.2 Visuals — `src/sections/campaigns/node-visuals.ts`

- [ ] Add `BarChart3` to the lucide import (keep `Merge` for now — removed in Task 5):
  ```ts
  import {
    SignalLow, Database, Gauge, GitFork, Clock, GitBranch, Merge,
    MessageSquare, Mail, Bell, Phone, CheckCircle2, CircleStop,
    BarChart3,
    type LucideIcon,
  } from "lucide-react";
  ```
  > If the installed lucide‑react (`^1.7.0`) has renamed `BarChart3`, use its modern alias `ChartNoAxesColumn`, or fall back to `Activity` — the first `tsc`/build run flags a missing export immediately.
- [ ] Add the `statistics` style to `NODE_STYLES` (warm neutral, never a yellow fill — per PRODUCT.md), next to `end`:
  ```ts
    success:    { border: "#14532d", bg: "#030d06", color: "#4ade80" },
    end:        { border: "#374151", bg: "#0a0a0a", color: "#9ca3af" },
    statistics: { border: "#44403c", bg: "#0c0b0a", color: "#a8a29e" },
  ```
- [ ] Add the icon to `NODE_ICON`:
  ```ts
    success: CheckCircle2,
    end: CircleStop,
    statistics: BarChart3,
  ```

### 1.3 Actions & editability

- [ ] `src/state/node-actions.ts` — add to `NODE_ACTIONS` (exhaustive `ActionsForAll`), next to `merge: []`:
  ```ts
    merge: [],
    statistics: [],
    scoring: [],
  ```
- [ ] `src/state/node-field-editability.ts` — add to `NODE_FIELD_EDITABILITY` (exhaustive `Record<NodeParams["kind"], …>`), next to `merge: {}`:
  ```ts
    merge: {},
    statistics: {},
  ```

### 1.4 Validation — `src/state/workflow-validation.ts`

- [ ] Add `case "statistics"` to the "never needs attention" group in `nodeNeedsAttention`:
  ```ts
      // No required human field — auto/structural:
      case "wait":
      case "condition":
      case "split":
      case "merge":
      case "end":
      case "signal":
      case "scoring":
      case "statistics":
        return false;
  ```

### 1.5 Fallback patch — `src/sections/campaigns/workflow-view.tsx`

- [ ] Add `case "statistics"` to the no‑editable‑params group of `fallbackParamsPatch`:
  ```ts
      case "merge":
      case "signal":
      case "scoring":
      case "statistics":
        return null;
  ```

### 1.6 TYPE_LABEL — `src/state/structural-commands.ts`

- [ ] Add `statistics` to `TYPE_LABEL` (exhaustive `Record<WorkflowNodeType, string>`), next to `end`:
  ```ts
    success: "Успех",
    end: "Конец",
    statistics: "Статистика",
  ```

### 1.7 Update the two runtime‑assertion tests

- [ ] `src/state/suggestion-registry/registry.test.ts` — add `statistics` to the exhaustive `PARAMS_KINDS` (satisfies `NodeParams["kind"]`) and to `NODE_FIXTURE`:
  ```ts
  const NODE_FIXTURE: Array<{ nodeType: WorkflowNodeType; params: string[] }> = [
    // … unchanged …
    { nodeType: "merge", params: [] },
    { nodeType: "statistics", params: [] },
  ];

  const PARAMS_KINDS = [
    "sms", "email", "push", "ivr", "wait", "condition", "split",
    "merge", "statistics", "scoring", "signal", "success", "end",
  ] as const satisfies ReadonlyArray<NodeParams["kind"]>;
  ```
- [ ] `src/state/node-field-editability.test.ts` — add `"statistics"` to the expected key list (line ~10):
  ```ts
      expect(kinds).toEqual(
        [
          "condition", "email", "end", "ivr", "merge", "scoring",
          "push", "signal", "split", "sms", "success", "wait", "statistics",
        ].sort()
      );
  ```
- [ ] `src/state/workflow-validation.test.ts` — add a statistics never‑flag test right after the merge one (the merge test is deleted in Task 5):
  ```ts
    it("never flags the statistics terminal", () => {
      expect(nodeNeedsAttention(paramNode("stat", { kind: "statistics" }))).toBe(false);
    });
  ```

### 1.8 Verify & commit

- [ ] Types — the only permitted errors are the documented B‑owned ones:
  ```bash
  npx tsc --noEmit
  ```
  Expected: errors **only** in `src/sections/campaigns/node-card-content.tsx` (`Property 'statistics' is missing`). Every A‑owned file compiles. If `tsc` names any A‑owned map (e.g. `NODE_CATEGORY`, `NODE_STYLES`, `TYPE_LABEL`, `NODE_FIELD_EDITABILITY`, `NODE_ACTIONS`) as missing `statistics`, add it there.
- [ ] Targeted + full suite:
  ```bash
  npx vitest run src/state/suggestion-registry/registry.test.ts src/state/node-field-editability.test.ts src/state/workflow-validation.test.ts
  npm test
  ```
  Expected: all green (statistics is inert in existing graphs; `NODE_ICON.statistics`/`NODE_STYLES.statistics` covered by generic lookups).
- [ ] Commit:
  ```bash
  git add src/types/workflow.ts src/sections/campaigns/node-visuals.ts src/state/node-actions.ts src/state/node-field-editability.ts src/state/workflow-validation.ts src/sections/campaigns/workflow-view.tsx src/state/structural-commands.ts src/state/suggestion-registry/registry.test.ts src/state/node-field-editability.test.ts src/state/workflow-validation.test.ts && git commit -m "$(cat <<'EOF'
feat(graph): add param-less `statistics` terminal node type

Add `statistics` to WorkflowNodeType/NodeParams and every exhaustive map
(NODE_CATEGORY, NODE_STYLES, NODE_ICON, NODE_ACTIONS, NODE_FIELD_EDITABILITY,
TYPE_LABEL, fallbackParamsPatch, nodeNeedsAttention). No behaviour yet — the
sink wiring, deletion guard and click routing follow. node-card-content.tsx
(Spec B) now shows the intended exhaustive-map error for B to resolve on rebase.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 2 — Deletion contract: `isDeletableNodeType` + `applyRemove` guard (contract for B, 12b)

TDD — new exported behavior. `src/state/structural-commands.ts`.

### 2.1 Failing tests — `src/state/structural-commands.test.ts`

- [ ] Add the import and two describes (append near the other `applyOps` describes):
  ```ts
  import {
    parseStructuralCommands,
    applyOps,
    isDeletableNodeType,   // ← add to the existing import block
  } from "./structural-commands";

  describe("isDeletableNodeType (deletion contract for spec B)", () => {
    it("marks channel/logic nodes deletable", () => {
      for (const t of ["sms", "email", "push", "ivr", "wait", "split", "condition"] as const) {
        expect(isDeletableNodeType(t)).toBe(true);
      }
    });
    it("marks entry/terminal nodes non-deletable", () => {
      for (const t of ["source", "signal", "scoring", "success", "end", "statistics"] as const) {
        expect(isDeletableNodeType(t)).toBe(false);
      }
    });
  });

  describe("applyOps — remove guard covers scoring and statistics", () => {
    function graphWith(node: WorkflowNode): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
      const success: WorkflowNode = {
        id: "success", type: "workflowNode", position: { x: 200, y: 0 },
        data: { label: "Успех", nodeType: "success", isSuccess: true, params: { kind: "success", goal: "x" } },
      };
      return { nodes: [node, success], edges: [{ id: "e", source: node.id, target: "success", type: "default" }] };
    }
    it("refuses to remove the scoring node (entry point)", () => {
      const g = graphWith({
        id: "sc", type: "workflowNode", position: { x: 0, y: 0 },
        data: { label: "Скоринг", nodeType: "scoring", params: { kind: "scoring", interests: [], triggers: [], files: [] } },
      });
      const r = applyOps(g, [{ kind: "remove", ref: "sc" }]);
      expect(r.applied).toHaveLength(0);
      expect(r.skipped[0].reason).toContain("точка входа");
    });
    it("refuses to remove the statistics terminal", () => {
      const g = graphWith({
        id: "stat", type: "workflowNode", position: { x: 0, y: 0 },
        data: { label: "Статистика", nodeType: "statistics", params: { kind: "statistics" } },
      });
      const r = applyOps(g, [{ kind: "remove", ref: "stat" }]);
      expect(r.applied).toHaveLength(0);
      expect(r.skipped[0].reason).toContain("финальная нода");
    });
  });
  ```
- [ ] Run to see the compile/runtime failure:
  ```bash
  npx vitest run src/state/structural-commands.test.ts
  ```
  Expected: fails — `isDeletableNodeType` is not exported (and scoring/statistics currently pass through `applyRemove`).

### 2.2 Implementation — `src/state/structural-commands.ts`

- [ ] Add the exported predicate above `applyRemove` (single source of "what is deletable"; the deletable set is the complement of the entry/terminal nodes):
  ```ts
  /** Единый источник «какие типы узлов можно удалять» (контракт для спеки B —
   *  видимость кнопки-корзины). Удаляемы: sms/email/push/ivr/wait/split/condition.
   *  Неудаляемы: source/signal (вход), scoring, success/end/statistics (терминалы). */
  const DELETABLE_NODE_TYPES: ReadonlySet<WorkflowNodeType> = new Set([
    "sms", "email", "push", "ivr", "wait", "split", "condition",
  ]);

  export function isDeletableNodeType(type: WorkflowNodeType): boolean {
    return DELETABLE_NODE_TYPES.has(type);
  }
  ```
- [ ] Replace the two ad‑hoc guards at the top of `applyRemove` with one guard driven by the same list (preserves the existing error copy the tests assert):
  ```ts
    const nodeType = (node.data as { nodeType: WorkflowNodeType }).nodeType;
    if (!isDeletableNodeType(nodeType)) {
      if (nodeType === "success" || nodeType === "end" || nodeType === "statistics") {
        return { error: `${TYPE_LABEL[nodeType]} — финальная нода, удалять нельзя` };
      }
      return { error: `Сигнал — точка входа, удалять нельзя` };
    }
  ```

### 2.3 Verify & commit

- [ ] `npx vitest run src/state/structural-commands.test.ts` → all green (existing "Сигнал"/"Успех" guard tests still pass — same messages).
- [ ] `npx tsc --noEmit` → only the documented `node-card-content.tsx` error.
- [ ] Commit:
  ```bash
  git add src/state/structural-commands.ts src/state/structural-commands.test.ts && git commit -m "$(cat <<'EOF'
feat(graph): export isDeletableNodeType and guard scoring/statistics from removal

Single source of truth for deletability (spec B imports it for the node
trash-button). applyRemove now blocks scoring + statistics too, reusing the list.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 3 — Statistics fan‑in sink in templates (12b, part 2)

TDD — one `statistics` node per built graph, fed by every `success`/`end`. `src/state/workflow-templates.ts`.

### 3.1 Failing tests — `src/state/workflow-templates.test.ts`

- [ ] Add the sink describe (place after the existing describes):
  ```ts
  describe("statistics terminal sink (12b)", () => {
    it.each(SIGNAL_TYPES)("%s: exactly one statistics node; every success/end fans into it", (type) => {
      const { nodes, edges } = createTemplate(type, "new");
      const stats = nodes.filter((n) => n.data.nodeType === "statistics");
      expect(stats).toHaveLength(1);
      const statsId = stats[0].id;
      const terminals = nodes.filter(
        (n) => n.data.nodeType === "success" || n.data.nodeType === "end",
      );
      expect(terminals.length).toBeGreaterThanOrEqual(1);
      for (const t of terminals) {
        expect(
          edges.some((e) => e.source === t.id && e.target === statsId),
          `${t.id} → statistics`,
        ).toBe(true);
      }
      // pure sink — no outgoing edges
      expect(edges.some((e) => e.source === statsId)).toBe(false);
    });

    it("channel-aware (linear) template has a single statistics sink", () => {
      const { nodes } = createTemplate("Первая сделка", "own", ["sms", "email"]);
      expect(nodes.filter((n) => n.data.nodeType === "statistics")).toHaveLength(1);
    });

    it("segmented channel template has a single statistics sink", () => {
      const { nodes } = createTemplate("Апсейл", "own", ["sms", "email"]);
      expect(nodes.filter((n) => n.data.nodeType === "statistics")).toHaveLength(1);
    });

    it("statistics node carries StatisticsParams", () => {
      const { nodes } = createTemplate("Регистрация", "new");
      const stat = nodes.find((n) => n.data.nodeType === "statistics")!;
      expect(stat.data.params).toEqual({ kind: "statistics" });
    });
  });
  ```
- [ ] Update the empty‑channels test's allowed set (currently line ~348) so the minimal graph accepts the sink:
  ```ts
      const allowed = new Set(["scoring", "signal", "success", "statistics"]);
      expect(types.every((t) => allowed.has(t))).toBe(true);
  ```
- [ ] Run to fail:
  ```bash
  npx vitest run src/state/workflow-templates.test.ts
  ```
  Expected: the new sink tests fail (no statistics node built yet).

### 3.2 Implementation — `src/state/workflow-templates.ts`

- [ ] Add the sink post‑processor above `createTemplate` (reuses the file's `n`, `e`, `STEP` helpers). Export it so it is testable and reusable:
  ```ts
  const STATISTICS_ID = "statistics";

  /**
   * 12b — appends the single terminal «Статистика» sink: every `success`/`end`
   * node fans into ONE `statistics` node (fan-in, not one-per-branch). No-op when
   * the graph has no terminal or already has a statistics node. Positioned one
   * STEP right of the rightmost node so the layout stays non-overlapping.
   */
  export function withStatisticsSink(t: Template): Template {
    if (t.nodes.some((nd) => nd.data.nodeType === "statistics")) return t;
    const terminals = t.nodes.filter(
      (nd) => nd.data.nodeType === "success" || nd.data.nodeType === "end",
    );
    if (terminals.length === 0) return t;
    const maxX = t.nodes.reduce((m, nd) => Math.max(m, nd.position.x), 0);
    const statsNode = n(
      STATISTICS_ID, "Статистика", "statistics", maxX + STEP, 0,
      undefined, undefined, { kind: "statistics" },
    );
    const statsEdges = terminals.map((term) => e(term.id, STATISTICS_ID));
    return { nodes: [...t.nodes, statsNode], edges: [...t.edges, ...statsEdges] };
  }
  ```
- [ ] Wire it into `createTemplate` — wrap the existing return:
  ```ts
    // was: return withSignalPath(base, sourceType);
    return withStatisticsSink(withSignalPath(base, sourceType));
  ```

### 3.3 Document the rebuild exclusion — `src/lib/ai/rebuild-schema.ts`

- [ ] Extend the enum comment (no functional change — the enum already omits both `merge` and `statistics`; the AI never authors the terminal, and `buildGraphFromSpec` deliberately does **not** append the sink so `rebuild-schema.test.ts`'s exact node/edge counts stay valid):
  ```ts
  /** Типы, доступные модели при пересборке. Без legacy и без signal —
   *  сигнальную ноду билдер всегда ставит сам первой. `statistics` тоже
   *  исключён намеренно: терминал-сток «Статистика» добавляется автоматически
   *  на уровне генерации шаблонов (withStatisticsSink), не через ИИ. */
  export const rebuildNodeTypeSchema = z.enum([
    "sms", "email", "push", "ivr", "wait", "condition", "split",
    "success", "end",
  ]);
  ```

### 3.4 Verify & commit

- [ ] `npx vitest run src/state/workflow-templates.test.ts` → green.
- [ ] Full suite (catches any graph‑consumer regression — cost/consistency tests treat `statistics` as a non‑communication pass‑through, so they stay green):
  ```bash
  npm test
  ```
- [ ] `npx tsc --noEmit` → only the documented `node-card-content.tsx` error.
- [ ] Commit:
  ```bash
  git add src/state/workflow-templates.ts src/state/workflow-templates.test.ts src/lib/ai/rebuild-schema.ts && git commit -m "$(cat <<'EOF'
feat(graph): fan every success/end into a single statistics sink node

withStatisticsSink appends one terminal «Статистика» per built graph (all
templates + channel builders). Documents why AI rebuild excludes it.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 4 — Statistics click opens the campaign stats screen (12b, part 3)

`src/sections/campaigns/workflow-section.tsx`. This is dispatch wiring on top of the existing `goto_stats` reducer (unchanged; already covered by `app-state.test.ts`), so it is verified by `tsc` + full suite + a manual check rather than a heavyweight component test.

### 4.1 Implementation

- [ ] In `handleNodeClick` (currently line ~121), branch on `statistics` before selecting the node. `currentCampaignIdRef` is assigned to the live campaign id in the render body (line ~283) before any click can fire, and it is a ref so no dependency change is needed:
  ```ts
    const handleNodeClick = useCallback(
      (id: string, label: string, nodeType?: string) => {
        // 12b — «Статистика» — терминал-сток: клик открывает экран статистики
        // кампании (goto_stats), а не раскрывает карточку ноды.
        if (nodeType === "statistics") {
          dispatch({
            type: "goto_stats",
            campaignId: currentCampaignIdRef.current ?? undefined,
          });
          return;
        }
        dispatch({ type: "workflow_node_selected", id, label, nodeType });
      },
      [dispatch],
    );
  ```

### 4.2 Verify & commit

- [ ] `npx tsc --noEmit` → only the documented `node-card-content.tsx` error.
- [ ] `npm test` → green (no test asserts the old select‑only behavior; the `goto_stats` reducer test is unchanged).
- [ ] Manual smoke (optional, but recommended — do NOT hold port 3000 if another worktree owns it; use `-p 3001`): open a campaign workflow, click the «Статистика» node → the statistics section opens and the node card does **not** expand.
- [ ] Commit:
  ```bash
  git add src/sections/campaigns/workflow-section.tsx && git commit -m "$(cat <<'EOF'
feat(graph): clicking the statistics node opens the campaign stats screen

handleNodeClick routes nodeType==="statistics" to goto_stats(currentCampaignId)
instead of selecting/expanding the node card.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 5 — Remove the `merge` node type and all wiring (12a)

One coherent commit: dropping `merge` from `WorkflowNodeType`/`NodeParams` breaks every exhaustive map, `switch`, and the `nodeTypeSchema` mirror — all fixed together. Also updates the four breaking tests and the user‑facing AI prose.

### 5.1 Type model — `src/types/workflow.ts`

- [ ] Delete `| "merge"` from `WorkflowNodeType` (the Logic group).
- [ ] Delete `export type MergeParams = { kind: "merge" };`.
- [ ] Remove `MergeParams` from the `NodeParams` union (line ~131 becomes `| WaitParams | ConditionParams | SplitParams` — no `MergeParams`).
- [ ] Delete `merge: "logic",` from `NODE_CATEGORY`.

### 5.2 Exhaustive maps & switches

- [ ] `src/sections/campaigns/node-visuals.ts` — remove `Merge` from the lucide import; delete `merge: { … }` from `NODE_STYLES`; delete `merge: Merge,` from `NODE_ICON`.
- [ ] `src/state/node-actions.ts` — delete `merge: [],` from `NODE_ACTIONS`.
- [ ] `src/state/node-field-editability.ts` — delete `merge: {},` from `NODE_FIELD_EDITABILITY`.
- [ ] `src/state/workflow-validation.ts` — delete `case "merge":` from `nodeNeedsAttention` (and drop `merge,` from the doc comment on line ~4).
- [ ] `src/sections/campaigns/workflow-view.tsx` — delete `case "merge":` from `fallbackParamsPatch` (the group becomes `case "signal": case "scoring": case "statistics": return null;`); drop the stray `(merge, signal)` mention in the comment above `fallbackParamsPatch`.
- [ ] `src/state/structural-commands.ts` — delete `merge: "Слияние",` from `TYPE_LABEL`; delete the two `слияние`/`merge` entries from `REF_SYNONYMS`:
  ```ts
    // remove:
    слияние: "слияние",
    merge: "слияние",
  ```

### 5.3 AI schema mirror — `src/lib/ai-workflow-schema.ts`

- [ ] Delete `"merge",` from `nodeTypeSchema`. **Required for `tsc`:** while `merge` stays in `nodeTypeSchema` but not in `WorkflowNodeType`, the `_check: StructuralOp[] = ({} as WorkflowOpsResult).ops;` assertion at the bottom of the file fails (`"merge"` no longer assignable to `WorkflowNodeType`).

### 5.4 Suggestion registry — `src/state/suggestion-registry/node-context.ts`

- [ ] Delete the entire `const MERGE: ParamSuggestions = { … }` block (the `howNode("merge-how", …)`, `ask("merge-node-dedup", …)`, `ask("merge-node-priority", …)`).
- [ ] Delete `merge: MERGE,` from `CATALOG` (a `statistics` entry is unnecessary — it falls through to `GENERIC`).
- [ ] Update the file header comment (line ~6): drop `merge,` from the covered‑types list.

### 5.5 User‑facing AI prose — `src/lib/ai/afina-knowledge.ts`

- [ ] Line ~24 — remove «слияние» from the graph description so the assistant stops describing a node that no longer exists:
  ```ts
  // was: … → логические узлы (задержка, условие-ветвление, сплиттер, слияние) → …
  // now: … → логические узлы (задержка, условие-ветвление, сплиттер) → …
  ```

### 5.6 The four breaking tests

- [ ] `src/state/workflow-validation.test.ts` — delete the merge never‑flag test (the statistics one from Task 1 remains):
  ```ts
  // delete:
  it("never flags structural nodes (merge)", () => {
    expect(nodeNeedsAttention(paramNode("m", { kind: "merge" }))).toBe(false);
  });
  ```
- [ ] `src/state/node-field-editability.test.ts` — remove `"merge"` from the expected key list (line ~10) so it reads `"condition", "email", "end", "ivr", "scoring", "push", "signal", "split", "sms", "success", "wait", "statistics"`.
- [ ] `src/state/suggestion-registry/registry.test.ts` — remove `{ nodeType: "merge", params: [] }` from `NODE_FIXTURE` and `"merge"` from `PARAMS_KINDS` (statistics from Task 1 remains).
- [ ] `src/sections/campaigns/campaign-cost.test.ts` — retype the two `merge` fixtures to the pass‑through `statistics` terminal and delete the merge‑only reach test:
  - In the "applies DYNAMIC_RATE to each branch…" test (line ~89): `node("landing", "merge", { kind: "merge" })` → `node("landing", "statistics", { kind: "statistics" })`. (`statistics` is non‑communication, so `dynamic.landing`/`reach.landing` assertions are unchanged.)
  - In `firstDealGraph` (line ~209): `node("landing", "merge", { kind: "merge" })` → `node("landing", "statistics", { kind: "statistics" })`. The "landing … excluded" line (~234) still holds — `statistics` is not a communication node.
  - Delete the whole `it("sums incoming reach at a merge node", …)` test (lines ~180‑197).

### 5.7 Verify & commit

- [ ] Confirm no live `merge` references remain (neutral `twMerge`/`Object.assign(merged,…)`/comments are fine):
  ```bash
  rg -n '"merge"|MergeParams|merge-how|merge-node|: MERGE|слияние|Слияние' src/ | rg -v 'twMerge|mergeProps|const merged|Object.assign\(merged'
  ```
  Expected: no hits pointing at a `merge` node (the "Слияние удалено" comments in templates/`channel-nodes.ts` are historical and may stay).
- [ ] Types:
  ```bash
  npx tsc --noEmit
  ```
  Expected: the **only** errors are in `node-card-content.tsx` — now two of them (missing `statistics`, excess `merge`). All A‑owned files clean.
- [ ] Tests:
  ```bash
  npx vitest run src/state/workflow-validation.test.ts src/state/node-field-editability.test.ts src/state/suggestion-registry/registry.test.ts src/sections/campaigns/campaign-cost.test.ts
  npm test
  ```
  Expected: all green. (`channel-nodes.test.ts` and `workflow-templates.test.ts` already assert *absence* of merge — they stay green.)
- [ ] Commit:
  ```bash
  git add src/types/workflow.ts src/sections/campaigns/node-visuals.ts src/state/node-actions.ts src/state/node-field-editability.ts src/state/workflow-validation.ts src/sections/campaigns/workflow-view.tsx src/state/structural-commands.ts src/lib/ai-workflow-schema.ts src/state/suggestion-registry/node-context.ts src/lib/ai/afina-knowledge.ts src/state/workflow-validation.test.ts src/state/node-field-editability.test.ts src/state/suggestion-registry/registry.test.ts src/sections/campaigns/campaign-cost.test.ts && git commit -m "$(cat <<'EOF'
refactor(graph): remove the dead `merge` node type and all wiring (12a)

Drops merge from WorkflowNodeType/NodeParams and every exhaustive map, the AI
op schema, the suggestion catalog and the assistant knowledge prose. Updates the
four tests that constructed merge nodes. node-card-content.tsx (Spec B) now shows
both expected exhaustive-map errors for B to resolve on rebase.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 6 — `splitSummary` shared helper (12c, contract for B)

TDD — new export from `src/state/split-segments.ts` (the single source of the split summary; Spec B's `split-fields.tsx` will import it, not duplicate it).

### 6.1 Failing tests — `src/state/split-segments.test.ts`

- [ ] Append:
  ```ts
  import { splitSegmentBranches, splitSummary } from "./split-segments";

  describe("splitSummary", () => {
    it("summarises an equal split", () => {
      expect(splitSummary({ kind: "split", by: "equal", branches: 2 })).toBe("Поровну · 2 ветки");
    });
    it("summarises a segment split", () => {
      expect(splitSummary({ kind: "split", by: "segment", branches: 4 })).toBe("По сегменту · 4 ветки");
    });
    it("summarises a random split with correct plural", () => {
      expect(splitSummary({ kind: "split", by: "random", branches: 5 })).toBe("Рандомно · 5 веток");
    });
  });
  ```
  (Update the existing `import { splitSegmentBranches } …` line to the combined import above.)
- [ ] Run to fail:
  ```bash
  npx vitest run src/state/split-segments.test.ts
  ```
  Expected: fails — `splitSummary` is not exported.

### 6.2 Implementation — `src/state/split-segments.ts`

- [ ] Add imports at the top (the module currently imports nothing; there is no cycle — `workflow.ts` does not import `split-segments`):
  ```ts
  import type { SplitParams } from "@/types/workflow";
  import { pluralRu } from "@/lib/plural-ru";
  ```
- [ ] Append the helper:
  ```ts
  /**
   * 12c — единый источник сводки сплиттера: «<режим> · N веток». Импортируется
   * подзаголовком ноды (computeNodeSublabel) и полями сплиттера в спеке B —
   * логику не дублировать.
   */
  export function splitSummary(params: SplitParams): string {
    const by =
      params.by === "segment" ? "По сегменту"
      : params.by === "random" ? "Рандомно"
      : "Поровну";
    const n = params.branches;
    return `${by} · ${n} ${pluralRu(n, ["ветка", "ветки", "веток"])}`;
  }
  ```

### 6.3 Verify & commit

- [ ] `npx vitest run src/state/split-segments.test.ts` → green.
- [ ] `npx tsc --noEmit` → only the two documented `node-card-content.tsx` errors.
- [ ] Commit:
  ```bash
  git add src/state/split-segments.ts src/state/split-segments.test.ts && git commit -m "$(cat <<'EOF'
feat(graph): add splitSummary helper (single source of split summary, 12c)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 7 — Content‑derived sublabel mapper (12c, core)

TDD — new module `src/state/node-sublabel.ts` with the full per‑type mapper (the 12c table) and a `computeSublabels` node pass. Placed in `state/` (not inline in `workflow-view.tsx`) so it is unit‑testable. Its `switch` is exhaustive over `NodeParams` — valid now that `merge` is gone and `statistics` exists.

### 7.1 Failing test — `src/state/node-sublabel.test.ts` (new)

- [ ] Create:
  ```ts
  import { describe, it, expect } from "vitest";
  import { computeNodeSublabel } from "./node-sublabel";

  describe("computeNodeSublabel", () => {
    it("wait → duration / until-event", () => {
      expect(computeNodeSublabel({ kind: "wait", mode: "duration", durationHours: 24 })).toBe("1 день");
      expect(computeNodeSublabel({ kind: "wait", mode: "duration", durationHours: 72 })).toBe("3 дня");
      expect(computeNodeSublabel({ kind: "wait", mode: "duration", durationHours: 2 })).toBe("2 ч");
      expect(computeNodeSublabel({ kind: "wait", mode: "until_event", untilEvent: "клик" })).toBe("До: клик");
    });
    it("condition → interaction label", () => {
      expect(computeNodeSublabel({ kind: "condition", trigger: "opened" })).toBe("Открыто");
      expect(computeNodeSublabel({ kind: "condition", trigger: "clicked" })).toBe("Кликнуто");
      expect(computeNodeSublabel({ kind: "condition", trigger: "delivered" })).toBe("Доставлено");
    });
    it("split → splitSummary", () => {
      expect(computeNodeSublabel({ kind: "split", by: "segment", branches: 4 })).toBe("По сегменту · 4 ветки");
    });
    it("ivr → scenario, success → goal, end → reason", () => {
      expect(computeNodeSublabel({ kind: "ivr", scenario: "Возврат", voiceType: "female" })).toBe("Возврат");
      expect(computeNodeSublabel({ kind: "success", goal: "Активация" })).toBe("Активация");
      expect(computeNodeSublabel({ kind: "end", reason: "Молчание" })).toBe("Молчание");
    });
    it("scoring → N interests · M triggers", () => {
      expect(
        computeNodeSublabel({ kind: "scoring", interests: ["a", "b"], triggers: ["t"], files: [] }),
      ).toBe("2 интереса · 1 триггер");
    });
    it("sms/push → «—», statistics → placeholder", () => {
      expect(computeNodeSublabel({ kind: "sms", text: "hi", alphaName: "A", scheduledAt: "immediate" })).toBe("—");
      expect(computeNodeSublabel({ kind: "push", title: "T", body: "B" })).toBe("—");
      expect(computeNodeSublabel({ kind: "statistics" })).toBe("Результаты после запуска");
    });
  });
  ```
- [ ] Run to fail:
  ```bash
  npx vitest run src/state/node-sublabel.test.ts
  ```
  Expected: fails — module does not exist.

### 7.2 Implementation — `src/state/node-sublabel.ts` (new)

- [ ] Create:
  ```ts
  import type { NodeParams, WorkflowNode } from "@/types/workflow";
  import { splitSummary } from "./split-segments";
  import { pluralRu } from "@/lib/plural-ru";

  /** «Открыто»/«Кликнуто»/«Доставлено» из события-триггера condition (12c). */
  function conditionTriggerLabel(t: string): string {
    switch (t) {
      case "delivered": return "Доставлено";
      case "not_delivered": return "Не доставлено";
      case "opened": return "Открыто";
      case "not_opened": return "Не открыто";
      case "clicked": return "Кликнуто";
      case "not_clicked": return "Не кликнуто";
      default: return t;
    }
  }

  function waitSublabel(p: Extract<NodeParams, { kind: "wait" }>): string {
    if (p.mode === "until_event") return p.untilEvent ? `До: ${p.untilEvent}` : "До события";
    const h = p.durationHours ?? 0;
    if (h < 1) return `${Math.round(h * 60)} мин`;
    if (h < 24) return `${h} ч`;
    const days = Math.round(h / 24);
    return `${days} ${pluralRu(days, ["день", "дня", "дней"])}`;
  }

  /**
   * 12c — единый маппер тип→подзаголовок, выводит подзаголовок из контента узла.
   * Возвращает null для типов без содержательного подзаголовка (легаси-ноды
   * попадают сюда только без params и отсеиваются в computeSublabels).
   */
  export function computeNodeSublabel(params: NodeParams): string | null {
    switch (params.kind) {
      case "wait": return waitSublabel(params);
      case "condition": return conditionTriggerLabel(params.trigger);
      case "split": return splitSummary(params);
      case "ivr": return params.scenario || "—";
      case "success": return params.goal || "—";
      case "end": return params.reason || "—";
      case "scoring": {
        const i = params.interests.length;
        const t = params.triggers.length;
        return `${i} ${pluralRu(i, ["интерес", "интереса", "интересов"])}`
          + ` · ${t} ${pluralRu(t, ["триггер", "триггера", "триггеров"])}`;
      }
      case "signal": {
        const name = params.fileName?.trim() || "Готовая аудитория";
        return params.count > 0 ? `${name} · ${params.count.toLocaleString("ru-RU")}` : name;
      }
      case "email": return params.emailId ? params.emailId : "—";
      case "sms":
      case "push": return "—";
      case "statistics": return "Результаты после запуска";
    }
  }

  /** Пересчитывает data.sublabel из params для каждой ноды (стабильная
   *  идентичность: возвращает ту же ссылку, когда подзаголовок не изменился). */
  export function computeSublabels<N extends WorkflowNode>(nodes: N[]): N[] {
    return nodes.map((n) => {
      if (!n.data.params) return n;
      const next = computeNodeSublabel(n.data.params);
      if (next === null || n.data.sublabel === next) return n;
      return { ...n, data: { ...n.data, sublabel: next } };
    });
  }
  ```

### 7.3 Verify & commit

- [ ] `npx vitest run src/state/node-sublabel.test.ts` → green.
- [ ] `npx tsc --noEmit` → only the two documented `node-card-content.tsx` errors.
- [ ] Commit:
  ```bash
  git add src/state/node-sublabel.ts src/state/node-sublabel.test.ts && git commit -m "$(cat <<'EOF'
feat(graph): add computeNodeSublabel/computeSublabels content-derived mapper (12c)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 8 — Node title renames: condition→Взаимодействие, split→Ветвление, ivr→IVR (12c)

Pure label edits. No test asserts these node titles (verified against `structural-commands.test.ts`, `workflow-templates.test.ts`, `channel-nodes.test.ts`), and the two shared `CHANNEL_LABEL` constants (channel‑nodes.ts and campaign‑cost.ts, both `ivr: "Звонок"`, used by cost + `use-template-flow`) stay unchanged.

### 8.1 `src/state/structural-commands.ts` — `TYPE_LABEL`

- [ ] Rename three entries (drives AI add/replace/fan‑out node titles):
  ```ts
    condition: "Взаимодействие",
    // …
    ivr: "IVR",
    // and:
    split: "Ветвление",
  ```

### 8.2 `src/state/workflow-templates.ts` — legacy template node titles

- [ ] Rename the `label` argument (2nd arg of `n(...)`) at these creation points:
  - `firstDealTemplate`: `n("condition", "Условие", …)` → `n("condition", "Взаимодействие", …)`.
  - `upsellTemplate`: `n("split", "Сплиттер", …)` → `n("split", "Ветвление", …)`.
  - `reactivationTemplate`: `n("condition", "Условие", …)` → `"Взаимодействие"`; `n("ivr", "Звонок", …)` → `n("ivr", "IVR", …)`.
  - `returnTemplate`: `n("condition", "Условие", …)` → `"Взаимодействие"`.
  - `retentionTemplate`: `n("split", "Сплиттер", …)` → `"Ветвление"`; `n("ivr", "Звонок", …)` → `n("ivr", "IVR", …)`.
  - `buildSegmentedChannelTemplate`: `n(splitId, "Сплиттер", …)` → `n(splitId, "Ветвление", …)`.

### 8.3 `src/state/channel-nodes.ts` — channel builder node titles

- [ ] `buildChannelBlock` split node: `makeNode(splitId, "Сплиттер", "split", …)` → `makeNode(splitId, "Ветвление", "split", …)`.
- [ ] `buildCommUnit` both conditions: `makeNode(cond1Id, "Условие", …)` and `makeNode(cond2Id, "Условие", …)` → `"Взаимодействие"`.
- [ ] `CHANNEL_NODE_MAP.ivr` node title decoupled from the channel name (`CHANNEL_LABEL.ivr` stays "Звонок" for cost/attention copy):
  ```ts
    ivr:   { label: "IVR", defaultParams: channelDefaultParams("ivr"), color: CHANNEL_COLORS.ivr },
  ```

### 8.4 Verify & commit

- [ ] `npx tsc --noEmit` → only the two documented `node-card-content.tsx` errors.
- [ ] `npm test` → green (label renames touch no assertions; `CHANNEL_LABEL`/cost tests unaffected).
- [ ] Commit:
  ```bash
  git add src/state/structural-commands.ts src/state/workflow-templates.ts src/state/channel-nodes.ts && git commit -m "$(cat <<'EOF'
feat(graph): rename node titles condition→Взаимодействие, split→Ветвление, ivr→IVR (12c)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 9 — Wire content‑derived sublabels + strip arbitrary template sublabels (12c)

Replace the old inline `computeDynamicSublabel` (patch‑based) with the new mapper, run `computeSublabels` wherever `computeNeedsAttention` already runs, and drop arbitrary literal sublabels from templates so no rendered node shows a template‑authored sublabel.

### 9.1 `src/sections/campaigns/workflow-view.tsx`

- [ ] Add the import (alongside `import { computeNeedsAttention } from "@/state/workflow-validation";`):
  ```ts
  import { computeSublabels } from "@/state/node-sublabel";
  ```
- [ ] **Delete** the entire local `function computeDynamicSublabel(kind, patch) { … }` (lines ~85‑119).
- [ ] Simplify `deriveParamsPatch` to return only the patch (sublabels are now owned by the `computeSublabels` pass):
  ```ts
  function deriveParamsPatch(
    text: string,
    currentParams: NodeParams | undefined,
  ): { paramsPatch?: Partial<NodeParams> } {
    if (!currentParams) return {};
    const matched = matchActions(text, currentParams);
    if (matched) return { paramsPatch: matched.paramsPatch };
    const fb = fallbackParamsPatch(currentParams, text);
    if (fb) return { paramsPatch: fb };
    return {};
  }
  ```
- [ ] `initialGraph` — apply the sublabel pass after needs‑attention (order: template → `applyCampaignContext` → `computeNeedsAttention` → `computeSublabels`, so sublabels reflect the campaign‑overlaid params):
  ```ts
    return {
      ...base,
      nodes: computeSublabels(computeNeedsAttention(base.nodes)),
    };
  ```
- [ ] AI‑cycle apply (the `nodeCommand` effect, ~line 435) — drop the removed `sublabel` field and recompute sublabels after needs‑attention:
  ```ts
        const plans = nodeCommand.map(({ nodeId, text }) => {
          const currentNode = prev.nodes.find((x) => x.id === nodeId);
          const { paramsPatch } = deriveParamsPatch(text, currentNode?.data.params);
          return { nodeId, paramsPatch };
        });

        let nodes = prev.nodes;
        const changedIds = new Set<string>();
        for (const p of plans) {
          const existingDirty =
            nodes.find((n) => n.id === p.nodeId)?.data.dirtyParams ?? [];
          const dirtyParams = p.paramsPatch
            ? Array.from(new Set([...existingDirty, ...Object.keys(p.paramsPatch)]))
            : existingDirty;
          nodes = patchNode(nodes, p.nodeId, {
            attentionReason: undefined,
            ...(p.paramsPatch ? { dirtyParams } : {}),
          });
          if (p.paramsPatch) nodes = patchNodeParams(nodes, p.nodeId, p.paramsPatch);
          changedIds.add(p.nodeId);
        }
        nodes = computeNeedsAttention(nodes);
        nodes = computeSublabels(nodes);
        return { graph: { ...prev, nodes }, changedIds };
  ```
- [ ] Field‑patch effect (`nodeFieldPatch`, ~line 494) — add the pass after `computeNeedsAttention`:
  ```ts
        nodes = computeNeedsAttention(nodes);
        nodes = computeSublabels(nodes);
        return { ...prev, nodes };
  ```

### 9.2 `src/state/workflow-templates.ts` — strip arbitrary sublabels

Set the `sublabel` argument (6th positional arg of `n(...)`) to `undefined` at every node that carried an arbitrary template string, so `computeSublabels` supplies the canonical value at render. Exact replacements:

- [ ] `registrationTemplate`: `signal "Регистрация"`, `email "Welcome"`, `wait "1 день"`, `push "Напоминание"`, `success "Активирован"` → all `undefined`.
- [ ] `firstDealTemplate`: `signal "Первая сделка"`, `sms "Промо"`, `condition "Открыл?"`, `push "Напомни"`, `success "Конверсия"` → `undefined`.
- [ ] `upsellTemplate`: `signal "Апсейл"`, `split "По сегменту"`, `email "High"`, `sms "Mid"`, `end "Low"`, `success "Купил"` → `undefined`.
- [ ] `reactivationTemplate`: `signal "Реактивация"`, `wait "3 дня"`, `sms "Оффер"`, `condition "Кликнул?"`, `ivr "Голосовой"`, `success "Вернулся"` → `undefined`.
- [ ] `returnTemplate`: `signal "Возврат"`, `email "Напоминание"`, `wait "3 дня"`, `push "Усилить"`, `condition "Открыл?"`, `success "Купил"` → `undefined`.
- [ ] `retentionTemplate`: `signal "Удержание"`, `split "По сегменту"`, `ivr "Персональный"`, `email "Дайджест"`, `push "Напомни"`, `wait "7 дней"`, `success "Активен"` → `undefined`.
- [ ] `withSignalPath`: the inserted `n("scoring", "Скоринг", …, "Качество базы", …)` and `n("signal_result", "Сигнал", …, "Готовая аудитория", …)` → `undefined`.
- [ ] `buildChannelBlock` (`channel-nodes.ts`): the multi‑channel split `makeNode(splitId, "Ветвление", "split", 0, 0, "Равномерно", …)` → drop the `"Равномерно"` sublabel (`undefined`).
- [ ] `buildCommUnit` (`channel-nodes.ts`): `cond1/cond2 "Взаимодействовал?"`, `waitNode "2 дня"` → `undefined`.

> Rationale: `buildLinearChannelTemplate`/`buildSegmentedChannelTemplate`/`minimalTemplate` copy `legacySuccess.data.sublabel`/`legacyEnd.data.sublabel` from the legacy skeleton — once the legacy sublabels are stripped, the copied value is `undefined` and `computeSublabels` fills the canonical goal/reason. No extra edit needed there. `applyCampaignContext`'s own‑source file‑summary sublabel is unaffected at the unit level (that test calls it directly); in the rendered graph `computeSublabels` supersedes it with the canonical `fileName · count`, consistent with the 12c table.

### 9.3 Verify & commit

- [ ] `npx tsc --noEmit` → only the two documented `node-card-content.tsx` errors.
- [ ] Full suite (the template unit tests bypass `initialGraph`/`computeSublabels`, so they stay green; run everything to catch any component/snapshot regression):
  ```bash
  npm test
  npm run lint
  ```
- [ ] Manual smoke (optional): open a campaign workflow → node subtitles read from content (wait shows "3 дня", condition "Открыто", split "По сегменту · N веток", ivr the scenario, statistics "Результаты после запуска"); editing a field/prompt updates the subtitle live.
- [ ] Commit:
  ```bash
  git add src/sections/campaigns/workflow-view.tsx src/state/workflow-templates.ts src/state/channel-nodes.ts && git commit -m "$(cat <<'EOF'
feat(graph): derive node sublabels from content; drop arbitrary template sublabels (12c)

Replaces the patch-based computeDynamicSublabel with the computeNodeSublabel
mapper applied via a computeSublabels pass everywhere computeNeedsAttention runs.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Final verification (before reporting the branch)

- [ ] `npx tsc --noEmit` → the **only** errors are the two documented B‑owned `node-card-content.tsx` exhaustive‑map errors (missing `statistics`, excess `merge`). Every A‑owned file is clean.
- [ ] `npm test` → all green.
- [ ] `npm run lint` → clean.
- [ ] `rg -n '"merge"|MergeParams|merge-how|merge-node|: MERGE|слияние|Слияние' src/ | rg -v 'twMerge|mergeProps|const merged|Object.assign\(merged|Слияние удалено'` → no live `merge` node references.
- [ ] Report the worktree path (`.worktrees/spec-a`) and branch (`feature/spec-a-graph-backend`) to the user; cleanup is the user's call. Flag the B‑owned `node-card-content.tsx` two‑line rebase edit in the handoff.

---

## Acceptance criteria (mapped to tasks)

**12a — merge removal**
- [ ] No live references to a `merge` node (`rg` gate) — **Task 5.7**.
- [ ] `afina-knowledge.ts` no longer mentions «слияние» — **Task 5.5**.
- [ ] `npx tsc --noEmit` + `npm test` pass; the 4 breaking tests updated (campaign‑cost, workflow‑validation, registry, node‑field‑editability) — **Task 5.6/5.7** (the only `tsc` residue is the intended B‑owned `node-card-content.tsx` forcing error).

**12b — Statistics terminal**
- [ ] Every template routes all `success`/`end` into a single «Статистика» node — **Task 3** (tests assert exactly one sink + fan‑in per template, incl. channel/segmented).
- [ ] Clicking «Статистика» opens `goto_stats`; the node card does not expand — **Task 4**.
- [ ] Node is non‑deletable (`isDeletableNodeType("statistics") === false`) and guarded in `applyRemove` — **Task 2**.
- [ ] `tsc`/tests pass; `validateWorkflow` does not break on graphs with `statistics` — **Task 1** (`nodeNeedsAttention` case) + **Task 3** (template validity tests).

**12c — Title/sublabel formalization**
- [ ] Each type's sublabel matches the 12c table and updates when node content changes — **Task 7** (mapper) + **Task 9** (wired into initial build + AI/field patches).
- [ ] Titles: `condition=Взаимодействие`, `split=Ветвление`, `ivr=IVR` — **Task 8**.
- [ ] No node renders an arbitrary template sublabel — **Task 9.2** (stripped) + **Task 9.1** (`computeSublabels` supersedes at render).
- [ ] `splitSummary` is the single source of the split summary, importable by `split-fields.tsx` (Spec B) — **Task 6**.

**Exported contract for B**
- [ ] `isDeletableNodeType(type)` — **Task 2**. `splitSummary(params)` — **Task 6**. (Both land before B rebases; B imports them.)

---

## Self‑review note

- **Spec coverage:** 12a (Task 5 — removal + 4 tests + AI prose + schema mirror), 12b (Task 1 type/maps, Task 2 deletion guard, Task 3 sink, Task 4 click), 12c (Task 6 `splitSummary`, Task 7 mapper, Task 8 titles, Task 9 wiring/stripping). The B‑owned `node-card-content.tsx` renderer edit is deliberately excluded and documented as B's rebase edit; A's `NodeParams` change is precisely what forces it.
- **No placeholders:** every step shows real code grounded in the actual files (real imports, real surrounding hunks, real test patterns matching the repo's Vitest style). Every command has an expected‑output expectation, including the honest "only B‑owned errors remain" `tsc` state that is unavoidable once `NodeParams` changes.
- **Name/type consistency across tasks:** `isDeletableNodeType` (declared Task 2, used in `applyRemove` Task 2, contract for B); `splitSummary` (declared Task 6, consumed by `computeNodeSublabel` Task 7); `StatisticsParams`/`{ kind: "statistics" }` (Task 1 type, used in templates Task 3, cost tests Task 5, mapper Task 7); `NODE_ICON`/`NODE_STYLES`/`NODE_CATEGORY`/`TYPE_LABEL`/`NODE_ACTIONS`/`NODE_FIELD_EDITABILITY` keys all use the identical `statistics`/`merge` spellings across add (Task 1) and remove (Task 5); `computeNodeSublabel`/`computeSublabels` (Task 7) imported by `workflow-view.tsx` (Task 9); `withStatisticsSink` (Task 3) exported and referenced by name.
- **`tsc`‑green ordering:** each type change bundles all its exhaustive‑map updates into one commit (Task 1 add, Task 5 remove) so the compiler is satisfied at every commit boundary except the single, documented, intentional B‑owned exception. Runtime (`npm test`) is fully green at every commit.

### Critical Files for Implementation
- /Users/macintosh/Documents/work/afina-ai-first_campaing-centric/.worktrees/spec-audit/src/types/workflow.ts
- /Users/macintosh/Documents/work/afina-ai-first_campaing-centric/.worktrees/spec-audit/src/state/structural-commands.ts
- /Users/macintosh/Documents/work/afina-ai-first_campaing-centric/.worktrees/spec-audit/src/state/workflow-templates.ts
- /Users/macintosh/Documents/work/afina-ai-first_campaing-centric/.worktrees/spec-audit/src/sections/campaigns/workflow-view.tsx
- /Users/macintosh/Documents/work/afina-ai-first_campaing-centric/.worktrees/spec-audit/src/state/node-sublabel.ts