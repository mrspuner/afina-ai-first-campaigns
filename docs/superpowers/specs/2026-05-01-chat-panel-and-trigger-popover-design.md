# Chat Panel + Trigger Configure Popover — Design

**Date:** 2026-05-01
**Branch:** `feature/trigger-card-expand`
**Source design:** Figma node `128:3287` ("Доработка") in file `0F9sLO13e6dWABVl5n6CbU`
**Related spec:** `docs/triggers-ai-edit-ux.md`

## Goal

Replace the current "trigger as prompt-bar chip" mechanic with:

1. A persistent **chat history** scoped to the current signal session.
2. A **chat panel with three modes** — collapsed bottom bar, expanded bottom bar, full-height right sidebar.
3. An **inline popover** anchored to the «Настроить» button on a trigger card. Popover commands and AI replies stream into the shared chat history.

The trigger card itself (chevron + domain reveal + «Настроить» inside the expanded card) — already shipped in the previous commit on this branch — is preserved unchanged.

## Out of scope

- Multi-trigger editing in a single message (deferred — popover is one-trigger-at-a-time; future work will add free-form multi-trigger commands routed through the global chat).
- Chat panel on welcome / workflow / campaigns / sections screens (those keep their existing `ShellBottomBar`).
- Cross-session persistence (history is in-memory only, prototype scope).
- Real AI — replies are deterministic templates by parser output.

## Architecture

Three independent layers, each with one responsibility:

1. **`ChatContext`** — holds chat history + panel mode. One source of truth for the chat panel and the popover.
2. **`ChatPanel`** — renders one of three layouts depending on `mode`. Replaces `ShellBottomBar` only on guided-signal views; other views keep `ShellBottomBar` unchanged.
3. **`TriggerConfigurePopover`** — base-ui `Popover` anchored to the «Настроить» button. Owns its own input; on submit writes to `ChatContext` and applies the delta to step-2 state.

Shipping `ChatPanel` only on guided-signal limits blast radius — welcome, workflow, campaigns are untouched.

## State

### `ChatMessage`

```ts
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** When set, the user bubble renders a chip with this label before the text. */
  triggerLabel?: string;
  /** Placeholder while the simulated AI tick runs. */
  pending?: boolean;
  createdAt: number;
};
```

### `ChatContext`

```ts
interface ChatContextValue {
  messages: ChatMessage[];
  mode: 'collapsed' | 'expanded' | 'sidebar';
  previousBarMode: 'collapsed' | 'expanded'; // restored when sidebar closes

  append(m: Omit<ChatMessage, 'id' | 'createdAt'>): string; // returns id
  updatePending(id: string, finalText: string): void;
  clear(): void;

  setMode(m: 'collapsed' | 'expanded'): void; // collapsed↔expanded toggle
  openSidebar(): void;   // remembers current bar mode in previousBarMode, sets sidebar
  closeSidebar(): void;  // sets mode back to previousBarMode
}
```

Provider mounted in `src/app/page.tsx` around the guided-signal section (or globally — global is simpler and harmless on screens that don't read it).

### History reset

A `useEffect` inside `ChatProvider` watches the active signal's `status`. When status transitions to `running` (signal launched), `clear()` is called. While the wizard navigates between steps 1–7, history persists.

If the user starts a new signal flow (`start_signal_flow` action), history also clears — handled by listening to `wizardSessionId` change.

## ChatPanel — three modes

Single component. Reads `mode` from `ChatContext`. Renders one of three layouts:

### Collapsed

Same outer dimensions as the current bottom bar (`fixed left-[120px] right-0`, max-width 720px, centered, frosted dark card). Adds a header row above the input:

```
┌──────────────────────────────────────────────┐
│ ⌄ Работа с ИИ                          ⛶    │  ← header
├──────────────────────────────────────────────┤
│ [textarea …]                          🎙 ⏎  │  ← input
└──────────────────────────────────────────────┘
```

- Chevron-down → toggles to `expanded`.
- Maximize-icon → `openSidebar()`.

### Expanded

Same anchor (bottom of viewport) but taller — `max-height: 480px`. History list above input, fade-masks at top/bottom of the scroll area:

```
┌──────────────────────────────────────────────┐
│ ⌃ Работа с ИИ                          ⛶    │
├──────────────────────────────────────────────┤
│ [история сообщений, scrollable]              │
│ [fade-mask top when scrollTop > 0]           │
│ [fade-mask bot when not scrolled to bottom]  │
├──────────────────────────────────────────────┤
│ [textarea …]                          🎙 ⏎  │
└──────────────────────────────────────────────┘
```

- Chevron-up → toggles to `collapsed`.
- Maximize-icon → `openSidebar()`.

Empty state: mascot icon + "Здесь будет история переписки с афина ИИ" centered.

### Sidebar

`fixed right-0 top-0 bottom-0 w-[420px]`. Bottom panel hidden. Layout shifts:

- `useLayoutEffect` writes `--chat-sidebar-width: 420px` on `<html>` when `mode === 'sidebar'`, else `0px`.
- The guided-signal wrapper (e.g. `campaign-workspace.tsx`) gets `padding-right: var(--chat-sidebar-width, 0px)` with a `transition: padding-right 320ms ease`.
- The right-side step indicator is `absolute right-6` inside that wrapper, so it slides left automatically with the padding shift.

```
                                  │ ─ Работа с ИИ          ✕ │
                                  │                          │
   [main content]                 │ [история сообщений]      │
   shifted left via               │ [fade-masks as needed]   │
   padding-right                  │                          │
                                  │ [textarea]      🎙   ⏎  │
                                  │                          │
```

- X button → `closeSidebar()` → restores `previousBarMode`.

## ChatPanel subcomponents

- **`ChatPanelHeader`** — title + mode-dependent control buttons.
- **`ChatHistoryList`** — renders `messages` with bubbles. User messages right-aligned, dark pill; assistant left-aligned with mascot icon. If `triggerLabel` is set, render a small chip with the label inline at the start of the user bubble's content. `pending: true` assistant messages render an animated «думает…» placeholder. Auto-scrolls to bottom on new message.
- **`ChatComposer`** — wraps the existing `PromptInput` + Mic button. Submits by calling a `handleSubmit` prop.

## TriggerConfigurePopover

base-ui `Popover` (`Popover.Root` / `Popover.Trigger` / `Popover.Positioner` / `Popover.Popup`).

- Anchor: the «Настроить» button rendered inside the expanded trigger card (existing JSX; just wrap it as `Popover.Trigger`).
- Position: `side="top"` with `sideOffset={8}`, `align="end"`. Auto-flip enabled (base-ui default behavior).
- Visual: small rounded card, `border-primary/40`, dark surface, ~320px wide. Mini `PromptInput`-style input inside with placeholder "Напишите что хотите изменить в интересе".

### Lifecycle

- Step-2 holds `activePopoverTriggerId: string | null` state (only one popover open at a time).
- Click «Настроить» → set this trigger as active. Re-clicking same one → close.
- Click «Настроить» on a different trigger → switches active id (closes previous, opens new).
- Esc, click-outside, successful submit → closes and clears `activePopoverTriggerId`.
- No drafts persisted — popover input always opens empty (kept simple per user direction).

### Submit pipeline

1. `parseTriggerCommand(rawText)` (existing parser).
2. If `parsed.kind === 'fallback'`:
   - Render the parser's `message` inline at the bottom of the popover in a small error block.
   - Do not write to chat history.
   - Stay open; let the user fix and resubmit.
3. Otherwise:
   - `userMsgId = chat.append({ role:'user', text: rawText, triggerLabel: trigger.label })`
   - `assistantMsgId = chat.append({ role:'assistant', text:'', pending:true })`
   - Set local `processing` flag (disables submit button, optional spinner).
   - `await new Promise(r => setTimeout(r, 350))` — simulated AI tick.
   - Apply delta via existing `applyEditToDelta` (or the matching `clear-*` branch) — same logic that lives in `submit` today.
   - `chat.updatePending(assistantMsgId, mockReplyFor(parsed))` — see «Mock AI replies» below.
   - Close popover, clear input.

The trigger card highlight (existing `setHighlightedTriggerIds` + amber ring + 600ms fade) keeps working — it's triggered around the same place, just routed via the popover handler instead of the bottom-bar handler.

## Mock AI replies

Deterministic by `parsed.kind`:

| Parser output | Reply text |
|--------------|------------|
| `add` only (`n` = `parsed.add.length`) | «Добавил `{n}` доменов в триггер.» (с правильным склонением) |
| `exclude` only | «Исключил `{n}` доменов.» |
| `add` + `exclude` | «Готово, добавил `{n_add}` и исключил `{n_exc}`.» |
| `clear-added` | «Очистил список добавленных доменов.» |
| `clear-excluded` | «Очистил список исключённых.» |

Free-form text submitted from the chat composer (no popover, no trigger context):
- Appended to history as a user message (no `triggerLabel`).
- Assistant reply: «Принял, посмотрю и сообщу. (Это прототип — реального ответа не будет.)»
- Same 350ms pending → updatePending pattern.

Numerals ("домен" / "домена" / "доменов") via a small `pluralRu(n, ['домен','домена','доменов'])` helper.

## Cleanup

- `src/state/prompt-chips-context.tsx` — kept (workflow node chips still use it). The `kind: 'trigger'` branch type stays for forward-compatibility but is unused in step-2-interests after this change.
- `src/state/trigger-edit-context.tsx` — narrowed (not deleted): the host exposes only `setHighlight(triggerIds: Set<string>)` and the consumer reads `highlightedTriggerIds`. Everything else (`setHint`, `setProcessing`, `getDraft`/`saveDraft`/`clearDraft`, `registerSubmit`) is removed. Highlight stays a context-level concern because `step-2-interests.tsx` reads it inside `TriggerCard` and the popover writes to it; co-locating in one context keeps the data-flow flat.
- `src/sections/shell/shell-bottom-bar.tsx` — `hasTriggerChips` branch and `useTriggerEdit()` import removed. Trigger-edit hint UI removed. Bottom-bar continues to render on welcome / workflow / sections, unchanged.
- New: `<ChatPanel>` is the chat UI on guided-signal views. `ShellBottomBar` is unmounted on those views; `ChatPanel` takes its place.

## Animation

Per design principle 8: opacity + transform only for UI element appearance.

- `expanded` ↔ `collapsed` mode transition: `transform: scaleY` with `transform-origin: bottom` + `opacity` on the inner content. Avoids animating `height`.
- Sidebar slide-in: `translate-x-full` → `translate-x-0`, 320ms `cubic-bezier(0.32, 0.72, 0, 1)`.
- Layout shift on main content (`padding-right` transition): this *is* a property animation principle 8 says to avoid. Trade-off accepted: the alternative (overlaying the sidebar over content) hides content; Figma frame 5 explicitly shows content squeezed. Layout-response animation gets one carve-out. Use `transition: padding-right 320ms cubic-bezier(0.32, 0.72, 0, 1)`.
- Popover open: opacity + `scale-95` → `scale-100`, 180ms.
- Auto-scroll to bottom on new message: `behavior: 'smooth'`.

## Files touched

New:
- `src/state/chat-context.tsx`
- `src/sections/shell/chat-panel.tsx`
- `src/sections/shell/chat-panel-header.tsx`
- `src/sections/shell/chat-history-list.tsx`
- `src/sections/shell/chat-composer.tsx`
- `src/sections/signals/steps/trigger-configure-popover.tsx`
- `src/lib/mock-ai-reply.ts`

Modified:
- `src/app/page.tsx` — mount `ChatProvider`, pick `ChatPanel` vs `ShellBottomBar` by view.
- `src/sections/signals/steps/step-2-interests.tsx` — replace chip-push with popover open; wire popover submit through new pipeline.
- `src/sections/signals/campaign-workspace.tsx` — add `padding-right: var(--chat-sidebar-width, 0px)` + transition.
- `src/sections/shell/shell-bottom-bar.tsx` — strip `hasTriggerChips` branch.
- `src/state/trigger-edit-context.tsx` — narrow or remove (TBD during implementation).

Tests:
- `src/state/chat-context.test.ts` — append, updatePending, clear, mode transitions (collapsed↔expanded↔sidebar with previousBarMode restoration).
- `src/lib/mock-ai-reply.test.ts` — replies for each `parsed.kind`, plurals.

## Risks

- Replacing `ShellBottomBar` with `ChatPanel` only on guided-signal means the guided-signal page must explicitly choose. Use `view.kind === 'guided-signal'` as the selector at the `page.tsx` layer. If that branch grows messy, fall back to mounting both and hiding one with `display: none` (cheap, works).
- Layout shift via `padding-right` on `campaign-workspace` interacts with `min-h-screen` step containers. Verify visually that step transitions still animate correctly when sidebar is open.
- base-ui Popover positioning sometimes glitches inside scrollable parents. The trigger list is inside a scrolling step container — verify autoplacement works, fall back to `flip` modifier explicitly if needed.

## Decision log

- **Multi-trigger editing**: deferred. Future work will route free-form multi-trigger commands through the global chat composer.
- **Sidebar return mode**: restore the bar mode the user had before opening sidebar.
- **Processing UX**: user message appears immediately, assistant placeholder («думает…») renders next, replaced by the final text after 350ms.
- **Drafts**: not persisted — popover input always opens empty. Simpler than the current per-trigger draft behavior.
- **History reset trigger**: signal status → `running` clears the conversation. New signal start also clears.
- **Fade-mask**: shown only when there is content scrolled out of view in that direction.
