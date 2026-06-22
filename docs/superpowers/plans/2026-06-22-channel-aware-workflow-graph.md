# Channel-aware Workflow Graph Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor workflow template generation to accept a `channels` argument, deduplicate channel → node mappings into a reusable `channel-nodes.ts` module, and fix the pricing bug where `graphCostFor` drops channels from wizard forecasts.

**Architecture:** Templates evolve from static skeletons (6 hardcoded per scenario) to **scenario skeleton + channels-generated communication blocks**. A single `buildChannelBlock()` function generates a parallel `split → [channels] → merge` structure for each channel set. All channel-to-node mappings (params + visuals) live in `channel-nodes.ts`, ending duplication across `defaultParamsFor` (structural-commands.ts), `defaultParams` (rebuild-schema.ts), and inline node creation. The `createTemplate()` signature expands to `(signalType, sourceType, channels)` and is threaded through 4 call sites (workflow-view, campaign-graph-cost, campaign-payment-screen, workflow-mini-preview). A communication unit (channel + follow-up condition) is reusable across linear and segmented scenarios.

**Tech Stack:** Next.js 16, Vitest (jsdom), Tailwind v4, TypeScript; `motion/react` for any future animation; no external graph libraries.

---

## Task 1: Create `channel-nodes.ts` — unified channel-to-node map

**Files:**
- **Create:** `/Users/macintosh/Documents/work/afina-ai-first/src/state/channel-nodes.ts` (new)
- **Test:** `/Users/macintosh/Documents/work/afina-ai-first/src/state/channel-nodes.test.ts` (new)
- **Reference:** existing `src/sections/campaigns/campaign-cost.ts` (CHANNEL_LABEL, UNIT_COST), `src/sections/campaigns/node-visuals.ts` (NODE_STYLES, getNodeColor), `src/state/structural-commands.ts` (defaultParamsFor), `src/lib/ai/rebuild-schema.ts` (defaultParams)

**Acceptance criteria:**
- Exports `CHANNEL_NODE_MAP`: `Record<Channel, { label: string; defaultParams: NodeParams; color: string }>`
- Exports `buildChannelBlock(channels: Channel[], idPrefix?: string)`: builds a `{ nodes, edges }` for parallel `split → [channels] → merge`
- Exports `buildCommUnit(channels: Channel[], { onEngaged, onExhausted }: Options)`: builds channel + post-interaction condition + optional repeat (Model B)
- No duplication: all channel node creation goes through the map
- Deduplication targets: `defaultParamsFor(sms|email|push|ivr)`, `defaultParams(sms|email|push|ivr)`, inline params in templates

**Steps:**

- [ ] **Write failing test:** `src/state/channel-nodes.test.ts`
  - Test 1: `CHANNEL_NODE_MAP` has entries for all 4 channels (sms, email, push, ivr)
  - Test 2: Each entry has `label`, `defaultParams` (with `kind` matching channel), `color`
  - Test 3: `buildChannelBlock(['sms', 'email'], 'comm1')` returns nodes + edges with a split, 2 channel nodes, merge
  - Test 4: Node IDs are deterministic and prefixed (e.g., `comm1_split`, `comm1_sms`, `comm1_email`, `comm1_merge`)
  - Test 5: `buildCommUnit(['sms'], { onEngaged: 'success', onExhausted: 'end' })` includes channel, condition, repeat logic
  
  Example test code:
  ```typescript
  import { describe, it, expect } from "vitest";
  import { CHANNEL_NODE_MAP, buildChannelBlock, buildCommUnit } from "./channel-nodes";
  
  describe("channel-nodes", () => {
    it("CHANNEL_NODE_MAP covers all 4 channels", () => {
      const channels = ["sms", "email", "push", "ivr"] as const;
      for (const ch of channels) {
        expect(CHANNEL_NODE_MAP[ch]).toBeDefined();
        expect(CHANNEL_NODE_MAP[ch].label).toBeTruthy();
        expect(CHANNEL_NODE_MAP[ch].defaultParams.kind).toBe(ch);
        expect(CHANNEL_NODE_MAP[ch].color).toBeTruthy();
      }
    });

    it("buildChannelBlock creates split-channels-merge for parallel channels", () => {
      const { nodes, edges } = buildChannelBlock(["sms", "email"], "comm1");
      const ids = nodes.map((n) => n.id);
      expect(ids).toContain("comm1_split");
      expect(ids).toContain("comm1_sms");
      expect(ids).toContain("comm1_email");
      expect(ids).toContain("comm1_merge");
      // split connects to both channels, channels connect to merge
      expect(edges.length).toBe(4); // split→sms, split→email, sms→merge, email→merge
    });
  });
  ```

- [ ] **Implement:** `src/state/channel-nodes.ts`
  - Define type: `type Channel = "sms" | "email" | "push" | "ivr";` (export, reuse from campaign-cost.ts later)
  - Create `CHANNEL_NODE_MAP: Record<Channel, { label: string; defaultParams: NodeParams; color: string }>`
    - Reuse `CHANNEL_LABEL` values from campaign-cost.ts
    - Pull `defaultParams` from rebuild-schema.ts (sms, email, push, ivr cases)
    - Pull color from `NODE_STYLES[nodeType]` in node-visuals.ts
  - Implement `buildChannelBlock(channels, idPrefix = "comm")`: returns split, N channel nodes, merge + edges connecting them
    - Positions: split at x=0, channels at x=STEP in a column (y spaced), merge at x=STEP*2
    - Split node: `kind: "split", by: "equal", branches: channels.length`
    - Each channel node: `kind: channel, params: CHANNEL_NODE_MAP[channel].defaultParams`
    - Merge node: `kind: "merge"`
  - Implement `buildCommUnit(channels, { onEngaged, onExhausted })`: wraps `buildChannelBlock`, adds post-interaction condition + optional repeat
    - Returns extended { nodes, edges } including condition and follow-up paths
    - YES path → onEngaged (e.g., conversion or next block)
    - NO path → small delay → REPEAT channel block → condition again → YES: conversion / NO: onExhausted

- [ ] **Run test:** `npx vitest run src/state/channel-nodes.test.ts`
  - Expect FAIL (unimplemented)

- [ ] **Implement the module fully** based on the test expectations

- [ ] **Run test again:** `npx vitest run src/state/channel-nodes.test.ts`
  - Expect PASS

- [ ] **Commit:** `git commit -m "feat(channel-nodes): unified channel-to-node map + builders"`

---

## Task 2: Update `createTemplate()` signature to accept `channels`

**Files:**
- **Modify:** `/Users/macintosh/Documents/work/afina-ai-first/src/state/workflow-templates.ts`
  - Current signature: `createTemplate(signalType: SignalType, signal?: Signal): Template`
  - New signature: `createTemplate(signalType: SignalType, sourceType?: string, channels?: Channel[]): Template`
- **Test:** `/Users/macintosh/Documents/work/afina-ai-first/src/state/workflow-templates.test.ts`

**Acceptance criteria:**
- Backward compatible: `createTemplate(type)` and `createTemplate(type, signal)` still work (default sourceType, channels)
- If channels provided: replace hardcoded communication nodes in templates with dynamic `buildChannelBlock()`
- Linear scenarios (Регистрация, Первая сделка, Реактивация, Возврат): insert channel block at main touchpoint
- Segmented scenarios (Апсейл, Удержание): insert one channel block per segment
- IDs and edges correctly wired

**Steps:**

- [ ] **Write failing test:** Add test case to `src/state/workflow-templates.test.ts`
  ```typescript
  it("createTemplate with channels generates a channel block instead of hardcoded comm", () => {
    const t = createTemplate("Регистрация", undefined, ["sms", "email"]);
    // Should have split, sms, email, merge nodes (+ signal, condition, etc.)
    const nodeTypes = new Set(t.nodes.map((n) => n.data.nodeType));
    expect(nodeTypes).toContain("split");
    expect(nodeTypes).toContain("sms");
    expect(nodeTypes).toContain("email");
    expect(nodeTypes).toContain("merge");
    expect(nodeTypes).toContain("condition");
  });

  it("createTemplate with single channel is still valid", () => {
    const t = createTemplate("Регистрация", undefined, ["sms"]);
    const v = validateWorkflow(t, true);
    expect(v.ok).toBe(true);
  });
  ```

- [ ] **Update function signature** in workflow-templates.ts:
  ```typescript
  export function createTemplate(
    signalType: SignalType,
    sourceType?: string | Signal,
    channels?: Channel[]
  ): Template {
    // Handle backward compat: second arg can be Signal (old usage) or sourceType string (new)
    let signal: Signal | undefined;
    if (sourceType && typeof sourceType === "object" && "id" in sourceType) {
      signal = sourceType;
      sourceType = undefined;
    }
    // ... rest of logic
  }
  ```

- [ ] **Refactor template functions** (registrationTemplate, etc.) to accept channels and call `buildChannelBlock()` instead of hardcoding nodes
  - Example: registrationTemplate() currently has hardcoded email + wait + push. Replace email + push with `buildChannelBlock(['email', 'push'])`
  - For segmented (upsellTemplate, retentionTemplate): call buildChannelBlock per segment branch

- [ ] **Run test:** `npx vitest run src/state/workflow-templates.test.ts`
  - Expect FAIL initially, PASS after implementation

- [ ] **Commit:** `git commit -m "refactor(workflow-templates): accept channels argument + use buildChannelBlock"`

---

## Task 3: Thread `channels` through 4 call sites

**Files (Modify):**
1. `/Users/macintosh/Documents/work/afina-ai-first/src/sections/campaigns/workflow-view.tsx`
   - Lines: `initialGraph()` function and its call to `createTemplate()`
2. `/Users/macintosh/Documents/work/afina-ai-first/src/sections/campaigns/workflow-mini-preview.tsx`
   - Lines: `useMemo()` computing the graph
3. `/Users/macintosh/Documents/work/afina-ai-first/src/sections/campaigns/campaign-payment-screen.tsx`
   - Lines: `useMemo()` computing cost, calls `createTemplate()` and `graphCostFor()`
4. `/Users/macintosh/Documents/work/afina-ai-first/src/sections/campaigns/campaign-cost.ts` (or new campaign-graph-cost.ts)
   - Function `graphCostFor()` (if it exists) or cost calculation function

**Acceptance criteria:**
- All 4 sites extract channels from campaign/UI state and pass them to `createTemplate()`
- Channels come from: campaign config, wizard selections, or a default set
- Workflow graph is identical across all 4 sites for the same campaign/signal

**Steps:**

- [ ] **Identify channels source** in campaign state
  - Check: is there a `campaign.channels` field? If not, add it to Campaign type in app-state.ts
  - Proposed: `type Campaign = { …, channels: Channel[] }`

- [ ] **Modify workflow-view.tsx** 
  - Get channels from campaign or default to a sensible set (e.g., ['sms', 'email', 'push'])
  - Update `initialGraph()` to pass channels:
    ```typescript
    function initialGraph(signalType?: SignalType, signal?: Signal, channels?: Channel[]): GraphState {
      if (signalType) return createTemplate(signalType, signal, channels ?? ['sms', 'email', 'push']);
      return { nodes: createBaseNodes(), edges: createBaseEdges() };
    }
    ```

- [ ] **Modify workflow-mini-preview.tsx**
  - Extract channels from props/state
  - Pass to `createTemplate()` in the same way

- [ ] **Modify campaign-payment-screen.tsx**
  - Extract channels from campaign
  - Pass to `createTemplate()` when computing cost graph
  - **ALSO**: ensure `graphCostFor()` uses the same graph (fix aim #6 bug)

- [ ] **Verify consistency** across all 4 sites: write test asserting graphs are identical for same inputs
  - Test file: `src/sections/campaigns/campaign-payment-screen.test.ts` or new file
  - Test: `const g1 = createTemplate(type, signal, channels); const g2 = buildGraph(campaign, channels); expect(graphsEqual(g1, g2)).toBe(true);`

- [ ] **Run tests:** `npm test`
  - Expect all existing tests to pass (backward compat maintained)

- [ ] **Commit:** `git commit -m "refactor(call-sites): thread channels through workflow-view, mini-preview, payment-screen, cost"`

---

## Task 4: Fix pricing bug in `graphCostFor` (aim #6)

**Files (Modify):**
- `/Users/macintosh/Documents/work/afina-ai-first/src/sections/campaigns/campaign-cost.ts`
  - Current issue: `graphCostFor()` is called from campaign-payment-screen.tsx with a graph built by `createTemplate()`, but somewhere channels are being dropped (not included in the cost calculation)
- `/Users/macintosh/Documents/work/afina-ai-first/src/state/workflow-templates.ts` (for channel injection into wizard)
- `/Users/macintosh/Documents/work/afina-ai-first/src/sections/campaigns/step-budget.tsx` (if it overrides graph building)

**Acceptance criteria:**
- Wizard forecast (step-budget.tsx) builds graph with same channels as payment-screen
- `graphCostFor()` receives full graph including all channel nodes
- Cost calculation includes all channels (no drops)
- Test: cost(graph_with_channels) === cost(same_graph_on_payment_screen)

**Steps:**

- [ ] **Identify the bug:** Trace where channels are lost
  - Check: does step-budget.tsx call `createTemplate()` without channels?
  - Check: does `buildBudgetForecast()` in step-budget.tsx build its own graph?
  - Write test showing the discrepancy: cost_from_wizard ≠ cost_from_payment_screen

- [ ] **Write failing test** in `src/sections/campaigns/campaign-cost.test.ts`
  ```typescript
  it("cost is identical whether computed via wizard or payment screen", () => {
    const channels = ["sms", "email"];
    const graphWizard = createTemplate("Регистрация", signal, channels);
    const graphPayment = createTemplate("Регистрация", signal, channels);
    const costWizard = computeCampaignCost(graphWizard.nodes, graphWizard.edges, 1000);
    const costPayment = computeCampaignCost(graphPayment.nodes, graphPayment.edges, 1000);
    expect(costWizard.total).toBe(costPayment.total);
  });
  ```

- [ ] **Fix step-budget.tsx** (or equivalent) to use same channels as campaign config
  - Ensure `buildBudgetForecast()` calls `createTemplate(type, signal, campaign.channels)`
  - Verify no graph-building logic is duplicated or channels are lost in translation

- [ ] **Update `graphCostFor()` signature** if needed to accept channels explicitly
  - Old: `graphCostFor(graph: Template): Cost`
  - New: `graphCostFor(nodes, edges, N, channels?): Cost` (channels optional, inferred from nodes if missing)

- [ ] **Run test:** `npx vitest run src/sections/campaigns/campaign-cost.test.ts`
  - Expect PASS after fix

- [ ] **Commit:** `git commit -m "fix(campaign-cost): ensure wizard and payment screen use same graph + channels"`

---

## Task 5: Collapse hardcoded params duplication into `channel-nodes.ts`

**Files (Modify):**
- `/Users/macintosh/Documents/work/afina-ai-first/src/state/structural-commands.ts`
  - Function `defaultParamsFor()`: lines covering sms, email, push, ivr cases
- `/Users/macintosh/Documents/work/afina-ai-first/src/lib/ai/rebuild-schema.ts`
  - Function `defaultParams()`: lines covering sms, email, push, ivr cases

**Acceptance criteria:**
- `defaultParamsFor()` in structural-commands.ts delegates sms/email/push/ivr to `CHANNEL_NODE_MAP[kind].defaultParams`
- `defaultParams()` in rebuild-schema.ts delegates sms/email/push/ivr to `CHANNEL_NODE_MAP[kind].defaultParams`
- Single source of truth in channel-nodes.ts
- All tests pass

**Steps:**

- [ ] **Update structural-commands.ts**
  - Import `CHANNEL_NODE_MAP` from channel-nodes.ts
  - Refactor `defaultParamsFor()`:
    ```typescript
    import { CHANNEL_NODE_MAP } from "@/state/channel-nodes";
    
    function defaultParamsFor(kind: WorkflowNodeType): NodeParams | undefined {
      if (kind in CHANNEL_NODE_MAP) {
        return CHANNEL_NODE_MAP[kind as Channel].defaultParams;
      }
      // ... handle non-channel cases (signal, wait, condition, etc.)
      switch (kind) {
        case "signal": …
        case "wait": …
        case "condition": …
        case "split": …
        case "merge": …
        case "landing": …
        case "success": …
        case "end": …
        case "storefront": …
      }
    }
    ```

- [ ] **Update rebuild-schema.ts**
  - Import `CHANNEL_NODE_MAP` from channel-nodes.ts
  - Refactor `defaultParams()` similarly

- [ ] **Run tests:** `npm test`
  - Expect all tests to pass (no behavior change)

- [ ] **Commit:** `git commit -m "refactor(params): deduplicate channel defaults into CHANNEL_NODE_MAP"`

---

## Task 6: Linear scenario refactor — collapse secondary comm nodes into units

**Files (Modify):**
- `/Users/macintosh/Documents/work/afina-ai-first/src/state/workflow-templates.ts`
  - Functions: registrationTemplate, firstDealTemplate, reactivationTemplate, returnTemplate

**Acceptance criteria:**
- Each linear scenario has ONE communication unit at the main touchpoint (not 2–3 separate comm nodes)
- The unit includes: `buildCommUnit([channels], { onEngaged: successId, onExhausted: endId })`
- Fallback/retry logic is baked into the unit (condition + repeat + final condition)
- Graph shape matches Model B spec: signal → … → comm_unit → success/end

**Notes:** This is a refactoring of template structure. The user spec says "existing second touches/fallback comm nodes collapse into the unit."

**Steps:**

- [ ] **Analyze registrationTemplate()**
  - Current: signal → email → wait → push → success
  - Refactor: signal → wait → **communit([sms, email], { onEngaged: success, onExhausted: end })** → success/end
  - Or preserve logic if it's not a "second touch" (check spec for exact semantic)

- [ ] **Refactor each linear scenario** using `buildCommUnit()`
  - firstDealTemplate: (sms at signal) + (condition on opened) + (push as fallback)
  - reactivationTemplate: (sms after wait) + (condition on clicked) + (ivr as fallback)
  - returnTemplate: (email at signal) + (wait) + (push) + (condition on opened) + (storefront)

- [ ] **Write test** validating new structure per scenario
  - Test: registrationTemplate with channels includes a condition node from the comm unit
  - Test: edges form correct paths (YES → success, NO → wait → repeat → condition → end)

- [ ] **Run tests:** `npm test`
  - Expect PASS (test new structure + backward compat)

- [ ] **Commit:** `git commit -m "refactor(templates): linear scenarios use collapsed communication units"`

---

## Task 7: Segmented scenario refactor — per-branch comm units

**Files (Modify):**
- `/Users/macintosh/Documents/work/afina-ai-first/src/state/workflow-templates.ts`
  - Functions: upsellTemplate, retentionTemplate

**Acceptance criteria:**
- Split node branches each to their own comm unit (channel-segment pair)
- Lowest segment branches to "Конец" (no comm unit)
- All branches merge → success
- Graph shape: signal → split → [segment branches with comm units] → merge → success

**Steps:**

- [ ] **Analyze upsellTemplate()**
  - Current: split by segment → storefront (max) / email (high) / sms (mid) / end (low) → landing → merge → success
  - Refactor: split → [communit per segment] → landing → merge → success
    - High: email channel
    - Mid: sms channel
    - Low: end (no comm)
    - Max: storefront (or storefront as a comm channel if applicable)

- [ ] **Refactor retentionTemplate()**
  - Current: split by segment → ivr/email/push → merge → wait → success
  - Refactor: split → [ivr+email+push per segment? or per-segment selection?] → merge → wait → success
  - Clarify: are segment branches independent channel choices, or do all segments get the same channels?
  - (Per spec, likely: each segment gets ONE channel, lowest segment gets end)

- [ ] **Write test** validating per-branch structure
  - Test: upsellTemplate has N comm units (one per non-lowest segment)
  - Test: merge node exists and is reached from all segment branches

- [ ] **Run tests:** `npm test`
  - Expect PASS

- [ ] **Commit:** `git commit -m "refactor(templates): segmented scenarios use per-branch communication units"`

---

## Task 8: Export Channel type and update imports

**Files:**
- **Modify:** `/Users/macintosh/Documents/work/afina-ai-first/src/state/channel-nodes.ts`
  - Export `type Channel = "sms" | "email" | "push" | "ivr";`
- **Modify:** `/Users/macintosh/Documents/work/afina-ai-first/src/sections/campaigns/campaign-cost.ts`
  - Import `Channel` from channel-nodes.ts; remove local definition
- **Modify:** `/Users/macintosh/Documents/work/afina-ai-first/src/state/workflow-templates.ts`
  - Import `Channel` from channel-nodes.ts
- **Modify call sites:** workflow-view, workflow-mini-preview, campaign-payment-screen
  - Import `Channel` from channel-nodes.ts

**Acceptance criteria:**
- Single source of truth: `Channel` type in channel-nodes.ts
- All files import from there
- No duplicate definitions
- Type consistency across codebase

**Steps:**

- [ ] **Export Channel from channel-nodes.ts** at top of file
  ```typescript
  export type Channel = "sms" | "email" | "push" | "ivr";
  ```

- [ ] **Update campaign-cost.ts** to import Channel
  ```typescript
  import type { Channel } from "@/state/channel-nodes";
  // Remove: export type Channel = "sms" | "email" | "push" | "ivr";
  ```

- [ ] **Update workflow-templates.ts** to import Channel
  ```typescript
  import type { Channel } from "@/state/channel-nodes";
  ```

- [ ] **Update all 4 call sites** to import Channel from channel-nodes.ts

- [ ] **Run lint & types:** `npm run lint && npx tsc --noEmit`
  - Expect PASS

- [ ] **Commit:** `git commit -m "refactor(exports): unify Channel type in channel-nodes.ts"`

---

## Task 9: Lint, type-check, and full test suite

**Files:**
- All modified files from Tasks 1–8

**Acceptance criteria:**
- `npm run lint` passes
- `npx tsc --noEmit` passes
- `npm test` passes (all existing + new tests)
- No type errors or unused imports

**Steps:**

- [ ] **Run lint:** `npm run lint`
  - Fix any issues

- [ ] **Run type check:** `npx tsc --noEmit`
  - Fix any issues

- [ ] **Run tests:** `npm test`
  - All tests PASS

- [ ] **Commit:** `git commit -m "test(all): lint, types, and full test suite pass"`

---

## Task 10: Integration test — graph equality across all 4 call sites

**Files (Create/Modify):**
- **Create:** `/Users/macintosh/Documents/work/afina-ai-first/src/sections/campaigns/campaign-graph-consistency.test.ts` (new)

**Acceptance criteria:**
- For a given campaign, signal, and channels: all 4 call sites produce identical graphs
- Test covers linear + segmented scenarios
- Test covers all 6 scenario types

**Steps:**

- [ ] **Write test file:**
  ```typescript
  import { describe, it, expect } from "vitest";
  import { createTemplate } from "@/state/workflow-templates";
  import { computeCampaignCost } from "@/sections/campaigns/campaign-cost";
  // Mock campaign/signal objects
  
  describe("campaign graph consistency across call sites", () => {
    it("workflow-view and campaign-payment-screen compute identical costs", () => {
      const signal = { …signal fixture };
      const channels = ["sms", "email"];
      const g1 = createTemplate(signal.type, signal, channels);
      const g2 = createTemplate(signal.type, signal, channels);
      const cost1 = computeCampaignCost(g1.nodes, g1.edges, signal.count);
      const cost2 = computeCampaignCost(g2.nodes, g2.edges, signal.count);
      expect(cost1.total).toBe(cost2.total);
    });
  });
  ```

- [ ] **Run test:** `npx vitest run src/sections/campaigns/campaign-graph-consistency.test.ts`
  - Expect PASS

- [ ] **Commit:** `git commit -m "test(integration): graph consistency across all 4 call sites"`

---

## Shared-file Coordination Note

The following shared files are touched by this plan in **different functions**, minimizing conflicts:

### `src/state/structural-commands.ts`
- **Function modified:** `defaultParamsFor()`
- **Lines affected:** sms/email/push/ivr cases (see current code for exact line range)
- **Change:** delegate to `CHANNEL_NODE_MAP[kind].defaultParams` instead of hardcoded switch cases
- **Non-overlapping:** All other functions and cases in `defaultParamsFor()` (signal, wait, condition, split, merge, landing, success, end, storefront) remain unchanged

### `src/lib/ai/rebuild-schema.ts`
- **Function modified:** `defaultParams()`
- **Lines affected:** sms/email/push/ivr cases
- **Change:** delegate to `CHANNEL_NODE_MAP[kind].defaultParams`
- **Non-overlapping:** All other cases (signal, wait, condition, split, merge, landing, success, end, storefront) remain unchanged

### `src/sections/campaigns/campaign-cost.ts`
- **Type modified:** `Channel` type (moved to channel-nodes.ts)
- **Constants modified:** `CHANNEL_LABEL`, `UNIT_COST` (referenced by channel-nodes.ts; original definitions remain for backward compat, or migrate to channel-nodes.ts)
- **Non-overlapping:** `computeReach()`, `computeCampaignCost()`, `estimateTouches()` logic unchanged; only imports updated

### `src/state/workflow-templates.ts`
- **Function modified:** `createTemplate()` signature
- **Functions refactored:** `registrationTemplate()`, `firstDealTemplate()`, `upsellTemplate()`, `reactivationTemplate()`, `returnTemplate()`, `retentionTemplate()` — each inserts `buildChannelBlock()` or `buildCommUnit()` at appropriate points
- **Non-overlapping:** Helper functions `n()`, `e()`, `TEMPLATE_BY_TYPE` export remain; logic refactored, not duplicated

### App State
- **Type modified:** `Campaign` type in `src/state/app-state.ts`
- **Added field:** `channels: Channel[]`
- **Non-overlapping:** All other fields unchanged

---

## Backward Compatibility

All changes maintain backward compatibility:
- `createTemplate(type)` and `createTemplate(type, signal)` still work (channels defaults to undefined, uses original behavior)
- Old call sites that don't pass channels will continue to work (fallback to single-channel or legacy templates)
- Existing tests pass without modification (except where new behavior is explicitly tested)

---

## Definition of Done

1. All 10 tasks completed with green checkboxes
2. `npm test` passes (100% test coverage for new module)
3. `npm run lint` passes
4. `npx tsc --noEmit` passes
5. No type errors or warnings
6. All 4 call sites verified to build identical graphs for same inputs
7. Price bug (aim #6) is fixed: wizard and payment screen costs match
8. No duplication of channel-to-node mappings across codebase
9. All commits are atomic and have clear messages
10. Code review ready: plan fully implemented with TDD flow
