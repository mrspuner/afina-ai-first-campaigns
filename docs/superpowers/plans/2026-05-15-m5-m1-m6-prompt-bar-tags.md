# M5 + M1 + M6 — Теги, очередь черновиков и подсказки промпт-бара — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Внедрить AI-путь промпт-бара — клик по AI-полю узла кидает в инпут окрашенный тег, инпут держит один активный тег + текст, непринятые черновики паркуются в общую очередь черновиков (она же — комментарии M1), а под баром появляются контекстные подсказки по типу тега (M6).

**Architecture:** Вводится новый pure-reducer контекст `draft-queue-context.tsx` — единственный источник «очереди черновиков»: `Draft = { id, chip, text }`. Очередь рендерится в двух местах из одного источника — над свёрнутым баром (через `PromptBar.slot`) и внутри `ChatDrawer`. Инпут промпт-бара переводится в режим «один активный тег»: расширенный `ChipEditableInput` принимает максимум один чип, а смена тега без Enter паркует предыдущую пару (тег + текст) в очередь. Поведение Enter (свежий тег → применить / тег из очереди → вернуть в очередь / команда «Применить все» → флаш очереди) и выбор состояния зоны подсказок M6 (welcome / контекст тега / «Применить все», с приоритетом активного тега и скрытием при наборе текста) выносятся в чистые тестируемые функции `decideEnterAction` и `selectSuggestionState`. Зона подсказок под баром — новый компонент `SuggestionBar` на базе существующего `Suggestion`/`Suggestions`, питается каталогом `suggestion-catalog.ts`.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, shadcn/ui on base-ui, motion v12, vitest

**Source spec:** `docs/superpowers/specs/2026-05-15-afina-mechanics-spec.md` — Механики 5, 1, 6

---

## Worktree setup

Выполнить из корня репозитория ДО любого кода (AGENTS.md — параллельная работа всегда в воркстри):

```bash
git worktree add .worktrees/m5-prompt-bar-tags -b feature/m5-prompt-bar-tags main
cd .worktrees/m5-prompt-bar-tags
npm install
```

Все коммиты, тесты и dev-сервер — внутри `.worktrees/m5-prompt-bar-tags`. `.worktrees/` уже в `.gitignore`. Не пушить в `main` — merge оставить пользователю. По завершении сообщить путь воркстри и имя ветки.

Дев-сервер: `npm run dev` (порт 3000). Если порт занят другим воркстри — `npm run dev -- -p 3001` или гонять только `npx vitest run`.

---

## Reusable components (audit verified 2026-05-15)

| Компонент / модуль | Где лежит | Решение |
|---|---|---|
| `PromptChip`, `ChipSegment`, `promptChipsReducer`, `usePromptChips` | `src/state/prompt-chips-context.tsx` | **Расширяется** — добавить `payload`-вариант `NodeTagPayload` с `color`, добавить kind `"nodefield"` опц. (или переиспользовать `"node"`). |
| `ChipEditableInput` / `ChipEditableInputHandle` | `src/components/ai-elements/chip-editable-input.tsx` | **Расширяется** — добавить single-tag режим: окраска чипа по `payload.color`, опциональный `onTagSwap` callback, метод `getActiveSegment()`. |
| `ChatComposer` / `ChatComposerSubmitPayload` | `src/sections/shell/chat-composer.tsx` | **Расширяется** — прокинуть Enter-решение и parking-логику. |
| `PromptBar` (`slot` = зона над баром) | `src/sections/shell/prompt-bar.tsx` | **Переиспользуется как есть** — `slot` уже рендерится над инпутом. |
| `ChatPanel`, `TransientReply` | `src/sections/shell/chat-panel.tsx` | **Расширяется** — `slot` дополняется очередью; collapsed-режим. |
| `ChatDrawer` | `src/sections/shell/chat-drawer.tsx` | **Расширяется** — добавить рендер очереди над историей. |
| `ShellBottomBar` | `src/sections/shell/shell-bottom-bar.tsx` | **Расширяется** — `slot` дополняется очередью + зоной подсказок под баром. |
| `useChatSubmit` | `src/sections/shell/use-chat-submit.ts` | **Переиспользуется как есть** — параллельный путь, теги M5 идут мимо него. |
| `Suggestion`, `Suggestions` | `src/components/ai-elements/suggestion.tsx` | **Переиспользуется как есть** — база чипа подсказки. |
| `NodeCardBody` (`handleAiField`) | `src/sections/campaigns/node-card-content.tsx` | **Расширяется** — клик ✦ кидает окрашенный node-тег + node-icon. |
| `NODE_FIELD_EDITABILITY`, `getFieldMeta` | `src/state/node-field-editability.ts` | **Переиспользуется как есть** — каталог manual/ai полей готов (M5.1/M5.2 уже частично есть). |
| `NODE_ACTIONS`, `matchActions` | `src/state/node-actions.ts` | **Переиспользуется как есть** — `promptTemplate` для тегов, `parse`/`matchActions` для применения очереди. |
| `STYLES` (цвета узлов) | `src/sections/campaigns/workflow-node.tsx` | **Расширяется** — `STYLES` + `ICON` выносятся в новый `node-visuals.ts` для переиспользования тегами. |
| `chatReducer` / `useChat` | `src/state/chat-context.tsx` | **Переиспользуется как есть**. |
| `prompt-chips-context.test.ts`, `chat-context.test.ts` | `src/state/` | **Паттерн для новых тестов**. |

**Создаётся новым:** `draft-queue-context.tsx` (+ reducer + тест), `prompt-bar-enter.ts` (Enter-логика + тест), `suggestion-state.ts` (выбор состояния подсказок + тест), `suggestion-catalog.ts` (данные + тест), `node-visuals.ts` (вынос STYLES/ICON), `draft-queue-list.tsx` (UI карточек очереди), `suggestion-bar.tsx` (UI зоны подсказок).

---

## File structure

**Created:**
- `src/state/draft-queue-context.tsx` — `Draft`, `DraftQueueState`, `draftQueueReducer`, `DraftQueueProvider`, `useDraftQueue`.
- `src/state/draft-queue-context.test.ts` — TDD для `draftQueueReducer`.
- `src/state/prompt-bar-enter.ts` — `decideEnterAction` (чистая функция выбора ветки Enter).
- `src/state/prompt-bar-enter.test.ts` — TDD для `decideEnterAction`.
- `src/state/suggestion-state.ts` — `selectSuggestionState` (чистый выбор состояния M6).
- `src/state/suggestion-state.test.ts` — TDD для `selectSuggestionState`.
- `src/state/suggestion-catalog.ts` — `SUGGESTION_CATALOG`, `getSuggestionsForTag`.
- `src/state/suggestion-catalog.test.ts` — TDD для `getSuggestionsForTag`.
- `src/sections/campaigns/node-visuals.ts` — вынесенные `NODE_STYLES`, `NODE_ICON`, `getNodeVisual`.
- `src/sections/shell/draft-queue-list.tsx` — UI: карточки очереди (над баром / в дровере).
- `src/sections/shell/suggestion-bar.tsx` — UI: зона подсказок под баром.

**Modified:**
- `src/state/prompt-chips-context.tsx` — `NodeTagPayload` тип, `color` в payload, экспорт хелпера `isNodeTagPayload`.
- `src/components/ai-elements/chip-editable-input.tsx` — single-tag режим: окраска чипа по `color`, `getActiveSegment()`, `onTagSwap`.
- `src/sections/campaigns/workflow-node.tsx` (строки 1–57) — импорт `NODE_STYLES`/`NODE_ICON` из `node-visuals.ts` вместо локальных.
- `src/sections/campaigns/node-card-content.tsx` (`handleAiField` ~163–173) — окрашенный node-тег + цвет узла; node-тег целиком.
- `src/sections/shell/chat-composer.tsx` (весь файл) — parking при смене тега, ветвление Enter через `decideEnterAction`.
- `src/sections/shell/chat-panel.tsx` (`ChatPanel` ~69–81) — `slot` дополнен `DraftQueueList`; зона подсказок под баром.
- `src/sections/shell/chat-drawer.tsx` (~58–64) — `DraftQueueList` над историей.
- `src/sections/shell/shell-bottom-bar.tsx` (~191–283) — `slot` дополнен `DraftQueueList`; `SuggestionBar` под инпутом.
- `src/app/page.tsx` (~63–93) — `DraftQueueProvider` в дереве провайдеров (внутри `ChatProvider`).

---

## Tasks

### M5

---

### Task 1: Расширить модель чипа под node-теги (M5.3 prep)

**Files:**
- Modify: `src/state/prompt-chips-context.tsx` (строки 13–22, дополнить экспортами в конце файла)
- Test: `src/state/prompt-chips-context.test.ts` (дополнить — модель остаётся pure)

- [ ] **Step 1: Дописать тест на node-tag payload**
В `src/state/prompt-chips-context.test.ts` внутри `describe("promptChipsReducer", ...)` добавить:
```ts
  it("preserves NodeTagPayload with color on push", () => {
    const next = promptChipsReducer(
      { chips: [] },
      {
        type: "push",
        chip: {
          id: "nodefield_n1_Текст",
          kind: "node",
          label: "Текст",
          payload: { nodeId: "n1", nodeType: "sms", color: "#5eead4", paramLabel: "Текст" },
          removable: true,
        },
      }
    );
    const p = next.chips[0].payload as { color: string; nodeId: string };
    expect(p.color).toBe("#5eead4");
    expect(p.nodeId).toBe("n1");
  });
```
Запустить: `npx vitest run src/state/prompt-chips-context.test.ts` — ожидать FAIL (тип `NodeTagPayload` ещё не существует, TS-ошибка компиляции).

- [ ] **Step 2: Добавить тип `NodeTagPayload` и хелпер `isNodeTagPayload`**
В `src/state/prompt-chips-context.tsx` после `interface PromptChip` (строка 22) вставить:
```ts
/**
 * Payload для тега AI-поля или узла целиком (M5). `paramLabel` отсутствует у
 * тега узла целиком — у него тег обозначает весь узел, а не один параметр.
 */
export interface NodeTagPayload {
  /** id узла workflow/карточки. */
  nodeId: string;
  /** kind узла — нужен для выбора цвета/иконки и каталога подсказок. */
  nodeType: string;
  /** Цвет узла (hex) — пилл окрашивается в него. */
  color: string;
  /** Имя параметра. undefined → тег узла целиком. */
  paramLabel?: string;
}

/** Type guard: payload чипа — это NodeTagPayload. */
export function isNodeTagPayload(payload: unknown): payload is NodeTagPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as NodeTagPayload).nodeId === "string" &&
    typeof (payload as NodeTagPayload).color === "string"
  );
}
```
Запустить: `npx vitest run src/state/prompt-chips-context.test.ts` — ожидать PASS (все тесты, включая новый).

- [ ] **Step 3: Commit** — `git commit -am "feat(m5): add NodeTagPayload model to prompt chips"`

---

### Task 2: Вынести цвета и иконки узлов в `node-visuals.ts` (M5.2/M5.3 prep)

**Files:**
- Create: `src/sections/campaigns/node-visuals.ts`
- Modify: `src/sections/campaigns/workflow-node.tsx` (строки 1–57 — импорт вместо локальных `STYLES`/`ICON`)
- Test: нет (чистая re-экспортная структура; покрывается типами + Verify через рендер)

- [ ] **Step 1: Создать `src/sections/campaigns/node-visuals.ts`**
```ts
import {
  SignalLow,
  GitFork,
  Clock,
  GitBranch,
  Merge,
  MessageSquare,
  Mail,
  Bell,
  Phone,
  Store,
  LayoutTemplate,
  CheckCircle2,
  CircleStop,
  type LucideIcon,
} from "lucide-react";
import type { WorkflowNodeType } from "@/types/workflow";

export interface NodeStyle {
  border: string;
  bg: string;
  color: string;
}

/** Цвета узлов workflow. Источник правды для самой карточки И для тегов (M5). */
export const NODE_STYLES: Record<WorkflowNodeType, NodeStyle> = {
  signal:     { border: "#1e3a8a", bg: "#050815", color: "#93c5fd" },
  success:    { border: "#14532d", bg: "#030d06", color: "#4ade80" },
  end:        { border: "#374151", bg: "#0a0a0a", color: "#9ca3af" },
  split:      { border: "#4c1d95", bg: "#0d0819", color: "#a78bfa" },
  wait:       { border: "#713f12", bg: "#0f0a03", color: "#fbbf24" },
  condition:  { border: "#065f46", bg: "#052e23", color: "#34d399" },
  merge:      { border: "#3730a3", bg: "#0a0920", color: "#818cf8" },
  sms:        { border: "#134e4a", bg: "#030f0e", color: "#5eead4" },
  email:      { border: "#155e75", bg: "#03141a", color: "#67e8f9" },
  push:       { border: "#1e40af", bg: "#050c1e", color: "#93c5fd" },
  ivr:        { border: "#6d28d9", bg: "#0e051b", color: "#c4b5fd" },
  storefront: { border: "#9a3412", bg: "#1a0806", color: "#fb923c" },
  landing:    { border: "#b45309", bg: "#1a0f03", color: "#fbbf24" },
  default:    { border: "#2a2a2a", bg: "#111111", color: "#e5e5e5" },
  channel:    { border: "#134e4a", bg: "#030f0e", color: "#5eead4" },
  retarget:   { border: "#7f1d1d", bg: "#110505", color: "#f87171" },
  result:     { border: "#14532d", bg: "#030d06", color: "#4ade80" },
  new:        { border: "#78350f", bg: "#0f0a03", color: "#fbbf24" },
};

export const NODE_ICON: Partial<Record<WorkflowNodeType, LucideIcon>> = {
  signal: SignalLow,
  split: GitFork,
  wait: Clock,
  condition: GitBranch,
  merge: Merge,
  sms: MessageSquare,
  email: Mail,
  push: Bell,
  ivr: Phone,
  storefront: Store,
  landing: LayoutTemplate,
  success: CheckCircle2,
  end: CircleStop,
};

/** Цвет узла по kind. Падает на `default`, если kind неизвестен. */
export function getNodeColor(nodeType: string): string {
  return (NODE_STYLES[nodeType as WorkflowNodeType] ?? NODE_STYLES.default).color;
}

/** Иконка узла по kind, либо undefined (узел без иконки). */
export function getNodeIcon(nodeType: string): LucideIcon | undefined {
  return NODE_ICON[nodeType as WorkflowNodeType];
}
```

- [ ] **Step 2: Переключить `workflow-node.tsx` на `node-visuals.ts`**
В `src/sections/campaigns/workflow-node.tsx`: удалить локальные блоки `interface NodeStyle` (строки 27–31), `const STYLES` (строки 33–57), `const ICON` (строки 59–73), а также иконочные импорты `lucide-react`, оставшиеся неиспользованными (`SignalLow`…`CircleStop`, оставить `Handle`-несвязанные). Добавить импорт:
```ts
import { NODE_STYLES, NODE_ICON } from "./node-visuals";
```
В теле `WorkflowNodeComponent` заменить `STYLES[data.nodeType] ?? STYLES.default` → `NODE_STYLES[data.nodeType] ?? NODE_STYLES.default`, и `ICON[data.nodeType]` → `NODE_ICON[data.nodeType]`. (`X` из lucide-react оставить, если ещё используется ниже по файлу — проверить grep `<X`.)

- [ ] **Step 3: Verify** — Run: `npx vitest run && npm run lint` для воркстри; затем `open http://localhost:3000` → собрать workflow с узлами; Expected: узлы рендерятся с теми же цветами и иконками, что и раньше, лишних TS/lint-ошибок нет.

- [ ] **Step 4: Commit** — `git commit -am "refactor(m5): extract node colors/icons to node-visuals"`

---

### Task 3: Очередь черновиков — reducer и контекст (M5.5 ядро, общий контракт M5/M1/M6)

**Files:**
- Create: `src/state/draft-queue-context.tsx`
- Create (Test): `src/state/draft-queue-context.test.ts`
- Modify: `src/app/page.tsx` (строки 63–93 — добавить `DraftQueueProvider`)

- [ ] **Step 1: Написать тест `draft-queue-context.test.ts` (TDD — FAIL первым)**
```ts
import { describe, it, expect } from "vitest";
import {
  draftQueueReducer,
  type DraftQueueState,
} from "./draft-queue-context";
import type { PromptChip } from "./prompt-chips-context";

const empty: DraftQueueState = { drafts: [] };

function chip(id: string, label = "Текст"): PromptChip {
  return {
    id,
    kind: "node",
    label,
    payload: { nodeId: id, nodeType: "sms", color: "#5eead4", paramLabel: label },
    removable: true,
  };
}

describe("draftQueueReducer", () => {
  it("park adds a draft with chip + text", () => {
    const next = draftQueueReducer(empty, {
      type: "park",
      id: "d1",
      chip: chip("nodefield_n1_Текст"),
      text: "сделай дружелюбнее",
    });
    expect(next.drafts).toHaveLength(1);
    expect(next.drafts[0].id).toBe("d1");
    expect(next.drafts[0].text).toBe("сделай дружелюбнее");
  });

  it("park dedupes by chip.id — re-parking the same tag replaces its draft", () => {
    let s = draftQueueReducer(empty, {
      type: "park",
      id: "d1",
      chip: chip("nodefield_n1_Текст"),
      text: "первый",
    });
    s = draftQueueReducer(s, {
      type: "park",
      id: "d2",
      chip: chip("nodefield_n1_Текст"),
      text: "переписал",
    });
    expect(s.drafts).toHaveLength(1);
    expect(s.drafts[0].text).toBe("переписал");
  });

  it("park keeps drafts for different chips side by side", () => {
    let s = draftQueueReducer(empty, {
      type: "park",
      id: "d1",
      chip: chip("nodefield_n1_Текст"),
      text: "a",
    });
    s = draftQueueReducer(s, {
      type: "park",
      id: "d2",
      chip: chip("nodefield_n2_Тема"),
      text: "b",
    });
    expect(s.drafts).toHaveLength(2);
  });

  it("park with empty text is a no-op (nothing to queue)", () => {
    const s = draftQueueReducer(empty, {
      type: "park",
      id: "d1",
      chip: chip("nodefield_n1_Текст"),
      text: "   ",
    });
    expect(s).toBe(empty);
  });

  it("remove drops a draft by id", () => {
    const s = draftQueueReducer(empty, {
      type: "park",
      id: "d1",
      chip: chip("nodefield_n1_Текст"),
      text: "a",
    });
    const after = draftQueueReducer(s, { type: "remove", id: "d1" });
    expect(after.drafts).toEqual([]);
  });

  it("clear empties the queue", () => {
    const s = draftQueueReducer(empty, {
      type: "park",
      id: "d1",
      chip: chip("nodefield_n1_Текст"),
      text: "a",
    });
    expect(draftQueueReducer(s, { type: "clear" }).drafts).toEqual([]);
  });

  it("clear on an empty queue returns the same reference", () => {
    expect(draftQueueReducer(empty, { type: "clear" })).toBe(empty);
  });
});
```
Запустить: `npx vitest run src/state/draft-queue-context.test.ts` — ожидать FAIL (модуль не существует).

- [ ] **Step 2: Создать `src/state/draft-queue-context.tsx`**
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
import type { PromptChip } from "./prompt-chips-context";

/**
 * Один непринятый черновик: тег (PromptChip) + написанный к нему текст.
 * Очередь черновиков — общий контракт M5 (парковка), M1 (комментарии = та же
 * очередь) и M6 («Применить все» зависит от непустоты очереди).
 */
export interface Draft {
  id: string;
  chip: PromptChip;
  text: string;
}

export interface DraftQueueState {
  drafts: Draft[];
}

export type DraftQueueAction =
  | { type: "park"; id: string; chip: PromptChip; text: string }
  | { type: "remove"; id: string }
  | { type: "clear" };

/**
 * Pure reducer очереди черновиков.
 * - park: добавляет черновик; дедуп по chip.id (один черновик на тег — спека
 *   M1 «на каждый тег один черновик»). Пустой текст — no-op.
 * - remove: выбрасывает черновик по id.
 * - clear: опустошает очередь (для «Применить все»).
 */
export function draftQueueReducer(
  state: DraftQueueState,
  action: DraftQueueAction
): DraftQueueState {
  switch (action.type) {
    case "park": {
      if (action.text.trim().length === 0) return state;
      const draft: Draft = { id: action.id, chip: action.chip, text: action.text };
      const existingIdx = state.drafts.findIndex(
        (d) => d.chip.id === action.chip.id
      );
      if (existingIdx >= 0) {
        const drafts = state.drafts.slice();
        drafts[existingIdx] = draft;
        return { drafts };
      }
      return { drafts: [...state.drafts, draft] };
    }
    case "remove":
      return { drafts: state.drafts.filter((d) => d.id !== action.id) };
    case "clear":
      return state.drafts.length === 0 ? state : { drafts: [] };
  }
}

export const INITIAL_DRAFT_QUEUE_STATE: DraftQueueState = { drafts: [] };

interface DraftQueueApi {
  drafts: readonly Draft[];
  /** Паркует тег + текст в очередь. Возвращает id черновика. */
  parkDraft: (chip: PromptChip, text: string) => string;
  /** Удаляет черновик по id (✕ на карточке). */
  removeDraft: (id: string) => void;
  /** Достаёт черновик из очереди (клик по карточке → возврат в инпут). */
  takeDraft: (id: string) => Draft | null;
  /** Очищает всю очередь (после «Применить все»). */
  clearQueue: () => void;
}

const Ctx = createContext<DraftQueueApi | null>(null);

export function DraftQueueProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(draftQueueReducer, INITIAL_DRAFT_QUEUE_STATE);

  const parkDraft = useCallback((chip: PromptChip, text: string): string => {
    const id = `draft_${nanoid(6)}`;
    dispatch({ type: "park", id, chip, text });
    return id;
  }, []);

  const removeDraft = useCallback((id: string) => {
    dispatch({ type: "remove", id });
  }, []);

  // takeDraft читает текущий state через ref-замыкание над reducer state —
  // безопасно, т.к. вызывается только из обработчиков событий (не в render).
  const draftsRef = state.drafts;
  const takeDraft = useCallback(
    (id: string): Draft | null => {
      const found = draftsRef.find((d) => d.id === id) ?? null;
      if (found) dispatch({ type: "remove", id });
      return found;
    },
    [draftsRef]
  );

  const clearQueue = useCallback(() => dispatch({ type: "clear" }), []);

  const api = useMemo<DraftQueueApi>(
    () => ({ drafts: state.drafts, parkDraft, removeDraft, takeDraft, clearQueue }),
    [state.drafts, parkDraft, removeDraft, takeDraft, clearQueue]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useDraftQueue(): DraftQueueApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useDraftQueue must be used within <DraftQueueProvider>.");
  }
  return ctx;
}
```
Запустить: `npx vitest run src/state/draft-queue-context.test.ts` — ожидать PASS (все 7 тестов).

- [ ] **Step 3: Подключить `DraftQueueProvider` в `page.tsx`**
В `src/app/page.tsx` добавить импорт `import { DraftQueueProvider } from "@/state/draft-queue-context";`. В дереве провайдеров обернуть внутри `ChatProvider` (строки 67–89): после `<ChatProvider>` и до `<TriggerEditRegistryProvider>` поставить `<DraftQueueProvider>`, и закрыть `</DraftQueueProvider>` после `</TriggerEditRegistryProvider>`. Итог:
```tsx
        <ChatProvider>
        <DraftQueueProvider>
        <TriggerEditRegistryProvider>
        ...
        </TriggerEditRegistryProvider>
        </DraftQueueProvider>
        </ChatProvider>
```

- [ ] **Step 4: Verify** — Run: `npx vitest run src/state/draft-queue-context.test.ts` и `open http://localhost:3000`; Expected: тесты зелёные; приложение грузится без ошибок контекста в консоли.

- [ ] **Step 5: Commit** — `git commit -am "feat(m5): add draft-queue reducer + context provider"`

---

### Task 4: Single-tag режим в `ChipEditableInput` — окраска и активный сегмент (M5.3)

**Files:**
- Modify: `src/components/ai-elements/chip-editable-input.tsx` (строки 26–37 — `ChipEditableInputHandle`; 394–403 — `createChipElement`; useImperativeHandle 261–310)
- Test: нет юнит-теста (DOM-компонент; verify визуально). Чистая логичная часть Enter — отдельный модуль в Task 8.

- [ ] **Step 1: Окрасить пилл чипа по `payload.color`**
В `src/components/ai-elements/chip-editable-input.tsx` заменить функцию `createChipElement` (строки 394–403) на:
```ts
function createChipElement(chip: PromptChip): HTMLElement {
  const el = document.createElement("span");
  el.contentEditable = "false";
  el.setAttribute("data-chip-id", chip.id);
  el.setAttribute("data-chip-kind", chip.kind);
  el.className =
    "mx-0.5 inline-flex select-none items-center gap-1 rounded-md border px-2 py-0.5 align-baseline text-xs font-medium";
  // Окраска по цвету узла (NodeTagPayload). Прочие чипы — нейтральный стиль.
  const payload = chip.payload as { color?: string } | null;
  const color = payload && typeof payload.color === "string" ? payload.color : null;
  if (color) {
    el.style.borderColor = `${color}66`;
    el.style.backgroundColor = `${color}1f`;
    el.style.color = color;
  } else {
    el.classList.add("border-white/15", "bg-white/10", "text-white");
  }
  el.textContent = chip.label;
  return el;
}
```
> Примечание: иконка узла внутри пилла — текстовая префиксная метка не нужна; узнаваемость даёт цвет. Иконку SVG в contenteditable не вставляем (комментарий в шапке файла объясняет, почему `<img>` в contenteditable артефачит). Если иконка обязательна — добавить как Unicode-точку `●` того же цвета перед label: `el.textContent = "● " + chip.label;` — допустимо, но цвет уже несёт смысл.

- [ ] **Step 2: Добавить `getActiveSegment()` в `ChipEditableInputHandle`**
В интерфейс `ChipEditableInputHandle` (строки 26–37) добавить:
```ts
  /**
   * Возвращает единственный активный сегмент (тег + текст после него), либо
   * null если в инпуте нет тега. M5: инпут держит один активный тег.
   */
  getActiveSegment(): ChipSegment | null;
```
В `useImperativeHandle` (строки 261–310) после `getSegments()` добавить метод:
```ts
      getActiveSegment() {
        const ed = editorRef.current;
        if (!ed) return null;
        const stateById = new Map(chips.map((c) => [c.id, c] as const));
        let currentChip: PromptChip | null = null;
        let buffer = "";
        ed.childNodes.forEach((node) => {
          if (
            node instanceof HTMLElement &&
            node.dataset.chipId &&
            stateById.has(node.dataset.chipId)
          ) {
            currentChip = stateById.get(node.dataset.chipId)!;
          } else if (node.nodeType === Node.TEXT_NODE) {
            buffer += node.textContent ?? "";
          } else if (node instanceof HTMLElement && node.tagName === "BR") {
            buffer += "\n";
          }
        });
        return currentChip ? { chip: currentChip, text: buffer.trim() } : null;
      },
```

- [ ] **Step 3: Verify** — Run: `open http://localhost:3000` → workflow → выбрать узел → клик по ✦ AI-полю; Expected: в инпуте появляется тег, окрашенный в цвет узла (например, бирюзовый у SMS-узла).

- [ ] **Step 4: Commit** — `git commit -am "feat(m5): colored single-tag mode in ChipEditableInput"`

---

### Task 5: Клик ✦ по AI-полю → окрашенный node-тег в инпут (M5.3)

**Files:**
- Modify: `src/sections/campaigns/node-card-content.tsx` (`handleAiField` строки 163–173, импорты строки 1–11)
- Test: нет (UI; verify визуально)

- [ ] **Step 1: Прокинуть цвет узла в node-тег**
В `src/sections/campaigns/node-card-content.tsx` добавить импорты:
```ts
import { getNodeColor } from "./node-visuals";
import type { NodeTagPayload } from "@/state/prompt-chips-context";
```
Заменить `handleAiField` (строки 163–173) на:
```ts
  function handleAiField(rowLabel: string) {
    const template = templateByLabel.get(rowLabel);
    if (template) insertPrompt(template);
    const nodeType = data.params?.kind ?? "default";
    const payload: NodeTagPayload = {
      nodeId: id,
      nodeType,
      color: getNodeColor(nodeType),
      paramLabel: rowLabel,
    };
    pushChip({
      // Один активный тег на инпут — id фиксированный по узлу+полю, повторный
      // клик переписывает чип, а не плодит новые (push дедупит по id).
      id: `nodefield_${id}_${rowLabel}`,
      kind: "node",
      // Имя узла не пишем — цвет тега обозначает узел (спека M5.2).
      label: rowLabel,
      payload,
      removable: true,
    });
  }
```
> Примечание: `label` меняется с `${data.label} · ${rowLabel}` на просто `rowLabel` — спека M5.2: «Имя узла НЕ пишется — иконка/цвет узла его обозначает».

- [ ] **Step 2: Verify** — Run: `open http://localhost:3000` → workflow → выбрать SMS-узел → клик по ✦ у поля «Alpha-name»; Expected: в промпт-баре появляется один тег «Alpha-name» в бирюзовом цвете узла, в инпуте — шаблон `alpha-name: `.

- [ ] **Step 3: Commit** — `git commit -am "feat(m5): AI-field click pushes colored node tag"`

---

### Task 6: Тег узла целиком (M5.4)

**Files:**
- Modify: `src/sections/shell/shell-bottom-bar.tsx` (`SelectedNodeChipEffect` строки 59–83)
- Test: нет (UI; verify визуально)

- [ ] **Step 1: Окрасить тег выбранного узла**
`SelectedNodeChipEffect` сейчас зеркалит выбранный узел в чип `node_${id}` нейтрального вида. Расширить, чтобы тег узла целиком окрашивался цветом узла. В `src/sections/shell/shell-bottom-bar.tsx` изменить проп `selected` и эффект. Заменить `SelectedNodeChipEffect` (строки 59–83) на:
```tsx
function SelectedNodeChipEffect({
  selected,
}: {
  selected: { id: string; label: string; nodeType?: string } | null;
}) {
  const { pushChip } = usePromptChips();

  // Каждый выбор узла на канвасе кладёт окрашенный тег узла целиком в инпут.
  // pushChip дедупит по id — повторный клик по тому же узлу no-op.
  useEffect(() => {
    if (!selected) return;
    const nodeType = selected.nodeType ?? "default";
    pushChip({
      id: `node_${selected.id}`,
      kind: "node",
      label: selected.label,
      payload: {
        nodeId: selected.id,
        nodeType,
        color: getNodeColor(nodeType),
        // paramLabel отсутствует → тег узла целиком.
      } satisfies import("@/state/prompt-chips-context").NodeTagPayload,
      removable: true,
    });
  }, [selected, pushChip]);

  return null;
}
```
Добавить импорт в начало файла: `import { getNodeColor } from "@/sections/campaigns/node-visuals";`.
> Примечание: если `selectedWorkflowNode` в `app-state` не содержит `nodeType`, передать `nodeType` отдельно из данных узла там, где формируется `selectedWorkflowNode` (искать dispatch `workflow_node_selected` / поле `selectedWorkflowNode`). Если поля нет — добавить `nodeType` в payload селекта узла; иначе fallback `"default"` даст нейтрально-серый тег, что допустимо для прототипа, но цвет — лучше. Минимально: оставить `nodeType` опциональным и fallback `"default"`.

- [ ] **Step 2: Verify** — Run: `open http://localhost:3000` → workflow → клик по телу узла (не по ✦); Expected: в промпт-баре появляется тег с именем узла, окрашенный в цвет узла.

- [ ] **Step 3: Commit** — `git commit -am "feat(m5): whole-node tag colored by node color"`

---

### Task 7: UI очереди черновиков — `DraftQueueList` над баром и в дровере (M5.5/M5.6)

**Files:**
- Create: `src/sections/shell/draft-queue-list.tsx`
- Modify: `src/sections/shell/chat-panel.tsx` (`ChatPanel` строки 69–81)
- Modify: `src/sections/shell/chat-drawer.tsx` (строки 58–64)
- Modify: `src/sections/shell/shell-bottom-bar.tsx` (`slot` строки 191–222)
- Test: нет (UI; verify визуально)

- [ ] **Step 1: Создать `src/sections/shell/draft-queue-list.tsx`**
```tsx
"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useDraftQueue, type Draft } from "@/state/draft-queue-context";
import { isNodeTagPayload } from "@/state/prompt-chips-context";

interface DraftQueueListProps {
  /** Клик по карточке → вернуть черновик в инпут (передаётся из композера). */
  onTakeDraft: (draft: Draft) => void;
  /** "compact" — над свёрнутым баром; "drawer" — внутри дровера. */
  variant?: "compact" | "drawer";
}

/**
 * Очередь черновиков. Один источник данных (useDraftQueue), два представления:
 * над свёрнутым баром (PromptBar.slot) и внутри ChatDrawer.
 * Карточка = тег (окрашенный) + текст черновика. Клик по карточке возвращает
 * черновик в инпут; ✕ выбрасывает черновик.
 */
export function DraftQueueList({ onTakeDraft, variant = "compact" }: DraftQueueListProps) {
  const { drafts, removeDraft } = useDraftQueue();
  if (drafts.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <AnimatePresence initial={false}>
        {drafts.map((draft) => {
          const payload = draft.chip.payload;
          const color = isNodeTagPayload(payload) ? payload.color : "#a3a3a3";
          return (
            <motion.div
              key={draft.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
              className="group flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2"
            >
              <button
                type="button"
                onClick={() => onTakeDraft(draft)}
                className="flex min-w-0 flex-1 items-start gap-2 text-left"
              >
                <span
                  className="mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
                  style={{
                    borderColor: `${color}66`,
                    backgroundColor: `${color}1f`,
                    color,
                  }}
                >
                  {draft.chip.label}
                </span>
                <span className="min-w-0 flex-1 truncate pt-0.5 text-xs text-white/80">
                  {draft.text}
                </span>
              </button>
              <button
                type="button"
                aria-label="Выбросить черновик"
                onClick={() => removeDraft(draft.id)}
                className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-60 transition-opacity hover:opacity-100 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {variant === "drawer" && drafts.length > 0 && (
        <span className="px-1 pt-0.5 text-[10px] text-muted-foreground">
          Черновиков в очереди: {drafts.length}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Прокинуть `DraftQueueList` в `ChatPanel.slot`**
В `src/sections/shell/chat-panel.tsx` заменить `ChatPanel` (строки 69–81). Очередь и `TransientReply` живут в одной зоне над баром; `onTakeDraft` будет реализован в Task 8 (пока — заглушка-проп, переданная из `ChatComposer`). Промежуточно: рендерить очередь, а возврат в инпут делегировать `ChatComposer` через ref/контекст. Самый чистый путь — оба (`DraftQueueList` и композер) внутри одного компонента, чтобы `onTakeDraft` имел доступ к ref композера. Заменить на:
```tsx
export function ChatPanel({ placeholder }: { placeholder: string }) {
  const chat = useChat();
  const { submit } = useChatSubmit();
  const composerRef = useRef<ChatComposerHandle>(null);

  return (
    <PromptBar
      onOpenDrawer={chat.openSidebar}
      slot={
        <>
          <DraftQueueList
            variant="compact"
            onTakeDraft={(draft) => composerRef.current?.loadDraft(draft)}
          />
          <TransientReply messages={chat.messages} />
        </>
      }
    >
      <ChatComposer ref={composerRef} placeholder={placeholder} onSubmit={submit} />
    </PromptBar>
  );
}
```
Добавить импорты: `import { useRef } from "react";` (расширить существующий импорт `react`), `import { DraftQueueList } from "./draft-queue-list";`, и `type ChatComposerHandle` из `./chat-composer` (тип создаётся в Task 8). До Task 8 этот файл не компилируется — допустимо: Task 7 и Task 8 коммитятся последовательно, но Verify Task 7 выполняется ПОСЛЕ Task 8. Чтобы Task 7 был самодостаточным — на этом шаге временно использовать `onTakeDraft={() => {}}` и `<ChatComposer placeholder={...} onSubmit={submit} />` без ref, а ref подключить в Task 8. **Применить именно временный вариант** — финальный код выше станет актуальным после Task 8.

  Временный вариант для коммита Task 7:
```tsx
export function ChatPanel({ placeholder }: { placeholder: string }) {
  const chat = useChat();
  const { submit } = useChatSubmit();

  return (
    <PromptBar
      onOpenDrawer={chat.openSidebar}
      slot={
        <>
          <DraftQueueList variant="compact" onTakeDraft={() => {}} />
          <TransientReply messages={chat.messages} />
        </>
      }
    >
      <ChatComposer placeholder={placeholder} onSubmit={submit} />
    </PromptBar>
  );
}
```

- [ ] **Step 3: Добавить `DraftQueueList` в `ChatDrawer`**
В `src/sections/shell/chat-drawer.tsx` после `ChatPanelHeader` и до блока истории (между строками 57 и 58) вставить:
```tsx
          <DraftQueueList variant="drawer" onTakeDraft={() => {}} />
```
Добавить импорт `import { DraftQueueList } from "./draft-queue-list";`. (Полноценный `onTakeDraft` для дровера — отдельный композер дровера; в прототипе достаточно показа очереди + ✕. Возврат-в-инпут из дровера можно оставить no-op: спека требует «вернуться и переписать» в основном через карточку над баром.)

- [ ] **Step 4: Добавить `DraftQueueList` в `slot` `ShellBottomBar`**
В `src/sections/shell/shell-bottom-bar.tsx` в `PromptBar` проп `slot` (строки 193–221) обернуть существующий budget-help-блок так, чтобы очередь рендерилась всегда сверху:
```tsx
        slot={
          <>
            <DraftQueueList variant="compact" onTakeDraft={() => {}} />
            {view.kind === "guided-signal" &&
            wizardCurrentStep === 5 &&
            budgetHelpShown ? (
              <motion.div
                key="budget-help-answer"
                /* ...существующий budget-help motion.div без изменений... */
              >
                {/* ...существующее содержимое... */}
              </motion.div>
            ) : null}
          </>
        }
```
Добавить импорт `import { DraftQueueList } from "./draft-queue-list";`.

- [ ] **Step 5: Verify** — Run: `open http://localhost:3000` → workflow → клик ✦ у поля A → набрать текст → клик ✦ у другого поля; Expected: после M5.5 (Task 8) первый черновик карточкой появится над баром. Пока (без Task 8) проверить только что приложение собирается и dev-tools без ошибок: `npm run lint`.

- [ ] **Step 6: Commit** — `git commit -am "feat(m5): draft-queue list UI above bar and in drawer"`

---

### Task 8: Парковка при смене тега + Enter-логика (M5.5/M5.6/M5.7)

**Files:**
- Create: `src/state/prompt-bar-enter.ts`
- Create (Test): `src/state/prompt-bar-enter.test.ts`
- Modify: `src/sections/shell/chat-composer.tsx` (весь файл)
- Modify: `src/sections/shell/chat-panel.tsx` (`ChatPanel` — подключить ref, как в финальном варианте Task 7)
- Test для composer: нет (UI-glue; чистая логика — в `prompt-bar-enter.ts`)

- [ ] **Step 1: Написать тест `prompt-bar-enter.test.ts` (TDD — FAIL первым)**
```ts
import { describe, it, expect } from "vitest";
import { decideEnterAction, APPLY_ALL_COMMAND } from "./prompt-bar-enter";

describe("decideEnterAction", () => {
  it("fresh tag with text → apply immediately to the node", () => {
    const r = decideEnterAction({
      hasActiveTag: true,
      activeTagFromQueue: false,
      activeText: "сделай дружелюбнее",
      queueLength: 0,
    });
    expect(r.kind).toBe("apply-tag");
  });

  it("tag returned from the queue → re-park, do not apply", () => {
    const r = decideEnterAction({
      hasActiveTag: true,
      activeTagFromQueue: true,
      activeText: "переписанный текст",
      queueLength: 1,
    });
    expect(r.kind).toBe("park-tag");
  });

  it("apply-all command text + non-empty queue → flush whole queue", () => {
    const r = decideEnterAction({
      hasActiveTag: false,
      activeTagFromQueue: false,
      activeText: APPLY_ALL_COMMAND,
      queueLength: 3,
    });
    expect(r.kind).toBe("apply-all");
  });

  it("apply-all command but empty queue → falls through to free-text", () => {
    const r = decideEnterAction({
      hasActiveTag: false,
      activeTagFromQueue: false,
      activeText: APPLY_ALL_COMMAND,
      queueLength: 0,
    });
    expect(r.kind).toBe("free-text");
  });

  it("tag present but no text typed → noop (nothing to apply or park)", () => {
    const r = decideEnterAction({
      hasActiveTag: true,
      activeTagFromQueue: false,
      activeText: "   ",
      queueLength: 0,
    });
    expect(r.kind).toBe("noop");
  });

  it("no tag, free text → free-text branch", () => {
    const r = decideEnterAction({
      hasActiveTag: false,
      activeTagFromQueue: false,
      activeText: "лёгкий запрос",
      queueLength: 0,
    });
    expect(r.kind).toBe("free-text");
  });

  it("apply-all command is matched case-insensitively and trimmed", () => {
    const r = decideEnterAction({
      hasActiveTag: false,
      activeTagFromQueue: false,
      activeText: "  Применить Все Изменения  ",
      queueLength: 2,
    });
    expect(r.kind).toBe("apply-all");
  });
});
```
Запустить: `npx vitest run src/state/prompt-bar-enter.test.ts` — ожидать FAIL (модуль не существует).

- [ ] **Step 2: Создать `src/state/prompt-bar-enter.ts`**
```ts
/**
 * Чистая логика выбора ветки Enter для промпт-бара (спека M5.5/M5.7).
 * Не зависит от React/DOM — тестируется юнит-тестом.
 */

/** Текст команды «применить всю очередь». Подставляется подсказкой M6. */
export const APPLY_ALL_COMMAND = "Применить все изменения";

export interface EnterContext {
  /** В инпуте есть активный тег. */
  hasActiveTag: boolean;
  /** Активный тег был возвращён из очереди (а не свежий клик по узлу). */
  activeTagFromQueue: boolean;
  /** Текст после тега (или весь текст инпута, если тега нет). */
  activeText: string;
  /** Сколько черновиков сейчас в очереди. */
  queueLength: number;
}

export type EnterAction =
  /** Свежий тег + текст → применить правку сразу к узлу. */
  | { kind: "apply-tag" }
  /** Тег из очереди → вернуть черновик в очередь, не применяя. */
  | { kind: "park-tag" }
  /** Команда «Применить все» + непустая очередь → флаш очереди. */
  | { kind: "apply-all" }
  /** Нет тега, обычный текст → mock-AI / свободный запрос. */
  | { kind: "free-text" }
  /** Нечего делать (тег без текста). */
  | { kind: "noop" };

/**
 * Решает, что делает Enter, по содержимому инпута и очереди.
 * Приоритет: тег > команда apply-all > свободный текст.
 */
export function decideEnterAction(ctx: EnterContext): EnterAction {
  const text = ctx.activeText.trim();

  if (ctx.hasActiveTag) {
    if (text.length === 0) return { kind: "noop" };
    return ctx.activeTagFromQueue ? { kind: "park-tag" } : { kind: "apply-tag" };
  }

  if (
    text.toLowerCase() === APPLY_ALL_COMMAND.toLowerCase() &&
    ctx.queueLength > 0
  ) {
    return { kind: "apply-all" };
  }

  return { kind: "free-text" };
}
```
Запустить: `npx vitest run src/state/prompt-bar-enter.test.ts` — ожидать PASS (все 7 тестов).

- [ ] **Step 3: Переписать `ChatComposer` — forwardRef + парковка + Enter-ветвление**
Заменить `src/sections/shell/chat-composer.tsx` целиком на:
```tsx
"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
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
import type { ChipSegment } from "@/state/prompt-chips-context";
import { usePromptChips } from "@/state/prompt-chips-context";
import { useDraftQueue, type Draft } from "@/state/draft-queue-context";
import { decideEnterAction } from "@/state/prompt-bar-enter";
import { applyDraftToNode } from "@/state/apply-draft";
import { useAppDispatch } from "@/state/app-state-context";
import { cn } from "@/lib/utils";

export interface ChatComposerSubmitPayload {
  text: string;
  segments: ChipSegment[];
}

export interface ChatComposerHandle {
  /** Загружает черновик из очереди обратно в инпут (клик по карточке). */
  loadDraft: (draft: Draft) => void;
}

interface ChatComposerProps {
  placeholder: string;
  onSubmit: (payload: ChatComposerSubmitPayload) => void;
}

/**
 * Композер промпт-бара. M5: инпут держит один активный тег. Смена тега без
 * Enter паркует предыдущую пару (тег + текст) в очередь черновиков. Enter
 * ветвится через decideEnterAction: apply-tag / park-tag / apply-all /
 * free-text / noop.
 */
export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(
  function ChatComposer({ placeholder, onSubmit }, ref) {
    const editorRef = useRef<ChipEditableInputHandle>(null);
    const { chips, clearChips } = usePromptChips();
    const { drafts, parkDraft, clearQueue } = useDraftQueue();
    const dispatch = useAppDispatch();

    // id тега, который сейчас «активен в инпуте» и был возвращён из очереди.
    // Нужен, чтобы Enter знал: park-tag (вернуть) vs apply-tag (применить).
    const [fromQueueChipId, setFromQueueChipId] = useState<string | null>(null);
    // Снимок предыдущего активного тега — чтобы при его смене запарковать.
    const prevActiveRef = useRef<ChipSegment | null>(null);

    // Парковка при смене тега: перед тем как новый тег займёт инпут, текущий
    // (если у него есть текст) уходит в очередь. Вызывается из onTagSwap.
    function parkPreviousIfNeeded() {
      const prev = prevActiveRef.current;
      if (prev && prev.text.trim().length > 0) {
        parkDraft(prev.chip, prev.text);
      }
      prevActiveRef.current = null;
      setFromQueueChipId(null);
    }

    useImperativeHandle(ref, () => ({
      loadDraft(draft: Draft) {
        // Сначала запарковать то, что сейчас в инпуте (смена тега без Enter).
        const current = editorRef.current?.getActiveSegment() ?? null;
        if (current && current.text.trim().length > 0) {
          parkDraft(current.chip, current.text);
        }
        // Очистить инпут и подставить черновик: тег + его текст.
        editorRef.current?.clear();
        clearChips();
        // pushChip + вставка текста — через chips state и imperative inserter.
        // Тег возвращается в чипы, текст вставится после него.
        // (pushChip недоступен здесь напрямую — используем usePromptChips ниже.)
        loadInto(draft);
        setFromQueueChipId(draft.chip.id);
        prevActiveRef.current = { chip: draft.chip, text: draft.text };
      },
    }));

    const { pushChip } = usePromptChips();
    function loadInto(draft: Draft) {
      pushChip({
        id: draft.chip.id,
        kind: draft.chip.kind,
        label: draft.chip.label,
        payload: draft.chip.payload,
        removable: draft.chip.removable,
      });
      // Текст вставляется в следующий кадр, после того как чип-эффект
      // отрисовал пилл в DOM (sync chips→DOM эффект в ChipEditableInput).
      requestAnimationFrame(() => {
        editorRef.current?.focus();
        // Текст черновика дописывается через DOM-инсертер контроллера —
        // ChipEditableInput регистрирует его; вставка идёт после тега.
        insertDraftText(draft.text);
      });
    }

    function handleSubmit(message: PromptInputMessage) {
      const segments = editorRef.current?.getSegments() ?? [];
      const active = editorRef.current?.getActiveSegment() ?? null;
      const freeText = (message.text ?? "").trim();

      const decision = decideEnterAction({
        hasActiveTag: active !== null,
        activeTagFromQueue:
          active !== null && active.chip.id === fromQueueChipId,
        activeText: active ? active.text : freeText,
        queueLength: drafts.length,
      });

      switch (decision.kind) {
        case "apply-tag": {
          // Свежий тег → применить правку сразу к узлу.
          if (active) applyDraftToNode(dispatch, active.chip, active.text);
          break;
        }
        case "park-tag": {
          // Тег из очереди → вернуть черновик обратно в очередь, не применяя.
          if (active) parkDraft(active.chip, active.text);
          break;
        }
        case "apply-all": {
          // Применить всю очередь к workflow и очистить её.
          for (const d of drafts) {
            applyDraftToNode(dispatch, d.chip, d.text);
          }
          clearQueue();
          break;
        }
        case "free-text": {
          onSubmit({ text: freeText, segments });
          break;
        }
        case "noop":
          return;
      }

      editorRef.current?.clear();
      clearChips();
      prevActiveRef.current = null;
      setFromQueueChipId(null);
    }

    return (
      <PromptInput
        onSubmit={handleSubmit}
        className={cn(
          "[&_[data-slot=input-group]]:rounded-[10px]!",
          "[&_[data-slot=input-group]]:border!",
          "[&_[data-slot=input-group]]:border-white/10!",
          "[&_[data-slot=input-group]]:bg-[#171717]!",
          "dark:[&_[data-slot=input-group]]:bg-[#171717]!"
        )}
      >
        <ChipEditableInput
          ref={editorRef}
          className="px-3 py-2"
          placeholder={placeholder}
          onTagSwap={parkPreviousIfNeeded}
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

    // insertDraftText — через imperative inserter контроллера prompt-input.
    function insertDraftText(text: string) {
      // controller.textInput.insertAtCursor зарегистрирован ChipEditableInput;
      // импортируется через usePromptInputController в области компонента —
      // см. Step 4 для финального места хука.
    }
  }
);
```
> Примечание о `chips` в зависимостях: импорт `chips` остаётся для будущего, но не обязателен — удалить, если линтер ругается на unused.

- [ ] **Step 4: Упростить — единый хук контроллера для вставки текста черновика**
Реализация `insertDraftText` через `usePromptInputController` должна быть на верхнем уровне компонента (хук нельзя звать во вложенной функции). В `ChatComposer` добавить в начало тела (после `editorRef`):
```tsx
    const { textInput } = usePromptInputController();
```
с импортом `import { usePromptInputController } from "@/components/ai-elements/prompt-input";`. Затем заменить заглушку `insertDraftText` на:
```tsx
    function insertDraftText(text: string) {
      // preserveTags — чтобы только что вставленный тег не вычистился как
      // «пустой @-тег»; separator smart добавит пробел после пилла.
      textInput.insertAtCursor(text, { separator: "smart", preserveTags: true });
    }
```
`insertDraftText` должна быть объявлена до `loadInto`/после `textInput` — вынести её определение к остальным функциям компонента (не возвращать после JSX). Финальный порядок: хуки → `parkPreviousIfNeeded` → `loadInto` → `insertDraftText` → `handleSubmit` → `useImperativeHandle` → `return JSX`. Переставить блоки соответственно.

- [ ] **Step 5: Создать helper `apply-draft.ts` для применения черновика к узлу**
Создать `src/state/apply-draft.ts`:
```ts
import type { Dispatch } from "react";
import type { PromptChip } from "./prompt-chips-context";
import { isNodeTagPayload } from "./prompt-chips-context";

/**
 * Применяет один черновик (тег + текст) к узлу workflow. Для node-тега
 * диспатчит команду на узел; downstream-редьюсер парсит текст через
 * NODE_ACTIONS и обновляет параметры. Для нераспознанного тега — no-op.
 *
 * dispatch типизирован широко (AppAction) — конкретный тип берётся из
 * app-state; здесь принимаем минимально нужную форму.
 */
export function applyDraftToNode(
  dispatch: Dispatch<{
    type: "workflow_node_command_submit";
    commands: { nodeLabel: string; text: string }[];
  }>,
  chip: PromptChip,
  text: string
): void {
  if (text.trim().length === 0) return;
  // node-тег: nodeLabel должен совпадать с тем, что ждёт редьюсер.
  // shell-bottom-bar уже шлёт { nodeLabel: chip.label, text } —
  // придерживаемся того же контракта.
  if (isNodeTagPayload(chip.payload)) {
    dispatch({
      type: "workflow_node_command_submit",
      commands: [{ nodeLabel: chip.label, text }],
    });
  }
}
```
> Примечание: проверить, что редьюсер `workflow_node_command_submit` сопоставляет команду по `nodeLabel`. Если он сопоставляет по `nodeId`, изменить `commands` на `{ nodeId: payload.nodeId, text }` и подправить тип. Сверить с `src/state/app-state.ts` (искать `workflow_node_command_submit`). Контракт обязан совпасть — иначе применение не сработает.

- [ ] **Step 6: Добавить `onTagSwap` в `ChipEditableInput`**
В `src/components/ai-elements/chip-editable-input.tsx` в `ChipEditableInputProps` (строки 21–24) добавить:
```ts
  /** Вызывается, когда в инпут добавляется НОВЫЙ тег при уже существующем —
   *  M5: предыдущий тег нужно запарковать в очередь. */
  onTagSwap?: () => void;
```
В функции-компоненте принять проп: `function ChipEditableInput({ placeholder, className, onTagSwap }, ref)`. В эффекте sync chips→DOM (строки 203–239), в цикле «Add state chips not in DOM» — перед вставкой нового чипа, если в DOM уже есть хотя бы один чип, вызвать `onTagSwap?.()`. Конкретно, внутри `for (const chip of chips)` перед `const el = createChipElement(chip);` добавить:
```ts
      const hadChip = ed.querySelector("[data-chip-id]") !== null;
      if (hadChip) onTagSwap?.();
```
> Примечание: это вызовет `onTagSwap` при добавлении второго+ чипа. Поскольку M5 — один активный тег, после парковки старый чип должен быть удалён. Композер в `parkPreviousIfNeeded` паркует предыдущий сегмент; затем нужно очистить старый чип из chips state. Дополнить `parkPreviousIfNeeded` в композере: после `parkDraft(...)` вызвать `editorRef.current?.clear()` НЕ нужно (новый чип уже вставляется) — вместо этого удалить только предыдущий чип через `removeChip(prev.chip.id)` и убрать его текст. Простейший надёжный путь для прототипа: в `parkPreviousIfNeeded` вызвать `parkDraft`, затем `removeChip(prevChipId)` — пилл предыдущего тега исчезнет из DOM (sync-эффект удаляет DOM-чипы не в state), его текст останется и его нужно вычистить. Чтобы не усложнять: при `onTagSwap` композер делает `parkDraft(prev)` + `editorRef.current?.clear()` + повторный `pushChip(новый чип)`. Реализовать `onTagSwap` так, чтобы новый чип pushChip-ился композером, а не node-card напрямую — но node-card уже пушит. **Принятое упрощение (фиксируем):** node-card/`SelectedNodeChipEffect` пушат чип как сейчас; `ChipEditableInput` при обнаружении второго чипа вызывает `onTagSwap`; композер в `onTagSwap` синхронно: (1) читает предыдущий сегмент через сохранённый `prevActiveRef`, (2) `parkDraft(prev)`, (3) `removeChip(prevChipId)` чтобы старый пилл ушёл, (4) очищает текстовые ноды до нового чипа вызовом `editorRef.current` — для прототипа достаточно `removeChip` + оставить, т.к. новый тег и его текст пользователь печатает заново. Сохранять `prevActiveRef` при каждом изменении активного сегмента (см. Step 7).

- [ ] **Step 7: Отслеживать активный сегмент для `prevActiveRef`**
В `ChatComposer` добавить эффект, синхронизирующий `prevActiveRef` с текущим активным сегментом на каждое изменение `chips`:
```tsx
    useEffect(() => {
      const seg = editorRef.current?.getActiveSegment() ?? null;
      if (seg) prevActiveRef.current = seg;
    }, [chips]);
```
с импортом `useEffect`. Так `parkPreviousIfNeeded` всегда видит последний активный тег + накопленный текст. Чтобы текст был свежим на момент парковки, читать сегмент заново внутри `parkPreviousIfNeeded`:
```tsx
    function parkPreviousIfNeeded() {
      const prev = editorRef.current?.getActiveSegment() ?? prevActiveRef.current;
      if (prev && prev.text.trim().length > 0) {
        parkDraft(prev.chip, prev.text);
        removeChip(prev.chip.id);
      }
      setFromQueueChipId(null);
    }
```
с `removeChip` из `usePromptChips()`.
> Примечание: при `onTagSwap` `getActiveSegment()` уже видит ОБА чипа в DOM, но `getActiveSegment` возвращает последний — это новый чип. Поэтому в `onTagSwap` читать предыдущий именно из `prevActiveRef.current` (снимок до вставки). Использовать `prevActiveRef.current` в `parkPreviousIfNeeded`, а `getActiveSegment` — нет. Финальная версия:
```tsx
    function parkPreviousIfNeeded() {
      const prev = prevActiveRef.current;
      if (prev && prev.text.trim().length > 0) {
        parkDraft(prev.chip, prev.text);
        removeChip(prev.chip.id);
      }
      setFromQueueChipId(null);
    }
```

- [ ] **Step 8: Применить финальный вариант `ChatPanel` (ref-подключение)**
В `src/sections/shell/chat-panel.tsx` применить финальный вариант из Task 7 Step 2 — с `composerRef` и `onTakeDraft={(draft) => composerRef.current?.loadDraft(draft)}`. Импортировать `type ChatComposerHandle` из `./chat-composer`.

- [ ] **Step 9: Verify** — Run: `npx vitest run src/state/prompt-bar-enter.test.ts` (PASS) и `open http://localhost:3000` → workflow:
  1. Клик ✦ у поля A → набрать «сделай короче» → клик ✦ у поля B; Expected: над баром появилась карточка очереди «A · сделай короче».
  2. Enter на свежем теге с текстом; Expected: правка применилась к узлу (значение поля изменилось).
  3. Клик по карточке очереди; Expected: тег + текст вернулись в инпут.
  4. Enter на теге, вернувшемся из очереди; Expected: черновик снова в очереди, узел не изменился.
  5. ✕ на карточке; Expected: карточка исчезла.

- [ ] **Step 10: Commit** — `git commit -m "feat(m5): tag-swap parking + Enter branching (apply/park/apply-all)"`

---

### Task 9: Команда «Применить все изменения» — флаш очереди (M5.6/M5.7)

**Files:**
- Modify: `src/sections/shell/shell-bottom-bar.tsx` (`handlePromptSubmit` строки 123–175 — добавить обработку apply-all для основного бара)
- Modify: `src/sections/shell/chat-composer.tsx` (уже обрабатывает apply-all в Task 8 — проверить)
- Test: покрыто `prompt-bar-enter.test.ts` (apply-all ветка)

- [ ] **Step 1: Подключить apply-all в основной бар (`ShellBottomBar`)**
`ShellBottomBar` использует свой `PromptInput` напрямую (не `ChatComposer`). Чтобы apply-all работал и здесь, заменить инпут `ShellBottomBar` на тот же `ChatComposer`-путь ИЛИ продублировать ветвление. Решение: вынести инпут `ShellBottomBar` на `ChatComposer`. В `handlePromptSubmit` (строки 123–175) — оставить как есть для welcome/campaigns/structural, но node-команды теперь идут через `ChatComposer`/`decideEnterAction`. Минимально-инвазивный путь для прототипа: оставить `ShellBottomBar` как есть, но добавить раннюю проверку apply-all в начало `handlePromptSubmit`:
```tsx
    const decision = decideEnterAction({
      hasActiveTag: segments.length > 0,
      activeTagFromQueue: false,
      activeText: rawText,
      queueLength: draftsRef.length,
    });
    if (decision.kind === "apply-all") {
      for (const d of draftsRef) applyDraftToNode(dispatch, d.chip, d.text);
      clearQueue();
      chipsApi.clearChips();
      editorRef.current?.clear();
      return;
    }
```
Добавить в `ShellBottomBar` хук `const { drafts: draftsRef, clearQueue } = useDraftQueue();` и импорты `decideEnterAction`, `applyDraftToNode`, `useDraftQueue`.
> Примечание: для node-тегов в workflow `ShellBottomBar` уже шлёт `workflow_node_command_submit` из сегментов — это корректное немедленное применение (≈ apply-tag для свежего тега). Спека M5: разные узлы/разные секции. Парковка/Enter-ветвление полноценно живут в `ChatComposer`-пути (guided-signal). Для workflow-узлов основной бар оставляет немедленное применение из сегментов как поведение «свежий тег → применить сразу» — это согласуется с M5.7. Очередь и apply-all в workflow доступны через ту же `DraftQueueList` в `slot`.

- [ ] **Step 2: Verify** — Run: `open http://localhost:3000` → накопить 2+ черновика в очереди → убедиться, что в инпуте нет активного тега → подсказка «Применить все изменения» (появится после M6, Task 12) → клик → текст в инпуте → Enter; Expected: вся очередь применилась, очередь очистилась. До M6: ввести текст «Применить все изменения» вручную и нажать Enter; Expected: тот же результат.

- [ ] **Step 3: Commit** — `git commit -am "feat(m5): apply-all command flushes the draft queue"`

---

### M1

---

### Task 10: Теги и очередь в «Кампаниях» и «Сигналах» (M1.1)

**Files:**
- Modify: `src/sections/campaigns/campaigns-section.tsx` (точка интеграции — проверить рендер node-карточек)
- Modify: `src/sections/signals/signals-section.tsx` (то же)
- Test: нет (UI; verify визуально)

- [ ] **Step 1: Проверить, что промпт-бар и очередь видны в обоих разделах**
`ShellBottomBar` уже раскатан на все секции (включая «Кампании» и «Сигналы») — `BottomBarSlot` в `page.tsx` рендерит `ShellBottomBar` для всех видов кроме `guided-signal`. `DraftQueueProvider` обёрнут глобально (Task 3). `DraftQueueList` уже в `slot` `ShellBottomBar` (Task 7). Значит очередь и теги работают в обоих разделах без дополнительного кода. Подтвердить grep-ом: в `campaigns-section.tsx` и `signals-section.tsx` карточки сигналов/кампаний рендерят AI-поля с ✦. Если они НЕ используют `NodeCardBody`/механизм `handleAiField` — найти их рендер полей и подключить тот же паттерн: клик ✦ → `pushChip` с `NodeTagPayload`.

- [ ] **Step 2: Подключить ✦-теги к карточкам сигналов/кампаний (если не подключены)**
Для каждой карточки сущности (Сигнал, Кампания), у которой есть редактируемые поля, на AI-поле повесить кнопку с иконкой маскота, по клику:
```tsx
pushChip({
  id: `entitytag_${entityId}_${fieldLabel}`,
  kind: "node",
  label: fieldLabel,
  payload: {
    nodeId: entityId,
    nodeType: "default",
    color: getNodeColor("default"),
    paramLabel: fieldLabel,
  } satisfies NodeTagPayload,
  removable: true,
});
```
Импорт `getNodeColor` из `@/sections/campaigns/node-visuals`, `NodeTagPayload` из `@/state/prompt-chips-context`, `usePromptChips`.
> Примечание: если у карточек «Кампании»/«Сигналы» нет редактируемых параметров в текущем прототипе (это списочные карточки, а не узлы) — тогда M1.1 проверяется только тем, что промпт-бар + очередь работают в этих разделах, и тег приходит из workflow-узлов. Не добавлять искусственные поля. Зафиксировать в Verify, что именно проверяется.

- [ ] **Step 3: Verify** — Run: `open http://localhost:3000`:
  - В «Кампании» и «Сигналы» внизу виден промпт-бар; если в очереди уже есть черновики — карточки видны над баром в обоих разделах.
  - На самих элементах НЕТ значка-маркера «есть черновик» (спека M1: маркеров не делаем).
  - Обратная связь = карточка появляется в очереди над баром, без toast/счётчиков.

- [ ] **Step 4: Commit** — `git commit -am "feat(m1): draft-queue tags available in Кампании and Сигналы"`

---

### M6

---

### Task 11: Каталог подсказок по типам тегов (M6.4)

**Files:**
- Create: `src/state/suggestion-catalog.ts`
- Create (Test): `src/state/suggestion-catalog.test.ts`

- [ ] **Step 1: Написать тест `suggestion-catalog.test.ts` (TDD — FAIL первым)**
```ts
import { describe, it, expect } from "vitest";
import { getSuggestionsForTag, SUGGESTION_CATALOG } from "./suggestion-catalog";

describe("getSuggestionsForTag", () => {
  it("returns 2-3 suggestions for an sms text field tag", () => {
    const s = getSuggestionsForTag("sms", "Текст");
    expect(s.length).toBeGreaterThanOrEqual(2);
    expect(s.length).toBeLessThanOrEqual(3);
  });

  it("each suggestion has a short label and a longer full text", () => {
    const s = getSuggestionsForTag("sms", "Текст");
    for (const item of s) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.fullText.length).toBeGreaterThanOrEqual(item.label.length);
    }
  });

  it("falls back to whole-node suggestions when paramLabel is omitted", () => {
    const s = getSuggestionsForTag("sms", undefined);
    expect(s.length).toBeGreaterThanOrEqual(2);
  });

  it("returns a generic non-empty set for an unknown node type", () => {
    const s = getSuggestionsForTag("totally-unknown", "Whatever");
    expect(s.length).toBeGreaterThanOrEqual(2);
  });

  it("catalog covers the demo node types sms, email, signal, condition", () => {
    expect(SUGGESTION_CATALOG.sms).toBeDefined();
    expect(SUGGESTION_CATALOG.email).toBeDefined();
    expect(SUGGESTION_CATALOG.signal).toBeDefined();
    expect(SUGGESTION_CATALOG.condition).toBeDefined();
  });
});
```
Запустить: `npx vitest run src/state/suggestion-catalog.test.ts` — ожидать FAIL.

- [ ] **Step 2: Создать `src/state/suggestion-catalog.ts`**
```ts
/**
 * Каталог контекстных подсказок промпт-бара (M6.4). На каждый тип тега —
 * 2-3 подсказки: короткая надпись (label, в чипе) + полный текст (fullText,
 * подставляется в инпут после тега).
 *
 * Покрыты типы тегов демо: Сигналы (signal) и Компании (sms/email/condition
 * как поля узлов кампаний). Ключ верхнего уровня — nodeType; вложенный —
 * имя параметра; `__node__` — подсказки для тега узла целиком.
 */

export interface SuggestionItem {
  /** Короткая ёмкая надпись для чипа. */
  label: string;
  /** Полный текст, подставляется в инпут после тега. */
  fullText: string;
}

const WHOLE_NODE_KEY = "__node__";

type ParamSuggestions = Record<string, SuggestionItem[]>;

export const SUGGESTION_CATALOG: Record<string, ParamSuggestions> = {
  sms: {
    "Текст": [
      { label: "Короче", fullText: "сделай текст короче, до 1 SMS-сегмента" },
      { label: "Дружелюбнее", fullText: "перепиши текст в более тёплом, дружелюбном тоне" },
      { label: "Добавить выгоду", fullText: "добавь в текст конкретную выгоду для клиента" },
    ],
    "Alpha-name": [
      { label: "Имя бренда", fullText: "поставь alpha-name с названием нашего бренда" },
      { label: "Короткое имя", fullText: "сделай alpha-name короче, до 11 символов" },
    ],
    "Время": [
      { label: "Утро буднего дня", fullText: "отправлять в 10:00 по будням" },
      { label: "Сразу", fullText: "отправлять сразу после входа в сегмент" },
    ],
    "Ссылка": [
      { label: "Короткая ссылка", fullText: "поставь сокращённую ссылку с UTM-метками" },
      { label: "На лендинг", fullText: "веди ссылку на посадочную страницу акции" },
    ],
    [WHOLE_NODE_KEY]: [
      { label: "Сделать лаконичнее", fullText: "сократи сообщение и убери лишние детали" },
      { label: "Усилить призыв", fullText: "усиль призыв к действию в конце сообщения" },
    ],
  },
  email: {
    "Тема": [
      { label: "Цепляющая тема", fullText: "сделай тему письма цепляющей, до 50 символов" },
      { label: "Без спам-слов", fullText: "перепиши тему без слов-триггеров спам-фильтров" },
    ],
    "Текст": [
      { label: "Короче", fullText: "сократи тело письма, оставь только суть" },
      { label: "Добавить структуру", fullText: "разбей текст письма на абзацы с подзаголовками" },
      { label: "Деловой тон", fullText: "перепиши письмо в более деловом тоне" },
    ],
    "Отправитель": [
      { label: "От имени бренда", fullText: "поставь отправителем имя нашего бренда" },
      { label: "Личное имя", fullText: "сделай отправителем имя конкретного менеджера" },
    ],
    [WHOLE_NODE_KEY]: [
      { label: "Повысить открываемость", fullText: "перепиши письмо так, чтобы повысить открываемость" },
      { label: "Сократить целиком", fullText: "сократи письмо целиком в полтора раза" },
    ],
  },
  signal: {
    [WHOLE_NODE_KEY]: [
      { label: "Сузить аудиторию", fullText: "сузь сегмент до самых горячих сигналов" },
      { label: "Расширить охват", fullText: "расширь сегмент, добавь средне-тёплые сигналы" },
      { label: "Свежие сигналы", fullText: "оставь только сигналы за последние 7 дней" },
    ],
  },
  condition: {
    "Триггер": [
      { label: "По открытию", fullText: "поставь условие: клиент открыл сообщение" },
      { label: "По клику", fullText: "поставь условие: клиент кликнул по ссылке" },
      { label: "Без доставки", fullText: "поставь условие: сообщение не доставлено" },
    ],
    [WHOLE_NODE_KEY]: [
      { label: "Ужесточить условие", fullText: "сделай условие ветвления строже" },
    ],
  },
};

/** Общий fallback — когда тип тега не покрыт каталогом. */
const GENERIC_SUGGESTIONS: SuggestionItem[] = [
  { label: "Сделать короче", fullText: "сделай текст короче и яснее" },
  { label: "Сменить тон", fullText: "перепиши в более дружелюбном тоне" },
  { label: "Добавить выгоду", fullText: "добавь конкретную выгоду для клиента" },
];

/**
 * Подсказки для тега: по nodeType + paramLabel. paramLabel undefined →
 * подсказки тега узла целиком. Неизвестный тип → generic-набор.
 */
export function getSuggestionsForTag(
  nodeType: string,
  paramLabel: string | undefined
): SuggestionItem[] {
  const byNode = SUGGESTION_CATALOG[nodeType];
  if (!byNode) return GENERIC_SUGGESTIONS;
  const key = paramLabel ?? WHOLE_NODE_KEY;
  return byNode[key] ?? byNode[WHOLE_NODE_KEY] ?? GENERIC_SUGGESTIONS;
}
```
Запустить: `npx vitest run src/state/suggestion-catalog.test.ts` — ожидать PASS (все 5 тестов).

- [ ] **Step 3: Commit** — `git commit -am "feat(m6): suggestion catalog for signal/company tag types"`

---

### Task 12: Логика выбора состояния подсказок (M6.1/M6.2)

**Files:**
- Create: `src/state/suggestion-state.ts`
- Create (Test): `src/state/suggestion-state.test.ts`

- [ ] **Step 1: Написать тест `suggestion-state.test.ts` (TDD — FAIL первым)**
```ts
import { describe, it, expect } from "vitest";
import { selectSuggestionState } from "./suggestion-state";

describe("selectSuggestionState", () => {
  it("empty bar, no tag, empty queue → welcome suggestions", () => {
    const s = selectSuggestionState({
      hasActiveTag: false,
      activeTagTypedText: false,
      queueLength: 0,
      isWelcome: true,
    });
    expect(s.kind).toBe("welcome");
  });

  it("active tag, no text typed → context suggestions", () => {
    const s = selectSuggestionState({
      hasActiveTag: true,
      activeTagTypedText: false,
      queueLength: 0,
      isWelcome: false,
    });
    expect(s.kind).toBe("context");
  });

  it("non-empty queue, no active tag → apply-all suggestion", () => {
    const s = selectSuggestionState({
      hasActiveTag: false,
      activeTagTypedText: false,
      queueLength: 2,
      isWelcome: false,
    });
    expect(s.kind).toBe("apply-all");
  });

  it("active tag wins over non-empty queue (priority)", () => {
    const s = selectSuggestionState({
      hasActiveTag: true,
      activeTagTypedText: false,
      queueLength: 5,
      isWelcome: false,
    });
    expect(s.kind).toBe("context");
  });

  it("user started typing after the tag → all suggestions hidden", () => {
    const s = selectSuggestionState({
      hasActiveTag: true,
      activeTagTypedText: true,
      queueLength: 3,
      isWelcome: false,
    });
    expect(s.kind).toBe("hidden");
  });

  it("not welcome, no tag, empty queue → hidden", () => {
    const s = selectSuggestionState({
      hasActiveTag: false,
      activeTagTypedText: false,
      queueLength: 0,
      isWelcome: false,
    });
    expect(s.kind).toBe("hidden");
  });
});
```
Запустить: `npx vitest run src/state/suggestion-state.test.ts` — ожидать FAIL.

- [ ] **Step 2: Создать `src/state/suggestion-state.ts`**
```ts
/**
 * Чистая логика выбора состояния зоны подсказок под промпт-баром (M6.1/M6.2).
 * Не зависит от React/DOM.
 */

export interface SuggestionStateInput {
  /** В инпуте есть активный тег. */
  hasActiveTag: boolean;
  /** После тега уже напечатан какой-то текст. */
  activeTagTypedText: boolean;
  /** Сколько черновиков в очереди. */
  queueLength: number;
  /** Текущий экран — welcome (общие подсказки доступны). */
  isWelcome: boolean;
}

export type SuggestionState =
  /** Общие welcome-подсказки (состояние 1, уже работает в проде). */
  | { kind: "welcome" }
  /** Контекстные подсказки активного тега (состояние 2). */
  | { kind: "context" }
  /** Подсказка «Применить все изменения» (состояние 3). */
  | { kind: "apply-all" }
  /** Подсказки скрыты. */
  | { kind: "hidden" };

/**
 * Выбирает состояние зоны подсказок.
 * Приоритет (спека M6.1):
 *  1. начал печатать после тега → hidden (всё скрыто);
 *  2. активный тег → context (тег выигрывает у apply-all);
 *  3. непустая очередь без тега → apply-all;
 *  4. welcome-экран → welcome;
 *  5. иначе → hidden.
 */
export function selectSuggestionState(
  input: SuggestionStateInput
): SuggestionState {
  if (input.hasActiveTag && input.activeTagTypedText) {
    return { kind: "hidden" };
  }
  if (input.hasActiveTag) {
    return { kind: "context" };
  }
  if (input.queueLength > 0) {
    return { kind: "apply-all" };
  }
  if (input.isWelcome) {
    return { kind: "welcome" };
  }
  return { kind: "hidden" };
}
```
Запустить: `npx vitest run src/state/suggestion-state.test.ts` — ожидать PASS (все 6 тестов).

- [ ] **Step 3: Commit** — `git commit -am "feat(m6): suggestion-state selection logic"`

---

### Task 13: Зона подсказок под баром — `SuggestionBar` (M6.1/M6.2/M6.3)

**Files:**
- Create: `src/sections/shell/suggestion-bar.tsx`
- Modify: `src/sections/shell/chat-composer.tsx` (экспонировать «есть ли активный тег» и «печатается ли текст»)
- Modify: `src/sections/shell/chat-panel.tsx` (отрисовать `SuggestionBar` под композером)
- Test: нет (UI; чистая логика в Task 11/12)

- [ ] **Step 1: Создать `src/sections/shell/suggestion-bar.tsx`**
```tsx
"use client";

import { AnimatePresence, motion } from "motion/react";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { useDraftQueue } from "@/state/draft-queue-context";
import { selectSuggestionState } from "@/state/suggestion-state";
import { getSuggestionsForTag } from "@/state/suggestion-catalog";
import { APPLY_ALL_COMMAND } from "@/state/prompt-bar-enter";
import { isNodeTagPayload, type PromptChip } from "@/state/prompt-chips-context";

interface SuggestionBarProps {
  /** Активный тег в инпуте, либо null. */
  activeTag: PromptChip | null;
  /** После тега уже что-то напечатано. */
  hasTypedText: boolean;
  /** Welcome-экран — состояние 1 (общие подсказки) разрешено. */
  isWelcome: boolean;
  /** Welcome-подсказки (рендерятся как есть, состояние 1). */
  welcomeSlot?: React.ReactNode;
  /** Клик по контекстной подсказке → вставить fullText в инпут после тега. */
  onPickSuggestion: (fullText: string) => void;
  /** Клик по «Применить все изменения» → подставить команду в инпут. */
  onPickApplyAll: () => void;
}

const ZONE_TRANSITION = { duration: 0.24, ease: [0.23, 1, 0.32, 1] } as const;

/**
 * Зона подсказок под промпт-баром (M6). Состояние выбирается чистой
 * selectSuggestionState; смена состояний — плавная opacity/transform-анимация.
 */
export function SuggestionBar({
  activeTag,
  hasTypedText,
  isWelcome,
  welcomeSlot,
  onPickSuggestion,
  onPickApplyAll,
}: SuggestionBarProps) {
  const { drafts } = useDraftQueue();

  const state = selectSuggestionState({
    hasActiveTag: activeTag !== null,
    activeTagTypedText: hasTypedText,
    queueLength: drafts.length,
    isWelcome,
  });

  return (
    <AnimatePresence mode="wait" initial={false}>
      {state.kind === "welcome" && welcomeSlot && (
        <motion.div
          key="sg-welcome"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={ZONE_TRANSITION}
        >
          {welcomeSlot}
        </motion.div>
      )}

      {state.kind === "context" && activeTag && (
        <motion.div
          key="sg-context"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={ZONE_TRANSITION}
        >
          <Suggestions>
            {contextSuggestions(activeTag).map((item) => (
              <Suggestion
                key={item.label}
                suggestion={item.label}
                onClick={() => onPickSuggestion(item.fullText)}
                className="border-white/10 bg-[#171717] text-white hover:bg-[#1f1f1f]"
              />
            ))}
          </Suggestions>
        </motion.div>
      )}

      {state.kind === "apply-all" && (
        <motion.div
          key="sg-apply-all"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={ZONE_TRANSITION}
          className="flex justify-start"
        >
          <Suggestion
            suggestion={APPLY_ALL_COMMAND}
            onClick={onPickApplyAll}
            className="border-[var(--color-brand)]/50 bg-[var(--color-brand)]/10 text-[var(--color-brand)] hover:bg-[var(--color-brand)]/15"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Контекстные подсказки активного тега по его NodeTagPayload. */
function contextSuggestions(tag: PromptChip) {
  if (isNodeTagPayload(tag.payload)) {
    return getSuggestionsForTag(tag.payload.nodeType, tag.payload.paramLabel);
  }
  return getSuggestionsForTag("default", tag.label);
}
```

- [ ] **Step 2: Экспонировать активный тег и `hasTypedText` из `ChatComposer`**
`SuggestionBar` нужно знать текущий активный тег и печатается ли текст. `ChatComposer` уже знает `chips` и активный сегмент. Добавить в `ChatComposerProps` callback или поднять состояние. Решение: `ChatComposer` через `onActiveTagChange` сообщает родителю активный тег + флаг текста. В `ChatComposerProps` добавить:
```ts
  /** Сообщает родителю текущий активный тег и печатается ли текст после него. */
  onActiveTagChange?: (info: { tag: PromptChip | null; hasTypedText: boolean }) => void;
```
с импортом `type PromptChip`. В `ChatComposer` добавить эффект, который на изменение `chips` и на ввод текста (через подписку на controller `textInput.value`) пересчитывает активный сегмент и зовёт callback:
```tsx
    const { textInput } = usePromptInputController();
    useEffect(() => {
      const seg = editorRef.current?.getActiveSegment() ?? null;
      onActiveTagChange?.({
        tag: seg ? seg.chip : null,
        hasTypedText: seg ? seg.text.trim().length > 0 : false,
      });
    }, [chips, textInput.value, onActiveTagChange]);
```
> Примечание: `textInput.value` — реактивное значение из `PromptInputProvider`, меняется на каждый ввод; зависимость гарантирует пересчёт `hasTypedText` при наборе текста после тега. `onActiveTagChange` должен быть стабильным (`useCallback` у родителя).

- [ ] **Step 3: Добавить методы вставки в `ChatComposerHandle`**
В `ChatComposerHandle` (Task 8) добавить:
```ts
  /** Вставляет полный текст подсказки в инпут после тега (M6.3). */
  insertSuggestion: (fullText: string) => void;
  /** Подставляет команду «Применить все изменения» в инпут (M5.6/M6). */
  insertApplyAllCommand: () => void;
```
В `useImperativeHandle` `ChatComposer` добавить реализации:
```tsx
      insertSuggestion(fullText: string) {
        // Текст подставляется ПОСЛЕ тега, не выполняется автоматически.
        textInput.insertAtCursor(fullText, {
          separator: "smart",
          preserveTags: true,
        });
        editorRef.current?.focus();
      },
      insertApplyAllCommand() {
        editorRef.current?.clear();
        clearChips();
        textInput.insertAtCursor(APPLY_ALL_COMMAND, { separator: "none" });
        editorRef.current?.focus();
      },
```
с импортом `import { decideEnterAction, APPLY_ALL_COMMAND } from "@/state/prompt-bar-enter";`.

- [ ] **Step 4: Отрисовать `SuggestionBar` в `ChatPanel`**
В `src/sections/shell/chat-panel.tsx` `ChatPanel` поднять state активного тега и отрисовать `SuggestionBar` ПОСЛЕ `ChatComposer` (внутри `PromptBar`, как `children` — `slot` это зона над баром, подсказки идут под инпутом, т.е. как дочерний элемент после композера). Итоговый `ChatPanel`:
```tsx
export function ChatPanel({ placeholder }: { placeholder: string }) {
  const chat = useChat();
  const { submit } = useChatSubmit();
  const composerRef = useRef<ChatComposerHandle>(null);
  const [activeInfo, setActiveInfo] = useState<{
    tag: PromptChip | null;
    hasTypedText: boolean;
  }>({ tag: null, hasTypedText: false });

  const handleActiveTagChange = useCallback(
    (info: { tag: PromptChip | null; hasTypedText: boolean }) => {
      setActiveInfo(info);
    },
    []
  );

  return (
    <PromptBar
      onOpenDrawer={chat.openSidebar}
      slot={
        <>
          <DraftQueueList
            variant="compact"
            onTakeDraft={(draft) => composerRef.current?.loadDraft(draft)}
          />
          <TransientReply messages={chat.messages} />
        </>
      }
    >
      <ChatComposer
        ref={composerRef}
        placeholder={placeholder}
        onSubmit={submit}
        onActiveTagChange={handleActiveTagChange}
      />
      <SuggestionBar
        activeTag={activeInfo.tag}
        hasTypedText={activeInfo.hasTypedText}
        isWelcome={false}
        onPickSuggestion={(fullText) =>
          composerRef.current?.insertSuggestion(fullText)
        }
        onPickApplyAll={() => composerRef.current?.insertApplyAllCommand()}
      />
    </PromptBar>
  );
}
```
Импорты: `useState`, `useCallback` (расширить `react`-импорт), `type PromptChip` из `@/state/prompt-chips-context`, `SuggestionBar` из `./suggestion-bar`.
> Примечание: `ChatPanel` — это guided-signal путь. На welcome `isWelcome` всегда передаётся отдельно; в `ChatPanel` оно `false` (welcome не использует `ChatPanel`). Состояние welcome покрыто `ShellBottomBar` — Task 14.

- [ ] **Step 5: Verify** — Run: `npx vitest run` (все тесты PASS) и `open http://localhost:3000` → guided-signal/workflow:
  - Клик ✦ по AI-полю → под баром появились 2-3 контекстные подсказки.
  - Начать печатать текст после тега → подсказки исчезли (плавно).
  - Очистить инпут, накопить очередь → под баром «Применить все изменения» (жёлтым).
  - Клик по подсказке → полный текст подставился в инпут после тега, НЕ выполнился.

- [ ] **Step 6: Commit** — `git commit -m "feat(m6): suggestion bar under prompt-bar (context/apply-all states)"`

---

### Task 14: Состояния подсказок в `ShellBottomBar` — welcome и интеграция (M6.2)

**Files:**
- Modify: `src/sections/shell/shell-bottom-bar.tsx` (строки 250–283 — заменить разрозненные chip-блоки на `SuggestionBar`)
- Test: нет (UI; verify визуально)

- [ ] **Step 1: Перевести `ShellBottomBar` на `SuggestionBar` с welcomeSlot**
`ShellBottomBar` сейчас рендерит `OnboardingChatChips` (welcome) и `CampaignsPromptChips` (campaigns) разрозненно под инпутом. Состояние 1 (welcome) — общие подсказки, уже работает. Обернуть их в `SuggestionBar` так, чтобы:
- welcome → `welcomeSlot` = `<OnboardingChatChips .../>` (или `CampaignsPromptChips` для кампаний);
- активный тег → контекстные подсказки;
- непустая очередь без тега → «Применить все».

`ShellBottomBar` использует свой `PromptInput`, не `ChatComposer` — поэтому нужен доступ к активному сегменту. Поднять флаги: добавить state `activeTag`/`hasTypedText`, обновляемые эффектом по `chipsApi.chips` и `textInput.value` (как в `ChatComposer` Step 2). В `ShellBottomBar` добавить:
```tsx
  const { textInput } = usePromptInputController();
  const [activeTag, setActiveTag] = useState<PromptChip | null>(null);
  const [hasTypedText, setHasTypedText] = useState(false);
  useEffect(() => {
    const seg = editorRef.current?.getActiveSegment() ?? null;
    setActiveTag(seg ? seg.chip : null);
    setHasTypedText(seg ? seg.text.trim().length > 0 : false);
  }, [chipsApi.chips, textInput.value]);
```
Затем заменить блоки `{onWelcome && welcomeChat && (<OnboardingChatChips .../>)}` и `{view.kind === "section" && view.name === "Кампании" && ... (<CampaignsPromptChips .../>)}` (строки 250–265) на единый:
```tsx
        <SuggestionBar
          activeTag={activeTag}
          hasTypedText={hasTypedText}
          isWelcome={onWelcome || (view.kind === "section" && view.name === "Кампании")}
          welcomeSlot={
            onWelcome && welcomeChat ? (
              <OnboardingChatChips
                chips={welcomeChat.chips}
                onChipClick={welcomeChat.submitChip}
              />
            ) : view.kind === "section" && view.name === "Кампании" && campaigns.length > 0 ? (
              <CampaignsPromptChips
                onChipClick={(text) => {
                  const { statuses, sort } = parseCampaignQuery(text);
                  if (statuses.length > 0 || sort !== "default") {
                    dispatch({ type: "campaigns_query_set", statuses, sort });
                  }
                }}
              />
            ) : null
          }
          onPickSuggestion={(fullText) => {
            textInput.insertAtCursor(fullText, {
              separator: "smart",
              preserveTags: true,
            });
          }}
          onPickApplyAll={() => {
            chipsApi.clearChips();
            editorRef.current?.clear();
            textInput.insertAtCursor(APPLY_ALL_COMMAND, { separator: "none" });
          }}
        />
```
Импорты: `SuggestionBar` из `./suggestion-bar`, `APPLY_ALL_COMMAND` из `@/state/prompt-bar-enter`, `type PromptChip` из `@/state/prompt-chips-context`, `useState` (расширить `react`-импорт).
> Примечание: budget-help-блок (guided-signal step 5, строки 266–282) оставить как есть — он не относится к M6 (отдельная механика подсказки бюджета). Он может сосуществовать с `SuggestionBar` (разные viewKind).

- [ ] **Step 2: Verify** — Run: `open http://localhost:3000`:
  - На welcome — общие подсказки под баром (как раньше).
  - В «Кампании» — chip-подсказки кампаний под баром (как раньше).
  - В workflow: клик ✦ → контекстные подсказки; начал печатать → исчезли; непустая очередь без тега → «Применить все изменения».
  - Переключения между состояниями — плавные.

- [ ] **Step 3: Commit** — `git commit -am "feat(m6): unify ShellBottomBar suggestions via SuggestionBar"`

---

### Task 15: Финальная проверка M5 + M1 + M6

**Files:** нет изменений кода — только верификация и фикс-коммит при необходимости.

- [ ] **Step 1: Прогнать все юнит-тесты** — Run: `npx vitest run`; Expected: все тесты зелёные, включая `draft-queue-context.test.ts`, `prompt-bar-enter.test.ts`, `suggestion-state.test.ts`, `suggestion-catalog.test.ts`, `prompt-chips-context.test.ts`.

- [ ] **Step 2: Lint** — Run: `npm run lint`; Expected: без ошибок (unused imports вычищены).

- [ ] **Step 3: Сквозная проверка M5** — Run: `open http://localhost:3000` → workflow:
  - Клик ✦ → тег летит в инпут окрашенным в цвет узла; пилл одного активного тега.
  - Enter на свежем теге → правка применилась к узлу сразу.
  - Смена тега без Enter → черновик карточкой запарковался в очередь над баром.
  - Клик по карточке очереди → черновик вернулся в инпут.
  - Enter на теге из очереди → черновик вернулся в очередь, узел не изменился.
  - ✕ на карточке → черновик выброшен.
  - «Применить все изменения» (подсказка) → клик → команда в инпуте → Enter → вся очередь применилась, очередь очистилась.

- [ ] **Step 4: Сквозная проверка M1** — Expected: в «Кампании» и «Сигналы» промпт-бар + очередь работают; на элементах нет маркеров-значков; обратная связь = карточка в очереди (без toast/счётчиков).

- [ ] **Step 5: Сквозная проверка M6** — Expected: 3 состояния зоны под баром (welcome / контекст тега / «Применить все»); приоритет активного тега над «Применить все»; при наборе текста после тега все подсказки скрываются; клик по подсказке вставляет полный текст после тега, не выполняя; переходы плавные (opacity/transform).

- [ ] **Step 6: Commit** — Если были фиксы: `git commit -am "fix(m5|m1|m6): final verification fixes"`. Иначе — пропустить. Сообщить пользователю путь воркстри (`.worktrees/m5-prompt-bar-tags`) и ветку (`feature/m5-prompt-bar-tags`).
