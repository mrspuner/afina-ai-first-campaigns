# Chat Panel + Trigger Configure Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the prompt-bar trigger-chip flow with (1) a chat panel that has three modes (collapsed bar / expanded bar / right sidebar) and persistent per-signal history, and (2) an inline base-ui popover anchored to the «Настроить» button on a trigger card, whose commands and AI replies stream into the shared chat history.

**Architecture:** Three independent layers. (a) `ChatContext` (reducer + provider) owns history and panel mode. (b) `ChatPanel` is rendered only on guided-signal views, replacing `ShellBottomBar` there; it reads `ChatContext` and renders one of three layouts. (c) `TriggerConfigurePopover` (base-ui Popover) wraps the «Настроить» button inside the expanded trigger card; on submit it writes to `ChatContext` and applies the delta. Everything else (welcome / workflow / sections) is untouched.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, motion v12 (`motion/react`), base-ui Popover via `@/components/ui/popover`, vitest for unit tests, existing `parseTriggerCommand` parser in `src/lib/trigger-edit-parser.ts`.

**Spec:** `docs/superpowers/specs/2026-05-01-chat-panel-and-trigger-popover-design.md`

---

## Task 1: `pluralRu` helper

**Files:**
- Create: `src/lib/plural-ru.ts`
- Create: `src/lib/plural-ru.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/plural-ru.test.ts
import { describe, it, expect } from "vitest";
import { pluralRu } from "./plural-ru";

const FORMS: [string, string, string] = ["домен", "домена", "доменов"];

describe("pluralRu", () => {
  it("picks form for 1, 2-4, 5+", () => {
    expect(pluralRu(1, FORMS)).toBe("домен");
    expect(pluralRu(2, FORMS)).toBe("домена");
    expect(pluralRu(3, FORMS)).toBe("домена");
    expect(pluralRu(4, FORMS)).toBe("домена");
    expect(pluralRu(5, FORMS)).toBe("доменов");
    expect(pluralRu(11, FORMS)).toBe("доменов");
    expect(pluralRu(21, FORMS)).toBe("домен");
    expect(pluralRu(22, FORMS)).toBe("домена");
    expect(pluralRu(0, FORMS)).toBe("доменов");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/plural-ru.test.ts`
Expected: FAIL with "Cannot find module './plural-ru'"

- [ ] **Step 3: Implement helper**

```ts
// src/lib/plural-ru.ts
export function pluralRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/plural-ru.test.ts`
Expected: PASS, 1 test, 9 assertions

- [ ] **Step 5: Commit**

```bash
git add src/lib/plural-ru.ts src/lib/plural-ru.test.ts
git commit -m "feat(lib): add pluralRu helper for Russian noun forms"
```

---

## Task 2: `mockReplyFor` helper

**Files:**
- Create: `src/lib/mock-ai-reply.ts`
- Create: `src/lib/mock-ai-reply.test.ts`

Depends on: Task 1 (pluralRu), `parseTriggerCommand` return type from `src/lib/trigger-edit-parser.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/mock-ai-reply.test.ts
import { describe, it, expect } from "vitest";
import { mockReplyFor, mockReplyForFreeText } from "./mock-ai-reply";
import type { ParsedTriggerCommand } from "./trigger-edit-parser";

function edit(add: string[], exclude: string[]): ParsedTriggerCommand {
  return { kind: "edit", add, exclude };
}

describe("mockReplyFor", () => {
  it("add only", () => {
    expect(mockReplyFor(edit(["a.ru"], []))).toBe("Добавил 1 домен в триггер.");
    expect(mockReplyFor(edit(["a.ru", "b.ru"], []))).toBe("Добавил 2 домена в триггер.");
    expect(mockReplyFor(edit(["a.ru", "b.ru", "c.ru", "d.ru", "e.ru"], []))).toBe("Добавил 5 доменов в триггер.");
  });

  it("exclude only", () => {
    expect(mockReplyFor(edit([], ["x.ru"]))).toBe("Исключил 1 домен.");
    expect(mockReplyFor(edit([], ["x.ru", "y.ru"]))).toBe("Исключил 2 домена.");
  });

  it("add + exclude", () => {
    expect(mockReplyFor(edit(["a.ru"], ["x.ru", "y.ru"]))).toBe(
      "Готово, добавил 1 домен и исключил 2 домена."
    );
  });

  it("clear-added", () => {
    expect(mockReplyFor({ kind: "clear-added" })).toBe("Очистил список добавленных доменов.");
  });

  it("clear-excluded", () => {
    expect(mockReplyFor({ kind: "clear-excluded" })).toBe("Очистил список исключённых.");
  });
});

describe("mockReplyForFreeText", () => {
  it("returns the prototype placeholder", () => {
    expect(mockReplyForFreeText()).toBe(
      "Принял, посмотрю и сообщу. (Это прототип — реального ответа не будет.)"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/mock-ai-reply.test.ts`
Expected: FAIL with "Cannot find module './mock-ai-reply'"

- [ ] **Step 3: Implement helper**

```ts
// src/lib/mock-ai-reply.ts
import type { ParsedTriggerCommand } from "./trigger-edit-parser";
import { pluralRu } from "./plural-ru";

const DOMAIN_FORMS: [string, string, string] = ["домен", "домена", "доменов"];

export function mockReplyFor(parsed: Exclude<ParsedTriggerCommand, { kind: "fallback" }>): string {
  if (parsed.kind === "clear-added") return "Очистил список добавленных доменов.";
  if (parsed.kind === "clear-excluded") return "Очистил список исключённых.";

  const addN = parsed.add.length;
  const excN = parsed.exclude.length;

  if (addN > 0 && excN === 0) {
    return `Добавил ${addN} ${pluralRu(addN, DOMAIN_FORMS)} в триггер.`;
  }
  if (addN === 0 && excN > 0) {
    return `Исключил ${excN} ${pluralRu(excN, DOMAIN_FORMS)}.`;
  }
  return `Готово, добавил ${addN} ${pluralRu(addN, DOMAIN_FORMS)} и исключил ${excN} ${pluralRu(excN, DOMAIN_FORMS)}.`;
}

export function mockReplyForFreeText(): string {
  return "Принял, посмотрю и сообщу. (Это прототип — реального ответа не будет.)";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/mock-ai-reply.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/mock-ai-reply.ts src/lib/mock-ai-reply.test.ts
git commit -m "feat(lib): mock AI replies for trigger-edit parser output"
```

---

## Task 3: `ChatContext` reducer

**Files:**
- Create: `src/state/chat-context.tsx` (reducer + types only at this stage)
- Create: `src/state/chat-context.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/state/chat-context.test.ts
import { describe, it, expect } from "vitest";
import { chatReducer, type ChatState, type ChatMessage } from "./chat-context";

const empty: ChatState = {
  messages: [],
  mode: "collapsed",
  previousBarMode: "collapsed",
};

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, "role" | "text">): ChatMessage {
  return {
    id: partial.id ?? `msg_test_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: partial.createdAt ?? 1_700_000_000_000,
    ...partial,
  };
}

describe("chatReducer", () => {
  it("append stores the provided message verbatim", () => {
    const m = msg({ id: "msg_1", role: "user", text: "hi" });
    const next = chatReducer(empty, { type: "append", message: m });
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]).toEqual(m);
  });

  it("append preserves triggerLabel and pending flag", () => {
    const a = msg({ id: "a", role: "user", text: "add a.ru", triggerLabel: "Сайты автодилеров" });
    const b = msg({ id: "b", role: "assistant", text: "", pending: true });
    const s1 = chatReducer(empty, { type: "append", message: a });
    expect(s1.messages[0].triggerLabel).toBe("Сайты автодилеров");
    const s2 = chatReducer(empty, { type: "append", message: b });
    expect(s2.messages[0].pending).toBe(true);
  });

  it("update_pending replaces text and clears pending flag for matching id", () => {
    let s: ChatState = chatReducer(empty, {
      type: "append",
      message: msg({ id: "ph", role: "assistant", text: "", pending: true }),
    });
    s = chatReducer(s, { type: "update_pending", id: "ph", text: "Готово." });
    expect(s.messages[0].text).toBe("Готово.");
    expect(s.messages[0].pending).toBeUndefined();
  });

  it("clear empties messages but preserves mode", () => {
    let s: ChatState = chatReducer(empty, {
      type: "append",
      message: msg({ role: "user", text: "x" }),
    });
    s = { ...s, mode: "expanded" };
    s = chatReducer(s, { type: "clear" });
    expect(s.messages).toEqual([]);
    expect(s.mode).toBe("expanded");
  });

  it("set_mode toggles between collapsed and expanded", () => {
    let s = chatReducer(empty, { type: "set_mode", mode: "expanded" });
    expect(s.mode).toBe("expanded");
    s = chatReducer(s, { type: "set_mode", mode: "collapsed" });
    expect(s.mode).toBe("collapsed");
  });

  it("open_sidebar remembers the bar mode and switches to sidebar", () => {
    let s: ChatState = { ...empty, mode: "expanded", previousBarMode: "collapsed" };
    s = chatReducer(s, { type: "open_sidebar" });
    expect(s.mode).toBe("sidebar");
    expect(s.previousBarMode).toBe("expanded");
  });

  it("close_sidebar restores the remembered bar mode", () => {
    let s: ChatState = {
      ...empty,
      mode: "sidebar",
      previousBarMode: "expanded",
    };
    s = chatReducer(s, { type: "close_sidebar" });
    expect(s.mode).toBe("expanded");
  });

  it("open_sidebar from sidebar is a no-op (does not overwrite previousBarMode)", () => {
    let s: ChatState = {
      ...empty,
      mode: "sidebar",
      previousBarMode: "expanded",
    };
    s = chatReducer(s, { type: "open_sidebar" });
    expect(s.mode).toBe("sidebar");
    expect(s.previousBarMode).toBe("expanded");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/state/chat-context.test.ts`
Expected: FAIL with "Cannot find module './chat-context'"

- [ ] **Step 3: Implement reducer + types**

```tsx
// src/state/chat-context.tsx
"use client";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** When set, the user bubble renders a chip with this label before the text. */
  triggerLabel?: string;
  /** Placeholder while the simulated AI tick runs. Replaced by update_pending. */
  pending?: boolean;
  createdAt: number;
}

export type ChatPanelMode = "collapsed" | "expanded" | "sidebar";
export type ChatBarMode = "collapsed" | "expanded";

export interface ChatState {
  messages: ChatMessage[];
  mode: ChatPanelMode;
  previousBarMode: ChatBarMode;
}

export type ChatAction =
  | { type: "append"; message: ChatMessage }
  | { type: "update_pending"; id: string; text: string }
  | { type: "clear" }
  | { type: "set_mode"; mode: ChatBarMode }
  | { type: "open_sidebar" }
  | { type: "close_sidebar" };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "append": {
      return { ...state, messages: [...state.messages, action.message] };
    }
    case "update_pending": {
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, text: action.text, pending: undefined } : m
        ),
      };
    }
    case "clear": {
      return { ...state, messages: [] };
    }
    case "set_mode": {
      return { ...state, mode: action.mode };
    }
    case "open_sidebar": {
      if (state.mode === "sidebar") return state;
      return {
        ...state,
        mode: "sidebar",
        previousBarMode: state.mode === "expanded" ? "expanded" : "collapsed",
      };
    }
    case "close_sidebar": {
      if (state.mode !== "sidebar") return state;
      return { ...state, mode: state.previousBarMode };
    }
  }
}

export const INITIAL_CHAT_STATE: ChatState = {
  messages: [],
  mode: "collapsed",
  previousBarMode: "collapsed",
};

let messageCounter = 0;
export function nextMessageId(): string {
  messageCounter += 1;
  return `msg_${messageCounter}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/state/chat-context.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/state/chat-context.tsx src/state/chat-context.test.ts
git commit -m "feat(state): chat reducer with history + three-mode panel state"
```

---

## Task 4: `ChatProvider` + `useChat` hook + history reset effects

**Files:**
- Modify: `src/state/chat-context.tsx` (append provider/hook to file from Task 3)

- [ ] **Step 1: Append the provider, hook, and reset effects**

Open `src/state/chat-context.tsx` and append at the bottom of the file (do not modify the reducer/types above):

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { useAppState } from "./app-state-context";

interface ChatContextValue {
  messages: ChatMessage[];
  mode: ChatPanelMode;
  /** Returns the id of the new message so the caller can update_pending later. */
  append: (input: Omit<ChatMessage, "id" | "createdAt">) => string;
  updatePending: (id: string, text: string) => void;
  clear: () => void;
  setMode: (mode: ChatBarMode) => void;
  openSidebar: () => void;
  closeSidebar: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, INITIAL_CHAT_STATE);
  const { wizardSessionId, signals, view } = useAppState();

  // Reset the chat when the wizard session id changes (new signal flow started).
  useEffect(() => {
    dispatch({ type: "clear" });
  }, [wizardSessionId]);

  // Reset when the active signal leaves draft status (i.e., user launched it).
  const activeSignalId = view.kind === "guided-signal" ? view.signalId ?? null : null;
  const activeSignal = useMemo(
    () => (activeSignalId ? signals.find((s) => s.id === activeSignalId) ?? null : null),
    [activeSignalId, signals]
  );
  const activeStatus = activeSignal?.status;
  useEffect(() => {
    if (activeStatus && activeStatus !== "draft") {
      dispatch({ type: "clear" });
    }
  }, [activeStatus]);

  const append = useCallback(
    (input: Omit<ChatMessage, "id" | "createdAt">) => {
      const message: ChatMessage = {
        ...input,
        id: nextMessageId(),
        createdAt: Date.now(),
      };
      dispatch({ type: "append", message });
      return message.id;
    },
    []
  );

  const updatePending = useCallback((id: string, text: string) => {
    dispatch({ type: "update_pending", id, text });
  }, []);

  const clear = useCallback(() => dispatch({ type: "clear" }), []);
  const setMode = useCallback((mode: ChatBarMode) => dispatch({ type: "set_mode", mode }), []);
  const openSidebar = useCallback(() => dispatch({ type: "open_sidebar" }), []);
  const closeSidebar = useCallback(() => dispatch({ type: "close_sidebar" }), []);

  const value = useMemo<ChatContextValue>(
    () => ({
      messages: state.messages,
      mode: state.mode,
      append,
      updatePending,
      clear,
      setMode,
      openSidebar,
      closeSidebar,
    }),
    [state.messages, state.mode, append, updatePending, clear, setMode, openSidebar, closeSidebar]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}
```

Note: `view.signalId` is the resume-mode reference. Verify `View` type has it for `kind: "guided-signal"`; if it's named differently in the existing app-state, adjust the lookup accordingly. If guided-signal does not carry a signalId at all in this codebase (e.g. only the wizard's local state knows the signal), drop the `activeStatus` reset effect — the `wizardSessionId` reset is sufficient on its own.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: PASS, all tests including chat-context

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep chat-context`
Expected: no output (no errors in chat-context).

- [ ] **Step 4: Commit**

```bash
git add src/state/chat-context.tsx
git commit -m "feat(state): ChatProvider + useChat hook with history reset effects"
```

---

## Task 5: `ChatPanelHeader` component

**Files:**
- Create: `src/sections/shell/chat-panel-header.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/sections/shell/chat-panel-header.tsx
"use client";

import { ChevronDown, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatPanelMode } from "@/state/chat-context";

interface ChatPanelHeaderProps {
  mode: ChatPanelMode;
  onToggleBar: () => void;       // collapsed ↔ expanded
  onOpenSidebar: () => void;
  onCloseSidebar: () => void;
}

export function ChatPanelHeader({
  mode,
  onToggleBar,
  onOpenSidebar,
  onCloseSidebar,
}: ChatPanelHeaderProps) {
  const inSidebar = mode === "sidebar";
  const expanded = mode === "expanded";

  return (
    <div className="flex w-full items-center justify-between px-1 py-0.5">
      <div className="flex items-center gap-2">
        {!inSidebar && (
          <button
            type="button"
            onClick={onToggleBar}
            aria-label={expanded ? "Свернуть чат" : "Развернуть чат"}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
            />
          </button>
        )}
        <span className="text-xs font-medium text-muted-foreground">Работа с ИИ</span>
      </div>
      <div className="flex items-center">
        {inSidebar ? (
          <button
            type="button"
            onClick={onCloseSidebar}
            aria-label="Закрыть сайдбар"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Открыть в сайдбаре"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep chat-panel-header`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/sections/shell/chat-panel-header.tsx
git commit -m "feat(shell): ChatPanelHeader with mode-driven controls"
```

---

## Task 6: `ChatHistoryList` component

**Files:**
- Create: `src/sections/shell/chat-history-list.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/sections/shell/chat-history-list.tsx
"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/state/chat-context";

function MascotIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/mascot-icon.svg"
      alt=""
      width={16}
      height={16}
      aria-hidden
      className={cn("shrink-0", className)}
    />
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground/70" />
      <span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground/70 [animation-delay:120ms]" />
      <span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground/70 [animation-delay:240ms]" />
    </span>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === "assistant") {
    return (
      <div className="flex items-start gap-2 py-1.5 text-sm text-foreground/90">
        <MascotIcon className="mt-0.5" />
        {message.pending ? <ThinkingDots /> : <span className="leading-snug">{message.text}</span>}
      </div>
    );
  }
  return (
    <div className="flex justify-end py-1.5">
      <div className="max-w-[85%] rounded-lg bg-white/8 px-3 py-2 text-sm text-foreground/95">
        {message.triggerLabel && (
          <span className="mr-1.5 inline-block rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs text-foreground">
            {message.triggerLabel}
          </span>
        )}
        <span className="leading-snug">{message.text}</span>
      </div>
    </div>
  );
}

interface ChatHistoryListProps {
  messages: ChatMessage[];
  /** Vertical layout fills the parent's height; bar layout uses a max-height. */
  variant: "bar" | "sidebar";
}

export function ChatHistoryList({ messages, variant }: ChatHistoryListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  function updateFades() {
    const el = scrollRef.current;
    if (!el) return;
    setShowTopFade(el.scrollTop > 4);
    setShowBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Auto-scroll to the bottom on new messages.
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    // Re-evaluate fade visibility after the scroll lands.
    requestAnimationFrame(updateFades);
  }, [messages.length]);

  return (
    <div className="relative flex-1 overflow-hidden">
      {showTopFade && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-[rgba(10,10,10,0.95)] to-transparent" />
      )}
      <div
        ref={scrollRef}
        onScroll={updateFades}
        className={cn(
          "h-full overflow-y-auto px-3",
          variant === "bar" && "max-h-[360px]"
        )}
      >
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
      </div>
      {showBottomFade && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[rgba(10,10,10,0.95)] to-transparent" />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep chat-history-list`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/sections/shell/chat-history-list.tsx
git commit -m "feat(shell): ChatHistoryList with bubbles, mascot, conditional fades"
```

---

## Task 7: `ChatComposer` component

**Files:**
- Create: `src/sections/shell/chat-composer.tsx`

This wraps the existing `PromptInput` so `ChatPanel` doesn't have to know about input internals. Compared to `ShellBottomBar`, it strips chip handling and view-routing — composer only emits `onSubmit(text)`.

- [ ] **Step 1: Write the component**

```tsx
// src/sections/shell/chat-composer.tsx
"use client";

import { useRef } from "react";
import { Mic } from "lucide-react";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import {
  ChipEditableInput,
  type ChipEditableInputHandle,
} from "@/components/ai-elements/chip-editable-input";
import { cn } from "@/lib/utils";

interface ChatComposerProps {
  placeholder: string;
  onSubmit: (text: string) => void;
}

export function ChatComposer({ placeholder, onSubmit }: ChatComposerProps) {
  const editorRef = useRef<ChipEditableInputHandle>(null);

  function handleSubmit(message: PromptInputMessage) {
    const text = (message.text ?? "").trim();
    if (!text) return;
    onSubmit(text);
    editorRef.current?.clear();
  }

  return (
    <PromptInput
      onSubmit={handleSubmit}
      className={cn(
        "[&_[data-slot=input-group]]:rounded-[10px]!",
        "[&_[data-slot=input-group]]:border!",
        "[&_[data-slot=input-group]]:border-white/15!",
        "[&_[data-slot=input-group]]:bg-white/5!",
        "dark:[&_[data-slot=input-group]]:bg-white/5!",
        "[&_[data-slot=input-group]]:backdrop-blur-[14.8px]"
      )}
    >
      <ChipEditableInput
        ref={editorRef}
        className="px-3 py-2"
        placeholder={placeholder}
      />
      <PromptInputFooter>
        <PromptInputTools>
          <PromptInputButton tooltip="Голосовой ввод">
            <Mic className="h-4 w-4" />
          </PromptInputButton>
        </PromptInputTools>
        <PromptInputSubmit />
      </PromptInputFooter>
    </PromptInput>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep chat-composer`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/sections/shell/chat-composer.tsx
git commit -m "feat(shell): ChatComposer wraps PromptInput, emits text-only submit"
```

---

## Task 8: `ChatPanel` container with three modes

**Files:**
- Create: `src/sections/shell/chat-panel.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/sections/shell/chat-panel.tsx
"use client";

import Image from "next/image";
import { useLayoutEffect } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useChat } from "@/state/chat-context";
import { ChatPanelHeader } from "./chat-panel-header";
import { ChatHistoryList } from "./chat-history-list";
import { ChatComposer } from "./chat-composer";
import { mockReplyForFreeText } from "@/lib/mock-ai-reply";

const SIDEBAR_WIDTH_PX = 420;

function EmptyHistory() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
      <Image
        src="/mascot-icon.svg"
        alt=""
        width={32}
        height={32}
        aria-hidden
      />
      <p className="text-xs text-muted-foreground">
        Здесь будет история переписки с афина ИИ
      </p>
    </div>
  );
}

export function ChatPanel({ placeholder }: { placeholder: string }) {
  const chat = useChat();

  // Reflect sidebar mode as a CSS variable so layouts can shift main content.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (chat.mode === "sidebar") {
      root.style.setProperty("--chat-sidebar-width", `${SIDEBAR_WIDTH_PX}px`);
    } else {
      root.style.setProperty("--chat-sidebar-width", "0px");
    }
    return () => {
      root.style.removeProperty("--chat-sidebar-width");
    };
  }, [chat.mode]);

  function handleFreeTextSubmit(text: string) {
    const userId = chat.append({ role: "user", text });
    void userId;
    const assistantId = chat.append({ role: "assistant", text: "", pending: true });
    window.setTimeout(() => {
      chat.updatePending(assistantId, mockReplyForFreeText());
    }, 350);
  }

  const showHistory = chat.mode === "expanded" || chat.mode === "sidebar";
  const isEmpty = chat.messages.length === 0;

  if (chat.mode === "sidebar") {
    return (
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
        className="fixed right-0 top-0 z-30 flex h-screen w-[420px] flex-col gap-3 border-l border-white/10 bg-[rgba(10,10,10,0.85)] p-4 backdrop-blur-[2px]"
      >
        <ChatPanelHeader
          mode={chat.mode}
          onToggleBar={() => chat.setMode("collapsed")}
          onOpenSidebar={chat.openSidebar}
          onCloseSidebar={chat.closeSidebar}
        />
        {isEmpty ? <EmptyHistory /> : <ChatHistoryList messages={chat.messages} variant="sidebar" />}
        <ChatComposer placeholder={placeholder} onSubmit={handleFreeTextSubmit} />
      </motion.aside>
    );
  }

  return (
    <motion.div
      className="fixed left-[120px] right-0 bottom-[20px] z-30 flex justify-center px-6"
      initial={false}
    >
      <div
        className={cn(
          "flex w-full max-w-[720px] flex-col gap-3 rounded-[34px] p-4",
          "bg-[rgba(10,10,10,0.75)] backdrop-blur-[2px]"
        )}
      >
        <ChatPanelHeader
          mode={chat.mode}
          onToggleBar={() => chat.setMode(chat.mode === "expanded" ? "collapsed" : "expanded")}
          onOpenSidebar={chat.openSidebar}
          onCloseSidebar={chat.closeSidebar}
        />
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, scaleY: 0.92 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            style={{ transformOrigin: "bottom" }}
            className="flex flex-col"
          >
            {isEmpty ? <EmptyHistory /> : <ChatHistoryList messages={chat.messages} variant="bar" />}
          </motion.div>
        )}
        <ChatComposer placeholder={placeholder} onSubmit={handleFreeTextSubmit} />
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep chat-panel`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/sections/shell/chat-panel.tsx
git commit -m "feat(shell): ChatPanel renders three modes off ChatContext"
```

---

## Task 9: Mount `ChatProvider` and shift main content for sidebar

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/sections/signals/campaign-workspace.tsx`

- [ ] **Step 1: Wrap the app with `ChatProvider`**

Open `src/app/page.tsx`. After existing imports, add:

```tsx
import { ChatProvider } from "@/state/chat-context";
```

Find the top-level wrapper that holds the rendered sections (look for the component returned from `Home()`), and wrap its children with `<ChatProvider>...</ChatProvider>`. Place it inside whatever providers already exist (e.g. inside `AppStateProvider`) so `useAppState()` works inside the ChatProvider's effects.

Example shape (adapt to existing structure):

```tsx
return (
  <AppStateProvider>
    <ChatProvider>
      {/* existing children */}
    </ChatProvider>
  </AppStateProvider>
);
```

- [ ] **Step 2: Add layout shift to the guided-signal wrapper**

Open `src/sections/signals/campaign-workspace.tsx`. Find the outermost container of the guided-signal wrapper (the `<div className="relative flex flex-1 flex-col overflow-hidden">` near the return). Replace its className to apply right padding from the chat sidebar variable:

Replace:
```tsx
<div className="relative flex flex-1 flex-col overflow-hidden">
```

With:
```tsx
<div
  className="relative flex flex-1 flex-col overflow-hidden transition-[padding] duration-300"
  style={{ paddingRight: "var(--chat-sidebar-width, 0px)" }}
>
```

- [ ] **Step 3: Verify dev server compiles**

Run: `curl -s http://localhost:3001/ -o /dev/null -w "HTTP %{http_code}\n"`
Expected: `HTTP 200`. If the dev server is not running, start it: `npm run dev -- -p 3001` in the worktree.

Tail the dev log:
```
tail -20 $(ls -t /tmp/claude-*/-Users-macintosh-Documents-work-afina-ai-first/*/tasks/*.output 2>/dev/null | head -1)
```
Expected: no compile errors mentioning `chat-context`, `ChatProvider`, or `campaign-workspace`.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/sections/signals/campaign-workspace.tsx
git commit -m "feat(app): mount ChatProvider; shift workspace for sidebar"
```

---

## Task 10: Render `ChatPanel` only on guided-signal (replace ShellBottomBar)

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Switch between ChatPanel and ShellBottomBar**

In `src/app/page.tsx`, find where `<ShellBottomBar />` is rendered. Add a conditional that renders `<ChatPanel />` when on guided-signal and `<ShellBottomBar />` otherwise.

Add import:
```tsx
import { ChatPanel } from "@/sections/shell/chat-panel";
```

At the render site, replace the bare `<ShellBottomBar />` with:

```tsx
{view.kind === "guided-signal" ? (
  <ChatPanel placeholder="Введите ваши параметры или задайте вопрос" />
) : (
  <ShellBottomBar />
)}
```

(`view` is already destructured in `Home()` from `useAppState()`.)

- [ ] **Step 2: Manual verification — collapsed mode visible on step-2**

Visit `http://localhost:3001/?cap=step2&scenario=registration`. Expected:
- Bottom panel says «Работа с ИИ» on a header row above the input.
- Chevron icon is visible on the left of the header.
- Maximize icon is visible on the right.
- The current ShellBottomBar UI is gone (no «Редактируем триггер» hint, no chip rendering).

- [ ] **Step 3: Manual verification — expand and sidebar transitions**

Click the chevron in the header. Expected: a (currently empty) message area appears above the input with mascot + placeholder text.

Click the maximize icon. Expected: the bar disappears and a 420px right sidebar slides in. Main content shifts left. Step indicator (right side of workspace) sits next to the sidebar boundary.

Click the X in the sidebar header. Expected: sidebar slides out, panel returns to expanded mode (because that's where we were).

Click the chevron to collapse. Click maximize. Expected: sidebar opens. Click X. Expected: panel returns to collapsed.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(app): swap ShellBottomBar → ChatPanel on guided-signal"
```

---

## Task 11: `TriggerConfigurePopover` component

**Files:**
- Create: `src/sections/signals/steps/trigger-configure-popover.tsx`

- [ ] **Step 1: Write the popover component**

```tsx
// src/sections/signals/steps/trigger-configure-popover.tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { Loader2, Send } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  parseTriggerCommand,
  type ParsedTriggerCommand,
} from "@/lib/trigger-edit-parser";
import { mockReplyFor } from "@/lib/mock-ai-reply";
import { useChat } from "@/state/chat-context";
import { cn } from "@/lib/utils";

export interface TriggerConfigurePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerLabel: string;
  /** Apply the parsed (non-fallback) command to the trigger's delta. */
  onApply: (parsed: Exclude<ParsedTriggerCommand, { kind: "fallback" }>) => void;
  /** Briefly highlight the trigger card while the simulated AI tick runs. */
  onHighlightStart: () => void;
  onHighlightEnd: () => void;
  children: ReactNode; // the «Настроить» button
}

const PROCESSING_DELAY_MS = 350;
const HIGHLIGHT_FADE_MS = 600;

export function TriggerConfigurePopover({
  open,
  onOpenChange,
  triggerLabel,
  onApply,
  onHighlightStart,
  onHighlightEnd,
  children,
}: TriggerConfigurePopoverProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chat = useChat();

  // Always open with empty input — drafts are not persisted.
  useEffect(() => {
    if (!open) {
      setText("");
      setError(null);
      setProcessing(false);
    } else {
      // Focus the input after the popover mounts.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  async function handleSubmit() {
    const raw = text.trim();
    if (!raw || processing) return;

    const parsed = parseTriggerCommand(raw);
    if (parsed.kind === "fallback") {
      setError(parsed.message);
      return;
    }

    setError(null);
    chat.append({ role: "user", text: raw, triggerLabel });
    const assistantId = chat.append({ role: "assistant", text: "", pending: true });

    setProcessing(true);
    onHighlightStart();
    await new Promise((r) => setTimeout(r, PROCESSING_DELAY_MS));

    onApply(parsed);
    chat.updatePending(assistantId, mockReplyFor(parsed));
    setProcessing(false);
    window.setTimeout(onHighlightEnd, HIGHLIGHT_FADE_MS);

    setText("");
    onOpenChange(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={children as React.ReactElement} />
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className={cn(
          "w-[320px] rounded-lg border border-primary/40 bg-[rgba(10,10,10,0.95)] p-3 shadow-lg backdrop-blur-[8px]"
        )}
      >
        <div className="flex flex-col gap-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Напишите что хотите изменить в интересе"
            rows={3}
            className="w-full resize-none rounded-md border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-foreground/95 placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
          />
          {error && (
            <p className="rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs text-amber-100">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between">
            <Image
              src="/mascot-icon.svg"
              alt=""
              width={16}
              height={16}
              aria-hidden
              className="opacity-60"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!text.trim() || processing}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground transition-colors",
                "bg-primary/90 text-primary-foreground hover:bg-primary disabled:bg-white/10 disabled:text-muted-foreground"
              )}
              aria-label="Применить"
            >
              {processing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep trigger-configure-popover`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/sections/signals/steps/trigger-configure-popover.tsx
git commit -m "feat(signals): TriggerConfigurePopover anchored to «Настроить»"
```

---

## Task 12: Wire popover into step-2 (replace chip flow)

**Files:**
- Modify: `src/sections/signals/steps/step-2-interests.tsx`

- [ ] **Step 1: Replace imports**

In `src/sections/signals/steps/step-2-interests.tsx`, near the top of the file:

Remove:
```tsx
import {
  applyEditToDelta,
  EMPTY_DELTA,
  isDeltaEmpty,
  parseTriggerCommand,
  removeFromDelta,
  type ParsedTriggerCommand,
  type TriggerDelta,
} from "@/lib/trigger-edit-parser";
import {
  useTriggerEditHost,
  type TriggerEditSubmitResult,
} from "@/state/trigger-edit-context";
import {
  usePromptChips,
  type ChipSegment,
} from "@/state/prompt-chips-context";
```

Replace with:
```tsx
import {
  applyEditToDelta,
  EMPTY_DELTA,
  isDeltaEmpty,
  removeFromDelta,
  type ParsedTriggerCommand,
  type TriggerDelta,
} from "@/lib/trigger-edit-parser";
import { TriggerConfigurePopover } from "./trigger-configure-popover";
```

- [ ] **Step 2: Replace `handleConfigureClick` and `submit` with popover-driven `handleApply`**

Inside the `Step2Interests` component, remove the existing `host`, `chipsApi`, `editTargetIds`, `triggerById`, `submit` registration, and `handleConfigureClick` blocks. Add a single `activePopoverTriggerId` state and a popover-driven `handleApplyParsed`.

Find this section:
```tsx
  const host = useTriggerEditHost();
  const chipsApi = usePromptChips();

  // Triggers currently in edit context = trigger ids of chips in the prompt
  // bar. ...
  const editTargetIds = useMemo(() => { ... }, [chipsApi.chips]);
  ...
  const triggerById = useMemo(() => { ... }, [availableTriggers]);
```

Replace from `const host = ...` through the end of `useEffect(() => { host.registerSubmit(submit); ... }, [host, submit]);` with:

```tsx
  const [activePopoverTriggerId, setActivePopoverTriggerId] = useState<
    string | null
  >(null);

  // The list of trigger objects available — flattened from all interests
  // selected (so user can mix triggers across multiple interests).
  const availableTriggers = useMemo<Array<{
    interest: Interest;
    trigger: Trigger;
  }>>(() => {
    return interestsForDirection
      .filter((i) => selectedInterests.includes(i.id))
      .flatMap((interest) =>
        interest.triggers.map((trigger) => ({ interest, trigger }))
      );
  }, [interestsForDirection, selectedInterests]);

  function toggleTrigger(triggerId: string) {
    setSelectedTriggers((prev) =>
      prev.includes(triggerId)
        ? prev.filter((t) => t !== triggerId)
        : [...prev, triggerId]
    );
    // Closing the trigger also closes its popover if it was open.
    setActivePopoverTriggerId((cur) => (cur === triggerId ? null : cur));
  }

  function handleApplyParsed(
    triggerId: string,
    parsed: Exclude<ParsedTriggerCommand, { kind: "fallback" }>
  ) {
    setDeltas((prev) => {
      const current = prev[triggerId] ?? EMPTY_DELTA;
      let updated: TriggerDelta;
      if (parsed.kind === "clear-added") {
        updated = { ...current, added: [] };
      } else if (parsed.kind === "clear-excluded") {
        updated = { ...current, excluded: [] };
      } else {
        updated = applyEditToDelta(current, parsed.add, parsed.exclude);
      }
      const next = { ...prev };
      if (isDeltaEmpty(updated)) delete next[triggerId];
      else next[triggerId] = updated;
      return next;
    });
  }
```

Also remove the existing `toggleTrigger` definition (the new one above replaces it). Remove the `useCallback`/`useEffect` blocks that registered the host's `submit`, plus the `host.setHint(null); host.setProcessing(false);` cleanup.

- [ ] **Step 3: Replace the `TriggerCard` render with popover-wrapped version**

Find:
```tsx
{availableTriggers.map(({ trigger }) => (
  <TriggerCard
    key={trigger.id}
    trigger={trigger}
    domains={getTriggerDomains(trigger.id)}
    selected={selectedTriggers.includes(trigger.id)}
    delta={deltas[trigger.id] ?? EMPTY_DELTA}
    isEditing={editTargetIds.has(trigger.id)}
    highlight={highlightedTriggerIds.has(trigger.id)}
    expanded={expandedTriggerIds.has(trigger.id)}
    onToggle={() => toggleTrigger(trigger.id)}
    onToggleExpanded={() => toggleExpanded(trigger.id)}
    onConfigureClick={() => handleConfigureClick(trigger.id)}
    onRemoveDelta={(bucket, domain) =>
      handleRemoveDelta(trigger.id, bucket, domain)
    }
  />
))}
```

Replace with:
```tsx
{availableTriggers.map(({ trigger }) => (
  <TriggerCard
    key={trigger.id}
    trigger={trigger}
    domains={getTriggerDomains(trigger.id)}
    selected={selectedTriggers.includes(trigger.id)}
    delta={deltas[trigger.id] ?? EMPTY_DELTA}
    isEditing={activePopoverTriggerId === trigger.id}
    highlight={highlightedTriggerIds.has(trigger.id)}
    expanded={expandedTriggerIds.has(trigger.id)}
    onToggle={() => toggleTrigger(trigger.id)}
    onToggleExpanded={() => toggleExpanded(trigger.id)}
    renderConfigureButton={(button) => (
      <TriggerConfigurePopover
        open={activePopoverTriggerId === trigger.id}
        onOpenChange={(open) =>
          setActivePopoverTriggerId(open ? trigger.id : null)
        }
        triggerLabel={trigger.label}
        onApply={(parsed) => handleApplyParsed(trigger.id, parsed)}
        onHighlightStart={() =>
          setHighlightedTriggerIds(new Set([trigger.id]))
        }
        onHighlightEnd={() => setHighlightedTriggerIds(new Set())}
      >
        {button}
      </TriggerConfigurePopover>
    )}
    onRemoveDelta={(bucket, domain) =>
      handleRemoveDelta(trigger.id, bucket, domain)
    }
  />
))}
```

- [ ] **Step 4: Update `TriggerCard` to accept `renderConfigureButton`**

In the same file, update the `TriggerCardProps` interface and the inline render:

Replace `onConfigureClick: () => void;` with:
```tsx
renderConfigureButton: (button: React.ReactElement) => React.ReactElement;
```

Replace the existing `showConfigureButton` block:
```tsx
{showConfigureButton && (
  <div className="flex">
    <button
      type="button"
      onClick={onConfigureClick}
      aria-pressed={isEditing}
      className={cn(...)}
    >
      <MascotIcon className="h-4 w-4" />
      Настроить
    </button>
  </div>
)}
```

With:
```tsx
{showConfigureButton && (
  <div className="flex">
    {renderConfigureButton(
      <button
        type="button"
        aria-pressed={isEditing}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
          isEditing
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <MascotIcon className="h-4 w-4" />
        Настроить
      </button>
    )}
  </div>
)}
```

Also remove the `onConfigureClick` destructure from the function signature.

- [ ] **Step 5: Remove the `editTargetIds.size > 0` hint paragraph**

Find:
```tsx
{hasInterest && editTargetIds.size > 0 && (
  <p className="mt-2 text-xs text-muted-foreground">
    Команды из промпт-бара применятся к ...
  </p>
)}
```

Delete that block — chip-based commands are gone.

- [ ] **Step 6: Type-check + tests**

Run: `npx tsc --noEmit 2>&1 | grep step-2-interests`
Expected: no output.

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Manual verification**

Visit `http://localhost:3001/?cap=step2&scenario=registration`. Expected:
- Click chevron on a checked trigger card to expand → domain list visible, «Настроить» button at bottom.
- Click «Настроить» → popover opens above-right of the button with placeholder «Напишите что хотите изменить в интересе».
- Type «добавь test1.ru, test2.ru» → press Enter. Popover closes; the trigger card pulses amber for ~600ms; delta block now shows two added chips.
- Open the chat panel (chevron on the bottom bar). The user message + AI response are in history.
- Click «Настроить» on a different trigger while one popover is open. Expected: previous closes, new opens.

- [ ] **Step 8: Commit**

```bash
git add src/sections/signals/steps/step-2-interests.tsx
git commit -m "feat(signals): «Настроить» opens popover; commands stream to chat"
```

---

## Task 13: Cleanup `ShellBottomBar`

**Files:**
- Modify: `src/sections/shell/shell-bottom-bar.tsx`

The trigger-edit chip flow is gone. Strip `hasTriggerChips` branches and the `useTriggerEdit` import. Keep node-chip handling (workflow uses it).

- [ ] **Step 1: Remove imports**

Remove:
```tsx
import { useTriggerEdit } from "@/state/trigger-edit-context";
```

- [ ] **Step 2: Remove `triggerEdit` and `hasTriggerChips`**

In the `ShellBottomBar` body, find:
```tsx
const triggerEdit = useTriggerEdit();
const chipsApi = usePromptChips();

const hasTriggerChips = chipsApi.chips.some((c) => c.kind === "trigger");
```

Replace with:
```tsx
const chipsApi = usePromptChips();
```

- [ ] **Step 3: Remove the trigger-chip branch in `handlePromptSubmit`**

Find and delete:
```tsx
// Trigger-edit mode: any trigger chip in the prompt-bar means the user
// is directing edits at those triggers. Pass per-chip segments through
// so each chip's command text is parsed independently.
if (hasTriggerChips && triggerEdit) {
  void triggerEdit.submit(segments).then((result) => {
    if (result.ok) {
      chipsApi.clearChips();
      editorRef.current?.clear();
    }
  });
  return;
}
```

- [ ] **Step 4: Simplify the placeholder routing**

Find:
```tsx
const chatPlaceholder =
  hasTriggerChips ? "добавь d1.ru, d2.ru   или   исключи d3.ru" :
  isOnWelcome(state) ? "Задайте вопрос…" :
  ...
```

Remove the `hasTriggerChips` line. The rest stays.

- [ ] **Step 5: Remove the trigger-edit hint and error blocks**

Find and delete the entire `{hasTriggerChips && ( ... mascot icon + hint ... )}` block (search for `data-testid="trigger-edit-hint"`).

Find and delete the entire `{triggerEdit?.hintMessage && ( ... )}` block (search for `data-testid="trigger-edit-error"`).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep shell-bottom-bar`
Expected: no output.

- [ ] **Step 7: Verify other views still work**

Visit `http://localhost:3001/` (welcome). Expected: prompt bar renders normally with welcome chips.

Visit `http://localhost:3001/?cap=step2&scenario=registration` then go to step 3, 4, etc. Expected: ChatPanel everywhere on guided-signal; bottom bar only on welcome / sections / workflow.

- [ ] **Step 8: Commit**

```bash
git add src/sections/shell/shell-bottom-bar.tsx
git commit -m "chore(shell): drop trigger-chip branch from bottom bar"
```

---

## Task 14: Narrow `trigger-edit-context`

**Files:**
- Modify: `src/state/trigger-edit-context.tsx`

The context is referenced from step-2 only (the chip flow is gone). Keep it minimal: it now exists purely so future code can stay decoupled, but for now we just delete it — no consumers remain. If `git grep useTriggerEdit` finds zero matches in `src/`, delete the file.

- [ ] **Step 1: Verify no consumers remain**

Run: `git grep -n "useTriggerEdit\|useTriggerEditHost\|TriggerEditProvider" -- 'src/**/*.tsx' 'src/**/*.ts'`
Expected: zero matches (after Task 13 removed bottom-bar's import and Task 12 removed step-2-interests' import).

- [ ] **Step 2: If zero matches, delete the file**

```bash
git rm src/state/trigger-edit-context.tsx
```

If matches still exist, fix them (they were missed by Tasks 12/13) and re-run Step 1.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit 2>&1 | grep trigger-edit
```
Expected: no output.

- [ ] **Step 4: Find and remove `<TriggerEditProvider>` mount**

Search for it: `git grep "TriggerEditProvider"`. Likely in `src/app/page.tsx` or a wizard wrapper. Remove the provider wrapper there (the provider import will already be a dangling import after `git rm` — clean it up).

Run typecheck again: `npx tsc --noEmit 2>&1 | head -20`. Expected: no `trigger-edit-context` errors.

- [ ] **Step 5: Tests**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(state): remove trigger-edit-context (chip flow retired)"
```

---

## Task 15: Smoke-test the six Figma frames

**Files:** none (manual)

This is a verification task — no code changes. Walk through each Figma frame and confirm the prototype matches.

- [ ] **Step 1: Frame 1 — «Стандартное состояние»**

Visit `http://localhost:3001/?cap=step2&scenario=registration`. Expected:
- Step-2 interface with interests + trigger cards.
- Bottom: «Работа с ИИ» panel header collapsed; chevron + maximize visible.

- [ ] **Step 2: Frame 2 — «Раскрытое пустое»**

Click the chevron in the bottom panel header. Expected:
- Panel grows upward; mascot icon + «Здесь будет история переписки с афина ИИ» visible.
- Input still at the bottom of the panel.

- [ ] **Step 3: Frame 3 — «Раскрытое с историей»**

Expand a trigger, click «Настроить», submit «добавь test1.ru, test2.ru». Repeat with 2-3 commands. Expected:
- The expanded panel now lists alternating user/assistant messages.
- User messages carry the trigger label as a chip prefix.
- Auto-scroll keeps the latest message in view.
- Fade-mask appears at top once messages overflow; bottom fade only when scrolled up.

- [ ] **Step 4: Frame 4 — «Закрытое с историей»**

Click the chevron to collapse. Expected:
- Panel shrinks to header + input row.
- History persists in state (re-expand to confirm).

- [ ] **Step 5: Frame 5 — «Сайдбар»**

From collapsed (or expanded), click the maximize icon. Expected:
- Bottom bar disappears.
- 420px sidebar slides in from the right; full-height.
- Main content shifts left smoothly.
- Step indicator (right-side) sits adjacent to the sidebar's left edge.
- History + composer all in the sidebar.

Click the X in the sidebar header. Expected: returns to whichever bar mode you were in before maximize.

- [ ] **Step 6: Frame 6 — «Поповер «Настроить»»**

Expand a trigger card, click «Настроить». Expected:
- 320px popover above-and-right of the button with yellow-ish border.
- Textarea + small mascot + send button.
- Esc closes; click-outside closes; submitting closes.
- Click «Настроить» on a different trigger while popover is open → previous closes, new opens.

- [ ] **Step 7: Free-text in chat**

In the bottom panel input (no popover), type «привет» and submit. Expected:
- User message in history.
- Pending dots in assistant bubble for ~350ms.
- Replaced by «Принял, посмотрю и сообщу. (Это прототип — реального ответа не будет.)»

- [ ] **Step 8: History reset on launch**

Walk to step-7, dispatch a launch (use `?cap=step7&scenario=registration`). Expected: when the dev-capture creates a signal in `processing` status, the chat history clears.

- [ ] **Step 9: Final commit**

If anything visual is off, file a follow-up TODO. Otherwise no commit needed.

```bash
git status  # should show clean tree
```

---

## Acceptance criteria

- All vitest tests pass.
- `npx tsc --noEmit` produces no errors that mention any new file (`chat-context`, `chat-panel*`, `chat-history-list`, `chat-composer`, `trigger-configure-popover`, `mock-ai-reply`, `plural-ru`).
- Manual smoke through 6 Figma frames passes.
- `git grep useTriggerEdit src` returns zero matches.
- Bottom bar on welcome / workflow / sections / campaigns visually unchanged.
