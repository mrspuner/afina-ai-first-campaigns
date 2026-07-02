# Entity Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared card pattern so every campaign (any status) and every ready signal opens a detail card before its workflow/summary, and remove the `scheduled` campaign status entirely.

**Architecture:** A new `EntityCardShell` UI primitive defines the shared visual pattern (header + tags + meta + sections + control buttons). `CampaignScreen` is generalized to all statuses on top of it; a new `SignalScreen` is built on it too. Routing is changed so `campaign_opened` always lands on the card, and ready signals open a new `signal` view. `scheduled` is deleted from the type, reducer, presets, parser, and UI.

**Tech Stack:** Next.js 16, React, Tailwind v4, shadcn/ui (base-ui), motion v12, vitest. State is a single reducer in `src/state/app-state.ts`.

**Working directory:** `.worktrees/entity-cards` (branch `feature/entity-cards`). Run all commands from there. Dev server, if needed, on port 3001 (`npm run dev -- -p 3001`) — the main checkout may hold 3000.

---

## File Structure

**Modified:**
- `src/state/app-state.ts` — remove `scheduled`; add `Campaign.scenario`, `Signal.name`; add `signal` view + `signal_opened`/`signal_renamed` actions; change `campaign_opened` routing; default campaign name "Сценарий №N".
- `src/sections/campaigns/status-badge.tsx` — labels + drop `scheduled`.
- `src/state/parse-campaign-filter.ts` — drop `scheduled` root.
- `src/state/presets.ts` — drop `scheduled` from distributions + branch + unused `rndFutureDate`.
- `src/sections/campaigns/canvas-header.tsx` — drop 3 `scheduled` references.
- `src/sections/campaigns/campaign-card.tsx` (list item) — drop `scheduled` branch.
- `src/sections/campaigns/campaigns-section.tsx` — drop `scheduledFor` in `relevantTimestamp`.
- `src/sections/signals/steps/step-6-summary.tsx` — import shared maps.
- `src/sections/signals/signals-section.tsx` — ready signal opens `signal` view.
- `src/sections/campaigns/campaign-screen.tsx` — generalize to all statuses.
- `src/app/page.tsx` — render `SignalScreen` for `signal` view.
- Tests: `app-state.test.ts`, `presets.test.ts`, `parse-campaign-filter.test.ts`.

**Created:**
- `src/components/ui/entity-card.tsx` — shared shell.
- `src/sections/signals/signal-summary-data.ts` — shared scenario/segment maps.
- `src/state/scenario-display.ts` — `scenarioNameForSignal`, `defaultCampaignName`.
- `src/sections/signals/signal-screen.tsx` — signal card.
- `src/state/scenario-display.test.ts`.

**Deleted:**
- `src/sections/campaigns/schedule-campaign-dialog.tsx`.

---

## Task 1: Remove `scheduled` status everywhere

Removing `"scheduled"` from the `CampaignStatus` union breaks every reference at compile time, so all edits land together.

**Files:**
- Modify: `src/state/app-state.ts`
- Modify: `src/sections/campaigns/status-badge.tsx`
- Modify: `src/state/parse-campaign-filter.ts`
- Modify: `src/state/presets.ts`
- Modify: `src/sections/campaigns/canvas-header.tsx`
- Modify: `src/sections/campaigns/campaign-card.tsx`
- Modify: `src/sections/campaigns/campaigns-section.tsx`
- Delete: `src/sections/campaigns/schedule-campaign-dialog.tsx`
- Test: `src/state/app-state.test.ts`, `src/state/presets.test.ts`, `src/state/parse-campaign-filter.test.ts`

- [ ] **Step 1: Update tests to drop `scheduled` expectations**

In `src/state/app-state.test.ts` delete these tests entirely:
- `it("opens scheduled campaign with launched=false", ...)` (around line 440)
- `it("returns scheduled campaign to draft and clears scheduledFor", ...)` (around line 655)
- `it("is a no-op when campaign is not in scheduled status", ...)` (around line 674)

In the same file, find the `isCampaignDone` test `it("returns false for draft/scheduled only", ...)` (around line 745) and replace its body so it no longer constructs a `scheduled` campaign:

```ts
  it("returns false for draft-only campaign lists", () => {
    const state: AppState = {
      ...initialState,
      campaigns: [
        makeCampaign({ id: "c1", status: "draft" }),
        makeCampaign({ id: "c2", status: "draft" }),
      ],
    };
    expect(isCampaignDone(state)).toBe(false);
  });
```

Search `app-state.test.ts` for any remaining `scheduled` / `scheduledFor` (e.g. line ~152) and remove those constructions/assertions.

In `src/state/presets.test.ts` search for `scheduled` and remove any assertion that the distribution contains scheduled campaigns or that totals include scheduled counts. If a test asserts an exact campaign count for `mid`/`full`, update it: `mid` drops by 2 (was active2+paused1+completed3+scheduled2+draft2=10 → 8), `full` drops by 6 (was 8+2+10+6+6=32 → 26).

In `src/state/parse-campaign-filter.test.ts` search for `scheduled` and remove any case parsing "запланировано"/"scheduled" → `["scheduled"]`.

- [ ] **Step 2: Run tests to confirm they now fail to compile/typecheck against the still-present `scheduled`**

Run: `npx vitest run src/state/app-state.test.ts src/state/presets.test.ts src/state/parse-campaign-filter.test.ts`
Expected: PASS for the edited tests is not guaranteed yet because production code still emits `scheduled`; the goal of this step is just to confirm the suite runs. Note any failures referencing `scheduled` — they disappear after Step 3–9.

- [ ] **Step 3: Remove `scheduled` from `app-state.ts` types**

In `src/state/app-state.ts`, change the union (lines ~70-75):

```ts
export type CampaignStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed";
```

In the `Campaign` type remove the `scheduledFor?: string;` field and its `scheduled`-related comment lines (around line 86).

- [ ] **Step 4: Remove `scheduled` from `app-state.ts` actions + reducer**

Remove the action variant `| { type: "campaign_schedule_cancelled"; id: string }` (around line 206).

In the `campaign_status_changed` case remove the line:
```ts
          if (action.status === "scheduled") next.scheduledFor = action.timestamp;
```

Delete the entire `case "campaign_schedule_cancelled":` block (around lines 538-548).

Search the file for any remaining `scheduled` / `scheduledFor` (the `campaign_opened`, `campaign_selected`, `rebuildViewFromAddress` launched-checks reference only `active`/`paused`/`completed`, so leave them) and remove leftovers.

- [ ] **Step 5: Update `status-badge.tsx`**

Replace the maps in `src/sections/campaigns/status-badge.tsx` (lines 4-18):

```ts
export const STATUS_LABELS: Record<CampaignStatus, string> = {
  active: "Запущена",
  draft: "Не запущена",
  paused: "Остановлена",
  completed: "Завершена",
};

const DOT: Record<CampaignStatus, string> = {
  active: "bg-green-500",
  draft: "bg-muted-foreground",
  paused: "bg-amber-500",
  completed: "bg-muted-foreground/50",
};
```

- [ ] **Step 6: Update `parse-campaign-filter.ts`**

In `STATUS_ROOTS` (lines 10-16) delete the line:
```ts
  { status: "scheduled", roots: ["запланиров", "расписани", "scheduled", "план"] },
```

- [ ] **Step 7: Update `presets.ts`**

In `generateCampaigns`, delete the branch:
```ts
    if (status === "scheduled") {
      campaign.scheduledFor = rndFutureDate(rng, 30, opts.now);
    }
```

In both `distribution` objects remove `scheduled: N,`:
- `mid`: `distribution: { active: 2, paused: 1, completed: 3, draft: 2 },`
- `full`: `distribution: { active: 8, paused: 2, completed: 10, draft: 6 },`

Delete the now-unused `rndFutureDate` function (around line 56). If eslint flags any other now-unused import as a result, remove it.

- [ ] **Step 8: Update `canvas-header.tsx`**

Open `src/sections/campaigns/canvas-header.tsx`. Remove:
- The status line branch (lines ~95-96):
  ```ts
  if (c.status === "scheduled" && c.scheduledFor)
    return `Запуск запланирован на ${formatDateTime(c.scheduledFor)}`;
  ```
- The `{campaign.status === "scheduled" && ( … )}` JSX block (around line 298) in full.
- The `<ScheduleCampaignDialog … initialIso={campaign.scheduledFor} />` usage (around line 426) and its `import` of `ScheduleCampaignDialog` at the top.

After removal, build will reveal any dangling state/handlers that only served scheduling (e.g. a `scheduleOpen` useState or `formatDateTime` if unused) — remove those too.

- [ ] **Step 9: Update list `campaign-card.tsx`, `campaigns-section.tsx`, delete dialog**

In `src/sections/campaigns/campaign-card.tsx` `timestampLine` remove:
```ts
  if (c.status === "scheduled" && c.scheduledFor) return `Запуск ${formatDate(c.scheduledFor)}`;
```

In `src/sections/campaigns/campaigns-section.tsx` `relevantTimestamp` change:
```ts
function relevantTimestamp(c: Campaign): string {
  return c.launchedAt ?? c.completedAt ?? c.createdAt;
}
```

Delete the file `src/sections/campaigns/schedule-campaign-dialog.tsx`:
```bash
git rm src/sections/campaigns/schedule-campaign-dialog.tsx
```

- [ ] **Step 10: Run tests, lint, build**

Run: `npx vitest run`
Expected: PASS (all suites).
Run: `npx eslint`
Expected: no errors.
Run: `npm run build`
Expected: compiles with no type errors.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor(campaign): remove scheduled status and launch scheduling"
```

---

## Task 2: Shared scenario/segment data + display helpers

**Files:**
- Create: `src/sections/signals/signal-summary-data.ts`
- Create: `src/state/scenario-display.ts`
- Create: `src/state/scenario-display.test.ts`
- Modify: `src/sections/signals/steps/step-6-summary.tsx`

- [ ] **Step 1: Create shared summary-data module**

Create `src/sections/signals/signal-summary-data.ts`:

```ts
import { SCENARIOS } from "@/data/scenarios";

/** Scenario id → display name, used by the wizard summary and the signal card. */
export const SCENARIO_NAMES: Record<string, string> = Object.fromEntries(
  SCENARIOS.map((s) => [s.id, s.name]),
);

/** Segment key → labelled price line (prototype pricing). */
export const SEGMENT_NAMES: Record<string, string> = {
  max: "Максимальный (₽ 0.45 / сигнал)",
  "very-high": "Очень высокий (₽ 0.35 / сигнал)",
  high: "Высокий (₽ 0.25 / сигнал)",
  medium: "Средний и ниже (₽ 0.07 / сигнал)",
};

export const SEGMENT_PRICES: Record<string, number> = {
  max: 0.45,
  "very-high": 0.35,
  high: 0.25,
  medium: 0.07,
};
```

- [ ] **Step 2: Point step-6 at the shared module**

In `src/sections/signals/steps/step-6-summary.tsx` delete the local `SCENARIO_NAMES`, `SEGMENT_NAMES`, `SEGMENT_PRICES` definitions (lines ~13-29) and the now-unused `import { SCENARIOS } from "@/data/scenarios";`. Add:

```ts
import { SCENARIO_NAMES, SEGMENT_NAMES, SEGMENT_PRICES } from "@/sections/signals/signal-summary-data";
```

- [ ] **Step 3: Write failing test for display helpers**

Create `src/state/scenario-display.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scenarioNameForSignal, defaultCampaignName } from "./scenario-display";
import type { Signal } from "./app-state";

function sig(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig_1",
    type: "Реактивация",
    count: 1000,
    segments: { max: 1, high: 1, mid: 1, low: 1 },
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("scenarioNameForSignal", () => {
  it("prefers the wizard scenario id when present", () => {
    const s = sig({ wizardData: { scenario: "cur-sleeping" } as never });
    expect(scenarioNameForSignal(s)).toBe("Спящий клиент");
  });

  it("falls back to the base scenario for the signal type", () => {
    expect(scenarioNameForSignal(sig({ type: "Реактивация" }))).toBe("Реактивация");
  });

  it("falls back to the type string when nothing maps", () => {
    const s = sig({ type: "Несуществующий" as never });
    expect(scenarioNameForSignal(s)).toBe("Несуществующий");
  });
});

describe("defaultCampaignName", () => {
  it("formats as «Сценарий №N»", () => {
    expect(defaultCampaignName("Реактивация", 1)).toBe("Реактивация №1");
    expect(defaultCampaignName("Спящий клиент", 3)).toBe("Спящий клиент №3");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/state/scenario-display.test.ts`
Expected: FAIL — `scenario-display` module not found.

- [ ] **Step 5: Implement helpers**

Create `src/state/scenario-display.ts`:

```ts
import { SCENARIOS } from "@/data/scenarios";
import type { Signal } from "./app-state";
import { SCENARIO_NAMES } from "@/sections/signals/signal-summary-data";

/**
 * Human scenario name for a signal. Prefers the explicit scenario id captured
 * in the wizard; otherwise falls back to the base scenario whose signalType
 * matches; finally falls back to the raw type string.
 */
export function scenarioNameForSignal(signal: Signal): string {
  const id = signal.wizardData?.scenario ?? null;
  if (id && SCENARIO_NAMES[id]) return SCENARIO_NAMES[id];
  const base = SCENARIOS.find((s) => s.isBase && s.signalType === signal.type);
  return base?.name ?? signal.type;
}

/** Generic campaign name in the «Сценарий №N» format. */
export function defaultCampaignName(scenarioName: string, n: number): string {
  return `${scenarioName} №${n}`;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/state/scenario-display.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(state): shared scenario/segment data and display helpers"
```

---

## Task 3: State model — Campaign.scenario, Signal.name, new view + actions

**Files:**
- Modify: `src/state/app-state.ts`
- Test: `src/state/app-state.test.ts`

- [ ] **Step 1: Write failing reducer tests**

Append to `src/state/app-state.test.ts`:

```ts
describe("appReducer — entity cards", () => {
  it("campaign_opened routes every status to the campaign card", () => {
    for (const status of ["draft", "active", "paused", "completed"] as const) {
      const state: AppState = {
        ...initialState,
        campaigns: [makeCampaign({ id: "cmp_A", name: "C", status })],
      };
      const next = appReducer(state, { type: "campaign_opened", id: "cmp_A" });
      expect(next.view).toEqual({
        kind: "campaign",
        campaign: { id: "cmp_A", name: "C" },
      });
    }
  });

  it("signal_opened opens the signal card", () => {
    const state: AppState = {
      ...initialState,
      signals: [makeSignal({ id: "sig_1" })],
    };
    const next = appReducer(state, { type: "signal_opened", id: "sig_1" });
    expect(next.view).toEqual({ kind: "signal", signal: { id: "sig_1" } });
  });

  it("signal_opened is a no-op for a missing signal", () => {
    const next = appReducer(initialState, { type: "signal_opened", id: "nope" });
    expect(next.view).toEqual(initialState.view);
  });

  it("signal_renamed updates the signal name", () => {
    const state: AppState = {
      ...initialState,
      signals: [makeSignal({ id: "sig_1" })],
    };
    const next = appReducer(state, { type: "signal_renamed", id: "sig_1", name: "Тёплая база" });
    expect(next.signals[0].name).toBe("Тёплая база");
  });

  it("signal_renamed ignores blank names", () => {
    const state: AppState = {
      ...initialState,
      signals: [makeSignal({ id: "sig_1", name: "Keep" })],
    };
    const next = appReducer(state, { type: "signal_renamed", id: "sig_1", name: "   " });
    expect(next.signals[0].name).toBe("Keep");
  });

  it("campaign view round-trips through the address", () => {
    const view: View = { kind: "signal", signal: { id: "sig_1" } };
    expect(viewToAddress(view)).toEqual({ kind: "signal", signalId: "sig_1" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/state/app-state.test.ts`
Expected: FAIL — `signal_opened`/`signal_renamed`/`signal` view not defined.

- [ ] **Step 3: Extend types in `app-state.ts`**

Add `scenario?: { id: string; name: string };` to the `Campaign` type.

Add `name?: string;` to the `Signal` type (with a one-line comment: `// User-editable display name; falls back to `type` when absent.`).

Add to the `View` union:
```ts
  | { kind: "signal"; signal: { id: string } }
```
Add to the `ViewAddress` union:
```ts
  | { kind: "signal"; signalId: string }
```

Add to the `Action` union:
```ts
  | { type: "signal_opened"; id: string }
  | { type: "signal_renamed"; id: string; name: string }
```

- [ ] **Step 4: Change `campaign_opened` to always open the card**

Replace the `campaign_opened` case body:

```ts
    case "campaign_opened": {
      const c = state.campaigns.find((cc) => cc.id === action.id);
      if (!c) return state;
      // Every status now lands on the campaign card; the card decides the
      // next step (workflow, payment, stats, duplicate).
      return {
        ...state,
        view: { kind: "campaign", campaign: { id: c.id, name: c.name } },
        activeSection: null,
        campaignFilter: [],
        campaignSort: "default",
      };
    }
```

- [ ] **Step 5: Add `signal_opened` / `signal_renamed` cases**

Add near the other signal cases (e.g. after `signal_deleted`):

```ts
    case "signal_opened": {
      const s = state.signals.find((ss) => ss.id === action.id);
      if (!s) return state;
      return {
        ...state,
        view: { kind: "signal", signal: { id: s.id } },
        activeSection: null,
      };
    }

    case "signal_renamed": {
      const name = action.name.trim();
      if (!name) return state;
      if (!state.signals.some((s) => s.id === action.id)) return state;
      return {
        ...state,
        signals: state.signals.map((s) =>
          s.id === action.id ? { ...s, name } : s
        ),
      };
    }
```

- [ ] **Step 6: Handle the `signal` view in address helpers**

In `viewToAddress` add before `case "section":`:
```ts
    case "signal":
      return { kind: "signal", signalId: view.signal.id };
```

In `rebuildViewFromAddress` add before `case "section":`:
```ts
    case "signal":
      return { kind: "signal", signal: { id: addr.signalId } };
```
Note: `rebuildViewFromAddress` only receives `campaigns`, not signals — that's fine. `SignalScreen` resolves the live signal from state and renders nothing if it's missing.

- [ ] **Step 7: Run tests to verify pass**

Run: `npx vitest run src/state/app-state.test.ts`
Expected: PASS.

- [ ] **Step 8: Populate scenario + «Сценарий №N» names on creation**

Add the import at the top of `app-state.ts`:
```ts
import { scenarioNameForSignal, defaultCampaignName } from "./scenario-display";
```

In `signal_complete` / `step2_clicked` case, replace the new-campaign construction so it carries the scenario and uses the generic name. Replace from `const scenarioId = …` through the `newCampaign` object with:

```ts
      const scenarioName = scenarioNameForSignal(latestSignal);
      const n =
        state.campaigns.filter((c) => c.signalId === latestSignal.id).length + 1;
      const campaignName = defaultCampaignName(scenarioName, n);
      const campaignId = `cmp_${nanoid(6)}`;
      const newCampaign: Campaign = {
        id: campaignId,
        name: campaignName,
        signalId: latestSignal.id,
        status: "draft",
        createdAt: new Date().toISOString(),
        scenario: { id: latestSignal.wizardData?.scenario ?? "", name: scenarioName },
      };
```
(Delete the now-unused `SCENARIOS` lookup lines in this case if they remain; keep the `import { SCENARIOS }` only if still referenced elsewhere in the file — eslint will flag it.)

In `campaign_from_signal` case, replace the `newCampaign` construction:

```ts
      const scenarioName = scenarioNameForSignal(signal);
      const newCampaign: Campaign = {
        id: `cmp_${nanoid(6)}`,
        name: defaultCampaignName(scenarioName, n),
        signalId: signal.id,
        status: "draft",
        createdAt: new Date().toISOString(),
        scenario: { id: signal.wizardData?.scenario ?? "", name: scenarioName },
      };
```

In `campaign_duplicated` case, carry the scenario from the original:
```ts
      const dup: Campaign = {
        id: `cmp_${nanoid(6)}`,
        name: `Копия — ${original.name}`,
        signalId: original.signalId,
        status: "draft",
        createdAt: new Date().toISOString(),
        scenario: original.scenario,
      };
```

- [ ] **Step 9: Run tests, lint, build**

Run: `npx vitest run`
Expected: PASS.
Run: `npx eslint && npm run build`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(state): campaign scenario tag, signal name, signal card view + actions"
```

---

## Task 4: `EntityCardShell` shared component

UI primitive — verified by build/lint (no component test harness in this repo).

**Files:**
- Create: `src/components/ui/entity-card.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/ui/entity-card.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EntityCardAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: "default" | "outline";
  disabled?: boolean;
}

interface EntityCardShellProps {
  title: string;
  /** When supplied, the title becomes inline-editable. */
  onRename?: (name: string) => void;
  badge?: ReactNode;
  tags?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  primaryAction?: EntityCardAction;
  secondaryActions?: EntityCardAction[];
}

export function EntityCardShell({
  title,
  onRename,
  badge,
  tags,
  meta,
  children,
  primaryAction,
  secondaryActions,
}: EntityCardShellProps) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-8 pb-promptbar pt-[120px]">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {/* Header */}
        <section className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            {onRename ? (
              <InlineEditableTitle title={title} onRename={onRename} />
            ) : (
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {title}
              </h1>
            )}
            {badge}
          </div>
          {tags && <div className="flex flex-wrap items-center gap-2">{tags}</div>}
          {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
        </section>

        {children}

        {(primaryAction || (secondaryActions && secondaryActions.length > 0)) && (
          <div className="flex flex-wrap items-center gap-2">
            {primaryAction && (
              <Button
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                className="gap-2"
              >
                {primaryAction.icon}
                {primaryAction.label}
              </Button>
            )}
            {secondaryActions?.map((a) => (
              <Button
                key={a.label}
                variant={a.variant ?? "outline"}
                onClick={a.onClick}
                disabled={a.disabled}
                className="gap-2"
              >
                {a.icon}
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function InlineEditableTitle({
  title,
  onRename,
}: {
  title: string;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const next = draft.trim();
    if (next && next !== title) onRename(next);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(title);
            setEditing(false);
          }
        }}
        className="w-full rounded-md border border-border bg-card px-2 py-1 text-2xl font-semibold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(title);
        setEditing(true);
      }}
      className="group flex items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      aria-label="Переименовать"
    >
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <Pencil className="h-4 w-4 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </button>
  );
}

export function CardTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

export function CardSection({
  label,
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-5", className)}>
      {label && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
      )}
      {children}
    </section>
  );
}
```

- [ ] **Step 2: Lint + build**

Run: `npx eslint src/components/ui/entity-card.tsx && npm run build`
Expected: clean (component is unused for now — build still passes).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): EntityCardShell shared card pattern"
```

---

## Task 5: Generalize `CampaignScreen` to all statuses

**Files:**
- Modify: `src/sections/campaigns/campaign-screen.tsx`

- [ ] **Step 1: Rewrite `campaign-screen.tsx`**

Replace the entire file with:

```tsx
"use client";

import { ArrowRight, Copy, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EntityCardShell,
  CardTag,
  CardSection,
  type EntityCardAction,
} from "@/components/ui/entity-card";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { WorkflowMiniPreview } from "./workflow-mini-preview";
import { ProviderList } from "./provider-list";
import { StatusBadge } from "./status-badge";
import { scenarioNameForSignal } from "@/state/scenario-display";

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU");
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function CampaignScreen() {
  const { view, campaigns, signals } = useAppState();
  const dispatch = useAppDispatch();

  if (view.kind !== "campaign") return null;

  const campaign = campaigns.find((c) => c.id === view.campaign.id);
  if (!campaign) return null;
  const signal = signals.find((s) => s.id === campaign.signalId);
  const signalType = signal?.type;

  const status = campaign.status;
  const isActive = status === "active";
  const isCompleted = status === "completed";
  const hasStats = isActive || isCompleted;

  const scenarioName = campaign.scenario?.name
    ?? (signal ? scenarioNameForSignal(signal) : "—");

  const metaDate =
    status === "active"
      ? `Запущена ${formatDate(campaign.launchedAt)}`
      : status === "paused"
        ? `Остановлена ${formatDate(campaign.pausedAt)}`
        : status === "completed"
          ? `Завершена ${formatDate(campaign.completedAt)}`
          : `Создана ${formatDate(campaign.createdAt)}`;

  function openWorkflow() {
    dispatch({
      type: "open_workflow",
      campaign: { id: campaign!.id, name: campaign!.name },
      launched: isActive || status === "paused" || isCompleted,
    });
  }

  function launch() {
    if (status === "paused") {
      dispatch({
        type: "campaign_status_changed",
        id: campaign!.id,
        status: "active",
        timestamp: new Date().toISOString(),
      });
    } else {
      dispatch({ type: "open_campaign_payment", campaignId: campaign!.id });
    }
  }

  function stop() {
    dispatch({
      type: "campaign_status_changed",
      id: campaign!.id,
      status: "paused",
      timestamp: new Date().toISOString(),
    });
  }

  const duplicateAction: EntityCardAction = {
    label: "Дублировать",
    onClick: () => dispatch({ type: "campaign_duplicated", id: campaign.id }),
    icon: <Copy className="h-4 w-4" />,
  };

  const secondaryActions: EntityCardAction[] = isActive
    ? [
        {
          label: "Остановить",
          onClick: stop,
          icon: <Square className="h-4 w-4" />,
        },
        duplicateAction,
      ]
    : [duplicateAction];

  return (
    <EntityCardShell
      title={campaign.name}
      onRename={(name) => dispatch({ type: "campaign_renamed", id: campaign.id, name })}
      badge={<StatusBadge status={status} />}
      tags={
        <>
          <CardTag>Сценарий: {scenarioName}</CardTag>
          {signal && (
            <CardTag>
              Сигнал: {signal.type} · {formatNumber(signal.count)}
            </CardTag>
          )}
        </>
      }
      meta={metaDate}
      secondaryActions={secondaryActions}
    >
      {/* Workflow */}
      <CardSection label="Workflow">
        <WorkflowMiniPreview signalType={signalType} onClick={openWorkflow} />
      </CardSection>

      {/* Providers (active) or launch CTA (otherwise) */}
      {isActive ? (
        <CardSection label="Провайдеры данных">
          <ProviderList />
        </CardSection>
      ) : isCompleted ? (
        <CardSection label="Статус">
          <p className="text-sm text-muted-foreground">
            Кампания завершена. Дублируйте её, чтобы запустить новый прогон или
            A-B-тест.
          </p>
        </CardSection>
      ) : (
        <CardSection label="Запуск">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {status === "paused"
                ? "Кампания остановлена. Возобновите её, чтобы снова подключить провайдеров."
                : "Запустите кампанию — провайдеры начнут подключаться после оплаты."}
            </p>
            <Button onClick={launch} className="gap-2 self-start">
              <Play className="h-4 w-4" />
              Запустить
            </Button>
          </div>
        </CardSection>
      )}

      {/* Stats link */}
      {hasStats && (
        <Button
          variant="outline"
          className="self-start gap-2"
          onClick={() => dispatch({ type: "goto_stats", campaignId: campaign.id })}
        >
          Перейти в статистику
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </EntityCardShell>
  );
}
```

- [ ] **Step 2: Lint + build**

Run: `npx eslint src/sections/campaigns/campaign-screen.tsx && npm run build`
Expected: clean.

- [ ] **Step 3: Visual check (dev server)**

Run: `npm run dev -- -p 3001`
In the browser, open Campaigns, use the dev panel to load the `mid` preset, and click campaigns of each status. Confirm: card opens for draft/active/paused/completed; draft/paused show the launch CTA; active shows ProviderList + stats link; completed shows the completed note; inline title rename works (Enter saves, Esc cancels); Дублировать creates a copy and routes to the workflow.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(campaign): campaign card for every status on EntityCardShell"
```

---

## Task 6: `SignalScreen` signal card + routing

**Files:**
- Create: `src/sections/signals/signal-screen.tsx`
- Modify: `src/sections/signals/signals-section.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create `signal-screen.tsx`**

Create `src/sections/signals/signal-screen.tsx`:

```tsx
"use client";

import { CheckCircle2, Download, Zap } from "lucide-react";
import {
  EntityCardShell,
  CardTag,
  CardSection,
} from "@/components/ui/entity-card";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { SIGNAL_STATUS_LABEL } from "@/types/signal-status";
import { SCENARIO_NAMES, SEGMENT_NAMES } from "./signal-summary-data";

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

export function SignalScreen() {
  const { view, signals } = useAppState();
  const dispatch = useAppDispatch();

  if (view.kind !== "signal") return null;

  const signal = signals.find((s) => s.id === view.signal.id);
  if (!signal) return null;

  const status = signal.status ?? "ready";
  const isReady = status === "ready";
  const total =
    signal.segments.max +
    signal.segments.high +
    signal.segments.mid +
    signal.segments.low;
  const title = signal.name ?? signal.type;
  const wd = signal.wizardData;

  function handleDownload() {
    // Prototype: a real backend would emit a CSV here.
    console.log("download signal", signal!.id);
    window.alert(
      `Скачивание ${formatNumber(total)} сигналов (CSV) — в прототипе симулировано.`,
    );
  }

  return (
    <EntityCardShell
      title={title}
      onRename={(name) => dispatch({ type: "signal_renamed", id: signal.id, name })}
      badge={
        !isReady ? (
          <CardTag>{SIGNAL_STATUS_LABEL[status]}</CardTag>
        ) : undefined
      }
      tags={
        <CardTag>
          {signal.type} · {formatNumber(signal.count)}
        </CardTag>
      }
      meta={
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
          Сигналы получены · {new Date(signal.updatedAt).toLocaleString("ru-RU")}
        </span>
      }
      primaryAction={{
        label: "Запустить кампанию по сигналу",
        onClick: () => dispatch({ type: "campaign_from_signal", signalId: signal.id }),
        icon: <Zap className="h-4 w-4" />,
      }}
      secondaryActions={[
        {
          label: "Скачать",
          onClick: handleDownload,
          icon: <Download className="h-4 w-4" />,
        },
      ]}
    >
      {/* Total signals */}
      <CardSection label="Всего сигналов">
        <p className="text-4xl font-bold tabular-nums text-brand">
          {formatNumber(total)}
        </p>
      </CardSection>

      {/* Settings table (step-6 summary) */}
      <CardSection label="Настройки сигнала">
        <div className="divide-y divide-border">
          <SummaryRow
            label="Сценарий"
            value={wd?.scenario ? SCENARIO_NAMES[wd.scenario] ?? "—" : "—"}
          />
          <SummaryRow
            label="Интересы"
            value={wd?.interests.length ? wd.interests.join(", ") : "—"}
          />
          <SummaryRow
            label="Триггеры"
            value={wd?.triggers.length ? wd.triggers.join(", ") : "—"}
          />
          <SummaryRow
            label="Сегменты"
            value={
              wd?.segments.length
                ? wd.segments.map((s) => SEGMENT_NAMES[s] ?? s).join("; ")
                : "—"
            }
          />
          <SummaryRow label="Файл с базой" value={wd?.file ? wd.file.name : "—"} />
          <SummaryRow
            label="Максимальный бюджет"
            value={wd?.budget ? `₽ ${wd.budget.toLocaleString("ru-RU")}` : "—"}
          />
        </div>
      </CardSection>
    </EntityCardShell>
  );
}
```

- [ ] **Step 2: Route ready signals to the card in `signals-section.tsx`**

In `src/sections/signals/signals-section.tsx`, change `handleOpen`:

```ts
  function handleOpen(signalId: string) {
    dispatch({ type: "signal_opened", id: signalId });
  }
```

In the `SignalCard` render, the `onOpen` prop is currently gated by `s.wizardData`. Keep that gate but also require ready/expired so awaiting/processing keep their button flows:

```tsx
                onOpen={
                  s.wizardData && (s.status ?? "ready") === "ready"
                    ? handleOpen
                    : undefined
                }
```

- [ ] **Step 3: Render `SignalScreen` in `page.tsx`**

In `src/app/page.tsx` add the import alongside the other section imports:
```ts
import { SignalScreen } from "@/sections/signals/signal-screen";
```

Add the render branch next to the campaign one (after the `view.kind === "campaign"` line ~84):
```ts
    if (view.kind === "signal") return <SignalScreen />;
```

Check the `dedupeKind` logic near line 58 (it maps `awaiting-campaign` → `guided-signal`). The `signal` kind renders its own section and needs no dedupe alias — leave it as its own key. Confirm the AnimatePresence key derivation (see commit 6c84a71) does not collapse `signal` with another kind; if it uses `view.kind` directly, no change is needed.

- [ ] **Step 4: Lint + build**

Run: `npx eslint && npm run build`
Expected: clean.

- [ ] **Step 5: Visual check (dev server)**

Run: `npm run dev -- -p 3001`
Load the `mid` preset, open Signals, click a ready signal. Confirm: the signal card opens (not the wizard at step-8); title rename works; «Всего сигналов» shows the segment total; the settings table renders (with «—» for signals lacking wizardData); Скачать shows the alert; «Запустить кампанию по сигналу» creates a campaign and routes into the workflow. Confirm awaiting/processing signals still show their in-card buttons in the list (not the new card).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(signal): signal card screen + ready-signal routing"
```

---

## Task 7: Final verification

- [ ] **Step 1: Full test + lint + build**

Run: `npx vitest run`
Expected: PASS (all suites).
Run: `npx eslint`
Expected: no errors.
Run: `npm run build`
Expected: compiles clean.

- [ ] **Step 2: Grep for stragglers**

Run: `grep -rn "scheduled\|scheduledFor\|schedule-campaign-dialog" src`
Expected: no matches in campaign code (workflow timing-node "schedule" references in `workflow.ts`/`node-*`/`structural-commands` are unrelated and may remain — verify each hit is a workflow node, not campaign scheduling).

- [ ] **Step 3: Manual end-to-end (dev server)**

Run: `npm run dev -- -p 3001`
Walk: create a signal → its card opens on click from the list → launch a campaign from it → campaign card opens for the draft → Запустить → payment → active card with providers + stats link → Остановить → paused card with resume CTA → Дублировать → copy in workflow. Confirm no «Запланировано» status appears anywhere and no scheduling UI remains.

- [ ] **Step 4: Report**

Report the worktree path (`.worktrees/entity-cards`) and branch (`feature/entity-cards`) back to the user for review/merge. Do not merge to main.
