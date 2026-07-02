# Правки прототипа 2026-05-15 — План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать 7 задач полировки прототипа Afina в 3 областях — мастер сигнала, промпт-бар, поля нод.

**Architecture:** Унификация промпт-бара через общую обёртку `PromptBar` (карточка + шапка + слот) с глобальным правым AI-drawer; «Тип сигнала» как первый пункт степпера; каталог редактируемости полей нод как типизированная карта, питающая по-польные иконки и инлайн-редактирование в `NodeCardBody`.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, motion v12, lucide-react, Vitest. Тесты — только логические (`*.test.ts`), без рендер-тестов компонентов; чисто визуальные правки проверяются через `lint` + `tsc` + dev-сервер.

**Спека:** `docs/superpowers/specs/2026-05-15-prototype-tasks-design.md`
**Ветка:** `feature/prototype-tasks-2026-05-15` (worktree `.worktrees/prototype-tasks-2026-05-15`)

---

## Структура файлов

**Создаются:**
- `src/sections/shell/prompt-bar.tsx` — общая визуальная обёртка промпт-бара.
- `src/sections/shell/chat-drawer.tsx` — глобальный правый AI-drawer (вынесен из `ChatPanel`).
- `src/sections/shell/use-chat-submit.ts` — общий хук сабмита чата (mock-AI логика).
- `src/state/node-field-editability.ts` — каталог редактируемости полей нод (задача 7).
- `src/state/node-field-editability.test.ts`, `src/sections/signals/campaign-stepper.test.ts`,
  `src/sections/signals/survey-gate.test.ts` — тесты.
- `src/state/survey-gate.ts` — чистая функция решения о показе экрана сайта.

**Модифицируются:**
- `src/sections/survey/survey-awaiting.tsx` — переименование (задача 1).
- `src/sections/shell/chat-panel-header.tsx` — иконка drawer (задача 3).
- `src/app/globals.css` — токен `--promptbar-gap` + утилита `pb-promptbar` (задача 5).
- `src/sections/welcome/welcome-view.tsx`, `signals-section.tsx`, `campaigns-section.tsx`,
  `statistics-view.tsx`, `campaign-workspace.tsx` — отступ под промпт-бар (задача 5).
- `src/sections/shell/shell-bottom-bar.tsx`, `chat-panel.tsx` — переход на `PromptBar` (задача 4).
- `src/app/page.tsx` — глобальный drawer + единый бар (задача 4).
- `src/sections/signals/campaign-stepper.tsx`, `campaign-workspace.tsx` — степпер (задача 2).
- `src/sections/signals/guided-signal-section.tsx` — гейт сайта (задача 2).
- `src/sections/campaigns/node-card-content.tsx` — по-польные иконки + инлайн-правка (задача 6).
- `src/state/app-state.ts`, `src/sections/campaigns/workflow-section.tsx`, `workflow-view.tsx`
  — проводка инлайн-правки поля ноды (задача 6).

**Фазы:** 1 (задачи 1·3) → 2 (задача 5) → 3 (задача 4) → 4 (задача 2) → 5 (задача 7) → 6 (задача 6).

Перед каждым коммитом: `npm run lint` и `npm test` зелёные. Сообщения коммитов завершать строкой
`Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## Фаза 1 — Быстрые правки

### Task 1: Переименование экрана обогащения данными

**Files:**
- Modify: `src/sections/survey/survey-awaiting.tsx:40-47`

- [ ] **Step 1: Заменить заголовок и подзаголовок**

В `survey-awaiting.tsx` блок `<h1>…</h1>` + `<p>…</p>` (строки 40-47) заменить на:

```tsx
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Обогащение данными
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {websiteHostname
          ? `Изучаем ${websiteHostname} и дополняем профиль компании`
          : "Дополняем профиль компании данными"}
      </p>
```

- [ ] **Step 2: Проверка**

Run: `npm run lint && npm test`
Expected: lint без ошибок; `Test Files 19 passed`, `Tests 265 passed`.

- [ ] **Step 3: Commit**

```bash
git add src/sections/survey/survey-awaiting.tsx
git commit -m "$(printf 'feat(survey): rename enrichment screen to "Обогащение данными"\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

### Task 2: Иконка открытия drawer

**Files:**
- Modify: `src/sections/shell/chat-panel-header.tsx:5,39`

- [ ] **Step 1: Заменить импорт иконки**

Строка 5 — заменить `Maximize2` на `PanelRightOpen`:

```tsx
import { PanelRightOpen, X } from "lucide-react";
```

- [ ] **Step 2: Заменить использование иконки**

Строка 39 (внутри кнопки `onOpenSidebar`) — `<Maximize2 className="h-4 w-4" />` →

```tsx
            <PanelRightOpen className="h-4 w-4" />
```

- [ ] **Step 3: Проверка**

Run: `npm run lint && npx tsc --noEmit`
Expected: без ошибок (`Maximize2` больше нигде не используется в этом файле).

- [ ] **Step 4: Commit**

```bash
git add src/sections/shell/chat-panel-header.tsx
git commit -m "$(printf 'feat(promptbar): swap drawer icon to PanelRightOpen\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Фаза 2 — Отступ под промпт-бар (задача 5)

### Task 3: Токен `--promptbar-gap` + утилита `pb-promptbar` + применение

`--promptbar-height` уже выставляется `ShellBottomBar` через `ResizeObserver`; после Task 6
то же делает общий `PromptBar`. Здесь — единый способ потребления отступа.

**Files:**
- Modify: `src/app/globals.css` (блок `@theme` ~строка 54)
- Modify: `src/sections/welcome/welcome-view.tsx:23`
- Modify: `src/sections/signals/signals-section.tsx:89`
- Modify: `src/sections/campaigns/campaigns-section.tsx:74`
- Modify: `src/sections/statistics/statistics-view.tsx:348`
- Modify: `src/sections/signals/campaign-workspace.tsx:243`

- [ ] **Step 1: Добавить токен и утилиту в globals.css**

В конец блока `@theme { … }` (рядом с `--ease-out-strong`) добавить токен; после блока `@theme`
добавить директиву `@utility` (Tailwind v4):

```css
  /* Запас под нижний промпт-бар: его offset от низа (20px) + воздух. */
  --promptbar-gap: 2.25rem;
```

```css
/* Отступ снизу для скролл-контейнеров — контент не уходит под промпт-бар.
   --promptbar-height ставит компонент PromptBar; фолбэк на случай до его маунта. */
@utility pb-promptbar {
  padding-bottom: calc(var(--promptbar-height, 9rem) + var(--promptbar-gap));
}
```

- [ ] **Step 2: Применить `pb-promptbar` к скролл-контейнерам**

- `welcome-view.tsx:22-23` — убрать инлайн-`style` с `paddingBottom`, добавить класс
  `pb-promptbar` в `className` контейнера (строка 22).
- `signals-section.tsx:89` — заменить `pb-40` на `pb-promptbar`.
- `campaigns-section.tsx:74` — заменить `pb-40` на `pb-promptbar`.
- `statistics-view.tsx:348` — заменить `pb-8` на `pb-promptbar`.
- `campaign-workspace.tsx:243` — в `className` шаговой колонки заменить `pb-40` на `pb-promptbar`.

- [ ] **Step 3: Проверка**

Run: `npm run lint && npm test`
Expected: lint чисто; 265 тестов зелёные.
Визуально (dev-сервер): на каждом экране низ контента при прокрутке не перекрывается баром.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/sections/welcome/welcome-view.tsx src/sections/signals/signals-section.tsx src/sections/campaigns/campaigns-section.tsx src/sections/statistics/statistics-view.tsx src/sections/signals/campaign-workspace.tsx
git commit -m "$(printf 'feat(promptbar): unified pb-promptbar spacing for scroll containers\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Фаза 3 — Унификация промпт-бара + глобальный drawer (задача 4)

### Task 4: Компонент-обёртка `PromptBar`

Визуальная обёртка: `fixed`-позиционирование + фростед-карточка + шапка (маскот + «Афина ИИ» +
кнопка drawer) + слот для контента. Сам выставляет `--promptbar-height`. Транзиентный 3vh-offset
`ShellBottomBar` не переносится — бар всегда прижат к низу (упрощение унификации).

**Files:**
- Create: `src/sections/shell/prompt-bar.tsx`

- [ ] **Step 1: Создать `prompt-bar.tsx`**

```tsx
"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import Image from "next/image";
import { PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface PromptBarProps {
  /** Тело бара — инпут, футер, чипсы конкретного экрана. */
  children: ReactNode;
  /** Открывает правый AI-drawer. */
  onOpenDrawer: () => void;
  /** Контент между шапкой и телом (transient reply, budget-help ответ). */
  slot?: ReactNode;
  /** Доп. классы карточки. */
  cardClassName?: string;
}

/**
 * Единая обёртка промпт-бара для всех экранов. Шапка (маскот + «Афина ИИ» +
 * кнопка drawer) одинакова везде; тело передаётся через children.
 * Карточка измеряется через ResizeObserver — это единственный источник
 * CSS-переменной --promptbar-height (потребляется утилитой pb-promptbar).
 */
export function PromptBar({ children, onOpenDrawer, slot, cardClassName }: PromptBarProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const apply = () => {
      const h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty(
        "--promptbar-height",
        `${Math.round(h)}px`
      );
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--promptbar-height");
    };
  }, []);

  return (
    <div className="fixed left-[120px] right-0 bottom-5 z-30 flex justify-center px-6">
      <div
        ref={cardRef}
        className={cn(
          "flex w-full max-w-[720px] flex-col gap-2 rounded-[16px] p-3",
          "bg-[rgba(10,10,10,0.75)] shadow-[0_0_17px_9px_rgba(0,0,0,0.19)] backdrop-blur-[2px]",
          cardClassName
        )}
      >
        <div className="flex w-full items-center justify-between px-1 py-0.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Image
              src="/mascot-icon.svg"
              alt=""
              width={14}
              height={14}
              aria-hidden
              className="shrink-0"
            />
            Афина ИИ
          </span>
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label="Открыть в drawer"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        </div>
        {slot}
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Проверка**

Run: `npx tsc --noEmit && npm run lint`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/sections/shell/prompt-bar.tsx
git commit -m "$(printf 'feat(promptbar): add shared PromptBar wrapper component\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

### Task 5: `ShellBottomBar` использует `PromptBar`

**Files:**
- Modify: `src/sections/shell/shell-bottom-bar.tsx`

- [ ] **Step 1: Прочитать текущий `shell-bottom-bar.tsx`**

Изучить файл целиком. Сохраняемая логика: `SelectedNodeChipEffect`, `ClearChipsOnViewChangeEffect`,
`handlePromptSubmit`, `chatPlaceholder`, бюджет-help (`budget-help-answer` и кнопка-чип).
Удаляемое: внешний `fixed`-див, фростед-карточка, ручной `ResizeObserver` (`barRef`/`useLayoutEffect`
строки 197-212), `pinnedToBottom`/`transientOffset`.

- [ ] **Step 2: Завернуть тело в `PromptBar`**

Добавить импорт: `import { PromptBar } from "./prompt-bar";` и `import { useChat } from "@/state/chat-context";`.
В теле компонента: `const { openSidebar } = useChat();`.
Удалить `barRef` + `useLayoutEffect` ResizeObserver-блок и переменные `isWorkflow`/`pinnedToBottom`/
`transientOffset` (если больше не нужны; `onWelcome` оставить — используется в JSX).
`return` переписать так, чтобы `<PromptBar>` оборачивал `<PromptInput>…</PromptInput>` и условные
чипсы; бюджет-help ответ (текущие строки 241-267) передать в проп `slot`:

```tsx
  return (
    <>
      <SelectedNodeChipEffect selected={selectedWorkflowNode} />
      <ClearChipsOnViewChangeEffect viewKind={view.kind} />
      <PromptBar
        onOpenDrawer={openSidebar}
        slot={
          view.kind === "guided-signal" &&
          wizardCurrentStep === 5 &&
          budgetHelpShown ? (
            <motion.div
              key="budget-help-answer"
              initial={{ y: 6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
              data-testid="budget-help-answer"
              className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80"
            >
              <Image
                src="/mascot-icon.svg"
                alt=""
                width={16}
                height={16}
                className="mt-0.5 shrink-0"
                aria-hidden
              />
              <span className="leading-snug">
                Рекомендуемая сумма рассчитана из размера вашей базы и средних
                цен по сегментам. Мы заложили её так, чтобы хватило на полный
                цикл сбора сигналов без перерасхода — обычно это 5–35% от
                размера базы в рублях.
              </span>
            </motion.div>
          ) : undefined
        }
      >
        <PromptInput
          onSubmit={handlePromptSubmit}
          className={cn(
            "[&_[data-slot=input-group]]:rounded-[10px]!",
            "[&_[data-slot=input-group]]:border!",
            "[&_[data-slot=input-group]]:border-white/15!",
            "[&_[data-slot=input-group]]:bg-white/5!",
            "dark:[&_[data-slot=input-group]]:bg-white/5!",
            "[&_[data-slot=input-group]]:backdrop-blur-[14.8px]",
            "[&_[data-slot=input-group]]:shadow-[0_0_17px_9px_rgba(0,0,0,0.19)]"
          )}
        >
          <AttachmentFileList />
          <ChipEditableInput
            ref={editorRef}
            className="px-3 py-2"
            placeholder={chatPlaceholder}
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
        {onWelcome && welcomeChat && (
          <OnboardingChatChips
            chips={welcomeChat.chips}
            onChipClick={welcomeChat.submitChip}
          />
        )}
        {view.kind === "section" && view.name === "Кампании" && campaigns.length > 0 && (
          <CampaignsPromptChips
            onChipClick={(text) => {
              const { statuses, sort } = parseCampaignQuery(text);
              if (statuses.length > 0 || sort !== "default") {
                dispatch({ type: "campaigns_query_set", statuses, sort });
              }
            }}
          />
        )}
        {view.kind === "guided-signal" &&
          wizardCurrentStep === 5 &&
          !budgetHelpShown && (
            <div className="flex flex-wrap justify-start gap-2">
              <motion.button
                type="button"
                onClick={() => dispatch({ type: "budget_help_shown" })}
                initial={{ y: 6, opacity: 0, scale: 0.96 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
                whileTap={{ scale: 0.97 }}
                className="rounded-full border border-white/10 bg-[#171717] px-[13px] py-[7px] text-[12px] text-white transition-colors duration-150 ease-out hover:bg-[#1f1f1f]"
              >
                Как рассчитывается рекомендуемый бюджет?
              </motion.button>
            </div>
          )}
      </PromptBar>
    </>
  );
```

Удалить из импортов то, что перестало использоваться (проверит `lint`/`tsc`).

- [ ] **Step 3: Проверка**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: без ошибок; 265 тестов зелёные.
Визуально: на экранах «Сигналы»/«Кампании»/«Статистика»/welcome промпт-бар имеет шапку с
«Афина ИИ» и кнопкой drawer; ввод, чипсы и бюджет-help работают.

- [ ] **Step 4: Commit**

```bash
git add src/sections/shell/shell-bottom-bar.tsx
git commit -m "$(printf 'refactor(promptbar): ShellBottomBar renders inside PromptBar wrapper\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

### Task 6: Глобальный drawer + `ChatPanel` на `PromptBar`

Разделить `ChatPanel` (сейчас collapsed-бар + sidebar в одном) на: collapsed-бар на `PromptBar`
и отдельный глобальный `ChatDrawer`. Логику сабмита вынести в общий хук.

**Files:**
- Create: `src/sections/shell/use-chat-submit.ts`
- Create: `src/sections/shell/chat-drawer.tsx`
- Modify: `src/sections/shell/chat-panel.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Прочитать `chat-panel.tsx` целиком**

Понять: `handleSubmit` (тестовые запросы, trigger-сегмент, фолбэк), `playComplexThinking`,
управление таймерами (`timersRef`, `schedule`), `useLayoutEffect` для `--chat-sidebar-width`,
`TransientReply`, `EmptyHistory`, два режима (`sidebar`/`collapsed`).

- [ ] **Step 2: Вынести логику сабмита в `use-chat-submit.ts`**

Создать хук, инкапсулирующий таймеры, `playComplexThinking` и `handleSubmit`. Возвращает
`{ submit }`. Перенести без изменения поведения константы `LIGHT_QUERY`/`HEAVY_QUERY` и импорты
`mockReplyFor*`, `parseTriggerCommand`, `COMPLEX_THINKING_*`.

```ts
"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@/state/chat-context";
import { useTriggerEdit } from "@/state/trigger-edit-context";
import { mockReplyFor, mockReplyForFreeText } from "@/lib/mock-ai-reply";
import { parseTriggerCommand } from "@/lib/trigger-edit-parser";
import {
  COMPLEX_THINKING_FINAL_REPLY,
  COMPLEX_THINKING_STEPS,
} from "@/lib/complex-thinking-demo";
import type { ChatComposerSubmitPayload } from "./chat-composer";

const LIGHT_QUERY = "лёгкий запрос";
const HEAVY_QUERY = "сложный запрос";

/** Общий обработчик сабмита чата — используется и collapsed-баром, и drawer. */
export function useChatSubmit(): { submit: (payload: ChatComposerSubmitPayload) => void } {
  const chat = useChat();
  const triggerEdit = useTriggerEdit();
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const timers = timersRef;
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };
  }, []);

  function schedule(fn: () => void, ms: number) {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms) as unknown as number;
    timersRef.current.push(id);
  }

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
      schedule(() => {
        chat.updatePending(id, step.reasoning);
        nextStep();
      }, step.delayMs);
    }
    nextStep();
  }

  function submit(payload: ChatComposerSubmitPayload) {
    const { text, segments } = payload;
    const normalized = text.trim().toLowerCase();

    if (normalized === LIGHT_QUERY) {
      chat.append({ role: "user", text });
      const id = chat.append({ role: "assistant", text: "", pending: true });
      triggerEdit.randomRemix();
      schedule(() => {
        chat.updatePending(
          id,
          "Перебрал интересы и триггеры — посмотрите выделенные карточки."
        );
      }, 400);
      return;
    }
    if (normalized === HEAVY_QUERY) {
      chat.append({ role: "user", text });
      playComplexThinking();
      return;
    }

    const triggerSegment = segments.find((s) => s.chip.kind === "trigger");
    if (triggerSegment && text.length > 0) {
      const parsed = parseTriggerCommand(triggerSegment.text);
      if (parsed.kind !== "fallback") {
        const triggerId = triggerSegment.chip.payload as string;
        chat.append({
          role: "user",
          text: triggerSegment.text,
          triggerLabel: triggerSegment.chip.label,
        });
        const id = chat.append({ role: "assistant", text: "", pending: true });
        triggerEdit.highlightTrigger(triggerId);
        schedule(() => {
          triggerEdit.applyToTrigger(triggerId, parsed);
          chat.updatePending(id, mockReplyFor(parsed));
        }, 350);
        return;
      }
    }

    chat.append({ role: "user", text });
    const id = chat.append({ role: "assistant", text: "", pending: true });
    schedule(() => chat.updatePending(id, mockReplyForFreeText()), 350);
  }

  return { submit };
}
```

- [ ] **Step 3: Создать `chat-drawer.tsx` (глобальный sidebar)**

Перенести в `ChatDrawer` ветку `chat.mode === "sidebar"` из `ChatPanel` + `EmptyHistory` +
`--chat-sidebar-width` эффект. Рендерится глобально; возвращает `null`, когда режим не `sidebar`.

```tsx
"use client";

import Image from "next/image";
import { useLayoutEffect } from "react";
import { motion } from "motion/react";
import { useChat } from "@/state/chat-context";
import { ChatPanelHeader } from "./chat-panel-header";
import { ChatHistoryList } from "./chat-history-list";
import { ChatComposer } from "./chat-composer";
import { useChatSubmit } from "./use-chat-submit";

const SIDEBAR_WIDTH_PX = 420;

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

/** Глобальный правый AI-drawer. Открывается кнопкой PanelRightOpen в PromptBar. */
export function ChatDrawer({ placeholder }: { placeholder: string }) {
  const chat = useChat();
  const { submit } = useChatSubmit();
  const isSidebar = chat.mode === "sidebar";

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--chat-sidebar-width",
      isSidebar ? `${SIDEBAR_WIDTH_PX}px` : "0px"
    );
    return () => {
      root.style.removeProperty("--chat-sidebar-width");
    };
  }, [isSidebar]);

  if (!isSidebar) return null;

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
      {chat.messages.length === 0 ? (
        <EmptyHistory />
      ) : (
        <ChatHistoryList messages={chat.messages} />
      )}
      <ChatComposer placeholder={placeholder} onSubmit={submit} />
    </motion.aside>
  );
}
```

- [ ] **Step 4: Переписать `chat-panel.tsx` — только collapsed-бар на `PromptBar`**

`ChatPanel` теперь рендерит только collapsed-бар экрана создания сигнала, обёрнутый в `PromptBar`;
`TransientReply` идёт в проп `slot`. Sidebar-ветка и `EmptyHistory` удалены (ушли в `ChatDrawer`).
`TransientReply` оставить в этом файле. Новый `ChatPanel`:

```tsx
export function ChatPanel({ placeholder }: { placeholder: string }) {
  const chat = useChat();
  const { submit } = useChatSubmit();

  return (
    <PromptBar
      onOpenDrawer={chat.openSidebar}
      slot={<TransientReply messages={chat.messages} />}
    >
      <ChatComposer placeholder={placeholder} onSubmit={submit} />
    </PromptBar>
  );
}
```

Импорты привести в соответствие: добавить `PromptBar`, `useChatSubmit`; удалить неиспользуемые
(`AnimatePresence` оставить — нужен `TransientReply`; убрать `ChatPanelHeader`, `ChatHistoryList`,
`SIDEBAR_WIDTH_PX`, `mockReply*`, `parseTriggerCommand`, `COMPLEX_THINKING_*`, `useTriggerEdit`).

- [ ] **Step 5: Глобальный drawer в `page.tsx`**

`Home` рендерит дерево, внутри которого находится `<ChatProvider>` — значит тело самого `Home`
вне `ChatProvider`, и `useChat()` в `Home` вызвать нельзя. Поэтому ввести компонент-обёртку
`BottomBarSlot`, который вызывает `useChat()` + `useAppState()` и рендерит нижний бар только
когда drawer закрыт. Он и `ChatDrawer` размещаются внутри дерева провайдеров.

В `page.tsx`: импортировать `ChatDrawer` из `@/sections/shell/chat-drawer` и `useChat` из
`@/state/chat-context`. Добавить компонент в этот же файл:

```tsx
function BottomBarSlot() {
  const { view } = useAppState();
  const { mode } = useChat();
  // При открытом drawer нижний бар скрыт — у drawer свой композер.
  if (mode === "sidebar") return null;
  return view.kind === "guided-signal" ? (
    <ChatPanel placeholder="Введите ваши параметры или задайте вопрос" />
  ) : (
    <ShellBottomBar />
  );
}
```

Блок рендера бара (текущие строки 68-73, тернарник `guided-signal ? ChatPanel : ShellBottomBar`)
заменить на:

```tsx
            {renderMain()}
            <BottomBarSlot />
            <ChatDrawer placeholder="Введите ваши параметры или задайте вопрос" />
            <DevPanel />
```

- [ ] **Step 6: Проверка**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: без ошибок; 265 тестов зелёные.
Визуально: кнопка drawer (`PanelRightOpen`) на ЛЮБОМ экране открывает правый AI-drawer; при
открытом drawer нижний бар скрыт; закрытие (`X`) возвращает бар; на экране создания сигнала
collapsed-бар и transient-ответ работают; тестовые запросы «лёгкий запрос»/«сложный запрос»
отрабатывают.

- [ ] **Step 7: Commit**

```bash
git add src/sections/shell/use-chat-submit.ts src/sections/shell/chat-drawer.tsx src/sections/shell/chat-panel.tsx src/app/page.tsx
git commit -m "$(printf 'feat(promptbar): global AI drawer + ChatPanel on PromptBar wrapper\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Фаза 4 — Порядок мастера (задача 2)

### Task 7: «Тип сигнала» — первый пункт степпера

**Files:**
- Create: `src/sections/signals/campaign-stepper.test.ts`
- Modify: `src/sections/signals/campaign-stepper.tsx:6-14`
- Modify: `src/sections/signals/campaign-workspace.tsx:220`

- [ ] **Step 1: Написать падающий тест**

Создать `campaign-stepper.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { STEPPER_ITEMS } from "./campaign-stepper";

describe("STEPPER_ITEMS", () => {
  it("starts with 'Тип сигнала' as step 1", () => {
    expect(STEPPER_ITEMS[0]).toEqual({ label: "Тип сигнала", step: 1 });
  });

  it("keeps interests as step 2 and result as step 8", () => {
    expect(STEPPER_ITEMS.find((i) => i.step === 2)?.label).toBe("Интересы");
    expect(STEPPER_ITEMS.find((i) => i.step === 8)?.label).toBe("Результат");
  });

  it("covers steps 1..8 contiguously", () => {
    expect(STEPPER_ITEMS.map((i) => i.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
```

`STEPPER_ITEMS` сейчас не экспортируется — добавить `export` к константе в Step 3.

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npx vitest run src/sections/signals/campaign-stepper.test.ts`
Expected: FAIL — `STEPPER_ITEMS` либо не экспортирован, либо первый элемент `Интересы`.

- [ ] **Step 3: Добавить пункт «Тип сигнала» + экспорт**

В `campaign-stepper.tsx` строки 6-14 — добавить `export` и первый элемент:

```tsx
export const STEPPER_ITEMS = [
  { label: "Тип сигнала", step: 1 },
  { label: "Интересы", step: 2 },
  { label: "Сегменты", step: 3 },
  { label: "База", step: 4 },
  { label: "Бюджет", step: 5 },
  { label: "Сводка", step: 6 },
  { label: "Обработка", step: 7 },
  { label: "Результат", step: 8 },
];
```

Нумерация в JSX идёт по `idx + 1` — пункты перенумеруются автоматически.

- [ ] **Step 4: Показывать степпер с шага 1**

В `campaign-workspace.tsx` строка 220 — условие `currentStep >= 2` заменить на `currentStep >= 1`:

```tsx
      {currentStep >= 1 && (
```

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `npx vitest run src/sections/signals/campaign-stepper.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 6: Проверка без регрессий + раскладка**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: без ошибок; все тесты зелёные.
Визуально: на шаге выбора типа сигнала степпер виден, «Тип сигнала» — активный пункт 1, не
перекрывает сетку сценариев (`grid-cols-3`). При перекрытии — увеличить правый отступ контента
шага 1 в `step-1-scenario.tsx` / `step-content.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/sections/signals/campaign-stepper.tsx src/sections/signals/campaign-stepper.test.ts src/sections/signals/campaign-workspace.tsx
git commit -m "$(printf 'feat(wizard): show "Тип сигнала" as stepper step 1\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

### Task 8: Гейт сайта — пред-шаг к «Тип сигнала», один раз за сессию

Сайт спрашивается один раз за сессию перед визардом (шаг «Тип сигнала»). Текущий гейт
`GuidedSignalSection` уже даёт это поведение. Здесь — извлечь решение в чистую тестируемую
функцию и закрепить тестом; resume пропускает экран сайта.

**Files:**
- Create: `src/state/survey-gate.ts`
- Create: `src/sections/signals/survey-gate.test.ts`
- Modify: `src/sections/signals/guided-signal-section.tsx`

- [ ] **Step 1: Написать падающий тест**

Создать `src/sections/signals/survey-gate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shouldShowSurveyGate } from "@/state/survey-gate";

describe("shouldShowSurveyGate", () => {
  it("shows the site screen on a fresh flow when survey not completed", () => {
    expect(
      shouldShowSurveyGate({ surveyStatus: "not_started", isResuming: false })
    ).toBe(true);
  });

  it("skips the site screen once the survey is completed (once per session)", () => {
    expect(
      shouldShowSurveyGate({ surveyStatus: "completed", isResuming: false })
    ).toBe(false);
  });

  it("skips the site screen when resuming an existing signal", () => {
    expect(
      shouldShowSurveyGate({ surveyStatus: "not_started", isResuming: true })
    ).toBe(false);
  });

  it("treats a skipped survey as still needing the site screen", () => {
    expect(
      shouldShowSurveyGate({ surveyStatus: "skipped", isResuming: false })
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npx vitest run src/sections/signals/survey-gate.test.ts`
Expected: FAIL — модуль `@/state/survey-gate` не существует.

- [ ] **Step 3: Создать `survey-gate.ts`**

```ts
import type { SurveyStatus } from "@/types/survey";

/**
 * Решение о показе экрана сайта перед шагом «Тип сигнала».
 * Сайт спрашивается один раз за сессию: после `survey_completed` гейт
 * закрыт. Resume существующего сигнала пропускает экран сайта — визард
 * открывается сразу на сохранённом шаге.
 */
export function shouldShowSurveyGate(input: {
  surveyStatus: SurveyStatus;
  isResuming: boolean;
}): boolean {
  if (input.isResuming) return false;
  return input.surveyStatus !== "completed";
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npx vitest run src/sections/signals/survey-gate.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 5: Использовать функцию в `GuidedSignalSection`**

В `guided-signal-section.tsx` импортировать `shouldShowSurveyGate`. Текущий гейт
(строки ~219, `if (!gatePassed && surveyStatus !== "completed")`) переписать через функцию,
сохранив локальный `gatePassed` (он держит «анкета пройдена в этом маунте»):

```tsx
  const showSurvey =
    !gatePassed && shouldShowSurveyGate({ surveyStatus, isResuming: Boolean(activeResume) });
  if (showSurvey) {
    return (
      <SurveySection
        skippable={false}
        onComplete={() => setGatePassed(true)}
      />
    );
  }
```

- [ ] **Step 6: Проверка**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: без ошибок; все тесты зелёные.
Визуально: первое создание сигнала за сессию → экран сайта → «Обогащение данными» → шаг
«Тип сигнала»; повторное создание сигнала в той же сессии → сразу «Тип сигнала»; «Открыть и
редактировать» существующего сигнала → без экрана сайта.

- [ ] **Step 7: Commit**

```bash
git add src/state/survey-gate.ts src/sections/signals/survey-gate.test.ts src/sections/signals/guided-signal-section.tsx
git commit -m "$(printf 'feat(wizard): pin site screen as once-per-session pre-step to signal type\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Фаза 5 — Каталог редактируемости полей нод (задача 7)

### Task 9: Карта `NODE_FIELD_EDITABILITY`

Типизированный каталог: для каждого типа ноды и каждого его поля — способ редактирования.
Источник классификации — Приложение A спеки. Карта ключуется по `kind` ноды и по `label`
строки из `PARAM_RENDERERS` (`node-card-content.tsx`) — это даёт прямой lookup в `NodeCardBody`.

> **Чекпойнт.** Спорные поля (⚠ в спеке) зафиксированы так: `split.branches` → `ai`,
> `wait.durationHours` → `ai`, `sms.scheduledAt` → `ai`, `storefront.offers` → `ai`. Все
> `manual`-поля при этом строковые — это держит инлайн-редактор (Task 11) однотипным.
> Перед Task 10 подтвердить эти 4 значения с пользователем; при изменении — поправить карту.

**Files:**
- Create: `src/state/node-field-editability.ts`
- Create: `src/state/node-field-editability.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `src/state/node-field-editability.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  NODE_FIELD_EDITABILITY,
  getFieldMeta,
} from "./node-field-editability";

describe("NODE_FIELD_EDITABILITY", () => {
  it("covers every node kind that has params", () => {
    const kinds = Object.keys(NODE_FIELD_EDITABILITY).sort();
    expect(kinds).toEqual(
      [
        "condition", "email", "end", "ivr", "landing", "merge",
        "push", "signal", "split", "sms", "storefront", "success", "wait",
      ].sort()
    );
  });

  it("uses only the three editability categories", () => {
    for (const fields of Object.values(NODE_FIELD_EDITABILITY)) {
      for (const meta of Object.values(fields)) {
        expect(["manual", "ai", "readonly"]).toContain(meta.editability);
      }
    }
  });

  it("every manual field carries a paramKey for inline editing", () => {
    for (const fields of Object.values(NODE_FIELD_EDITABILITY)) {
      for (const meta of Object.values(fields)) {
        if (meta.editability === "manual") {
          expect(typeof meta.paramKey).toBe("string");
        }
      }
    }
  });

  it("classifies sms text as manual and sms link as ai", () => {
    expect(getFieldMeta("sms", "Текст")?.editability).toBe("manual");
    expect(getFieldMeta("sms", "Ссылка")?.editability).toBe("ai");
  });

  it("classifies signal fields as readonly", () => {
    expect(getFieldMeta("signal", "Файл")?.editability).toBe("readonly");
  });

  it("returns undefined for an unknown field", () => {
    expect(getFieldMeta("sms", "Неизвестно")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npx vitest run src/state/node-field-editability.test.ts`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Создать `node-field-editability.ts`**

```ts
import type { NodeParams } from "@/types/workflow";

export type FieldEditability = "manual" | "ai" | "readonly";

export interface NodeFieldMeta {
  /** Способ редактирования поля. */
  editability: FieldEditability;
  /** Имя поля в NodeParams — нужно инлайн-редактору для manual-полей. */
  paramKey?: string;
}

/**
 * Каталог редактируемости полей нод (задача 7 спеки).
 * Ключи: kind ноды → label строки из PARAM_RENDERERS (node-card-content.tsx).
 *
 * manual   — карандаш, поле становится текстовым инпутом (все manual-поля строковые).
 * ai       — иконка-ассистент, тег поля улетает в промпт-бар.
 * readonly — вычисляемое/системное значение, только показ.
 */
export const NODE_FIELD_EDITABILITY: Record<
  NodeParams["kind"],
  Record<string, NodeFieldMeta>
> = {
  sms: {
    "Текст": { editability: "manual", paramKey: "text" },
    "Alpha-name": { editability: "ai", paramKey: "alphaName" },
    "Время": { editability: "ai", paramKey: "scheduledAt" },
    "Ссылка": { editability: "ai", paramKey: "link" },
  },
  email: {
    "Тема": { editability: "manual", paramKey: "subject" },
    "Текст": { editability: "manual", paramKey: "body" },
    "Отправитель": { editability: "ai", paramKey: "sender" },
    "Ссылка": { editability: "ai", paramKey: "link" },
  },
  push: {
    "Заголовок": { editability: "manual", paramKey: "title" },
    "Текст": { editability: "manual", paramKey: "body" },
    "Deeplink": { editability: "ai", paramKey: "deeplink" },
  },
  ivr: {
    "Сценарий": { editability: "manual", paramKey: "scenario" },
    "Голос": { editability: "ai", paramKey: "voiceType" },
  },
  wait: {
    "Режим": { editability: "ai", paramKey: "mode" },
    "Длительность": { editability: "ai", paramKey: "durationHours" },
    "Событие": { editability: "ai", paramKey: "untilEvent" },
  },
  condition: {
    "Триггер": { editability: "ai", paramKey: "trigger" },
  },
  split: {
    "По": { editability: "ai", paramKey: "by" },
    "Ветки": { editability: "ai", paramKey: "branches" },
  },
  merge: {},
  signal: {
    "Файл": { editability: "readonly", paramKey: "fileName" },
    "Сигналов": { editability: "readonly", paramKey: "count" },
    "Сегменты": { editability: "readonly", paramKey: "segments" },
  },
  success: {
    "Цель": { editability: "manual", paramKey: "goal" },
  },
  end: {
    "Причина": { editability: "manual", paramKey: "reason" },
  },
  storefront: {
    "Офферы": { editability: "ai", paramKey: "offers" },
  },
  landing: {
    "CTA": { editability: "manual", paramKey: "cta" },
    "Оффер": { editability: "manual", paramKey: "offerTitle" },
  },
};

/** Метаданные поля по kind ноды и label строки, либо undefined. */
export function getFieldMeta(
  kind: NodeParams["kind"],
  label: string
): NodeFieldMeta | undefined {
  return NODE_FIELD_EDITABILITY[kind]?.[label];
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npx vitest run src/state/node-field-editability.test.ts`
Expected: PASS (6 тестов).

- [ ] **Step 5: Проверка**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: без ошибок; все тесты зелёные.

- [ ] **Step 6: Commit**

```bash
git add src/state/node-field-editability.ts src/state/node-field-editability.test.ts
git commit -m "$(printf 'feat(nodes): add NODE_FIELD_EDITABILITY catalog\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Фаза 6 — Поля нод: иконки и инлайн-правка (задача 6)

### Task 10: По-польные иконки в `NodeCardBody` + AI-поля → промпт-бар

Каждая строка параметра получает иконку по каталогу: `manual` → карандаш, `ai` → иконка-
ассистент, `readonly` → без иконки. В этом таске — рендер иконок и поведение `ai`-полей
(вставка шаблона + чип в промпт-бар). Инлайн-правка `manual`-полей — Task 11.

**Files:**
- Modify: `src/sections/campaigns/node-card-content.tsx`

- [ ] **Step 1: Прочитать `node-card-content.tsx` целиком**

Текущее: `NodeCardBody` рендерит строки; `isClickable` строки вставляют шаблон `NODE_ACTIONS`
по клику на всю строку; внизу подпись «Изменить через промпт ниже». Целевое: убрать клик по
всей строке и подпись; добавить по-польную иконку.

- [ ] **Step 2: Переписать рендер строк**

Импорты: добавить `Pencil` из `lucide-react`, `Image` из `next/image`, `getFieldMeta` из
`@/state/node-field-editability`, `usePromptChips` из `@/state/prompt-chips-context`.
В `NodeCardBody`: `const { pushChip } = usePromptChips();`.

Каждую строку рендерить как `grid` «лейбл · значение · иконка». Иконку выбирать по
`getFieldMeta(data.params.kind, row.label)?.editability`:
- `manual` → кнопка с `<Pencil className="h-3 w-3" />`, `aria-label="Редактировать поле"`
  (обработчик входа в режим правки — Task 11; пока `onClick` пустой/заглушка с TODO Task 11).
- `ai` → кнопка с `<Image src="/mascot-icon.svg" width={12} height={12} alt="" aria-hidden />`,
  `aria-label="Передать поле ассистенту"`; по клику — вставить шаблон в промпт-бар и положить
  чип:

```tsx
function handleAiField(rowLabel: string) {
  const template = templateByLabel.get(rowLabel);
  if (template) insertPrompt(template);
  pushChip({
    id: `nodefield_${id}_${rowLabel}`,
    kind: "node",
    label: `${data.label} · ${rowLabel}`,
    payload: id,
    removable: true,
  });
}
```

- `readonly` → без иконки.

Удалить блок `<p>Изменить через промпт ниже.</p>` (строки 190-192) и старую логику
«вся строка кликабельна». `templateByLabel` и `insertPrompt` сохранить — используются `ai`-полями.

- [ ] **Step 3: Проверка**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: без ошибок; 265 тестов зелёные.
Визуально: в развёрнутой ноде у строк-полей видна корректная иконка (карандаш у manual,
маскот у ai, ничего у readonly); клик по иконке ai вставляет шаблон в промпт-бар и добавляет чип.

- [ ] **Step 4: Commit**

```bash
git add src/sections/campaigns/node-card-content.tsx
git commit -m "$(printf 'feat(nodes): per-field edit icons; AI fields push to prompt bar\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

### Task 11: Инлайн-правка `manual`-полей ноды

`manual`-поле: клик по карандашу → значение становится `<input>` → Enter или галочка
коммитят правку. Коммит идёт через app-state-экшен (паттерн зеркалит `workflowNodeCommand`):
`NodeCardBody` → `app-state` → `WorkflowSection` → `WorkflowView` (применяет `patchNodeParams`).

**Files:**
- Modify: `src/state/app-state.ts`
- Modify: `src/sections/campaigns/workflow-section.tsx`
- Modify: `src/sections/campaigns/workflow-view.tsx`
- Modify: `src/sections/campaigns/node-card-content.tsx`
- Create: `src/state/app-state.test.ts` дополнить (файл уже есть)

- [ ] **Step 1: Написать падающий тест на reducer**

В существующий `src/state/app-state.test.ts` добавить блок:

```ts
import { appReducer, initialState } from "./app-state";

describe("workflow_node_field_set", () => {
  it("stores the pending node field patch", () => {
    const s = appReducer(initialState, {
      type: "workflow_node_field_set",
      nodeId: "sms",
      patch: { text: "Новый текст" },
    });
    expect(s.workflowNodeFieldPatch).toEqual({
      nodeId: "sms",
      patch: { text: "Новый текст" },
    });
  });

  it("clears the patch on handled", () => {
    const withPatch = appReducer(initialState, {
      type: "workflow_node_field_set",
      nodeId: "sms",
      patch: { text: "x" },
    });
    const cleared = appReducer(withPatch, {
      type: "workflow_node_field_set_handled",
    });
    expect(cleared.workflowNodeFieldPatch).toBeNull();
  });
});
```

(Если в файле нет `describe`/`it` импортов из vitest — добавить по образцу существующих тестов.)

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npx vitest run src/state/app-state.test.ts`
Expected: FAIL — нет экшена/поля `workflowNodeFieldPatch`.

- [ ] **Step 3: Расширить app-state**

В `app-state.ts`:
- Импорт: `import type { NodeParams } from "@/types/workflow";`
- В тип `AppState` добавить поле:
  ```ts
  workflowNodeFieldPatch: { nodeId: string; patch: Partial<NodeParams> } | null;
  ```
- В union `Action` добавить (рядом с `workflow_node_command_*`):
  ```ts
  | { type: "workflow_node_field_set"; nodeId: string; patch: Partial<NodeParams> }
  | { type: "workflow_node_field_set_handled" }
  ```
- В `initialState` добавить `workflowNodeFieldPatch: null,`
- В `appReducer` добавить два case (рядом с `workflow_node_command_handled`):
  ```ts
  case "workflow_node_field_set":
    return {
      ...state,
      workflowNodeFieldPatch: { nodeId: action.nodeId, patch: action.patch },
    };

  case "workflow_node_field_set_handled":
    return { ...state, workflowNodeFieldPatch: null };
  ```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npx vitest run src/state/app-state.test.ts`
Expected: PASS (новый блок + все прежние тесты файла).

- [ ] **Step 5: Прокинуть патч через `WorkflowSection`**

В `workflow-section.tsx`:
- В `useAppState()` добавить `workflowNodeFieldPatch`.
- Добавить хендлер:
  ```ts
  const handleNodeFieldPatchHandled = useCallback(
    () => dispatch({ type: "workflow_node_field_set_handled" }),
    [dispatch]
  );
  ```
- В `<WorkflowView … />` передать пропсы:
  ```tsx
          nodeFieldPatch={workflowNodeFieldPatch}
          onNodeFieldPatchHandled={handleNodeFieldPatchHandled}
  ```

- [ ] **Step 6: Применить патч в `WorkflowView`**

В `workflow-view.tsx`:
- В `WorkflowViewProps` добавить:
  ```ts
  nodeFieldPatch?: { nodeId: string; patch: Partial<NodeParams> } | null;
  onNodeFieldPatchHandled?: () => void;
  ```
- В деструктуризацию пропсов компонента добавить `nodeFieldPatch`, `onNodeFieldPatchHandled`.
- Добавить эффект (ручная правка применяется мгновенно, без «думающего» цикла):
  ```tsx
  useEffect(() => {
    if (!nodeFieldPatch) return;
    setGraph((prev) => ({
      ...prev,
      nodes: patchNodeParams(prev.nodes, nodeFieldPatch.nodeId, nodeFieldPatch.patch),
    }));
    onNodeFieldPatchHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeFieldPatch]);
  ```

- [ ] **Step 7: Инлайн-редактор в `NodeCardBody`**

В `node-card-content.tsx`:
- Импорт: `Check` из `lucide-react`, `useState` из `react`, `useAppDispatch` из
  `@/state/app-state-context`.
- В `NodeCardBody`: `const dispatch = useAppDispatch();` и
  `const [editing, setEditing] = useState<{ label: string; value: string } | null>(null);`
- Иконка-карандаш `manual`-поля (заглушка из Task 10) → `onClick`:
  `setEditing({ label: row.label, value: row.value })`.
- Когда `editing?.label === row.label` — вместо текста значения рендерить `<input>` +
  кнопку с `<Check className="h-3 w-3" />`:
  ```tsx
  <input
    autoFocus
    value={editing.value}
    onChange={(e) => setEditing({ label: row.label, value: e.target.value })}
    onKeyDown={(e) => {
      if (e.key === "Enter") commitEdit();
      if (e.key === "Escape") setEditing(null);
    }}
    className="nodrag min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground"
  />
  ```
- `commitEdit`:
  ```tsx
  function commitEdit() {
    if (!editing || !data.params) return;
    const meta = getFieldMeta(data.params.kind, editing.label);
    if (!meta?.paramKey) {
      setEditing(null);
      return;
    }
    dispatch({
      type: "workflow_node_field_set",
      nodeId: id,
      patch: { [meta.paramKey]: editing.value } as Partial<NodeParams>,
    });
    setEditing(null);
  }
  ```
- Импортировать тип `NodeParams` (он уже импортирован в файле).

- [ ] **Step 8: Проверка**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: без ошибок; все тесты зелёные (включая новый блок `app-state.test.ts` и
`node-field-editability.test.ts`).
Визуально: в развёрнутой ноде клик по карандашу у `manual`-поля → инпут с текущим значением →
Enter/галочка коммитят → значение в ноде обновляется; Escape отменяет.

- [ ] **Step 9: Commit**

```bash
git add src/state/app-state.ts src/state/app-state.test.ts src/sections/campaigns/workflow-section.tsx src/sections/campaigns/workflow-view.tsx src/sections/campaigns/node-card-content.tsx
git commit -m "$(printf 'feat(nodes): inline edit for manual node fields\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Финальная проверка

- [ ] `npm test` — все тесты зелёные (база 265 + новые: campaign-stepper 3, survey-gate 4,
  node-field-editability 6, app-state workflow_node_field_set 2).
- [ ] `npm run lint` и `npx tsc --noEmit` — без ошибок.
- [ ] Визуальный прогон dev-сервера по всем 7 задачам.
- [ ] Сообщить пользователю путь worktree и имя ветки; мёрж/очистка — на стороне пользователя.
