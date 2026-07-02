# Campaign-First Migration — Epic: Shell (Wave 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the two Shell-owned pieces of the campaign-first migration: (block 1, remainder) move the "new ready artifact" notification badge from the now-gone «Сигналы» nav item onto «Артефакты», and (block 12) apply the single confirm/continue footer rule — «Назад» pinned left, «Продолжить» pinned right via `flex justify-between` — uniformly across the wizard step footer and `survey-form.tsx`, without shifting the stepper.

**Architecture:** Minimal-UI-change, reuse-first (design §0.2, §2.13). The shared wizard `step-footer.tsx` already implements the block-12 layout (`justify-between`, «Назад» left, spacer when no `onBack`, main button right) — Shell's job there is to (a) lock that contract with a regression test against the post-Foundation path, and (b) bring the one non-conforming form (`survey-form.tsx`, currently `justify-end`) onto the same `flex justify-between` container. For the badge, Shell re-keys the render in `app-sidebar.tsx` and relocates the "clear on open" effect to the Артефакты section that Foundation stubbed — without touching the badge *state field* (which lives in a hub file). Each task ends green (tsc + vitest).

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, React reducer state in `src/state/app-state.ts`, Vitest (`npx vitest run`), `@testing-library/react` (jsdom) for component tests.

**Source spec:** `docs/superpowers/specs/2026-06-18-campaign-first-migration-design.md` (read §6 block 1 + block 12, §7 UI-decision registry, §8 strategy, §0 governing principles).

**Foundation prerequisite:** This epic branches off the **merged Foundation** branch (`feature/campaign-first-foundation`, see `docs/superpowers/plans/2026-06-18-campaign-first-foundation.md`). After Foundation:
- `app-sidebar.tsx` `navItems` is **Кампании · Артефакты · Статистика** (no standalone «Сигналы»). Block-1 nav skeleton is done; the **badge move is what remains** and is this epic's scope.
- The wizard has been `git mv`-d to `src/sections/campaigns/wizard/` (so `step-footer.tsx` is at `src/sections/campaigns/wizard/steps/step-footer.tsx`). All paths below assume the post-move location.
- `src/sections/artifacts/artifacts-section.tsx` exists as a Foundation stub. The Артефакты *content* epic owns its body; Shell only adds the badge-clear effect to it (see Task 2 boundary note).

**⚠️ Environment fact that bites (verified):** the repo dir name has non-ASCII chars with NFC/NFD ambiguity; the `Read`/`Write` tools may resolve to a stray sibling dir. Work through the shell (its cwd is the real git repo) or the ASCII symlink `/tmp/afina-repo`.

---

## Scope & Ownership

**Shell owns exclusively (this epic edits):**
- `src/sections/shell/**` — here specifically `app-sidebar.tsx` (badge render + clear wiring).
- The shared wizard footer **layout**: `src/sections/campaigns/wizard/steps/step-footer.tsx` (regression-lock only; already conforms).
- `suggestion-registry` **infrastructure** (`src/state/suggestion-registry/**`) per design §14.4 — Shell owns the prompt-bar *infrastructure*. **No infra change is required for this epic** (see "Suggestion-registry boundary" below). Listed for ownership clarity only.

**Coordination overlaps (touch only the named line/container):**
- `src/sections/survey/survey-form.tsx` — **shared with the Анкета epic** (block 6 rewrites its validation, copy, and field set). Shell's change here is limited to the **footer container class** (`justify-end` → `flex justify-between`) and adding a left-aligned «Назад» slot only if the Анкета epic introduces one. Both epics only touch the footer container; Shell does not alter validation, fields, copy, or submit logic. If a merge conflict arises it is confined to the footer `<div>`. **State the boundary in the PR.**
- `src/sections/artifacts/artifacts-section.tsx` — **Foundation-created stub, content owned by the Артефакты epic.** Shell adds *only* the badge-clear `useEffect` (the exact effect Foundation removed from the deleted `signals-section.tsx`). The Артефакты epic builds the section body around it. Boundary: Shell touches only the clear-on-mount effect; if the Артефакты epic lands first, Shell adds the effect to whatever component renders at the Артефакты route.

**Out of scope (do NOT author here):** wizard chip **content** (design §14.4 — owned by the Кампании epic; Shell owns prompt-bar infra, not chips); the Артефакты section body; any survey validation/copy/fields (Анкета epic); the badge **state field rename** (Foundation dependency, see below).

### Suggestion-registry boundary (no change needed)
The prompt-bar infrastructure (`registry.ts`, `types.ts`, `views.ts`, `sections.ts`, `commands.ts`) is Shell-owned but **neither block 1 nor block 12 requires touching it**. The badge is sidebar-local; the footer rule is form-local. Do not add wizard chip entries here — that is Кампании-epic content. If, while wiring the badge, you discover the registry hard-codes a `"Сигналы"` section/view key that no longer routes, that is a **Foundation dependency** (the `SectionName` union and routing are Foundation-frozen) — flag it, do not edit the registry section map to invent an Артефакты chip.

### Foundation dependency — badge state field naming
The badge **state** is owned by hub files Shell must not edit:
- `src/state/app-state.ts`: `AppState.notifications.signalsBadge: boolean` (~line 154), the `signals_badge_set` action (~line 264), the set-to-`true` in `signal_status_set`/equivalent (~line 862), and the `signals_badge_set` reducer case (~line 897).

Shell renders this **existing** field under the «Артефакты» label and clears it via the **existing** `signals_badge_set` action — **no app-state edit required**, so this epic stays within bounds. **However**, the field is still *named* `signalsBadge` and is still set by the (Foundation-retained) signal-status path. The conceptually-correct home is an Артефакты-keyed field set when `campaign_artifact_ready` fires.

> **🚩 Foundation dependency (flag — do NOT edit app-state here):** the badge state still lives under `notifications.signalsBadge` and is set by the legacy signal path, not by `campaign_artifact_ready`. A clean implementation would (a) rename the field to e.g. `notifications.artifactsBadge`, (b) move the set-to-`true` trigger into the `campaign_artifact_ready` reducer case, and (c) rename the `signals_badge_set` action. All three are reducer/type changes in the frozen `app-state.ts` hub and belong to Foundation (or a Foundation follow-up), not this epic. Shell deliberately reuses the existing field/action by name to avoid editing the hub. **Surface this to the user as a blocking decision before relying on the badge firing for real campaign artifacts.**

---

## Task 0: Isolated worktree off post-Foundation integration branch

**Files:** none (git only).

- [ ] **Step 1: Create the Shell worktree off the merged Foundation branch** (AGENTS.md mandates worktrees for parallel work)

Foundation must be merged to `main` (or to a shared `feature/campaign-first-foundation` integration branch) first — this epic depends on the moved wizard path and the stubbed Артефакты section. From the repo root, branch off whichever holds the merged Foundation work (prefer `main` if Foundation is merged there):

```bash
git worktree add .worktrees/epic-shell -b feature/epic-shell main
cd .worktrees/epic-shell
npm install
```

If Foundation is not yet on `main`, branch off its integration branch instead: `git worktree add .worktrees/epic-shell -b feature/epic-shell feature/campaign-first-foundation`.

- [ ] **Step 2: Confirm the Foundation prerequisites are present**

Run:
```bash
test -f src/sections/campaigns/wizard/steps/step-footer.tsx && echo "wizard moved OK" || echo "STOP: Foundation wizard move missing"
test -f src/sections/artifacts/artifacts-section.tsx && echo "artifacts stub OK" || echo "STOP: Foundation artifacts stub missing"
grep -q '"Артефакты"' src/sections/shell/app-sidebar.tsx && echo "nav has Артефакты OK" || echo "STOP: Foundation nav not applied"
```
Expected: all three "OK". If any line says STOP, the Foundation branch is not merged into this base — stop and report; do not proceed.

- [ ] **Step 3: Confirm a green baseline before any change**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; vitest all-pass. If red on a clean post-Foundation checkout, STOP and report — this plan assumes a green baseline.

---

## Task 1: Move the notification badge onto «Артефакты» in the sidebar

The badge currently renders keyed to `label === "Сигналы"` (`app-sidebar.tsx` ~line 76). Post-Foundation, «Сигналы» is no longer a nav item, so the badge never shows. Re-key it to «Артефакты». Reuse the **existing** `notifications.signalsBadge` field and the **existing** amber-dot markup — no new visual pattern (design §0.2). The dot styling stays identical; only the label predicate and `aria-label` copy change.

**Files:**
- Modify: `src/sections/shell/app-sidebar.tsx`
- Create: `src/sections/shell/app-sidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/sections/shell/app-sidebar.test.tsx`. The sidebar reads `useAppState()`, so wrap it in the app-state provider with a seeded badge. Confirm the provider's exported name first:
```bash
git grep -n "export" src/state/app-state-context.tsx | grep -iE "provider|AppStateProvider|StateProvider"
```
Use the real provider name below (shown as `AppStateProvider` — adapt if different). If the provider requires a full `AppState`, import `initialState` from `@/state/app-state` and override `notifications`.

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppSidebar } from "./app-sidebar";
import { AppStateProvider } from "@/state/app-state-context";
import { initialState } from "@/state/app-state";

function renderSidebar(badge: boolean) {
  return render(
    <AppStateProvider initialState={{ ...initialState, notifications: { signalsBadge: badge } }}>
      <AppSidebar activeNav="Кампании" />
    </AppStateProvider>
  );
}

describe("AppSidebar — ready-artifact badge", () => {
  it("shows the badge on Артефакты when notifications.signalsBadge is true", () => {
    renderSidebar(true);
    expect(screen.getByLabelText("Есть новые артефакты")).toBeInTheDocument();
  });

  it("renders no badge when the flag is false", () => {
    renderSidebar(false);
    expect(screen.queryByLabelText("Есть новые артефакты")).not.toBeInTheDocument();
  });

  it("does not put the badge on the Сигналы label (it no longer exists)", () => {
    renderSidebar(true);
    expect(screen.queryByLabelText("Есть новые сигналы")).not.toBeInTheDocument();
  });
});
```
> If `AppStateProvider` does not accept an `initialState` prop, check its actual signature with `git grep "AppStateProvider" src/state/app-state-context.tsx` and seed via whatever prop/hook it exposes (some providers take a `value` or wrap `useReducer` with no override — in that case render via a small test reducer wrapper, or assert on the dispatch-driven badge by dispatching `signals_badge_set`). Keep the assertions (badge present on Артефакты, absent on Сигналы) unchanged.

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/sections/shell/app-sidebar.test.tsx`
Expected: FAIL — the badge predicate still targets `"Сигналы"`, so `getByLabelText("Есть новые артефакты")` is not found.

- [ ] **Step 3: Re-key the badge render in `app-sidebar.tsx`**

In `src/sections/shell/app-sidebar.tsx`, change the predicate (~line 76):
```tsx
const showBadge = label === "Артефакты" && notifications.signalsBadge;
```
And update the dot's `aria-label` (~line 92) from `"Есть новые сигналы"` to:
```tsx
aria-label="Есть новые артефакты"
```
Leave the dot's classes (`bg-amber-500 ring-2 ring-background`, position) exactly as-is — reuse, not a new pattern (design §0.2, §7 has no badge-styling decision). Do not add a `signalsBadge` import or rename anything; `notifications` is already destructured from `useAppState()`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/sections/shell/app-sidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/shell/app-sidebar.tsx src/sections/shell/app-sidebar.test.tsx
git commit -m "feat(shell): move ready-artifact badge from Сигналы to Артефакты"
```

---

## Task 2: Clear the badge when the Артефакты section opens

The "clear on open" effect lived in the now-deleted `signals-section.tsx` (it dispatched `signals_badge_set: false` on mount). Foundation removed it with that file. Without a replacement the badge would never clear. Add the equivalent effect to the component rendered at the Артефакты route — the Foundation stub `artifacts-section.tsx`.

**Files:**
- Modify: `src/sections/artifacts/artifacts-section.tsx`
- Create: `src/sections/artifacts/artifacts-badge-clear.test.tsx`

> **Boundary (coordination with the Артефакты epic):** Shell adds *only* the clear-on-mount effect — the exact behavior ported from the old signals section. The Артефакты epic owns all section content. If the Артефакты epic has already replaced the stub with a richer component by the time this lands, add the same `useEffect` to that component instead (same dispatch, same condition). Do not restructure or style the section here.

- [ ] **Step 1: Write the failing test**

Create `src/sections/artifacts/artifacts-badge-clear.test.tsx`. Render the section inside the provider with the badge set, and assert the clear dispatch fired. The cleanest seam is to spy on dispatch; if the provider doesn't expose dispatch injection, assert on observable state by reading the badge back through a probe child. Prefer the dispatch-spy form:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ArtifactsSection } from "./artifacts-section";
import * as ctx from "@/state/app-state-context";

describe("ArtifactsSection — badge clear on open", () => {
  it("dispatches signals_badge_set:false on mount when the badge is set", () => {
    const dispatch = vi.fn();
    vi.spyOn(ctx, "useAppDispatch").mockReturnValue(dispatch);
    vi.spyOn(ctx, "useAppState").mockReturnValue({
      ...ctx.useAppState,
      notifications: { signalsBadge: true },
    } as never);

    render(<ArtifactsSection />);
    expect(dispatch).toHaveBeenCalledWith({ type: "signals_badge_set", value: false });
  });
});
```
> Confirm the real hook names with `git grep -n "export function use" src/state/app-state-context.tsx` (expected `useAppState`, `useAppDispatch`). If the context module exports differently, adjust the `vi.spyOn` targets. The mocked `useAppState` only needs `notifications` populated for the effect's guard.

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/sections/artifacts/artifacts-badge-clear.test.tsx`
Expected: FAIL — the stub has no effect, so `dispatch` is never called.

- [ ] **Step 3: Add the clear effect to `artifacts-section.tsx`**

Edit `src/sections/artifacts/artifacts-section.tsx` to add the mount effect, keeping the stub's existing render. Mirror the old signals-section behavior exactly (run only on mount, guarded by the flag):
```tsx
"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppState } from "@/state/app-state-context";

/**
 * Stub body — content owned by the Артефакты epic (Wave 1, spec block 10).
 * Shell adds the badge-clear effect ported from the removed signals-section.
 */
export function ArtifactsSection() {
  const { notifications } = useAppState();
  const dispatch = useAppDispatch();

  // Opening the section clears the ready-artifact badge.
  useEffect(() => {
    if (notifications.signalsBadge) {
      dispatch({ type: "signals_badge_set", value: false });
    }
    // Mount-only to avoid loops (ported verbatim from the old signals section).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 items-center justify-center text-muted-foreground">
      Артефакты — раздел в разработке
    </div>
  );
}
```
> Keep the visible markup identical to the Foundation stub so the Артефакты epic's later body swap is a clean replacement of the JSX only.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/sections/artifacts/artifacts-badge-clear.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/artifacts/artifacts-section.tsx src/sections/artifacts/artifacts-badge-clear.test.tsx
git commit -m "feat(artifacts): clear ready-artifact badge on section open"
```

---

## Task 3: Lock the wizard step-footer block-12 layout with a regression test

The shared `step-footer.tsx` **already** implements the block-12 rule: outer row is `flex items-center justify-between`, «Назад» (outline) renders left, a `<span aria-hidden />` spacer holds the right slot when `onBack` is absent, and the main button renders right. No code change — Shell adds a test that locks this contract at the post-Foundation path so a future edit can't silently break alignment. The stepper is `absolute`-positioned in `campaign-workspace.tsx` (independent of this footer), so footer changes cannot shift it — assert that invariant in prose via the test's scope.

**Files:**
- Create: `src/sections/campaigns/wizard/steps/step-footer.test.tsx`

- [ ] **Step 1: Write the test (expected to PASS immediately — it's a regression lock)**

Create `src/sections/campaigns/wizard/steps/step-footer.test.tsx`:
```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StepFooter } from "./step-footer";

describe("StepFooter — block-12 alignment rule", () => {
  it("uses a justify-between row so Назад pins left and the main button pins right", () => {
    const { container } = render(
      <StepFooter onBack={vi.fn()} onContinue={vi.fn()} continueLabel="Продолжить" />
    );
    const row = container.querySelector(".justify-between");
    expect(row).not.toBeNull();
    // Назад is the first interactive child (left), Продолжить the last (right).
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("Назад");
    expect(buttons[buttons.length - 1]).toHaveTextContent("Продолжить");
  });

  it("keeps the main button right via a spacer when there is no Назад", () => {
    const { container } = render(<StepFooter onContinue={vi.fn()} continueLabel="Запустить" />);
    const row = container.querySelector(".justify-between");
    expect(row).not.toBeNull();
    // Only one button; an aria-hidden spacer holds the left slot.
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent("Запустить");
    expect(container.querySelector("[aria-hidden]")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/sections/campaigns/wizard/steps/step-footer.test.tsx`
Expected: PASS (the layout already conforms). If it FAILS, the Foundation `git mv` left `step-footer.tsx` in a different state than expected — reconcile against `src/sections/campaigns/wizard/steps/step-footer.tsx` before continuing; do not change the rule, fix the test path.

- [ ] **Step 3: Commit**

```bash
git add src/sections/campaigns/wizard/steps/step-footer.test.tsx
git commit -m "test(shell): lock wizard step-footer block-12 alignment"
```

---

## Task 4: Apply the block-12 footer rule to `survey-form.tsx`

`survey-form.tsx` is the only confirm/continue form not on the shared rule: its footer is `mt-8 flex items-center justify-end` with a single «Продолжить» button (no «Назад»). Block 12 mandates `flex justify-between` for confirm/continue forms — «Назад» left, «Продолжить» right. The survey's first step has no back action, so the rule's "no-footer / no-back" case applies: keep «Продолжить» pinned **right** under a `justify-between` container with a left spacer, matching `step-footer.tsx`'s spacer pattern (reuse the established pattern — design §0.2, §2.13; this is **not** a new pattern, so no §7 escalation).

**Files:**
- Modify: `src/sections/survey/survey-form.tsx`
- Create: `src/sections/survey/survey-form-footer.test.tsx`

> **Coordination boundary (Анкета epic shares this file):** Shell changes ONLY the footer container `<div>` (line ~87) — class swap to `flex justify-between` plus a left spacer. Do not touch validation (`isWebsiteValid`/`normalizeWebsite`), fields, copy, or `handleSubmit`; those are the Анкета epic's (block 6). If the Анкета epic adds a real «Назад» button to the survey, it replaces the spacer with the button — the `justify-between` container Shell installs already accommodates it. Note this in the PR so the merge is understood as a shared-line touch.

- [ ] **Step 1: Write the failing test**

Create `src/sections/survey/survey-form-footer.test.tsx`. `SurveyForm` reads `useAppState()`/`useAppDispatch()`, so render under the provider (same approach as Task 1) or spy the hooks (same approach as Task 2). Assert the footer container uses `justify-between` (not `justify-end`) and the button stays right:
```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SurveyForm } from "./survey-form";
import * as ctx from "@/state/app-state-context";

describe("SurveyForm — block-12 footer rule", () => {
  it("uses a justify-between footer (not justify-end)", () => {
    vi.spyOn(ctx, "useAppDispatch").mockReturnValue(vi.fn());
    vi.spyOn(ctx, "useAppState").mockReturnValue({
      survey: { companyName: "", companyWebsite: "", directionId: null },
    } as never);

    const { container } = render(<SurveyForm onSubmit={vi.fn()} />);
    const submit = screen.getByRole("button", { name: "Продолжить" });
    // Footer is the submit button's parent row.
    const footer = submit.parentElement!;
    expect(footer.className).toContain("justify-between");
    expect(footer.className).not.toContain("justify-end");
  });
});
```
> Adapt the mocked `survey` shape to the real `Survey` type if its fields differ (`git grep -n "type Survey" src/types/survey.ts`). The test only needs the form to render without throwing.

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/sections/survey/survey-form-footer.test.tsx`
Expected: FAIL — the footer is still `justify-end`.

- [ ] **Step 3: Swap the footer container to the block-12 rule**

In `src/sections/survey/survey-form.tsx`, replace the footer block (~lines 87–91):
```tsx
      <div className="mt-8 flex items-center justify-end">
        <Button type="submit" variant="default" size="lg">
          Продолжить
        </Button>
      </div>
```
with the `justify-between` + left-spacer form (mirrors `step-footer.tsx`):
```tsx
      <div className="mt-8 flex items-center justify-between gap-3">
        <span aria-hidden />
        <Button type="submit" variant="default" size="lg">
          Продолжить
        </Button>
      </div>
```
Touch nothing else in the file (boundary with Анкета epic).

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/sections/survey/survey-form-footer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/survey/survey-form.tsx src/sections/survey/survey-form-footer.test.tsx
git commit -m "feat(survey): apply block-12 footer rule (justify-between) to survey-form"
```

---

## Task 5: Shell epic gate — full green + smoke

**Files:** none (verification only).

- [ ] **Step 1: Types clean**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Full suite green**

Run: `npx vitest run`
Expected: all PASS (includes the four new tests + existing `app-state.test.ts` badge tests still green — Shell did not touch the reducer).

- [ ] **Step 3: Build**

Run: `npx next build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke (dev server on a non-default port per AGENTS.md)**

Run: `npx next dev -p 3001`
Verify:
- Trigger a campaign artifact becoming ready (or seed `notifications.signalsBadge: true` via dev tooling): the amber dot appears on **Артефакты**, not on any other nav item.
- Open **Артефакты**: the dot clears.
- Open the wizard (Создать кампанию): on a footer step, «Назад» is left, «Продолжить»/«Запустить» is right; the stepper (top-right, absolute) does not move between steps. The scenario step (auto-advance) has no footer — rule does not apply there.
- Open the survey: «Продолжить» is pinned right under a `justify-between` footer.

- [ ] **Step 5: Report worktree + branch to the user**

Shell epic is complete on `feature/epic-shell` at `.worktrees/epic-shell`. Per AGENTS.md, merge is the user's call.

---

## Handoff note

- **Foundation dependency flagged (1):** the badge **state field** is still named `notifications.signalsBadge` and is set by the legacy signal-status path, not by `campaign_artifact_ready`. Renaming it to `artifactsBadge`, moving the set-true trigger into the `campaign_artifact_ready` reducer case, and renaming the `signals_badge_set` action are all `app-state.ts` hub edits and belong to Foundation (or a Foundation follow-up). Shell reused the existing field/action by name to stay out of the hub — the badge will only fire for *real* campaign artifacts once Foundation moves the trigger. **Surface to the user as a decision before depending on artifact-driven badging.**
- **ASK-USER escalations (0):** none. Both block-12 changes reuse the existing `step-footer.tsx` `justify-between` pattern (design §0.2 reuse, not a new pattern → no §7 escalation), and the badge reuses the existing amber-dot markup. The §7 registry item **§7.1 (Артефакты sidebar icon)** is *not* in this epic's scope — Foundation set the nav and its icon; if the icon is still provisional, that escalation belongs to whoever finalizes the nav, not to this badge-move epic.
- **Coordination overlaps noted in PRs:** `survey-form.tsx` (Анкета epic — footer container line only) and `artifacts-section.tsx` (Артефакты epic — clear-effect only).
- **suggestion-registry:** untouched. No prompt-bar infra change was required; wizard chip content remains the Кампании epic's.

---

## Self-Review (completed)

- **Spec coverage:** block 1 remainder (badge move) → Tasks 1–2; block 12 (footer rule) → Tasks 3 (wizard lock) + 4 (survey-form). Stepper-no-shift invariant verified (stepper is `absolute` in `campaign-workspace.tsx`, independent of footer) and covered by the smoke step. Scenario auto-advance step correctly excluded (no footer).
- **Hub files untouched:** no edits to `src/types/*`, `src/state/app-state.ts`, or `src/app/page.tsx`. Badge reuses existing field + action; routing/section names are Foundation-frozen.
- **Reuse over new pattern:** both footer changes use the existing `step-footer.tsx` `justify-between` + spacer pattern; badge uses the existing amber-dot. No new visual decisions → no §7 ASK-USER escalation.
- **Ownership boundaries stated:** survey-form (Анкета overlap — footer container only) and artifacts-section (Артефакты overlap — clear effect only) explicitly bounded; suggestion-registry infra confirmed no-change.
- **TDD:** every behavior task is red→green with a real test file at a real path; Task 3 is a deliberate already-green regression lock (noted as such).
