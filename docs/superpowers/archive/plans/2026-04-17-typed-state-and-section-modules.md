# Typed State & Section Modules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Защитить главный флоу приложения от регрессий при дальнейших prompt-правках: добавить Playwright happy-path smoke-тест, заменить 11 `useState` в `src/app/page.tsx` на дискриминированный union + reducer, вынести секции в `src/sections/*` и подключить их к state через React context.

**Architecture:** Один типизированный reducer в `src/state/app-state.ts` моделирует все валидные состояния через discriminated union (`View = welcome | guided-signal | awaiting-campaign | campaign-select | workflow | section`). Провайдер в `src/state/app-state-context.tsx` раздаёт `state` и `dispatch` через React context. Каждая секция живёт в `src/sections/<name>/` со своим «контейнерным» компонентом, который читает context и передаёт данные презентационным вью. `page.tsx` становится тонким диспетчером по `state.view.kind`. Shell-компоненты (сайдбар, flyout) переезжают в `src/sections/shell/`. Визуальное поведение не меняется — smoke-тест это гарантирует.

**Tech Stack:** Next.js 16.2.2, React 19.2.4, TypeScript 5, Playwright (новый, `@playwright/test`), существующие Radix/shadcn/motion/xylflow — без изменений.

**Важная оговорка:** `CampaignStepper` не мёртвый — используется в `src/components/campaign-workspace.tsx:108`. Не удалять.

---

## File Structure

**Создаётся:**
- `playwright.config.ts`
- `tests/e2e/happy-path.spec.ts`
- `tests/e2e/fixtures/test-base.csv` — мини-фикстура для Step 5 upload
- `src/state/app-state.ts` — типы, `initialState`, `appReducer`, selectors
- `src/state/app-state-context.tsx` — `AppStateProvider`, `useAppState`, `useAppDispatch`
- `src/sections/welcome/welcome-section.tsx` — контейнер
- `src/sections/signals/signals-section.tsx` — контейнер для standalone-режима
- `src/sections/signals/guided-signal-section.tsx` — контейнер guided-флоу
- `src/sections/campaigns/campaigns-section.tsx` — контейнер CampaignTypeView
- `src/sections/campaigns/workflow-section.tsx` — контейнер WorkflowView
- `src/sections/statistics/statistics-section.tsx` — контейнер
- `src/sections/shell/shell-bottom-bar.tsx` — извлечение bottom chat bar + step-бейджей из `page.tsx`

**Перемещается (git mv):**
- `src/components/welcome-view.tsx` → `src/sections/welcome/welcome-view.tsx`
- `src/components/signal-type-view.tsx` → `src/sections/signals/signal-type-view.tsx`
- `src/components/campaign-workspace.tsx` → `src/sections/signals/campaign-workspace.tsx`
- `src/components/campaign-stepper.tsx` → `src/sections/signals/campaign-stepper.tsx`
- `src/components/steps/` → `src/sections/signals/steps/` (9 файлов)
- `src/components/campaign-type-view.tsx` → `src/sections/campaigns/campaign-type-view.tsx`
- `src/components/workflow-view.tsx` → `src/sections/campaigns/workflow-view.tsx`
- `src/components/workflow-graph.tsx` → `src/sections/campaigns/workflow-graph.tsx`
- `src/components/workflow-node.tsx` → `src/sections/campaigns/workflow-node.tsx`
- `src/components/workflow-status.tsx` → `src/sections/campaigns/workflow-status.tsx`
- `src/components/statistics-view.tsx` → `src/sections/statistics/statistics-view.tsx`
- `src/components/app-sidebar.tsx` → `src/sections/shell/app-sidebar.tsx`
- `src/components/launch-flyout.tsx` → `src/sections/shell/launch-flyout.tsx`

**Остаётся на месте:**
- `src/components/ui/*` — shadcn-примитивы, не section-specific
- `src/components/ai-elements/*` — общие AI-компоненты
- `src/types/campaign.ts` — общий тип StepData
- `src/hooks/*`, `src/lib/*`

**Модифицируется:**
- `src/app/page.tsx` — сжимается до ~60 строк, диспетчер по `state.view.kind`
- `src/app/layout.tsx` — оборачивает children в `<AppStateProvider>`
- `package.json` — добавляются `@playwright/test`, скрипты `test:e2e`, `test:e2e:ui`
- `.gitignore` — добавляются `test-results/`, `playwright-report/`, `playwright/.cache/`

---

## Task 1: Playwright setup + happy-path smoke test

**Цель:** характеризационный тест — фиксирует текущее поведение main-флоу как baseline. После Task 1 все последующие правки обязаны держать этот тест зелёным.

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/happy-path.spec.ts`
- Create: `tests/e2e/fixtures/test-base.csv`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Установить Playwright**

Run:
```bash
cd /Users/macintosh/Documents/work/afina-ai-first
npm install --save-dev @playwright/test
npx playwright install chromium
```

Expected: `@playwright/test` в devDependencies `package.json`, chromium установлен.

- [ ] **Step 2: Создать `playwright.config.ts`**

Content:
```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    actionTimeout: 10_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Добавить скрипты в `package.json`**

В секцию `"scripts"` добавить:
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 4: Обновить `.gitignore`**

Добавить строки в конец файла:
```
/test-results
/playwright-report
/playwright/.cache
```

- [ ] **Step 5: Создать фикстуру `tests/e2e/fixtures/test-base.csv`**

Content:
```
+79990000001
+79990000002
+79990000003
```

- [ ] **Step 6: Написать `tests/e2e/happy-path.spec.ts`**

Селекторы основаны на реальных текстах из:
- `src/components/welcome-view.tsx:11` (h1 «Добро пожаловать»)
- `src/app/page.tsx:322` (step-бейдж «Шаг 1 / Получение сигнала»)
- `src/components/steps/step-1-scenario.tsx:9` (карточка «Регистрация»)
- `src/components/steps/step-2-interests.tsx:10-11,112` (tag «Недвижимость» + кнопка «Продолжить»)
- `src/components/steps/step-3-segments.tsx:11,106` (сегмент «Максимальный» + «Продолжить»)
- `src/components/steps/step-4-limit.tsx:54,76` (input placeholder «Например, 500» + «Далее»)
- `src/components/steps/step-5-upload.tsx:120,162` (input[type=file] + «Далее», затем 4с hashing)
- `src/components/steps/step-6-summary.tsx:120` («Подтвердить и запустить»)
- `src/components/steps/step-7-processing.tsx` — автопереход ~4.2с
- `src/components/steps/step-8-result.tsx:54` («Запустить кампанию»)
- `src/components/campaign-type-view.tsx` — карточка «Возврат брошенных действий»
- `src/app/page.tsx:298` («Начать кампанию →»)
- `src/components/workflow-status.tsx` — бейдж «Кампания запущена» + кнопка «Посмотреть статистику →»
- `src/components/statistics-view.tsx:131` (h1 «Сводный за период»)

Content:
```ts
import { test, expect } from "@playwright/test";
import path from "node:path";

test("happy path: welcome → guided signal → campaign type → launch → stats", async ({ page }) => {
  await page.goto("/");

  // 1. Welcome
  await expect(page.getByRole("heading", { name: "Добро пожаловать" })).toBeVisible();

  // 2. Click Шаг 1 badge → guided signal flow
  await page.getByRole("button", { name: /Шаг 1.*Получение сигнала/s }).click();

  // 3. Step 1: pick scenario (auto-advances on click)
  await expect(page.getByRole("heading", { name: "Выберите тип сигнала" })).toBeVisible();
  await page.getByRole("button", { name: /Регистрация/ }).first().click();

  // 4. Step 2: pick one interest tag + Продолжить
  await expect(page.getByRole("heading", { name: /Какие интересы и триггеры/ })).toBeVisible();
  await page.getByRole("button", { name: "Недвижимость" }).click();
  await page.getByRole("button", { name: "Продолжить" }).click();

  // 5. Step 3: pick segment + Продолжить
  await expect(page.getByRole("heading", { name: "Выберите сегменты сигнала" })).toBeVisible();
  await page.getByRole("button", { name: /Максимальный/ }).click();
  await page.getByRole("button", { name: "Продолжить" }).click();

  // 6. Step 4: enter budget + Далее
  await expect(page.getByRole("heading", { name: "Укажите максимальный бюджет" })).toBeVisible();
  await page.getByPlaceholder("Например, 500").fill("500");
  await page.getByRole("button", { name: "Далее" }).click();

  // 7. Step 5: upload file, Далее, wait hashing (~4.2s)
  await expect(page.getByRole("heading", { name: "Загрузите вашу базу" })).toBeVisible();
  const fixturePath = path.resolve(__dirname, "fixtures/test-base.csv");
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await expect(page.getByText("test-base.csv")).toBeVisible();
  await page.getByRole("button", { name: "Далее" }).click();

  // 8. Step 6: summary → Подтвердить и запустить
  await expect(page.getByRole("heading", { name: "Проверьте настройки кампании" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Подтвердить и запустить" }).click();

  // 9. Step 7: auto-progress (~4.2s) → Step 8 appears
  await expect(page.getByRole("heading", { name: "Ваша кампания обрабатывается" })).toBeVisible();

  // 10. Step 8: click Запустить кампанию
  await expect(page.getByRole("heading", { name: /Мы собрали сигналы/ })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Запустить кампанию" }).click();

  // 11. CampaignTypeView: pick first campaign type
  await expect(page.getByRole("heading", { name: "Выберите тип кампании" })).toBeVisible();
  await page.getByRole("button", { name: /Возврат брошенных действий/ }).click();

  // 12. WorkflowView → Начать кампанию
  await page.getByRole("button", { name: /Начать кампанию/ }).click();

  // 13. WorkflowStatus: status visible
  await expect(page.getByText("Кампания запущена")).toBeVisible({ timeout: 5_000 });

  // 14. Click Посмотреть статистику
  await page.getByRole("button", { name: /Посмотреть статистику/ }).click();

  // 15. StatisticsView visible
  await expect(page.getByRole("heading", { name: "Сводный за период" })).toBeVisible();
});
```

- [ ] **Step 7: Запустить тест**

Run:
```bash
npm run test:e2e
```
Expected: тест проходит (1 passed). Dev-сервер поднимается автоматически через `webServer` в конфиге. Если какой-то селектор не матчится — не править тест «под код», а пройти флоу руками и скорректировать селектор. Цель — чтобы тест отражал **текущее реальное поведение**.

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts tests/ package.json package-lock.json .gitignore
git commit -m "test: add Playwright and happy-path smoke test"
```

---

## Task 2: Типизированный reducer + context provider

**Цель:** заменить 11 `useState` в `page.tsx` на дискриминированный union + `useReducer` и раздать state через React context. Smoke-тест обязан остаться зелёным после каждого step-а.

**Files:**
- Create: `src/state/app-state.ts`
- Create: `src/state/app-state-context.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Создать `src/state/app-state.ts`**

Content:
```ts
export type SignalFact = {
  scenarioId: string;
  createdAt: string;
  count: number;
};

export type CampaignFact = {
  typeName: string;
  launchedAt: string;
};

export type SectionName = "Статистика" | "Сигналы" | "Кампании";

export type View =
  | { kind: "welcome" }
  | { kind: "guided-signal"; initialScenario?: { id: string; name: string } }
  | { kind: "awaiting-campaign" }
  | { kind: "campaign-select" }
  | { kind: "workflow"; campaign: { id: string; name: string }; launched: boolean }
  | { kind: "section"; name: SectionName };

export type AppState = {
  view: View;
  signal: SignalFact | null;
  launchedCampaign: CampaignFact | null;
  workflowCommand: string | null;
  launchFlyoutOpen: boolean;
};

export type Action =
  | { type: "start_signal_flow"; initialScenario?: { id: string; name: string } }
  | { type: "signal_step8_reached"; scenarioId: string }
  | { type: "signal_complete" }
  | { type: "step2_clicked" }
  | { type: "campaign_selected"; campaign: { id: string; name: string } }
  | { type: "campaign_launched"; typeName: string; launchedAt: string }
  | { type: "workflow_command_submit"; text: string }
  | { type: "workflow_command_handled" }
  | { type: "goto_stats" }
  | { type: "sidebar_nav"; section: SectionName }
  | { type: "flyout_open" }
  | { type: "flyout_close" }
  | { type: "flyout_signal_select"; id: string; name: string }
  | { type: "flyout_campaign_select" };

export const initialState: AppState = {
  view: { kind: "welcome" },
  signal: null,
  launchedCampaign: null,
  workflowCommand: null,
  launchFlyoutOpen: false,
};

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "start_signal_flow":
      return {
        ...state,
        view: { kind: "guided-signal", initialScenario: action.initialScenario },
        launchFlyoutOpen: false,
      };

    case "signal_step8_reached": {
      const createdAt = new Date().toLocaleDateString("ru-RU");
      return {
        ...state,
        signal: { scenarioId: action.scenarioId, createdAt, count: 4312 },
        view: { kind: "awaiting-campaign" },
      };
    }

    case "signal_complete":
    case "step2_clicked":
      return { ...state, view: { kind: "campaign-select" } };

    case "campaign_selected":
      return {
        ...state,
        view: { kind: "workflow", campaign: action.campaign, launched: false },
      };

    case "campaign_launched": {
      const fact = { typeName: action.typeName, launchedAt: action.launchedAt };
      return {
        ...state,
        launchedCampaign: fact,
        view:
          state.view.kind === "workflow"
            ? { ...state.view, launched: true }
            : state.view,
      };
    }

    case "workflow_command_submit":
      return { ...state, workflowCommand: action.text };

    case "workflow_command_handled":
      return { ...state, workflowCommand: null };

    case "goto_stats":
      return {
        ...state,
        view: { kind: "section", name: "Статистика" },
        workflowCommand: null,
      };

    case "sidebar_nav":
      return {
        ...state,
        view: { kind: "section", name: action.section },
        workflowCommand: null,
      };

    case "flyout_open":
      return { ...state, launchFlyoutOpen: true };

    case "flyout_close":
      return { ...state, launchFlyoutOpen: false };

    case "flyout_signal_select":
      return {
        ...state,
        view: {
          kind: "guided-signal",
          initialScenario: { id: action.id, name: action.name },
        },
        launchFlyoutOpen: false,
      };

    case "flyout_campaign_select":
      return {
        ...state,
        launchFlyoutOpen: false,
        view: state.signal
          ? { kind: "campaign-select" }
          : { kind: "section", name: "Сигналы" },
      };
  }
}

export const isSignalDone = (s: AppState) => s.signal !== null;
export const isCampaignDone = (s: AppState) => s.launchedCampaign !== null;
export const isStep1Active = (s: AppState) => !isSignalDone(s);
export const isStep2Active = (s: AppState) =>
  isSignalDone(s) && !isCampaignDone(s);
export const isStep3Active = (s: AppState) => isCampaignDone(s);
export const isWorkflowView = (s: AppState) =>
  s.view.kind === "workflow";
export const isOnWelcome = (s: AppState) => s.view.kind === "welcome";
```

- [ ] **Step 2: Создать `src/state/app-state-context.tsx`**

Content:
```tsx
"use client";

import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from "react";
import { appReducer, initialState, type AppState, type Action } from "./app-state";

const StateContext = createContext<AppState | null>(null);
const DispatchContext = createContext<Dispatch<Action> | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error("useAppState must be used inside AppStateProvider");
  return ctx;
}

export function useAppDispatch(): Dispatch<Action> {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error("useAppDispatch must be used inside AppStateProvider");
  return ctx;
}
```

- [ ] **Step 3: Обернуть приложение провайдером**

Файл: `src/app/layout.tsx`. Найти элемент, внутри которого рендерится `{children}` (обычно `<body>…</body>`). Внутри body обернуть children:

Diff pattern (заменить `{children}` на):
```tsx
<AppStateProvider>{children}</AppStateProvider>
```

И добавить импорт сверху:
```tsx
import { AppStateProvider } from "@/state/app-state-context";
```

- [ ] **Step 4: Переписать `src/app/page.tsx` на reducer**

Полная замена файла. Поведение не меняется — только источник истины для state.

Content:
```tsx
// src/app/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Mic, ChevronRight } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { CampaignWorkspace } from "@/components/campaign-workspace";
import { StatisticsView } from "@/components/statistics-view";
import { LaunchFlyout } from "@/components/launch-flyout";
import { WelcomeView } from "@/components/welcome-view";
import { CampaignTypeView } from "@/components/campaign-type-view";
import { SignalTypeView } from "@/components/signal-type-view";
import { WorkflowView } from "@/components/workflow-view";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import {
  isStep1Active,
  isStep2Active,
  isStep3Active,
  isCampaignDone,
  isOnWelcome,
  isWorkflowView,
  type View,
} from "@/state/app-state";

function AttachmentFileList() {
  const { files } = usePromptInputAttachments();
  if (files.length === 0) return null;
  return (
    <PromptInputHeader>
      {files.map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-xs text-foreground"
        >
          <span className="max-w-[200px] truncate">{f.filename}</span>
        </div>
      ))}
    </PromptInputHeader>
  );
}

function AttachmentEffect({ view, signalScenarioId }: { view: View; signalScenarioId: string }) {
  const { attachments } = usePromptInputController();
  const inCampaignSelect = view.kind === "campaign-select";

  useEffect(() => {
    if (inCampaignSelect && signalScenarioId) {
      const content = JSON.stringify({ scenario: signalScenarioId });
      const file = new File([content], `сигнал_${signalScenarioId}.json`, {
        type: "application/json",
      });
      attachments.add([file]);
    } else {
      attachments.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inCampaignSelect, signalScenarioId]);

  return null;
}

export default function Home() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const { view, signal, launchFlyoutOpen } = state;
  const signalScenarioId = signal?.scenarioId ?? "";

  const handleCommandHandled = useCallback(() => {
    dispatch({ type: "workflow_command_handled" });
  }, [dispatch]);

  function handlePromptSubmit(message: PromptInputMessage) {
    if (view.kind === "workflow" && !view.launched) {
      dispatch({ type: "workflow_command_submit", text: message.text ?? "" });
    }
  }

  // Step 2 badge pulse — trigger when transitioning into awaiting-campaign
  const [stepTwoNew, setStepTwoNew] = useState(false);
  const prevViewKind = useRef<View["kind"] | null>(null);
  useEffect(() => {
    if (view.kind === "awaiting-campaign" && prevViewKind.current !== "awaiting-campaign") {
      setStepTwoNew(true);
      const t = setTimeout(() => setStepTwoNew(false), 1400);
      prevViewKind.current = view.kind;
      return () => clearTimeout(t);
    }
    prevViewKind.current = view.kind;
  }, [view.kind]);

  function renderMain() {
    if (view.kind === "guided-signal" || view.kind === "awaiting-campaign") {
      const initial = view.kind === "guided-signal" ? view.initialScenario : undefined;
      return (
        <CampaignWorkspace
          onSignalComplete={() => dispatch({ type: "signal_complete" })}
          onStep8Reached={(scenarioId) =>
            dispatch({ type: "signal_step8_reached", scenarioId })
          }
          initialScenario={initial}
        />
      );
    }
    if (view.kind === "campaign-select") {
      return (
        <CampaignTypeView
          onSelect={(id, name) =>
            dispatch({ type: "campaign_selected", campaign: { id, name } })
          }
        />
      );
    }
    if (view.kind === "workflow") {
      const signalFileName = signalScenarioId ? `сигнал_${signalScenarioId}.json` : undefined;
      return (
        <WorkflowView
          launched={view.launched}
          pendingCommand={state.workflowCommand}
          onCommandHandled={handleCommandHandled}
          onGoToStats={() => dispatch({ type: "goto_stats" })}
          signalName={signalFileName}
        />
      );
    }
    if (view.kind === "section") {
      if (view.name === "Статистика") return <StatisticsView />;
      if (view.name === "Сигналы") {
        return (
          <SignalTypeView
            onCreateSignal={() => dispatch({ type: "start_signal_flow" })}
            signal={
              signal
                ? { scenarioId: signal.scenarioId, count: signal.count, createdAt: signal.createdAt }
                : null
            }
            onLaunchCampaign={() => dispatch({ type: "step2_clicked" })}
          />
        );
      }
      if (view.name === "Кампании") {
        return (
          <CampaignTypeView
            onSelect={(id, name) =>
              dispatch({ type: "campaign_selected", campaign: { id, name } })
            }
            noSignal={signal === null}
            campaign={state.launchedCampaign}
          />
        );
      }
    }
    return <WelcomeView onStep1Click={() => dispatch({ type: "start_signal_flow" })} />;
  }

  const chatPlaceholder =
    isWorkflowView(state) ? "Опишите изменение сценария..." :
    view.kind === "campaign-select" ? "Опишите вашу кампанию..." :
    view.kind === "guided-signal" ? "Введите ваши параметры или задайте вопрос" :
    "Выберите шаг или задайте вопрос…";

  const floatBottom = isOnWelcome(state) ? "40%" : "3%";

  const activeNav =
    view.kind === "section" ? view.name : undefined;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar
        activeNav={activeNav}
        onNavChange={(nav) =>
          dispatch({ type: "sidebar_nav", section: nav as "Статистика" | "Сигналы" | "Кампании" })
        }
        onLaunchOpen={() => dispatch({ type: "flyout_open" })}
        flyoutOpen={launchFlyoutOpen}
      />
      <LaunchFlyout
        open={launchFlyoutOpen}
        onClose={() => dispatch({ type: "flyout_close" })}
        onSignalSelect={(id, name) =>
          dispatch({ type: "flyout_signal_select", id, name })
        }
        onCampaignSelect={() => dispatch({ type: "flyout_campaign_select" })}
      />
      <AttachmentEffect view={view} signalScenarioId={signalScenarioId} />

      <div className="relative flex flex-1 flex-col overflow-hidden">
        {renderMain()}

        <motion.div
          className="fixed left-[120px] right-0 z-30 bg-background px-8 pb-4"
          initial={false}
          animate={{ bottom: floatBottom }}
          transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
        >
          <div className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-background to-transparent" />
          <div className="relative mx-auto flex w-full max-w-2xl flex-col gap-2 pt-2">
            {view.kind === "workflow" && !view.launched && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: "campaign_launched",
                      typeName: view.campaign.name,
                      launchedAt: new Date().toLocaleDateString("ru-RU"),
                    })
                  }
                  className="rounded-lg bg-foreground px-5 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
                >
                  Начать кампанию →
                </button>
              </div>
            )}

            <PromptInput onSubmit={handlePromptSubmit}>
              <AttachmentFileList />
              <PromptInputBody>
                <PromptInputTextarea placeholder={chatPlaceholder} />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools>
                  <PromptInputButton tooltip="Голосовой ввод">
                    <Mic className="h-4 w-4" />
                  </PromptInputButton>
                </PromptInputTools>
                <PromptInputSubmit />
              </PromptInputFooter>
            </PromptInput>

            {!isCampaignDone(state) && (
              <div className="flex gap-2">
                {([
                  {
                    n: 1,
                    label: "Получение сигнала",
                    active: isStep1Active(state),
                    onClick: isOnWelcome(state)
                      ? () => dispatch({ type: "start_signal_flow" })
                      : undefined,
                  },
                  {
                    n: 2,
                    label: "Запуск кампании",
                    active: isStep2Active(state),
                    onClick:
                      view.kind === "awaiting-campaign"
                        ? () => dispatch({ type: "step2_clicked" })
                        : undefined,
                  },
                  {
                    n: 3,
                    label: "Статистика кампании",
                    active: isStep3Active(state),
                    onClick: undefined,
                  },
                ] as const).map(({ n, label, active, onClick }) => (
                  <button
                    key={n}
                    type="button"
                    disabled={!active}
                    onClick={onClick}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                      active
                        ? onClick
                          ? "cursor-pointer border-border bg-card hover:bg-accent"
                          : "cursor-default border-border bg-card"
                        : "cursor-not-allowed border-border/40 bg-card/40 opacity-35"
                    )}
                    style={
                      stepTwoNew && n === 2
                        ? { animation: "step-badge-pulse 1.4s ease-in-out" }
                        : undefined
                    }
                  >
                    <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                      Шаг {n}
                    </span>
                    <div className="h-3 w-px shrink-0 bg-border" />
                    <span className="text-sm font-medium text-foreground">{label}</span>
                    {active && onClick && (
                      <ChevronRight className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                ))}
              </div>
            )}

            <style>{`
              @keyframes step-badge-pulse {
                0%, 100% { border-color: #1e1e1e; box-shadow: none; }
                20%, 60% { border-color: #4ade80; box-shadow: 0 0 8px rgba(74,222,128,0.35); }
                40%, 80% { border-color: #1e1e1e; box-shadow: none; }
              }
            `}</style>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
```

Ключевое отличие от старого page.tsx: `<PromptInputProvider>` теперь оборачивается в `layout.tsx` НЕТ — остаётся здесь. Уточнить: в старом файле был `<PromptInputProvider>` на корне render. Нужно сохранить. Перечитать старый файл и адаптировать: импортировать `PromptInputProvider` из `@/components/ai-elements/prompt-input` и обернуть возвращаемый JSX как и раньше. Если забыл — `usePromptInputAttachments` упадёт.

Финальный корректный `return`:
```tsx
return (
  <PromptInputProvider>
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ... всё как выше ... */}
    </div>
  </PromptInputProvider>
);
```

И импорт `PromptInputProvider` добавить в список импортов из `@/components/ai-elements/prompt-input`.

- [ ] **Step 5: Запустить dev и проверить компиляцию**

Run:
```bash
npm run dev
```
Открыть http://localhost:3000 в браузере. Убедиться, что Welcome рендерится, кнопки step-бейджей реагируют. Остановить сервер.

- [ ] **Step 6: Прогнать smoke-тест**

Run:
```bash
npm run test:e2e
```
Expected: 1 passed. Если падает — читать trace в `test-results/`, чинить reducer-логику (НЕ править тест под новое поведение, кроме случаев когда тест изначально был неточен — в этом случае останавливаемся и эскалируем ревью).

- [ ] **Step 7: Commit**

```bash
git add src/state/ src/app/layout.tsx src/app/page.tsx
git commit -m "refactor: move page state to typed reducer + context"
```

---

## Task 3: Переместить компоненты в `src/sections/*`

**Цель:** чистые файловые перемещения (git mv) + обновление импортов. Никаких изменений в логике. Smoke-тест зелёный после каждого step-а.

**Files:** см. раздел «Перемещается» в File Structure.

- [ ] **Step 1: Создать структуру папок**

Run:
```bash
cd /Users/macintosh/Documents/work/afina-ai-first
mkdir -p src/sections/welcome src/sections/signals/steps src/sections/campaigns src/sections/statistics src/sections/shell
```

- [ ] **Step 2: Переместить Welcome**

Run:
```bash
git mv src/components/welcome-view.tsx src/sections/welcome/welcome-view.tsx
```

Обновить импорт в `src/app/page.tsx`:
```diff
-import { WelcomeView } from "@/components/welcome-view";
+import { WelcomeView } from "@/sections/welcome/welcome-view";
```

Запустить: `npm run test:e2e` — должен пройти. Commit:
```bash
git add -A && git commit -m "refactor: move WelcomeView to src/sections/welcome"
```

- [ ] **Step 3: Переместить Statistics**

Run:
```bash
git mv src/components/statistics-view.tsx src/sections/statistics/statistics-view.tsx
```

Обновить импорт в `src/app/page.tsx`:
```diff
-import { StatisticsView } from "@/components/statistics-view";
+import { StatisticsView } from "@/sections/statistics/statistics-view";
```

Run: `npm run test:e2e`. Commit:
```bash
git add -A && git commit -m "refactor: move StatisticsView to src/sections/statistics"
```

- [ ] **Step 4: Переместить Shell-компоненты**

Run:
```bash
git mv src/components/app-sidebar.tsx src/sections/shell/app-sidebar.tsx
git mv src/components/launch-flyout.tsx src/sections/shell/launch-flyout.tsx
```

Обновить импорты в `src/app/page.tsx`:
```diff
-import { AppSidebar } from "@/components/app-sidebar";
-import { LaunchFlyout } from "@/components/launch-flyout";
+import { AppSidebar } from "@/sections/shell/app-sidebar";
+import { LaunchFlyout } from "@/sections/shell/launch-flyout";
```

Grep по проекту на случай других мест:
```bash
```
Run Grep tool: pattern `from "@/components/(app-sidebar|launch-flyout)"`. Обновить все найденные.

Run: `npm run test:e2e`. Commit:
```bash
git add -A && git commit -m "refactor: move shell components to src/sections/shell"
```

- [ ] **Step 5: Переместить Signals-компоненты**

Run:
```bash
git mv src/components/signal-type-view.tsx src/sections/signals/signal-type-view.tsx
git mv src/components/campaign-workspace.tsx src/sections/signals/campaign-workspace.tsx
git mv src/components/campaign-stepper.tsx src/sections/signals/campaign-stepper.tsx
git mv src/components/steps src/sections/signals/steps
```

В `src/sections/signals/campaign-workspace.tsx` обновить импорты:
```diff
-import { CampaignStepper } from "@/components/campaign-stepper";
-import { Step1Scenario } from "@/components/steps/step-1-scenario";
-import { Step2Interests } from "@/components/steps/step-2-interests";
-import { Step3Segments } from "@/components/steps/step-3-segments";
-import { Step4Limit } from "@/components/steps/step-4-limit";
-import { Step5Upload } from "@/components/steps/step-5-upload";
-import { Step6Summary } from "@/components/steps/step-6-summary";
-import { Step7Processing } from "@/components/steps/step-7-processing";
-import { Step8Result } from "@/components/steps/step-8-result";
+import { CampaignStepper } from "@/sections/signals/campaign-stepper";
+import { Step1Scenario } from "@/sections/signals/steps/step-1-scenario";
+import { Step2Interests } from "@/sections/signals/steps/step-2-interests";
+import { Step3Segments } from "@/sections/signals/steps/step-3-segments";
+import { Step4Limit } from "@/sections/signals/steps/step-4-limit";
+import { Step5Upload } from "@/sections/signals/steps/step-5-upload";
+import { Step6Summary } from "@/sections/signals/steps/step-6-summary";
+import { Step7Processing } from "@/sections/signals/steps/step-7-processing";
+import { Step8Result } from "@/sections/signals/steps/step-8-result";
```

В `src/sections/signals/steps/step-1-scenario.tsx` и в каждом `step-N-*.tsx` обновить:
```diff
-import { StepContent } from "@/components/steps/step-content";
+import { StepContent } from "@/sections/signals/steps/step-content";
```

Обновить импорты в `src/app/page.tsx`:
```diff
-import { CampaignWorkspace } from "@/components/campaign-workspace";
-import { SignalTypeView } from "@/components/signal-type-view";
+import { CampaignWorkspace } from "@/sections/signals/campaign-workspace";
+import { SignalTypeView } from "@/sections/signals/signal-type-view";
```

Grep-проверка на забытые импорты:
```bash
```
Run Grep tool: pattern `from "@/components/(signal-type-view|campaign-workspace|campaign-stepper|steps/)"`. Обновить все найденные.

Run: `npm run test:e2e`. Commit:
```bash
git add -A && git commit -m "refactor: move signals components to src/sections/signals"
```

- [ ] **Step 6: Переместить Campaigns + Workflow**

Run:
```bash
git mv src/components/campaign-type-view.tsx src/sections/campaigns/campaign-type-view.tsx
git mv src/components/workflow-view.tsx src/sections/campaigns/workflow-view.tsx
git mv src/components/workflow-graph.tsx src/sections/campaigns/workflow-graph.tsx
git mv src/components/workflow-node.tsx src/sections/campaigns/workflow-node.tsx
git mv src/components/workflow-status.tsx src/sections/campaigns/workflow-status.tsx
```

В `src/sections/campaigns/workflow-view.tsx` обновить импорты:
```diff
-import { WorkflowGraph } from "@/components/workflow-graph";
-import { WorkflowStatus } from "@/components/workflow-status";
+import { WorkflowGraph } from "@/sections/campaigns/workflow-graph";
+import { WorkflowStatus } from "@/sections/campaigns/workflow-status";
```

В `src/sections/campaigns/workflow-graph.tsx` обновить:
```diff
-import { WorkflowNodeComponent } from "@/components/workflow-node";
+import { WorkflowNodeComponent } from "@/sections/campaigns/workflow-node";
```
(точное имя импорта уточнить по текущему файлу; главное — заменить путь)

Обновить `src/app/page.tsx`:
```diff
-import { CampaignTypeView } from "@/components/campaign-type-view";
-import { WorkflowView } from "@/components/workflow-view";
+import { CampaignTypeView } from "@/sections/campaigns/campaign-type-view";
+import { WorkflowView } from "@/sections/campaigns/workflow-view";
```

Grep-проверка:
```bash
```
Run Grep tool: pattern `from "@/components/(campaign-type-view|workflow-)"`. Обновить все.

Run: `npm run test:e2e`. Commit:
```bash
git add -A && git commit -m "refactor: move campaigns+workflow components to src/sections/campaigns"
```

- [ ] **Step 7: Удалить пустые старые директории**

Run:
```bash
rmdir src/components/steps 2>/dev/null || true
ls src/components
```
Expected: остаются только `ai-elements/` и `ui/`.

Commit если есть изменения (обычно нет — git сам убирает пустые):
```bash
git status
```

---

## Task 4: Подключить секции к context hooks

**Цель:** создать «контейнерные» компоненты секций, которые читают state/dispatch из context и передают презентационным вью. `page.tsx` сжимается до чистого диспетчера.

**Files:** перечислены в разделе «Создаётся» File Structure.

- [ ] **Step 1: Welcome container**

Create `src/sections/welcome/welcome-section.tsx`:
```tsx
"use client";

import { useAppDispatch } from "@/state/app-state-context";
import { WelcomeView } from "./welcome-view";

export function WelcomeSection() {
  const dispatch = useAppDispatch();
  return <WelcomeView onStep1Click={() => dispatch({ type: "start_signal_flow" })} />;
}
```

В `page.tsx` заменить в `renderMain()`:
```diff
-return <WelcomeView onStep1Click={() => dispatch({ type: "start_signal_flow" })} />;
+return <WelcomeSection />;
```

И импорт:
```diff
-import { WelcomeView } from "@/sections/welcome/welcome-view";
+import { WelcomeSection } from "@/sections/welcome/welcome-section";
```

Run: `npm run test:e2e`. Commit:
```bash
git add -A && git commit -m "refactor: wrap welcome in WelcomeSection container"
```

- [ ] **Step 2: Statistics container**

Create `src/sections/statistics/statistics-section.tsx`:
```tsx
"use client";

import { StatisticsView } from "./statistics-view";

export function StatisticsSection() {
  return <StatisticsView />;
}
```
(секция пока тривиальна — внутренний стейт StatisticsView локален)

В `page.tsx`:
```diff
-if (view.name === "Статистика") return <StatisticsView />;
+if (view.name === "Статистика") return <StatisticsSection />;
```
```diff
-import { StatisticsView } from "@/sections/statistics/statistics-view";
+import { StatisticsSection } from "@/sections/statistics/statistics-section";
```

Run: `npm run test:e2e`. Commit:
```bash
git add -A && git commit -m "refactor: wrap statistics in StatisticsSection container"
```

- [ ] **Step 3: Signals containers (standalone + guided)**

Create `src/sections/signals/signals-section.tsx`:
```tsx
"use client";

import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { SignalTypeView } from "./signal-type-view";

export function SignalsSection() {
  const { signal } = useAppState();
  const dispatch = useAppDispatch();
  return (
    <SignalTypeView
      onCreateSignal={() => dispatch({ type: "start_signal_flow" })}
      signal={
        signal
          ? { scenarioId: signal.scenarioId, count: signal.count, createdAt: signal.createdAt }
          : null
      }
      onLaunchCampaign={() => dispatch({ type: "step2_clicked" })}
    />
  );
}
```

Create `src/sections/signals/guided-signal-section.tsx`:
```tsx
"use client";

import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { CampaignWorkspace } from "./campaign-workspace";

export function GuidedSignalSection() {
  const { view } = useAppState();
  const dispatch = useAppDispatch();
  const initial = view.kind === "guided-signal" ? view.initialScenario : undefined;

  return (
    <CampaignWorkspace
      onSignalComplete={() => dispatch({ type: "signal_complete" })}
      onStep8Reached={(scenarioId) =>
        dispatch({ type: "signal_step8_reached", scenarioId })
      }
      initialScenario={initial}
    />
  );
}
```

В `page.tsx` заменить:
```diff
-if (view.kind === "guided-signal" || view.kind === "awaiting-campaign") {
-  const initial = view.kind === "guided-signal" ? view.initialScenario : undefined;
-  return (
-    <CampaignWorkspace
-      onSignalComplete={() => dispatch({ type: "signal_complete" })}
-      onStep8Reached={(scenarioId) =>
-        dispatch({ type: "signal_step8_reached", scenarioId })
-      }
-      initialScenario={initial}
-    />
-  );
-}
+if (view.kind === "guided-signal" || view.kind === "awaiting-campaign") {
+  return <GuidedSignalSection />;
+}
```
```diff
-if (view.name === "Сигналы") {
-  return (
-    <SignalTypeView
-      onCreateSignal={() => dispatch({ type: "start_signal_flow" })}
-      signal={signal ? { scenarioId: signal.scenarioId, count: signal.count, createdAt: signal.createdAt } : null}
-      onLaunchCampaign={() => dispatch({ type: "step2_clicked" })}
-    />
-  );
-}
+if (view.name === "Сигналы") return <SignalsSection />;
```

Обновить импорты в `page.tsx`:
```diff
-import { CampaignWorkspace } from "@/sections/signals/campaign-workspace";
-import { SignalTypeView } from "@/sections/signals/signal-type-view";
+import { GuidedSignalSection } from "@/sections/signals/guided-signal-section";
+import { SignalsSection } from "@/sections/signals/signals-section";
```

Run: `npm run test:e2e`. Commit:
```bash
git add -A && git commit -m "refactor: wrap signals views in section containers"
```

- [ ] **Step 4: Campaigns containers (select + workflow)**

Create `src/sections/campaigns/campaigns-section.tsx`:
```tsx
"use client";

import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { CampaignTypeView } from "./campaign-type-view";

export function CampaignsSection({ mode }: { mode: "guided" | "standalone" }) {
  const { signal, launchedCampaign } = useAppState();
  const dispatch = useAppDispatch();

  if (mode === "guided") {
    return (
      <CampaignTypeView
        onSelect={(id, name) =>
          dispatch({ type: "campaign_selected", campaign: { id, name } })
        }
      />
    );
  }

  return (
    <CampaignTypeView
      onSelect={(id, name) =>
        dispatch({ type: "campaign_selected", campaign: { id, name } })
      }
      noSignal={signal === null}
      campaign={launchedCampaign}
    />
  );
}
```

Create `src/sections/campaigns/workflow-section.tsx`:
```tsx
"use client";

import { useCallback } from "react";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { WorkflowView } from "./workflow-view";

export function WorkflowSection() {
  const { view, workflowCommand, signal } = useAppState();
  const dispatch = useAppDispatch();

  const handleCommandHandled = useCallback(
    () => dispatch({ type: "workflow_command_handled" }),
    [dispatch]
  );

  if (view.kind !== "workflow") return null;

  const signalFileName = signal ? `сигнал_${signal.scenarioId}.json` : undefined;

  return (
    <WorkflowView
      launched={view.launched}
      pendingCommand={workflowCommand}
      onCommandHandled={handleCommandHandled}
      onGoToStats={() => dispatch({ type: "goto_stats" })}
      signalName={signalFileName}
    />
  );
}
```

В `page.tsx` заменить:
```diff
-if (view.kind === "campaign-select") {
-  return (
-    <CampaignTypeView
-      onSelect={(id, name) =>
-        dispatch({ type: "campaign_selected", campaign: { id, name } })
-      }
-    />
-  );
-}
+if (view.kind === "campaign-select") {
+  return <CampaignsSection mode="guided" />;
+}
```
```diff
-if (view.kind === "workflow") {
-  const signalFileName = signalScenarioId ? `сигнал_${signalScenarioId}.json` : undefined;
-  return (
-    <WorkflowView
-      launched={view.launched}
-      pendingCommand={state.workflowCommand}
-      onCommandHandled={handleCommandHandled}
-      onGoToStats={() => dispatch({ type: "goto_stats" })}
-      signalName={signalFileName}
-    />
-  );
-}
+if (view.kind === "workflow") {
+  return <WorkflowSection />;
+}
```
```diff
-if (view.name === "Кампании") {
-  return (
-    <CampaignTypeView
-      onSelect={(id, name) =>
-        dispatch({ type: "campaign_selected", campaign: { id, name } })
-      }
-      noSignal={signal === null}
-      campaign={state.launchedCampaign}
-    />
-  );
-}
+if (view.name === "Кампании") {
+  return <CampaignsSection mode="standalone" />;
+}
```

Удалить из `page.tsx` неиспользуемый импорт `CampaignTypeView`, `WorkflowView`, `handleCommandHandled` callback. Добавить:
```diff
+import { CampaignsSection } from "@/sections/campaigns/campaigns-section";
+import { WorkflowSection } from "@/sections/campaigns/workflow-section";
```

Run: `npm run test:e2e`. Commit:
```bash
git add -A && git commit -m "refactor: wrap campaigns+workflow in section containers"
```

- [ ] **Step 5: Извлечь bottom chat bar в `src/sections/shell/shell-bottom-bar.tsx`**

Create `src/sections/shell/shell-bottom-bar.tsx`. Вынести весь JSX нижней панели (motion.div + PromptInput + step-бейджи + кнопка «Начать кампанию →») из `page.tsx`. Внутри — читает state/dispatch из context.

Content (скопировать и адаптировать из текущего page.tsx):
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Mic, ChevronRight } from "lucide-react";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import {
  isCampaignDone,
  isOnWelcome,
  isStep1Active,
  isStep2Active,
  isStep3Active,
  isWorkflowView,
  type View,
} from "@/state/app-state";

function AttachmentFileList() {
  const { files } = usePromptInputAttachments();
  if (files.length === 0) return null;
  return (
    <PromptInputHeader>
      {files.map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-xs text-foreground"
        >
          <span className="max-w-[200px] truncate">{f.filename}</span>
        </div>
      ))}
    </PromptInputHeader>
  );
}

function AttachmentEffect({
  view,
  signalScenarioId,
}: {
  view: View;
  signalScenarioId: string;
}) {
  const { attachments } = usePromptInputController();
  const inCampaignSelect = view.kind === "campaign-select";

  useEffect(() => {
    if (inCampaignSelect && signalScenarioId) {
      const content = JSON.stringify({ scenario: signalScenarioId });
      const file = new File([content], `сигнал_${signalScenarioId}.json`, {
        type: "application/json",
      });
      attachments.add([file]);
    } else {
      attachments.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inCampaignSelect, signalScenarioId]);

  return null;
}

export function ShellBottomBar() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { view, signal } = state;
  const signalScenarioId = signal?.scenarioId ?? "";

  const [stepTwoNew, setStepTwoNew] = useState(false);
  const prevViewKind = useRef<View["kind"] | null>(null);
  useEffect(() => {
    if (view.kind === "awaiting-campaign" && prevViewKind.current !== "awaiting-campaign") {
      setStepTwoNew(true);
      const t = setTimeout(() => setStepTwoNew(false), 1400);
      prevViewKind.current = view.kind;
      return () => clearTimeout(t);
    }
    prevViewKind.current = view.kind;
  }, [view.kind]);

  function handlePromptSubmit(message: PromptInputMessage) {
    if (view.kind === "workflow" && !view.launched) {
      dispatch({ type: "workflow_command_submit", text: message.text ?? "" });
    }
  }

  const chatPlaceholder =
    isWorkflowView(state) ? "Опишите изменение сценария..." :
    view.kind === "campaign-select" ? "Опишите вашу кампанию..." :
    view.kind === "guided-signal" ? "Введите ваши параметры или задайте вопрос" :
    "Выберите шаг или задайте вопрос…";

  const floatBottom = isOnWelcome(state) ? "40%" : "3%";

  return (
    <>
      <AttachmentEffect view={view} signalScenarioId={signalScenarioId} />
      <motion.div
        className="fixed left-[120px] right-0 z-30 bg-background px-8 pb-4"
        initial={false}
        animate={{ bottom: floatBottom }}
        transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
      >
        <div className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-background to-transparent" />
        <div className="relative mx-auto flex w-full max-w-2xl flex-col gap-2 pt-2">
          {view.kind === "workflow" && !view.launched && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: "campaign_launched",
                    typeName: view.campaign.name,
                    launchedAt: new Date().toLocaleDateString("ru-RU"),
                  })
                }
                className="rounded-lg bg-foreground px-5 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
              >
                Начать кампанию →
              </button>
            </div>
          )}

          <PromptInput onSubmit={handlePromptSubmit}>
            <AttachmentFileList />
            <PromptInputBody>
              <PromptInputTextarea placeholder={chatPlaceholder} />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputButton tooltip="Голосовой ввод">
                  <Mic className="h-4 w-4" />
                </PromptInputButton>
              </PromptInputTools>
              <PromptInputSubmit />
            </PromptInputFooter>
          </PromptInput>

          {!isCampaignDone(state) && (
            <div className="flex gap-2">
              {([
                {
                  n: 1,
                  label: "Получение сигнала",
                  active: isStep1Active(state),
                  onClick: isOnWelcome(state)
                    ? () => dispatch({ type: "start_signal_flow" })
                    : undefined,
                },
                {
                  n: 2,
                  label: "Запуск кампании",
                  active: isStep2Active(state),
                  onClick:
                    view.kind === "awaiting-campaign"
                      ? () => dispatch({ type: "step2_clicked" })
                      : undefined,
                },
                {
                  n: 3,
                  label: "Статистика кампании",
                  active: isStep3Active(state),
                  onClick: undefined,
                },
              ] as const).map(({ n, label, active, onClick }) => (
                <button
                  key={n}
                  type="button"
                  disabled={!active}
                  onClick={onClick}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                    active
                      ? onClick
                        ? "cursor-pointer border-border bg-card hover:bg-accent"
                        : "cursor-default border-border bg-card"
                      : "cursor-not-allowed border-border/40 bg-card/40 opacity-35"
                  )}
                  style={
                    stepTwoNew && n === 2
                      ? { animation: "step-badge-pulse 1.4s ease-in-out" }
                      : undefined
                  }
                >
                  <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                    Шаг {n}
                  </span>
                  <div className="h-3 w-px shrink-0 bg-border" />
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  {active && onClick && (
                    <ChevronRight className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          )}

          <style>{`
            @keyframes step-badge-pulse {
              0%, 100% { border-color: #1e1e1e; box-shadow: none; }
              20%, 60% { border-color: #4ade80; box-shadow: 0 0 8px rgba(74,222,128,0.35); }
              40%, 80% { border-color: #1e1e1e; box-shadow: none; }
            }
          `}</style>
        </div>
      </motion.div>
    </>
  );
}
```

- [ ] **Step 6: Сжать `page.tsx` до тонкого диспетчера**

Переписать `src/app/page.tsx` полностью:
```tsx
// src/app/page.tsx
"use client";

import { PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { AppSidebar } from "@/sections/shell/app-sidebar";
import { LaunchFlyout } from "@/sections/shell/launch-flyout";
import { ShellBottomBar } from "@/sections/shell/shell-bottom-bar";
import { WelcomeSection } from "@/sections/welcome/welcome-section";
import { GuidedSignalSection } from "@/sections/signals/guided-signal-section";
import { SignalsSection } from "@/sections/signals/signals-section";
import { CampaignsSection } from "@/sections/campaigns/campaigns-section";
import { WorkflowSection } from "@/sections/campaigns/workflow-section";
import { StatisticsSection } from "@/sections/statistics/statistics-section";

export default function Home() {
  const { view, launchFlyoutOpen } = useAppState();
  const dispatch = useAppDispatch();

  function renderMain() {
    if (view.kind === "welcome") return <WelcomeSection />;
    if (view.kind === "guided-signal" || view.kind === "awaiting-campaign")
      return <GuidedSignalSection />;
    if (view.kind === "campaign-select") return <CampaignsSection mode="guided" />;
    if (view.kind === "workflow") return <WorkflowSection />;
    if (view.kind === "section") {
      if (view.name === "Статистика") return <StatisticsSection />;
      if (view.name === "Сигналы") return <SignalsSection />;
      if (view.name === "Кампании") return <CampaignsSection mode="standalone" />;
    }
    return null;
  }

  const activeNav = view.kind === "section" ? view.name : undefined;

  return (
    <PromptInputProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <AppSidebar
          activeNav={activeNav}
          onNavChange={(nav) =>
            dispatch({
              type: "sidebar_nav",
              section: nav as "Статистика" | "Сигналы" | "Кампании",
            })
          }
          onLaunchOpen={() => dispatch({ type: "flyout_open" })}
          flyoutOpen={launchFlyoutOpen}
        />
        <LaunchFlyout
          open={launchFlyoutOpen}
          onClose={() => dispatch({ type: "flyout_close" })}
          onSignalSelect={(id, name) =>
            dispatch({ type: "flyout_signal_select", id, name })
          }
          onCampaignSelect={() => dispatch({ type: "flyout_campaign_select" })}
        />
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {renderMain()}
          <ShellBottomBar />
        </div>
      </div>
    </PromptInputProvider>
  );
}
```

Size check: файл должен быть ~60 строк (вместо текущих 370+).

Run: `npm run test:e2e`. Commit:
```bash
git add -A && git commit -m "refactor: shrink page.tsx to thin dispatcher, extract ShellBottomBar"
```

- [ ] **Step 7: Финальная валидация**

Run:
```bash
npm run lint
npm run build
npm run test:e2e
```

Все три должны пройти. Если `build` падает — разобраться (может быть неиспользованный импорт или мёртвый export). Если smoke падает — починить reducer/wiring, НЕ тест.

Commit если что-то правилось:
```bash
git add -A && git commit -m "fix: resolve lint/build warnings after refactor"
```

---

## Self-Review (проведён после написания плана)

**1. Spec coverage:**

- ✅ Pt.1 (типизированный union): Task 2
- ✅ Pt.2 (секции в своих модулях): Task 3 (перенос файлов) + Task 4 (context-containers)
- ✅ Pt.3 (Playwright smoke-тест): Task 1
- ❌ Pt.4 (удалить CampaignStepper): **отменено** — компонент используется в `campaign-workspace.tsx:108`. В плане явно зафиксировано в header.

**2. Placeholder scan:** весь код в плане реальный и вставляемый as-is; селекторы теста основаны на проверенных текстах компонентов. Комментарии «уточнить имя импорта» в Task 3 Step 6 — это честный отсыл к актуальному коду, но чтобы не быть placeholder-ом, при исполнении plan-runner читает `workflow-graph.tsx` перед правкой (это один Read).

**3. Type consistency:** `View`, `AppState`, `Action`, `SectionName`, `SignalFact`, `CampaignFact` — используются единообразно. Reducer возвращает `AppState` во всех ветвях (TS-проверка). Экспорты selectors (`isStep1Active` и т.д.) используются в page.tsx и shell-bottom-bar идентично.

**4. Known risks & mitigations:**
- *Risk:* `PromptInputProvider` потерян при переписке `page.tsx`. *Mitigation:* явная инструкция в Task 2 Step 4 сохранить обёртку.
- *Risk:* `setText` на submit может прийти `undefined` в `message.text`. *Mitigation:* `message.text ?? ""` в `handlePromptSubmit`.
- *Risk:* `signalCreatedAt` раньше выставлялся рядом с `signalScenarioId`; теперь оба поля в `state.signal`. Smoke-тест ловит финальный путь через Step 8, но **не** проверяет отображение createdAt в SignalTypeView (раздел «Сигналы» из сайдбара после запуска). Если это важно — добавить второй тест после main smoke.

---

## Branching recommendation

Этот план переработки лучше выполнять на отдельной ветке:
```bash
git checkout -b refactor/typed-state-sections
```
и мержить в main через PR после прохождения всех 4 тасков. Не обязательно — решение за пользователем.
