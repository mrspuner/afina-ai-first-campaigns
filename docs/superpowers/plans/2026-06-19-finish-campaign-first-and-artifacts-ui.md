# Finish Campaign-First Migration + Signals→Artifacts UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the unfinished Wave-0 destructive steps of the campaign-first migration — wire artifact generation so the launch flow isn't empty, invert the create-flow so the wizard creates a Campaign (not a Signal), delete the top-level Signal entity and standalone «Сигналы» section, and port the richer signal UI into «Артефакты».

**Architecture:** Reducer-driven React state in `src/state/app-state.ts` (no backend). Order: additive/behavioral fixes first (artifact generation — highest user value, lowest risk), then create-flow inversion, then UI port + demo reseed (migrate every reader off `state.signals`), and only at the very end delete the `Signal` type / `signals[]` field / signal actions so `tsc` stays meaningful as the final gate.

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, React reducer state, Vitest (`npx vitest run`), `nanoid` for ids.

**Source spec:** `docs/superpowers/specs/2026-06-19-finish-campaign-first-and-artifacts-ui-design.md`.

**⚠️ Environment fact (verified):** the repo dir name contains a non-breaking space — the `Read`/`Write` tools create a stray sibling dir. Work through the shell (its cwd is the real git repo) or an ASCII symlink: `ln -sfn "$(pwd)" /tmp/afina-repo` and use `/tmp/afina-repo/...` paths for `Read`/`Write`/`Edit`.

**⚠️ Distinction that bites:** `params.kind === "signal"` on a `WorkflowNode` (`src/types/workflow.ts:88`, `workflow-templates.ts`, `campaign-cost.ts`, `workflow-section.tsx`) is the graph **source node**, NOT the top-level `Signal` entity. Never delete those. Likewise `ARTIFACT_KIND_LABEL.signals = "Сигналы"` and `campaign-artifacts-block.tsx` use «Сигналы» as an artifact-kind label — keep.

---

## File Structure

**State core (modified):**
- `src/state/app-state.ts` — artifact generation in `campaign_launched`/`campaign_phase_advanced`; new `campaign_created_from_wizard`; remove `Signal`, `signals[]`, signal actions, `signal`/`guided-signal`/`awaiting-campaign` view churn; `SectionName` drops «Сигналы»; `Preset.signals`→artifacts; `Campaign.signalId` removed.
- `src/state/artifact-metrics.ts` — **create**: `estimateArtifactCount(campaign)`, `artifactKindForCampaign(campaign)`.
- `src/state/presets.ts` — reseed presets with campaigns + ready artifacts (no signals).

**Wizard host (modified):**
- `src/sections/campaigns/wizard/guided-campaign-section.tsx` — **renamed** from `src/sections/signals/guided-signal-section.tsx`; thin host: survey gate + `CampaignWorkspace`; launch creates a Campaign.

**Artifacts UI (modified — port richness):**
- `src/sections/artifacts/artifact-card.tsx` — open-on-click + delete menu/confirm.
- `src/sections/artifacts/artifact-screen.tsx` — parent-campaign settings table + delete.
- `src/sections/artifacts/artifacts-empty-state.tsx` — richer copy, no create/upload CTA.

**Deleted (after readers migrated):**
- `src/sections/signals/` entire dir: `signals-section.tsx`, `signal-screen.tsx`, `signal-card.tsx`, `signals-empty-state.tsx`, `upload-signal-dialog.tsx`, `new-signal-menu.tsx`, `signal-summary-data.ts` (keep `top-up-modal.tsx` only if still referenced — verify).
- `src/types/signal-status.ts` — if no readers remain.

**Routing / shell / AI (modified):**
- `src/app/page.tsx`, `src/sections/shell/launch-flyout.tsx`, `src/sections/shell/use-assist-runner.ts`, `src/lib/ai/navigate-schema.ts`, `src/lib/ai/assist-contract.ts`, `src/lib/ai/data-summary.ts`, `src/sections/statistics/fact-cube.ts`, `src/state/select-prompt-suggestions.ts`, `src/state/suggestion-registry/*`, `src/components/dev/dev-panel.tsx`.

---

## Task 0: Worktree + green baseline

**Files:** none (git only).

- [ ] **Step 1: Create the worktree off `main`** (AGENTS.md mandates worktrees)

```bash
cd "$(git rev-parse --show-toplevel)"
git worktree add .worktrees/finish-campaign-first -b feature/finish-campaign-first integration
cd .worktrees/finish-campaign-first
npm install
ln -sfn "$(pwd)" /tmp/afina-repo
```
> Branch off `integration` (not `main`) — the unfinished migration lives there.

- [ ] **Step 2: Confirm green baseline**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; vitest all-pass. If red, STOP and report.

---

## Task 1: Artifact metrics helper

**Files:**
- Create: `src/state/artifact-metrics.ts`
- Test: `src/state/artifact-metrics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { estimateArtifactCount, artifactKindForCampaign } from "./artifact-metrics";
import type { Campaign } from "./app-state";

function camp(over: Partial<Campaign> = {}): Campaign {
  return { id: "c1", name: "C", status: "draft", createdAt: "x", sourceType: "new", channels: [], ...over };
}

describe("artifact-metrics", () => {
  it("own uses the uploaded file row count", () => {
    expect(estimateArtifactCount(camp({ sourceType: "own", file: { name: "b.csv", rowCount: 4200 } }))).toBe(4200);
  });
  it("new/stream without a file fall back to a deterministic estimate", () => {
    const n = estimateArtifactCount(camp({ sourceType: "new" }));
    expect(n).toBeGreaterThan(0);
    expect(estimateArtifactCount(camp({ sourceType: "new" }))).toBe(n); // deterministic
  });
  it("kind is degenerate when no channels, full otherwise", () => {
    expect(artifactKindForCampaign(camp({ channels: [] }))).toBe("signals");
    expect(artifactKindForCampaign(camp({ channels: ["sms"] }))).toBe("signals_conversions");
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run src/state/artifact-metrics.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { Campaign, Artifact } from "./app-state";

/** Fallback audience base mirrors the wizard's FALLBACK_BASE. */
const FALLBACK_BASE = 10_000;

/**
 * Prototype reach estimate for the artifact a campaign produces.
 * own → the uploaded base size; new/stream → file size if any, else a
 * deterministic scenario-independent fallback (no RNG — keeps tests stable).
 */
export function estimateArtifactCount(campaign: Campaign): number {
  if (campaign.file?.rowCount) return campaign.file.rowCount;
  if (campaign.fileRowCountSafe) return campaign.fileRowCountSafe;
  return FALLBACK_BASE;
}

/** Degenerate (no comms) → "signals"; full → "signals_conversions" (spec §3). */
export function artifactKindForCampaign(campaign: Campaign): Artifact["kind"] {
  return (campaign.channels?.length ?? 0) === 0 ? "signals" : "signals_conversions";
}
```
> Note: `Campaign` has `file?: { name; rowCount }` but no top-level `fileRowCount` — drop the `fileRowCountSafe` line; it is shown only to flag that `file.rowCount` is the single source. Final body is the two real branches: `file?.rowCount` then `FALLBACK_BASE`.

Corrected `estimateArtifactCount`:
```ts
export function estimateArtifactCount(campaign: Campaign): number {
  if (campaign.file?.rowCount) return campaign.file.rowCount;
  return FALLBACK_BASE;
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `npx vitest run src/state/artifact-metrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/artifact-metrics.ts src/state/artifact-metrics.test.ts
git commit -m "feat(state): artifact-metrics helper (count + kind by source)"
```

---

## Task 2: `campaign_launched` sets phase + generates artifact for own/stream

**Files:**
- Modify: `src/state/app-state.ts` (`campaign_launched` case, ~1067-1107)
- Test: `src/state/artifact-generation.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { appReducer, initialState, type Campaign } from "./app-state";

function launchedState(over: Partial<Campaign>) {
  const c: Campaign = { id: "c1", name: "C", status: "draft", createdAt: "x", sourceType: "new", channels: [], ...over };
  return appReducer({ ...initialState, campaigns: [c] }, {
    type: "campaign_launched", id: "c1", timestamp: "2026-06-19T00:00:00.000Z", budget: 1000,
  });
}

describe("campaign_launched artifact generation", () => {
  it("own → artifact immediately + phase communicating", () => {
    const s = launchedState({ sourceType: "own", channels: ["sms"], file: { name: "b.csv", rowCount: 4200 } });
    expect(s.artifacts).toHaveLength(1);
    expect(s.artifacts[0]).toMatchObject({ campaignId: "c1", kind: "signals_conversions", count: 4200 });
    expect(s.campaigns[0].phase).toBe("communicating");
  });
  it("new → no artifact yet, phase scoring", () => {
    const s = launchedState({ sourceType: "new", channels: ["sms"] });
    expect(s.artifacts).toHaveLength(0);
    expect(s.campaigns[0].phase).toBe("scoring");
  });
  it("stream → artifact at launch + phase communicating", () => {
    const s = launchedState({ sourceType: "stream", channels: [] });
    expect(s.artifacts).toHaveLength(1);
    expect(s.artifacts[0].kind).toBe("signals");
    expect(s.campaigns[0].phase).toBe("communicating");
  });
});
```

- [ ] **Step 2: Run, confirm it fails**

Run: `npx vitest run src/state/artifact-generation.test.ts`
Expected: FAIL — `phase`/`artifacts` not set as asserted.

- [ ] **Step 3: Edit `campaign_launched`**

At the top of `src/state/app-state.ts` add the import (next to the other state imports):
```ts
import { estimateArtifactCount, artifactKindForCampaign } from "./artifact-metrics";
```

Replace the `return { ...state, templates, campaigns: ..., view, activeSection }` block of `campaign_launched` (lines ~1087-1106) with a version that computes phase + artifact by source:
```ts
      // Phase + artifact by source matrix (spec §3):
      //  own    → no scoring; artifact ready immediately; phase communicating.
      //  new    → scoring phase; artifact lands when scoring finishes (Task 3).
      //  stream → perpetual; artifact at launch; phase communicating.
      const source = c.sourceType ?? "new";
      const phase: Campaign["phase"] = source === "new" ? "scoring" : "communicating";
      const makeArtifact = source !== "new";
      const newArtifacts: Artifact[] = makeArtifact
        ? [{
            id: `art_${nanoid(8)}`,
            campaignId: c.id,
            kind: artifactKindForCampaign(c),
            count: estimateArtifactCount(c),
            createdAt: action.timestamp,
          }]
        : [];

      return {
        ...state,
        templates,
        artifacts: [...state.artifacts, ...newArtifacts],
        campaigns: state.campaigns.map((cc) =>
          cc.id === action.id
            ? {
                ...cc,
                status: "active",
                phase,
                launchedAt: cc.launchedAt ?? action.timestamp,
                budget: action.budget > 0 ? action.budget : cc.budget,
                dailyBudget: action.dailyBudget ?? cc.dailyBudget,
                templateIds: incomingIds.length > 0 ? incomingIds : cc.templateIds,
              }
            : cc
        ),
        notifications: makeArtifact
          ? { ...state.notifications, signalsBadge: true }
          : state.notifications,
        view: { kind: "campaign", campaign: { id: c.id, name: c.name } },
        activeSection: null,
      };
```

- [ ] **Step 4: Run, confirm pass**

Run: `npx vitest run src/state/artifact-generation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/app-state.ts src/state/artifact-generation.test.ts
git commit -m "feat(state): campaign_launched sets phase + artifact for own/stream"
```

---

## Task 3: `campaign_phase_advanced` generates the `new`-source artifact

**Files:**
- Modify: `src/state/app-state.ts` (`campaign_phase_advanced` case, ~1109-1115)
- Test: `src/state/artifact-generation.test.ts` (extend)

- [ ] **Step 1: Add the failing test**

Append to `src/state/artifact-generation.test.ts`:
```ts
describe("campaign_phase_advanced artifact generation (new)", () => {
  it("creates the artifact when a new campaign finishes scoring", () => {
    const launched = appReducer(
      { ...initialState, campaigns: [{ id: "c1", name: "C", status: "draft", createdAt: "x", sourceType: "new", channels: ["sms"] }] },
      { type: "campaign_launched", id: "c1", timestamp: "t", budget: 500 },
    );
    expect(launched.artifacts).toHaveLength(0);
    const advanced = appReducer(launched, { type: "campaign_phase_advanced", id: "c1" });
    expect(advanced.campaigns[0].phase).toBe("communicating");
    expect(advanced.artifacts).toHaveLength(1);
    expect(advanced.artifacts[0]).toMatchObject({ campaignId: "c1", kind: "signals_conversions" });
    expect(advanced.notifications.signalsBadge).toBe(true);
  });
  it("does not double-create on a repeat advance", () => {
    let s = appReducer(
      { ...initialState, campaigns: [{ id: "c1", name: "C", status: "draft", createdAt: "x", sourceType: "new", channels: ["sms"] }] },
      { type: "campaign_launched", id: "c1", timestamp: "t", budget: 500 },
    );
    s = appReducer(s, { type: "campaign_phase_advanced", id: "c1" });
    s = appReducer(s, { type: "campaign_phase_advanced", id: "c1" });
    expect(s.artifacts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run, confirm it fails**

Run: `npx vitest run src/state/artifact-generation.test.ts`
Expected: FAIL — advance produces no artifact.

- [ ] **Step 3: Edit `campaign_phase_advanced`**

Replace the `campaign_phase_advanced` case body with one that also lands the artifact (idempotent — skip if one already exists for this campaign):
```ts
    case "campaign_phase_advanced": {
      const c = state.campaigns.find((cc) => cc.id === action.id);
      if (!c) return state;
      const alreadyHasArtifact = state.artifacts.some((a) => a.campaignId === c.id);
      const newArtifacts: Artifact[] =
        alreadyHasArtifact
          ? []
          : [{
              id: `art_${nanoid(8)}`,
              campaignId: c.id,
              kind: artifactKindForCampaign(c),
              count: estimateArtifactCount(c),
              createdAt: new Date().toISOString(),
            }];
      return {
        ...state,
        campaigns: state.campaigns.map((cc) =>
          cc.id === action.id ? { ...cc, phase: "communicating" } : cc
        ),
        artifacts: [...state.artifacts, ...newArtifacts],
        notifications:
          newArtifacts.length > 0
            ? { ...state.notifications, signalsBadge: true }
            : state.notifications,
      };
    }
```

- [ ] **Step 4: Run, confirm pass** — `npx vitest run src/state/artifact-generation.test.ts` → PASS.

- [ ] **Step 5: Manual smoke (optional but recommended)**

Run `npm run dev`, apply a non-empty dev preset (after Task 9), open a `new`-source campaign → «Запустить» → pay → campaign card shows scoring progress, then after 8s the «Артефакты» block shows a real artifact. (Until Task 9 reseeds presets, test via a fresh wizard run after Task 4.)

- [ ] **Step 6: Commit**

```bash
git add src/state/app-state.ts src/state/artifact-generation.test.ts
git commit -m "feat(state): generate new-source artifact on scoring completion"
```

---

## Task 4: Invert create-flow — wizard creates a Campaign

The wizard (`CampaignWorkspace`) is already the 4-step campaign config; only the host's launch handler still makes a `Signal`. Replace it with a Campaign-creation action that routes to the workflow editor (reusing the existing payment→launch→artifact path).

**Files:**
- Modify: `src/state/app-state.ts` (new action + reducer case)
- Create: `src/sections/campaigns/wizard/guided-campaign-section.tsx` (replaces the signal host)
- Modify: `src/app/page.tsx` (import path + view routing)
- Test: `src/state/create-campaign-from-wizard.test.ts` (create)

- [ ] **Step 1: Write the failing reducer test**

```ts
import { describe, expect, it } from "vitest";
import { appReducer, initialState } from "./app-state";
import { initialStepData } from "@/types/campaign";

describe("campaign_created_from_wizard", () => {
  it("creates a draft campaign from wizard StepData and opens the workflow", () => {
    const next = appReducer(initialState, {
      type: "campaign_created_from_wizard",
      stepData: { ...initialStepData, scenario: "registration", sourceType: "new", channels: ["sms"], budget: 1000 },
      scenarioName: "Регистрация",
    });
    expect(next.campaigns).toHaveLength(1);
    const c = next.campaigns[0];
    expect(c.status).toBe("draft");
    expect(c.sourceType).toBe("new");
    expect(c.channels).toEqual(["sms"]);
    expect(c.scenario).toEqual({ id: "registration", name: "Регистрация" });
    expect("signalId" in c).toBe(false);
    expect(next.view).toMatchObject({ kind: "workflow", campaign: { id: c.id }, launched: false });
  });
});
```

- [ ] **Step 2: Run, confirm it fails** — `npx vitest run src/state/create-campaign-from-wizard.test.ts` → FAIL (unknown action).

- [ ] **Step 3: Add the action + reducer case**

In the `Action` union add:
```ts
  | { type: "campaign_created_from_wizard"; stepData: StepData; scenarioName: string }
```

Add the reducer case (place near `campaign_from_signal`):
```ts
    case "campaign_created_from_wizard": {
      const sd = action.stepData;
      const scenarioId = sd.scenario ?? "";
      const n =
        state.campaigns.filter((c) => c.scenario?.id === scenarioId).length + 1;
      const newCampaign: Campaign = {
        id: `cmp_${nanoid(6)}`,
        name: defaultCampaignName(action.scenarioName, n),
        status: "draft",
        createdAt: new Date().toISOString(),
        sourceType: sd.sourceType,
        channels: sd.channels,
        interests: sd.interests,
        file: sd.file ?? undefined,
        budget: sd.budget ?? undefined,
        dailyBudget: sd.dailyBudget,
        scenario: scenarioId ? { id: scenarioId, name: action.scenarioName } : undefined,
      };
      return {
        ...state,
        campaigns: [...state.campaigns, newCampaign],
        view: {
          kind: "workflow",
          campaign: { id: newCampaign.id, name: newCampaign.name },
          launched: false,
        },
        activeSection: null,
        campaignFilter: [],
        campaignSort: "default",
      };
    }
```
> `Campaign.file` is `{ name; rowCount }`; `StepData.file` shape must match — if `StepData.file` differs, map fields explicitly. Verify `StepData` in `src/types/campaign.ts` before writing.

- [ ] **Step 4: Run, confirm pass** — `npx vitest run src/state/create-campaign-from-wizard.test.ts` → PASS.

- [ ] **Step 5: Create the new host `guided-campaign-section.tsx`**

`git mv src/sections/signals/guided-signal-section.tsx src/sections/campaigns/wizard/guided-campaign-section.tsx`, then replace its body with a thin host (no signal creation, no top-up modal — payment lives in `campaign-payment-screen`):
```tsx
"use client";

import { useCallback, useState } from "react";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { SCENARIO_NAMES } from "@/data/scenarios";
import { SurveySection } from "@/sections/survey/survey-section";
import { CampaignWorkspace, type LaunchRequest } from "@/sections/campaigns/wizard/campaign-workspace";
import { shouldShowSurveyGate } from "@/state/survey-gate";

/**
 * Thin host for the campaign-creation wizard: gates on the survey, then renders
 * the 4-step CampaignWorkspace. On launch it creates a Campaign root (no
 * top-level Signal) and routes to the workflow editor; payment/launch happen
 * downstream in the campaign card → campaign-payment-screen.
 */
export function GuidedCampaignSection() {
  const { view, surveyStatus, wizardSessionId } = useAppState();
  const dispatch = useAppDispatch();
  const initial = view.kind === "guided-signal" ? view.initialScenario : undefined;
  const [gatePassed, setGatePassed] = useState(surveyStatus === "completed");

  const handleLaunch = useCallback(
    (req: LaunchRequest) => {
      const scenarioName =
        SCENARIO_NAMES[req.scenarioId] ?? initial?.name ?? "Кампания";
      dispatch({
        type: "campaign_created_from_wizard",
        stepData: req.stepData,
        scenarioName,
      });
    },
    [dispatch, initial?.name],
  );

  const showSurvey =
    !gatePassed && shouldShowSurveyGate({ surveyStatus, isResuming: false });
  if (showSurvey) return <SurveySection onComplete={() => setGatePassed(true)} />;

  return (
    <CampaignWorkspace
      key={`session-${wizardSessionId}`}
      onLaunchRequested={handleLaunch}
      initialScenario={initial}
    />
  );
}
```
> The `view.kind === "guided-signal"` read stays until Task 6 renames the view kind. Keep it for now so the build is green.

- [ ] **Step 6: Update `src/app/page.tsx`**

Change the import:
```ts
import { GuidedCampaignSection } from "@/sections/campaigns/wizard/guided-campaign-section";
```
and the render of the guided view (`page.tsx:56` / `:90`) to use `<GuidedCampaignSection />` instead of `<GuidedSignalSection />`.

- [ ] **Step 7: Build + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean/all-pass (signal-flow tests that exercised the old host may fail — note them; they are removed in Task 8). If a test only covered the deleted top-up path, delete it now and note it in the commit.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: wizard creates a Campaign root (create-flow inversion)"
```

---

## Task 5: Port signal UI into the artifact card

**Files:**
- Modify: `src/sections/artifacts/artifact-card.tsx`
- Modify: `src/state/app-state.ts` (add `artifact_deleted` action + case)
- Modify: `src/sections/artifacts/signals-tab.tsx` (wire open + delete)
- Test: `src/state/artifact-deleted.test.ts` (create)

- [ ] **Step 1: Write the failing reducer test**

```ts
import { describe, expect, it } from "vitest";
import { appReducer, initialState } from "./app-state";

describe("artifact_deleted", () => {
  it("removes the artifact by id", () => {
    const state = { ...initialState, artifacts: [
      { id: "a1", campaignId: "c1", kind: "signals" as const, count: 5, createdAt: "x" },
      { id: "a2", campaignId: "c1", kind: "signals" as const, count: 9, createdAt: "y" },
    ] };
    const next = appReducer(state, { type: "artifact_deleted", id: "a1" });
    expect(next.artifacts.map((a) => a.id)).toEqual(["a2"]);
  });
});
```

- [ ] **Step 2: Run, confirm it fails** — `npx vitest run src/state/artifact-deleted.test.ts` → FAIL.

- [ ] **Step 3: Add action + case**

Union:
```ts
  | { type: "artifact_deleted"; id: string }
```
Case (near `artifact_opened`):
```ts
    case "artifact_deleted":
      return {
        ...state,
        artifacts: state.artifacts.filter((a) => a.id !== action.id),
        view:
          state.view.kind === "artifact" && state.view.artifactId === action.id
            ? { kind: "section", name: "Артефакты" }
            : state.view,
        activeSection:
          state.view.kind === "artifact" && state.view.artifactId === action.id
            ? "Артефакты"
            : state.activeSection,
      };
```

- [ ] **Step 4: Run, confirm pass** — `npx vitest run src/state/artifact-deleted.test.ts` → PASS.

- [ ] **Step 5: Rewrite `artifact-card.tsx`** (open-on-click + delete menu/confirm; modelled on `signal-card.tsx`)

```tsx
"use client";

import { useState } from "react";
import { Download, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { Artifact } from "@/state/app-state";
import { ARTIFACT_KIND_LABEL } from "./artifact-labels";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string { return new Date(iso).toLocaleDateString("ru-RU"); }
function formatNumber(n: number): string { return n.toLocaleString("ru-RU"); }

interface ArtifactCardProps {
  artifact: Artifact;
  campaignName: string;
  onOpen: (artifactId: string) => void;
  onOpenCampaign: (campaignId: string) => void;
  onDownload: (artifactId: string) => void;
  onDelete: (artifactId: string) => void;
  index?: number;
}

export function ArtifactCard({
  artifact, campaignName, onOpen, onOpenCampaign, onDownload, onDelete, index = 0,
}: ArtifactCardProps) {
  const { id, kind, count, createdAt, campaignId } = artifact;
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <Card
        onClick={() => onOpen(id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(id); } }}
        role="button"
        tabIndex={0}
        className={cn(
          "animate-in fade-in-0 slide-in-from-bottom-2 gap-2 px-5 py-4 [--tw-animation-duration:220ms] [--tw-ease:var(--ease-out)]",
          "cursor-pointer transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
        style={index > 0 ? { animationDelay: `${index * 40}ms` } : undefined}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
            <span>{ARTIFACT_KIND_LABEL[kind]}</span>
            <span className="text-muted-foreground">·</span>
            <span className="tabular-nums">{formatNumber(count)}</span>
          </p>
          <p className="text-xs text-muted-foreground">{formatDate(createdAt)}</p>
        </div>

        <p className="text-xs text-muted-foreground">
          Кампания:{" "}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenCampaign(campaignId); }}
            className="rounded text-foreground/80 underline-offset-2 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {campaignName}
          </button>
        </p>

        <div className="mt-2 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="icon" aria-label="Скачать сигналы" onClick={() => onDownload(id)}>
            <Download className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" aria-label="Действия с артефактом"><MoreHorizontal className="h-4 w-4" /></Button>}
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить артефакт?</DialogTitle>
            <DialogDescription>
              Артефакт «{ARTIFACT_KIND_LABEL[kind]} · {formatNumber(count)}» будет удалён из списка.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Отмена</Button>
            <Button
              variant="outline"
              className="text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => { setConfirmDelete(false); onDelete(id); }}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 6: Wire `signals-tab.tsx`** — pass the new props.

In `SignalsTabView` props add `onOpen` and `onDelete`; pass them to `ArtifactCard` (`onOpen={onOpen}`, `onDelete={onDelete}`). In the connected `SignalsTab`, add:
```ts
  onOpen={(id) => dispatch({ type: "artifact_opened", id })}
  onDelete={(id) => dispatch({ type: "artifact_deleted", id })}
```

- [ ] **Step 7: Build + tests** — `npx tsc --noEmit && npx vitest run` → clean/all-pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(artifacts): card open-on-click + delete (ported from signal card)"
```

---

## Task 6: Port the detail screen + empty state

**Files:**
- Modify: `src/sections/artifacts/artifact-screen.tsx`
- Modify: `src/sections/artifacts/artifacts-empty-state.tsx`

- [ ] **Step 1: Extend `ArtifactScreenView`** — add the parent-campaign settings table + delete action.

Change `ArtifactScreenView` props to accept the parent campaign and an `onDelete`:
```ts
interface ArtifactScreenViewProps {
  artifact: Artifact;
  campaign: Campaign | undefined;
  campaignName: string;
  onBack: () => void;
  onOpenCampaign: (campaignId: string) => void;
  onDownload: () => void;
  onDelete: () => void;
}
```
Add a settings `CardSection` after «Об артефакте», sourced from the parent campaign (each row omitted/`—` when absent):
```tsx
      {campaign && (
        <CardSection label="Настройки кампании-источника">
          <div className="divide-y divide-border">
            <SummaryRow label="Сценарий">{campaign.scenario?.name ?? "—"}</SummaryRow>
            <SummaryRow label="Источник">{SOURCE_LABEL[campaign.sourceType ?? "new"]}</SummaryRow>
            <SummaryRow label="Интересы">{campaign.interests?.length ? campaign.interests.join(", ") : "—"}</SummaryRow>
            <SummaryRow label="Каналы">{campaign.channels?.length ? campaign.channels.map((c) => CHANNEL_LABEL[c]).join(", ") : "—"}</SummaryRow>
            <SummaryRow label="Файл базы">{campaign.file ? campaign.file.name : "—"}</SummaryRow>
            <SummaryRow label="Бюджет">{campaign.budget ? `₽ ${campaign.budget.toLocaleString("ru-RU")}` : "—"}</SummaryRow>
          </div>
        </CardSection>
      )}
```
Add label maps at the top of the file:
```ts
const SOURCE_LABEL: Record<NonNullable<Campaign["sourceType"]>, string> = {
  new: "Новая база", stream: "Поток", own: "Своя база",
};
const CHANNEL_LABEL: Record<Channel, string> = {
  sms: "SMS", push: "Push", email: "Email", ivr: "IVR",
};
```
(import `type { Campaign }` from `@/state/app-state` and `type { Channel }` from `@/types/campaign`.)

Add a delete `secondaryAction` alongside «Скачать»:
```ts
        { label: "Удалить", onClick: onDelete, icon: <Trash2 className="h-4 w-4" /> },
```
(import `Trash2` from `lucide-react`.)

- [ ] **Step 2: Wire the connected `ArtifactScreen`** — pass campaign + delete dispatch:
```ts
  const campaign = campaigns.find((c) => c.id === artifact.campaignId);
  // ...
  <ArtifactScreenView
    artifact={artifact}
    campaign={campaign}
    campaignName={campaign?.name ?? "—"}
    onBack={() => dispatch({ type: "sidebar_nav", section: "Артефакты" })}
    onOpenCampaign={(id) => dispatch({ type: "campaign_opened", id })}
    onDownload={handleDownload}
    onDelete={() => dispatch({ type: "artifact_deleted", id: artifact.id })}
  />
```

- [ ] **Step 3: Rewrite `artifacts-empty-state.tsx`** — richer copy, no create/upload CTA:
```tsx
"use client";

import { Card } from "@/components/ui/card";

/**
 * Empty state for the Сигналы tab in Артефакты. Artifacts are produced by
 * launched campaigns — there is no manual create/upload (spec §3/§13). Copy
 * tone carried over from the old signals empty state.
 */
export function ArtifactsEmptyState() {
  return (
    <Card className="gap-2 border-2 border-dashed border-border bg-transparent px-5 py-4 ring-0">
      <p className="text-sm font-semibold text-foreground">Пока нет артефактов</p>
      <p className="text-xs text-muted-foreground">
        Артефакты появляются здесь, когда кампания собирает сигналы. Запустите
        кампанию — собранная база окажется тут.
      </p>
      <p className="text-xs text-muted-foreground/80">
        Своя база подключается на шаге «Источник» при создании кампании — без
        отдельной загрузки в этом разделе.
      </p>
    </Card>
  );
}
```

- [ ] **Step 4: Build + tests** — `npx tsc --noEmit && npx vitest run` → clean/all-pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(artifacts): detail settings table from parent campaign + delete + richer empty state"
```

---

## Task 7: Reseed presets with campaigns + artifacts

**Files:**
- Modify: `src/state/presets.ts`
- Modify: `src/state/app-state.ts` (`Preset` type + `preset_applied` case)
- Modify: `src/components/dev/dev-panel.tsx:189` (count display)
- Test: `src/state/presets.test.ts` (create or extend)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { PRESETS } from "./presets";

describe("presets are campaign-first", () => {
  it("non-empty presets seed campaigns with at least one ready artifact", () => {
    const full = PRESETS.find((p) => p.key === "full")!;
    expect(full.campaigns.length).toBeGreaterThan(0);
    expect(full.artifacts.length).toBeGreaterThan(0);
    for (const a of full.artifacts) {
      expect(full.campaigns.some((c) => c.id === a.campaignId)).toBe(true);
    }
  });
});
```
> Adjust `PRESETS` to the real export name in `src/state/presets.ts` (read it first).

- [ ] **Step 2: Run, confirm it fails.**

- [ ] **Step 3: Change `Preset` type** in `app-state.ts`:
```ts
export type Preset = {
  key: "empty" | "mid" | "full";
  label: string;
  campaigns: Campaign[];
  artifacts: Artifact[];
};
```

- [ ] **Step 4: Update `preset_applied`** — replace `signals: action.preset.signals` with `artifacts: action.preset.artifacts`:
```ts
        campaigns: action.preset.campaigns,
        artifacts: action.preset.artifacts,
```

- [ ] **Step 5: Rewrite `src/state/presets.ts`** — build each non-empty preset as campaigns (mix of `active`/`completed`, with `sourceType`/`channels`/`scenario`) plus a ready `Artifact` per launched campaign (`id: art_*`, `campaignId`, `kind` by channels, `count`, `createdAt`). Empty preset: `campaigns: []`, `artifacts: []`. Remove the `opts.signals` / `rndPick(rng, opts.signals)` signal generation (line ~158).

- [ ] **Step 6: Fix `dev-panel.tsx:189`** — replace `{preset.signals.length}` with `{preset.artifacts.length}`.

- [ ] **Step 7: Build + tests** — `npx tsc --noEmit && npx vitest run` → clean/all-pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(state): presets seed campaigns + artifacts (no signals)"
```

---

## Task 8: Migrate the remaining `state.signals` readers

Migrate every non-test reader found by grep off `state.signals` so the field can be deleted in Task 10. Run the inventory first:

```bash
git grep -n "\.signals\b" -- 'src/**/*.ts*' | grep -v "\.test\." | grep -vi "signalsBadge"
```

- [ ] **Step 1: `src/sections/shell/launch-flyout.tsx`** — drop the signal `RecentItem` branch (`:18,52-55,66,74,85,192`) and the `openSignal`→`{section:"Сигналы"}` dispatch (`:131-135`). Keep only campaign recents. Build green.

- [ ] **Step 2: `src/sections/shell/use-assist-runner.ts`** — remove the `t.kind === "signal"` branch (`:79-82`) and the `signals: appState.signals` payload field (`:208`). Update the assist target type so signals are no longer a navigable target.

- [ ] **Step 3: AI schemas** — `src/lib/ai/navigate-schema.ts` (drop `"Сигналы"` from the section enum `:11,:26`, drop the `{ kind: "signal" }` variant + `signalId` mapping `:28,:42`), `src/lib/ai/assist-contract.ts:77` (drop `"Сигналы"` from the enum), `src/lib/ai/data-summary.ts:26-27` (drop the «Сигналов: …» lines + the `input.signals` loop; update the `input` type).

- [ ] **Step 4: Statistics** — `src/sections/statistics/fact-cube.ts:430,449` reads `ctx.signals`. Remove the signals contribution from the cube cache key + dimension (the prototype cube can omit signals; campaigns/artifacts already feed it). Update the `ctx` type so `signals` is gone.

- [ ] **Step 5: Prompt suggestions** — `src/state/select-prompt-suggestions.ts:237` and `src/state/suggestion-registry/types.ts:68` use signal status counts. Remove `countSignalStatuses(state.signals)` and the `statusCounts` field (or replace with an artifact-based count if a suggestion depends on it — for the prototype, remove). Remove the «Сигналы» section branch (`select-prompt-suggestions.ts:228`).

- [ ] **Step 6: Build + tests** — `npx tsc --noEmit && npx vitest run`. Expected: only failures left should be in tests that directly construct `Signal`/dispatch signal actions — those are deleted in Task 9.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: migrate remaining readers off state.signals"
```

---

## Task 9: Delete the standalone Сигналы section, signal screens, and signal-centric tests

**Files:**
- Delete: `src/sections/signals/signals-section.tsx`, `signal-screen.tsx`, `signal-card.tsx`, `signals-empty-state.tsx`, `upload-signal-dialog.tsx`, `new-signal-menu.tsx`, `signal-summary-data.ts`.
- Modify: `src/app/page.tsx` (remove `SignalsSection`/`SignalScreen` imports + routes), `src/sections/welcome/onboarding-step-cards.tsx` (the «Сигналы» card → point at campaign creation or remove), suggestion registries referencing the signal flow.
- Delete: signal-centric test files.

- [ ] **Step 1: Find signal-screen/section importers**

```bash
git grep -ln "signals-section\|signal-screen\|signal-card\|signals-empty-state\|upload-signal-dialog\|new-signal-menu\|signal-summary-data" -- src
```

- [ ] **Step 2: Remove `page.tsx` routes** — delete `import { SignalsSection }` (`:26`) and `import { SignalScreen }`, the `view.kind === "signal"` branch (`:95`), and the `view.name === "Сигналы"` branch (`:99`).

- [ ] **Step 3: `git rm` the signal components** (verify `top-up-modal.tsx` has no remaining importers; if unused, remove it too):

```bash
git grep -ln "top-up-modal" -- src   # if only its own file → remove
git rm src/sections/signals/signals-section.tsx src/sections/signals/signal-screen.tsx \
       src/sections/signals/signal-card.tsx src/sections/signals/signals-empty-state.tsx \
       src/sections/signals/upload-signal-dialog.tsx src/sections/signals/new-signal-menu.tsx \
       src/sections/signals/signal-summary-data.ts
```

- [ ] **Step 4: Onboarding card** — in `src/sections/welcome/onboarding-step-cards.tsx` retitle/repoint the «Сигналы» card (`:12`) to campaign creation, or remove it if redundant. Keep copy consistent with the campaign-first flow.

- [ ] **Step 5: Delete signal-centric tests**

```bash
git grep -ln "signal_added\|signal_status_changed\|signal_deleted\|signal_renamed\|signal_opened\|resume_signal_in_wizard\|from ['\"].*signals/" -- 'src/**/*.test.ts*'
```
Remove tests that only exercise deleted behavior. Keep `create-flow-inversion.test.ts` and `artifact-badge.test.ts`.

- [ ] **Step 6: Build + tests** — `npx tsc --noEmit && npx vitest run`. Expected: remaining `tsc` errors point only at the still-present `Signal` type / `signals[]` field / signal actions (deleted in Task 10).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: delete standalone Сигналы section, screens, and dead tests"
```

---

## Task 10: Delete the `Signal` entity, `signals[]`, signal actions, and dead view kinds

This is the final structural removal — after it, `tsc` proves nothing references the old model.

**Files:** `src/state/app-state.ts`, `src/types/signal-status.ts`, `src/app/page.tsx`, plus any stragglers tsc reports.

- [ ] **Step 1: Remove from `app-state.ts`:**
  - `Signal` type (`:46-71`), `signals: Signal[]` from `AppState` (`:226`) and `initialState` (`:395`).
  - Reducer cases: `signal_added`, `signal_complete`, `step2_clicked`, `campaign_from_signal`, `signal_status_changed`, `signal_deleted`, `signal_opened`, `signal_renamed`, `resume_signal_in_wizard`, `resume_signal_in_wizard_handled`, `flyout_signal_select`. Their `Action` union members too.
  - `Campaign.signalId` (`:83`) and its use in `campaign_duplicated` (`:682`).
  - View kinds `{ kind: "signal" }`, `{ kind: "guided-signal" }`→rename to `{ kind: "guided-campaign" }` (and `awaiting-campaign` — fold/remove: `signal_added` was its only producer). Update `View`, `ViewAddress`, `rebuildViewFromAddress`, `viewToAddress`, `navigationScopeKey`, `activeNavSection` (the guided/awaiting → «Сигналы» mapping becomes guided-campaign → «Кампании»).
  - `SectionName` (`:195`): drop `"Сигналы"`.
  - `start_signal_flow` → keep `start_campaign_flow` only; repoint dispatchers (`survey-section.tsx:87`, `use-onboarding-chat.ts:119`, `suggestion-registry/sections.ts:82,140`) to `start_campaign_flow`.
  - Helpers `isSignalDone`/`isStep1Active`/`isStep2Active` (`:1265-1275`) — rebase on campaigns or remove if unused (grep first).
  - `resumingSignalId`, `wizardCurrentStep` signal comments, `notifications.signalsBadge` — keep the badge field name (renaming to `artifactsBadge` is optional polish; if renamed, update `signals_badge_set`, `app-sidebar.tsx:77`, `artifacts-section.tsx`).

- [ ] **Step 2: Update `guided-campaign-section.tsx`** — change `view.kind === "guided-signal"` to `"guided-campaign"`; `page.tsx` view routing + `use-view-history.ts:21-24` + `select-prompt-suggestions.ts`/`suggestion-registry` `guided-signal`/`awaiting-campaign` cases accordingly.

- [ ] **Step 3: Remove `signal-status.ts`** if `git grep -n "signal-status\|SignalStatus\|SIGNAL_STATUS_LABEL" -- src` returns nothing after the above.

- [ ] **Step 4: Iterate tsc to zero**

```bash
npx tsc --noEmit
```
Fix each reported straggler (most are renamed view kinds or removed actions). Repeat until clean.

- [ ] **Step 5: Full test run**

Run: `npx vitest run`
Expected: all-pass. Update `create-flow-inversion.test.ts`'s `"signalId" in campaign` assertion still holds (field now truly gone).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove Signal entity, signals[], signal actions, dead view kinds"
```

---

## Task 11: End-to-end verification

**Files:** none (manual + automated).

- [ ] **Step 1: Automated gate** — `npx tsc --noEmit && npx vitest run && npx next lint` → all clean.

- [ ] **Step 2: Manual smoke** — `npm run dev` (kill port 3000 first), then:
  - Apply a non-empty dev preset → «Артефакты» → «Сигналы» tab lists artifacts; card opens on click; detail shows the parent-campaign settings table; delete works (card + detail).
  - Create a campaign via the wizard (scenario → source → channels → budget) → no top-level Signal is created; lands in the workflow editor → «Запустить» → pay → campaign card shows scoring progress (new) → after ~8s the «Артефакты» block shows a real artifact. Try an `own`-source campaign → artifact appears immediately.
  - Sidebar has no «Сигналы»; flyout «Последнее» lists campaigns only; AI navigation offers no «Сигналы» section.

- [ ] **Step 3: Report** the worktree path + branch (`feature/finish-campaign-first`) back to the user for review/merge (do not merge — AGENTS.md).

---

## Self-Review notes (carried into the plan)

- **Spec coverage:** §3 model → T10; §4 inversion → T4/T10; §5 artifact matrix → T1–T3; §6 section removal → T8/T9/T10; §7 UI port → T5/T6; §8 presets → T7; §9 tests → in each task; §10 risks (`campaign-screen.tsx:64` `signals.find`) → removed in T10 Step 1 (the `signal`/`signalType` reads at `campaign-screen.tsx:64-65,162-166` must be deleted there — campaign-screen shows scenario from `campaign.scenario`, drop the `Сигнал:` tag).
- **Extra bug fixed:** `campaign_launched` never set `phase`, so the screen's 8s advance (`phase === "scoring"` guard) never fired — T2 sets `phase` at launch.
- **Type consistency:** action `campaign_created_from_wizard` (T4), `artifact_deleted` (T5), `Preset.artifacts` (T7) used consistently across reducer + UI + tests.
- **Deferred (out of scope, per spec §1.3):** flat MessageTemplate, budget-estimator, node `needsAttention` validation, stream-artifact perpetual count growth (artifact is created at launch; live count increment is a follow-up).
