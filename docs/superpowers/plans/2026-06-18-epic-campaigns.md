# Campaign-First Migration — Wave 1 Epic: Кампании (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Follow real TDD: write the failing test, run it red, implement, run it green, commit.

**Goal:** Turn the moved wizard + campaign canvas + campaign cards into the source-type-aware campaign-first surface defined by the design spec — a 4-step wizard (source → channels → budget-forecast → scenario), per-source workflow generation, working node needs-attention/launch-gating, a fixed autosave indicator, open-campaign phase rendering (path indicator + progress + in-card stats/artifacts), and two-payment billing — all building **against the frozen Wave-0 Foundation contracts**.

**Architecture:** This epic owns ONLY presentation + epic-local logic. It builds on top of Foundation's frozen types (`Artifact`, `MessageTemplate`, `Campaign.{sourceType,channels,interests,file,dailyBudget,phase}`, `SourceType`, `Channel`, `WorkflowNodeType += source|scoring`, `start_campaign_flow`, `campaign_artifact_ready`, `AppState.artifacts`, the moved wizard under `src/sections/campaigns/wizard/`). Each task ends green (`npx tsc --noEmit` + `npx vitest run`). Sub-tracks run strictly A → B → C → D → E by one owner; the internal order inside each sub-track is the critical path.

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, React reducer state (`src/state/app-state.ts`), Vitest (`npx vitest run <path>`), motion v12 (`motion/react`), lucide-react icons.

**Source spec:** `docs/superpowers/specs/2026-06-18-campaign-first-migration-design.md` — scope = blocks 2, 3, 4, 5, 8, 9, 13 and §8 sub-tracks A–E. Read §3 (source matrix), §4 (open-campaign phases), §5 (estimator + billing), §7 (UI-fork registry — escalate, do not decide).

---

## Ownership boundary (READ FIRST)

This epic owns and may edit ONLY:
- `src/sections/campaigns/**` (including the moved `src/sections/campaigns/wizard/**`)
- `src/state/workflow-validation.ts`
- `src/data/scenarios.ts` — **only** the additive `recommendedSourceType` field (Task A0/B5)

**Frozen hub files — DO NOT EDIT** (Foundation owns them): `src/types/*` (incl. `campaign.ts`, `workflow.ts`), `src/state/app-state.ts`, `src/app/page.tsx`. If a hub change is required, it is flagged inline as a **Foundation dependency** and the tasks here are written assuming the contract already exists. Do not add it yourself; surface it to the orchestrator.

**Foundation dependencies flagged by this plan** (must exist on the integration branch before the dependent task runs):
- **FD-1 (Task A1):** `validateWorkflow` must already accept the post-Foundation graph where the entry node is `nodeType === "source"` (Task 8 of Foundation). This plan's validator rewrite keys off `"source"`, not `"signal"`.
- **FD-2 (Task A4):** a reducer action `campaign_saved_draft` exists (already referenced by `workflow-section.tsx:273` today) — confirmed present, no new action needed. No FD.
- **FD-3 (Task D2):** `Campaign.phase` field exists (Foundation Task 4) — required for the progress block. Assumed present.
- **FD-4 (Task D2/D3):** a reducer action to flip `Campaign.phase` from `"scoring"` → `"communicating"` (e.g. `campaign_phase_advanced { id }`). **NOT present today.** This is a hub change → **Foundation dependency**: request `{ type: "campaign_phase_advanced"; id: string }` that sets `phase: "communicating"`. Tasks here assume it exists; if the orchestrator declines, D3 falls back to a derived phase from `launchedAt` age (documented in D2 Step 3).
- **FD-5 (Task E):** the two-payment billing requires the reducer to accept `dailyBudget` + total cap on launch. The launch payload action `campaign_launched` currently takes `{ id, timestamp, budget }`. For stream a `dailyBudget` is needed. **Foundation dependency**: extend `campaign_launched` payload with optional `dailyBudget?: number`. Assumed present; if declined, E3 stores dailyBudget via `campaign_renamed`-style no-op and the cap-only path is used (documented in E3).

**ASK-USER UI escalations flagged by this plan** (blocking — per spec §7, do not pick a variant):
- **AU-1 (A2):** node colors + icons for `source` and `scoring` (spec §7.7). Provisional = reuse `signal` style; must confirm palette (yellow is a rare signal).
- **AU-2 (B2):** Step-1 `step-source` layout — how the three sources are shown (radio-cards? reuse `scenario-card`?), and placement of the interests block + upload block (spec §7.4).
- **AU-3 (B3):** Step-2 `step-channels` layout — channel checkboxes + «Не проводить коммуникацию» (spec §7.5).
- **AU-4 (B4):** Step-3 budget-forecast row layout — Сигналы / Коммуникация / Итого (spec §7.6).
- **AU-5 (B5):** Step-0 scenario screen — ЖЦК grouping with counts + «Показать ещё», and where/how the source-type label sits on a scenario card (spec §7.3).
- **AU-6 (D1):** the linear «путь кампании» indicator — a NEW visual pattern; plus placement of the progress / Статистика / Артефакты blocks in the open-campaign card (spec §7.8).

---

## Task 0: Isolated worktree + green baseline

**Files:** none (git only).

- [ ] **Step 1: Branch off the post-Foundation integration branch** (AGENTS.md mandates worktrees)

The Foundation (`feature/campaign-first-foundation`) must be merged into the integration branch first. From the repo root (ASCII symlink `/tmp/afina-repo`):
```bash
git worktree add .worktrees/epic-campaigns -b feature/epic-campaigns <post-foundation-integration-branch>
cd .worktrees/epic-campaigns
npm install
ln -sfn "$(pwd)" /tmp/afina-epic-campaigns   # ASCII symlink for Read/Write tools
```

- [ ] **Step 2: Confirm a green baseline and that the Foundation contracts are present**

```bash
npx tsc --noEmit && npx vitest run
git grep -n "start_campaign_flow\|campaign_artifact_ready\|artifacts:" src/state/app-state.ts
git grep -n '"source"\|"scoring"' src/types/workflow.ts
ls src/sections/campaigns/wizard/steps
```
Expected: tsc clean; vitest all-pass; the four greps confirm `start_campaign_flow`, `campaign_artifact_ready`, `AppState.artifacts`, the `source`/`scoring` node types, and the moved wizard exist. If any is missing, STOP — Foundation is not merged; this epic cannot start.

---

# SUB-TRACK A — Canvas: node-state logic, source-aware generation, autosave fix

> Order: A0 → A1 → A2 → A3 → A4. A1 (validator + needs-attention) is the structural heart; A4 (autosave) is independent and can float but is ordered last in A so the canvas changes settle first.

## Task A0: Add `recommendedSourceType` to `Scenario` (additive data field)

**Files:**
- Modify: `src/data/scenarios.ts`
- Test: `src/data/scenarios.test.ts` (create)

> Used by B5 (scenario card source-label) and B1 (estimator fallback basis). Done early because it is pure data and unblocks B.

- [ ] **Step 1: Write the failing test**

Create `src/data/scenarios.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { SCENARIOS, type SourceTypeForScenario } from "./scenarios";

describe("scenario recommendedSourceType", () => {
  it("every scenario carries a recommendedSourceType in the three-source union", () => {
    const valid: SourceTypeForScenario[] = ["new", "stream", "own"];
    for (const s of SCENARIOS) {
      expect(valid).toContain(s.recommendedSourceType);
    }
  });
});
```

- [ ] **Step 2: Run it red**

`npx vitest run src/data/scenarios.test.ts` → FAIL (field/type missing).

- [ ] **Step 3: Add the field**

In `src/data/scenarios.ts`, import the source union from the frozen contract (Foundation owns it) and add the field to the interface:
```ts
import type { SignalType } from "@/state/app-state";
import type { SourceType } from "@/types/campaign";

/** Local re-export alias for tests/readers of this module. */
export type SourceTypeForScenario = SourceType;

export interface Scenario {
  id: string;
  name: string;
  description: string;
  category: ScenarioCategory;
  signalType: SignalType;
  isBase: boolean;
  isCurated: boolean;
  /** Which audience source this scenario is best run on (spec §3 matrix). */
  recommendedSourceType: SourceType;
}
```
Populate every entry. DECISION (reuse existing data semantics, no new visual): map by category — `Привлечение`/`Онбординг` → `"new"` (cold acquisition / first-touch), `Удержание`/`Апсейл` → `"own"` (you already hold these customers), `Возврат`/`Реактивация` → `"stream"` (continuous re-engagement intent). Apply this rule to all 36 scenarios. (This is a data choice, not a visual pattern — no ASK-USER.)

- [ ] **Step 4: Run green + full data suite**

`npx vitest run src/data` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/scenarios.ts src/data/scenarios.test.ts
git commit -m "feat(scenarios): add recommendedSourceType per scenario (spec §3)"
```

---

## Task A1: Required-field detector + needs-attention computed in `validateWorkflow`; disable Запустить

This is the core gotcha fix. Today `validateWorkflow` checks `nodes.some(n => n.data.needsAttention)` but template-generated graphs NEVER set `needsAttention` (only AI structural ops do), and the «Запустить» button has no disabled state (validation runs only on click → toast). We add a per-`kind` required-field detector, compute `needsAttention` for ALL nodes inside `validateWorkflow`, and surface the result to disable the button + tooltip.

**Files:**
- Modify: `src/state/workflow-validation.ts`
- Modify: `src/sections/campaigns/workflow-section.tsx` (compute validation reactively; pass `canLaunch` + reason to header)
- Modify: `src/sections/campaigns/canvas-header.tsx` (disable «Запустить» + tooltip)
- Modify: `src/sections/campaigns/workflow-view.tsx` (replace the unconditional `needsAttention:false` clear on field edit with a recompute)
- Test: `src/state/workflow-validation.test.ts` (extend)

- [ ] **Step 1: Write the failing test for the required-field detector**

Append to `src/state/workflow-validation.test.ts`:
```ts
import { nodeNeedsAttention, computeNeedsAttention } from "./workflow-validation";
import type { WorkflowNode } from "@/types/workflow";

function node(id: string, params: WorkflowNode["data"]["params"]): WorkflowNode {
  return {
    id, type: "workflowNode", position: { x: 0, y: 0 },
    data: { label: id, nodeType: params!.kind as never, params },
  };
}

describe("nodeNeedsAttention (per-kind required fields)", () => {
  it("flags an sms node with empty text", () => {
    expect(nodeNeedsAttention(node("s", { kind: "sms", text: "", alphaName: "A", scheduledAt: "immediate" }))).toBe(true);
  });
  it("passes a filled sms node", () => {
    expect(nodeNeedsAttention(node("s", { kind: "sms", text: "Привет", alphaName: "A", scheduledAt: "immediate" }))).toBe(false);
  });
  it("flags an email node missing subject", () => {
    expect(nodeNeedsAttention(node("e", { kind: "email", subject: "", body: "b", sender: "x@y" }))).toBe(true);
  });
  it("never flags structural nodes (merge/wait/source/success)", () => {
    expect(nodeNeedsAttention(node("m", { kind: "merge" }))).toBe(false);
  });
});

describe("computeNeedsAttention", () => {
  it("returns the graph with needsAttention recomputed per node", () => {
    const nodes = [
      node("s", { kind: "sms", text: "", alphaName: "A", scheduledAt: "immediate" }),
      node("ok", { kind: "push", title: "T", body: "B" }),
    ];
    const out = computeNeedsAttention(nodes);
    expect(out.find((n) => n.id === "s")!.data.needsAttention).toBe(true);
    expect(out.find((n) => n.id === "ok")!.data.needsAttention).toBe(false);
  });
});
```

- [ ] **Step 2: Run it red**

`npx vitest run src/state/workflow-validation.test.ts` → FAIL (`nodeNeedsAttention`/`computeNeedsAttention` not exported).

- [ ] **Step 3: Implement the detector + integrate into `validateWorkflow`**

In `src/state/workflow-validation.ts` add (real shapes verified against `src/types/workflow.ts` `NodeParams`):
```ts
import type { NodeParams, WorkflowNode } from "@/types/workflow";

/** Per-kind required-field check. A node "needs attention" when a field a
 *  human must fill is empty. Structural/auto nodes (merge, wait, condition,
 *  split, source, scoring, success, end) are never flagged. */
export function nodeNeedsAttention(node: WorkflowNode): boolean {
  const p = node.data.params;
  if (!p) return false;
  switch (p.kind) {
    case "sms":     return !p.text?.trim() || !p.alphaName?.trim();
    case "email":   return !p.subject?.trim() || !p.body?.trim() || !p.sender?.trim();
    case "push":    return !p.title?.trim() || !p.body?.trim();
    case "ivr":     return !p.scenario?.trim();
    case "landing": return !p.cta?.trim() || !p.offerTitle?.trim();
    case "storefront": return !p.offers || p.offers.length === 0;
    case "success": return !p.goal?.trim();
    // No required human field — auto/structural:
    case "wait": case "condition": case "split": case "merge":
    case "end": case "signal":
      return false;
    default: return false;
  }
}

export function computeNeedsAttention<N extends WorkflowNode>(nodes: N[]): N[] {
  return nodes.map((n) =>
    n.data.needsAttention === nodeNeedsAttention(n)
      ? n
      : { ...n, data: { ...n.data, needsAttention: nodeNeedsAttention(n) } }
  );
}
```
Then change `validateWorkflow` so the `needs-attention` error is computed from the detector (not from a stale flag). Replace the existing block:
```ts
  if (graph.nodes.some((n) => nodeNeedsAttention(n))) {
    errors.push("needs-attention");
  }
```
(Note: `source` replaces `signal` as the entry node post-Foundation — **FD-1**. The validator's `entry = graph.nodes[0]?.id` BFS is index-based so it is agnostic to the entry's `nodeType`; no change needed there.)

- [ ] **Step 4: Run green**

`npx vitest run src/state/workflow-validation.test.ts` → PASS.

- [ ] **Step 5: Compute validation reactively in `workflow-section.tsx` and gate the button**

In `workflow-section.tsx`, add a memo alongside the existing `cost` memo (which already depends on `graphTick`):
```ts
import { validateWorkflow } from "@/state/workflow-validation";
// ...
const launchCheck = useMemo(() => {
  const g = graphRef.current;
  if (!g) return { ok: false as const, errors: ["no-graph"] };
  return validateWorkflow(g, Boolean(currentSignal));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [graphTick]);
```
> `currentSignal` is computed below the hooks today; move the `currentSignal` derivation above this memo (it depends only on `campaigns`/`signals`/`view`, all already destructured), or pass `Boolean(currentCampaign)` if signal binding is no longer the gate post-inversion. DECISION: post-inversion every campaign is the root, so `no-signal` is dead — pass `true` for `signalBound` and let the real gates be `needs-attention` + `no-success-path`. (Confirm `validateWorkflow`'s `no-signal` branch is unreachable; leave the error string for compatibility.)

Pass to the header:
```tsx
canLaunch={launchCheck.ok}
launchBlockReason={launchCheck.ok ? undefined : ERROR_TEXT[launchCheck.errors[0]] ?? "Не готово к запуску."}
```
Keep `handleLaunch` re-validating on click (defence in depth) — it stays as-is.

- [ ] **Step 6: Disable «Запустить» + tooltip in `canvas-header.tsx`**

Add props `canLaunch?: boolean` and `launchBlockReason?: string` to `CanvasHeaderProps`. The draft launch button (`campaign.status === "draft"`) becomes:
```tsx
{campaign.status === "draft" && (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className={cn(canLaunch ? undefined : "cursor-not-allowed")}>
        <Button onClick={onLaunch} disabled={canLaunch === false}>Запустить</Button>
      </span>
    </TooltipTrigger>
    {canLaunch === false && launchBlockReason && (
      <TooltipContent>{launchBlockReason}</TooltipContent>
    )}
  </Tooltip>
)}
```
DECISION: reuse the existing shadcn `Tooltip` (confirm `@/components/ui/tooltip` exists via `git grep -l "components/ui/tooltip"`; if absent, fall back to a native `title={launchBlockReason}` on the wrapping `span` — no new component). The disabled `Button` needs the `span` wrapper so the tooltip still fires while the button is non-interactive.

- [ ] **Step 7: Replace the unconditional needs-attention clear on field edit (`workflow-view.tsx`)**

In `workflow-view.tsx` the `nodeFieldPatch` effect (lines ~446-468) unconditionally sets `needsAttention: false`. Replace it with a recompute after the param patch lands so editing a field to empty re-flags it:
```ts
import { computeNeedsAttention } from "@/state/workflow-validation";
// inside setGraph((prev) => { ... }):
let nodes = patchNode(prev.nodes, nodeFieldPatch.nodeId, { attentionReason: undefined, dirtyParams });
nodes = patchNodeParams(nodes, nodeFieldPatch.nodeId, nodeFieldPatch.patch);
nodes = computeNeedsAttention(nodes);
return { ...prev, nodes };
```
Apply the same `computeNeedsAttention(nodes)` final pass in the `nodeCommand` effect's `apply` (it also sets `needsAttention:false` unconditionally at ~line 427) and in `initialGraph` (so template graphs start with correct flags — wrap the return of `initialGraph` with `computeNeedsAttention`). This means freshly generated templates will correctly flag any communication node with empty required fields, which is the whole point of the gate.

- [ ] **Step 8: Full check**

`npx tsc --noEmit && npx vitest run src/state/workflow-validation.test.ts src/sections/campaigns` → PASS / clean.

- [ ] **Step 9: Commit**

```bash
git add src/state/workflow-validation.ts src/sections/campaigns/workflow-section.tsx src/sections/campaigns/canvas-header.tsx src/sections/campaigns/workflow-view.tsx
git commit -m "feat(canvas): per-kind needs-attention detector + disable Запустить with reason"
```

---

## Task A2: Source/scoring node visuals (ASK-USER palette)

**Files:**
- Modify: `src/sections/campaigns/node-visuals.ts`
- Test: `src/sections/campaigns/node-visuals.test.ts` (extend)

- [ ] **Step 1: ASK USER (AU-1) — BLOCKING**

Spec §7.7: the colors + icons for the `source` and `scoring` nodes are a NEW visual decision (yellow is a rare, precise signal — must not become a node fill). **Do not pick a palette.** Surface to the user:
- `source` node: border/bg/color triple + lucide icon (candidate icon: `Database` or `Radio` for stream vs file — but the node is one type carrying `sourceType`, so one icon). 
- `scoring` node: border/bg/color triple + lucide icon (candidate: `Gauge` / `SlidersHorizontal`).
Until answered, use the PROVISIONAL value (Foundation Task 8 already added `source`/`scoring` to `NODE_STYLES` reusing the `signal` style). This task only confirms/replaces once the user answers.

- [ ] **Step 2: Write the failing test (structure only, palette-agnostic)**

Append to `node-visuals.test.ts`:
```ts
import { NODE_STYLES, NODE_ICON } from "./node-visuals";
it("source and scoring have a complete style triple", () => {
  for (const k of ["source", "scoring"] as const) {
    expect(NODE_STYLES[k]).toMatchObject({ border: expect.any(String), bg: expect.any(String), color: expect.any(String) });
  }
});
it("source and scoring have an icon", () => {
  expect(NODE_ICON.source).toBeTruthy();
  expect(NODE_ICON.scoring).toBeTruthy();
});
```

- [ ] **Step 3: Run red → implement → green**

If Foundation's provisional entries already satisfy the structural test, the test passes immediately; the ASK-USER answer then changes the concrete triple/icon (a value swap, re-run test, still green). Add the chosen lucide imports to `node-visuals.ts` and set `NODE_ICON.source` / `NODE_ICON.scoring`.

- [ ] **Step 4: Commit**

```bash
git add src/sections/campaigns/node-visuals.ts src/sections/campaigns/node-visuals.test.ts
git commit -m "feat(canvas): source/scoring node visuals (palette per user decision AU-1)"
```

---

## Task A3: Source-aware workflow generation (own = no scoring node; stream/new = source→scoring→…)

The generated graph must branch by `Campaign.sourceType` (spec §3 matrix): `new`/`stream` get a `scoring` node between the `source` entry and the first communication; `own` gets none (база загружена → коммуникация). Today `createTemplate(signalType, signal)` knows nothing about source.

**Files:**
- Modify: `src/state/workflow-templates.ts` — **BOUNDARY NOTE:** this file lives in `src/state/`, which is NOT in this epic's ownership list. **Foundation dependency / coordination:** the `createTemplate` signature change (adding `sourceType` + inserting a `scoring` node) is a contract on a shared module. Treat the signature extension as a Foundation-owned change OR confirm with the orchestrator that `workflow-templates.ts` is delegated to this epic. The tasks below are written assuming this epic may edit `workflow-templates.ts`; if not, request Foundation add the `scoring` insertion and `sourceType` param.
- Modify: `src/sections/campaigns/workflow-view.tsx` (pass `sourceType` into `initialGraph`/`createTemplate`)
- Modify: `src/sections/campaigns/workflow-section.tsx` (read `currentCampaign.sourceType`, pass down)
- Test: `src/state/workflow-templates.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```ts
import { createTemplate } from "./workflow-templates";

describe("source-aware generation", () => {
  it("own source has NO scoring node", () => {
    const g = createTemplate("Регистрация", undefined, "own");
    expect(g.nodes.some((n) => n.data.nodeType === "scoring")).toBe(false);
  });
  it("new source inserts a scoring node after source", () => {
    const g = createTemplate("Регистрация", undefined, "new");
    const idx = g.nodes.findIndex((n) => n.data.nodeType === "scoring");
    expect(idx).toBeGreaterThan(0);
  });
  it("stream source also inserts scoring", () => {
    const g = createTemplate("Регистрация", undefined, "stream");
    expect(g.nodes.some((n) => n.data.nodeType === "scoring")).toBe(true);
  });
});
```

- [ ] **Step 2: Run red**

`npx vitest run src/state/workflow-templates.test.ts` → FAIL.

- [ ] **Step 3: Implement source branching**

Extend `createTemplate(signalType, signal?, sourceType: SourceType = "new")`. After building the per-type template (entry node is `source` post-Foundation), conditionally splice a `scoring` node between the entry `source` node and its first downstream node when `sourceType !== "own"`. Representative shape (the template's entry node id is `"signal"` today — Foundation Task 8 renamed its `nodeType` to `"source"` but may keep the id; reuse the id it kept):
```ts
function withScoring(t: Template): Template {
  const entryId = t.nodes[0].id; // source entry
  const firstEdge = t.edges.find((e) => e.source === entryId);
  if (!firstEdge) return t;
  const scoringNode = n("scoring", "Скоринг", "scoring",
    t.nodes[0].position.x + STEP / 2, t.nodes[0].position.y, "Качество базы");
  // shift everything right of the entry by STEP/2 to make room, then rewire
  const shifted = t.nodes.map((nd) =>
    nd.id === entryId ? nd : { ...nd, position: { ...nd.position, x: nd.position.x + STEP / 2 } });
  const edges = t.edges
    .filter((e) => e.id !== firstEdge.id)
    .concat([e(entryId, "scoring"), e("scoring", firstEdge.target)]);
  return { nodes: [...shifted, scoringNode], edges };
}

export function createTemplate(signalType: SignalType, signal?: Signal, sourceType: SourceType = "new"): Template {
  const base = TEMPLATE_BY_TYPE[signalType]();
  const withSrc = sourceType === "own" ? base : withScoring(base);
  // ... existing patchNodeParams("signal"/entry id) for count/segments stays
}
```
The `scoring` node carries no `params` (no required field — `nodeNeedsAttention` returns false for unknown kinds), so it never blocks launch.

- [ ] **Step 4: Thread `sourceType` from the canvas**

In `workflow-section.tsx`, pass `sourceType={currentCampaign.sourceType}` into `WorkflowView`. In `workflow-view.tsx`, add `sourceType?: SourceType` to props and pass it into `initialGraph(signalType, signal, sourceType)` → `createTemplate(signalType, signal, sourceType)`. Wrap the result in `computeNeedsAttention` (from A1 Step 7).

- [ ] **Step 5: Update the cost-node lookup**

In `workflow-section.tsx` the `cost` memo looks up `n.data.nodeType === "signal"` for N. Post-Foundation the entry is `"source"`. Change the lookup to `=== "source"` and read `N` from its `params` (still `kind: "signal"` params carrying `count`, unless Foundation changed the params kind — confirm via the template's entry node params; if it stays `kind:"signal"`, the existing guard works). Update `campaign-payment-screen.tsx` similarly if it looks up by `"signal"` (it uses `createTemplate` + `signal.count`, not a node lookup — verify; likely no change).

- [ ] **Step 6: Full check + commit**

`npx tsc --noEmit && npx vitest run src/state src/sections/campaigns` → PASS.
```bash
git add src/state/workflow-templates.ts src/sections/campaigns/workflow-view.tsx src/sections/campaigns/workflow-section.tsx
git commit -m "feat(canvas): source-aware graph generation — own skips scoring, new/stream insert it"
```

---

## Task A4: Fix the broken autosave indicator

The autosave indicator in `canvas-header.tsx` is broken: for any draft it always shows «Изменения сохранены» and never reflects `saveState` (it tests `saveState` truthiness but prints a constant string). `workflow-section.tsx` already computes a real `saveState: "saved" | "unsaved"`. Wire it through and show «Сохранение…» / «Изменения сохранены».

> Note: the design (§6 block 4) says the canvas has NO «Сохранить» button (`onSave` is dead). DECISION: keep `onSave`/`handleSave` plumbing untouched for now (it's harmless and Foundation may rely on `campaign_saved_draft`), but the **indicator** becomes the real source of truth. The fix is display-only.

**Files:**
- Modify: `src/sections/campaigns/canvas-header.tsx`
- Test: none feasible at unit level (header is presentational); covered by the manual smoke in the closing handoff. Add a tiny render test only if a test harness for `CanvasHeader` already exists (`git grep -l canvas-header src --include=*.test.*`).

- [ ] **Step 1: Replace the constant string with the real state**

In `canvas-header.tsx`, the status line block (lines ~236-243) currently does:
```tsx
{!isReadOnly && campaign.status === "draft" && saveState
  ? "Изменения сохранены"
  : statusDescription(campaign)}
```
Replace with a mapping over `saveState`:
```tsx
{!isReadOnly && campaign.status === "draft" && saveState
  ? saveState === "unsaved"
    ? "Сохранение…"
    : "Изменения сохранены"
  : statusDescription(campaign)}
```
DECISION: «unsaved» (the graph signature changed since last snapshot) renders as «Сохранение…» — the autosave is implicit (no button), so an unsaved diff means a save is in flight conceptually. This matches the "магия под капотом" voice (PRODUCT.md): the user never presses save, the system just persists. (If the user prefers «Есть несохранённые изменения», that is a copy tweak, not a pattern — adjust on review.)

- [ ] **Step 2: Verify the prop type already allows it**

`saveState?: "saved" | "unsaved"` is already in `CanvasHeaderProps`. No type change.

- [ ] **Step 3: Check + commit**

`npx tsc --noEmit` → clean.
```bash
git add src/sections/campaigns/canvas-header.tsx
git commit -m "fix(canvas): autosave indicator reflects real saveState (Сохранение…/сохранено)"
```

---

# SUB-TRACK B — Wizard: 4-step source-first flow + budget estimator

> Order: B0 → B1 → B2 → B3 → B4 → B5 → B6 → B7. B0 reshapes the stepper/workspace skeleton; B1 builds the graph-less estimator (pure, testable, unblocks B4); B2–B5 are the four steps; B6 wires the new launch handoff; B7 removes the dead summary/result steps.
>
> **Path note:** all wizard files are now under `src/sections/campaigns/wizard/` (Foundation `git mv`). Internal imports reference `@/sections/campaigns/wizard/...`. Step components that still import `@/sections/signals/...` shared bits (e.g. `step-content`, `step-footer`, `scenario-card`) keep those imports — only the wizard files moved.

## Task B0: Reshape the stepper to 4 steps (Сценарий · Источник · Каналы · Бюджет)

The new wizard is: **Step 0 Сценарий → Step 1 Источник → Step 2 Каналы → Step 3 Бюджет(прогноз)**, then launch. Foundation already removed the segment step (old step-3) and the budget step depended on segments. We rebuild the stepper + workspace step list and the transition map.

**Files:**
- Modify: `src/sections/campaigns/wizard/campaign-stepper.tsx` (`STEPPER_ITEMS`)
- Modify: `src/sections/campaigns/wizard/wizard-navigation.ts` (`SCENARIO_STEP`, `computeStepTransition` already keyed off SCENARIO_STEP — verify step numbers)
- Modify: `src/sections/campaigns/wizard/campaign-workspace.tsx` (render map, `renderStepContent`, `defaultStartStep`)
- Test: `src/sections/campaigns/wizard/campaign-stepper.test.ts` + `wizard-navigation.test.ts` (extend)

> Step numbering DECISION: keep 1-based to match `SCENARIO_STEP = 1` and the existing transition logic. New map: 1=Сценарий, 2=Источник, 3=Каналы, 4=Бюджет. Launch happens from step 4 (no separate summary step). The old steps 7/8 (processing/result) are removed (B7) — open-campaign progress lives in the campaign card (sub-track D), not in the wizard.

- [ ] **Step 1: Write failing stepper test**

```ts
import { STEPPER_ITEMS } from "./campaign-stepper";
it("has exactly the four campaign steps in order", () => {
  expect(STEPPER_ITEMS.map((s) => s.label)).toEqual([
    "Сценарий", "Источник", "Каналы", "Бюджет",
  ]);
});
```

- [ ] **Step 2: Run red → implement `STEPPER_ITEMS`**

```ts
export const STEPPER_ITEMS = [
  { label: "Сценарий", step: 1 },
  { label: "Источник", step: 2 },
  { label: "Каналы", step: 3 },
  { label: "Бюджет", step: 4 },
];
```

- [ ] **Step 3: Update `campaign-workspace.tsx` render map**

Replace `renderStepContent` cases with: 1 → `Step1Scenario`, 2 → `StepSource` (B2), 3 → `StepChannels` (B3), 4 → `Step4Budget` (B4). Remove cases 5-8. Update `handleLaunchFromSummary` → `handleLaunchFromBudget` (B6). `defaultStartStep` stays `initialScenario ? 2 : 1`.

- [ ] **Step 4: Verify `computeStepTransition`/`SCENARIO_STEP`**

`SCENARIO_STEP = 1` is correct; the scenario-change reset rewinds to step 2 (Источник) — correct. No logic change; add a wizard-navigation test asserting `computeStepTransition({currentStep:4,maxStep:4,scenarioChanged:false}).step === 5` still works (it does — launch reads it but B6 intercepts). Confirm the existing tests still pass after the step-count change.

- [ ] **Step 5: Check + commit**

`npx vitest run src/sections/campaigns/wizard` → PASS (stepper + navigation). tsc will be RED until B2-B4 create the new step components — commit the stepper/navigation contract only:
```bash
git add src/sections/campaigns/wizard/campaign-stepper.tsx src/sections/campaigns/wizard/campaign-stepper.test.ts src/sections/campaigns/wizard/wizard-navigation.ts src/sections/campaigns/wizard/wizard-navigation.test.ts
git commit -m "feat(wizard): 4-step skeleton — Сценарий·Источник·Каналы·Бюджет"
```
> Build is intentionally red between B0 and B7 (new step files land incrementally). Keep wizard unit tests green meanwhile.

---

## Task B1: Graph-less budget estimator (`estimateCampaignBudget`)

`computeCampaignCost` works on the GRAPH (nodes/edges), which only exists on the canvas AFTER the wizard. Step-3 (Бюджет) has no graph yet — it needs a NEW estimator from `channels[]` + base size / scenario recommendation. Per spec §5: stream → dailyBudget + total cap; own → scoring line free (own scoring cost = 0).

**Files:**
- Create: `src/sections/campaigns/campaign-budget-estimate.ts`
- Test: `src/sections/campaigns/campaign-budget-estimate.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { estimateCampaignBudget } from "./campaign-budget-estimate";

describe("estimateCampaignBudget", () => {
  it("own source: scoring (signals) line is free", () => {
    const r = estimateCampaignBudget({ sourceType: "own", channels: ["sms"], baseSize: 10_000 });
    expect(r.signals).toBe(0);
    expect(r.communication).toBeGreaterThan(0);
    expect(r.total).toBe(r.communication);
  });
  it("new source: signals line is charged", () => {
    const r = estimateCampaignBudget({ sourceType: "new", channels: ["sms"], baseSize: 10_000 });
    expect(r.signals).toBeGreaterThan(0);
  });
  it("degenerate campaign (no channels): communication is 0, only signals", () => {
    const r = estimateCampaignBudget({ sourceType: "new", channels: [], baseSize: 5_000 });
    expect(r.communication).toBe(0);
    expect(r.total).toBe(r.signals);
  });
  it("stream source: exposes dailyBudget alongside the total cap", () => {
    const r = estimateCampaignBudget({ sourceType: "stream", channels: ["push"], baseSize: 20_000 });
    expect(r.dailyBudget).toBeGreaterThan(0);
    expect(r.total).toBeGreaterThanOrEqual(r.dailyBudget);
  });
  it("falls back to a scenario-derived base when baseSize is absent", () => {
    const r = estimateCampaignBudget({ sourceType: "stream", channels: ["sms"] });
    expect(r.total).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run red**

`npx vitest run src/sections/campaigns/campaign-budget-estimate.test.ts` → FAIL.

- [ ] **Step 3: Implement (reuse existing cost constants)**

```ts
import type { SourceType, Channel } from "@/types/campaign";
import { UNIT_COST, DYNAMIC_RATE } from "./campaign-cost";

const SIGNAL_UNIT_COST = 0.25; // ₽ per scored contact (new/stream); own = free
const STREAM_DAYS = 30;        // cap horizon for the daily→total relation
/** When no file/base size is known, fall back to a scenario-typical base. */
const FALLBACK_BASE = 10_000;

export interface BudgetEstimateInput {
  sourceType: SourceType;
  channels: Channel[];
  baseSize?: number;
}
export interface BudgetEstimate {
  signals: number;       // cost of producing the scored audience
  communication: number; // cost of the channel touches (one primary per channel)
  total: number;
  dailyBudget?: number;  // stream only
}

export function estimateCampaignBudget(input: BudgetEstimateInput): BudgetEstimate {
  const base = input.baseSize && input.baseSize > 0 ? input.baseSize : FALLBACK_BASE;
  const signals = input.sourceType === "own" ? 0 : Math.round(base * SIGNAL_UNIT_COST);
  // One primary touch per selected channel, summed at that channel's unit cost,
  // + a repeat buffer mirroring the canvas model (+DYNAMIC_RATE).
  const perChannel = input.channels.reduce((sum, c) => sum + UNIT_COST[c] * base, 0);
  const communication = Math.round(perChannel * (1 + DYNAMIC_RATE));
  const total = signals + communication;
  if (input.sourceType === "stream") {
    return { signals, communication, total, dailyBudget: Math.round(total / STREAM_DAYS) };
  }
  return { signals, communication, total };
}
```
> `Channel` is `"sms"|"push"|"email"|"ivr"` (Foundation contract). `UNIT_COST` in `campaign-cost.ts` already keys on the same four — verify the order matches; the cost file's local `Channel` type may be superseded by the contract one (Foundation). Import `UNIT_COST`/`DYNAMIC_RATE` from `./campaign-cost` (unchanged).

- [ ] **Step 4: Run green + commit**

`npx vitest run src/sections/campaigns/campaign-budget-estimate.test.ts` → PASS.
```bash
git add src/sections/campaigns/campaign-budget-estimate.ts src/sections/campaigns/campaign-budget-estimate.test.ts
git commit -m "feat(wizard): graph-less budget estimator (per source + channels)"
```

---

## Task B2: Step 1 «Источник» (`step-source.tsx`) — ASK-USER layout

The new step replaces interests/segment selection as the second step. It captures `sourceType` (new/stream/own), the `interests` block, and the `file` upload (own = required, new = optional, stream = none). It absorbs the salvageable parts of old `step-2-interests` (interests) and `step-4-upload` (file).

**Files:**
- Create: `src/sections/campaigns/wizard/steps/step-source.tsx`
- Test: `src/sections/campaigns/wizard/steps/step-source.test.tsx` (create — behavior, not pixels)

- [ ] **Step 1: ASK USER (AU-2) — BLOCKING**

Spec §7.4: how are the three sources shown (radio-cards vs reuse `scenario-card`?), and where do the interests block + upload block sit? This is a NEW composition. Surface candidates (radio-card row reusing the step-5 RadioDot pattern; interests reuse the `InterestChip` from old step-2; upload reuse `DropZone`) and let the user choose. Do not build the final layout until answered; scaffold behavior first (Step 2-4) so logic is testable.

- [ ] **Step 2: Write the failing behavior test**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { StepSource } from "./step-source";
import { initialStepData } from "@/types/campaign";

it("own source requires a file before continue", () => {
  const onNext = vi.fn();
  render(<StepSource data={{ ...initialStepData, sourceType: "own" }} onNext={onNext} onBack={() => {}} />);
  // continue disabled until a file is attached (own = file обязателен, §3)
  expect(screen.getByRole("button", { name: /далее|продолжить/i })).toBeDisabled();
});
```
> Confirm the test harness: `git grep -l "@testing-library/react" src` — if RTL is present (it is used by `scenario-card.test.tsx`), follow that pattern; else assert via a pure helper `canContinueFromSource(data)` extracted from the component.

- [ ] **Step 3: Implement `StepSource`**

`StepProps`-shaped (`{ data, onNext, onBack }`). Three source options writing `sourceType`; interests chips writing `interests`; conditional upload (`own`→required, `new`→optional, `stream`→hidden, replaced by a «подключение источника» note per §3). `onNext({ sourceType, interests, file, fileRowCount })`. Reuse `DropZone`, `HashingLoader`, `seededInt`/`rngFor` exactly as old `step-4-upload`. Gate continue: own requires `file`; new/stream require `sourceType` set.

- [ ] **Step 4: Run green + commit**

```bash
git add src/sections/campaigns/wizard/steps/step-source.tsx src/sections/campaigns/wizard/steps/step-source.test.tsx
git commit -m "feat(wizard): step-source (source type + interests + upload)"
```

---

## Task B3: Step 2 «Каналы» (`step-channels.tsx`) — ASK-USER layout

Captures `channels: Channel[]` with a «Не проводить коммуникацию» option (empty array → degenerate campaign, spec §2 cross-axis).

**Files:**
- Create: `src/sections/campaigns/wizard/steps/step-channels.tsx`
- Test: `src/sections/campaigns/wizard/steps/step-channels.test.tsx` (create)

- [ ] **Step 1: ASK USER (AU-3) — BLOCKING**

Spec §7.5: channel checkboxes layout + the «Не проводить коммуникацию» control (a toggle that clears+locks the channel set vs a separate radio). Surface candidates (4 channel cards reusing `InterestChip` look + a separate «без коммуникации» switch). Do not finalize layout until answered.

- [ ] **Step 2: Write failing test**

```tsx
it("selecting 'no communication' yields empty channels on continue", () => {
  const onNext = vi.fn();
  render(<StepChannels data={initialStepData} onNext={onNext} onBack={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /не проводить коммуникацию/i }));
  fireEvent.click(screen.getByRole("button", { name: /далее|продолжить/i }));
  expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ channels: [] }));
});
```

- [ ] **Step 3: Implement** — toggle set of `CHANNELS` (from `@/types/campaign`), labels from `CHANNEL_LABEL` (campaign-cost). «Не проводить» sets `channels: []` and is always a valid continue. `onNext({ channels })`.

- [ ] **Step 4: Green + commit**

```bash
git add src/sections/campaigns/wizard/steps/step-channels.tsx src/sections/campaigns/wizard/steps/step-channels.test.tsx
git commit -m "feat(wizard): step-channels (channel selection + degenerate option)"
```

---

## Task B4: Step 3 «Бюджет» (`step-budget.tsx`) — forecast via estimator (ASK-USER rows)

Replaces old `step-5-limit` (which read `data.segments`). Uses `estimateCampaignBudget` (B1) for the forecast rows. For stream, shows dailyBudget + total cap; for own, the Сигналы line reads «бесплатно».

**Files:**
- Create: `src/sections/campaigns/wizard/steps/step-budget.tsx`
- Delete (later, B7): `step-5-limit.tsx`
- Test: `src/sections/campaigns/wizard/steps/step-budget.test.tsx` (create)

- [ ] **Step 1: ASK USER (AU-4) — BLOCKING**

Spec §7.6: the forecast row layout (Сигналы / Коммуникация / Итого; the stream daily+cap presentation; «бесплатно» for own). Reuse the recommended/custom RadioDot cards from old step-5? Surface and confirm.

- [ ] **Step 2: Write failing test**

```tsx
it("own source shows the signals line as free and writes budget on continue", () => {
  const onNext = vi.fn();
  render(<StepBudget data={{ ...initialStepData, sourceType: "own", channels: ["sms"], fileRowCount: 10000 }} onNext={onNext} onBack={() => {}} />);
  expect(screen.getByText(/бесплатно/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /запустить|далее/i }));
  expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ budget: expect.any(Number) }));
});
```

- [ ] **Step 3: Implement** — call `estimateCampaignBudget({ sourceType: data.sourceType, channels: data.channels, baseSize: data.fileRowCount })`. Render the three forecast rows (own's `signals===0` → «бесплатно»). Recommended card = `estimate.total`; custom card = manual entry (reuse RadioDot pattern). For stream, surface `dailyBudget` and write it via `onNext({ budget: total, dailyBudget })`. Continue/«Запустить» writes `onNext({ budget, budgetMode, dailyBudget? })`.

- [ ] **Step 4: Green + commit**

```bash
git add src/sections/campaigns/wizard/steps/step-budget.tsx src/sections/campaigns/wizard/steps/step-budget.test.tsx
git commit -m "feat(wizard): step-budget forecast via graph-less estimator"
```

---

## Task B5: Step 0 «Сценарий» — ЖЦК grouping + recommendedSourceType label (ASK-USER)

The scenario step regroups by ЖЦК (`category`, 6 values) with counts and shows the recommended source-type label on each scenario card.

**Files:**
- Modify: `src/sections/campaigns/wizard/steps/step-1-scenario.tsx`
- Modify: `src/sections/signals/scenario-card.tsx` (add an optional source-type label) — **BOUNDARY NOTE:** `scenario-card.tsx` lives in `src/sections/signals/`, outside this epic's ownership. DECISION: pass the label as a child/prop only if the card already supports it; otherwise add a small optional prop. If editing `signals/` is disallowed, render the source-type label in `step-1-scenario.tsx` as an overlay/adjacent element instead of inside the card. Confirm boundary with orchestrator; default to rendering the label in the step, NOT in the shared card.
- Test: `src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx` (create)

- [ ] **Step 1: ASK USER (AU-5) — BLOCKING**

Spec §7.3: ЖЦК grouping with counts + «Показать ещё», and where/how the source-type label appears on a scenario card. NEW grouping pattern. Surface candidates (group headers per `SCENARIO_CATEGORIES` with `(N)` counts; «Показать ещё» to expand the per-group tail; a small `CardTag`-style chip «Источник: Новая база» under the scenario name). Confirm before final layout.

- [ ] **Step 2: Write failing test (grouping logic)**

```tsx
import { groupScenariosByCategory } from "./step-1-scenario";
it("groups scenarios under all six ЖЦК categories with counts", () => {
  const groups = groupScenariosByCategory();
  expect(groups.map((g) => g.category)).toEqual(SCENARIO_CATEGORIES);
  expect(groups.every((g) => g.scenarios.length === g.count)).toBe(true);
});
```

- [ ] **Step 3: Implement** — export a pure `groupScenariosByCategory()` from the step (testable), render groups by `SCENARIO_CATEGORIES` with counts + a «Показать ещё» tail per group. Show `recommendedSourceType` (mapped to a Russian label: new→«Новая база», stream→«Поток», own→«Своя база») per card per the AU-5 decision.

- [ ] **Step 4: Green + commit**

```bash
git add src/sections/campaigns/wizard/steps/step-1-scenario.tsx src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx
git commit -m "feat(wizard): scenario step ЖЦК grouping + source-type label"
```

---

## Task B6: Wire the launch handoff from Step-Бюджет (no summary step)

Old flow launched from step-6-summary via `onLaunchRequested` with `count: estimateSignalCount(segments, budget)`. Segments are gone. New flow launches from step-4 (Бюджет) using the estimator's base, dispatching the campaign-first create path.

**Files:**
- Modify: `src/sections/campaigns/wizard/campaign-workspace.tsx`
- Test: covered by `campaign-stepper`/navigation tests + manual smoke; add a pure-helper test if `handleLaunchFromBudget` is extracted.

- [ ] **Step 1: Replace `handleLaunchFromSummary`**

Rename to `handleLaunchFromBudget`. Build the `LaunchRequest` without `segments`:
```ts
count: estimateCampaignBudget({
  sourceType: stepData.sourceType, channels: stepData.channels, baseSize: stepData.fileRowCount,
}).total, // or a derived audience count — see note
```
> **Audience count vs budget:** old code passed `count = estimateSignalCount(...)` (audience reached). Post-segments, derive audience from `fileRowCount` (own/new with file) or a scenario fallback (stream). DECISION: `count = stepData.fileRowCount ?? FALLBACK_BASE`. Keep `cost: budget` as before. The downstream `campaign_artifact_ready` (Foundation action) is dispatched by the create flow with this `count`.

- [ ] **Step 2: Drop `proceed: () => advanceTo(7)`** — there is no step 7. The launch handoff now routes to payment (sub-track E) or the campaign card. DECISION: on launch, dispatch the Foundation create/launch path and let the reducer route to the payment screen (existing `open_campaign_payment`), matching the canvas «Запустить» flow. `onLaunchRequested` callback in `guided-signal-section.tsx` already owns this — **BOUNDARY:** `guided-signal-section.tsx` is in `src/sections/signals/` (Foundation owns the inverted create-flow orchestrator). Do NOT edit it here; this epic only supplies the `LaunchRequest` shape it consumes. If the shape changed (no `segments`, no `proceed`), confirm the orchestrator updated the consumer.

- [ ] **Step 3: Check + commit**

`npx tsc --noEmit` (wizard region) → clean once B7 removes dead steps.
```bash
git add src/sections/campaigns/wizard/campaign-workspace.tsx
git commit -m "feat(wizard): launch handoff from budget step (no summary)"
```

---

## Task B7: Remove dead wizard steps (summary, result, segments, limit, processing)

**Files:** deletions + workspace import cleanup.

- [ ] **Step 1: Confirm zero references**

```bash
git grep -ln "step-3-segments\|step-5-limit\|step-6-summary\|step-7-processing\|step-8-result\|Step3Segments\|Step5Limit\|Step6Summary\|Step7Processing\|Step8Result" src
```
Expected: only `campaign-workspace.tsx` (already rewired in B0/B6) and the files themselves. `step-7-processing` logic is salvaged into D2 (`campaign-signal-progress`) FIRST — do not delete step-7-processing until D2 has copied its STEPS array + activeIndex logic. Re-run this grep after D2.

- [ ] **Step 2: Delete the dead steps**

```bash
git rm src/sections/campaigns/wizard/steps/step-3-segments.tsx \
       src/sections/campaigns/wizard/steps/step-5-limit.tsx \
       src/sections/campaigns/wizard/steps/step-6-summary.tsx \
       src/sections/campaigns/wizard/steps/step-8-result.tsx
# step-7-processing deleted in D2 after salvage
```
Remove their imports from `campaign-workspace.tsx`. If `segment-priority-breakdown.tsx` (imported by old step-5) is now orphaned, leave it (lives in `signals/`, not our boundary) — just drop the import.

- [ ] **Step 3: Full green**

`npx tsc --noEmit && npx vitest run` → clean / PASS. First fully-green checkpoint since B0.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(wizard): remove dead summary/result/segments/limit steps"
```

---

# SUB-TRACK C — Campaign list: card + empty-state (signal → scenario/source)

> Order: C1 → C2. Small track; updates the card content per spec block 8 (no tabs, scenario instead of signal, source-aware metrics) and the empty state.

## Task C1: Campaign card — scenario/source instead of signal; degenerate-aware metrics

**Files:**
- Modify: `src/sections/campaigns/campaign-card.tsx`
- Modify: `src/sections/campaigns/campaigns-section.tsx` (stop joining via `signalId`; pass campaign-first data)
- Modify: `src/sections/campaigns/campaign-metrics.ts` (read base size from campaign, not signal)
- Test: `src/sections/campaigns/campaign-metrics.test.ts` (create) + card render test if RTL harness present

- [ ] **Step 1: Write failing metrics test**

```ts
import { getCampaignCardMetrics } from "./campaign-metrics";
it("derives planned budget from the campaign, not a signal join", () => {
  const c = { id: "c1", name: "X", status: "draft", createdAt: "x", sourceType: "own", channels: ["sms"], budget: 1234 } as never;
  const m = getCampaignCardMetrics(c);
  expect(m.plannedBudget).toBe(1234);
});
```

- [ ] **Step 2: Run red → update `getCampaignCardMetrics`**

Change the signature to `getCampaignCardMetrics(campaign: Campaign, artifact?: Artifact)` (or drop the second arg entirely). Replace `signal ? recommendBudget(signal.count) : 0` with `campaign.budget ?? recommendBudget(campaign.file?.rowCount ?? 0)`. For the funnel `buildFacts`, feed the artifact count (`artifact?.count`) instead of `signal.count`. **BOUNDARY:** `buildFacts` lives in `src/sections/statistics/` — do NOT change its internals; just change what this epic passes in. If `buildFacts` requires a `signals` array shape, pass `artifacts.map(a => ({ id: a.id, count: a.count }))` adapted to its expected `{ id, count }` shape (verify the field names it reads).

- [ ] **Step 3: Update the card UI**

In `campaign-card.tsx`: replace the «Сигнал: type · count» line with «Сценарий: {scenario.name}» + a source-type tag («Новая база»/«Поток»/«Своя база»). For a degenerate campaign (`channels.length === 0`) show «Без коммуникации» instead of the CR/Отправки stats. Reuse `StatusBadge`, `StatItem`, `formatRub`. The scenario name: `campaign.scenario?.name ?? "—"`.

- [ ] **Step 4: Update `campaigns-section.tsx`**

Drop the `signalById` map + `c.signalId` join. Sort/filter stay (status-based). Pass `artifact={artifactByCampaign.get(c.id)}` if the card needs the count — build `artifactByCampaign` from `useAppState().artifacts` keyed by `campaignId`. The `goToSignals` nav DECISION: rename to a «Создать кампанию» CTA dispatching `start_campaign_flow` (Foundation action); remove `NewCampaignMenu` usage.

- [ ] **Step 5: Green + commit**

`npx tsc --noEmit && npx vitest run src/sections/campaigns` → clean / PASS.
```bash
git add src/sections/campaigns/campaign-card.tsx src/sections/campaigns/campaigns-section.tsx src/sections/campaigns/campaign-metrics.ts src/sections/campaigns/campaign-metrics.test.ts
git commit -m "feat(campaigns): card shows scenario+source, metrics from campaign/artifact"
```

---

## Task C2: Empty state + «Создать кампанию» entry

**Files:**
- Modify: `src/sections/campaigns/new-campaign-card.tsx` (empty-state CTA) and/or `campaigns-section.tsx`
- Remove usage of: `new-campaign-menu.tsx` (Foundation may have deleted it; if it still exists and is unused, leave the file for Foundation's dead-code task — just stop importing it).

- [ ] **Step 1: Repoint the empty-state CTA**

`new-campaign-card.tsx` currently takes `onGoToSignals`. Change its single CTA to dispatch `start_campaign_flow` directly (the empty state is «Создайте первую кампанию»). DECISION: keep the existing card visual; only swap the action + copy («Создать кампанию»). No new pattern.

- [ ] **Step 2: Add a lightweight render/behavior assertion** if RTL harness present (click CTA → dispatch called with `start_campaign_flow`); else skip (covered by smoke).

- [ ] **Step 3: Check + commit**

```bash
git add src/sections/campaigns/new-campaign-card.tsx src/sections/campaigns/campaigns-section.tsx
git commit -m "feat(campaigns): empty-state CTA starts the campaign flow"
```

---

# SUB-TRACK D — Open campaign: path indicator + progress + in-card stats/artifacts

> Order: D1 (path indicator, ASK-USER) → D2 (progress block, salvages step-7) → D3 (phase wiring) → D4 (in-card stats funnel + spend) → D5 (in-card artifacts). The canvas is NEVER hidden (spec §4) — these are blocks in the campaign card (`campaign-screen.tsx`), beside/below the workflow mini-preview.

## Task D1: Linear «путь кампании» indicator (ASK-USER — NEW pattern)

Per spec §3 the path differs by source: new = Сбор→Скоринг→Коммуникация→Результат; stream = Мониторинг→Скоринг→Коммуникация→Результат; own = База загружена→Коммуникация→Результат. All end in Результат.

**Files:**
- Create: `src/sections/campaigns/campaign-path-indicator.tsx`
- Test: `src/sections/campaigns/campaign-path-indicator.test.tsx` (create — phase logic)

- [ ] **Step 1: ASK USER (AU-6) — BLOCKING**

Spec §7.8: the «путь кампании» linear indicator is a NEW visual pattern, plus placement of progress / Статистика / Артефакты blocks in the open-campaign card. Surface a candidate (horizontal stepper reusing the `CampaignStepper` connector-dot visual but laid out horizontally; current phase = brand-highlighted node; completed = primary; pending = muted). Confirm before final layout.

- [ ] **Step 2: Write the failing pure-logic test**

```tsx
import { campaignPathStages } from "./campaign-path-indicator";
it("own path has no scoring stage and ends in Результат", () => {
  const stages = campaignPathStages("own");
  expect(stages).toEqual(["База загружена", "Коммуникация", "Результат"]);
});
it("new path includes Сбор and Скоринг", () => {
  expect(campaignPathStages("new")[0]).toBe("Сбор");
  expect(campaignPathStages("new")).toContain("Скоринг");
});
it("stream path starts with Мониторинг", () => {
  expect(campaignPathStages("stream")[0]).toBe("Мониторинг");
});
```

- [ ] **Step 3: Implement** — pure `campaignPathStages(sourceType): string[]` + a presentational component mapping `Campaign.phase` (`scoring`→highlight the scoring/collection stage; `communicating`→highlight Коммуникация) to the active index. Reuse the AU-6 visual decision.

- [ ] **Step 4: Green + commit**

```bash
git add src/sections/campaigns/campaign-path-indicator.tsx src/sections/campaigns/campaign-path-indicator.test.tsx
git commit -m "feat(campaign): source-aware path indicator (per spec §3 paths)"
```

---

## Task D2: In-card progress block (salvage step-7-processing → `campaign-signal-progress`)

Spec §4: the step-by-step progress block stays in the card (beside the canvas, not instead of it): collection stages + which operators are connected/connecting + % of base processed. Salvage `step-7-processing.tsx`'s STEPS array + activeIndex logic.

**Files:**
- Create: `src/sections/campaigns/campaign-signal-progress.tsx` (salvaged)
- Modify: `src/sections/campaigns/campaign-screen.tsx` (render the block for `phase === "scoring"` campaigns)
- Then delete `step-7-processing.tsx` (completes B7 Step 1's deferral)
- Test: `src/sections/campaigns/campaign-signal-progress.test.tsx` (create)

- [ ] **Step 1: Write failing test**

```tsx
import { processedFraction } from "./campaign-signal-progress";
it("derives a stable processed % from campaign id + phase", () => {
  const f = processedFraction("cmp_1", "scoring");
  expect(f).toBeGreaterThanOrEqual(0);
  expect(f).toBeLessThanOrEqual(1);
});
```

- [ ] **Step 2: Implement** — copy the `STEPS` array and `activeIndex` mapping from `step-7-processing.tsx`, but drive it from `Campaign.phase` instead of `signal.status` (scoring → mid-progress; communicating → done). Add `processedFraction(campaignId, phase)` using the deterministic `rngFor("progress", campaignId)` from `@/state/metrics` (NOT `Math.random` — design principle). Render «% обработанной базы» + the operators list (reuse `ProviderList` from this folder). Add the «связаться с поддержкой» button.

- [ ] **Step 3: Render in `campaign-screen.tsx`** under a `CardSection label="Прогресс"` when `campaign.phase === "scoring"` (and source is new/stream — own has no scoring). Placement per AU-6.

- [ ] **Step 4: Delete step-7-processing + finalize B7**

```bash
git rm src/sections/campaigns/wizard/steps/step-7-processing.tsx
git grep -n "step-7-processing\|Step7Processing" src   # expect zero
```

- [ ] **Step 5: Green + commit**

```bash
git add src/sections/campaigns/campaign-signal-progress.tsx src/sections/campaigns/campaign-screen.tsx
git commit -m "feat(campaign): in-card signal-progress block (salvaged from step-7)"
```

---

## Task D3: Phase wiring (scoring → communicating)

**Files:**
- Modify: `src/sections/campaigns/campaign-screen.tsx`
- **Foundation dependency FD-4:** the action `campaign_phase_advanced { id }` (sets `phase: "communicating"`). Assumed present.

- [ ] **Step 1: Drive the path indicator + progress block from `phase`**

`campaign-screen.tsx` reads `campaign.phase`. When `phase === "scoring"`, show the progress block + path indicator with scoring active. A new/stream campaign that just launched starts at `phase: "scoring"` (Foundation create-flow sets it); after the (simulated) scoring window it advances to `communicating`.

- [ ] **Step 2: Advance phase (prototype simulation)**

DECISION (prototype, no backend): when an active new/stream campaign's `phase === "scoring"` and the deterministic `processedFraction` reaches 1 (or after a fixed timer on mount, mirroring `step-7-processing`'s auto-advance), dispatch `campaign_phase_advanced`. 
- **If FD-4 exists:** dispatch it.
- **Fallback (FD-4 declined):** derive phase from `launchedAt` age — a campaign launched > N minutes ago is treated as `communicating` (pure derivation in `campaign-signal-progress.ts`, no dispatch). Document which path was taken.

- [ ] **Step 3: Check + commit**

```bash
git add src/sections/campaigns/campaign-screen.tsx
git commit -m "feat(campaign): phase-driven progress + path; advance scoring→communicating"
```

---

## Task D4: In-card stats funnel / metrics / spend block

Spec §9 (corrected): a Статистика block inside the open-campaign card (funnel + metrics + spend), NOT a separate hidden view.

**Files:**
- Create: `src/sections/campaigns/campaign-stats-block.tsx`
- Modify: `src/sections/campaigns/campaign-screen.tsx`
- Test: `src/sections/campaigns/campaign-stats-block.test.tsx` (create — pure derivation)

- [ ] **Step 1: Write failing test** — assert the block computes sends/CR/spend from `getCampaignCardMetrics` (C1) for a launched campaign and renders «—» / hidden for a draft.

- [ ] **Step 2: Implement** — reuse `getCampaignCardMetrics(campaign, artifact)` (C1) for the headline numbers; render a compact funnel (sends → clicks → actions → approves) using the same `fact-cube` aggregate already used by the card. DECISION: reuse `formatRub`/`formatNumber` helpers; no new number engine. Show «расчётный … · факт …» spend like the card. Placement per AU-6.

- [ ] **Step 3: Render in `campaign-screen.tsx`** under `CardSection label="Статистика"` when `hasStats` (active/completed). This complements the existing «Статистика» secondary action (which navigates to the full report) — the in-card block is a summary, not a replacement.

- [ ] **Step 4: Green + commit**

```bash
git add src/sections/campaigns/campaign-stats-block.tsx src/sections/campaigns/campaign-screen.tsx src/sections/campaigns/campaign-stats-block.test.tsx
git commit -m "feat(campaign): in-card stats funnel + spend block"
```

---

## Task D5: In-card artifacts block

Spec §2: a campaign produces an `Artifact` («Сигналы» or «Сигналы и конверсии»). Show it in the card.

**Files:**
- Create: `src/sections/campaigns/campaign-artifacts-block.tsx`
- Modify: `src/sections/campaigns/campaign-screen.tsx`
- Test: `src/sections/campaigns/campaign-artifacts-block.test.tsx` (create)

- [ ] **Step 1: Write failing test** — given `artifacts` containing one for the campaign, the block renders its kind label («Сигналы» / «Сигналы и конверсии») + count; given none, renders nothing (or a «формируется» note for `phase === "scoring"`).

- [ ] **Step 2: Implement** — read `useAppState().artifacts`, filter by `campaignId`. Kind label map: `signals`→«Сигналы», `signals_conversions`→«Сигналы и конверсии». Count via `formatNumber`. Degenerate campaign → only «Сигналы». DECISION: reuse `CardSection` + `CardTag` from `entity-card`; no new card type unless AU-6 says so.

- [ ] **Step 3: Render in `campaign-screen.tsx`** under `CardSection label="Артефакты"`.

- [ ] **Step 4: Green + commit**

```bash
git add src/sections/campaigns/campaign-artifacts-block.tsx src/sections/campaigns/campaign-screen.tsx src/sections/campaigns/campaign-artifacts-block.test.tsx
git commit -m "feat(campaign): in-card artifacts block"
```

---

# SUB-TRACK E — Billing: two payments (scoring + communication)

> Order: E1 → E2 → E3. Spec §5: own scoring = free; stream = daily budget + total cap; degenerate = one payment (scoring only); degenerate on own base = no payment. The current `campaign-payment-screen.tsx` is a single budget screen joined via `signalId`.

## Task E1: De-signal the payment screen (campaign-first cost source)

**Files:**
- Modify: `src/sections/campaigns/campaign-payment-screen.tsx`
- Test: extend an existing payment test if present (`git grep -l campaign-payment src --include=*.test.*`); else add a pure-helper test.

- [ ] **Step 1: Replace the `signalId` join + audience source**

`campaign-payment-screen.tsx` does `signals.find((s) => s.id === campaign.signalId)` and `audienceSize = signal.count`. Replace with campaign-first: `audienceSize = campaign.file?.rowCount ?? <artifact count for this campaign> ?? FALLBACK_BASE`. The cost source: keep using `getCachedGraph(campaign.id) ?? createTemplate(signal.type, signal)` BUT `signal` is gone — use `createTemplate(scenarioSignalType, undefined, campaign.sourceType)` where `scenarioSignalType = campaign.scenario`'s `signalType` (look up via `getScenario`). If a cached graph exists (campaign already had a canvas), prefer it.

- [ ] **Step 2: Write/extend test** asserting the screen computes a cost for a campaign with no signal join (campaign-first).

- [ ] **Step 3: Green + commit**

```bash
git add src/sections/campaigns/campaign-payment-screen.tsx
git commit -m "feat(billing): payment screen reads campaign-first cost (no signal join)"
```

---

## Task E2: Two-payment model (scoring payment + communication payment)

Spec §5 + §3: scoring payment (free for own) and communication payment (skipped for degenerate). Surface two lines/steps.

**Files:**
- Modify: `src/sections/campaigns/campaign-payment-screen.tsx`
- Create (if logic warrants): `src/sections/campaigns/campaign-payments.ts` (pure split)
- Test: `src/sections/campaigns/campaign-payments.test.ts` (create)

- [ ] **Step 1: Write failing test**

```ts
import { splitCampaignPayments } from "./campaign-payments";
it("own + channels: scoring free, communication charged", () => {
  const p = splitCampaignPayments({ sourceType: "own", channels: ["sms"], baseSize: 1000 });
  expect(p.scoring).toBe(0);
  expect(p.communication).toBeGreaterThan(0);
  expect(p.payments.length).toBe(1); // only the communication payment
});
it("degenerate new: one scoring payment, no communication", () => {
  const p = splitCampaignPayments({ sourceType: "new", channels: [], baseSize: 1000 });
  expect(p.payments.map((x) => x.kind)).toEqual(["scoring"]);
});
it("degenerate own: no payments at all", () => {
  const p = splitCampaignPayments({ sourceType: "own", channels: [], baseSize: 1000 });
  expect(p.payments).toEqual([]);
});
it("new + channels: two payments (scoring + communication)", () => {
  const p = splitCampaignPayments({ sourceType: "new", channels: ["sms"], baseSize: 1000 });
  expect(p.payments.map((x) => x.kind)).toEqual(["scoring", "communication"]);
});
```

- [ ] **Step 2: Implement `splitCampaignPayments`** on top of `estimateCampaignBudget` (B1): `scoring = estimate.signals` (0 for own), `communication = estimate.communication` (0 when channels empty). `payments` = the non-zero lines, each `{ kind, amount }`. For stream, include `dailyBudget` + total cap on the communication payment.

- [ ] **Step 3: Render the two payment lines** in `campaign-payment-screen.tsx`'s breakdown (reuse the existing breakdown `<ul>` styling). The «Запустить» CTA pays both (prototype = single confirm covering both lines). DECISION: do NOT build a multi-step payment wizard (prototype scope) — show both lines, one confirm. Free lines render «бесплатно».

- [ ] **Step 4: Green + commit**

```bash
git add src/sections/campaigns/campaign-payments.ts src/sections/campaigns/campaign-payment-screen.tsx src/sections/campaigns/campaign-payments.test.ts
git commit -m "feat(billing): two-payment split (scoring + communication, source-aware)"
```

---

## Task E3: Stream daily-budget on launch

**Files:**
- Modify: `src/sections/campaigns/campaign-payment-screen.tsx`
- **Foundation dependency FD-5:** `campaign_launched` payload extended with `dailyBudget?: number`. Assumed present.

- [ ] **Step 1: Carry dailyBudget into the launch dispatch**

For `sourceType === "stream"`, the launch payload includes `dailyBudget` (from `estimateCampaignBudget`) alongside `budget` (total cap). 
- **If FD-5 exists:** `dispatch({ type: "campaign_launched", id, timestamp, budget, dailyBudget })`.
- **Fallback (FD-5 declined):** store the daily figure only in the displayed forecast; launch with `budget` (cap) as today. Document the limitation.

- [ ] **Step 2: Show «дневной бюджет … · потолок …»** for stream in the payment screen budget block (reuse existing money formatting).

- [ ] **Step 3: Check + commit**

```bash
git add src/sections/campaigns/campaign-payment-screen.tsx
git commit -m "feat(billing): stream daily budget + total cap on launch"
```

---

## Task F: Epic gate — verify, smoke, handoff

**Files:** none (verification only).

- [ ] **Step 1: Contracts compile, full suite green**

`npx tsc --noEmit && npx vitest run` → clean / all PASS.

- [ ] **Step 2: Build**

`npx next build` (or `npm run build`) → succeeds.

- [ ] **Step 3: Manual smoke (dev on non-default port per AGENTS.md)**

`npx next dev -p 3001`. Verify:
- Create-campaign wizard runs Сценарий → Источник → Каналы → Бюджет; budget forecast shows correct lines per source (own = «бесплатно» signals; stream = daily + cap; degenerate = communication 0).
- Canvas: «Запустить» is disabled with a tooltip when a communication node has an empty required field; filling it enables launch; own campaigns have no Скоринг node, new/stream do; autosave indicator shows «Сохранение…»/«Изменения сохранены» reflecting real edits.
- Campaign list: cards show scenario + source (not signal); degenerate shows «Без коммуникации».
- Open campaign (new/stream, active): path indicator + progress block (canvas still visible), in-card Статистика + Артефакты blocks.
- Payment: two lines for new+channels; one for degenerate new; none for degenerate own.

- [ ] **Step 4: Confirm all ASK-USER items were answered** (AU-1…AU-6). If any visual was shipped on a provisional value, list it in the handoff so the user can confirm.

- [ ] **Step 5: Report**

Epic «Кампании» complete on `feature/epic-campaigns` at `.worktrees/epic-campaigns`. Report: worktree path, branch, the Foundation dependencies that had to exist (FD-1…FD-5) and whether each was present or used a fallback, and any ASK-USER decisions still pending. Merge is the user's call (AGENTS.md).

---

## Self-Review (completed)

- **Spec coverage:** block 2 (canvas node states + autosave) → A1, A4; block 3 (4-step wizard + estimator + recommendedSourceType) → A0, B0–B6; block 4 (phases, canvas not hidden) → D1–D3; block 5 (budget forecast + billing) → B1, B4, E1–E3; block 8 (no tabs, card content) → C1–C2; block 9 (in-card progress/stats/artifacts, no canvas hiding) → D2, D4, D5; block 13 (segments out of wizard, scoring stays as node) → B7 + A3 (`scoring` node). §8 sub-tracks A–E mapped 1:1.
- **Gotchas designed around:** needs-attention detector computed in `validateWorkflow` for ALL nodes + button gate + recompute-on-edit (A1); only `justUpdated` treated as real, `processing`/`ready` untouched (A1/A2 do not pretend they work); no «Сохранить» button — only the indicator fixed to real `saveState` (A4); graph-less estimator separate from `computeCampaignCost` (B1); own scoring free, stream daily+cap, degenerate single/zero payment (B1, E2); `recommendedSourceType` added to `Scenario` (A0); canvas never hidden — phase blocks live in the card (D); step-7 logic salvaged before deletion (D2 before B7 finalize).
- **Foundation dependencies flagged:** FD-1 (validator keys off `source`), FD-4 (`campaign_phase_advanced`, with documented fallback), FD-5 (`campaign_launched` += `dailyBudget`, with fallback). FD-2/FD-3 confirmed already present. Shared-module boundary notes raised for `workflow-templates.ts` (A3), `scenario-card.tsx` (B5), `guided-signal-section.tsx` (B6), `buildFacts` (C1, D4) — none edited as hub files; coordination requested where outside ownership.
- **ASK-USER escalations:** AU-1 (source/scoring palette), AU-2 (step-source layout), AU-3 (step-channels layout), AU-4 (budget rows), AU-5 (scenario ЖЦК grouping + source label), AU-6 (path indicator + card block placement) — all NEW visual patterns, escalated as blocking, with provisional/behavior-first scaffolding so logic stays testable while the visual is pending.
- **TDD discipline:** every logic task has a failing-test → red → implement → green → commit cycle on a real path (`npx vitest run <path>`); ASK-USER visual tasks use structure/behavior tests that are palette-agnostic so they pass regardless of the user's visual choice.
- **Ownership:** only `src/sections/campaigns/**`, `src/state/workflow-validation.ts`, and the `src/data/scenarios.ts` field add are modified by this epic; `workflow-templates.ts`/`statistics`/`signals` touches are flagged as coordination points, hub files untouched.
