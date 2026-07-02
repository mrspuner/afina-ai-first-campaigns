# Block C — Canvas Header + Launch Validation Implementation Plan

**Goal:** Канвас получает sticky header с inline-edit имени, блоком сигнала, кнопками «Сохранить черновик» / «Запустить» и валидацией запуска.

**Spec:** `docs/superpowers/specs/2026-04-18-canvas-header-design.md`
**Roadmap:** `MEMORY.md → project_afina_18_04_roadmap.md` — блок C. A+A.5+B в main (HEAD `a105451`).

---

## File Structure

**Create:**
- `src/state/workflow-validation.ts`
- `src/state/workflow-validation.test.ts`
- `src/sections/campaigns/canvas-header.tsx`
- `tests/e2e/block-c.spec.ts`

**Modify:**
- `src/state/app-state.ts` — add `campaign_renamed`, `campaign_saved_draft` actions.
- `src/state/app-state.test.ts` — cover new actions.
- `src/types/workflow.ts` — add `needsAttention?: boolean`, `isSuccess?: boolean` on `WorkflowNodeData`; mark base `result` node as success.
- `src/sections/campaigns/workflow-view.tsx` — expose `onLaunchAttempt` callback that returns `WorkflowValidation`; no internal state lift.
- `src/sections/campaigns/workflow-section.tsx` — mount `CanvasHeader`; wire rename/save/launch.
- `src/sections/shell/shell-bottom-bar.tsx` — drop «Начать кампанию →» button for `view.kind === "workflow"`.

---

## Task 1: Add WorkflowNodeData flags

- [ ] Extend `WorkflowNodeData` with optional `needsAttention?: boolean` and `isSuccess?: boolean` in `src/types/workflow.ts`.
- [ ] In `createBaseNodes`, mark node with id `"result"` as `isSuccess: true` via `makeNode(..., { isSuccess: true })`. Update `makeNode` signature to accept an optional `extras` object OR set the flag post-hoc on that node.
- [ ] Run `npx tsc --noEmit` — verify no type errors.
- [ ] Run `npm test` — existing 37 tests PASS, no regression.
- [ ] Commit: `feat(workflow): add needsAttention and isSuccess flags on nodes`

---

## Task 2: Implement workflow-validation

- [ ] Create `src/state/workflow-validation.ts`:

```ts
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

export type WorkflowValidationError = "no-signal" | "needs-attention" | "no-success-path";

export interface WorkflowValidation {
  ok: boolean;
  errors: WorkflowValidationError[];
}

export function validateWorkflow(
  graph: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
  signalBound: boolean
): WorkflowValidation {
  const errors: WorkflowValidationError[] = [];
  if (!signalBound) errors.push("no-signal");
  if (graph.nodes.some((n) => n.data.needsAttention)) errors.push("needs-attention");
  const successIds = graph.nodes.filter((n) => n.data.isSuccess).map((n) => n.id);
  if (successIds.length === 0) {
    errors.push("no-success-path");
  } else {
    const adj = new Map<string, string[]>();
    for (const e of graph.edges) {
      const list = adj.get(e.source) ?? [];
      list.push(e.target);
      adj.set(e.source, list);
    }
    const entry = graph.nodes[0]?.id;
    const seen = new Set<string>();
    if (entry) {
      const queue = [entry];
      while (queue.length) {
        const id = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const next of adj.get(id) ?? []) queue.push(next);
      }
    }
    const reachable = successIds.some((id) => seen.has(id));
    if (!reachable) errors.push("no-success-path");
  }
  return { ok: errors.length === 0, errors };
}
```

- [ ] Create `src/state/workflow-validation.test.ts` with at least:
  - happy-path: base nodes + signal bound → ok=true, errors=[]
  - signalBound=false → errors includes "no-signal"
  - one node with needsAttention=true → errors includes "needs-attention"
  - no node with isSuccess=true → "no-success-path"
  - isSuccess node exists but unreachable (isolated edges) → "no-success-path"
  - multiple errors accumulate (no signal + no success)

Use `createBaseNodes()` + `createBaseEdges()` from `types/workflow` for happy-path fixture.

- [ ] Run `npm test` — new tests green.
- [ ] Commit: `feat(state): add workflow validation helper`

---

## Task 3: Add reducer actions

- [ ] Edit `src/state/app-state.ts`:

Union additions:
```ts
| { type: "campaign_renamed"; id: string; name: string }
| { type: "campaign_saved_draft"; id: string }
```

Cases (before `case "campaign_created"`):

```ts
case "campaign_renamed": {
  const name = action.name.trim();
  if (!name) return state;
  const exists = state.campaigns.some((c) => c.id === action.id);
  if (!exists) return state;
  return {
    ...state,
    campaigns: state.campaigns.map((c) =>
      c.id === action.id ? { ...c, name } : c
    ),
    view:
      state.view.kind === "workflow" && state.view.campaign.id === action.id
        ? { ...state.view, campaign: { ...state.view.campaign, name } }
        : state.view,
  };
}

case "campaign_saved_draft": {
  // no-op placeholder; kept for future persistence hook
  return state;
}
```

- [ ] Tests in `app-state.test.ts`:
  - renames existing campaign
  - trims whitespace
  - no-op for unknown id
  - no-op for empty/whitespace-only name
  - updates view.campaign.name when workflow view points to same id
  - does NOT update view.campaign.name when workflow view points to different id
  - `campaign_saved_draft` returns same state reference

- [ ] Run `npm test` — all tests green.
- [ ] Commit: `feat(state): add campaign_renamed and campaign_saved_draft actions`

---

## Task 4: Build CanvasHeader component

- [ ] Create `src/sections/campaigns/canvas-header.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Campaign, Signal } from "@/state/app-state";

interface CanvasHeaderProps {
  campaign: Campaign;
  signal: Signal | null;
  onRename: (name: string) => void;
  onSaveDraft: () => void;
  onLaunch: () => void;
  toast?: { kind: "error" | "info"; text: string } | null;
  onDismissToast?: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function CanvasHeader({
  campaign,
  signal,
  onRename,
  onSaveDraft,
  onLaunch,
  toast,
  onDismissToast,
}: CanvasHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(campaign.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftName(campaign.name);
  }, [campaign.name]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function commit() {
    const next = draftName.trim();
    setEditing(false);
    if (!next || next === campaign.name) {
      setDraftName(campaign.name);
      return;
    }
    onRename(next);
  }

  function cancel() {
    setDraftName(campaign.name);
    setEditing(false);
  }

  const signalLine = signal
    ? `${signal.type} · ${formatNumber(signal.count)} · от ${formatDate(signal.updatedAt)}`
    : "Сигнал не привязан";

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-background/90 px-6 py-3 backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {editing ? (
            <Input
              ref={inputRef}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") cancel();
              }}
              className="h-9 max-w-sm text-xl font-semibold"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="group flex items-center gap-2 self-start rounded-md text-left text-xl font-semibold text-foreground hover:text-foreground/80"
            >
              <span className="truncate">{campaign.name}</span>
              <Pencil className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
            </button>
          )}
          <p
            className={
              signal
                ? "text-xs text-muted-foreground"
                : "text-xs font-medium text-destructive"
            }
          >
            {signalLine}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={onSaveDraft}>
            Сохранить черновик
          </Button>
          <Button onClick={onLaunch}>Запустить</Button>
        </div>
      </div>

      {toast && (
        <div
          className={
            toast.kind === "error"
              ? "mt-2 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
              : "mt-2 flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
          }
        >
          <span>{toast.text}</span>
          {onDismissToast && (
            <button
              type="button"
              aria-label="Закрыть"
              onClick={onDismissToast}
              className="opacity-60 hover:opacity-100"
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] Run `npx tsc --noEmit` — typecheck clean on new file.
- [ ] Commit: `feat(campaigns): add CanvasHeader component`

---

## Task 5: Wire CanvasHeader into WorkflowSection

- [ ] Modify `src/sections/campaigns/workflow-view.tsx` — expose `onLaunchAttempt` prop that the parent can call to obtain the current graph snapshot for validation. Simplest approach: forward via imperative handle.

Option A (ref forwarding). Wrap component with `forwardRef` and expose `getGraph(): { nodes, edges }`.

Option B (callback prop). Add optional `onGraphChange?: (graph) => void` that Section caches via ref. Less surgical.

**Chosen: Option B** — Section keeps the latest snapshot in a `useRef` via callback, avoids forwardRef churn.

Changes in `workflow-view.tsx`:
- Add optional `onGraphChange?: (graph: GraphState) => void` prop.
- In the `setGraph` updater flow and initial `useEffect`, call `onGraphChange?.(graph)` after each update.

- [ ] Modify `src/sections/campaigns/workflow-section.tsx`:

```tsx
"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { TYPE_TO_SCENARIO } from "@/state/scenario-map";
import { CanvasHeader } from "./canvas-header";
import { WorkflowView } from "./workflow-view";
import { validateWorkflow } from "@/state/workflow-validation";
import type { WorkflowEdge, WorkflowNode } from "@/types/workflow";

type GraphSnapshot = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

const ERROR_TEXT: Record<string, string> = {
  "no-signal": "Сигнал не привязан.",
  "needs-attention": "У вас есть ноды не готовые к запуску.",
  "no-success-path": "Нет пути к ноде Успех.",
};

export function WorkflowSection() {
  const { view, workflowCommand, signals, campaigns } = useAppState();
  const dispatch = useAppDispatch();

  const graphRef = useRef<GraphSnapshot | null>(null);
  const [toast, setToast] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCommandHandled = useCallback(
    () => dispatch({ type: "workflow_command_handled" }),
    [dispatch]
  );

  const handleGraphChange = useCallback((g: GraphSnapshot) => {
    graphRef.current = g;
  }, []);

  const showToast = useCallback((next: { kind: "error" | "info"; text: string }) => {
    setToast(next);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  if (view.kind !== "workflow") return null;

  const currentCampaign = campaigns.find((c) => c.id === view.campaign.id) ?? null;
  const currentSignal = currentCampaign
    ? signals.find((s) => s.id === currentCampaign.signalId) ?? null
    : signals[signals.length - 1] ?? null;
  const scenarioId = currentSignal ? TYPE_TO_SCENARIO[currentSignal.type] ?? "registration" : null;
  const signalFileName = scenarioId ? `сигнал_${scenarioId}.json` : undefined;

  function handleRename(name: string) {
    if (!currentCampaign) return;
    dispatch({ type: "campaign_renamed", id: currentCampaign.id, name });
  }

  function handleSaveDraft() {
    if (!currentCampaign) return;
    dispatch({ type: "campaign_saved_draft", id: currentCampaign.id });
    showToast({ kind: "info", text: "Черновик сохранён" });
  }

  function handleLaunch() {
    if (!currentCampaign) return;
    const graph = graphRef.current;
    if (!graph) {
      showToast({ kind: "error", text: "Граф ещё не готов, попробуйте снова." });
      return;
    }
    const result = validateWorkflow(graph, Boolean(currentSignal));
    if (!result.ok) {
      showToast({ kind: "error", text: ERROR_TEXT[result.errors[0]] ?? "Не готово к запуску." });
      return;
    }
    dispatch({
      type: "campaign_status_changed",
      id: currentCampaign.id,
      status: "active",
      timestamp: new Date().toISOString(),
    });
  }

  // Fallback — если currentCampaign пропала (например, после dev-panel reset)
  if (!currentCampaign) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Кампания не найдена.
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <CanvasHeader
        campaign={currentCampaign}
        signal={currentSignal}
        onRename={handleRename}
        onSaveDraft={handleSaveDraft}
        onLaunch={handleLaunch}
        toast={toast}
        onDismissToast={() => setToast(null)}
      />
      <WorkflowView
        launched={view.launched}
        pendingCommand={workflowCommand}
        onCommandHandled={handleCommandHandled}
        onGoToStats={() => dispatch({ type: "goto_stats" })}
        signalName={signalFileName}
        onGraphChange={handleGraphChange}
      />
    </div>
  );
}
```

- [ ] Run `npx tsc --noEmit` + `npm test` — clean.
- [ ] Manual sanity via dev: open a draft campaign from list → header visible → rename works → click Запустить → workflow transitions to launched.
- [ ] Commit: `feat(campaigns): mount CanvasHeader with rename/save/launch wiring`

---

## Task 6: Remove duplicate «Начать кампанию →» button from ShellBottomBar

- [ ] Edit `src/sections/shell/shell-bottom-bar.tsx` — delete the `{view.kind === "workflow" && !view.launched && (<div className="flex justify-end">…</div>)}` block. The launch CTA now lives only in CanvasHeader.
- [ ] Remove any now-unused references (`latestSignal` guard etc. only if no other usage remains; keep the rest of the file intact).
- [ ] Run `npx tsc --noEmit` + `npm run lint` — verify no new errors.
- [ ] Run `npx playwright test tests/e2e/happy-path.spec.ts` — the happy path currently uses «Начать кампанию →». Update it to click «Запустить» from the CanvasHeader instead (step 12 in `tests/e2e/happy-path.spec.ts`).
- [ ] Commit: `refactor(shell): drop Начать кампанию → button in favor of CanvasHeader Запустить`

---

## Task 7: Playwright — Block C integration tests

- [ ] Create `tests/e2e/block-c.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

async function applyPreset(page: Page, key: "empty" | "mid" | "full") {
  await page.keyboard.press("Control+Shift+KeyD");
  const label = key.charAt(0).toUpperCase() + key.slice(1);
  await page.getByRole("button", { name: new RegExp(`^${label}\\b`) }).click();
  await page.keyboard.press("Control+Shift+KeyD");
}

async function openFirstDraftCampaign(page: Page) {
  await page.getByRole("button", { name: "Кампании", exact: true }).click();
  const draft = page.locator("[data-slot=card]")
    .filter({ hasText: "Не запущено" })
    .first();
  await draft.click();
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 5_000 });
}

test.describe("Block C — Canvas header", () => {
  test("renders name, signal line, and action buttons", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFirstDraftCampaign(page);

    await expect(page.getByRole("button", { name: "Сохранить черновик" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Запустить" })).toBeVisible();
    // Signal line matches the Тип · count · от dd.MM pattern
    await expect(page.getByText(/·\s*\d/).first()).toBeVisible();
  });

  test("rename persists and propagates to campaign list", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFirstDraftCampaign(page);

    // Click the name (role=button with h1-ish text) — we identify by the Pencil wrapper
    await page.getByRole("button", { name: /#1|#2|Апсейл|Возврат|Реактивация|Первая сделка|Регистрация|Удержание/ }).first().click();
    const input = page.locator('input[data-slot="input"]').first();
    await input.fill("Переименованная кампания");
    await input.press("Enter");
    await expect(page.getByText("Переименованная кампания").first()).toBeVisible();

    await page.getByRole("button", { name: "Кампании", exact: true }).click();
    await expect(page.getByText("Переименованная кампания")).toBeVisible();
  });

  test("launch transitions campaign to active status and shows status panel", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFirstDraftCampaign(page);

    await page.getByRole("button", { name: "Запустить" }).click();
    await expect(page.getByText("Кампания запущена")).toBeVisible({ timeout: 5_000 });
  });

  test("save-draft button shows info toast", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFirstDraftCampaign(page);

    await page.getByRole("button", { name: "Сохранить черновик" }).click();
    await expect(page.getByText("Черновик сохранён")).toBeVisible();
  });
});
```

- [ ] Run `npx playwright test tests/e2e/block-c.spec.ts` — all green.
- [ ] Run `npx playwright test` — happy-path + block-b + block-c all green (happy-path updated in T6).
- [ ] Commit: `test(e2e): cover Block C canvas header flow`

---

## Task 8: Final verification + roadmap update

- [ ] Run `npm run lint` — verify no new lint errors/warnings from files in blocks C or happy-path edit.
- [ ] Run `npm test -- --run` + `npx playwright test` — both green.
- [ ] Update `MEMORY.md → project_afina_18_04_roadmap.md`:
  - Block C → `✅ implemented`, HEAD SHA, list added/modified files.
  - Current block pointer → D.
- [ ] `git status` — working tree clean (spec + plan committed before start; implementation commits atomic).

---

## Self-Review Notes

- **Spec alignment:** Tasks 1–2 add validation primitives (§4.2–4.3). Tasks 3 cover new actions (§4.1). Task 4 builds the header (§3.1). Task 5 wires it (§4.4). Task 6 removes duplicate CTA (§4.5). Task 7 e2e covers §3.1–3.3 + §4.1 + §5 acceptance.
- **Reusable components:** Button/Input/Card come from existing ui/. Validation logic is isolated and pure — easy to test.
- **Non-goals:** No new node types, no prompt-bar changes, no AI cycle, no auto-template — all deferred to D/E.
- **Risk:** If `workflow-view.tsx` imperative updates via `setGraph` inside useEffect don't trigger `onGraphChange` reliably, add a `useEffect(() => onGraphChange?.(graph), [graph, onGraphChange])` to ensure the callback fires after every state change.
