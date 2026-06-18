# Campaign-First Migration — Wave 0 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the campaign-centric data contracts and invert the create-flow so a Campaign is the root entity and the former Signal becomes a campaign-scoped Artifact — without breaking the build, so the six Wave-1 epics can then proceed in parallel against stable types.

**Architecture:** Additive-first. We add the new types/fields/actions/routes alongside the old ones (build stays green), migrate the reducer create-flow and joins to the inverted model, replace section bodies with stubs where an epic will own them, do the structural `git mv` of the wizard, and only then delete the now-dead old surface. Each task ends green (tsc + vitest).

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, React reducer state in `src/state/app-state.ts`, Vitest (`npx vitest run`), `nanoid` for ids.

**Source spec:** `docs/superpowers/specs/2026-06-18-campaign-first-migration-design.md` (read §1 V2 inversion, §2 entity contract, §3 source matrix, §8 strategy).

**⚠️ Two environment facts that bite (verified):**
1. The repo dir name has non-ASCII chars with NFC/NFD ambiguity. The `Read`/`Write` tools may resolve to a stray sibling dir. Work through the shell (its cwd is the real git repo) or an ASCII symlink: `ln -sfn "$(pwd)" /tmp/afina-repo`.
2. `Signal`/`Campaign`/`AppState`/`Action` all live in `src/state/app-state.ts` (NOT `src/types/`). `src/types/campaign.ts` is only the wizard `StepData`. Cost lives in `src/sections/campaigns/campaign-cost.ts`. `Channel` currently exists only in that cost file.

---

## File Structure

**Contracts (Foundation owns exclusively — frozen after this wave):**
- `src/types/campaign.ts` — `StepData`, plus new `SourceType`, `Channel`, `CHANNELS`.
- `src/types/workflow.ts` — `WorkflowNodeType` += `source`, `scoring`.
- `src/state/app-state.ts` — `Artifact`, `MessageTemplate`, `Campaign` fields, `SectionName`, `View`, `Action`, `AppState.artifacts`, inverted create-flow reducers, presets.
- `src/app/page.tsx` — routing: add `Артефакты` branch, wizard entry via `start_campaign_flow`, drop `campaign-select`.

**Structural move (Foundation does the `git mv`; epics edit contents later):**
- `src/sections/signals/{campaign-workspace,campaign-stepper}.tsx` + `steps/*` + `wizard-navigation.ts` → `src/sections/campaigns/wizard/`.

**Stubs created by Foundation (a Wave-1 epic replaces each body):**
- `src/sections/artifacts/artifacts-section.tsx` — new stub (Артефакты epic).

**Not touched by Foundation:** `sections/settings`, `sections/statistics` internals, `sections/welcome` copy, `campaign-cost.ts` math.

---

## Task 0: Isolated worktree

**Files:** none (git only).

- [ ] **Step 1: Create the Foundation worktree off main** (AGENTS.md mandates worktrees for parallel work)

Run from the repo root:
```bash
git worktree add .worktrees/foundation -b feature/campaign-first-foundation main
cd .worktrees/foundation
npm install
```

- [ ] **Step 2: Confirm a green baseline before any change**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; vitest all-pass. If red on a clean checkout, STOP and report — the plan assumes a green baseline.

---

## Task 1: Add `SourceType` / `Channel` contracts (additive, nothing references them yet)

**Files:**
- Modify: `src/types/campaign.ts`
- Test: `src/types/campaign.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/types/campaign.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CHANNELS, type Channel, type SourceType, initialStepData } from "./campaign";

describe("campaign source/channel contracts", () => {
  it("exposes the three source types via initialStepData default", () => {
    expect(initialStepData.sourceType).toBe("new");
  });

  it("lists exactly the four channels", () => {
    expect(CHANNELS).toEqual(["sms", "push", "email", "ivr"]);
  });

  it("types compile for every union member", () => {
    const sources: SourceType[] = ["new", "stream", "own"];
    const chans: Channel[] = ["sms", "push", "email", "ivr"];
    expect(sources.length + chans.length).toBe(7);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/types/campaign.test.ts`
Expected: FAIL — `CHANNELS`/`sourceType` not exported / not on `initialStepData`.

- [ ] **Step 3: Add the contracts to `src/types/campaign.ts`**

At the top of the file, above `TriggerConfig`:
```ts
export type SourceType = "new" | "stream" | "own";

export type Channel = "sms" | "push" | "email" | "ivr";

export const CHANNELS = ["sms", "push", "email", "ivr"] as const satisfies readonly Channel[];
```

In `StepData`, replace the `segments: string[];` line with the new source fields (we drop the wizard segment selection per design §3/§13) and add channels:
```ts
  sourceType: SourceType;
  /** Selected communication channels. Empty array = degenerate campaign (no comms). */
  channels: Channel[];
```
Keep `interests`, `triggers`, `triggerConfig`, `budget`, `file`, `fileRowCount?`, `budgetMode?` as-is. Add `dailyBudget` for the stream source:
```ts
  /** Stream source only: per-day cap, alongside `budget` as the total ceiling. */
  dailyBudget?: number;
```

Update `initialStepData` to drop `segments` and seed the new fields:
```ts
export const initialStepData: StepData = {
  scenario: null,
  interests: [],
  triggers: [],
  triggerConfig: {},
  sourceType: "new",
  channels: [],
  budget: null,
  file: null,
};
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/types/campaign.test.ts`
Expected: PASS.

- [ ] **Step 5: Find every reader of the removed `StepData.segments`**

Run: `git grep -n "\.segments" -- src | grep -v "signal.segments\|\.segments\.\(max\|high\|mid\|low\)"`
Note the hits in `steps/step-3-segments.tsx`, `step-5-limit.tsx`, `campaign-cost.ts`, wizard navigation. These break compile and are fixed in Tasks 9–10 (move/stub). Do NOT fix them here.

- [ ] **Step 6: Commit (build will be red until Task 10 — commit the contract only)**

```bash
git add src/types/campaign.ts src/types/campaign.test.ts
git commit -m "feat(types): add SourceType/Channel, drop StepData.segments"
```

> Build is intentionally red between here and Task 10. The plan keeps `tsc` failures localized to wizard files that get stubbed/moved. Run `npx vitest run src/types src/state` to verify contract-level tests stay green meanwhile.

---

## Task 2: Add `source` / `scoring` workflow node types (additive)

**Files:**
- Modify: `src/types/workflow.ts:3-26`
- Test: `src/types/workflow.test.ts` (existing — extend)

- [ ] **Step 1: Write the failing assertion**

Append to `src/types/workflow.test.ts`:
```ts
import type { WorkflowNodeType } from "./workflow";

it("source and scoring are valid node types", () => {
  const a: WorkflowNodeType = "source";
  const b: WorkflowNodeType = "scoring";
  expect([a, b]).toEqual(["source", "scoring"]);
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/types/workflow.test.ts`
Expected: FAIL — `"source"`/`"scoring"` not assignable to `WorkflowNodeType`.

- [ ] **Step 3: Extend the union**

In `src/types/workflow.ts`, in the `WorkflowNodeType` union, add to the endpoints group:
```ts
  | "source"   // entry node (replaces "signal" as the graph root; carries sourceType + interests)
  | "scoring"  // quality/segment selection (new/stream only)
```
Leave the legacy `"signal"` member in place for now — the templates still emit it; Task 8 maps it.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/types/workflow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/workflow.ts src/types/workflow.test.ts
git commit -m "feat(types): add source/scoring workflow node types"
```

---

## Task 3: Add `Artifact` and `MessageTemplate` types (additive, alongside `Signal`)

**Files:**
- Modify: `src/state/app-state.ts:45-94`
- Test: `src/state/artifact-types.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/state/artifact-types.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { Artifact, MessageTemplate } from "./app-state";

describe("artifact + template contracts", () => {
  it("Artifact is campaign-scoped with a kind", () => {
    const a: Artifact = {
      id: "art_1",
      campaignId: "cmp_1",
      kind: "signals",
      count: 100,
      createdAt: "2026-06-18T00:00:00.000Z",
    };
    expect(a.kind).toBe("signals");
  });

  it("MessageTemplate is channel-typed with a usage counter", () => {
    const t: MessageTemplate = {
      id: "tpl_1",
      channel: "sms",
      name: "Напоминание",
      content: { kind: "sms", text: "Привет", alphaName: "AFINA", scheduledAt: "immediate" },
      usedInCampaigns: 0,
    };
    expect(t.channel).toBe("sms");
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/state/artifact-types.test.ts`
Expected: FAIL — `Artifact`/`MessageTemplate` not exported.

- [ ] **Step 3: Add the types after the `Campaign` type (around line 94) in `src/state/app-state.ts`**

```ts
/**
 * Output of a campaign (formerly the top-level `Signal`). Campaign-scoped:
 * keyed by `campaignId` rather than the campaign referencing it. Per-contact
 * score lives in the file these represent — not modelled here for the prototype.
 */
export type Artifact = {
  id: string;
  campaignId: string;
  kind: "signals" | "signals_conversions";
  count: number;
  createdAt: string;
};

/**
 * A reusable, channel-typed message set assigned to a communication node.
 * Flat by design (no variants): `content` is the field set of one channel.
 */
export type MessageTemplate = {
  id: string;
  channel: Channel;
  name: string;
  content: NodeParams;
  usedInCampaigns: number;
};
```

Add `Channel` to the existing import from `@/types/campaign` at the top of the file:
```ts
import type { StepData, Channel } from "@/types/campaign";
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/state/artifact-types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/app-state.ts src/state/artifact-types.test.ts
git commit -m "feat(state): add Artifact + MessageTemplate types"
```

---

## Task 4: Extend `Campaign` with source/channel/phase fields (additive optionals)

**Files:**
- Modify: `src/state/app-state.ts:78-94`
- Test: `src/state/campaign-shape.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/state/campaign-shape.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { Campaign } from "./app-state";

describe("Campaign campaign-first fields", () => {
  it("carries sourceType, channels, and phase", () => {
    const c: Campaign = {
      id: "cmp_1",
      name: "Test",
      status: "draft",
      createdAt: "2026-06-18T00:00:00.000Z",
      sourceType: "new",
      channels: ["sms"],
      phase: "scoring",
    };
    expect(c.sourceType).toBe("new");
  });
});
```
Note: this test omits `signalId`, which still exists as required at this point — so it must FAIL to compile until Step 3 makes `signalId` optional.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/state/campaign-shape.test.ts`
Expected: FAIL — missing `signalId`, and `sourceType`/`channels`/`phase` not on `Campaign`.

- [ ] **Step 3: Edit the `Campaign` type**

In `src/state/app-state.ts`, change `signalId: string;` to optional (it is removed entirely in Task 6; making it optional first keeps existing reducers compiling):
```ts
  /** @deprecated removed by campaign-first inversion (Task 6). Optional during migration. */
  signalId?: string;
```
Add the new fields before `scenario?`:
```ts
  sourceType?: SourceType;
  channels?: Channel[];
  interests?: string[];
  file?: { name: string; rowCount: number };
  dailyBudget?: number;
  /**
   * Distinguishes "scoring running" from "communication started" — `status`
   * alone ("active") cannot. Drives the in-card progress block (design §4).
   */
  phase?: "scoring" | "communicating";
```
Add `SourceType` to the campaign import:
```ts
import type { StepData, Channel, SourceType } from "@/types/campaign";
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/state/campaign-shape.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify nothing else broke at the type level**

Run: `npx vitest run src/state`
Expected: all `src/state` tests PASS (Campaign change is additive + optional).

- [ ] **Step 6: Commit**

```bash
git add src/state/app-state.ts src/state/campaign-shape.test.ts
git commit -m "feat(state): add Campaign source/channel/phase fields"
```

---

## Task 5: Add `start_campaign_flow` action + `Артефакты` section/view (additive)

**Files:**
- Modify: `src/state/app-state.ts` (`SectionName` ~103, `Action` ~214-290, reducer)
- Test: `src/state/start-campaign-flow.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/state/start-campaign-flow.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { appReducer, initialState } from "./app-state";

describe("start_campaign_flow", () => {
  it("routes a survey-completed user into the wizard", () => {
    const ready = { ...initialState, surveyStatus: "completed" as const };
    const next = appReducer(ready, { type: "start_campaign_flow" });
    expect(next.view.kind).toBe("guided-signal");
  });

  it("routes a first-time user into the survey", () => {
    const next = appReducer(initialState, { type: "start_campaign_flow" });
    expect(next.view.kind).toBe("survey");
  });
});
```
> We reuse the existing `guided-signal` view kind as the wizard host for now (renaming the view is a Wave-1 cosmetic, not a contract). `appReducer` is the exported reducer name — confirm via `git grep "export function appReducer\|export const appReducer" src/state/app-state.ts`; if the export differs, use the actual name.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/state/start-campaign-flow.test.ts`
Expected: FAIL — `start_campaign_flow` not in `Action`.

- [ ] **Step 3: Add the action + reducer case + section name**

In `SectionName` add `"Артефакты"`:
```ts
export type SectionName = "Статистика" | "Сигналы" | "Артефакты" | "Кампании" | "Настройки";
```
In the `Action` union, directly under the `start_signal_flow` line, add:
```ts
  | { type: "start_campaign_flow"; initialScenario?: { id: string; name: string } }
```
In `appReducer`, add a case that delegates to the same body as `start_signal_flow` (find the `case "start_signal_flow":` block at ~line 334 and make both labels share it):
```ts
    case "start_signal_flow":
    case "start_campaign_flow":
```
(Stack the two `case` labels above the existing `start_signal_flow` body. No body change.)

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/state/start-campaign-flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/app-state.ts src/state/start-campaign-flow.test.ts
git commit -m "feat(state): add start_campaign_flow action + Артефакты section name"
```

---

## Task 6: Add `AppState.artifacts` and invert the create-flow (Signal → Artifact)

This is the core inversion. The reducer create-flow currently builds a `Signal`, then `signal_complete`/`step2_clicked` create a `Campaign` referencing it via `signalId`. We invert: the wizard's launch creates a **Campaign (root)** carrying source/channels, and an **Artifact** keyed by `campaignId`. The old `signals` array and `Signal` type stay temporarily for presets/metrics (removed in Wave 1), but new flow writes `artifacts`.

**Files:**
- Modify: `src/state/app-state.ts` — `AppState` shape, `initialState`, `signal_added`, `signal_complete`/`step2_clicked`, `campaign_from_signal`, `campaign_selected`.
- Test: `src/state/create-flow-inversion.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/state/create-flow-inversion.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { appReducer, initialState, type Campaign } from "./app-state";

function draftCampaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "cmp_seed",
    name: "Seed",
    status: "draft",
    createdAt: "2026-06-18T00:00:00.000Z",
    sourceType: "new",
    channels: ["sms"],
    ...over,
  };
}

describe("create-flow inversion", () => {
  it("artifacts are keyed by campaignId, not the reverse", () => {
    const state = {
      ...initialState,
      campaigns: [draftCampaign()],
      artifacts: [
        { id: "art_1", campaignId: "cmp_seed", kind: "signals" as const, count: 10, createdAt: "x" },
      ],
    };
    const linked = state.artifacts.filter((a) => a.campaignId === "cmp_seed");
    expect(linked).toHaveLength(1);
    expect("signalId" in state.campaigns[0]).toBe(false);
  });

  it("campaign_artifact_ready appends an artifact for the campaign", () => {
    const state = { ...initialState, campaigns: [draftCampaign()] };
    const next = appReducer(state, {
      type: "campaign_artifact_ready",
      campaignId: "cmp_seed",
      kind: "signals",
      count: 250,
    });
    expect(next.artifacts).toHaveLength(1);
    expect(next.artifacts[0].campaignId).toBe("cmp_seed");
    expect(next.artifacts[0].count).toBe(250);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/state/create-flow-inversion.test.ts`
Expected: FAIL — `artifacts` not on `AppState`, `campaign_artifact_ready` not an action.

- [ ] **Step 3: Add `artifacts` to `AppState` + `initialState`**

In the `AppState` type (search `signals: Signal[]`), add beneath it:
```ts
  artifacts: Artifact[];
```
In `initialState` (search `signals: [],` near line 297), add:
```ts
  artifacts: [],
```

- [ ] **Step 4: Add the `campaign_artifact_ready` action + reducer case**

In the `Action` union add:
```ts
  | { type: "campaign_artifact_ready"; campaignId: string; kind: Artifact["kind"]; count: number }
```
In `appReducer`, add the case (place it near the campaign cases):
```ts
    case "campaign_artifact_ready": {
      const artifact: Artifact = {
        id: `art_${nanoid(8)}`,
        campaignId: action.campaignId,
        kind: action.kind,
        count: action.count,
        createdAt: new Date().toISOString(),
      };
      return { ...state, artifacts: [...state.artifacts, artifact] };
    }
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/state/create-flow-inversion.test.ts`
Expected: PASS.

- [ ] **Step 6: Make the existing create-flow stop writing `signalId`**

In `signal_complete`/`step2_clicked` (lines ~360-406) and `campaign_from_signal` (~448-474) and `campaign_selected` (~408-446): in each `newCampaign` object literal, **remove the `signalId:` line** and **add** `sourceType: "new", channels: [],` so new campaigns are valid under the inverted contract. Leave the `scenario` field. These reducers still run today (until the wizard is rewired in Wave 1), so they must produce contract-valid campaigns. Where a reducer reads `c.signalId === latestSignal.id` to find an existing draft, replace the dedup with the campaign's own id flow: keep the "open existing draft" branch but match on `c.status === "draft" && c.scenario?.id === (latestSignal.wizardData?.scenario ?? "")` instead of `signalId`.

- [ ] **Step 7: Run the full state suite + tsc**

Run: `npx vitest run src/state && npx tsc --noEmit 2>&1 | grep "app-state" || echo "app-state clean"`
Expected: `src/state` tests PASS; no `app-state.ts` type errors. (Other files may still error — fixed in later tasks.)

- [ ] **Step 8: Commit**

```bash
git add src/state/app-state.ts src/state/create-flow-inversion.test.ts
git commit -m "feat(state): invert create-flow — Campaign root + campaignId-keyed Artifact"
```

---

## Task 7: Route `Артефакты` + wizard entry; drop `campaign-select` in `page.tsx`

**Files:**
- Modify: `src/state/app-state.ts` — `View`, `flyout_campaign_select`, `signal_complete` no-signal fallback.
- Modify: `src/app/page.tsx:91-108`
- Modify: `src/sections/shell/app-sidebar.tsx:43-47`
- Create: `src/sections/artifacts/artifacts-section.tsx` (stub)
- Test: `src/state/routing.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/state/routing.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { appReducer, initialState } from "./app-state";

describe("artifacts routing", () => {
  it("sidebar_nav to Артефакты opens the artifacts section", () => {
    const next = appReducer(initialState, { type: "sidebar_nav", section: "Артефакты" });
    expect(next.view).toMatchObject({ kind: "section", name: "Артефакты" });
  });

  it("flyout_campaign_select goes straight to the wizard (no campaign-select)", () => {
    const ready = { ...initialState, surveyStatus: "completed" as const };
    const next = appReducer(ready, { type: "flyout_campaign_select" });
    expect(next.view.kind).toBe("guided-signal");
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/state/routing.test.ts`
Expected: FAIL — `flyout_campaign_select` still routes to `campaign-select`.

- [ ] **Step 3: Repoint `flyout_campaign_select`**

Find the `case "flyout_campaign_select":` block (~lines 760-768). Replace its body so it dispatches the same result as `start_campaign_flow`:
```ts
    case "flyout_campaign_select":
      return appReducer(state, { type: "start_campaign_flow" });
```
In `signal_complete`/`step2_clicked`, change the no-signal fallback `return { ...state, view: { kind: "campaign-select" } };` to:
```ts
      if (!latestSignal) {
        return appReducer(state, { type: "start_campaign_flow" });
      }
```

- [ ] **Step 4: Run the routing test**

Run: `npx vitest run src/state/routing.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the Артефакты stub**

Create `src/sections/artifacts/artifacts-section.tsx`:
```tsx
"use client";

/**
 * Stub — replaced by the Артефакты epic (Wave 1, spec block 10).
 * Renders so routing + build stay green during Foundation.
 */
export function ArtifactsSection() {
  return (
    <div className="flex flex-1 items-center justify-center text-muted-foreground">
      Артефакты — раздел в разработке
    </div>
  );
}
```

- [ ] **Step 6: Wire `page.tsx`**

In `src/app/page.tsx`: remove the `campaign-select` branch (lines 91-98) and its `CampaignTypeView` import (line 28). Add the artifacts import:
```tsx
import { ArtifactsSection } from "@/sections/artifacts/artifacts-section";
```
In `renderMain`, inside the `view.kind === "section"` block, add before the `Настройки` line:
```tsx
      if (view.name === "Артефакты") return <ArtifactsSection />;
```

- [ ] **Step 7: Add `Артефакты` to the sidebar nav**

In `src/sections/shell/app-sidebar.tsx` `navItems` (lines 43-47), set the order to Кампании · Артефакты · Статистика, dropping the standalone Сигналы entry:
```tsx
const navItems = [
  { icon: Megaphone, label: "Кампании" },
  { icon: Files, label: "Артефакты" },
  { icon: BarChart2, label: "Статистика" },
];
```
Add `Files` to the lucide import line. (Icon choice `Files` is provisional — UI-decision item §7.1; flagged to confirm with the user, not blocking.)

- [ ] **Step 8: Verify routing + view union still compiles**

The `View` union still contains `campaign-select`; leave it for Task 11 (dead-code removal after grep confirms zero refs). Run: `npx vitest run src/state && npx tsc --noEmit 2>&1 | grep -E "page.tsx|app-sidebar|app-state" || echo "routing files clean"`
Expected: clean for those files.

- [ ] **Step 9: Commit**

```bash
git add src/state/app-state.ts src/app/page.tsx src/sections/shell/app-sidebar.tsx src/sections/artifacts/artifacts-section.tsx src/state/routing.test.ts
git commit -m "feat(nav): route Артефакты + wizard entry; bypass campaign-select"
```

---

## Task 8: Map the graph entry node `signal` → `source` at generation

**Files:**
- Modify: `src/state/workflow-templates.ts` (entry node) and/or `src/sections/campaigns/node-visuals.ts`
- Test: `src/state/workflow-templates.test.ts` (existing or create)

- [ ] **Step 1: Write the failing test**

Create/extend `src/state/workflow-templates.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createTemplate } from "./workflow-templates";

describe("graph entry node", () => {
  it("entry node is of type source", () => {
    const g = createTemplate("Регистрация", {
      id: "art_1", type: "Регистрация", count: 100,
      segments: { max: 25, high: 25, mid: 25, low: 25 },
      createdAt: "x", updatedAt: "x",
    } as never);
    const entry = g.nodes[0];
    expect(entry.data.nodeType).toBe("source");
  });
});
```
> Confirm `createTemplate`'s real signature via `git grep "export function createTemplate" src/state/workflow-templates.ts` and adapt the second arg to the actual `Signal`/`Artifact` shape it expects.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/state/workflow-templates.test.ts`
Expected: FAIL — entry node is still `"signal"`.

- [ ] **Step 3: Rename the entry node type in every template**

In `src/state/workflow-templates.ts`, in each template's first node call (the `n("signal", "Сигнал", "signal", …)` form), change the node-type argument from `"signal"` to `"source"`. Keep the node id `"signal"` ONLY if other code looks it up by id; safer is to also update lookups. Then update the cost lookup in `src/sections/campaigns/workflow-section.tsx` (`g.nodes.find(n => n.data.nodeType === "signal")`) to `=== "source"`.

- [ ] **Step 4: Add visuals for `source` and `scoring`**

In `src/sections/campaigns/node-visuals.ts`, add `NODE_STYLES.source`, `NODE_STYLES.scoring`, `NODE_ICON.source`, `NODE_ICON.scoring`. (Exact colors/icons are UI-decision item §7.7 — use the existing `signal` node's style as the provisional value and flag for user confirmation; do not invent a new palette.)

- [ ] **Step 5: Run the templates + node-visuals tests**

Run: `npx vitest run src/state/workflow-templates.test.ts src/sections/campaigns/node-visuals.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/state/workflow-templates.ts src/sections/campaigns/workflow-section.tsx src/sections/campaigns/node-visuals.ts src/state/workflow-templates.test.ts
git commit -m "feat(workflow): graph entry node signal→source + source/scoring visuals"
```

---

## Task 9: `git mv` the wizard into `sections/campaigns/wizard/`

**Files:** structural move only — no logic change in this task.

- [ ] **Step 1: Move the files preserving history**

```bash
mkdir -p src/sections/campaigns/wizard
git mv src/sections/signals/campaign-workspace.tsx src/sections/campaigns/wizard/campaign-workspace.tsx
git mv src/sections/signals/campaign-stepper.tsx src/sections/campaigns/wizard/campaign-stepper.tsx
git mv src/sections/signals/campaign-stepper.test.ts src/sections/campaigns/wizard/campaign-stepper.test.ts
git mv src/sections/signals/wizard-navigation.ts src/sections/campaigns/wizard/wizard-navigation.ts
git mv src/sections/signals/wizard-navigation.test.ts src/sections/campaigns/wizard/wizard-navigation.test.ts
git mv src/sections/signals/steps src/sections/campaigns/wizard/steps
```

- [ ] **Step 2: Fix import paths**

Run: `git grep -lE "sections/signals/(campaign-workspace|campaign-stepper|wizard-navigation|steps)" -- src`
For each hit, rewrite the import to `@/sections/campaigns/wizard/...`. Also fix relative imports INSIDE the moved files (e.g. `./campaign-stepper`, `../signal-screen`) — the latter now needs `@/sections/signals/signal-screen`.

- [ ] **Step 3: Verify the moved tests still pass**

Run: `npx vitest run src/sections/campaigns/wizard`
Expected: PASS (campaign-stepper + wizard-navigation tests).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: move wizard into sections/campaigns/wizard (git mv)"
```

---

## Task 10: Stub the segment step + fix `StepData.segments` fallout (restore green build)

**Files:**
- Modify: `src/sections/campaigns/wizard/steps/step-3-segments.tsx` (neutralize), `step-5-limit.tsx`, `campaign-workspace.tsx`, `src/sections/campaigns/campaign-cost.ts` if it reads `StepData.segments`.

- [ ] **Step 1: Find remaining `StepData.segments` readers**

Run: `git grep -n "\.segments" -- src/sections/campaigns/wizard src/sections/campaigns/campaign-cost.ts | grep -v "\.segments\.\(max\|high\|mid\|low\)"`
Expected: hits in step-3, step-5 (budget-from-segments), workspace stepper config.

- [ ] **Step 2: Remove step-3 from the wizard step list**

In `campaign-workspace.tsx` and `campaign-stepper.tsx` `STEPPER_ITEMS`, delete the "Сегменты" step entry so the wizard no longer renders `Step3Segments`. (Full 4-step restructure is the Wave-1 Кампании epic; here we only remove the segment step to unblock compile.) Replace the body of `step-3-segments.tsx` with a default-exported no-op component returning `null`, OR delete the file and its references — pick deletion if no other module imports it: `git grep -l step-3-segments src`.

- [ ] **Step 3: Make budget independent of segments**

In `step-5-limit.tsx` (and `campaign-cost.ts` if applicable), replace any `data.segments`-derived budget basis with `recommendBudget(data.fileRowCount ?? <scenario default>)` (design §5). Keep `Signal.segments`/`SignalParams.segments` object usages untouched — those are the scoring-output object, not the removed wizard field.

- [ ] **Step 4: Full green check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests PASS. This is the first fully-green checkpoint since Task 1.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(wizard): drop segment step; budget no longer depends on segments"
```

---

## Task 11: Remove dead surface (`campaign-select`, `CampaignTypeView`, `new-campaign-menu`)

**Files:** deletions + `View`/`ViewAddress` union trim.

- [ ] **Step 1: Confirm zero references**

Run:
```bash
git grep -n "campaign-select\|CampaignTypeView\|new-campaign-menu\|NewCampaignMenu" -- src
```
Expected: only the definitions themselves + `View`/`ViewAddress` union members. If a live dispatcher remains, repoint it to `start_campaign_flow` first.

- [ ] **Step 2: Delete the dead files**

```bash
git rm src/sections/campaigns/campaign-type-view.tsx src/sections/campaigns/new-campaign-menu.tsx
```
Fix any import that referenced them (campaigns-section may import `NewCampaignMenu` — replace its use with the existing "Создать кампанию" CTA dispatching `start_campaign_flow`; the visual CTA is a Wave-1 detail, here just keep it compiling).

- [ ] **Step 3: Trim the unions**

In `src/state/app-state.ts`, remove `| { kind: "campaign-select" }` from both `View` and `ViewAddress`. Remove the `flyout_campaign_select`→campaign-select mapping leftovers and any `viewToAddress` campaign-select branch.

- [ ] **Step 4: Full green check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove campaign-select / CampaignTypeView / new-campaign-menu"
```

---

## Task 12: Foundation gate — verify the Wave-1 start criteria

**Files:** none (verification only).

- [ ] **Step 1: Contracts compile and are frozen**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Full suite green**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 3: Lint + build**

Run: `npx next build` (or `npm run build`)
Expected: build succeeds. The Артефакты stub renders; the wizard is reachable via Создать кампанию / flyout; no `campaign-select` route remains.

- [ ] **Step 4: Manual smoke (dev server on a non-default port to respect AGENTS.md)**

Run: `npx next dev -p 3001`
Verify: sidebar shows Кампании · Артефакты · Статистика; "Создать кампанию" opens the wizard; opening Артефакты shows the stub; a launched campaign still opens its workflow.

- [ ] **Step 5: Report worktree + branch to the user**

Foundation is complete on `feature/campaign-first-foundation` at `.worktrees/foundation`. Per AGENTS.md, merge is the user's call. Wave-1 epics may now branch off this once merged.

---

## Self-Review (completed)

- **Spec coverage:** §1 inversion → Tasks 3,4,6; §2 contracts → Tasks 1,3,4; §3 source matrix fields → Tasks 1,4 (behavior is Wave-1); §4 phase field → Task 4; §6 block 1 nav → Task 7; block 2 campaign-select → Tasks 7,11; block 3 StepData → Tasks 1,10; block 4 node types → Tasks 2,8; block 13 segments → Tasks 1,10; §8 structural move → Task 9; stubs → Task 7. Source-matrix *behavior* (per-source scoring/budget/path), estimator (§5), templates (§2/block 10), statistics (block 11), phase rendering (block 9), node needs-attention (A6), autosave fix (A4) are explicitly Wave-1 epic scope — out of Foundation.
- **Placeholders:** none. UI-undetermined values (Артефакты icon Task 7; source/scoring colors Task 8) use the existing node/style as a provisional and are flagged as §7 user-decisions, not left blank.
- **Type consistency:** `Artifact{id,campaignId,kind,count,createdAt}`, `MessageTemplate{id,channel,name,content,usedInCampaigns}`, `campaign_artifact_ready{campaignId,kind,count}`, `start_campaign_flow` used identically across Tasks 3–11.
- **Known intentional red window:** build is red Tasks 1→10 by design (contract-first, stub-after); first green checkpoint is Task 10 Step 4. Each task still keeps `src/state`/`src/types` unit tests green.
- **Addendum:** the "Wave 0 — Addendum: cross-epic contract completion" section below (Tasks 13–18) extends spec coverage to the remaining hub contracts the six Wave-1 epics depend on — templates in state (§2/block 10), `Campaign.templateIds`, `campaign_launched` template/dailyBudget merge, `campaign_phase_advanced` (§4), the artifact-ready badge, and the artifact detail view/action — all owned by Foundation and frozen here.

---

## Wave 0 — Addendum: cross-epic contract completion

> **Why an addendum:** Tasks 1–12 froze the entity types, the create-flow inversion, routing, and the structural move. Six Wave-1 epics (artifacts, statistics, campaigns, shell) still depend on a handful of *hub* contracts that only Foundation may own — they live in `src/state/app-state.ts` and `src/app/page.tsx`. This section freezes exactly those, so the epics can build against stable shapes. Same rules as above: each task is a real TDD loop (failing `src/state/*.test.ts` → run → implement → pass → commit), complete code, exact paths, exact commands. These tasks assume Task 12's green baseline; run them after Foundation's core is green.

---

## Task 13: Seed `AppState.templates` with preset `MessageTemplate`s

The Шаблоны tab (Артефакты epic) and statistics both need real template data *before* any campaign launches. We add a `templates` slice to `AppState` and seed it from `PRESET_EMAILS` (channel `email`) plus one sms and one push sample, using the `MessageTemplate` shape Foundation added in Task 3 (`{ id, channel, name, content: NodeParams, usedInCampaigns }`, where `content` is the channel's `NodeParams` discriminated-union member).

**Files:**
- Modify: `src/state/app-state.ts` — `AppState` (add `templates`), `initialState` (seed), a new `PRESET_TEMPLATES` const.
- Test: `src/state/templates-seed.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/state/templates-seed.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { initialState, PRESET_TEMPLATES, type MessageTemplate } from "./app-state";

describe("seeded message templates", () => {
  it("initialState.templates is the preset set", () => {
    expect(initialState.templates).toBe(PRESET_TEMPLATES);
    expect(initialState.templates.length).toBeGreaterThanOrEqual(5);
  });

  it("seeds three email templates derived from the email directory", () => {
    const emails = initialState.templates.filter((t) => t.channel === "email");
    expect(emails).toHaveLength(3);
    expect(emails.every((t) => t.content.kind === "email")).toBe(true);
  });

  it("seeds at least one sms and one push sample", () => {
    const channels = new Set(initialState.templates.map((t) => t.channel));
    expect(channels.has("sms")).toBe(true);
    expect(channels.has("push")).toBe(true);
  });

  it("each template's content.kind matches its channel and usage starts at 0", () => {
    for (const t of initialState.templates as MessageTemplate[]) {
      expect(t.content.kind).toBe(t.channel);
      expect(t.usedInCampaigns).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/state/templates-seed.test.ts`
Expected: FAIL — `PRESET_TEMPLATES` not exported, `templates` not on `AppState`/`initialState`.

- [ ] **Step 3: Add the `PRESET_TEMPLATES` const**

In `src/state/app-state.ts`, add the email-directory import to the top-of-file imports (it already lives at `@/state/email-directory`):
```ts
import { getEmails } from "@/state/email-directory";
```
After the `MessageTemplate` type (added in Task 3), add the seed const. The three email templates are derived from the directory preset records; map each `EmailRecord` to an `EmailParams` content (`{ kind: "email", subject, body, sender, link }`). Then append one sms and one push sample:
```ts
/**
 * Seed templates so the Шаблоны tab + statistics have real data before any
 * launch. Email templates are derived 1:1 from the email directory presets
 * (channel "email"); the sms + push entries are hand-authored samples. Each
 * `content` is the channel's NodeParams member; `usedInCampaigns` starts at 0
 * and is bumped by `campaign_launched` (Task 15).
 */
export const PRESET_TEMPLATES: MessageTemplate[] = [
  ...getEmails().map<MessageTemplate>((e) => ({
    id: `tpl_${e.id}`,
    channel: "email",
    name: e.name,
    content: {
      kind: "email",
      subject: e.subject,
      body: e.body,
      sender: e.sender,
      link: e.link,
      emailId: e.id,
    },
    usedInCampaigns: 0,
  })),
  {
    id: "tpl_sms_reminder",
    channel: "sms",
    name: "SMS — напоминание",
    content: {
      kind: "sms",
      text: "Ваше предложение ждёт. Подробности на сайте.",
      alphaName: "AFINA",
      scheduledAt: "immediate",
      link: "https://example.com/offer",
    },
    usedInCampaigns: 0,
  },
  {
    id: "tpl_push_back",
    channel: "push",
    name: "Push — возвращение",
    content: {
      kind: "push",
      title: "Давно вас не видели",
      body: "Загляните — у нас есть кое-что для вас.",
      deeplink: "app://offers",
    },
    usedInCampaigns: 0,
  },
];
```
> `getEmails()` returns `PRESET_EMAILS` (3 records) at module load, since no session emails exist yet — giving exactly three email templates. Their ids are namespaced `tpl_<emailId>` to avoid colliding with the directory's own `eml_*` ids.

- [ ] **Step 4: Add `templates` to `AppState` + `initialState`**

In the `AppState` type, add beneath the `artifacts: Artifact[];` line (added in Task 6):
```ts
  templates: MessageTemplate[];
```
In `initialState`, add beneath `artifacts: [],`:
```ts
  templates: PRESET_TEMPLATES,
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/state/templates-seed.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify the state suite + app-state type-check**

Run: `npx vitest run src/state && npx tsc --noEmit 2>&1 | grep "app-state" || echo "app-state clean"`
Expected: `src/state` PASS; no `app-state.ts` errors.

- [ ] **Step 7: Commit**

```bash
git add src/state/app-state.ts src/state/templates-seed.test.ts
git commit -m "feat(state): seed AppState.templates from email presets + sms/push samples"
```

---

## Task 14: Add `Campaign.templateIds` (additive optional)

Statistics joins a campaign to the templates it used. Add the link as an optional field on `Campaign` (set by `campaign_launched` in Task 15).

**Files:**
- Modify: `src/state/app-state.ts` — `Campaign` type.
- Test: `src/state/campaign-template-link.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/state/campaign-template-link.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { Campaign } from "./app-state";

describe("Campaign → template linkage", () => {
  it("carries an optional templateIds list", () => {
    const c: Campaign = {
      id: "cmp_1",
      name: "Test",
      status: "draft",
      createdAt: "2026-06-18T00:00:00.000Z",
      sourceType: "new",
      channels: ["email"],
      templateIds: ["tpl_eml_offer"],
    };
    expect(c.templateIds).toEqual(["tpl_eml_offer"]);
  });
});
```
> Compiles only once `templateIds` is on `Campaign` — fails to type-check until Step 3.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/state/campaign-template-link.test.ts`
Expected: FAIL — `templateIds` not assignable to `Campaign`.

- [ ] **Step 3: Add the field**

In `src/state/app-state.ts`, in the `Campaign` type, add after the `dailyBudget?: number;` field (added in Task 4):
```ts
  /**
   * Ids of the `MessageTemplate`s this campaign launched with. Set by
   * `campaign_launched` (Task 15) from node-derived templates the launching
   * UI passes in. Absent on drafts and seeded preset campaigns.
   */
  templateIds?: string[];
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/state/campaign-template-link.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/app-state.ts src/state/campaign-template-link.test.ts
git commit -m "feat(state): add Campaign.templateIds link"
```

---

## Task 15: Emit templates + dailyBudget at launch (extend `campaign_launched`)

Graphs are NOT persisted in state, so the launching UI (Кампании epic) derives `MessageTemplate`s from the workflow's communication nodes and passes them in the `campaign_launched` payload. Foundation only defines the action shape + the merge logic: dedup incoming templates into `state.templates` by id (bump `usedInCampaigns` for an existing id, push with `usedInCampaigns: 1` for a new one), set the launched campaign's `templateIds`, and persist `dailyBudget` when present.

**Files:**
- Modify: `src/state/app-state.ts` — `campaign_launched` action variant + reducer case.
- Test: `src/state/campaign-launch-templates.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/state/campaign-launch-templates.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  appReducer,
  initialState,
  type Campaign,
  type MessageTemplate,
} from "./app-state";

function draft(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "cmp_seed",
    name: "Seed",
    status: "draft",
    createdAt: "2026-06-18T00:00:00.000Z",
    sourceType: "new",
    channels: ["sms"],
    ...over,
  };
}

const newTpl: MessageTemplate = {
  id: "tpl_launch_sms",
  channel: "sms",
  name: "SMS из ноды",
  content: { kind: "sms", text: "Привет", alphaName: "AFINA", scheduledAt: "immediate" },
  usedInCampaigns: 0,
};

describe("campaign_launched template + dailyBudget merge", () => {
  it("pushes a new template with usedInCampaigns: 1 and links it to the campaign", () => {
    const state = { ...initialState, campaigns: [draft()] };
    const next = appReducer(state, {
      type: "campaign_launched",
      id: "cmp_seed",
      timestamp: "2026-06-18T00:00:00.000Z",
      budget: 50000,
      templates: [newTpl],
    });
    const merged = next.templates.find((t) => t.id === "tpl_launch_sms");
    expect(merged?.usedInCampaigns).toBe(1);
    expect(next.campaigns[0].templateIds).toEqual(["tpl_launch_sms"]);
  });

  it("increments usedInCampaigns for an already-present template id (no duplicate)", () => {
    const seeded: MessageTemplate = { ...newTpl, usedInCampaigns: 2 };
    const state = { ...initialState, campaigns: [draft()], templates: [seeded] };
    const next = appReducer(state, {
      type: "campaign_launched",
      id: "cmp_seed",
      timestamp: "x",
      budget: 1000,
      templates: [{ ...newTpl, usedInCampaigns: 0 }],
    });
    const hits = next.templates.filter((t) => t.id === "tpl_launch_sms");
    expect(hits).toHaveLength(1);
    expect(hits[0].usedInCampaigns).toBe(3);
  });

  it("persists dailyBudget when present and leaves templates untouched when omitted", () => {
    const state = { ...initialState, campaigns: [draft()] };
    const before = state.templates.length;
    const next = appReducer(state, {
      type: "campaign_launched",
      id: "cmp_seed",
      timestamp: "x",
      budget: 1000,
      dailyBudget: 2500,
    });
    expect(next.campaigns[0].dailyBudget).toBe(2500);
    expect(next.templates).toHaveLength(before);
    expect(next.campaigns[0].templateIds ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/state/campaign-launch-templates.test.ts`
Expected: FAIL — `templates`/`dailyBudget` not on the `campaign_launched` payload; merge logic absent.

- [ ] **Step 3: Extend the action variant**

In `src/state/app-state.ts`, change the `campaign_launched` line in the `Action` union to:
```ts
  | { type: "campaign_launched"; id: string; timestamp: string; budget: number; templates?: MessageTemplate[]; dailyBudget?: number }
```

- [ ] **Step 4: Rewrite the `campaign_launched` reducer case**

Replace the existing `case "campaign_launched": { … }` body with:
```ts
    case "campaign_launched": {
      const c = state.campaigns.find((cc) => cc.id === action.id);
      if (!c) return state;

      // Merge node-derived templates into the shared library, deduping by id:
      // bump usage for an already-present id, push with usage 1 for a new one.
      const incoming = action.templates ?? [];
      const incomingIds = incoming.map((t) => t.id);
      const present = new Set(state.templates.map((t) => t.id));
      const templates: MessageTemplate[] = state.templates.map((t) =>
        incomingIds.includes(t.id)
          ? { ...t, usedInCampaigns: t.usedInCampaigns + 1 }
          : t
      );
      for (const t of incoming) {
        if (!present.has(t.id)) {
          templates.push({ ...t, usedInCampaigns: 1 });
        }
      }

      return {
        ...state,
        templates,
        campaigns: state.campaigns.map((cc) =>
          cc.id === action.id
            ? {
                ...cc,
                status: "active",
                launchedAt: cc.launchedAt ?? action.timestamp,
                // A real budget overwrites; a 0 (e.g. weird re-dispatch) keeps
                // the previously-stored value.
                budget: action.budget > 0 ? action.budget : cc.budget,
                dailyBudget: action.dailyBudget ?? cc.dailyBudget,
                templateIds: incomingIds.length > 0 ? incomingIds : cc.templateIds,
              }
            : cc
        ),
        view: { kind: "campaign", campaign: { id: c.id, name: c.name } },
        activeSection: null,
      };
    }
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/state/campaign-launch-templates.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify the full state suite + tsc (no existing `campaign_launched` caller breaks — both new payload fields are optional)**

Run: `npx vitest run src/state && npx tsc --noEmit 2>&1 | grep "app-state" || echo "app-state clean"`
Expected: `src/state` PASS; app-state clean. Existing dispatchers pass only `{ id, timestamp, budget }`, which still type-checks.

- [ ] **Step 7: Commit**

```bash
git add src/state/app-state.ts src/state/campaign-launch-templates.test.ts
git commit -m "feat(state): merge node templates + dailyBudget at campaign launch"
```

---

## Task 16: Add `campaign_phase_advanced` action

The Кампании epic drives the in-card progress block (design §4) by moving a launched campaign from `phase: "scoring"` to `phase: "communicating"`. The `phase` field already exists from Task 4; here we add the action that flips it.

**Files:**
- Modify: `src/state/app-state.ts` — `Action` union + reducer case.
- Test: `src/state/campaign-phase.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/state/campaign-phase.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { appReducer, initialState, type Campaign } from "./app-state";

function active(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "cmp_1",
    name: "Active",
    status: "active",
    createdAt: "2026-06-18T00:00:00.000Z",
    sourceType: "new",
    channels: ["sms"],
    phase: "scoring",
    ...over,
  };
}

describe("campaign_phase_advanced", () => {
  it("moves the campaign to phase communicating", () => {
    const state = { ...initialState, campaigns: [active()] };
    const next = appReducer(state, { type: "campaign_phase_advanced", id: "cmp_1" });
    expect(next.campaigns[0].phase).toBe("communicating");
  });

  it("is a no-op for an unknown id", () => {
    const state = { ...initialState, campaigns: [active()] };
    const next = appReducer(state, { type: "campaign_phase_advanced", id: "nope" });
    expect(next.campaigns[0].phase).toBe("scoring");
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/state/campaign-phase.test.ts`
Expected: FAIL — `campaign_phase_advanced` not in `Action`.

- [ ] **Step 3: Add the action variant + reducer case**

In the `Action` union, after the `campaign_launched` line, add:
```ts
  | { type: "campaign_phase_advanced"; id: string }
```
In `appReducer`, add the case near the other campaign cases (e.g. directly after `campaign_launched`):
```ts
    case "campaign_phase_advanced":
      return {
        ...state,
        campaigns: state.campaigns.map((c) =>
          c.id === action.id ? { ...c, phase: "communicating" } : c
        ),
      };
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/state/campaign-phase.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/app-state.ts src/state/campaign-phase.test.ts
git commit -m "feat(state): add campaign_phase_advanced (scoring → communicating)"
```

---

## Task 17: Fire the notifications badge on `campaign_artifact_ready`

The shell badge must light when a real artifact lands. We reuse the existing `notifications.signalsBadge` field (do NOT rename it) and flip it true inside the `campaign_artifact_ready` case (added in Task 6).

> **Polish note (out of Foundation scope):** renaming `notifications.signalsBadge` → `notifications.artifactsBadge` is optional Wave-1 cleanup once the legacy signal badge paths are removed by the Артефакты epic. Foundation keeps the existing field name so no other reader breaks.

**Files:**
- Modify: `src/state/app-state.ts` — `campaign_artifact_ready` reducer case.
- Test: `src/state/artifact-badge.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/state/artifact-badge.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { appReducer, initialState, type Campaign } from "./app-state";

function draft(): Campaign {
  return {
    id: "cmp_seed",
    name: "Seed",
    status: "draft",
    createdAt: "2026-06-18T00:00:00.000Z",
    sourceType: "new",
    channels: ["sms"],
  };
}

describe("artifact-ready fires the notifications badge", () => {
  it("sets the badge true when an artifact lands", () => {
    const state = { ...initialState, campaigns: [draft()] };
    expect(state.notifications.signalsBadge).toBe(false);
    const next = appReducer(state, {
      type: "campaign_artifact_ready",
      campaignId: "cmp_seed",
      kind: "signals",
      count: 100,
    });
    expect(next.notifications.signalsBadge).toBe(true);
    expect(next.artifacts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/state/artifact-badge.test.ts`
Expected: FAIL — badge stays false (Task 6's case only appends the artifact).

- [ ] **Step 3: Flip the badge in the existing case**

In the `case "campaign_artifact_ready": { … }` block (from Task 6), change the return to also set the badge:
```ts
    case "campaign_artifact_ready": {
      const artifact: Artifact = {
        id: `art_${nanoid(8)}`,
        campaignId: action.campaignId,
        kind: action.kind,
        count: action.count,
        createdAt: new Date().toISOString(),
      };
      return {
        ...state,
        artifacts: [...state.artifacts, artifact],
        // Reuse the existing badge field (rename to artifactsBadge is optional
        // Wave-1 polish — see task note). Lighting it here makes the Артефакты
        // badge fire for real artifacts.
        notifications: { ...state.notifications, signalsBadge: true },
      };
    }
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/state/artifact-badge.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the state suite stays green**

Run: `npx vitest run src/state`
Expected: all PASS (including Task 6's `create-flow-inversion.test.ts`, which only asserts artifact append).

- [ ] **Step 6: Commit**

```bash
git add src/state/app-state.ts src/state/artifact-badge.test.ts
git commit -m "feat(state): light notifications badge on campaign_artifact_ready"
```

---

## Task 18: Add the artifact detail view + `artifact_opened` action + route it in `page.tsx`

The Артефакты epic opens an individual artifact in a detail screen. Add an `artifact` member to `View`/`ViewAddress`, an `artifact_opened` action that routes to it, and a minimal `ArtifactScreen` stub the epic will replace. The legacy `signal`/`signal_opened`/`Сигналы` routing stays intact for now — it is removed by the Артефакты epic when it deletes `SignalScreen`/`SignalsSection`.

> **Note:** the legacy `signal` view, `signal_opened` action, and the `Сигналы` section route are intentionally left in place by Foundation. The Артефакты epic repoints/removes them when it owns the deletion of `SignalScreen` and `SignalsSection`.

**Files:**
- Modify: `src/state/app-state.ts` — `View`, `ViewAddress`, `Action`, reducer case, `rebuildViewFromAddress`, `viewToAddress`.
- Modify: `src/app/page.tsx` — route `view.kind === "artifact"`.
- Create: `src/sections/artifacts/artifact-screen.tsx` (stub).
- Test: `src/state/artifact-routing.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/state/artifact-routing.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { appReducer, initialState, viewToAddress } from "./app-state";

describe("artifact detail routing", () => {
  it("artifact_opened routes to the artifact view", () => {
    const next = appReducer(initialState, { type: "artifact_opened", id: "art_1" });
    expect(next.view).toMatchObject({ kind: "artifact", artifactId: "art_1" });
  });

  it("viewToAddress round-trips the artifact view", () => {
    const addr = viewToAddress({ kind: "artifact", artifactId: "art_1" });
    expect(addr).toEqual({ kind: "artifact", artifactId: "art_1" });
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/state/artifact-routing.test.ts`
Expected: FAIL — `artifact_opened` not an action; `artifact` not a `View` kind.

- [ ] **Step 3: Add the view + address members**

In `src/state/app-state.ts`, add to the `View` union (e.g. after the `signal` line):
```ts
  | { kind: "artifact"; artifactId: string }
```
Add to the `ViewAddress` union (after its `signal` line):
```ts
  | { kind: "artifact"; artifactId: string }
```

- [ ] **Step 4: Add the action + reducer case**

In the `Action` union, after `signal_opened`, add:
```ts
  | { type: "artifact_opened"; id: string }
```
In `appReducer`, add the case (near `signal_opened`):
```ts
    case "artifact_opened":
      return {
        ...state,
        view: { kind: "artifact", artifactId: action.id },
        activeSection: null,
      };
```

- [ ] **Step 5: Add the address branches**

In `rebuildViewFromAddress`, add (after the `signal` case):
```ts
    case "artifact":
      return { kind: "artifact", artifactId: addr.artifactId };
```
In `viewToAddress`, add (after the `signal` case):
```ts
    case "artifact":
      return { kind: "artifact", artifactId: view.artifactId };
```

- [ ] **Step 6: Run the routing test**

Run: `npx vitest run src/state/artifact-routing.test.ts`
Expected: PASS.

- [ ] **Step 7: Create the `ArtifactScreen` stub**

Create `src/sections/artifacts/artifact-screen.tsx` (mirrors the `ArtifactsSection` stub style from Task 7 — replaced by the Артефакты epic):
```tsx
"use client";

/**
 * Stub — replaced by the Артефакты epic (Wave 1, spec block 10). Renders the
 * detail of a single artifact reached via `artifact_opened`. Kept minimal so
 * routing + build stay green during Foundation.
 */
export function ArtifactScreen() {
  return (
    <div className="flex flex-1 items-center justify-center text-muted-foreground">
      Артефакт — раздел в разработке
    </div>
  );
}
```

- [ ] **Step 8: Route it in `page.tsx`**

In `src/app/page.tsx`, add the import (alongside the `ArtifactsSection` import from Task 7):
```tsx
import { ArtifactScreen } from "@/sections/artifacts/artifact-screen";
```
In `renderMain`, add a branch — place it next to the legacy `signal` branch (leave that one in place):
```tsx
    if (view.kind === "artifact") return <ArtifactScreen />;
```

- [ ] **Step 9: Full green check**

Run: `npx vitest run src/state && npx tsc --noEmit 2>&1 | grep -E "page.tsx|app-state|artifact-screen" || echo "artifact routing files clean"`
Expected: `src/state` PASS; those files clean. (`viewToAddress`/`rebuildViewFromAddress` are exhaustive over the union — the new member is handled, so no fall-through error.)

- [ ] **Step 10: Commit**

```bash
git add src/state/app-state.ts src/app/page.tsx src/sections/artifacts/artifact-screen.tsx src/state/artifact-routing.test.ts
git commit -m "feat(artifacts): add artifact detail view + artifact_opened route"
```

---

### Frozen contract additions (satisfies Wave-1 dependencies)

Each addition above maps to the Wave-1 epic(s) that depend on it:

- **`AppState.templates` + `PRESET_TEMPLATES` seed** (Task 13) → **Артефакты** (Шаблоны tab) + **Статистика** (template-level data before any launch).
- **`Campaign.templateIds`** (Task 14) → **Статистика** (join a campaign to the templates it used).
- **`campaign_launched` += `templates` / `dailyBudget` + merge logic** (Task 15) → **Кампании** (the launching UI passes node-derived templates; reducer dedups into the library and links the campaign).
- **`campaign_phase_advanced`** (Task 16) → **Кампании** (drives the in-card scoring → communicating progress block, design §4).
- **Badge on `campaign_artifact_ready`** (Task 17) → **Shell** (the Артефакты nav badge fires for real artifacts).
- **`artifact` view + `artifact_opened` action + `ArtifactScreen` stub** (Task 18) → **Артефакты** (artifact detail screen the epic replaces).

**Ownership note:** `src/state/workflow-templates.ts` (the graph generator that branches by `sourceType` / `channels` to build the per-source/per-channel node graph) is delegated to the **Кампании** epic's ownership — NOT Foundation. Foundation only froze the entry-node type rename (`signal` → `source`, Task 8) and the contracts the generator's output must satisfy; the branching logic itself is Wave-1.
