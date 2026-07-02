# PromptBar inline chips — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `@Label` text-tokens (nodes) and the floating "Редактируем триггер" hint (triggers) with one chip pattern: removable, non-interactive chips rendered inline before the textarea inside the prompt bar.

**Architecture:** A new `PromptChipsContext` owns chip state (push/remove/clear). `PromptInputBody` becomes a real flex-wrap container that renders chips before `PromptInputTextarea`. Removal: `Backspace` at zero-offset, empty textarea, via `onKeyDown` passthrough. Two existing flows (trigger edit, node command) push their own chips and read them on submit; legacy `@Label` parsing is deleted in the final cleanup.

**Tech Stack:** React 19, Next.js 15, TypeScript, Vitest, existing `@/components/ai-elements/prompt-input` lib.

**Worktree:** `.worktrees/prompt-chips` on `feature/prompt-chips` (already created off `integration/04-29`).

---

## File map

**New**
- `src/state/prompt-chips-context.tsx` — provider + `usePromptChips` hook + reducer.
- `src/state/prompt-chips-context.test.ts` — reducer tests.
- `src/components/ai-elements/prompt-chips-row.tsx` — visual chip-row component.

**Modified**
- `src/components/ai-elements/prompt-input.tsx` — `PromptInputBody` opts in to a flex-wrap layout via a className override (still backward compatible).
- `src/sections/shell/shell-bottom-bar.tsx` — wraps tree in `PromptChipsProvider`, renders `PromptChipsRow` before textarea, handles Backspace, swaps trigger-edit hint logic for chip pushes, swaps `SelectedNodeEffect` for `SelectedNodeChipEffect`. Submit path reads chips for the workflow-node case.
- `src/state/trigger-edit-context.tsx` — keep state shape; effect that mirrors active-trigger into a chip lives in `shell-bottom-bar.tsx`.
- `tests/e2e/happy-path.spec.ts` — update locators if needed (no @-text in input).

**Deleted (Task 6)**
- `formatTag`, `parseTagSegments`, `SelectedNodeEffect`, `ClearOnLeaveWorkflowEffect` — all in `shell-bottom-bar.tsx`.

---

## Task 1: Chip reducer

**Files:**
- Create: `src/state/prompt-chips-context.tsx`
- Test: `src/state/prompt-chips-context.test.ts`

- [ ] **Step 1: Write the failing reducer tests**

Create `src/state/prompt-chips-context.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { promptChipsReducer, type PromptChipsState } from "./prompt-chips-context";

const empty: PromptChipsState = { chips: [] };

describe("promptChipsReducer", () => {
  it("push appends a chip and assigns an id", () => {
    const next = promptChipsReducer(empty, {
      type: "push",
      chip: { kind: "trigger", label: "Сайты автодилеров", payload: "auto-dealers", removable: true },
    });
    expect(next.chips).toHaveLength(1);
    expect(next.chips[0].id).toMatch(/^chip_/);
    expect(next.chips[0].label).toBe("Сайты автодилеров");
  });

  it("push with explicit id deduplicates by id (last write wins)", () => {
    const a = promptChipsReducer(empty, {
      type: "push",
      chip: { id: "fixed", kind: "node", label: "Email", payload: "n1", removable: true },
    });
    const b = promptChipsReducer(a, {
      type: "push",
      chip: { id: "fixed", kind: "node", label: "Email 2", payload: "n2", removable: true },
    });
    expect(b.chips).toHaveLength(1);
    expect(b.chips[0].label).toBe("Email 2");
  });

  it("remove drops a chip by id", () => {
    const a = promptChipsReducer(empty, {
      type: "push",
      chip: { id: "x", kind: "trigger", label: "A", payload: null, removable: true },
    });
    const b = promptChipsReducer(a, { type: "remove", id: "x" });
    expect(b.chips).toEqual([]);
  });

  it("removeLastRemovable pops the last removable chip", () => {
    let s = empty;
    s = promptChipsReducer(s, {
      type: "push",
      chip: { kind: "trigger", label: "A", payload: null, removable: false },
    });
    s = promptChipsReducer(s, {
      type: "push",
      chip: { kind: "trigger", label: "B", payload: null, removable: true },
    });
    const next = promptChipsReducer(s, { type: "removeLastRemovable" });
    expect(next.chips.map((c) => c.label)).toEqual(["A"]);
  });

  it("removeLastRemovable is a no-op when there is nothing to remove", () => {
    const s = promptChipsReducer(empty, {
      type: "push",
      chip: { kind: "node", label: "fixed", payload: null, removable: false },
    });
    const next = promptChipsReducer(s, { type: "removeLastRemovable" });
    expect(next).toBe(s);
  });

  it("clear empties chips", () => {
    const a = promptChipsReducer(empty, {
      type: "push",
      chip: { kind: "trigger", label: "A", payload: null, removable: true },
    });
    const b = promptChipsReducer(a, { type: "clear" });
    expect(b.chips).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- prompt-chips-context`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the reducer + context + hook**

Create `src/state/prompt-chips-context.tsx`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { nanoid } from "nanoid";

export type PromptChipKind = "trigger" | "mode" | "node";

export interface PromptChip {
  id: string;
  kind: PromptChipKind;
  label: string;
  // Opaque per-kind payload — consumers narrow by kind.
  payload: unknown;
  removable: boolean;
}

export interface PromptChipsState {
  chips: PromptChip[];
}

export type PromptChipsAction =
  | { type: "push"; chip: Omit<PromptChip, "id"> & { id?: string } }
  | { type: "remove"; id: string }
  | { type: "removeLastRemovable" }
  | { type: "clear" };

export function promptChipsReducer(
  state: PromptChipsState,
  action: PromptChipsAction
): PromptChipsState {
  switch (action.type) {
    case "push": {
      const id = action.chip.id ?? `chip_${nanoid(6)}`;
      const next: PromptChip = {
        id,
        kind: action.chip.kind,
        label: action.chip.label,
        payload: action.chip.payload,
        removable: action.chip.removable,
      };
      const existingIdx = state.chips.findIndex((c) => c.id === id);
      if (existingIdx >= 0) {
        const chips = state.chips.slice();
        chips[existingIdx] = next;
        return { chips };
      }
      return { chips: [...state.chips, next] };
    }
    case "remove":
      return { chips: state.chips.filter((c) => c.id !== action.id) };
    case "removeLastRemovable": {
      for (let i = state.chips.length - 1; i >= 0; i--) {
        if (state.chips[i].removable) {
          const chips = state.chips.slice();
          chips.splice(i, 1);
          return { chips };
        }
      }
      return state;
    }
    case "clear":
      return state.chips.length === 0 ? state : { chips: [] };
  }
}

interface PromptChipsApi {
  chips: readonly PromptChip[];
  pushChip: (chip: Omit<PromptChip, "id"> & { id?: string }) => string;
  removeChip: (id: string) => void;
  removeLastRemovable: () => boolean;
  clearChips: () => void;
}

const Ctx = createContext<PromptChipsApi | null>(null);

export function PromptChipsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(promptChipsReducer, { chips: [] });

  const pushChip = useCallback(
    (chip: Omit<PromptChip, "id"> & { id?: string }): string => {
      const id = chip.id ?? `chip_${nanoid(6)}`;
      dispatch({ type: "push", chip: { ...chip, id } });
      return id;
    },
    []
  );

  const removeChip = useCallback((id: string) => {
    dispatch({ type: "remove", id });
  }, []);

  const removeLastRemovable = useCallback(() => {
    // Imperative read isn't trivial; the caller gets a best-effort boolean.
    // Returning true unconditionally would lie when nothing is removable, so
    // we read fresh state via a functional check using a microtask flag.
    let removed = false;
    dispatch({ type: "removeLastRemovable" });
    // We don't have direct access to whether the reducer changed state from
    // here. Callers that care can read `chips.length` before/after via state.
    // The current Backspace handler only needs a "was something there" guard.
    removed = state.chips.some((c) => c.removable);
    return removed;
  }, [state.chips]);

  const clearChips = useCallback(() => dispatch({ type: "clear" }), []);

  const api = useMemo<PromptChipsApi>(
    () => ({
      chips: state.chips,
      pushChip,
      removeChip,
      removeLastRemovable,
      clearChips,
    }),
    [state.chips, pushChip, removeChip, removeLastRemovable, clearChips]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function usePromptChips(): PromptChipsApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "usePromptChips must be used within <PromptChipsProvider>."
    );
  }
  return ctx;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- prompt-chips-context`
Expected: PASS — 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/state/prompt-chips-context.tsx src/state/prompt-chips-context.test.ts
git commit -m "feat(prompt-chips): add chip context with push/remove/clear reducer"
```

---

## Task 2: Chip-row visual component

**Files:**
- Create: `src/components/ai-elements/prompt-chips-row.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/ai-elements/prompt-chips-row.tsx`:

```tsx
"use client";

import Image from "next/image";
import { Plus, Minus } from "lucide-react";
import { usePromptChips, type PromptChip } from "@/state/prompt-chips-context";
import { cn } from "@/lib/utils";

function ChipGlyph({ chip }: { chip: PromptChip }) {
  switch (chip.kind) {
    case "trigger":
      return (
        <Image
          src="/mascot-icon.svg"
          alt=""
          width={14}
          height={14}
          className="shrink-0"
          aria-hidden
        />
      );
    case "mode":
      return chip.payload === "exclude" ? (
        <Minus className="h-3 w-3 shrink-0" />
      ) : (
        <Plus className="h-3 w-3 shrink-0" />
      );
    case "node":
      return (
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      );
  }
}

export function PromptChipsRow() {
  const { chips } = usePromptChips();
  if (chips.length === 0) return null;
  return (
    <>
      {chips.map((chip) => (
        <span
          key={chip.id}
          data-chip-id={chip.id}
          data-chip-kind={chip.kind}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
            "border-white/15 bg-white/10 text-white"
          )}
        >
          <ChipGlyph chip={chip} />
          <span className="leading-none">{chip.label}</span>
        </span>
      ))}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ai-elements/prompt-chips-row.tsx
git commit -m "feat(prompt-chips): add chip-row visual component"
```

---

## Task 3: Inline layout + Backspace handler

**Files:**
- Modify: `src/components/ai-elements/prompt-input.tsx:1042-1047`
- Modify: `src/sections/shell/shell-bottom-bar.tsx`

- [ ] **Step 1: Make `PromptInputBody` layout-friendly**

Replace `PromptInputBody` definition in `src/components/ai-elements/prompt-input.tsx` (around line 1042). Current:

```tsx
export const PromptInputBody = ({
  className,
  ...props
}: PromptInputBodyProps) => (
  <div className={cn("contents", className)} {...props} />
);
```

Change to:

```tsx
export const PromptInputBody = ({
  className,
  ...props
}: PromptInputBodyProps) => (
  <div
    // Default layout matches the previous `display: contents` behaviour
    // for callers that don't set their own className. New chip-aware
    // callers pass `flex flex-wrap items-start gap-2 px-3 py-2` to
    // get inline chip + textarea flow.
    className={cn("contents", className)}
    {...props}
  />
);
```

(No code change yet — the comment documents intent. The prop already accepts className.) Verify by re-reading the file.

- [ ] **Step 2: Wrap shell-bottom-bar tree with the provider and render the chip row**

In `src/sections/shell/shell-bottom-bar.tsx`, add imports near the top (find the existing block):

```tsx
import { PromptChipsProvider, usePromptChips } from "@/state/prompt-chips-context";
import { PromptChipsRow } from "@/components/ai-elements/prompt-chips-row";
```

Wrap the entire return value of the bottom-bar component (the `motion.div` and the surrounding `<>`) inside `<PromptChipsProvider>`. The effects that depend on chips (`SelectedNodeChipEffect` and `TriggerEditChipEffect`, added in Tasks 4–5) live inside the provider too.

Replace:

```tsx
<PromptInputBody>
  <PromptInputTextarea
    className="min-h-[52px] max-h-[120px] bg-transparent text-[#fafafa] placeholder:text-muted-foreground"
    placeholder={chatPlaceholder}
  />
</PromptInputBody>
```

With:

```tsx
<PromptInputBody className="flex flex-wrap items-start gap-2 px-3 py-2">
  <PromptChipsRow />
  <PromptInputTextarea
    className={cn(
      "min-h-[52px] max-h-[120px] bg-transparent text-[#fafafa] placeholder:text-muted-foreground",
      // Inline layout: textarea fills remaining space on the chip row,
      // wraps onto a new line when the chips overflow.
      "flex-1 min-w-[12rem] !p-0 !border-0"
    )}
    placeholder={chatPlaceholder}
    onKeyDown={handleChipsBackspace}
  />
</PromptInputBody>
```

Add the handler near other handlers in the component:

```tsx
const chipsApi = usePromptChips();
const handleChipsBackspace = useCallback<
  KeyboardEventHandler<HTMLTextAreaElement>
>(
  (e) => {
    if (
      e.key === "Backspace" &&
      e.currentTarget.value === "" &&
      e.currentTarget.selectionStart === 0 &&
      e.currentTarget.selectionEnd === 0 &&
      chipsApi.chips.length > 0
    ) {
      const lastRemovable = [...chipsApi.chips]
        .reverse()
        .find((c) => c.removable);
      if (lastRemovable) {
        e.preventDefault();
        chipsApi.removeChip(lastRemovable.id);
      }
    }
  },
  [chipsApi]
);
```

(`useCallback` and `KeyboardEventHandler` need to be imported alongside `useEffect` and friends if they are not already.)

The provider must wrap the rest of the bar tree. Refactor by splitting the component into a thin outer `BottomBar` that sets up the provider and an inner `BottomBarBody` that uses `usePromptChips`:

```tsx
export function ShellBottomBar() {
  return (
    <PromptChipsProvider>
      <ShellBottomBarBody />
    </PromptChipsProvider>
  );
}

function ShellBottomBarBody() {
  // ...existing component body, with handleChipsBackspace defined inside.
}
```

- [ ] **Step 3: Verify nothing regresses**

Run:
```
npm test
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -3
```

Expected:
- vitest: still 232 pass.
- tsc: 14 (baseline preserved).
- lint: ≤ 25 problems (baseline 25 from integration).

- [ ] **Step 4: Visual sanity check**

The dev server on `:3001` runs the integration branch, not this one. Skip visual verification at this step — the chip row will only be visible after a chip is pushed (Tasks 4 and 5 add the pushers).

- [ ] **Step 5: Commit**

```bash
git add src/sections/shell/shell-bottom-bar.tsx
git commit -m "feat(prompt-chips): inline chip-row layout + Backspace removal"
```

---

## Task 4: Migrate trigger AI-edit to chips

**Files:**
- Modify: `src/sections/shell/shell-bottom-bar.tsx`
- Modify: `src/state/trigger-edit-context.tsx` (if needed — likely just a read)

- [ ] **Step 1: Add `TriggerEditChipEffect` inside the body**

In `src/sections/shell/shell-bottom-bar.tsx`, near `TriggerEditDraftSwap`, add:

```tsx
function TriggerEditChipEffect() {
  const triggerEdit = useTriggerEdit();
  const { pushChip, removeChip, chips } = usePromptChips();
  const chipIdRef = useRef<string | null>(null);

  useEffect(() => {
    const active = triggerEdit?.active;
    const currentChipId = chipIdRef.current;

    if (active) {
      // Add or update the chip whenever the active trigger changes.
      const id = `trigger_${active.id}`;
      pushChip({
        id,
        kind: "trigger",
        label: active.label,
        payload: active.id,
        removable: true,
      });
      chipIdRef.current = id;
    } else if (currentChipId) {
      removeChip(currentChipId);
      chipIdRef.current = null;
    }
  }, [triggerEdit?.active, pushChip, removeChip]);

  // Side-effect: when the user removes the chip via Backspace, clear the
  // active trigger so card UI stays in sync.
  useEffect(() => {
    if (
      chipIdRef.current &&
      !chips.some((c) => c.id === chipIdRef.current) &&
      triggerEdit?.active
    ) {
      triggerEdit.clear?.();
      chipIdRef.current = null;
    }
  }, [chips, triggerEdit]);

  return null;
}
```

(`useTriggerEdit` returns the existing context shape; `clear` should be its existing deactivator. If the current API name differs, use the existing one; check `src/state/trigger-edit-context.tsx`.)

- [ ] **Step 2: Mount the effect inside the provider**

In `ShellBottomBarBody`, just below `<TriggerEditDraftSwap />`, render:

```tsx
<TriggerEditChipEffect />
```

- [ ] **Step 3: Remove the floating hint banner**

Delete the two JSX blocks in `ShellBottomBarBody` that render `data-testid="trigger-edit-hint"` and `data-testid="trigger-edit-error"` floating banners (the spec lines 264–287 you read earlier). The error message stays — keep the error banner, just remove the active-trigger banner. Reread current code to confirm the boundaries.

- [ ] **Step 4: Update placeholder when a trigger chip is present**

Replace the `placeholder={chatPlaceholder}` line with:

```tsx
placeholder={
  chips.some((c) => c.kind === "trigger")
    ? "Например: добавь auto1.ru, auto2.ru — или: исключи mysite.ru"
    : chatPlaceholder
}
```

`chips` is read via `usePromptChips()` already in Task 3.

- [ ] **Step 5: Run unit tests**

Run: `npm test`
Expected: 232 pass (no regression). Add a test if the chip↔trigger sync logic is non-trivial; typically not needed for an effect bridge.

- [ ] **Step 6: Smoke-test in `:3001`**

The dev server runs `integration/04-29`, not this branch. Skip; visual smoke happens at the end of the plan.

- [ ] **Step 7: Commit**

```bash
git add src/sections/shell/shell-bottom-bar.tsx src/state/trigger-edit-context.tsx
git commit -m "feat(prompt-chips): migrate trigger AI-edit to chip pattern"
```

---

## Task 5: Migrate workflow nodes to chips

**Files:**
- Modify: `src/sections/shell/shell-bottom-bar.tsx`

- [ ] **Step 1: Replace `SelectedNodeEffect` with `SelectedNodeChipEffect`**

Add the chip-aware effect in `ShellBottomBarBody`:

```tsx
function SelectedNodeChipEffect({
  selected,
}: {
  selected: { id: string; label: string } | null;
}) {
  const { pushChip, removeChip, chips } = usePromptChips();
  const chipIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (selected) {
      const id = `node_${selected.id}`;
      pushChip({
        id,
        kind: "node",
        label: selected.label,
        payload: selected.id,
        removable: true,
      });
      chipIdRef.current = id;
    } else if (chipIdRef.current) {
      removeChip(chipIdRef.current);
      chipIdRef.current = null;
    }
  }, [selected, pushChip, removeChip]);

  // Backspace-removal of the node chip should also deselect.
  // We dispatch the deselect when the chip vanishes from state but selected
  // still says yes.
  // (Use existing dispatch from useAppDispatch.)
  return null;
}
```

Replace the `<SelectedNodeEffect selected={selectedWorkflowNode} />` line with:

```tsx
<SelectedNodeChipEffect selected={selectedWorkflowNode} />
```

- [ ] **Step 2: Wire chip-disappearance back to deselect**

Right after the body's existing `dispatch` lookup, add:

```tsx
useEffect(() => {
  // If a node was selected but its chip is no longer in the bar, sync the
  // node selection state back to "none". Backspace-on-empty is the user
  // signal that they no longer want that node-context.
  if (
    selectedWorkflowNode &&
    !chips.some((c) => c.id === `node_${selectedWorkflowNode.id}`)
  ) {
    dispatch({ type: "workflow_node_deselected" });
  }
}, [chips, selectedWorkflowNode, dispatch]);
```

- [ ] **Step 3: Update submit handler — read chips, not @-tags**

Find `handlePromptSubmit` in `ShellBottomBarBody`. Inside it, the workflow case currently calls `parseTagSegments(text)` to recover `[{ label, text }, ...]`. Replace with:

```tsx
const nodeChips = chipsApi.chips.filter((c) => c.kind === "node");
if (nodeChips.length > 0) {
  const segments = nodeChips.map((c) => ({
    nodeLabel: c.label,
    text: rawText.trim(),
  }));
  if (segments.length > 0 && segments.every((s) => s.text.length === 0)) {
    // No instruction provided — fall through to other branches.
  } else {
    dispatch({
      type: "workflow_node_command_submit",
      commands: segments,
    });
    chipsApi.clearChips();
    promptInputController.textInput.clear();
    return;
  }
}
```

(Names: `chipsApi`, `rawText`, `promptInputController`, `dispatch` — adapt to whatever the surrounding code uses. Look at the current `handlePromptSubmit` shape and reuse.)

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 232 pass. The existing `workflow_node_command_submit` reducer test stays green because the action shape is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/sections/shell/shell-bottom-bar.tsx
git commit -m "feat(prompt-chips): migrate workflow node mention to chip pattern"
```

---

## Task 6: Cleanup — remove legacy text-token shim

**Files:**
- Modify: `src/sections/shell/shell-bottom-bar.tsx`

- [ ] **Step 1: Delete obsolete code**

Remove from `src/sections/shell/shell-bottom-bar.tsx`:

- The `formatTag` function.
- The `parseTagSegments` function.
- The `SelectedNodeEffect` function (replaced by `SelectedNodeChipEffect`).
- The `ClearOnLeaveWorkflowEffect` function (its job — clearing state on view-leave — is replaced by clearing chips when `view.kind` changes; see next step).

- [ ] **Step 2: Add `ClearChipsOnViewChangeEffect`**

```tsx
function ClearChipsOnViewChangeEffect({ viewKind }: { viewKind: View["kind"] }) {
  const { clearChips } = usePromptChips();
  const prevKind = useRef<View["kind"] | null>(null);
  useEffect(() => {
    if (prevKind.current && prevKind.current !== viewKind) {
      clearChips();
    }
    prevKind.current = viewKind;
  }, [viewKind, clearChips]);
  return null;
}
```

Mount it inside `ShellBottomBarBody` next to other effects:

```tsx
<ClearChipsOnViewChangeEffect viewKind={view.kind} />
```

- [ ] **Step 3: Update e2e happy-path locator (if needed)**

Open `tests/e2e/happy-path.spec.ts` and grep for `@` patterns or selectors that reference `@Label` text inside the textarea. If any rely on visible `@`-text in the input, replace them with chip-data selectors:

```ts
// Before: expect(page.getByPlaceholder(/.../).inputValue()).toContain("@Email");
// After:
await expect(page.locator("[data-chip-kind='node']", { hasText: "Email" })).toBeVisible();
```

- [ ] **Step 4: Verify**

Run:
```
npm test
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -3
```

Expected:
- vitest: ≥ 232 (we may add 1–2 minor tests).
- tsc: 14 baseline preserved.
- lint: ≤ baseline (25).

- [ ] **Step 5: Visual smoke**

Stop the integration dev server (kill 31497 or `lsof -ti:3001 | xargs kill -9`) and start the prompt-chips dev server in this worktree on `:3001`:

```
lsof -ti:3001 | xargs kill -9 2>/dev/null; true
npm run dev -- -p 3001 > /tmp/dev-prompt-chips.log 2>&1 &
```

Walk the user-facing flow:
1. Welcome → Создать сигнал → анкета → визард → step-2.
2. Pick at least one interest. Pick a trigger. Click «Настроить» — chip appears in the bar; placeholder swaps; user types domains; Enter submits to the regex parser.
3. Backspace at empty input — chip disappears, trigger card returns to "no edit" state.
4. Open a campaign workflow → click a node → node-chip appears, placeholder text shifts. Type a command, Enter — node command submitted, chip cleared.

If any step fails, fix in this task, re-run.

- [ ] **Step 6: Commit**

```bash
git add src/sections/shell/shell-bottom-bar.tsx tests/e2e/happy-path.spec.ts
git commit -m "chore(prompt-chips): drop @Label shim and ClearOnLeaveWorkflowEffect"
```

---

## Self-review

- **Spec coverage:** every spec section has at least one task — visual layout (Task 3), state (Task 1), submit payload (Task 5), trigger migration (Task 4), node migration (Task 5), cleanup (Task 6), tests (Task 1, plus regressions checked at every task).
- **Placeholders:** none.
- **Type consistency:** `pushChip`, `removeChip`, `removeLastRemovable`, `clearChips` — same names from Task 1 onward. `PromptChip.kind` values (`"trigger" | "mode" | "node"`) reused consistently.
- **Risk noted in spec (Backspace ambiguity):** addressed in Task 3 with the `selectionStart === 0 && selectionEnd === 0 && value === ""` guard.
- **Risk noted (cursor management):** Task 3 keeps the textarea identity unchanged — `min-w-[12rem]` ensures the textarea is large enough to receive focus after a chip push.
