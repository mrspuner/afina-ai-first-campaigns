# PromptBar/Drawer Mehanika — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести взаимодействие AI с интерфейсом сигнал-визарда на единый паттерн «кнопка-маскот → PromptBar с чипсиной контекста → drawer (опционально)», убрать peek-историю над PromptBar, добавить тестовые запросы «лёгкий/сложный запрос» для демо двух веток поведения, и расширить точки входа: маскот рядом с заголовками «Интересы»/«Триггеры», а не только на каждой карточке.

**Architecture:**
- В сценарии `view.kind === "guided-signal"` рендерится `ChatPanel` — он уже имеет режимы `collapsed` (PromptBar) и `sidebar` (drawer); режим `expanded` (peek-история над баром) удаляется полностью.
- Контекст конкретного элемента передаётся через существующий `PromptChipsProvider` — добавляется новый `kind: "section"` для секций (Интересы / Триггеры) и переиспользуется `kind: "trigger"` для отдельного триггера.
- Бридж между step-2 (где живут триггеры) и баром (где обрабатывается submit) — новый `TriggerEditContext`, регистрируется step-2 на маунте, потребляется `ChatPanel.handleFreeTextSubmit`.
- Тестовые запросы (`лёгкий запрос` / `сложный запрос`) детектятся в `ChatPanel` до общей логики; «лёгкий» дёргает новый редьюсерный экшен `wizard_random_remix`, «сложный» открывает drawer и пишет chain-of-thoughts через ту же `chat.append/updatePending` цепочку, что уже используется.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, motion v12, vitest. Существующие компоненты: `ChatPanel`, `ChatComposer`, `ChatPanelHeader`, `ChipEditableInput`, `PromptChipsProvider`, `ChatProvider`, `Step2Interests`, `parseTriggerCommand`, `mockReplyFor`.

**Reuse audit (что НЕ создаём заново):**
- `PromptChipsProvider` (`src/state/prompt-chips-context.tsx`) — добавляем только новый `kind: "section"`, не переписываем.
- `ChipEditableInput` — уже умеет получать чипсины через `pushChip`, фокусироваться, сегментировать ввод. Не трогаем.
- `parseTriggerCommand` + `mockReplyFor` (`src/lib/`) — переиспользуем для apply-логики.
- `ChatProvider.openSidebar/closeSidebar` — уже даёт нужное поведение «бар уезжает / композер встраивается в drawer» (см. `chat-panel.tsx:60-77`).
- `ChatHistoryList` (`variant="sidebar"`) — рендерит drawer-историю, остаётся как есть.
- Highlight на карточке триггера (`ring-2 ring-brand`) уже есть в step-2 (`highlightedTriggerIds`), нужно только дёрнуть его из бара.

---

## File Structure

**Create:**
- `src/state/trigger-edit-context.tsx` — React-контекст с api `applyToTrigger(triggerId, parsed)`, `highlightTrigger(triggerId)`, `randomRemix()`. Step-2 регистрирует значение, бар читает.
- `src/lib/random-remix.ts` — чистая функция, выбирает случайные интересы/триггеры/деltas из доступных данных по направлению. Используется action'ом `wizard_random_remix`.
- `src/lib/random-remix.test.ts` — детерминизм при сидировании, не пустой результат.
- `src/lib/complex-thinking-demo.ts` — шаги chain-of-thoughts для «сложного запроса» (массив строк-размышлений + финальный ответ).

**Modify:**
- `src/state/chat-context.tsx` — убрать режим `expanded` из `ChatPanelMode`, упростить `previousBarMode` до boolean флага «был ли drawer открыт» (или просто отдать setMode только `"collapsed" | "sidebar"`).
- `src/state/chat-context.test.ts` — обновить под новую сигнатуру.
- `src/state/prompt-chips-context.tsx` — расширить `PromptChipKind` `"section"`.
- `src/state/prompt-chips-context.test.ts` — добавить кейс на section-чипсину.
- `src/sections/shell/chat-panel.tsx` — выкинуть весь блок про `expanded` (строки 91-126 c рамкой/жёлтой полосой/историей), оставить только `collapsed` (минимальный бар с композером + кнопка drawer) и `sidebar` (drawer). Подключить `TriggerEditContext`. В `handleFreeTextSubmit` добавить ветки для тестовых запросов и для триггерных чипсин.
- `src/sections/shell/chat-panel-header.tsx` — убрать `ChevronDown` toggle и проп `onToggleBar`. Оставить `Maximize2` (открыть drawer) на баре и `X` (закрыть) в drawer.
- `src/sections/shell/chat-composer.tsx` — расширить колбэк `onSubmit` чтобы он передавал не только текст, но и сегменты (`segments: ChipSegment[]`). Перейти на сигнатуру `(payload: { text: string; segments: ChipSegment[] }) => void`.
- `src/sections/signals/steps/step-2-interests.tsx` —
  - выкинуть `TriggerConfigurePopover` (см. удаление ниже),
  - кнопка «Настроить» теперь просто пушит trigger-чипсину и фокусирует редактор,
  - добавить маскот-иконку рядом с заголовками «Интересы» и «Триггеры», клик пушит section-чипсину,
  - обернуть step-2 в `TriggerEditProvider`, прокинуть `applyToTrigger`, `highlightTrigger`, `randomRemix`.
- `src/state/app-state.ts` — новый action `wizard_random_remix` (опционально: проводим через `chatRandomRemixToken` инкремент, чтобы step-2 переопределил селекшн).
- `src/state/app-state.test.ts` — тест на новый action.

**Delete (после переноса логики):**
- `src/sections/signals/steps/trigger-configure-popover.tsx` — попап заменяется чипсиной в баре.

**Test:**
- `src/lib/random-remix.test.ts`
- `src/state/trigger-edit-context.test.ts` (только проверка ошибки «вне провайдера» + дефолтные no-op'ы)
- Расширения в `chat-context.test.ts`, `prompt-chips-context.test.ts`, `app-state.test.ts`.

---

## Conventions

- Каждая задача = атомарный коммит после прохождения тестов.
- TDD: failing test → implement → green → commit. Если тест к шагу не нужен (чисто визуальная правка), это явно отмечено в задаче.
- Не запускать локальный dev-server до завершения визуальных задач — коммитим без рестарта (см. `feedback_keep_dev_server_running`).
- Все строки UI на русском (Onest cyrillic).
- Жёлтый акцент `--brand` использовать только на текущем шаге wizard и primary CTA — на чипсинах PromptBar остаётся `bg-white/10 border-white/15` (как сейчас в `ChipEditableInput.createChipElement`).

---

## Task 1: Удалить режим `expanded` из chat-context

**Files:**
- Modify: `src/state/chat-context.tsx:16-32, 49-51`
- Modify: `src/state/chat-context.test.ts`

- [ ] **Step 1: Обновить тест на отсутствие режима `expanded`**

В `src/state/chat-context.test.ts` заменить случаи c `set_mode: "expanded"` (если есть) и добавить:

```ts
describe("chatReducer mode transitions", () => {
  it("set_mode toggles between collapsed and sidebar only", () => {
    const s1 = chatReducer(empty, { type: "set_mode", mode: "sidebar" });
    expect(s1.mode).toBe("sidebar");
    const s2 = chatReducer(s1, { type: "set_mode", mode: "collapsed" });
    expect(s2.mode).toBe("collapsed");
  });

  it("open_sidebar from collapsed → sidebar", () => {
    const s = chatReducer(empty, { type: "open_sidebar" });
    expect(s.mode).toBe("sidebar");
  });

  it("close_sidebar returns to collapsed", () => {
    const s1 = chatReducer(empty, { type: "open_sidebar" });
    const s2 = chatReducer(s1, { type: "close_sidebar" });
    expect(s2.mode).toBe("collapsed");
  });
});
```

- [ ] **Step 2: Прогнать тест — должен упасть на типах**

Run: `npx vitest run src/state/chat-context.test.ts`
Expected: FAIL — "expanded" всё ещё в типе и/или редьюсере.

- [ ] **Step 3: Удалить `expanded` из ChatPanelMode и ChatBarMode**

В `src/state/chat-context.tsx`:

```ts
export type ChatPanelMode = "collapsed" | "sidebar";
export type ChatBarMode = "collapsed";

export interface ChatState {
  messages: ChatMessage[];
  mode: ChatPanelMode;
  // previousBarMode становится не нужен — закрывать всегда в "collapsed".
}

export type ChatAction =
  | { type: "append"; message: ChatMessage }
  | { type: "update_pending"; id: string; text: string }
  | { type: "clear" }
  | { type: "open_sidebar" }
  | { type: "close_sidebar" };
```

Убрать `set_mode` (нет больше переключения; collapsed — единственный bar-режим). В редьюсере:

```ts
case "open_sidebar":
  return state.mode === "sidebar" ? state : { ...state, mode: "sidebar" };
case "close_sidebar":
  return state.mode === "collapsed" ? state : { ...state, mode: "collapsed" };
```

Убрать `previousBarMode` из `INITIAL_CHAT_STATE`. Убрать `setMode` из `ChatContextValue` и `ChatProvider`.

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run src/state/chat-context.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/state/chat-context.tsx src/state/chat-context.test.ts
git commit -m "refactor(chat): drop expanded peek mode from chat-context"
```

---

## Task 2: Расширить PromptChipKind на `"section"`

**Files:**
- Modify: `src/state/prompt-chips-context.tsx:13`
- Modify: `src/state/prompt-chips-context.test.ts`

- [ ] **Step 1: Тест — section-чипсина проходит через push/clear**

В `src/state/prompt-chips-context.test.ts` добавить:

```ts
it("supports section kind chips", () => {
  const s = promptChipsReducer(
    { chips: [] },
    { type: "push", chip: { id: "section_interests", kind: "section", label: "Интересы", payload: "interests", removable: true } }
  );
  expect(s.chips[0].kind).toBe("section");
  expect(s.chips[0].label).toBe("Интересы");
});
```

- [ ] **Step 2: Прогнать — должен упасть на типе**

Run: `npx vitest run src/state/prompt-chips-context.test.ts`
Expected: FAIL — "section" не в `PromptChipKind`.

- [ ] **Step 3: Расширить тип**

В `src/state/prompt-chips-context.tsx:13`:

```ts
export type PromptChipKind = "trigger" | "mode" | "node" | "section";
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run src/state/prompt-chips-context.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/state/prompt-chips-context.tsx src/state/prompt-chips-context.test.ts
git commit -m "feat(prompt-chips): add section kind for bulk-edit chips"
```

---

## Task 3: TriggerEditContext — бридж step-2 ↔ bar

**Files:**
- Create: `src/state/trigger-edit-context.tsx`
- Create: `src/state/trigger-edit-context.test.ts`

- [ ] **Step 1: Тест — useTriggerEdit без провайдера возвращает no-op api**

```ts
// src/state/trigger-edit-context.test.ts
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTriggerEdit } from "./trigger-edit-context";

describe("useTriggerEdit", () => {
  it("без провайдера возвращает no-op fallback (вне step-2 шагов)", () => {
    const { result } = renderHook(() => useTriggerEdit());
    expect(typeof result.current.applyToTrigger).toBe("function");
    expect(typeof result.current.randomRemix).toBe("function");
    expect(() => result.current.applyToTrigger("any", { kind: "edit", add: [], exclude: [] })).not.toThrow();
  });
});
```

- [ ] **Step 2: Прогнать — должен упасть, файла нет**

Run: `npx vitest run src/state/trigger-edit-context.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать контекст**

```tsx
// src/state/trigger-edit-context.tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ParsedTriggerCommand } from "@/lib/trigger-edit-parser";

export interface TriggerEditApi {
  /** Применить распарсенную команду к delta триггера. */
  applyToTrigger: (triggerId: string, parsed: Exclude<ParsedTriggerCommand, { kind: "fallback" }>) => void;
  /** Кратковременно подсветить карточку триггера (ring-2 ring-brand). */
  highlightTrigger: (triggerId: string) => void;
  /** Проиграть «лёгкий запрос» — рандомизировать selection и deltas. */
  randomRemix: () => void;
  /** Найти triggerId по label — нужно баром, чтобы из чипсины (label) получить id. */
  resolveTriggerIdByLabel: (label: string) => string | null;
}

const NOOP: TriggerEditApi = {
  applyToTrigger: () => {},
  highlightTrigger: () => {},
  randomRemix: () => {},
  resolveTriggerIdByLabel: () => null,
};

const Ctx = createContext<TriggerEditApi>(NOOP);

export function TriggerEditProvider({ value, children }: { value: TriggerEditApi; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTriggerEdit(): TriggerEditApi {
  return useContext(Ctx);
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run src/state/trigger-edit-context.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/state/trigger-edit-context.tsx src/state/trigger-edit-context.test.ts
git commit -m "feat(state): add TriggerEditContext bridge between step-2 and bar"
```

---

## Task 4: random-remix — функция и тест

**Files:**
- Create: `src/lib/random-remix.ts`
- Create: `src/lib/random-remix.test.ts`

- [ ] **Step 1: Тест на детерминизм при сидировании**

```ts
// src/lib/random-remix.test.ts
import { describe, it, expect } from "vitest";
import { computeRandomRemix } from "./random-remix";

const VERTICAL = {
  interestIds: ["i1", "i2", "i3", "i4"],
  triggerIdsByInterest: {
    i1: ["t1a", "t1b"],
    i2: ["t2a"],
    i3: ["t3a", "t3b"],
    i4: ["t4a"],
  },
  domainsByTrigger: {
    t1a: ["a.ru", "b.ru", "c.ru"],
    t1b: ["d.ru"],
    t2a: ["e.ru", "f.ru"],
    t3a: ["g.ru"],
    t3b: ["h.ru", "i.ru"],
    t4a: ["j.ru"],
  },
};

describe("computeRandomRemix", () => {
  it("детерминирована при одном и том же seed", () => {
    const a = computeRandomRemix(VERTICAL, 42);
    const b = computeRandomRemix(VERTICAL, 42);
    expect(a).toEqual(b);
  });

  it("выдаёт разный результат при разных seed", () => {
    const a = computeRandomRemix(VERTICAL, 1);
    const b = computeRandomRemix(VERTICAL, 999);
    expect(a).not.toEqual(b);
  });

  it("выбирает не пустой список интересов и связанные триггеры", () => {
    const r = computeRandomRemix(VERTICAL, 42);
    expect(r.interestIds.length).toBeGreaterThan(0);
    expect(r.triggerIds.length).toBeGreaterThan(0);
    for (const tid of r.triggerIds) {
      const interestForTrigger = Object.entries(VERTICAL.triggerIdsByInterest)
        .find(([, ts]) => ts.includes(tid))?.[0];
      expect(interestForTrigger).toBeDefined();
      expect(r.interestIds).toContain(interestForTrigger!);
    }
  });

  it("формирует deltas только для подмножества выбранных триггеров", () => {
    const r = computeRandomRemix(VERTICAL, 7);
    for (const tid of Object.keys(r.deltas)) {
      expect(r.triggerIds).toContain(tid);
    }
  });
});
```

- [ ] **Step 2: Прогнать — должен упасть, файла нет**

Run: `npx vitest run src/lib/random-remix.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

```ts
// src/lib/random-remix.ts
import type { TriggerDelta } from "./trigger-edit-parser";

export interface RemixVertical {
  interestIds: string[];
  triggerIdsByInterest: Record<string, string[]>;
  domainsByTrigger: Record<string, string[]>;
}

export interface RemixResult {
  interestIds: string[];
  triggerIds: string[];
  deltas: Record<string, TriggerDelta>;
}

function seededRandom(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickN<T>(items: readonly T[], n: number, rng: () => number): T[] {
  if (n >= items.length) return [...items];
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

export function computeRandomRemix(vertical: RemixVertical, seed: number): RemixResult {
  const rng = seededRandom(seed);
  const interestCount = Math.max(1, Math.min(vertical.interestIds.length, 2 + Math.floor(rng() * 2)));
  const interestIds = pickN(vertical.interestIds, interestCount, rng);

  const availableTriggerIds = interestIds.flatMap((iid) => vertical.triggerIdsByInterest[iid] ?? []);
  const triggerCount = Math.max(1, Math.min(availableTriggerIds.length, 3 + Math.floor(rng() * 3)));
  const triggerIds = pickN(availableTriggerIds, triggerCount, rng);

  // Половине выбранных триггеров накидаем delta — добавление 1-2 доменов из соседнего пула.
  const deltas: Record<string, TriggerDelta> = {};
  const allDomains = Object.values(vertical.domainsByTrigger).flat();
  const deltaTargets = pickN(triggerIds, Math.ceil(triggerIds.length / 2), rng);
  for (const tid of deltaTargets) {
    const ownDomains = new Set(vertical.domainsByTrigger[tid] ?? []);
    const candidates = allDomains.filter((d) => !ownDomains.has(d));
    if (candidates.length === 0) continue;
    const added = pickN(candidates, Math.min(2, candidates.length), rng);
    deltas[tid] = { added, excluded: [] };
  }

  return { interestIds, triggerIds, deltas };
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run src/lib/random-remix.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/random-remix.ts src/lib/random-remix.test.ts
git commit -m "feat(lib): add deterministic random-remix for лёгкий запрос demo"
```

---

## Task 5: complex-thinking-demo — фикстура шагов размышлений

**Files:**
- Create: `src/lib/complex-thinking-demo.ts`

- [ ] **Step 1: Реализация (без отдельного теста — это статичная фикстура)**

```ts
// src/lib/complex-thinking-demo.ts

/**
 * Шаги chain-of-thoughts, которые проигрываются в drawer'е по запросу
 * "сложный запрос". Каждый шаг — отдельный pending → resolve в чате; финальное
 * сообщение — короткий ответ модели.
 */
export interface ComplexThinkingStep {
  /** Текст, который "появляется" в pending пузыре. */
  reasoning: string;
  /** Сколько мс держать pending перед update_pending. */
  delayMs: number;
}

export const COMPLEX_THINKING_STEPS: ComplexThinkingStep[] = [
  { reasoning: "Анализирую запрос и доступные интересы…", delayMs: 600 },
  { reasoning: "Сравниваю текущие триггеры с целью кампании…", delayMs: 700 },
  { reasoning: "Определяю, нужно ли уточнить параметры или достаточно текущего контекста…", delayMs: 700 },
];

export const COMPLEX_THINKING_FINAL_REPLY =
  "Я понял сложный запрос, поэтому задам дополнительный вопрос. Какие сегменты вы планируете включить — только горячие или ещё тёплые?";
```

- [ ] **Step 2: Коммит**

```bash
git add src/lib/complex-thinking-demo.ts
git commit -m "feat(lib): add chain-of-thoughts fixture for сложный запрос demo"
```

---

## Task 6: ChatPanelHeader — убрать chevron, оставить только Maximize/Close

**Files:**
- Modify: `src/sections/shell/chat-panel-header.tsx`

- [ ] **Step 1: Заменить header**

```tsx
// src/sections/shell/chat-panel-header.tsx
"use client";

import { Maximize2, X } from "lucide-react";
import type { ChatPanelMode } from "@/state/chat-context";

interface ChatPanelHeaderProps {
  mode: ChatPanelMode;
  onOpenSidebar: () => void;
  onCloseSidebar: () => void;
}

export function ChatPanelHeader({ mode, onOpenSidebar, onCloseSidebar }: ChatPanelHeaderProps) {
  const inSidebar = mode === "sidebar";
  return (
    <div className="flex w-full items-center justify-between px-1 py-0.5">
      <span className="text-xs font-medium text-muted-foreground">Работа с ИИ</span>
      <div className="flex items-center">
        {inSidebar ? (
          <button
            type="button"
            onClick={onCloseSidebar}
            aria-label="Закрыть drawer"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Открыть в drawer"
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

- [ ] **Step 2: Коммит (без отдельного юнит-теста — компонент пере-разводящий пропсы)**

```bash
git add src/sections/shell/chat-panel-header.tsx
git commit -m "refactor(chat-header): drop expand chevron, keep drawer toggle only"
```

---

## Task 7: ChatComposer — отдавать сегменты вместе с текстом

**Files:**
- Modify: `src/sections/shell/chat-composer.tsx`

- [ ] **Step 1: Расширить onSubmit**

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
import type { ChipSegment } from "@/state/prompt-chips-context";
import { usePromptChips } from "@/state/prompt-chips-context";
import { cn } from "@/lib/utils";

export interface ChatComposerSubmitPayload {
  text: string;
  segments: ChipSegment[];
}

interface ChatComposerProps {
  placeholder: string;
  onSubmit: (payload: ChatComposerSubmitPayload) => void;
}

export function ChatComposer({ placeholder, onSubmit }: ChatComposerProps) {
  const editorRef = useRef<ChipEditableInputHandle>(null);
  const { clearChips } = usePromptChips();

  function handleSubmit(message: PromptInputMessage) {
    const text = (message.text ?? "").trim();
    const segments = editorRef.current?.getSegments() ?? [];
    if (!text && segments.length === 0) return;
    onSubmit({ text, segments });
    editorRef.current?.clear();
    clearChips();
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

- [ ] **Step 2: Коммит**

```bash
git add src/sections/shell/chat-composer.tsx
git commit -m "refactor(chat-composer): expose chip segments alongside text on submit"
```

---

## Task 8: ChatPanel — убрать peek, маршрутизировать сабмиты

**Files:**
- Modify: `src/sections/shell/chat-panel.tsx`

Это самая толстая правка. Делается одним шагом, потому что промежуточные состояния не компилируются (мы убираем `expanded`-режим, на который ссылаются хедер и стили).

- [ ] **Step 1: Переписать ChatPanel целиком**

```tsx
// src/sections/shell/chat-panel.tsx
"use client";

import Image from "next/image";
import { useLayoutEffect } from "react";
import { motion } from "motion/react";
import { useChat } from "@/state/chat-context";
import { useTriggerEdit } from "@/state/trigger-edit-context";
import { ChatPanelHeader } from "./chat-panel-header";
import { ChatHistoryList } from "./chat-history-list";
import { ChatComposer, type ChatComposerSubmitPayload } from "./chat-composer";
import { mockReplyFor, mockReplyForFreeText } from "@/lib/mock-ai-reply";
import { parseTriggerCommand } from "@/lib/trigger-edit-parser";
import { COMPLEX_THINKING_FINAL_REPLY, COMPLEX_THINKING_STEPS } from "@/lib/complex-thinking-demo";

const SIDEBAR_WIDTH_PX = 420;
const LIGHT_QUERY = "лёгкий запрос";
const HEAVY_QUERY = "сложный запрос";

function EmptyHistory() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
      <Image src="/mascot-icon.svg" alt="" width={32} height={32} aria-hidden />
      <p className="text-xs text-muted-foreground">
        Здесь будет история переписки с афина ИИ
      </p>
    </div>
  );
}

export function ChatPanel({ placeholder }: { placeholder: string }) {
  const chat = useChat();
  const triggerEdit = useTriggerEdit();

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--chat-sidebar-width",
      chat.mode === "sidebar" ? `${SIDEBAR_WIDTH_PX}px` : "0px"
    );
    return () => root.style.removeProperty("--chat-sidebar-width");
  }, [chat.mode]);

  function playComplexThinking() {
    chat.openSidebar();
    let cursor = 0;
    function nextStep() {
      if (cursor >= COMPLEX_THINKING_STEPS.length) {
        chat.append({ role: "assistant", text: COMPLEX_THINKING_FINAL_REPLY });
        return;
      }
      const step = COMPLEX_THINKING_STEPS[cursor++];
      const id = chat.append({ role: "assistant", text: "", pending: true });
      window.setTimeout(() => {
        chat.updatePending(id, step.reasoning);
        nextStep();
      }, step.delayMs);
    }
    nextStep();
  }

  function handleSubmit(payload: ChatComposerSubmitPayload) {
    const { text, segments } = payload;
    const normalized = text.trim().toLowerCase();

    // 1. Hard-coded test queries — приоритет над всем остальным.
    if (normalized === LIGHT_QUERY) {
      chat.append({ role: "user", text });
      const id = chat.append({ role: "assistant", text: "", pending: true });
      triggerEdit.randomRemix();
      window.setTimeout(() => {
        chat.updatePending(id, "Перебрал интересы и триггеры — посмотрите выделенные карточки.");
      }, 400);
      return;
    }
    if (normalized === HEAVY_QUERY) {
      chat.append({ role: "user", text });
      playComplexThinking();
      return;
    }

    // 2. Сегмент с trigger-чипсиной → применить как команду к delta.
    const triggerSegment = segments.find((s) => s.chip.kind === "trigger");
    if (triggerSegment && triggerSegment.text.length > 0) {
      const parsed = parseTriggerCommand(triggerSegment.text);
      if (parsed.kind !== "fallback") {
        const triggerId = triggerSegment.chip.payload as string;
        chat.append({ role: "user", text: triggerSegment.text, triggerLabel: triggerSegment.chip.label });
        const id = chat.append({ role: "assistant", text: "", pending: true });
        triggerEdit.highlightTrigger(triggerId);
        window.setTimeout(() => {
          triggerEdit.applyToTrigger(triggerId, parsed);
          chat.updatePending(id, mockReplyFor(parsed));
        }, 350);
        return;
      }
      // fallback: просто отправить как свободный текст (см. ниже).
    }

    // 3. Section-чипсина или произвольный текст — фолбэк.
    chat.append({ role: "user", text });
    const id = chat.append({ role: "assistant", text: "", pending: true });
    window.setTimeout(() => chat.updatePending(id, mockReplyForFreeText()), 350);
  }

  const isEmpty = chat.messages.length === 0;

  if (chat.mode === "sidebar") {
    return (
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
        className="fixed right-0 top-0 z-30 flex h-screen w-[420px] flex-col gap-3 border-l border-white/10 bg-[rgba(10,10,10,0.85)] p-4 backdrop-blur-[2px]"
      >
        <ChatPanelHeader
          mode={chat.mode}
          onOpenSidebar={chat.openSidebar}
          onCloseSidebar={chat.closeSidebar}
        />
        {isEmpty ? <EmptyHistory /> : <ChatHistoryList messages={chat.messages} variant="sidebar" />}
        <ChatComposer placeholder={placeholder} onSubmit={handleSubmit} />
      </motion.aside>
    );
  }

  // Collapsed: только бар с композером, без peek-истории.
  return (
    <motion.div
      className="fixed left-[120px] right-0 bottom-[20px] z-30 flex justify-center px-6"
      initial={false}
    >
      <div className="flex w-full max-w-[720px] flex-col gap-2 rounded-[16px] bg-[rgba(10,10,10,0.75)] p-3 shadow-[0_0_17px_9px_rgba(0,0,0,0.19)] backdrop-blur-[2px]">
        <ChatPanelHeader
          mode={chat.mode}
          onOpenSidebar={chat.openSidebar}
          onCloseSidebar={chat.closeSidebar}
        />
        <ChatComposer placeholder={placeholder} onSubmit={handleSubmit} />
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Прогнать lint + сборку**

Run: `npx eslint src/sections/shell/chat-panel.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p .` (или `next build` если есть проблемы с типами)
Expected: PASS.

- [ ] **Step 3: Коммит**

```bash
git add src/sections/shell/chat-panel.tsx
git commit -m "feat(chat): unified PromptBar + drawer routing with test queries"
```

---

## Task 9: app-state — экшен `wizard_random_remix`

**Files:**
- Modify: `src/state/app-state.ts`
- Modify: `src/state/app-state.test.ts`

Цель — дать step-2 сигнал (через монотонный счётчик), что нужно перебросить selection. Логика выбора живёт в самом step-2 (там есть доступ к `interestsForDirection`); app-state просто инкрементирует токен.

- [ ] **Step 1: Тест на инкремент**

В `src/state/app-state.test.ts` добавить:

```ts
it("wizard_random_remix increments wizardRemixToken", () => {
  const s0 = appReducer(INITIAL_APP_STATE, { type: "go_welcome" });
  const s1 = appReducer(s0, { type: "wizard_random_remix" });
  const s2 = appReducer(s1, { type: "wizard_random_remix" });
  expect(s2.wizardRemixToken).toBe((s0.wizardRemixToken ?? 0) + 2);
});
```

- [ ] **Step 2: Прогнать — должен упасть (нет поля и экшена)**

Run: `npx vitest run src/state/app-state.test.ts`
Expected: FAIL.

- [ ] **Step 3: Добавить поле и экшен**

В `src/state/app-state.ts`:
- В `AppState` добавить `wizardRemixToken: number;`
- В `INITIAL_APP_STATE` (или эквивалент) задать `wizardRemixToken: 0`.
- В `AppAction` добавить `| { type: "wizard_random_remix" }`.
- В редьюсере: `case "wizard_random_remix": return { ...state, wizardRemixToken: state.wizardRemixToken + 1 };`

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run src/state/app-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/state/app-state.ts src/state/app-state.test.ts
git commit -m "feat(app-state): add wizard_random_remix action and token"
```

---

## Task 10: Step-2 — маскот рядом с заголовками + чипсины секции

**Files:**
- Modify: `src/sections/signals/steps/step-2-interests.tsx`

- [ ] **Step 1: Добавить кликабельный SectionHeader с маскотом**

Заменить блоки `<p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Интересы</p>` (и аналогичный для Триггеров) на компонент `SectionHeader`:

```tsx
import { usePromptChips } from "@/state/prompt-chips-context";

function SectionHeader({
  label,
  sectionId,
  onClick,
}: {
  label: string;
  sectionId: "interests" | "triggers";
  onClick: () => void;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <button
        type="button"
        onClick={onClick}
        aria-label={`Спросить AI про ${label.toLowerCase()}`}
        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        data-section-id={sectionId}
      >
        <Image src="/mascot-icon.svg" alt="" width={14} height={14} aria-hidden />
      </button>
    </div>
  );
}
```

В `Step2Interests` реализовать `pushSectionChip`:

```tsx
const { pushChip, clearChips } = usePromptChips();

function pushSectionChip(section: "interests" | "triggers") {
  // Снимаем все предыдущие контекстные чипсины — section-чипсина одна за раз.
  clearChips();
  pushChip({
    id: `section_${section}`,
    kind: "section",
    label: section === "interests" ? "Интересы" : "Триггеры",
    payload: section,
    removable: true,
  });
}
```

И заменить заголовки:

```tsx
<SectionHeader label="Интересы" sectionId="interests" onClick={() => pushSectionChip("interests")} />
// ... existing interest chips ...

<SectionHeader label="Триггеры" sectionId="triggers" onClick={() => pushSectionChip("triggers")} />
// ... existing trigger cards ...
```

- [ ] **Step 2: Не запускаем тесты — UI-правка. Запускаем lint**

Run: `npx eslint src/sections/signals/steps/step-2-interests.tsx`
Expected: PASS.

- [ ] **Step 3: Коммит**

```bash
git add src/sections/signals/steps/step-2-interests.tsx
git commit -m "feat(step-2): add mascot icon next to section headers for bulk-edit chip"
```

---

## Task 11: Step-2 — заменить TriggerConfigurePopover на push trigger-чипсины

**Files:**
- Modify: `src/sections/signals/steps/step-2-interests.tsx`
- Modify: `src/sections/signals/steps/step-2-interests.tsx` (TriggerCard внутри)

- [ ] **Step 1: Изменить контракт `renderConfigureButton` → `onConfigureClick`**

В `TriggerCardProps` заменить:

```tsx
// было:
renderConfigureButton: (button: React.ReactElement) => React.ReactElement;

// стало:
onConfigureClick: () => void;
```

В рендере кнопки (внутри `TriggerCard`):

```tsx
{showConfigureButton && (
  <div className="flex">
    <button
      type="button"
      onClick={onConfigureClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <MascotIcon className="h-4 w-4" />
      Настроить
    </button>
  </div>
)}
```

`isEditing` отлёт (попап удалён); `activePopoverTriggerId` тоже больше не нужен.

- [ ] **Step 2: Обработчик клика — пушит trigger-чипсину**

В `Step2Interests`:

```tsx
function pushTriggerChip(triggerId: string, triggerLabel: string) {
  // Снимаем предыдущие чипсины (правило «один контекст за раз», см. doc).
  clearChips();
  pushChip({
    id: `trigger_${triggerId}`,
    kind: "trigger",
    label: triggerLabel,
    payload: triggerId,
    removable: true,
  });
  // Композер сам ловит фокус через diff-эффект ChipEditableInput; для верности
  // дёрнем focus на DOM-редакторе если он есть на странице.
  const el = document.querySelector<HTMLDivElement>('[role="textbox"][contenteditable="true"]');
  el?.focus();
}
```

И в `availableTriggers.map`:

```tsx
<TriggerCard
  key={trigger.id}
  trigger={trigger}
  domains={getTriggerDomains(trigger.id)}
  selected={selectedTriggers.includes(trigger.id)}
  delta={deltas[trigger.id] ?? EMPTY_DELTA}
  highlight={highlightedTriggerIds.has(trigger.id)}
  expanded={expandedTriggerIds.has(trigger.id)}
  onToggle={() => toggleTrigger(trigger.id)}
  onToggleExpanded={() => toggleExpanded(trigger.id)}
  onConfigureClick={() => pushTriggerChip(trigger.id, trigger.label)}
  onRemoveDelta={(bucket, domain) => handleRemoveDelta(trigger.id, bucket, domain)}
/>
```

- [ ] **Step 3: Удалить импорт `TriggerConfigurePopover` и связанный state (`activePopoverTriggerId`)**

Из step-2 убрать:
- `import { TriggerConfigurePopover } from "./trigger-configure-popover";`
- `const [activePopoverTriggerId, setActivePopoverTriggerId] = useState<...>(null);`
- Проп `isEditing` из `TriggerCardProps`.
- В `toggleTrigger` строку `setActivePopoverTriggerId((cur) => (cur === triggerId ? null : cur));`.

- [ ] **Step 4: Lint**

Run: `npx eslint src/sections/signals/steps/step-2-interests.tsx`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/sections/signals/steps/step-2-interests.tsx
git commit -m "feat(step-2): replace popover with PromptBar trigger chip + focus"
```

---

## Task 12: Step-2 — обернуть в TriggerEditProvider, реализовать handlers

**Files:**
- Modify: `src/sections/signals/steps/step-2-interests.tsx`

- [ ] **Step 1: Добавить TriggerEditProvider вокруг рендера**

```tsx
import { TriggerEditProvider, type TriggerEditApi } from "@/state/trigger-edit-context";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { computeRandomRemix } from "@/lib/random-remix";
import { getTriggerDomains } from "@/data/trigger-domains";

// В Step2Interests:
const dispatch = useAppDispatch();
const { wizardRemixToken } = useAppState();

const triggerEditApi = useMemo<TriggerEditApi>(() => ({
  applyToTrigger: (triggerId, parsed) => {
    handleApplyParsed(triggerId, parsed); // существующая функция в step-2
  },
  highlightTrigger: (triggerId) => {
    setHighlightedTriggerIds(new Set([triggerId]));
    window.setTimeout(() => setHighlightedTriggerIds(new Set()), 600);
  },
  randomRemix: () => {
    dispatch({ type: "wizard_random_remix" });
  },
  resolveTriggerIdByLabel: (label) => {
    const found = availableTriggers.find(({ trigger }) => trigger.label === label);
    return found ? found.trigger.id : null;
  },
}), [availableTriggers, dispatch]);
```

Обернуть верхний `<StepContent>` в `<TriggerEditProvider value={triggerEditApi}>`:

```tsx
return (
  <TriggerEditProvider value={triggerEditApi}>
    <StepContent ...>
      ...
    </StepContent>
  </TriggerEditProvider>
);
```

- [ ] **Step 2: Подписаться на изменения wizardRemixToken и переброс state**

```tsx
useEffect(() => {
  // Пропускаем первый рендер (при mount remix не нужен).
  if (wizardRemixToken === 0) return;
  const vertical = {
    interestIds: interestsForDirection.map((i) => i.id),
    triggerIdsByInterest: Object.fromEntries(
      interestsForDirection.map((i) => [i.id, i.triggers.map((t) => t.id)])
    ),
    domainsByTrigger: Object.fromEntries(
      interestsForDirection.flatMap((i) =>
        i.triggers.map((t) => [t.id, getTriggerDomains(t.id)])
      )
    ),
  };
  const r = computeRandomRemix(vertical, wizardRemixToken * 31 + 7);
  setSelectedInterests(r.interestIds);
  setSelectedTriggers(r.triggerIds);
  setDeltas(r.deltas);
  // Подсветим перебросанные триггеры.
  setHighlightedTriggerIds(new Set(r.triggerIds));
  window.setTimeout(() => setHighlightedTriggerIds(new Set()), 800);
}, [wizardRemixToken, interestsForDirection]);
```

- [ ] **Step 3: Lint + сборка типов**

Run: `npx eslint src/sections/signals/steps/step-2-interests.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 4: Коммит**

```bash
git add src/sections/signals/steps/step-2-interests.tsx
git commit -m "feat(step-2): wire TriggerEditProvider for bar→step-2 control flow"
```

---

## Task 13: Удалить TriggerConfigurePopover

**Files:**
- Delete: `src/sections/signals/steps/trigger-configure-popover.tsx`

- [ ] **Step 1: Проверить, что больше нет импортов**

Run: `grep -rn "trigger-configure-popover\|TriggerConfigurePopover" src/`
Expected: пусто (или только импорт, который мы удалили — пере-проверить).

- [ ] **Step 2: Удалить файл**

Run: `git rm src/sections/signals/steps/trigger-configure-popover.tsx`

- [ ] **Step 3: Прогнать lint + tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Коммит**

```bash
git commit -m "chore: remove TriggerConfigurePopover (replaced by PromptBar chip)"
```

---

## Task 14: Smoke-проверка в браузере

UI-чек после полной правки. Не автоматизируется юнитами — требует ручной валидации.

- [ ] **Step 1: Запустить dev-server**

Run: `npm run dev`

- [ ] **Step 2: Пройти сценарий вручную**

Кейсы для проверки:
1. **Триггерная чипсина**: на step-2 кликнуть «Настроить» → курсор в баре, чипсина «Сайты автодилеров», ввести «добавь cars.ru», отправить → карточка подсвечивается, добавление появляется в delta-списке, в чате (drawer закрыт) — ответ «Добавил 1 домен в триггер.».
2. **Section-чипсина (Интересы)**: кликнуть маскот рядом с «Интересы» → чипсина «Интересы» в баре, ввести произвольный текст, отправить → чат отвечает фолбэком (drawer закрыт).
3. **Section-чипсина (Триггеры)**: аналогично; чипсина «Триггеры».
4. **Лёгкий запрос**: ввести в баре «лёгкий запрос», отправить → выбранные интересы/триггеры/deltas меняются, карточки подсвечиваются ~800мс. Drawer НЕ открывается.
5. **Сложный запрос**: ввести «сложный запрос» → drawer открывается автоматически, появляются 3 шага размышлений (pending → resolve), затем финальный ответ «Я понял сложный запрос…». Бар уезжает, композер встроен в drawer.
6. **Ручное открытие drawer**: на свежем сценарии кликнуть Maximize2 в шапке бара → drawer открывается, бар уезжает.
7. **Закрытие drawer**: кликнуть X в drawer → бар возвращается, история сохранена в drawer (откроем повторно).
8. **Чевры/peek**: убедиться, что больше нет «маленькой раскрывающейся истории» над баром (никаких chevron-кнопок, никаких peek-окон).
9. **Драфт черновика**: на step-2 кликнуть «Настроить» на триггере A, начать вводить «добавь a.ru» (НЕ отправлять), кликнуть «Настроить» на триггере B → чипсина сменилась на B, текст «добавь a.ru» сохранился (ожидаемое поведение из спеки — драфт переносится).

- [ ] **Step 3: Если что-то не так — фикс отдельным коммитом, не возвращаемся в предыдущие задачи**

---

## Task 15: Финальный pass — lint, typecheck, тесты

- [ ] **Step 1: Полный прогон**

Run: `npm run lint && npx tsc --noEmit -p . && npm test`
Expected: всё зелёное.

- [ ] **Step 2: Чистый git status**

Run: `git status`
Expected: working tree clean (либо только untracked файлы, не относящиеся к задаче).

---

## Self-Review

**Spec coverage** (по разделам `docs/promptbar-drawer-mehanika.md`):
- Три сущности (элемент, PromptBar, drawer) — Tasks 1, 6, 8.
- «Кнопка с маскотом → PromptBar» как общий паттерн — Tasks 10 (секции), 11 (триггеры).
- Чипсина контекста — Tasks 2, 10, 11.
- Драфт переносится при смене элемента — поведение `clearChips()` + `pushChip()` оставляет текст в редакторе (текст не чистится; см. Task 11 step 2).
- Подсветка элемента после правки — Task 12 (`highlightTrigger`).
- Работа со всем экраном (без чипсины) → AI решает сам — Task 8 (фолбэк-ветка `mockReplyForFreeText`).
- Автораскрытие drawer для «сложного запроса» — Task 8 (`playComplexThinking`).
- Ручное открытие drawer — Task 6 (Maximize2 в хедере).
- Закрытие drawer возвращает PromptBar, история сохраняется — уже есть в существующем `chat.closeSidebar` (Task 1 упростил, но контракт сохранили).
- Маленькая раскрывающаяся история убрана — Task 1 (мод убран) + Task 8 (рендер убран) + Task 6 (chevron убран).
- История в рамках одного контекста — поведение `wizardSessionId` уже есть (`chat-context.tsx:113`), не трогаем.
- Тестовые запросы «лёгкий запрос» / «сложный запрос» — Tasks 4, 5, 8, 9, 12.

**Placeholder scan**: код блоков везде, никаких "TODO/TBD/implement later". Тесты содержат конкретные ассерты.

**Type consistency**:
- `TriggerEditApi.applyToTrigger(triggerId, parsed)` совпадает с тем, что вызывает `ChatPanel.handleSubmit` (Task 8) и реализует step-2 (Task 12).
- `ChatComposerSubmitPayload { text, segments }` экспортируется из Task 7 и потребляется в Task 8.
- `wizardRemixToken` инкрементируется в app-state (Task 9) и читается в step-2 (Task 12).
- `PromptChipKind = "trigger" | "mode" | "node" | "section"` (Task 2) — `payload: string` для trigger (id триггера) и для section ("interests"/"triggers"); консьюмеры (Task 8) типизированы соответствующе.
- В Task 9 `INITIAL_APP_STATE` — точное имя константы нужно сверить при имплементации; если она называется иначе (например, `INITIAL_STATE` или построена через функцию), обновить тест.

**Открытые вопросы (отложены явно):**
- Бридж section-чипсины ↔ конкретные действия по секции — пока обрабатываем как фолбэк (`mockReplyForFreeText`). Реальные команды для секции «массово исключи каналы X» — за пределами этого плана (см. «Открытые вопросы» в спеке: «Массовые правки»).
- Откат правок (undo) — out of scope.

---

## Execution Handoff

Plan complete and saved to `docs/2026-05-05-promptbar-drawer-mehanika-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** — я диспатчу свежий subagent на каждую таску, делаю review между ними, быстрые итерации.

**2. Inline Execution** — выполняю задачи в этой сессии через executing-plans, батч-исполнение с чекпойнтами.

Какой подход?
