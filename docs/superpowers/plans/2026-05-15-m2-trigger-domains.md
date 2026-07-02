# M2 — Изначальные домены в свёрнутом триггере — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показать системные домены триггера в свёрнутой карточке (превью + «+N») и в раскрытой (все домены чипами с обратимым ✕ и кнопкой «Добавить свой домен»), разведя клики чекбокс/тело/шеврон по новой модели взаимодействия.

**Architecture:** Системные домены (`TRIGGER_DOMAINS`) — неразрушимый слой; ✕ на системном домене не удаляет его, а создаёт обратимое исключение в пользовательском слое `TriggerDelta.excluded` (тот же механизм, что уже используется парсером). Свёрнутая карточка получает однострочное превью доменов с фиксированным видимым счётчиком + «+N»; раскрытая — полный список чипами с переносом. Чистая логика «какие системные домены ещё активны» и «сколько показать в превью» выносится в новый pure-модуль `src/lib/trigger-domain-view.ts` под unit-тесты; вся остальная работа — рендеринг внутри `TriggerCard` и развод обработчиков кликов.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, shadcn/ui on base-ui, motion v12, vitest

**Source spec:** `docs/superpowers/specs/2026-05-15-afina-mechanics-spec.md` — Механика 2

---

## Worktree setup

Per `AGENTS.md`, all work happens in an isolated git worktree off `main`. From the repo root (`/Users/macintosh/Documents/work/afina-ai-first`):

```bash
git worktree add .worktrees/m2-trigger-domains -b feature/m2-trigger-domains main
cd .worktrees/m2-trigger-domains
npm install
```

- Do all edits, commits, and test runs inside `.worktrees/m2-trigger-domains`.
- All file paths below are relative to that worktree root.
- The dev server on port 3000 is run from whichever worktree the user is viewing. If you need to start your own, use `npm run dev -- -p 3001`; otherwise rely on the already-running `:3000`.
- Never push to `main`. When done, report the worktree path and branch name to the user — cleanup is the user's call.

---

## Reusable components (audit verified 2026-05-15)

| Component / module | File | Decision |
|---|---|---|
| `TriggerCard` | `src/sections/signals/steps/step-2-interests.tsx` (~277-363) | **Extend** — add collapsed domain-preview line, expanded chip grid, new click wiring |
| `DeltaChip` | `src/sections/signals/steps/step-2-interests.tsx` (~186-215) | **Extend** — add `line-through` to the `excluded` variant; reuse as-is for added-green chips |
| `DeltaBlock` | `src/sections/signals/steps/step-2-interests.tsx` (~230-275) | **Reuse as-is** — still renders the collapsed-state delta summary line |
| `TriggerDelta` / `applyEditToDelta` / `removeFromDelta` / `isDeltaEmpty` / `EMPTY_DELTA` | `src/lib/trigger-edit-parser.ts` (~125-189) | **Reuse as-is** — `excluded` already models reversible exclusions; ✕ on a system domain just appends to `excluded` |
| `parseTriggerCommand` | `src/lib/trigger-edit-parser.ts` (~91-119) | **Reuse as-is** — already parses «добавь domain» for the "Add domain" tag path |
| `TRIGGER_DOMAINS` / `getTriggerDomains` | `src/data/trigger-domains.ts` | **Reuse as-is** — system-domain source of truth |
| `pushChip` / `PromptChip` / `PromptChipKind` | `src/state/prompt-chips-context.tsx` | **Reuse as-is** — the "Add domain" tag is a normal chip (existing `kind: "section"` reused, see Task 5) |
| `pushTriggerChip` helper | `src/sections/signals/steps/step-2-interests.tsx` (~559-569) | **Reuse pattern** — new `pushAddDomainChip` helper mirrors it (chip + focus the editor) |
| `Trigger` type | `src/types/directions.ts` (~6-9) | **Reuse as-is** |
| Domain-view logic (preview count, active-system-domains) | — | **Create new** — `src/lib/trigger-domain-view.ts` + `src/lib/trigger-domain-view.test.ts` (pure, TDD) |
| Icons `Check`, `ChevronDown`, `Plus`, `Minus`, `X` | `lucide-react` (already imported) | **Reuse as-is**; add `Undo2` for the "return excluded" affordance |

---

## File structure

| File | Created / Modified | Responsibility |
|---|---|---|
| `src/lib/trigger-domain-view.ts` | **Created** | Pure helpers: `splitSystemDomains(systemDomains, delta)` → which system domains are still active vs excluded; `previewDomains(activeDomains, visibleCount)` → `{ visible, overflowCount }` for the collapsed «+N» preview. |
| `src/lib/trigger-domain-view.test.ts` | **Created** | Vitest unit tests for the two helpers above (TDD — written before implementation). |
| `src/sections/signals/steps/step-2-interests.tsx` | **Modified** | `DeltaChip` (line-through on excluded); `TriggerCard` (collapsed preview line, expanded chip grid, "Добавить свой домен" button); `handleTriggerClick` (now also toggles selection); new handlers `handleExcludeSystemDomain` / `handleRestoreSystemDomain`; new helper `pushAddDomainChip`; updated `<TriggerCard>` call site props. |

No other files change. `trigger-edit-parser.ts`, `trigger-domains.ts`, `prompt-chips-context.tsx`, `trigger-edit-context.tsx` are reused without edits.

---

## Tasks

Task order maps to backlog chunks: **Task 1** = new pure-logic module (prerequisite for M2.1/M2.3 — split out so the «+N» math and exclusion math are unit-tested). **Task 2** = M2.1. **Task 3** = M2.2. **Task 4** = M2.3. **Task 5** = M2.4.

---

### Task 1: Pure domain-view logic module (`trigger-domain-view.ts`) — TDD

The collapsed «+N» preview and the expanded "which system domains are still active" both need pure logic. Build it test-first so the rendering tasks just consume it.

**Design decisions (stated explicitly, no ambiguity):**
- **Collapsed preview uses a FIXED visible count, not real text measurement.** Measuring exact one-line fit requires DOM measurement and is overkill for a prototype. We show the **first 3** active system domains, then «+N» for the rest. The constant `PREVIEW_VISIBLE_COUNT = 3` lives in `trigger-domain-view.ts` and is exported.
- "Active" system domain = a system domain NOT present in `delta.excluded` (case-insensitive). Excluded system domains are removed from the preview line and from the active list — they are shown in the delta summary / as struck chips instead.
- `previewDomains` never shows «+0»: if `overflowCount` is 0 there is no overflow chip.

**Files:**
- Create: `src/lib/trigger-domain-view.ts`
- Create/Test: `src/lib/trigger-domain-view.test.ts`

- [ ] **Step 1: Write the test file FIRST (expect FAIL — module does not exist yet)**

Create `src/lib/trigger-domain-view.test.ts` with this exact content:

```ts
// src/lib/trigger-domain-view.test.ts
import { describe, it, expect } from "vitest";
import {
  PREVIEW_VISIBLE_COUNT,
  splitSystemDomains,
  previewDomains,
} from "./trigger-domain-view";
import { EMPTY_DELTA, type TriggerDelta } from "./trigger-edit-parser";

const SYS = ["vtb.ru", "alfabank.ru", "gazprombank.ru", "sberbank.ru"];

describe("splitSystemDomains", () => {
  it("без правок все системные домены активны, исключённых нет", () => {
    const r = splitSystemDomains(SYS, EMPTY_DELTA);
    expect(r.active).toEqual(SYS);
    expect(r.excluded).toEqual([]);
  });

  it("домен из delta.excluded уходит из active в excluded", () => {
    const delta: TriggerDelta = { added: [], excluded: ["sberbank.ru"] };
    const r = splitSystemDomains(SYS, delta);
    expect(r.active).toEqual(["vtb.ru", "alfabank.ru", "gazprombank.ru"]);
    expect(r.excluded).toEqual(["sberbank.ru"]);
  });

  it("сравнение исключений регистронезависимо", () => {
    const delta: TriggerDelta = { added: [], excluded: ["SberBank.RU"] };
    const r = splitSystemDomains(SYS, delta);
    expect(r.active).not.toContain("sberbank.ru");
    expect(r.excluded).toEqual(["sberbank.ru"]);
  });

  it("исключённый домен, которого нет в системном списке, игнорируется", () => {
    const delta: TriggerDelta = { added: [], excluded: ["nonsystem.ru"] };
    const r = splitSystemDomains(SYS, delta);
    expect(r.active).toEqual(SYS);
    expect(r.excluded).toEqual([]);
  });

  it("порядок системных доменов сохраняется", () => {
    const delta: TriggerDelta = { added: [], excluded: ["alfabank.ru"] };
    const r = splitSystemDomains(SYS, delta);
    expect(r.active).toEqual(["vtb.ru", "gazprombank.ru", "sberbank.ru"]);
  });
});

describe("previewDomains", () => {
  it("PREVIEW_VISIBLE_COUNT равен 3", () => {
    expect(PREVIEW_VISIBLE_COUNT).toBe(3);
  });

  it("список короче лимита — показывает всё, overflow 0", () => {
    const r = previewDomains(["a.ru", "b.ru"], 3);
    expect(r.visible).toEqual(["a.ru", "b.ru"]);
    expect(r.overflowCount).toBe(0);
  });

  it("список ровно по лимиту — overflow 0", () => {
    const r = previewDomains(["a.ru", "b.ru", "c.ru"], 3);
    expect(r.visible).toEqual(["a.ru", "b.ru", "c.ru"]);
    expect(r.overflowCount).toBe(0);
  });

  it("список длиннее лимита — режет и считает остаток", () => {
    const r = previewDomains(["a.ru", "b.ru", "c.ru", "d.ru", "e.ru"], 3);
    expect(r.visible).toEqual(["a.ru", "b.ru", "c.ru"]);
    expect(r.overflowCount).toBe(2);
  });

  it("пустой список — пустое превью, overflow 0", () => {
    const r = previewDomains([], 3);
    expect(r.visible).toEqual([]);
    expect(r.overflowCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL** — Run: `npx vitest run src/lib/trigger-domain-view.test.ts`; Expected: failure with a module-not-found / import error (`trigger-domain-view.ts` does not exist yet).

- [ ] **Step 3: Implement the module** — create `src/lib/trigger-domain-view.ts` with this exact content:

```ts
/**
 * Pure view-logic for trigger domains (Mechanic M2).
 *
 * System domains (TRIGGER_DOMAINS) are an indestructible layer. The user layer
 * (TriggerDelta) can *exclude* a system domain — a reversible operation that
 * never deletes the underlying system data. These helpers compute, from a
 * system-domain list + the current delta:
 *   - which system domains are still ACTIVE vs EXCLUDED;
 *   - a one-line preview ("show first N, then +M") for the collapsed card.
 *
 * Rendering lives in step-2-interests.tsx; this module is intentionally
 * pure + unit-tested so the +N math and exclusion math are not coupled to React.
 */

import type { TriggerDelta } from "./trigger-edit-parser";

/**
 * How many system domains the collapsed card shows inline before collapsing the
 * rest into a "+N" chip. A FIXED count is used on purpose: exact one-line fit
 * needs DOM measurement and is overkill for the prototype. 3 reads cleanly on
 * the step-2 column width with typical .ru domains.
 */
export const PREVIEW_VISIBLE_COUNT = 3;

export interface SystemDomainSplit {
  /** System domains NOT excluded by the user — shown as plain/✕ chips. */
  active: string[];
  /** System domains the user has excluded — shown struck-through, reversible. */
  excluded: string[];
}

/**
 * Partition `systemDomains` into active vs excluded using `delta.excluded`.
 * Comparison is case-insensitive. Order of the original system list is kept.
 * Excluded entries that are not actually system domains are ignored here
 * (those are user-added exclusions and belong to DeltaBlock, not this split).
 */
export function splitSystemDomains(
  systemDomains: string[],
  delta: TriggerDelta
): SystemDomainSplit {
  const excludedLower = new Set(delta.excluded.map((d) => d.toLowerCase()));
  const active: string[] = [];
  const excluded: string[] = [];
  for (const domain of systemDomains) {
    if (excludedLower.has(domain.toLowerCase())) excluded.push(domain);
    else active.push(domain);
  }
  return { active, excluded };
}

export interface DomainPreview {
  /** Domains rendered inline on the collapsed preview line. */
  visible: string[];
  /** How many domains are hidden behind the "+N" chip. 0 → no overflow chip. */
  overflowCount: number;
}

/**
 * Take the first `visibleCount` domains for the collapsed one-line preview and
 * report how many overflow into the "+N" chip.
 */
export function previewDomains(
  domains: string[],
  visibleCount: number
): DomainPreview {
  if (domains.length <= visibleCount) {
    return { visible: [...domains], overflowCount: 0 };
  }
  return {
    visible: domains.slice(0, visibleCount),
    overflowCount: domains.length - visibleCount,
  };
}
```

- [ ] **Step 4: Run the test — expect PASS** — Run: `npx vitest run src/lib/trigger-domain-view.test.ts`; Expected: all 10 tests pass.

- [ ] **Step 5: Commit** — `git add src/lib/trigger-domain-view.ts src/lib/trigger-domain-view.test.ts && git commit -m "feat(m2): add pure trigger-domain-view module with +N preview and system/excluded split"`

---

### Task 2: M2.1 — Collapsed trigger: system-domain preview + «+N»

Add a one-line system-domain preview to the collapsed `TriggerCard`. The chevron already exists and stays. The collapsed card currently shows only the delta summary; this task adds the system-domain line above it.

**Files:**
- Modify: `src/sections/signals/steps/step-2-interests.tsx`
  - imports (~1-26)
  - `TriggerCard` body (~277-363)

- [ ] **Step 1: Add imports for the new module**

In the import block at the top of `step-2-interests.tsx`, add a new import line after the `getTriggerDomains` import (currently line ~13):

```ts
import { getTriggerDomains } from "@/data/trigger-domains";
import {
  PREVIEW_VISIBLE_COUNT,
  previewDomains,
  splitSystemDomains,
} from "@/lib/trigger-domain-view";
```

- [ ] **Step 2: Compute the system-domain split inside `TriggerCard`**

In `TriggerCard` (currently ~277-290), replace the two derived-value lines:

```ts
  const hasDelta = selected && !isDeltaEmpty(delta);
  const showDomainList = expanded && domains.length > 0;
```

with:

```ts
  const hasDelta = selected && !isDeltaEmpty(delta);
  // System domains split into still-active vs user-excluded (reversible).
  const { active: activeSystemDomains, excluded: excludedSystemDomains } =
    splitSystemDomains(domains, delta);
  // Collapsed one-line preview: first PREVIEW_VISIBLE_COUNT active domains + "+N".
  const collapsedPreview = previewDomains(
    activeSystemDomains,
    PREVIEW_VISIBLE_COUNT
  );
  const showCollapsedDomains = !expanded && domains.length > 0;
  const showExpandedDomains = expanded && domains.length > 0;
```

- [ ] **Step 3: Render the collapsed preview line**

In `TriggerCard`, the body block currently reads (~348-360):

```tsx
      {(showDomainList || hasDelta) && (
        <div className="animate-in fade-in-0 slide-in-from-top-1 flex flex-col gap-3 border-t border-primary/20 bg-background/40 px-3 py-3">
          {showDomainList && (
            <ul className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-sm tracking-tight text-foreground/85">
              {domains.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}

          {hasDelta && <DeltaBlock delta={delta} onRemoveDelta={onRemoveDelta} />}
        </div>
      )}
```

Replace the WHOLE block above with this collapsed-only version (the expanded chip grid is added in Task 4 — for now this task ships the collapsed preview; the expanded branch keeps the old plain list temporarily so the card never renders empty between commits):

```tsx
      {(showCollapsedDomains || showExpandedDomains || hasDelta) && (
        <div className="animate-in fade-in-0 slide-in-from-top-1 flex flex-col gap-3 border-t border-primary/20 bg-background/40 px-3 py-3">
          {showCollapsedDomains && (
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-sm tracking-tight text-foreground/85">
              {collapsedPreview.visible.map((d, i) => (
                <span key={d} className="inline-flex items-center gap-1.5">
                  {d}
                  {i < collapsedPreview.visible.length - 1 && (
                    <span aria-hidden className="text-muted-foreground">
                      ·
                    </span>
                  )}
                </span>
              ))}
              {collapsedPreview.overflowCount > 0 && (
                <button
                  type="button"
                  onClick={onToggleExpanded}
                  aria-label="Показать все домены"
                  className="ml-0.5 inline-flex items-center rounded px-1 font-sans text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  +{collapsedPreview.overflowCount}
                </button>
              )}
            </p>
          )}

          {showExpandedDomains && (
            <ul className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-sm tracking-tight text-foreground/85">
              {domains.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}

          {hasDelta && <DeltaBlock delta={delta} onRemoveDelta={onRemoveDelta} />}
        </div>
      )}
```

Notes:
- `excludedSystemDomains` is computed in Step 2 and consumed in Task 4. It is intentionally unused for now — ESLint `no-unused-vars` would flag it, so add a `// eslint-disable-next-line @typescript-eslint/no-unused-vars` line directly above the `splitSystemDomains` destructure in Step 2 IF lint fails in Step 4; remove that disable comment in Task 4 once `excludedSystemDomains` is consumed.
- The «+N» chip is wired to `onToggleExpanded` here — this satisfies the M2.2 requirement "+N → only expand" early; Task 3 confirms the rest of the click model.

- [ ] **Step 4: Verify lint + types** — Run: `npx eslint src/sections/signals/steps/step-2-interests.tsx && npx tsc --noEmit`; Expected: no errors. If `excludedSystemDomains` triggers `no-unused-vars`, apply the disable comment described in Step 3 notes.

- [ ] **Step 5: Verify the checkpoint** — Run: open http://localhost:3000 → пройти онбординг до раздела «Сигналы» → шаг 2 «Интересы и триггеры» → не раскрывая ни один триггер; Expected: каждая свёрнутая карточка триггера показывает строку системных доменов вида `vtb.ru · alfabank.ru · gazprombank.ru +N`, справа в шапке карточки виден шеврон, смотрящий вниз. Триггеры с ≤3 доменами показывают все домены без «+N».

- [ ] **Step 6: Commit** — `git commit -am "feat(m2): collapsed trigger card shows system-domain preview with +N"`

---

### Task 3: M2.2 — Click model: checkbox / card body / chevron+«+N»

Wire the three click targets per spec 2.3:
- **Checkbox** → selection only (already correct — `onCheckboxToggle` → `toggleTriggerSelection`).
- **Card body** → selection + expand/collapse together (currently `handleTriggerClick` only toggles expansion and the chip — must ALSO toggle selection).
- **Chevron / «+N»** → expand/collapse only (already correct — `onToggleExpanded` → `toggleExpanded`; the «+N» button wired in Task 2 also calls `onToggleExpanded`).

**Files:**
- Modify: `src/sections/signals/steps/step-2-interests.tsx`
  - `handleTriggerClick` (~483-504)

- [ ] **Step 1: Make the card-body click also toggle selection**

`handleTriggerClick` currently reads (~483-504):

```ts
  // Click on the trigger row only toggles expansion + chip presence in the
  // prompt bar. Selection is *not* touched here — the trigger auto-activates
  // later, when the user submits a chat command targeting its chip (see
  // handleApplyParsed).
  function handleTriggerClick(triggerId: string, triggerLabel: string) {
    const isExpanded = expandedTriggerIds.has(triggerId);
    if (isExpanded) {
      setExpandedTriggerIds((prev) => {
        const next = new Set(prev);
        next.delete(triggerId);
        return next;
      });
      removeChip(`trigger_${triggerId}`);
    } else {
      setExpandedTriggerIds((prev) => {
        const next = new Set(prev);
        next.add(triggerId);
        return next;
      });
      pushTriggerChip(triggerId, triggerLabel);
    }
  }
```

Replace the WHOLE function with this version — it adds the selection toggle while keeping the existing expand + prompt-chip behaviour:

```ts
  // M2.2 — Click on the trigger card BODY does two things at once (spec 2.3):
  // it toggles selection AND toggles expansion. The separate-actions model was
  // found unergonomic. The checkbox (selection only) and the chevron / "+N"
  // (expansion only) remain split.
  function handleTriggerClick(triggerId: string, triggerLabel: string) {
    // Selection: card body always toggles it.
    toggleTriggerSelection(triggerId);
    // Expansion + prompt-bar chip presence.
    const isExpanded = expandedTriggerIds.has(triggerId);
    if (isExpanded) {
      setExpandedTriggerIds((prev) => {
        const next = new Set(prev);
        next.delete(triggerId);
        return next;
      });
      removeChip(`trigger_${triggerId}`);
    } else {
      setExpandedTriggerIds((prev) => {
        const next = new Set(prev);
        next.add(triggerId);
        return next;
      });
      pushTriggerChip(triggerId, triggerLabel);
    }
  }
```

(`toggleTriggerSelection` is already defined at ~466-472 and is in scope.)

- [ ] **Step 2: Verify types** — Run: `npx tsc --noEmit`; Expected: no errors.

- [ ] **Step 3: Verify the checkpoint** — Run: open http://localhost:3000 → раздел «Сигналы» → шаг 2; Expected:
  - Клик по чекбоксу выделяет/снимает триггер (карточка жёлтая `border-brand/50 bg-brand-muted`) и НЕ раскрывает его.
  - Клик по телу карточки (по названию триггера) одновременно выделяет/снимает триггер И раскрывает/сворачивает домены.
  - Клик по шеврону, а также по «+N» в свёрнутом превью, только раскрывает/сворачивает — выделение не меняется.
  - В раскрытом состоянии шеврон смотрит вверх (поворот `rotate-180` уже реализован).

- [ ] **Step 4: Commit** — `git commit -am "feat(m2): card-body click selects + expands; checkbox and chevron stay split"`

---

### Task 4: M2.3 — Expanded trigger: all domains as chips + reversible ✕

Replace the expanded plain `<li>` list with a wrapping chip grid:
- Each ACTIVE system domain → a neutral chip with ✕ → clicking ✕ excludes it (adds to `delta.excluded`).
- Each EXCLUDED system domain → a struck-through red chip with a return affordance (↩) → clicking it removes the domain from `delta.excluded` (restores it).
- Each USER-ADDED domain (`delta.added`) → a green chip (reuse `DeltaChip` `variant="added"`); ✕ removes it from `delta.added`.
- «+N» disappears in expanded state (already handled — preview is collapsed-only).
- The delta summary line (`DeltaBlock`) is no longer needed in the expanded view because added/excluded are now shown inline as chips; keep `DeltaBlock` ONLY for the collapsed card.

**Files:**
- Modify: `src/sections/signals/steps/step-2-interests.tsx`
  - imports (~6) — add `Undo2`
  - `DeltaChip` (~186-215) — add `line-through` on excluded variant
  - new prop on `TriggerCardProps` (~217-228) and a new system-domain handler
  - `TriggerCard` expanded render (~348-360 region, post-Task-2)
  - new handlers `handleExcludeSystemDomain` / `handleRestoreSystemDomain` (~533-544 region)
  - `<TriggerCard>` call site (~688-704)

- [ ] **Step 1: Add the `Undo2` icon import**

The icon import line (~6) currently reads:

```ts
import { Check, ChevronDown, Plus, Minus, X } from "lucide-react";
```

Replace with:

```ts
import { Check, ChevronDown, Plus, Minus, X, Undo2 } from "lucide-react";
```

- [ ] **Step 2: Add `line-through` to the excluded `DeltaChip` variant**

`DeltaChip` (~195-203) currently renders the domain plainly. Replace the `<span>` className expression and the domain text so the excluded domain is struck through. The current body is:

```tsx
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
        variant === "added"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
      )}
    >
      {domain}
```

Replace with:

```tsx
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
        variant === "added"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
      )}
    >
      <span className={cn(variant === "excluded" && "line-through")}>
        {domain}
      </span>
```

(The rest of `DeltaChip` — the `<button>` with `<X>` — is unchanged.)

- [ ] **Step 3: Add a system-domain chip component above `TriggerCard`**

Insert this new component immediately AFTER `DeltaBlock` (after its closing `}` at ~275) and BEFORE `function TriggerCard`:

```tsx
/**
 * Chip for a SYSTEM domain in the expanded trigger card.
 *  - active   → neutral chip with ✕; ✕ excludes the domain (reversible).
 *  - excluded → struck-through red chip with ↩; click restores the domain.
 * System data is never deleted — exclusion lives in the user-layer delta.
 */
function SystemDomainChip({
  domain,
  excluded,
  onExclude,
  onRestore,
}: {
  domain: string;
  excluded: boolean;
  onExclude: () => void;
  onRestore: () => void;
}) {
  if (excluded) {
    return (
      <button
        type="button"
        onClick={onRestore}
        aria-label={`Вернуть ${domain}`}
        className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-xs text-rose-700 transition-colors hover:bg-rose-500/20 dark:text-rose-300"
      >
        <span className="line-through">{domain}</span>
        <Undo2 className="h-3 w-3 opacity-70" />
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs text-foreground/85">
      {domain}
      <button
        type="button"
        onClick={onExclude}
        aria-label={`Исключить ${domain}`}
        className="opacity-50 transition-opacity hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
```

- [ ] **Step 4: Add the two new props to `TriggerCardProps`**

`TriggerCardProps` (~217-228) currently ends with:

```ts
  onCheckboxToggle: () => void;
  onRemoveDelta: (bucket: "added" | "excluded", domain: string) => void;
}
```

Replace with:

```ts
  onCheckboxToggle: () => void;
  onRemoveDelta: (bucket: "added" | "excluded", domain: string) => void;
  onExcludeSystemDomain: (domain: string) => void;
  onRestoreSystemDomain: (domain: string) => void;
}
```

- [ ] **Step 5: Destructure the two new props in `TriggerCard`**

The `TriggerCard` parameter destructure (~277-288) currently ends with:

```ts
  onCheckboxToggle,
  onRemoveDelta,
}: TriggerCardProps) {
```

Replace with:

```ts
  onCheckboxToggle,
  onRemoveDelta,
  onExcludeSystemDomain,
  onRestoreSystemDomain,
}: TriggerCardProps) {
```

- [ ] **Step 6: Replace the expanded render with the chip grid**

After Task 2, the body block of `TriggerCard` contains a `showExpandedDomains` branch with a plain `<ul>`, and a `hasDelta` branch with `<DeltaBlock>`. Replace the `showExpandedDomains` branch and the `hasDelta` branch so the WHOLE block becomes:

```tsx
      {(showCollapsedDomains || showExpandedDomains || hasDelta) && (
        <div className="animate-in fade-in-0 slide-in-from-top-1 flex flex-col gap-3 border-t border-primary/20 bg-background/40 px-3 py-3">
          {showCollapsedDomains && (
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-sm tracking-tight text-foreground/85">
              {collapsedPreview.visible.map((d, i) => (
                <span key={d} className="inline-flex items-center gap-1.5">
                  {d}
                  {i < collapsedPreview.visible.length - 1 && (
                    <span aria-hidden className="text-muted-foreground">
                      ·
                    </span>
                  )}
                </span>
              ))}
              {collapsedPreview.overflowCount > 0 && (
                <button
                  type="button"
                  onClick={onToggleExpanded}
                  aria-label="Показать все домены"
                  className="ml-0.5 inline-flex items-center rounded px-1 font-sans text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  +{collapsedPreview.overflowCount}
                </button>
              )}
            </p>
          )}

          {showExpandedDomains && (
            <div className="flex flex-wrap items-center gap-1.5">
              {domains.map((d) => (
                <SystemDomainChip
                  key={`sys-${d}`}
                  domain={d}
                  excluded={excludedSystemDomains.some(
                    (e) => e.toLowerCase() === d.toLowerCase()
                  )}
                  onExclude={() => onExcludeSystemDomain(d)}
                  onRestore={() => onRestoreSystemDomain(d)}
                />
              ))}
              {delta.added.map((d) => (
                <DeltaChip
                  key={`add-${d}`}
                  domain={d}
                  variant="added"
                  onRemove={() => onRemoveDelta("added", d)}
                />
              ))}
            </div>
          )}

          {/* Collapsed card: delta summary line. Expanded card shows added/
              excluded inline as chips above, so DeltaBlock is collapsed-only. */}
          {hasDelta && !expanded && (
            <DeltaBlock delta={delta} onRemoveDelta={onRemoveDelta} />
          )}
        </div>
      )}
```

Notes:
- The expanded grid iterates the FULL `domains` list (system source of truth) and lets `SystemDomainChip` decide active vs excluded — this keeps an excluded system domain visible in its original position as a struck chip, exactly per spec mock 2.2.
- User-added domains (`delta.added`) render as green `DeltaChip`s after the system chips.
- The "Добавить свой домен" button is added at the end of this grid in Task 5.
- `excludedSystemDomains` from Task 2 is now consumed — remove the `eslint-disable` comment if it was added in Task 2 Step 3.

- [ ] **Step 7: Add the two new handlers in `Step2Interests`**

Immediately AFTER `handleRemoveDelta` (which ends at ~544) add these two handlers:

```ts
  // M2.3 — Exclude a SYSTEM domain. System data is never deleted: this only
  // appends the domain to the user-layer `excluded` delta (reversible).
  function handleExcludeSystemDomain(triggerId: string, domain: string) {
    setSelectedTriggers((prev) =>
      prev.includes(triggerId) ? prev : [...prev, triggerId]
    );
    setDeltas((prev) => {
      const current = prev[triggerId] ?? EMPTY_DELTA;
      const updated = applyEditToDelta(current, [], [domain]);
      const next = { ...prev };
      if (isDeltaEmpty(updated)) delete next[triggerId];
      else next[triggerId] = updated;
      return next;
    });
  }

  // M2.3 — Restore a previously-excluded system domain: drop it from the
  // `excluded` delta. The system domain reappears as a normal active chip.
  function handleRestoreSystemDomain(triggerId: string, domain: string) {
    setDeltas((prev) => {
      const current = prev[triggerId] ?? EMPTY_DELTA;
      const next = removeFromDelta(current, "excluded", domain);
      if (isDeltaEmpty(next)) return omitKey(prev, triggerId);
      return { ...prev, [triggerId]: next };
    });
  }
```

Notes:
- `handleExcludeSystemDomain` selects the trigger because a delta only renders on a selected card (`hasDelta = selected && ...`) and an excluded chip must always be visible — mirrors `handleApplyParsed`'s auto-activation.
- `applyEditToDelta`, `removeFromDelta`, `isDeltaEmpty`, `EMPTY_DELTA`, `omitKey` are all already imported / defined and in scope.

- [ ] **Step 8: Pass the two new props at the `<TriggerCard>` call site**

The `<TriggerCard>` call site (~688-704) currently ends with:

```tsx
                  onRemoveDelta={(bucket, domain) =>
                    handleRemoveDelta(trigger.id, bucket, domain)
                  }
                />
```

Replace with:

```tsx
                  onRemoveDelta={(bucket, domain) =>
                    handleRemoveDelta(trigger.id, bucket, domain)
                  }
                  onExcludeSystemDomain={(domain) =>
                    handleExcludeSystemDomain(trigger.id, domain)
                  }
                  onRestoreSystemDomain={(domain) =>
                    handleRestoreSystemDomain(trigger.id, domain)
                  }
                />
```

- [ ] **Step 9: Verify lint + types** — Run: `npx eslint src/sections/signals/steps/step-2-interests.tsx && npx tsc --noEmit`; Expected: no errors.

- [ ] **Step 10: Verify the checkpoint** — Run: open http://localhost:3000 → раздел «Сигналы» → шаг 2 → раскрыть триггер (клик по телу карточки или по шеврону); Expected:
  - Все системные домены показаны чипами, переносятся на следующую строку при заполнении; «+N» в раскрытом виде отсутствует.
  - Клик по ✕ на системном чипе перечёркивает домен, чип становится красным с иконкой ↩.
  - Повторный клик по перечёркнутому чипу (↩) возвращает домен в обычное активное состояние.
  - Если триггер не был выбран, исключение системного домена также выделяет карточку (жёлтая).
  - Пользовательские добавленные домены (если есть delta — например, после AI-команды «добавь domrf.ru») показаны зелёными чипами после системных.

- [ ] **Step 11: Commit** — `git commit -am "feat(m2): expanded trigger renders all domains as chips with reversible system exclusion"`

---

### Task 5: M2.4 — «Добавить свой домен» button

Add a button at the end of the expanded chip grid. Clicking it fires an "Add domain" tag chip into the prompt bar, then focuses the editor — reusing the `pushChip` + editor-focus pattern from `pushTriggerChip`. The user then types the domain; `parseTriggerCommand` already understands «добавь domain.ru», so no parser change is needed.

**Design decision (stated explicitly):** The "Add domain" chip reuses the existing `PromptChipKind` value `"section"` — it is a context tag, not a per-trigger edit target, and adding a brand-new kind would ripple into every chip consumer with no behavioural payoff for the prototype. The chip carries `payload: triggerId` so a downstream parse can be applied to the right trigger, and a stable `id` of `add_domain_${triggerId}` so re-clicking the same trigger's button just refreshes the chip rather than stacking duplicates. Label: `Добавить домен`.

**Files:**
- Modify: `src/sections/signals/steps/step-2-interests.tsx`
  - new prop on `TriggerCardProps` (~217-230)
  - `TriggerCard` destructure (~277-290)
  - expanded grid render (add the button)
  - new helper `pushAddDomainChip` near `pushTriggerChip` (~559-569)
  - `<TriggerCard>` call site (~688-708)

- [ ] **Step 1: Add the `onAddDomain` prop to `TriggerCardProps`**

`TriggerCardProps` currently ends (after Task 4) with:

```ts
  onExcludeSystemDomain: (domain: string) => void;
  onRestoreSystemDomain: (domain: string) => void;
}
```

Replace with:

```ts
  onExcludeSystemDomain: (domain: string) => void;
  onRestoreSystemDomain: (domain: string) => void;
  onAddDomain: () => void;
}
```

- [ ] **Step 2: Destructure `onAddDomain` in `TriggerCard`**

The `TriggerCard` parameter destructure currently ends (after Task 4) with:

```ts
  onExcludeSystemDomain,
  onRestoreSystemDomain,
}: TriggerCardProps) {
```

Replace with:

```ts
  onExcludeSystemDomain,
  onRestoreSystemDomain,
  onAddDomain,
}: TriggerCardProps) {
```

- [ ] **Step 3: Render the "Добавить свой домен" button at the end of the expanded grid**

In the `showExpandedDomains` branch of `TriggerCard` (added in Task 4), the grid currently ends with the `delta.added` map followed by the closing `</div>`:

```tsx
              {delta.added.map((d) => (
                <DeltaChip
                  key={`add-${d}`}
                  domain={d}
                  variant="added"
                  onRemove={() => onRemoveDelta("added", d)}
                />
              ))}
            </div>
          )}
```

Replace with:

```tsx
              {delta.added.map((d) => (
                <DeltaChip
                  key={`add-${d}`}
                  domain={d}
                  variant="added"
                  onRemove={() => onRemoveDelta("added", d)}
                />
              ))}
              <button
                type="button"
                onClick={onAddDomain}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                Добавить свой домен
              </button>
            </div>
          )}
```

(`Plus` is already imported.)

- [ ] **Step 4: Add the `pushAddDomainChip` helper**

Immediately AFTER `pushTriggerChip` (which ends at ~569) add:

```ts
  // M2.4 — "Add your own domain" → fire an "Добавить домен" tag into the
  // prompt bar and focus the editor. The user then types the domain; the
  // existing parseTriggerCommand already understands «добавь domain.ru», so
  // the AI-path (M5) consumes this with no parser change. The chip reuses the
  // "section" kind (it is a context tag, not a per-trigger edit chip) and a
  // stable id so re-clicking the same trigger refreshes rather than stacks.
  function pushAddDomainChip(triggerId: string) {
    pushChip({
      id: `add_domain_${triggerId}`,
      kind: "section",
      label: "Добавить домен",
      payload: triggerId,
      removable: true,
    });
    const el = document.querySelector<HTMLDivElement>(
      '[role="textbox"][contenteditable="true"]'
    );
    el?.focus();
  }
```

- [ ] **Step 5: Pass `onAddDomain` at the `<TriggerCard>` call site**

The `<TriggerCard>` call site currently ends (after Task 4) with:

```tsx
                  onExcludeSystemDomain={(domain) =>
                    handleExcludeSystemDomain(trigger.id, domain)
                  }
                  onRestoreSystemDomain={(domain) =>
                    handleRestoreSystemDomain(trigger.id, domain)
                  }
                />
```

Replace with:

```tsx
                  onExcludeSystemDomain={(domain) =>
                    handleExcludeSystemDomain(trigger.id, domain)
                  }
                  onRestoreSystemDomain={(domain) =>
                    handleRestoreSystemDomain(trigger.id, domain)
                  }
                  onAddDomain={() => pushAddDomainChip(trigger.id)}
                />
```

- [ ] **Step 6: Verify lint + types + full test suite** — Run: `npx eslint src/sections/signals/steps/step-2-interests.tsx && npx tsc --noEmit && npm run test`; Expected: no lint/type errors, all vitest suites pass (including `trigger-domain-view.test.ts` from Task 1).

- [ ] **Step 7: Verify the checkpoint** — Run: open http://localhost:3000 → раздел «Сигналы» → шаг 2 → раскрыть триггер; Expected:
  - В конце списка доменных чипов виден пунктирный чип-кнопка «+ Добавить свой домен».
  - Клик по нему → в промпт-баре внизу появляется тег «Добавить домен», курсор в инпуте.
  - Можно напечатать «добавь domrf.ru» и отправить — домен появляется зелёным чипом в раскрытом триггере (через существующий путь `parseTriggerCommand`).

- [ ] **Step 8: Commit** — `git commit -am "feat(m2): add 'Добавить свой домен' button firing an Add-domain tag into the prompt bar"`

---

## Done criteria

All four backlog chunks M2.1–M2.4 complete, every checkpoint verified on `localhost:3000`, `npm run test` green, `npx tsc --noEmit` and `npx eslint` clean. Report the worktree path (`.worktrees/m2-trigger-domains`) and branch (`feature/m2-trigger-domains`) to the user; do not merge or push — that is the user's call.
