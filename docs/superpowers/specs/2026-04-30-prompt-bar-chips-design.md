# PromptBar inline chips — design

**Status:** Approved
**Date:** 2026-04-30
**Replaces:** ad-hoc `@Label` text-tokens for nodes; floating "Редактируем триггер X" hint for triggers.

---

## Problem

The PromptBar today carries structured context in two incompatible ways:

- **Workflow nodes** — selecting a node injects `@Label ` text into the textarea (`SelectedNodeEffect`). The submit handler later re-parses that text via `parseTagSegments` to recover `{ label, text }` pairs. The "chip" is a fiction painted as plain text.
- **Trigger AI-edit (Worktree D)** — the active trigger lives in a separate React context. A floating hint above the bar tells the user which trigger is being edited; the chip-like UX is only on the trigger card, not in the bar.

Two patterns in one component create mismatched user expectations and brittle parsing. The user wants a single visual idiom: when the prompt-bar is collecting parameterised input, the structured context appears as **inline chips inside the bar**, like recipient pills in Gmail. The user types ordinary text after the chips.

## Goal

Promote chips to a first-class state of the PromptBar. Both flows (trigger AI-edit, node command) consume one chip API. The text-token shim is removed.

## Design

### Visual

```
┌─────────────────────────────────────────────────────┐
│ [⚙ Сайты автодилеров] [+ добавить]  d1.ru, d2.ru___│
└─────────────────────────────────────────────────────┘
```

- Chips are real DOM elements rendered before the textarea inside one flex-wrap container. They flow inline with the text.
- Chips are **non-interactive** — no click target, no `×`. Removal is via `Backspace` when the textarea cursor is at offset 0 with no selection: the last removable chip pops.
- Visual style follows existing chip components in the project (e.g. `chip-multiselect.tsx`); minor tweaks for kind-specific glyphs (mascot icon for trigger, plus/minus for mode, node icon for node).

### State

A new context owns chip state:

```ts
type PromptChipKind = "trigger" | "mode" | "node";

interface PromptChip {
  id: string;            // stable per chip instance
  kind: PromptChipKind;
  label: string;         // human-readable
  payload: unknown;      // typed per-kind via discriminated wrapper at consumer
  removable: boolean;    // false ⇒ Backspace skips it
}

interface PromptChipsApi {
  chips: readonly PromptChip[];
  pushChip(chip: Omit<PromptChip, "id">): void;
  removeChip(id: string): void;
  removeLastRemovable(): boolean; // returns true if anything was removed
  clearChips(): void;
}
```

Mounted by `PromptInputBody`; consumed by `usePromptChips()`.

### Submit payload

The submit handler receives `{ chips, text }` directly — no regex over the textarea string for chip-like content. Kind-specific code paths translate that into existing reducer actions (node commands, trigger edits). Free-text parsers (`parseStructuralCommands`, `parseCampaignQuery`, `trigger-edit-parser`) keep their current contracts and run over `text` only.

### Migration plan

Done in one branch `feature/prompt-chips`, four commits in order so each step is independently reviewable:

1. **Chip infrastructure.** New `PromptChipsContext`, render chips before the textarea inside `PromptInputBody`, wire `Backspace`-at-zero to `removeLastRemovable`. No consumers yet.
2. **Migrate triggers.** `useTriggerEdit` "set active" pushes a trigger-chip; deactivation removes it. The floating hint above the bar is removed; `placeholder` swaps based on chip presence. Optional: a leading "+ добавить" / "− исключить" mode-chip when the user types one of those words as the first word — pure sugar, parser still tolerant.
3. **Migrate nodes.** `SelectedNodeEffect` is replaced by `SelectedNodeChipEffect` that pushes a node-chip on select and removes it on deselect. The submit handler reads `chips` rather than parsing `@Label`. Multi-node case: each `node_selected` pushes one chip; submit folds chips by node id.
4. **Cleanup.** Delete `parseTagSegments`, `formatTag`, `SelectedNodeEffect`, `ClearOnLeaveWorkflowEffect` (migrated equivalent: clear chips on view change). Update tests.

### What we don't touch

- `PromptInputHeader` (file attachments stay where they are).
- Welcome chat chips above the bar (`OnboardingChatChips`, `CampaignsPromptChips`) — those are suggestion-chips, a different concept; out of scope.
- The `parse...` family of free-text parsers; their inputs stay strings.
- The trigger AI-edit regex (`trigger-edit-parser.ts`) — it now sees pure user text, which is what it always wanted.

## Tests

- Unit: chip reducer (push, removeLast, clear, dedup-by-id).
- Unit: submit payload composer — given chips + text, produces the expected per-flow action shape.
- Unit: Backspace-at-zero removes last removable chip (uses a fake selection).
- Integration: select a node twice → two chips → submit → reducer sees two `{ nodeLabel, text }` entries with the second's text. Existing `workflow_node_command_submit` reducer test stays green.

## Non-goals

- Drag-and-drop reorder of chips.
- Chip-internal autocomplete or popovers.
- Persisting chips across navigations (chips clear on view leave, same as today).
- Generic «slash command» framework. Only the two kinds above land now; new kinds are additive.

## Risk

- **Cursor management.** The flex-wrap layout moves the textarea to the second line when chips overflow. We must ensure the textarea still receives focus on chip push and that auto-resize accounts for the shifted starting position. Mitigation: covered by an integration test that types into the textarea after a chip push and asserts caret position.
- **Backspace ambiguity.** A `Backspace` press at offset 0 inside a multi-line textarea where the user is on line 2+ should not nuke a chip. Guard: only fire chip removal when both `selectionStart === 0` and `selectionEnd === 0` and the textarea content is empty *or* the caret is in the first text node before any newline. Decide concretely in the plan.
- **Existing `@Label` content.** Old persisted state, if any, that contains `@Label` strings still parses correctly because we keep the textarea's `text` portion unmodified. We just stop *generating* `@Label`. No data migration needed.
