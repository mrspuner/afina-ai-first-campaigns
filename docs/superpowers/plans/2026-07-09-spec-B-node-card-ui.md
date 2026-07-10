# Spec B — Node-card UI (tags, splitter, chevron, dirty dot, eye, delete) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**For agentic workers:** Execute top to bottom, one task at a time. Every task is a TDD micro-cycle: write the failing test, run it (RED), write the implementation, run it (GREEN), then run the guardrail commands and commit. Do not batch tasks. Do not skip the "Rebase on A" checkpoint — Tasks for items 3, 9, and the `PARAM_RENDERERS` reconciliation **will not compile** until A is merged and you have rebased. All paths are absolute-from-repo-root inside your worktree.

**Goal:** Ship the six node-card UI refinements from `docs/superpowers/specs/2026-07-09-spec-B-node-card-ui-design.md` — (2) removable-tag crosses + tag-cleanup on node close, (3) collapse the splitter's two rows into one "Ветвление" affordance, (4) Pencil→ChevronDown on the three dropdowns + mascot/eye on ScoringRow, (5) move the dirty-dot next to the parameter label behind a single shared `<DirtyDot/>`, (6) move the preview eye inside the dropdown before the disclosure chevron, (9) an inline-confirm delete-node button.

**Architecture:** React 19 / Next.js 16 client components under `src/sections/campaigns/`. Expanded node card = `WorkflowNodeComponent` (`workflow-node.tsx`) → `NodeCardBody` (`node-card-content.tsx`) → per-kind field components (`split-fields.tsx`, `wait-fields.tsx`, `email-field.tsx`, `node-template-select.tsx`, `node-field-combobox.tsx`, inline `ScoringRow`). Prompt-bar chips live in a reducer context (`src/state/prompt-chips-context.tsx`) and are rendered imperatively into a contentEditable surface (`src/components/ai-elements/chip-editable-input.tsx`). Node deletion reuses the existing structural-command pipeline: `dispatch({ type: "workflow_structural_commands_submit", ops: [{ kind: "remove", ref }] })` → staged in `app-state.ts` → applied by `applyOps`/`applyRemove` in `src/state/structural-commands.ts` (edge reconnect already implemented). All row layouts share the grid `grid grid-cols-[minmax(72px,max-content)_1fr_auto]` (col1 label / col2 value / col3 affordances).

**Tech Stack:** TypeScript, React 19, Next.js 16, Tailwind v4, base-ui Popover + cmdk `Command`, lucide-react (`ChevronDown`, `Eye`, `Trash2`), `next/image` mascot (`/mascot-icon.svg`). Tests: vitest + `@testing-library/react` in jsdom. Single file: `npx vitest run <path>`. Types: `npx tsc --noEmit`. Lint: `npm run lint`. Playwright visual snapshots: `npm run test:visual:update` (human-review only).

---

## Cross-spec dependency note (READ FIRST)

Spec B is the **second** merge (order A → B → C). Three pieces of B import symbols that **do not exist on `integration` yet** — Spec A writes them:

| B needs | Provided by A in | Used by B item |
|---|---|---|
| `splitSummary(params)` | `src/state/split-segments.ts` | Item 3 |
| `isDeletableNodeType(type)` | `src/state/structural-commands.ts` | Item 9 |
| `NodeParams` drops `merge`, adds `statistics` | `src/types/workflow.ts` | `PARAM_RENDERERS` reconciliation |

**Strategy:** Items **2, 4, 5, 6 have zero A-dependency** — build them first, fully, off `integration`. Then a hard **"Rebase on A" checkpoint** (Task R). Only after that do Items **3** and **9** and the **`PARAM_RENDERERS` reconciliation**, importing A's now-existing symbols. Attempting Items 3/9 before the rebase will fail `tsc` with "Cannot find name / has no exported member" — that is expected; do not stub A's symbols yourself.

**Internal dependency:** Item 6 (eye before the disclosure chevron) requires the chevron introduced by Item 4 (Pencil→ChevronDown). Item 4 is sequenced before Item 6.

**Sequence:** `Task 0 (preflight)` → `2` → `4` → `5` → `6` → `Task R (rebase on A)` → `3` → `9` → `Task P (PARAM_RENDERERS)` → `Task F (finalize)`.

---

## File Structure

**New files**
- `src/sections/campaigns/dirty-dot.tsx` — shared `<DirtyDot/>` (Item 5).
- `src/sections/campaigns/dirty-dot.test.tsx` — Item 5.
- `src/components/ai-elements/chip-editable-input.dom.test.tsx` — Item 2 (chip ×).
- `src/sections/campaigns/workflow-node.test.tsx` — Items 2 + 9 (tag-cleanup on close, delete button).
- `src/sections/campaigns/node-field-combobox.test.tsx` — Items 4 + 6.
- `src/sections/campaigns/wait-fields.render.test.tsx` — Item 4 (chevron; existing `wait-fields.test.ts` only covers `splitDuration`).

**Modified files**
- `src/state/prompt-chips-context.tsx` (+ `.test.ts`) — Item 2 (`removeChipsForNode`).
- `src/components/ai-elements/chip-editable-input.tsx` — Item 2 (export + × in `createChipElement`).
- `src/sections/campaigns/workflow-node.tsx` — Item 2 (close→cleanup) + Item 9 (trash button).
- `src/sections/campaigns/node-card-content.tsx` — Items 3 (handoff), 4 (ScoringRow), 5 (DirtyDot), 6 (remove external eyes), P (`PARAM_RENDERERS`).
- `src/sections/campaigns/node-template-select.tsx` (+ `.test.tsx`) — Items 4, 5, 6.
- `src/sections/campaigns/node-field-combobox.tsx` — Items 4, 5, 6.
- `src/sections/campaigns/wait-fields.tsx` — Items 4, 5.
- `src/sections/campaigns/split-fields.tsx` (+ `.test.tsx`) — Items 5, 3.
- `src/sections/campaigns/email-field.tsx` — Item 5.
- `src/sections/campaigns/scoring-row.test.tsx` — Item 4 (extend).

---

## Task 0 — Worktree preflight

From the repo root (`/Users/macintosh/Documents/work/afina-ai-first_campaing-centric`):

```bash
git worktree add .worktrees/spec-b -b feature/spec-b-node-card-ui integration
cd .worktrees/spec-b
npm install
```

Verify you are level with `integration` (AGENTS.md mandatory preflight):

```bash
git status --short                          # expect: no output (clean)
git merge --ff-only integration             # expect: "Already up to date."
git rev-list --count HEAD..integration      # expect: 0
```

If the count is not `0` or the merge fails, STOP and report — do not build on a stale base. Run all subsequent commands from `.worktrees/spec-b`. Do not start `next dev` on port 3000 if another worktree holds it; use `npx vitest run` for verification.

Baseline sanity (should already pass):
```bash
npx vitest run src/state/prompt-chips-context.test.ts src/sections/campaigns/split-fields.test.tsx
```

---

## Item 2 — Removable-tag crosses + tag cleanup on node close

### Task 2.1 — `removeChipsForNode` in the chips reducer

**RED.** Append to `src/state/prompt-chips-context.test.ts`:

```ts
describe("removeForNode", () => {
  const push = (s: PromptChipsState, id: string) =>
    promptChipsReducer(s, {
      type: "push",
      chip: { id, kind: "node", label: id, payload: null, removable: true },
    });

  it("drops the whole-node chip and all its field chips, keeps other nodes", () => {
    let s = empty;
    s = push(s, "node_n1");
    s = push(s, "nodefield_n1_Текст");
    s = push(s, "nodefield_n1_Время");
    s = push(s, "node_n2");
    s = push(s, "nodefield_n2_Текст");
    const next = promptChipsReducer(s, { type: "removeForNode", nodeId: "n1" });
    expect(next.chips.map((c) => c.id)).toEqual(["node_n2", "nodefield_n2_Текст"]);
  });

  it("does not falsely match a longer node id (n1 vs n10)", () => {
    let s = empty;
    s = push(s, "node_n10");
    s = push(s, "nodefield_n10_Текст");
    const next = promptChipsReducer(s, { type: "removeForNode", nodeId: "n1" });
    expect(next.chips.map((c) => c.id)).toEqual(["node_n10", "nodefield_n10_Текст"]);
  });
});
```

Run (RED — `removeForNode` unknown action):
```bash
npx vitest run src/state/prompt-chips-context.test.ts
```

**GREEN.** In `src/state/prompt-chips-context.tsx`:

1. Extend the action union (currently line 65-69):
```ts
export type PromptChipsAction =
  | { type: "push"; chip: Omit<PromptChip, "id"> & { id?: string } }
  | { type: "remove"; id: string }
  | { type: "removeForNode"; nodeId: string }
  | { type: "removeLastRemovable" }
  | { type: "clear" };
```

2. Add a reducer case (after the `remove` case at line 93-94):
```ts
    case "removeForNode": {
      const whole = `node_${action.nodeId}`;
      const fieldPrefix = `nodefield_${action.nodeId}_`;
      const next = state.chips.filter(
        (c) => c.id !== whole && !c.id.startsWith(fieldPrefix)
      );
      return next.length === state.chips.length ? state : { chips: next };
    }
```

3. Extend the API interface (line 110-115):
```ts
interface PromptChipsApi {
  chips: readonly PromptChip[];
  pushChip: (chip: Omit<PromptChip, "id"> & { id?: string }) => string;
  removeChip: (id: string) => void;
  removeChipsForNode: (nodeId: string) => void;
  clearChips: () => void;
}
```

4. Add the callback (after `removeChip`, line 131-133):
```ts
  const removeChipsForNode = useCallback((nodeId: string) => {
    dispatch({ type: "removeForNode", nodeId });
  }, []);
```

5. Add it to the `useMemo` api object (line 143-151): add `removeChipsForNode,` alongside `removeChip,` in both the object and the dependency array.

Run (GREEN):
```bash
npx vitest run src/state/prompt-chips-context.test.ts
npx tsc --noEmit
```
Expected: `Test Files  1 passed`, no tsc output.

**Commit:**
```bash
git add -A && git commit -m "feat(chips): removeChipsForNode bulk helper (spec B #2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 2.2 — Visible × on removable chips

`createChipElement` (`chip-editable-input.tsx:523`) is a module-private DOM builder. Export it and give it an `onRemoveChip` callback so the × is testable in isolation (the full contentEditable + controller path is too imperative to drive deterministically).

**RED.** New file `src/components/ai-elements/chip-editable-input.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createChipElement } from "./chip-editable-input";
import type { PromptChip } from "@/state/prompt-chips-context";

// createChipElement calls getNodeIconSvg (renderToStaticMarkup) — mock it away.
vi.mock("@/sections/campaigns/node-visuals", () => ({ getNodeIconSvg: () => null }));

const chip = (over: Partial<PromptChip> = {}): PromptChip => ({
  id: "nodefield_n1_Текст",
  kind: "node",
  label: "Текст",
  payload: { color: "#5eead4", nodeType: "sms" },
  removable: true,
  ...over,
});

describe("createChipElement — × for removable chips (spec B #2)", () => {
  it("removable chip renders an × that calls onRemoveChip(id)", () => {
    const onRemove = vi.fn();
    const el = createChipElement(chip(), onRemove);
    const x = el.querySelector<HTMLButtonElement>('button[aria-label^="Убрать тег"]');
    expect(x).not.toBeNull();
    x!.click();
    expect(onRemove).toHaveBeenCalledWith("nodefield_n1_Текст");
  });

  it("non-removable chip renders no ×", () => {
    const el = createChipElement(chip({ removable: false }), vi.fn());
    expect(el.querySelector('button[aria-label^="Убрать тег"]')).toBeNull();
  });

  it("still renders the chip label", () => {
    const el = createChipElement(chip(), vi.fn());
    expect(el.textContent).toContain("Текст");
  });
});
```

Run (RED — `createChipElement` not exported):
```bash
npx vitest run src/components/ai-elements/chip-editable-input.dom.test.tsx
```

**GREEN.** In `src/components/ai-elements/chip-editable-input.tsx`:

1. Change the signature and body of `createChipElement` (line 523). Add the `onRemoveChip` param and append the × as the last child (after the label text node, current line 561):
```ts
export function createChipElement(
  chip: PromptChip,
  onRemoveChip?: (id: string) => void
): HTMLElement {
```
Right before `return el;` (currently line 562), after `el.appendChild(document.createTextNode(chip.label));`:
```ts
  // #2 — видимый крестик у removable-тегов. Чип — императивный DOM-узел вне
  // React, поэтому обработчик вешаем прямо здесь. mousedown.preventDefault не
  // даёт крестику украсть каретку/фокус у редактора.
  if (chip.removable && onRemoveChip) {
    const x = document.createElement("button");
    x.type = "button";
    x.setAttribute("aria-label", `Убрать тег: ${chip.label}`);
    x.className =
      "chip-remove ml-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center " +
      "justify-center rounded-full text-current/70 transition-colors " +
      "hover:bg-black/20 hover:text-current";
    x.textContent = "×";
    x.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    x.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onRemoveChip(chip.id);
    });
    el.appendChild(x);
  }
```

2. Pass `removeChip` at the single call site (the chips→DOM sync effect, line 284):
```ts
      const el = createChipElement(chip, removeChip);
```
`removeChip` is already destructured from `usePromptChips()` at line 80. Removing the × updates chip state via `removeChip`; the existing sync effect then removes the DOM node (and the `MutationObserver` at line 443 stays consistent).

Run (GREEN):
```bash
npx vitest run src/components/ai-elements/chip-editable-input.dom.test.tsx
npx tsc --noEmit && npm run lint
```

**Commit:**
```bash
git add -A && git commit -m "feat(chips): visible × on removable prompt chips (spec B #2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 2.3 — Node close also removes its tags

**RED.** New file `src/sections/campaigns/workflow-node.test.tsx` (this file is extended again in Item 9):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { WorkflowNodeData } from "@/types/workflow";

const dispatch = vi.fn();
const removeChipsForNode = vi.fn();

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
  useUpdateNodeInternals: () => () => {},
}));
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, className, style }: any) => (
      <div className={className} style={style}>{children}</div>
    ),
  },
}));
vi.mock("@/state/app-state-context", () => ({ useAppDispatch: () => dispatch }));
vi.mock("@/state/prompt-chips-context", () => ({
  usePromptChips: () => ({ removeChipsForNode }),
}));
vi.mock("./node-card-content", () => ({ NodeCardBody: () => null }));

import { WorkflowNodeComponent } from "./workflow-node";

function renderNode(data: WorkflowNodeData, selected = true) {
  const props = { id: "n1", data, selected } as unknown as React.ComponentProps<
    typeof WorkflowNodeComponent
  >;
  return render(<WorkflowNodeComponent {...props} />);
}

const sms: WorkflowNodeData = {
  label: "СМС",
  nodeType: "sms",
  params: { kind: "sms", text: "hi", alphaName: "A", scheduledAt: "immediate" },
};

describe("WorkflowNodeComponent — close removes node tags (spec B #2)", () => {
  beforeEach(() => {
    dispatch.mockClear();
    removeChipsForNode.mockClear();
  });

  it("X button deselects AND removes this node's chips", () => {
    renderNode(sms);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть карточку ноды" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "workflow_node_deselected" });
    expect(removeChipsForNode).toHaveBeenCalledWith("n1");
  });
});
```

Run (RED — `removeChipsForNode` not called yet):
```bash
npx vitest run src/sections/campaigns/workflow-node.test.tsx
```

**GREEN.** In `src/sections/campaigns/workflow-node.tsx`:

1. Import the chips hook (after line 8):
```ts
import { usePromptChips } from "@/state/prompt-chips-context";
```
2. Inside `WorkflowNodeComponent`, after `const dispatch = useAppDispatch();` (line 23):
```ts
  const { removeChipsForNode } = usePromptChips();
```
3. In the X button `onClick` (lines 117-120), add the cleanup alongside the deselect:
```ts
            onClick={(e) => {
              e.stopPropagation();
              // #2 — снимаем теги этой ноды (node_${id} + nodefield_${id}_*).
              // Направление одностороннее: закрытие ноды → чистка её тегов.
              removeChipsForNode(id);
              dispatch({ type: "workflow_node_deselected" });
            }}
```

Run (GREEN):
```bash
npx vitest run src/sections/campaigns/workflow-node.test.tsx
npx tsc --noEmit
```

**Commit:**
```bash
git add -A && git commit -m "feat(node-card): close node removes its prompt tags (spec B #2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Item 4 — Pencil→ChevronDown on the three dropdowns; ScoringRow → mascot/eye

lucide-react renders `<svg class="lucide lucide-chevron-down …">` / `lucide-pencil` / `lucide-eye`; tests assert on those class selectors.

### Task 4.1 — `NodeTemplateSelect`: Pencil → ChevronDown

**RED.** Append to `src/sections/campaigns/node-template-select.test.tsx` (inside the existing `describe`):

```tsx
  it("uses a chevron affordance, not a pencil (spec B #4)", () => {
    const { container } = render(
      <NodeTemplateSelect
        label="Шаблон"
        templates={TPLS}
        selectedName=""
        isDirty={false}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
        onCreate={vi.fn()}
      />
    );
    expect(container.querySelector("svg.lucide-chevron-down")).not.toBeNull();
    expect(container.querySelector("svg.lucide-pencil")).toBeNull();
  });
```

Run (RED):
```bash
npx vitest run src/sections/campaigns/node-template-select.test.tsx
```

**GREEN.** In `src/sections/campaigns/node-template-select.tsx`:
- Line 3: `import { ChevronDown, Eye, Plus } from "lucide-react";` (drop `Pencil`; `Eye` is still used inside `CommandItem`).
- Line 106: replace `<Pencil aria-hidden className="h-3 w-3 shrink-0" />` with `<ChevronDown aria-hidden className="h-3 w-3 shrink-0" />`.

Run (GREEN):
```bash
npx vitest run src/sections/campaigns/node-template-select.test.tsx
```

### Task 4.2 — `NodeFieldCombobox`: Pencil → ChevronDown

**RED.** New file `src/sections/campaigns/node-field-combobox.test.tsx` (extended in Item 6):

```tsx
// @vitest-environment jsdom
import { beforeAll, describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/state/field-directory", () => ({
  getFieldOptions: () => ["Открыто", "Кликнуто"],
  addFieldValue: vi.fn(),
}));
vi.mock("next/image", () => ({ default: (p: any) => <img {...p} /> }));

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as any).ResizeObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
  }
  (Element.prototype as any).scrollIntoView ??= () => {};
});

import { NodeFieldCombobox } from "./node-field-combobox";

describe("NodeFieldCombobox — chevron affordance (spec B #4)", () => {
  it("renders a chevron, not a pencil", () => {
    const { container } = render(
      <NodeFieldCombobox
        label="Событие"
        value=""
        optionsKey={"eventCatalog" as any}
        isDirty={false}
        onSelect={vi.fn()}
        onAiHandoff={vi.fn()}
      />
    );
    expect(container.querySelector("svg.lucide-chevron-down")).not.toBeNull();
    expect(container.querySelector("svg.lucide-pencil")).toBeNull();
  });
});
```

Run (RED):
```bash
npx vitest run src/sections/campaigns/node-field-combobox.test.tsx
```

**GREEN.** In `src/sections/campaigns/node-field-combobox.tsx`:
- Line 4: `import { ChevronDown } from "lucide-react";` (replace `Pencil`).
- Line 111: replace `<Pencil aria-hidden className="h-3 w-3 shrink-0" />` with `<ChevronDown aria-hidden className="h-3 w-3 shrink-0" />` (keep the surrounding comment).

Run (GREEN):
```bash
npx vitest run src/sections/campaigns/node-field-combobox.test.tsx
```

### Task 4.3 — `WaitFields` (ModeRow + DurationRow): Pencil → ChevronDown

**RED.** New file `src/sections/campaigns/wait-fields.render.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/state/app-state-context", () => ({ useAppDispatch: () => vi.fn() }));

import { WaitFields } from "./wait-fields";

describe("WaitFields — chevron affordance (spec B #4)", () => {
  it("mode + duration rows both show a chevron, no pencil", () => {
    const { container } = render(
      <WaitFields
        nodeId="n1"
        params={{ kind: "wait", mode: "duration", durationHours: 24 }}
        readOnly={false}
        onEventAiHandoff={vi.fn()}
      />
    );
    expect(container.querySelectorAll("svg.lucide-chevron-down")).toHaveLength(2);
    expect(container.querySelector("svg.lucide-pencil")).toBeNull();
  });
});
```

Run (RED):
```bash
npx vitest run src/sections/campaigns/wait-fields.render.test.tsx
```

**GREEN.** In `src/sections/campaigns/wait-fields.tsx`:
- Line 3: `import { ChevronDown } from "lucide-react";` (replace `Pencil`).
- Line 176 (ModeRow): `<Pencil …/>` → `<ChevronDown aria-hidden className="h-3 w-3 shrink-0" />`.
- Line 250 (DurationRow): `<Pencil …/>` → `<ChevronDown aria-hidden className="h-3 w-3 shrink-0" />`.

Run (GREEN):
```bash
npx vitest run src/sections/campaigns/wait-fields.render.test.tsx
```

### Task 4.4 — `ScoringRow`: draft → mascot, launched → eye (drop pencil)

**RED.** In `src/sections/campaigns/scoring-row.test.tsx`, add `vi.mock("next/image", () => ({ default: (p: any) => <img {...p} /> }));` near the other mocks (top, after imports), then append two tests inside the existing `describe`:

```tsx
  it("draft: interests/triggers affordance is the mascot, not a pencil", () => {
    const { container, getByRole } = render(<ScoringRow nodeId="n1" params={params} />);
    // draft keeps the «Изменить …» button; icon is the mascot image, no pencil.
    expect(getByRole("button", { name: "Изменить интересы и триггеры" })).not.toBeNull();
    expect(container.querySelector('img[src="/mascot-icon.svg"]')).not.toBeNull();
    expect(container.querySelector("svg.lucide-pencil")).toBeNull();
  });

  it("launched (read-only): interests/triggers affordance is the eye", () => {
    mockReadOnly = true;
    const { container, getByRole } = render(<ScoringRow nodeId="n1" params={params} />);
    expect(getByRole("button", { name: "Показать интересы и триггеры" })).not.toBeNull();
    expect(container.querySelector("svg.lucide-eye")).not.toBeNull();
    expect(container.querySelector("svg.lucide-pencil")).toBeNull();
  });
```

Run (RED):
```bash
npx vitest run src/sections/campaigns/scoring-row.test.tsx
```

**GREEN.** In `src/sections/campaigns/node-card-content.tsx`:
- Line 4: drop `Pencil` from the lucide import → `import { AlertTriangle, Eye, Plus, X } from "lucide-react";` (`Image` from `next/image` is already imported at line 5; `Eye` stays).
- In `ScoringRow`, replace the icon ternary (lines 294-298):
```tsx
          {editable ? (
            <Image src="/mascot-icon.svg" width={14} height={14} alt="" aria-hidden />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
```

Note: after this edit `Pencil` remains referenced by the generic-row `dirtyDot`/icon block? No — the generic manual-field icon is already `mascot` (line 571) and there is no other `Pencil` usage in this file. Confirm with `grep -n "Pencil" src/sections/campaigns/node-card-content.tsx` → expect no matches.

Run (GREEN):
```bash
npx vitest run src/sections/campaigns/scoring-row.test.tsx
npx tsc --noEmit && npm run lint
```

**Commit (Item 4):**
```bash
git add -A && git commit -m "feat(node-card): Pencil→ChevronDown on dropdowns, mascot/eye on scoring (spec B #4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

Visual note: this changes the affordance glyph in three dropdowns and the scoring row. After the whole B branch is green, regenerate node-card snapshots with `npm run test:visual:update` and hand the diff to a human for review — do not commit blind snapshot churn.

---

## Item 5 — Dirty dot → next to the parameter label, behind one shared `<DirtyDot/>`

Presentational only; `dirtyParams` logic (`workflow-view.tsx` + `node-card-content.tsx:428`) is untouched. The dot moves from the col3 affordance cluster into col1, immediately after the label.

### Task 5.1 — Shared `<DirtyDot/>` component

**RED.** New file `src/sections/campaigns/dirty-dot.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DirtyDot } from "./dirty-dot";

describe("DirtyDot", () => {
  it("renders the yellow marker with the RU title", () => {
    const { getByTitle } = render(<DirtyDot />);
    const dot = getByTitle("Параметр изменён");
    expect(dot).toHaveClass("bg-[#FFEC00]", "rounded-full", "shrink-0");
  });
});
```

Run (RED):
```bash
npx vitest run src/sections/campaigns/dirty-dot.test.tsx
```

**GREEN.** New file `src/sections/campaigns/dirty-dot.tsx`:

```tsx
/**
 * Единый индикатор «параметр изменён» (жёлтый круг). Один общий компонент —
 * раньше эта разметка была продублирована 6× в 4 формах (spec B #5). Логика
 * dirtyParams живёт в workflow-view/node-card-content; это чистая презентация.
 */
export function DirtyDot() {
  return (
    <span
      aria-hidden
      title="Параметр изменён"
      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FFEC00]"
    />
  );
}
```

Run (GREEN):
```bash
npx vitest run src/sections/campaigns/dirty-dot.test.tsx
```

### Task 5.2 — Adopt `<DirtyDot/>` in col1 across all six sites

For every row below: (a) import `DirtyDot` from the new file (or `./dirty-dot`), (b) delete the local dot markup/component, (c) wrap the col1 label so the dot sits right after the label text, (d) drop the dot from the col3 affordance cluster.

The col1 wrapper pattern (apply consistently):
```tsx
<span className="flex items-center gap-1.5 text-muted-foreground">
  {label /* or literal label */}
  {isDirty && <DirtyDot />}
</span>
```

**`node-field-combobox.tsx`** — this file has no test asserting dot position; add one first.

**RED.** Append to `src/sections/campaigns/node-field-combobox.test.tsx`:
```tsx
import { within } from "@testing-library/react";
// ... inside describe:
it("dirty dot sits in the label column, not the affordance column (spec B #5)", () => {
  const { getByText, getByTitle } = render(
    <NodeFieldCombobox
      label="Событие" value="" optionsKey={"eventCatalog" as any}
      isDirty onSelect={vi.fn()} onAiHandoff={vi.fn()}
    />
  );
  const labelCell = getByText("Событие").parentElement as HTMLElement;
  expect(within(labelCell).getByTitle("Параметр изменён")).not.toBeNull();
});
```
Run (RED). Then **GREEN** in `node-field-combobox.tsx`:
- Add `import { DirtyDot } from "./dirty-dot";`.
- Replace col1 (line 91) with the wrapper pattern using `{label}`.
- In the col3 span (lines 101-112), remove the `{isDirty && <span … bg-[#FFEC00] …/>}` block, keeping only the `<ChevronDown/>` (from Item 4). `isDirty` is still a prop, now consumed only in col1.

**`node-template-select.tsx`**
**RED.** Append to `node-template-select.test.tsx`:
```tsx
it("dirty dot sits next to the label (spec B #5)", () => {
  const { getByText, getByTitle } = render(
    <NodeTemplateSelect
      label="Шаблон" templates={TPLS} selectedName="" isDirty
      onSelect={vi.fn()} onPreview={vi.fn()} onCreate={vi.fn()}
    />
  );
  const labelCell = getByText("Шаблон").parentElement as HTMLElement;
  expect(within(labelCell).getByTitle("Параметр изменён")).not.toBeNull();
});
```
(Add `import { within } from "@testing-library/react";` if not present.)
**GREEN** in `node-template-select.tsx`:
- Add `import { DirtyDot } from "./dirty-dot";`; delete the local `dirtyDot` const (lines 61-67).
- readOnly branch (line 73) col1 → wrapper pattern with `{label}`; drop `{dirtyDot}` from the col3 span (line 77) → leave `<span className="flex items-center justify-end" />` empty (col3 collapses).
- Trigger branch (line 94) col1 → wrapper pattern; col3 span (lines 104-107) now holds only `<ChevronDown/>` (dot removed).

**`split-fields.tsx`**
**GREEN** (covered by the existing `split-fields.test.tsx`; no new assertion needed here — Item 3 rewrites this file, but keep it consistent now):
- Add `import { DirtyDot } from "./dirty-dot";`; delete the local `DirtyDot()` function (lines 62-70).
- In `AiRow`, both readOnly (line 92) and interactive (line 115) col1 → wrapper pattern with `{label}`; remove `{isDirty && <DirtyDot />}` from the col3 spans (lines 95 / 118), keeping the mascot in the interactive col3.

**`wait-fields.tsx`**
**GREEN** (covered by `wait-fields.render.test.tsx`):
- Add `import { DirtyDot } from "./dirty-dot";`; delete the local `DirtyDot()` (lines 45-53).
- `ModeRow`: readOnly (line 153) + trigger (line 172) col1 → wrapper pattern with literal `"Режим"`; remove dot from col3 (lines 155 / 175).
- `DurationRow`: readOnly (line 211) + trigger (line 244) col1 → wrapper with literal `"Длительность"`; remove dot from col3 (lines 215 / 249).

**`email-field.tsx`**
**GREEN**:
- Add `import { DirtyDot } from "./dirty-dot";`.
- col1 (line 117) → `<span className="flex items-center gap-1.5 text-muted-foreground">Текст{isDirty && <DirtyDot />}</span>`.
- In the col3 span (lines 172-179), remove the inline dot block, keeping the "Открыть" button.

**`node-card-content.tsx`** (generic rows) — delete the `dirtyDot` const (lines 431-437) and move the dot into each col1:
- combo readOnly branch (lines 519-525): col1 → wrapper with `{row.label}` + `{isDirty && <DirtyDot />}`; drop `{dirtyDot}` from col3 (line 524).
- non-interactive branch (lines 576-583): same treatment; col3 (line 581) empty.
- interactive button branch (lines 601-608): col1 wrapper with `{row.label}`; col3 (lines 605-608) keeps `{icon}` only (drop `{dirtyDot}`).
- Add `import { DirtyDot } from "./dirty-dot";`.

Run the full Item-5 surface:
```bash
npx vitest run \
  src/sections/campaigns/dirty-dot.test.tsx \
  src/sections/campaigns/node-field-combobox.test.tsx \
  src/sections/campaigns/node-template-select.test.tsx \
  src/sections/campaigns/split-fields.test.tsx \
  src/sections/campaigns/wait-fields.render.test.tsx \
  src/sections/campaigns/scoring-row.test.tsx
npx tsc --noEmit && npm run lint
```
Expected: all passing, no tsc/lint output. Confirm no orphan dot markup remains:
```bash
grep -rn "bg-\[#FFEC00\]" src/sections/campaigns | grep -v dirty-dot.tsx
```
Expected: no matches.

**Commit (Item 5):**
```bash
git add -A && git commit -m "refactor(node-card): shared DirtyDot next to param label, dedupe 6 copies (spec B #5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

Visual note: the dot changes column across all field types — flag `npm run test:visual:update` for human review.

---

## Item 6 — Preview eye inside the dropdown, before the disclosure chevron

Depends on Item 4 (chevron exists). base-ui `PopoverTrigger` renders a native `<button>`, so the eye **cannot** be a nested `<button>` (invalid HTML). Render it as `role="button"` span inside the trigger's trailing cluster, before the chevron, with `stopPropagation` so it never toggles the popover. Then delete the two external eye buttons in `node-card-content.tsx`.

### Task 6.1 — `NodeTemplateSelect`: eye before the chevron

Pass the selected template id so the internal eye knows what to preview.

**RED.** Append to `node-template-select.test.tsx`:
```tsx
it("shows an eye before the chevron when a template is selected; click previews, no popover (spec B #6)", () => {
  const onPreview = vi.fn();
  const onSelect = vi.fn();
  const { getByRole, container } = render(
    <NodeTemplateSelect
      label="Шаблон" templates={TPLS} selectedName="SMS — напоминание"
      selectedTemplateId="t1" isDirty={false}
      onSelect={onSelect} onPreview={onPreview} onCreate={vi.fn()}
    />
  );
  const eye = getByRole("button", { name: "Предпросмотр" });
  expect(container.querySelector("svg.lucide-eye")).not.toBeNull();
  fireEvent.click(eye);
  expect(onPreview).toHaveBeenCalledWith("t1");
  expect(onSelect).not.toHaveBeenCalled();
});

it("no eye when nothing selected", () => {
  const { queryByRole } = render(
    <NodeTemplateSelect
      label="Шаблон" templates={TPLS} selectedName="" isDirty={false}
      onSelect={vi.fn()} onPreview={vi.fn()} onCreate={vi.fn()}
    />
  );
  expect(queryByRole("button", { name: "Предпросмотр" })).toBeNull();
});
```

Run (RED):
```bash
npx vitest run src/sections/campaigns/node-template-select.test.tsx
```

**GREEN.** In `node-template-select.tsx`:
- Add `selectedTemplateId?: string;` to the props type (near `selectedName`, line 44) and destructure it.
- Define a reusable eye span:
```tsx
  const previewEye = selectedTemplateId ? (
    <span
      role="button"
      tabIndex={0}
      aria-label="Предпросмотр"
      title="Предпросмотр"
      className="nodrag inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none"
      onClick={(e) => {
        e.stopPropagation();
        onPreview(selectedTemplateId);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onPreview(selectedTemplateId);
        }
      }}
    >
      <Eye aria-hidden className="h-3.5 w-3.5" />
    </span>
  ) : null;
```
- readOnly branch col3 (line 77): render `{previewEye}` (preserves the currently-available read-only template preview).
- Trigger branch col3 (lines 104-107): `{previewEye}` before `<ChevronDown … />`.

Run (GREEN):
```bash
npx vitest run src/sections/campaigns/node-template-select.test.tsx
```

### Task 6.2 — `NodeFieldCombobox`: optional eye (IVR only) before the chevron

Gate purely on the presence of an `onPreview` prop (no separate flag) — only IVR passes it.

**RED.** Append to `node-field-combobox.test.tsx`:
```tsx
it("shows an eye before the chevron only when onPreview is provided; click previews, no popover (spec B #6)", () => {
  const onPreview = vi.fn();
  const onSelect = vi.fn();
  const { getByRole } = render(
    <NodeFieldCombobox
      label="Текст" value="Сценарий" optionsKey={"eventCatalog" as any}
      isDirty={false} onSelect={onSelect} onAiHandoff={vi.fn()} onPreview={onPreview}
    />
  );
  fireEvent.click(getByRole("button", { name: "Предпросмотр" }));
  expect(onPreview).toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
});

it("no eye without onPreview (sms Время / condition / wait etc.)", () => {
  const { queryByRole } = render(
    <NodeFieldCombobox
      label="Время" value="" optionsKey={"eventCatalog" as any}
      isDirty={false} onSelect={vi.fn()} onAiHandoff={vi.fn()}
    />
  );
  expect(queryByRole("button", { name: "Предпросмотр" })).toBeNull();
});
```
(Add `fireEvent` to the `@testing-library/react` import.)

Run (RED):
```bash
npx vitest run src/sections/campaigns/node-field-combobox.test.tsx
```

**GREEN.** In `node-field-combobox.tsx`:
- Add `Eye` to the lucide import (line 4): `import { ChevronDown, Eye } from "lucide-react";`.
- Add `onPreview?: () => void;` to the props type (after `onAiHandoff`, line 51) and destructure it.
- In the col3 span (lines 101-113, now holding only `<ChevronDown/>` after Item 5), add the eye before the chevron:
```tsx
        <span className="ml-1 flex shrink-0 items-center gap-1.5 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground">
          {onPreview && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Предпросмотр"
              title="Предпросмотр"
              className="nodrag inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none"
              onClick={(e) => { e.stopPropagation(); onPreview(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault(); e.stopPropagation(); onPreview();
                }
              }}
            >
              <Eye aria-hidden className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown aria-hidden className="h-3 w-3 shrink-0" />
        </span>
```

Run (GREEN):
```bash
npx vitest run src/sections/campaigns/node-field-combobox.test.tsx
```

### Task 6.3 — Wire the eyes in `node-card-content.tsx`; remove the two external eye buttons

In `node-card-content.tsx`:

- **Template branch** (lines 469-512): pass `selectedTemplateId={selected?.id}` to `<NodeTemplateSelect …/>` and collapse the wrapping `<div className="flex items-center gap-1">` + external eye `<button>` (lines 497-510) back to a single row. Result:
```tsx
              return (
                <NodeTemplateSelect
                  key={row.label}
                  label={row.label}
                  templates={opts}
                  selectedName={selected?.name ?? ""}
                  selectedTemplateId={selected?.id}
                  isDirty={isDirty}
                  readOnly={readOnly}
                  onSelect={(t) => {
                    const next = (t.content as Record<string, unknown>)[paramKey];
                    applyFieldValue(paramKey, typeof next === "string" ? next : t.name);
                  }}
                  onPreview={(templateId) => openTemplatePreview(templateId)}
                  onCreate={() => { if (channel) openTemplateCreate(channel); }}
                />
              );
```

- **IVR combo branch** (lines 542-560): drop the wrapping `<div className="flex items-center gap-1">` + external eye `<button>`; instead pass `onPreview` into the combobox. Rebuild `combo` (lines 529-538) to include the preview callback only for IVR:
```tsx
              const combo = (
                <NodeFieldCombobox
                  key={row.label}
                  label={row.label}
                  value={rawValue}
                  optionsKey={meta.optionsKey}
                  isDirty={isDirty}
                  onSelect={(next) => applyFieldValue(paramKey, next)}
                  onAiHandoff={() => handleAiField(row.label)}
                  onPreview={
                    data.params?.kind === "ivr"
                      ? () =>
                          openTemplatePreview(
                            ivrNodePreviewTemplate(id, data.params as Extract<NodeParams, { kind: "ivr" }>)
                          )
                      : undefined
                  }
                />
              );
              return combo;
```
Delete the now-dead `if (data.params?.kind === "ivr") { … }` block (lines 542-561) and the `<Fragment>` wrapper (line 564) — `combo` already carries `key`.

Read-only note: read-only template preview stays available (handled inside `NodeTemplateSelect`). Read-only IVR keeps its current behaviour (the combo read-only branch at lines 517-526 returns a plain row and never mounts the combobox, so no eye — unchanged; DOM churn is confined to the IVR editable branch, as the spec requires).

Verify no external eye buttons remain in that file:
```bash
grep -n "aria-label=\"Предпросмотр\"" src/sections/campaigns/node-card-content.tsx
```
Expected: no matches (eyes now live in the child components).

Run:
```bash
npx vitest run \
  src/sections/campaigns/node-template-select.test.tsx \
  src/sections/campaigns/node-field-combobox.test.tsx \
  src/sections/campaigns/scoring-row.test.tsx
npx tsc --noEmit && npm run lint
```

**Commit (Item 6):**
```bash
git add -A && git commit -m "feat(node-card): preview eye inside dropdown before chevron (spec B #6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

Visual note: template/IVR trailing cluster changes — flag `npm run test:visual:update` for human review.

---

## Task R — Rebase on A (checkpoint; do NOT proceed to Items 3/9 before this is green)

Items 3, 9 and the `PARAM_RENDERERS` reconciliation import symbols A owns. Once A is merged into `integration`:

```bash
git fetch origin
git rebase integration          # or: git rebase origin/integration
```
Resolve any conflicts (B's regions in `node-card-content.tsx` are the affordance/render blocks; A's are the `PARAM_RENDERERS.merge`→`statistics` line and type changes — resolved in Task P). After rebasing, `node-card-content.tsx` will fail to compile because `NodeParams["kind"]` no longer includes `merge` and now includes `statistics`:
```bash
npx tsc --noEmit    # EXPECT errors on PARAM_RENDERERS: missing 'statistics', excess 'merge'
```
Confirm A's exports now exist:
```bash
grep -n "export function splitSummary" src/state/split-segments.ts
grep -n "export function isDeletableNodeType" src/state/structural-commands.ts
grep -n "statistics" src/types/workflow.ts
```
All three must return matches before continuing. Do Task P immediately after the rebase to restore a compiling tree, then Items 3 and 9.

---

## Task P — `PARAM_RENDERERS` reconciliation (merge → statistics)

The single A↔B coupling in `node-card-content.tsx`. In `PARAM_RENDERERS` (line 30-92):
- **Delete** `merge: () => [],` (line 82).
- **Add** `statistics: () => [],` (A added `statistics` to `NodeParams` with no params — footprint symmetric to the removed `merge`).

Run:
```bash
npx tsc --noEmit && npm run lint
npx vitest run src/sections/campaigns
```
Expected: clean. (No dedicated test — this is an exhaustive-map compile fix; `tsc` is the gate. If A shipped a `state/node-*` snapshot test that renders a statistics node, it will exercise the empty renderer.)

**Commit:**
```bash
git add -A && git commit -m "fix(node-card): drop merge renderer, add statistics after rebase on A (spec B)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Item 3 — Splitter parameters collapse into one "Ветвление" affordance (post-A)

Uses A's `splitSummary(params)` from `src/state/split-segments.ts` (import; do not duplicate). The `by`/`branches` model fields stay; only the card UI collapses two rows into one that opens the AI drawer and shows the same summary as the node subtitle.

**RED.** Replace `src/sections/campaigns/split-fields.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { SplitFields } from "./split-fields";
import type { SplitParams } from "@/types/workflow";

vi.mock("@/state/split-segments", () => ({
  splitSegmentBranches: () => [],
  splitSummary: (p: SplitParams) =>
    p.by === "segment" ? "По сегменту · 4 веток" : `Поровну · ${p.branches}`,
}));
vi.mock("next/image", () => ({ default: () => null }));

const params: SplitParams = { kind: "split", by: "equal", branches: 2 };

describe("SplitFields — одна строка «Ветвление» (spec B #3)", () => {
  it("renders a single «Ветвление» AI affordance; click hands off to AI", () => {
    const onAiHandoff = vi.fn();
    const { getByLabelText, queryByLabelText } = render(
      <SplitFields params={params} readOnly={false} onAiHandoff={onAiHandoff} />
    );
    // Old two-row layout is gone.
    expect(queryByLabelText("Настроить «По» с помощью ИИ")).toBeNull();
    expect(queryByLabelText("Настроить «Ветки» с помощью ИИ")).toBeNull();
    getByLabelText("Настроить «Ветвление» с помощью ИИ").click();
    expect(onAiHandoff).toHaveBeenCalled();
  });

  it("summary comes from splitSummary (matches the node subtitle)", () => {
    const { getByText, rerender } = render(
      <SplitFields params={params} readOnly onAiHandoff={vi.fn()} />
    );
    getByText("Поровну · 2");
    rerender(
      <SplitFields
        params={{ kind: "split", by: "segment", branches: 0 }}
        readOnly
        onAiHandoff={vi.fn()}
      />
    );
    getByText("По сегменту · 4 веток");
  });

  it("no affordance button in read-only", () => {
    const { queryByLabelText } = render(
      <SplitFields params={params} readOnly onAiHandoff={vi.fn()} />
    );
    expect(queryByLabelText("Настроить «Ветвление» с помощью ИИ")).toBeNull();
  });
});
```

Run (RED):
```bash
npx vitest run src/sections/campaigns/split-fields.test.tsx
```

**GREEN.** Rewrite `src/sections/campaigns/split-fields.tsx` to a single `AiRow`:

```tsx
"use client";

import Image from "next/image";
import { splitSummary } from "@/state/split-segments";
import type { SplitParams } from "@/types/workflow";
import { DirtyDot } from "./dirty-dot";
import { cn } from "@/lib/utils";

const rowGrid =
  "grid grid-cols-[minmax(72px,max-content)_1fr_auto] items-center gap-x-2.5 text-[11px]";

/**
 * Сплиттер (spec B #3): одна строка-аффорданс «Ветвление». Клик открывает
 * ИИ-дровер (тот же handleSplitAiField). Значение — splitSummary(params),
 * совпадает с подзаголовком узла. Поля by/branches в модели остаются.
 */
export function SplitFields({
  params,
  dirtyParams,
  readOnly,
  onAiHandoff,
}: {
  params: SplitParams;
  dirtyParams?: string[];
  readOnly: boolean;
  onAiHandoff: () => void;
}) {
  const value = splitSummary(params);
  const isDirty =
    (dirtyParams?.includes("by") || dirtyParams?.includes("branches")) ?? false;

  if (readOnly) {
    return (
      <div className={cn(rowGrid, "px-1 py-0.5")}>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          Ветвление
          {isDirty && <DirtyDot />}
        </span>
        <span className="truncate text-foreground">{value}</span>
        <span />
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label="Настроить «Ветвление» с помощью ИИ"
      onClick={(e) => {
        e.stopPropagation();
        onAiHandoff();
      }}
      className={cn(
        rowGrid,
        "group nodrag w-full rounded px-1 py-0.5 text-left transition-colors",
        "hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
      )}
    >
      <span className="flex items-center gap-1.5 text-muted-foreground">
        Ветвление
        {isDirty && <DirtyDot />}
      </span>
      <span className="truncate text-foreground">{value}</span>
      <span className="ml-1 flex shrink-0 items-center gap-1.5">
        <Image
          src="/mascot-icon.svg"
          width={14}
          height={14}
          alt=""
          aria-hidden
          className="opacity-70 transition-opacity group-hover:opacity-100"
        />
      </span>
    </button>
  );
}
```

Update the caller in `node-card-content.tsx`:
- `handleSplitAiField` (lines 364-367): change to take no field and use a single "Ветвление" chip label:
```tsx
  function handleSplitAiField() {
    handleAiField("Ветвление");
    openSidebar();
  }
```
- The `SplitFields` usage (lines 386-393): `onAiHandoff={handleSplitAiField}` (now `() => void` — already matches).

Run (GREEN):
```bash
npx vitest run src/sections/campaigns/split-fields.test.tsx
npx tsc --noEmit && npm run lint
```

**Commit (Item 3):**
```bash
git add -A && git commit -m "feat(node-card): collapse splitter into one «Ветвление» row via splitSummary (spec B #3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

Visual note: splitter card goes from two rows to one — flag `npm run test:visual:update` for human review.

---

## Item 9 — Delete-node button with inline confirm (post-A)

Uses A's `isDeletableNodeType(type)` from `structural-commands.ts` for visibility. Deletion reuses `dispatch({ type: "workflow_structural_commands_submit", ops: [{ kind: "remove", ref: id }] })`; `applyRemove` already reconnects edges. The backend guard for `scoring`/`statistics` lives in A's `applyRemove`; B relies on it as the source of truth (the UI gate and the guard share the `isDeletableNodeType` list).

**RED.** Extend `src/sections/campaigns/workflow-node.test.tsx` (created in Task 2.3). Add a second `describe`:

```tsx
describe("WorkflowNodeComponent — delete node (spec B #9)", () => {
  beforeEach(() => {
    dispatch.mockClear();
    removeChipsForNode.mockClear();
  });

  it("deletable type: trash button present, two-step confirm dispatches remove", () => {
    renderNode(sms); // nodeType "sms"
    const trash = screen.getByRole("button", { name: "Удалить узел" });
    fireEvent.click(trash);
    // First click arms the confirm; nothing dispatched yet.
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "workflow_structural_commands_submit" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить удаление узла" }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "workflow_structural_commands_submit",
      ops: [{ kind: "remove", ref: "n1" }],
    });
  });

  it("non-deletable type (scoring): no trash button", () => {
    renderNode({ label: "Скоринг", nodeType: "scoring",
      params: { kind: "scoring", interests: [], triggers: [], files: [] } });
    expect(screen.queryByRole("button", { name: "Удалить узел" })).toBeNull();
  });
});
```

Note: this test imports the real `isDeletableNodeType` (post-A) transitively through `workflow-node.tsx`. `structural-commands.ts` has no React deps, so no mock is needed; `sms` is deletable, `scoring` is not.

Run (RED):
```bash
npx vitest run src/sections/campaigns/workflow-node.test.tsx
```

**GREEN.** In `src/sections/campaigns/workflow-node.tsx`:
1. Imports:
```ts
import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { isDeletableNodeType } from "@/state/structural-commands";
```
2. Inside the component, after `const { removeChipsForNode } = usePromptChips();`:
```ts
  const [confirmDelete, setConfirmDelete] = useState(false);
```
3. In the header actions cluster (the `<div className="flex items-start gap-2">` around the X button, lines 113-125), render the trash **before** the X, gated on type and selection:
```tsx
        {selected && isDeletableNodeType(data.nodeType) && (
          <button
            type="button"
            aria-label={confirmDelete ? "Подтвердить удаление узла" : "Удалить узел"}
            title={confirmDelete ? "Подтвердить удаление" : "Удалить узел"}
            onClick={(e) => {
              e.stopPropagation();
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              // Реконнект рёбер делает applyRemove — не дублируем.
              dispatch({
                type: "workflow_structural_commands_submit",
                ops: [{ kind: "remove", ref: id }],
              });
            }}
            className={
              "nodrag -mt-1 rounded-md p-1 opacity-70 hover:opacity-100 " +
              (confirmDelete
                ? "bg-red-500/20 text-red-300"
                : "text-muted-foreground hover:bg-accent hover:text-foreground")
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
```
4. Reset the confirm state when the card collapses/toggles so a stale armed state can't leak. Extend the existing select effect (line 31-33):
```ts
  useEffect(() => {
    updateNodeInternals(id);
    if (!selected) setConfirmDelete(false);
  }, [selected, id, updateNodeInternals]);
```

Run (GREEN):
```bash
npx vitest run src/sections/campaigns/workflow-node.test.tsx
npx tsc --noEmit && npm run lint
```

**Commit (Item 9):**
```bash
git add -A && git commit -m "feat(node-card): inline-confirm delete-node button gated by isDeletableNodeType (spec B #9)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

Visual note: the expanded card header gains a trash button for deletable types — flag `npm run test:visual:update` for human review.

---

## Task F — Finalize

Full guardrail sweep from `.worktrees/spec-b`:

```bash
npx vitest run
npx tsc --noEmit
npm run lint
```
Expected: all test files pass, no tsc output, no lint output.

Visual regression (human-gated — do not blind-commit): after the branch is green, regenerate node-card visual snapshots and open the diff for a person to approve. Items 4, 5, 6, 3, 9 all alter the expanded node card:
```bash
npm run test:visual:update    # review the produced snapshot diffs before committing
```
If the diffs look correct, commit them separately:
```bash
git add -A && git commit -m "test(visual): refresh node-card snapshots for spec B ui changes (reviewed)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

Report the worktree path (`.worktrees/spec-b`) and branch (`feature/spec-b-node-card-ui`) back to the user. Cleanup (`git worktree remove`, branch delete) is the user's call. Merge order remains A → **B** → C.

---

## Acceptance criteria → tasks

**Item 2**
- [ ] Every `removable` tag in the composer has a × that removes exactly that tag → Task 2.2 (`chip-editable-input.dom.test.tsx`).
- [ ] Closing the node removes `node_${id}` + all `nodefield_${id}_*`; other nodes untouched → Tasks 2.1 (reducer + edge case n1/n10) + 2.3 (`workflow-node.test.tsx`).

**Item 3**
- [ ] Splitter card shows one "Ветвление" AI row opening the AI drawer → Task 3.
- [ ] Summary comes from `splitSummary` and matches the node subtitle → Task 3.

**Item 4**
- [ ] Three dropdowns show `ChevronDown`, not `Pencil` → Tasks 4.1 / 4.2 / 4.3.
- [ ] "Интересы и триггеры": draft → mascot, launched → eye, no pencil → Task 4.4.

**Item 5**
- [ ] Dirty dot sits next to the parameter name (col1), not the value, in every field type → Task 5.2 (assertions on combobox + template-select; grep confirms no orphan markup).
- [ ] One shared `<DirtyDot/>`; `dirtyParams` logic unchanged → Tasks 5.1 + 5.2.

**Item 6**
- [ ] Template/IVR dropdown shows the eye immediately before the chevron → Tasks 6.1 / 6.2.
- [ ] Clicking the eye previews without opening the list → Tasks 6.1 / 6.2 (`onSelect` not called).
- [ ] Fields without preview have no eye; sms "Время"/condition/wait/success/end have none → Task 6.2 ("no eye without onPreview") + 6.3 (only IVR passes `onPreview`).

**Item 9**
- [ ] Deletable types show a trash with confirm; node + edges removed, graph stays connected via reconnect → Task 9 + existing `applyRemove`.
- [ ] Non-deletable types (`source`, `scoring`, `success`, `end`, `statistics`) show no trash → Task 9 (scoring case) + `isDeletableNodeType`.
- [ ] Button visibility and backend guard share `isDeletableNodeType` → Task 9 (import) + A's guard.

---

## Self-review

- **Spec coverage:** Items 2, 3, 4, 5, 6, 9 each have a dedicated task block with RED test + GREEN implementation + commit. No spec item is dropped.
- **No placeholders:** every test and implementation snippet is real code grounded in the actual files read (line numbers verified against this worktree, which is level with `integration` — `git rev-list --count HEAD..integration` = 0).
- **A-dependency handling:** Items 3, 9, and the `merge→statistics` reconciliation are placed strictly after Task R (rebase on A) and import A's real symbols (`splitSummary`, `isDeletableNodeType`, `statistics`), which are confirmed absent pre-A. Items 2/4/5/6 carry no A-dependency and run first.
- **Internal dependency:** Item 4 precedes Item 6 (chevron before eye).
- **Name consistency:** `DirtyDot` (component + file `dirty-dot.tsx`), `removeChipsForNode` (reducer action `removeForNode` + API method), `isDeletableNodeType` (A import), `splitSummary` (A import), `onPreview` (prop on both `NodeTemplateSelect` and `NodeFieldCombobox`) — used identically in every task.
- **HTML validity:** the preview eye is `role="button"` (not `<button>`) to avoid nesting inside base-ui's native-button `PopoverTrigger`; tests still query it by `role="button"`.
- **Visual snapshots:** every UI-altering item flags `npm run test:visual:update` for human review rather than blind acceptance.

### Critical Files for Implementation
- /Users/macintosh/Documents/work/afina-ai-first_campaing-centric/.worktrees/spec-audit/src/sections/campaigns/node-card-content.tsx
- /Users/macintosh/Documents/work/afina-ai-first_campaing-centric/.worktrees/spec-audit/src/sections/campaigns/workflow-node.tsx
- /Users/macintosh/Documents/work/afina-ai-first_campaing-centric/.worktrees/spec-audit/src/components/ai-elements/chip-editable-input.tsx
- /Users/macintosh/Documents/work/afina-ai-first_campaing-centric/.worktrees/spec-audit/src/state/prompt-chips-context.tsx
- /Users/macintosh/Documents/work/afina-ai-first_campaing-centric/.worktrees/spec-audit/src/sections/campaigns/split-fields.tsx