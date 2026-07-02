# Карточки шаблонов и переименование — Implementation Plan

## Goal

Block 2 of the AIM batch decomposition (spec: `docs/superpowers/specs/2026-06-23-aim-batch-decomposition-design.md`, «Блок 2»). Three changes to the Артефакты → Шаблоны UI:

- **Edit 6** — remove the «Использовать в новой кампании» button from `TemplateCard`, and clean up the now-unused `onUseInNewCampaign` prop wiring.
- **Edit 7** — move the usage count up next to the template name/type and render it inside a **grey** chip reading «Использовано N раз» (correctly pluralized).
- **Rename** — allow inline renaming of a template's `name` in the Артефакты section, dispatching a new `template_renamed` reducer action.

All UI strings are **Russian only**. The yellow brand accent is **never** used here (PRODUCT.md: yellow is a rare signal). The usage chip is neutral/grey.

## Shared contract with Block 5 — `MessageTemplate.name`

`MessageTemplate` (`src/state/app-state.ts:93-99`) **already has** a `name: string` field:

```ts
export type MessageTemplate = {
  id: string;
  channel: Channel;
  name: string;
  content: NodeParams;
  usedInCampaigns: number;
};
```

The rename feature **mutates** this existing field; it does **not** add a new field. Block 5 reads templates by `name` (template-select filtered by channel), so the contract is: **`name` stays a required, non-empty `string` on every `MessageTemplate`.** The `template_renamed` action MUST NOT blank or remove it — the reducer trims and ignores empty input (Task 5) so Block 5 never sees an empty name. No structural change to the shape; both blocks can proceed in parallel against this type.

## Worktree setup (AGENTS.md)

This block runs in its own worktree off `main` — another agent may be editing the repo concurrently.

```bash
git worktree add .worktrees/block2-cards -b feature/block2-cards main
cd .worktrees/block2-cards
npm install
```

Do all work, commits, tests, and lint **inside** `.worktrees/block2-cards`. Run `npm test` and `npm run lint` there. If you need the dev server and the main checkout already holds port 3000, run `next dev -p 3001`. Report the worktree path + branch back to the user when done; do not push to `main`.

## Test conventions (verified)

- Runner: **Vitest** (`npm test` → `vitest run --passWithNoTests`). Component tests use `@testing-library/react` (`render`, `screen`, `fireEvent`) with `vi.fn()`; files are co-located as `*.test.tsx` / `*.test.ts` next to source. Reducer is the pure exported `appReducer(state, action)` from `src/state/app-state.ts:367`.
- Existing tests for these files: `src/sections/artifacts/template-card.test.tsx`, `src/sections/artifacts/templates-tab.test.tsx`. They currently pass `onUseInNewCampaign={vi.fn()}` and assert on «Использован в кампаниях: 3» and the «Использовать в новой кампании» button — those assertions change in this block (Tasks 1, 3).
- No existing pluralization helper in the repo (searched `src/` for plural/раз/declension — only prose hits). Task 4 adds one.

---

## Task 1 — Remove «Использовать в новой кампании» button + drop `onUseInNewCampaign` from `TemplateCard` (Edit 6)

**Files:**
- `src/sections/artifacts/template-card.test.tsx` (rewrite the two button/prop assertions: existing test `fires onUseInNewCampaign with the template id` at lines 74-81, and the `onUseInNewCampaign={vi.fn()}` prop passed in every `render` at lines 35, 45, 55, 76, 84, 94, 109, 124)
- `src/sections/artifacts/template-card.tsx` (props `TemplateCardProps` 67-75, signature 77-81, button block 124-129; `Send` import line 3, `Button` import line 4, `id` destructure line 82)

### 1a. Write failing test

In `template-card.test.tsx`, delete the `fires onUseInNewCampaign with the template id` test (lines 74-81) and remove the `onUseInNewCampaign={vi.fn()}` prop from **every** `render(<TemplateCard ... />)` call (the prop is being removed). Add a test asserting the button is gone:

```ts
it("does not render a «Использовать в новой кампании» action button", () => {
  render(<TemplateCard template={sms} />);
  expect(
    screen.queryByRole("button", { name: /Использовать в новой кампании/i }),
  ).toBeNull();
});
```

Update the surviving `vi` import only if `vi` becomes unused after deletions (it stays used elsewhere in this file in later tasks; keep it).

### 1b. Run — expect FAIL

`npx vitest run src/sections/artifacts/template-card.test.tsx` — fails to compile/run: `TemplateCard` still requires `onUseInNewCampaign`, and the button still renders.

### 1c. Minimal implementation

In `template-card.tsx`:
- Remove `onUseInNewCampaign: (templateId: string) => void;` from `TemplateCardProps` (line 69).
- Remove `onUseInNewCampaign,` from the destructured signature (line 79).
- Delete the entire button block (lines 124-129):
  ```tsx
  <div className="mt-2 flex items-center justify-end gap-2">
    <Button variant="outline" onClick={() => onUseInNewCampaign(id)}>
      <Send className="h-4 w-4" />
      Использовать в новой кампании
    </Button>
  </div>
  ```
- Remove the now-unused `import { Send } from "lucide-react";` (line 3). Remove `import { Button }` (line 4) **only if** no other `Button` usage remains in the file (it does not — verify). Drop `id` from the `const { ... } = template;` destructure (line 82) if it is no longer referenced after later tasks; for now leave `id` (it is reused by the rename in Task 6 — keep it).

### 1d. Run — expect PASS

`npx vitest run src/sections/artifacts/template-card.test.tsx`

### 1e. Commit

`git commit -am "feat(templates): remove «Использовать в новой кампании» from card (aim #6)"`

---

## Task 2 — Drop unused `onUseInNewCampaign` from `TemplatesTabView` / `TemplatesTab` (Edit 6 cleanup)

After Task 1 the prop is unused everywhere (verified: only consumers were `template-card.tsx` + `templates-tab.tsx` + their tests). `chat.openTemplateDrawer()` is still used by `onCreateManual`, so the `useChat()` hook stays.

**Files:**
- `src/sections/artifacts/templates-tab.test.tsx` (remove `onUseInNewCampaign={vi.fn()}` at lines 34, 49)
- `src/sections/artifacts/templates-tab.tsx` (`TemplatesTabViewProps` 11-15, destructure 18-22, `<TemplateCard>` props 36-41, `TemplatesTab` body 48-64)

### 2a. Write failing test

In `templates-tab.test.tsx`, remove `onUseInNewCampaign={vi.fn()}` from both `render(<TemplatesTabView ... />)` calls (lines 34, 49). This makes the test files reflect the new prop shape; TypeScript/Vitest will fail while the prop is still declared as required-but-passed-nowhere only after the component changes — so this task is a compile-alignment task. Keep the existing assertions (empty state, one card per template, manual-create control) unchanged.

### 2b. Run — expect FAIL

`npx vitest run src/sections/artifacts/templates-tab.test.tsx` — fails because `TemplatesTabView` still declares/forwards `onUseInNewCampaign` to `TemplateCard`, which no longer accepts it (type error from Task 1).

### 2c. Minimal implementation

In `templates-tab.tsx`:
- Remove `onUseInNewCampaign: (templateId: string) => void;` from `TemplatesTabViewProps` (line 13).
- Remove `onUseInNewCampaign,` from the destructure (line 20).
- Remove the `onUseInNewCampaign={onUseInNewCampaign}` prop from `<TemplateCard>` (line 40).
- In `TemplatesTab` (48-65): remove the `onUseInNewCampaign={openDrawer}` prop (line 61). Keep `onCreateManual={openDrawer}` and the `openDrawer`/`chat` wiring. Update the stale comment block at lines 52-53 to drop the «Использовать в кампании» line.

### 2d. Run — expect PASS

`npx vitest run src/sections/artifacts/templates-tab.test.tsx`

### 2e. Commit

`git commit -am "refactor(templates): drop unused onUseInNewCampaign prop wiring (aim #6)"`

---

## Task 3 — Move usage count into a grey chip «Использовано N раз» next to name/type (Edit 7)

The chip sits in **Row 1**, on the same line as the channel chip (next to name/type), and replaces the standalone `<p>Использован в кампаниях: {usedInCampaigns}</p>` at lines 120-122. It uses the **same pill shape** as the channel chip (107-112) but **neutral/grey** colors, not the accent-derived `nodeStyle` colors. Pluralization comes from Task 4's helper — implement Task 4 first if doing strictly bottom-up, or stub the string here and wire the helper in Task 4. This plan keeps Task 4 (helper) as a separate small unit; Task 3 references `pluralizeRaz` and Task 4 supplies it. **Do Task 4 before 3c.**

**Files:**
- `src/sections/artifacts/template-card.test.tsx` (replace the `shows channel label, name and usage count` assertion at lines 34-41)
- `src/sections/artifacts/template-card.tsx` (chip style 89-100, Row 1 block 107-112, usage `<p>` 120-122)

### 3a. Write failing test

In `template-card.test.tsx` replace the usage-count assertion (the `/Использован в кампаниях: 3/` matcher at lines 38-40) with the new chip text, and add a grey-styling assertion. `sms` fixture has `usedInCampaigns: 3`:

```ts
it("shows channel label, name and a grey usage chip «Использовано N раз»", () => {
  render(<TemplateCard template={sms} />);
  expect(screen.getByText("SMS")).toBeInTheDocument();
  expect(screen.getByText("SMS — напоминание")).toBeInTheDocument();
  expect(screen.getByText("Использовано 3 раза")).toBeInTheDocument();
});

it("usage chip is neutral/grey, not the accent or channel color", () => {
  const { container } = render(<TemplateCard template={sms} />);
  const usageChip = container.querySelector("[data-usage-chip]") as HTMLElement;
  expect(usageChip).not.toBeNull();
  expect(usageChip.textContent).toContain("Использовано 3 раза");
  // grey chip must NOT reuse the channel node color (sms accent)
  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${r}, ${g}, ${b})`;
  };
  expect(usageChip.style.color).not.toBe(hexToRgb(NODE_STYLES.sms.color));
});
```

Also update the `email` fixture-based test usage if any assertion referenced the old string (none do beyond 34-41). The push/ivr fixtures use `usedInCampaigns: 0` → covered by Task 4's «0 раз» case.

### 3b. Run — expect FAIL

`npx vitest run src/sections/artifacts/template-card.test.tsx` — fails: text «Использовано 3 раза» absent, no `[data-usage-chip]` element.

### 3c. Minimal implementation (after Task 4)

In `template-card.tsx`:
- Import the helper: `import { pluralizeRaz } from "@/lib/pluralize";` (path per Task 4).
- Add a neutral grey chip style next to `chipStyle` (89-100), reusing the same geometry (radius/padding/font) but Tailwind grey tokens instead of node colors. Prefer a className using existing tokens over inline node colors:
  ```tsx
  // grey usage chip — same pill geometry as the channel chip, neutral tokens.
  // Never the yellow accent (PRODUCT.md): use muted/border tokens.
  ```
  Render it inside Row 1 alongside the channel chip (wrap both in a flex row so they sit on the same line as name/type):
  ```tsx
  {/* Row 1: channel chip + grey usage chip on one line */}
  <div className="flex flex-wrap items-center gap-1.5">
    <span style={chipStyle} data-channel={channel}>
      {CHANNEL_LABEL[channel]}
    </span>
    <span
      data-usage-chip
      className="inline-block rounded-full border border-border bg-muted px-2 py-px text-[0.65rem] font-medium leading-[1.4] tracking-[0.02em] text-muted-foreground"
    >
      Использовано {pluralizeRaz(usedInCampaigns)}
    </span>
  </div>
  ```
  Note: `pluralizeRaz(n)` returns the full `"N раз/раза"` string including the number (see Task 4) — so the literal is `Использовано {pluralizeRaz(usedInCampaigns)}`.
- Delete the old standalone usage `<p>` (lines 120-122).

### 3d. Run — expect PASS

`npx vitest run src/sections/artifacts/template-card.test.tsx`

### 3e. Commit

`git commit -am "feat(templates): grey «Использовано N раз» chip next to name (aim #7)"`

---

## Task 4 — Russian plural helper `pluralizeRaz`

No plural util exists in the repo. Add a tiny, tested helper. Russian rule for «раз»: `1 раз`, `2/3/4 раза`, `0/5..20 раз`, `21 раз`, `22 раза`, `25 раз` (standard one/few/many with the 11-14 exception).

**Files:**
- `src/lib/pluralize.test.ts` (new)
- `src/lib/pluralize.ts` (new)

### 4a. Write failing test

`src/lib/pluralize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pluralizeRaz } from "./pluralize";

describe("pluralizeRaz", () => {
  it("одна форма: 1 раз, 21 раз, 101 раз", () => {
    expect(pluralizeRaz(1)).toBe("1 раз");
    expect(pluralizeRaz(21)).toBe("21 раз");
    expect(pluralizeRaz(101)).toBe("101 раз");
  });
  it("малая форма: 2/3/4 раза, 22 раза", () => {
    expect(pluralizeRaz(2)).toBe("2 раза");
    expect(pluralizeRaz(3)).toBe("3 раза");
    expect(pluralizeRaz(4)).toBe("4 раза");
    expect(pluralizeRaz(22)).toBe("22 раза");
  });
  it("многая форма: 0, 5..20, 11-14 раз", () => {
    expect(pluralizeRaz(0)).toBe("0 раз");
    expect(pluralizeRaz(5)).toBe("5 раз");
    expect(pluralizeRaz(11)).toBe("11 раз");
    expect(pluralizeRaz(12)).toBe("12 раз");
    expect(pluralizeRaz(14)).toBe("14 раз");
    expect(pluralizeRaz(20)).toBe("20 раз");
    expect(pluralizeRaz(25)).toBe("25 раз");
  });
});
```

### 4b. Run — expect FAIL

`npx vitest run src/lib/pluralize.test.ts` — module does not exist.

### 4c. Minimal implementation

`src/lib/pluralize.ts`:

```ts
/**
 * Russian count of «раз» (template-usage count).
 * one  → раз   (1, 21, 31… but not 11)
 * few  → раза  (2-4, 22-24… but not 12-14)
 * many → раз   (0, 5-20, …)
 */
export function pluralizeRaz(n: number): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  let word: string;
  if (mod10 === 1 && mod100 !== 11) word = "раз";
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = "раза";
  else word = "раз";
  return `${n} ${word}`;
}
```

### 4d. Run — expect PASS

`npx vitest run src/lib/pluralize.test.ts`

### 4e. Commit

`git commit -am "feat(lib): pluralizeRaz Russian declension helper (aim #7)"`

---

## Task 5 — `template_renamed` reducer action (id, name)

Add a new action mirroring `template_added`'s existing style. Verified shapes:
- Action union member style: `src/state/app-state.ts:329` → `| { type: "template_added"; template: MessageTemplate };`
- Reducer case: `src/state/app-state.ts:1042-1047`.
- Reducer is the exported pure `appReducer(state, action)` (line 367).

**Files:**
- `src/state/app-state.test.ts` (new — co-located reducer test; none exists yet for this reducer)
- `src/state/app-state.ts` (Action union — add member right after line 329; reducer case — add right after the `template_added` case ends at line 1047, before the `PARALLEL-WORKTREE INSERTION POINT` comment at 1048)

### 5a. Write failing test

`src/state/app-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { appReducer, initialState, type MessageTemplate } from "./app-state";

const base: MessageTemplate = {
  id: "tpl_x",
  channel: "sms",
  name: "Старое имя",
  content: { kind: "sms", text: "t", alphaName: "AFINA", scheduledAt: "immediate" },
  usedInCampaigns: 2,
};

describe("appReducer — template_renamed", () => {
  it("renames the matching template by id, preserving other fields", () => {
    const state = { ...initialState, templates: [base] };
    const next = appReducer(state, {
      type: "template_renamed",
      id: "tpl_x",
      name: "Новое имя",
    });
    const t = next.templates.find((x) => x.id === "tpl_x")!;
    expect(t.name).toBe("Новое имя");
    expect(t.channel).toBe("sms");
    expect(t.usedInCampaigns).toBe(2);
    expect(t.content).toBe(base.content);
  });

  it("trims surrounding whitespace", () => {
    const state = { ...initialState, templates: [base] };
    const next = appReducer(state, {
      type: "template_renamed",
      id: "tpl_x",
      name: "  Имя  ",
    });
    expect(next.templates[0].name).toBe("Имя");
  });

  it("ignores empty/whitespace-only names (name contract for Block 5)", () => {
    const state = { ...initialState, templates: [base] };
    const next = appReducer(state, {
      type: "template_renamed",
      id: "tpl_x",
      name: "   ",
    });
    expect(next).toBe(state); // unchanged — never blanks the name
  });

  it("is a no-op for an unknown id", () => {
    const state = { ...initialState, templates: [base] };
    const next = appReducer(state, {
      type: "template_renamed",
      id: "nope",
      name: "X",
    });
    expect(next.templates).toEqual([base]);
  });
});
```

### 5b. Run — expect FAIL

`npx vitest run src/state/app-state.test.ts` — `template_renamed` not in the `Action` union (type error) and no reducer case.

### 5c. Minimal implementation

In the `Action` union, immediately after line 329:

```ts
  | { type: "template_renamed"; id: string; name: string };
```

In `appReducer`, add a case right after the `template_added` case (after line 1047), before the `PARALLEL-WORKTREE INSERTION POINT` comment:

```ts
    case "template_renamed": {
      // Rename a template by id. Trim and ignore empty input so the
      // `name` field stays a non-empty string (contract shared with Block 5,
      // which looks templates up by name).
      const name = action.name.trim();
      if (!name) return state;
      if (!state.templates.some((t) => t.id === action.id)) return state;
      return {
        ...state,
        templates: state.templates.map((t) =>
          t.id === action.id ? { ...t, name } : t
        ),
      };
    }
```

### 5d. Run — expect PASS

`npx vitest run src/state/app-state.test.ts`

### 5e. Commit

`git commit -am "feat(state): template_renamed action (id, name) (aim rename)"`

---

## Task 6 — Inline rename of template name in `TemplateCard`

Add a pencil-triggered inline edit of the name (Row 2). Default render = name text + a small pencil button (`Pencil` from `lucide-react`). Clicking the pencil swaps in an `<input>` (controlled), confirmed on Enter / blur, cancelled on Escape. On confirm, call a new `onRename(id, name)` callback. `TemplatesTab` wires it to `dispatch({ type: "template_renamed", ... })` via `useAppDispatch()` (`src/state/app-state-context.tsx:28`). Empty/whitespace input is dropped by the reducer (Task 5) — the input also reverts to the current name on empty confirm. All labels Russian; no yellow accent (the pencil is a muted/ghost control).

**Files:**
- `src/sections/artifacts/template-card.test.tsx` (add rename interaction tests)
- `src/sections/artifacts/templates-tab.test.tsx` (add `onRename` to the `TemplatesTabView` prop shape in existing renders)
- `src/sections/artifacts/template-card.tsx` (`TemplateCardProps`, Row 2 name block at line 115, add `useState`, `Pencil` import; `id` + `name` already destructured at line 82)
- `src/sections/artifacts/templates-tab.tsx` (`TemplatesTabViewProps`, destructure, `<TemplateCard>` props, `TemplatesTab` — add `useAppDispatch`)

### 6a. Write failing test

In `template-card.test.tsx`:

```ts
it("enters rename mode via the pencil control and shows an input with the current name", () => {
  render(<TemplateCard template={sms} onRename={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Переименовать/i }));
  const input = screen.getByRole("textbox", { name: /Название шаблона/i });
  expect(input).toHaveValue("SMS — напоминание");
});

it("calls onRename with id and trimmed new name on Enter", () => {
  const onRename = vi.fn();
  render(<TemplateCard template={sms} onRename={onRename} />);
  fireEvent.click(screen.getByRole("button", { name: /Переименовать/i }));
  const input = screen.getByRole("textbox", { name: /Название шаблона/i });
  fireEvent.change(input, { target: { value: "  Новое  " } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onRename).toHaveBeenCalledWith("tpl_sms", "Новое");
});

it("cancels rename on Escape without calling onRename", () => {
  const onRename = vi.fn();
  render(<TemplateCard template={sms} onRename={onRename} />);
  fireEvent.click(screen.getByRole("button", { name: /Переименовать/i }));
  const input = screen.getByRole("textbox", { name: /Название шаблона/i });
  fireEvent.change(input, { target: { value: "X" } });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(onRename).not.toHaveBeenCalled();
  expect(screen.getByText("SMS — напоминание")).toBeInTheDocument();
});
```

Add `onRename={vi.fn()}` to the other `render(<TemplateCard ... />)` calls in the file (from Tasks 1/3, the prop is required). In `templates-tab.test.tsx`, add `onRename={vi.fn()}` to both `TemplatesTabView` renders.

### 6b. Run — expect FAIL

`npx vitest run src/sections/artifacts/template-card.test.tsx src/sections/artifacts/templates-tab.test.tsx` — `onRename` not a prop; no pencil button / input.

### 6c. Minimal implementation

In `template-card.tsx`:
- `import { useState } from "react";` and `import { Pencil } from "lucide-react";` (line 3 area).
- Add `onRename: (id: string, name: string) => void;` to `TemplateCardProps`; add `onRename` to the destructured signature.
- Local state: `const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(name);`. Keep `draft` synced when entering edit (set `draft` to `name` on pencil click).
- Replace Row 2 (line 115) with conditional render:
  - **View mode:** name `<p>` + a ghost pencil `<button aria-label="Переименовать">` (`<Pencil className="h-3.5 w-3.5" />`, muted color — no accent) that sets `draft = name; setEditing(true)`.
  - **Edit mode:** controlled `<input aria-label="Название шаблона" autoFocus value={draft} />`; `onChange` updates `draft`; `onKeyDown`: Enter → `commit()`, Escape → `setEditing(false)` (discard); `onBlur` → `commit()`. `commit()`: `const v = draft.trim(); if (v) onRename(id, v); setEditing(false);` (empty reverts by not calling and closing).

In `templates-tab.tsx`:
- Add `onRename: (id: string, name: string) => void;` to `TemplatesTabViewProps`; destructure it; pass `onRename={onRename}` to `<TemplateCard>`.
- In `TemplatesTab`: `import { useAppDispatch } from "@/state/app-state-context";` add `const dispatch = useAppDispatch();` and pass:
  ```tsx
  onRename={(id, name) => dispatch({ type: "template_renamed", id, name })}
  ```

### 6d. Run — expect PASS

`npx vitest run src/sections/artifacts/template-card.test.tsx src/sections/artifacts/templates-tab.test.tsx`

### 6e. Commit

`git commit -am "feat(templates): inline rename of template name in Артефакты (aim rename)"`

---

## Task 7 — Full verification

**Files:** none (verification only)

### 7a. Run the whole suite + lint

```bash
npm test
npm run lint
```

Both must pass with no errors. If the dev server is needed to eyeball the chip/rename, run `next dev -p 3001` (main checkout may hold 3000).

### 7b. Manual self-check against the spec

- Edit 6: no «Использовать в новой кампании» button anywhere; `onUseInNewCampaign` fully removed (grep returns no source hits).
- Edit 7: grey chip «Использовано N раз» on Row 1 next to channel chip + name; pluralization correct; no yellow.
- Rename: pencil → input → Enter/blur commits via `template_renamed`; Escape cancels; empty input is a no-op.
- `MessageTemplate.name` shape unchanged and never blanked (Block 5 contract intact).

### 7c. Report

Report worktree path `.worktrees/block2-cards` and branch `feature/block2-cards`. Leave merge/cleanup to the user.

---

## Self-review (coverage / placeholders / type consistency)

- **Coverage:** Edit 6 (Tasks 1-2), Edit 7 (Tasks 3-4), Rename (Tasks 5-6), verification (7). All three block items covered.
- **No placeholders:** all paths, line ranges, symbol names (`onUseInNewCampaign`, `appReducer`, `template_added`/`template_renamed`, `MessageTemplate`, `useAppDispatch`, `CHANNEL_LABEL`, `NODE_STYLES`, `usedInCampaigns`, `pluralizeRaz`) taken from the actual files.
- **Type consistency:** `template_renamed` mirrors the verified `template_added` union style at line 329 and case style at 1042; `MessageTemplate.name` is the existing required `string` field (lines 93-99) — rename mutates it, never removes it; reducer guards against empty so Block 5's name-keyed lookups stay safe.
- **Strings:** all UI text Russian («Использовано N раз», «Переименовать», «Название шаблона»); «раз/раза» pluralized via tested helper.
- **PRODUCT.md:** usage chip uses neutral `border`/`muted`/`muted-foreground` tokens, never the yellow accent; pencil is a muted ghost control.
