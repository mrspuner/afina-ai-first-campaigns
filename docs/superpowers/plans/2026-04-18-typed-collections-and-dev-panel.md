# Typed Collections & Dev Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести reducer с single-instance полей (`signal`, `launchedCampaign`) на массивы (`signals: Signal[]`, `campaigns: Campaign[]`) и добавить дев-панель за хоткеем Cmd+Shift+D с тремя пресетами (empty / mid / full). Пользовательское поведение неизменно — Playwright happy-path остаётся зелёным.

**Architecture:** Все изменения стейта идут через единый reducer в `src/state/app-state.ts`. Пресеты генерируются детерминистично (seeded PRNG) в `src/state/presets.ts`. Дев-панель живёт в `src/components/dev/`, монтируется в `src/app/page.tsx` только в dev-сборке (`process.env.NODE_ENV === "development"`), читает состояние через React context, раздаёт пресеты через dispatch. Секции продолжают работать благодаря тонкому adapter-слою на время блока A — он будет удалён в блоке B, когда экраны-списки перепишутся под реальные массивы.

**Tech Stack:** Next.js 16.2.2, React 19.2.4, TypeScript 5, `nanoid` (уже в deps), Tailwind v4, vitest (новый devDep для unit-тестов reducer-а).

**Spec:** `docs/superpowers/specs/2026-04-18-typed-collections-and-dev-panel-design.md`

---

## File Structure

**Создаётся:**
- `vitest.config.ts` — корневой конфиг vitest
- `src/state/app-state.test.ts` — unit-тесты reducer-а
- `src/state/presets.ts` — seeded-генератор пресетов
- `src/state/presets.test.ts` — проверки shape пресетов
- `src/components/dev/dev-panel.tsx` — UI дев-панели
- `src/components/dev/use-dev-hotkey.ts` — хук Cmd+Shift+D

**Модифицируется:**
- `src/state/app-state.ts` — новые типы, новая форма `AppState`, новые actions, обновлённые селекторы
- `src/sections/signals/signals-section.tsx` — adapter на массив signals
- `src/sections/signals/guided-signal-section.tsx` — dispatch `signal_added` с полным Signal
- `src/sections/campaigns/campaigns-section.tsx` — adapter на массив campaigns
- `src/sections/campaigns/workflow-section.tsx` — adapter на массивы
- `src/app/page.tsx` — монтирование `<DevPanel />` (dev-only)
- `package.json` — `vitest`, `@vitejs/plugin-react`, скрипт `test`
- `.gitignore` — добавить `coverage/` если нужно

**Не трогается:**
- `src/sections/welcome/*`
- `src/sections/signals/steps/*` (мастер 8 шагов)
- `src/sections/signals/signal-type-view.tsx`, `campaign-workspace.tsx`, `campaign-stepper.tsx`
- `src/sections/campaigns/campaign-type-view.tsx`, `workflow-*`
- `src/sections/shell/app-sidebar.tsx`, `launch-flyout.tsx`
- `src/sections/shell/shell-bottom-bar.tsx` (поменяется только автоматически через селекторы)
- `src/sections/statistics/statistics-view.tsx`
- `src/components/ai-elements/*`, `src/components/ui/*`
- `src/hooks/*`, `src/lib/*`, `src/types/*`
- `tests/e2e/happy-path.spec.ts`
- `src/state/app-state-context.tsx`

---

## Task 1: Setup vitest

**Цель:** поднять unit-test runner, чтобы тесты reducer-а можно было писать TDD-стилем.

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Установить vitest**

Run:
```bash
cd /Users/macintosh/Documents/work/afina-ai-first
npm install --save-dev vitest @vitest/ui
```

Expected: `vitest` и `@vitest/ui` в `devDependencies`.

- [ ] **Step 2: Создать `vitest.config.ts`**

Content:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
```

- [ ] **Step 3: Добавить скрипты в `package.json`**

В секцию `"scripts"` добавить две строки (не удалять существующие):
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Убедиться, что vitest запускается**

Run:
```bash
npm test
```

Expected: `No test files found, exiting with code 0` или эквивалентное сообщение. Код выхода 0.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "test: add vitest for unit tests"
```

---

## Task 2: Написать unit-тесты reducer-а (failing)

**Цель:** зафиксировать контракт нового reducer-а через failing-тесты. После Task 3 все эти тесты должны позеленеть.

**Files:**
- Create: `src/state/app-state.test.ts`

- [ ] **Step 1: Написать тесты**

Content:
```ts
import { describe, it, expect } from "vitest";
import { appReducer, initialState, type AppState, type Signal, type Campaign } from "./app-state";

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig_1",
    type: "Регистрация",
    count: 1000,
    segments: { max: 100, high: 300, mid: 400, low: 200 },
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "cmp_1",
    name: "Campaign 1",
    signalId: "sig_1",
    status: "draft",
    createdAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("appReducer — initial state", () => {
  it("has empty signals and campaigns arrays", () => {
    expect(initialState.signals).toEqual([]);
    expect(initialState.campaigns).toEqual([]);
  });

  it("starts on welcome view", () => {
    expect(initialState.view).toEqual({ kind: "welcome" });
  });
});

describe("appReducer — signal_added", () => {
  it("appends a signal to the array", () => {
    const signal = makeSignal();
    const next = appReducer(initialState, { type: "signal_added", signal });
    expect(next.signals).toHaveLength(1);
    expect(next.signals[0]).toEqual(signal);
  });

  it("preserves existing signals", () => {
    const first = makeSignal({ id: "sig_1" });
    const second = makeSignal({ id: "sig_2", type: "Апсейл" });
    const state1 = appReducer(initialState, { type: "signal_added", signal: first });
    const state2 = appReducer(state1, { type: "signal_added", signal: second });
    expect(state2.signals).toEqual([first, second]);
  });

  it("does not touch campaigns", () => {
    const signal = makeSignal();
    const next = appReducer(initialState, { type: "signal_added", signal });
    expect(next.campaigns).toEqual([]);
  });
});

describe("appReducer — campaign_created", () => {
  it("appends a campaign to the array", () => {
    const campaign = makeCampaign();
    const next = appReducer(initialState, { type: "campaign_created", campaign });
    expect(next.campaigns).toHaveLength(1);
    expect(next.campaigns[0]).toEqual(campaign);
  });

  it("flips view.launched when active campaign matches workflow view", () => {
    const state: AppState = {
      ...initialState,
      view: { kind: "workflow", campaign: { id: "c1", name: "C1" }, launched: false },
    };
    const campaign = makeCampaign({ id: "c1", status: "active" });
    const next = appReducer(state, { type: "campaign_created", campaign });
    expect(next.view).toEqual({
      kind: "workflow",
      campaign: { id: "c1", name: "C1" },
      launched: true,
    });
  });

  it("does not flip view.launched when campaign id differs", () => {
    const state: AppState = {
      ...initialState,
      view: { kind: "workflow", campaign: { id: "c1", name: "C1" }, launched: false },
    };
    const campaign = makeCampaign({ id: "other", status: "active" });
    const next = appReducer(state, { type: "campaign_created", campaign });
    if (next.view.kind === "workflow") {
      expect(next.view.launched).toBe(false);
    }
  });
});

describe("appReducer — campaign_status_changed", () => {
  it("updates status and sets launchedAt when moving to active", () => {
    const state: AppState = {
      ...initialState,
      campaigns: [makeCampaign({ id: "c1", status: "draft" })],
    };
    const next = appReducer(state, {
      type: "campaign_status_changed",
      id: "c1",
      status: "active",
      timestamp: "2026-04-18T12:00:00.000Z",
    });
    expect(next.campaigns[0].status).toBe("active");
    expect(next.campaigns[0].launchedAt).toBe("2026-04-18T12:00:00.000Z");
  });

  it("sets completedAt when moving to completed", () => {
    const state: AppState = {
      ...initialState,
      campaigns: [makeCampaign({ id: "c1", status: "active" })],
    };
    const next = appReducer(state, {
      type: "campaign_status_changed",
      id: "c1",
      status: "completed",
      timestamp: "2026-04-18T12:00:00.000Z",
    });
    expect(next.campaigns[0].status).toBe("completed");
    expect(next.campaigns[0].completedAt).toBe("2026-04-18T12:00:00.000Z");
  });

  it("does not mutate other campaigns", () => {
    const state: AppState = {
      ...initialState,
      campaigns: [
        makeCampaign({ id: "c1", status: "draft" }),
        makeCampaign({ id: "c2", status: "draft" }),
      ],
    };
    const next = appReducer(state, {
      type: "campaign_status_changed",
      id: "c1",
      status: "scheduled",
      timestamp: "2026-04-18T12:00:00.000Z",
    });
    expect(next.campaigns[1].status).toBe("draft");
  });
});

describe("appReducer — preset_applied", () => {
  it("replaces signals and campaigns", () => {
    const state: AppState = {
      ...initialState,
      signals: [makeSignal({ id: "old" })],
      campaigns: [makeCampaign({ id: "old-cmp" })],
    };
    const preset = {
      key: "mid" as const,
      label: "Mid",
      signals: [makeSignal({ id: "new-1" }), makeSignal({ id: "new-2" })],
      campaigns: [makeCampaign({ id: "new-cmp" })],
    };
    const next = appReducer(state, { type: "preset_applied", preset });
    expect(next.signals.map((s) => s.id)).toEqual(["new-1", "new-2"]);
    expect(next.campaigns.map((c) => c.id)).toEqual(["new-cmp"]);
  });

  it("preserves view when current view is welcome", () => {
    const preset = { key: "mid" as const, label: "Mid", signals: [], campaigns: [] };
    const next = appReducer(initialState, { type: "preset_applied", preset });
    expect(next.view).toEqual({ kind: "welcome" });
  });

  it("falls back to section Кампании when current workflow view references non-existent campaign", () => {
    const state: AppState = {
      ...initialState,
      view: { kind: "workflow", campaign: { id: "gone", name: "Gone" }, launched: false },
      campaigns: [makeCampaign({ id: "gone" })],
    };
    const preset = {
      key: "empty" as const,
      label: "Empty",
      signals: [],
      campaigns: [],
    };
    const next = appReducer(state, { type: "preset_applied", preset });
    expect(next.view).toEqual({ kind: "section", name: "Кампании" });
  });

  it("keeps workflow view when campaign still exists in new preset", () => {
    const kept = makeCampaign({ id: "kept" });
    const state: AppState = {
      ...initialState,
      view: { kind: "workflow", campaign: { id: "kept", name: "Kept" }, launched: false },
    };
    const preset = {
      key: "mid" as const,
      label: "Mid",
      signals: [],
      campaigns: [kept],
    };
    const next = appReducer(state, { type: "preset_applied", preset });
    expect(next.view.kind).toBe("workflow");
  });

  it("does not touch workflowCommand or launchFlyoutOpen", () => {
    const state: AppState = {
      ...initialState,
      workflowCommand: "some-command",
      launchFlyoutOpen: true,
    };
    const preset = { key: "empty" as const, label: "Empty", signals: [], campaigns: [] };
    const next = appReducer(state, { type: "preset_applied", preset });
    expect(next.workflowCommand).toBe("some-command");
    expect(next.launchFlyoutOpen).toBe(true);
  });
});
```

- [ ] **Step 2: Прогнать тесты — убедиться, что они падают**

Run:
```bash
npm test
```

Expected: все тесты падают с ошибками типа `Cannot find 'Signal'`, `Cannot find 'signal_added'` и т.д. — потому что тип `Signal`, `Campaign` и новые actions пока не существуют.

- [ ] **Step 3: Commit**

```bash
git add src/state/app-state.test.ts
git commit -m "test: failing unit tests for collection-based reducer"
```

---

## Task 3: Миграция reducer-а и section-адаптеров

**Цель:** обновить `app-state.ts`, починить все 4 секции-потребителя через adapter-слой. После таска — unit-тесты Task 2 зелёные, Playwright happy-path зелёный.

**Files:**
- Modify: `src/state/app-state.ts`
- Modify: `src/sections/signals/signals-section.tsx`
- Modify: `src/sections/signals/guided-signal-section.tsx`
- Modify: `src/sections/campaigns/campaigns-section.tsx`
- Modify: `src/sections/campaigns/workflow-section.tsx`

- [ ] **Step 1: Полностью переписать `src/state/app-state.ts`**

Content:
```ts
export type SignalType =
  | "Регистрация"
  | "Первая сделка"
  | "Апсейл"
  | "Реактивация"
  | "Возврат"
  | "Удержание";

export type Signal = {
  id: string;
  type: SignalType;
  count: number;
  segments: {
    max: number;
    high: number;
    mid: number;
    low: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type CampaignStatus = "draft" | "scheduled" | "active" | "completed";

export type Campaign = {
  id: string;
  name: string;
  signalId: string;
  status: CampaignStatus;
  createdAt: string;
  launchedAt?: string;
  completedAt?: string;
  scheduledFor?: string;
};

export type Preset = {
  key: "empty" | "mid" | "full";
  label: string;
  signals: Signal[];
  campaigns: Campaign[];
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
  signals: Signal[];
  campaigns: Campaign[];
  workflowCommand: string | null;
  launchFlyoutOpen: boolean;
  activeSection: SectionName | null;
};

export type Action =
  | { type: "start_signal_flow"; initialScenario?: { id: string; name: string } }
  | { type: "signal_added"; signal: Signal }
  | { type: "signal_complete" }
  | { type: "step2_clicked" }
  | { type: "campaign_selected"; campaign: { id: string; name: string } }
  | { type: "campaign_created"; campaign: Campaign }
  | { type: "campaign_status_changed"; id: string; status: CampaignStatus; timestamp: string }
  | { type: "preset_applied"; preset: Preset }
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
  signals: [],
  campaigns: [],
  workflowCommand: null,
  launchFlyoutOpen: false,
  activeSection: null,
};

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "start_signal_flow":
      return {
        ...state,
        view: { kind: "guided-signal", initialScenario: action.initialScenario },
        launchFlyoutOpen: false,
        activeSection: null,
      };

    case "signal_added":
      return {
        ...state,
        signals: [...state.signals, action.signal],
        view: { kind: "awaiting-campaign" },
      };

    case "signal_complete":
    case "step2_clicked":
      return { ...state, view: { kind: "campaign-select" } };

    case "campaign_selected":
      return {
        ...state,
        view: { kind: "workflow", campaign: action.campaign, launched: false },
        activeSection: null,
      };

    case "campaign_created":
      return {
        ...state,
        campaigns: [...state.campaigns, action.campaign],
        view:
          state.view.kind === "workflow" &&
          state.view.campaign.id === action.campaign.id &&
          action.campaign.status === "active"
            ? { ...state.view, launched: true }
            : state.view,
      };

    case "campaign_status_changed":
      return {
        ...state,
        campaigns: state.campaigns.map((c) => {
          if (c.id !== action.id) return c;
          const next: Campaign = { ...c, status: action.status };
          if (action.status === "active") next.launchedAt = action.timestamp;
          if (action.status === "completed") next.completedAt = action.timestamp;
          if (action.status === "scheduled") next.scheduledFor = action.timestamp;
          return next;
        }),
        view:
          state.view.kind === "workflow" && state.view.campaign.id === action.id && action.status === "active"
            ? { ...state.view, launched: true }
            : state.view,
      };

    case "preset_applied": {
      const keepWorkflow =
        state.view.kind === "workflow" &&
        action.preset.campaigns.some((c) => c.id === state.view.campaign.id);
      return {
        ...state,
        signals: action.preset.signals,
        campaigns: action.preset.campaigns,
        view:
          state.view.kind === "workflow" && !keepWorkflow
            ? { kind: "section", name: "Кампании" }
            : state.view,
        activeSection:
          state.view.kind === "workflow" && !keepWorkflow ? "Кампании" : state.activeSection,
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
        activeSection: "Статистика",
      };

    case "sidebar_nav":
      return {
        ...state,
        view: { kind: "section", name: action.section },
        workflowCommand: null,
        activeSection: action.section,
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
        activeSection: null,
      };

    case "flyout_campaign_select": {
      const hasSignal = state.signals.length > 0;
      return {
        ...state,
        launchFlyoutOpen: false,
        view: hasSignal ? { kind: "campaign-select" } : { kind: "section", name: "Сигналы" },
        activeSection: hasSignal ? null : "Сигналы",
      };
    }
  }
}

export const isSignalDone = (s: AppState) => s.signals.length > 0;
export const isCampaignDone = (s: AppState) =>
  s.campaigns.some((c) => c.status === "active" || c.status === "completed");
export const isStep1Active = (s: AppState) => !isSignalDone(s);
export const isStep2Active = (s: AppState) => isSignalDone(s) && !isCampaignDone(s);
export const isStep3Active = (s: AppState) => isCampaignDone(s);
export const isWorkflowView = (s: AppState) => s.view.kind === "workflow";
export const isOnWelcome = (s: AppState) => s.view.kind === "welcome";
```

- [ ] **Step 2: Прогнать unit-тесты**

Run:
```bash
npm test
```
Expected: все тесты из Task 2 проходят (зелёные).

- [ ] **Step 3: Обновить `src/sections/signals/guided-signal-section.tsx`**

Заменить файл целиком:
```tsx
"use client";

import { nanoid } from "nanoid";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import type { Signal, SignalType } from "@/state/app-state";
import { CampaignWorkspace } from "./campaign-workspace";

const SCENARIO_TO_TYPE: Record<string, SignalType> = {
  registration: "Регистрация",
  "first-deal": "Первая сделка",
  upsell: "Апсейл",
  retention: "Удержание",
  return: "Возврат",
  reactivation: "Реактивация",
};

export function GuidedSignalSection() {
  const { view } = useAppState();
  const dispatch = useAppDispatch();
  const initial = view.kind === "guided-signal" ? view.initialScenario : undefined;

  return (
    <CampaignWorkspace
      onSignalComplete={() => dispatch({ type: "signal_complete" })}
      onStep8Reached={(scenarioId) => {
        const now = new Date().toISOString();
        const signal: Signal = {
          id: `sig_${nanoid(8)}`,
          type: SCENARIO_TO_TYPE[scenarioId] ?? "Регистрация",
          count: 4312,
          segments: { max: 1000, high: 1500, mid: 1200, low: 612 },
          createdAt: now,
          updatedAt: now,
        };
        dispatch({ type: "signal_added", signal });
      }}
      initialScenario={initial}
    />
  );
}
```

- [ ] **Step 4: Обновить `src/sections/signals/signals-section.tsx`**

Заменить файл целиком:
```tsx
"use client";

import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { SignalTypeView } from "./signal-type-view";

const TYPE_TO_SCENARIO: Record<string, string> = {
  "Регистрация": "registration",
  "Первая сделка": "first-deal",
  "Апсейл": "upsell",
  "Удержание": "retention",
  "Возврат": "return",
  "Реактивация": "reactivation",
};

export function SignalsSection() {
  const { signals } = useAppState();
  const dispatch = useAppDispatch();
  const latest = signals.length > 0 ? signals[signals.length - 1] : null;
  return (
    <SignalTypeView
      onCreateSignal={() => dispatch({ type: "start_signal_flow" })}
      signal={
        latest
          ? {
              scenarioId: TYPE_TO_SCENARIO[latest.type] ?? "registration",
              count: latest.count,
              createdAt: new Date(latest.createdAt).toLocaleDateString("ru-RU"),
            }
          : null
      }
      onLaunchCampaign={() => dispatch({ type: "step2_clicked" })}
    />
  );
}
```

Комментарий: `SignalTypeView` ожидает `scenarioId` в виде short-id ("registration"), а не `SignalType`. Adapter делает обратный маппинг. `createdAt` в существующем UI был `toLocaleDateString`, сохраняем формат.

- [ ] **Step 5: Обновить `src/sections/campaigns/campaigns-section.tsx`**

Заменить файл целиком:
```tsx
"use client";

import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { CampaignTypeView } from "./campaign-type-view";

export function CampaignsSection({ mode }: { mode: "guided" | "standalone" }) {
  const { signals, campaigns } = useAppState();
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

  const launched =
    campaigns.find((c) => c.status === "active" || c.status === "completed") ?? null;

  return (
    <CampaignTypeView
      onSelect={(id, name) =>
        dispatch({ type: "campaign_selected", campaign: { id, name } })
      }
      noSignal={signals.length === 0}
      campaign={
        launched
          ? {
              typeName: launched.name,
              launchedAt: launched.launchedAt
                ? new Date(launched.launchedAt).toLocaleDateString("ru-RU")
                : new Date(launched.createdAt).toLocaleDateString("ru-RU"),
            }
          : null
      }
    />
  );
}
```

- [ ] **Step 6: Обновить `src/sections/campaigns/workflow-section.tsx`**

Заменить файл целиком:
```tsx
"use client";

import { useCallback } from "react";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { WorkflowView } from "./workflow-view";

const TYPE_TO_SCENARIO: Record<string, string> = {
  "Регистрация": "registration",
  "Первая сделка": "first-deal",
  "Апсейл": "upsell",
  "Удержание": "retention",
  "Возврат": "return",
  "Реактивация": "reactivation",
};

export function WorkflowSection() {
  const { view, workflowCommand, signals, campaigns } = useAppState();
  const dispatch = useAppDispatch();

  const handleCommandHandled = useCallback(
    () => dispatch({ type: "workflow_command_handled" }),
    [dispatch]
  );

  if (view.kind !== "workflow") return null;

  const currentCampaign = campaigns.find((c) => c.id === view.campaign.id) ?? null;
  const currentSignal = currentCampaign
    ? signals.find((s) => s.id === currentCampaign.signalId) ?? null
    : signals[signals.length - 1] ?? null;
  const scenarioId = currentSignal ? TYPE_TO_SCENARIO[currentSignal.type] ?? "registration" : null;
  const signalFileName = scenarioId ? `сигнал_${scenarioId}.json` : undefined;

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

Комментарий: если `view.campaign.id` не найден в `campaigns` (может случиться до Task 5, когда мы ещё не диспатчим `campaign_created`), fallback на последний добавленный сигнал. После Task 5 этот fallback всё ещё безопасен.

- [ ] **Step 7: Обновить `src/sections/shell/shell-bottom-bar.tsx`**

В файле три точечные правки.

**Правка 1 — добавить константу маппинга в начало файла после импортов** (после строки `import { ... } from "@/state/app-state";` примерно на строке 29):

```tsx
const TYPE_TO_SCENARIO: Record<string, string> = {
  "Регистрация": "registration",
  "Первая сделка": "first-deal",
  "Апсейл": "upsell",
  "Удержание": "retention",
  "Возврат": "return",
  "Реактивация": "reactivation",
};
```

**Правка 2 — заменить чтение старого `state.signal` на derivation от массива** (примерно строки 77-78):

Было:
```tsx
const { view, signal } = state;
const signalScenarioId = signal?.scenarioId ?? "";
```

Стало:
```tsx
const { view, signals } = state;
const latestSignal = signals.length > 0 ? signals[signals.length - 1] : null;
const signalScenarioId = latestSignal ? TYPE_TO_SCENARIO[latestSignal.type] ?? "" : "";
```

**Правка 3 — заменить dispatch `campaign_launched` на `campaign_created`** (примерно строки 121-126):

Было:
```tsx
onClick={() =>
  dispatch({
    type: "campaign_launched",
    typeName: view.campaign.name,
    launchedAt: new Date().toLocaleDateString("ru-RU"),
  })
}
```

Стало:
```tsx
onClick={() => {
  const now = new Date().toISOString();
  dispatch({
    type: "campaign_created",
    campaign: {
      id: view.campaign.id,
      name: view.campaign.name,
      signalId: latestSignal?.id ?? "",
      status: "active",
      createdAt: now,
      launchedAt: now,
    },
  });
}}
```

Комментарий: reducer для `campaign_created` с `status: "active"` сам поднимает флаг `launched: true` на view, если id совпадает (см. Task 3 Step 1). `signalId: latestSignal?.id ?? ""` — связываем кампанию с последним созданным сигналом; если сигналов нет (теоретически возможно, если попасть на workflow view другим путём) — пустая строка.

- [ ] **Step 8: Прогнать unit-тесты + Playwright smoke**

Run:
```bash
npm test
```
Expected: все unit-тесты из Task 2 проходят.

Run:
```bash
npm run test:e2e
```
Expected: Playwright happy-path проходит (1 passed).

Если что-то падает:
- `npm run lint` — починить TS/ESLint ошибки
- Прочитать trace теста в `test-results/`, найти шаг где ломается, залезть в компонент и исправить adapter.
- НЕ править сам тест, кроме случая когда он изначально был неточен.

- [ ] **Step 9: Commit**

```bash
git add src/state/app-state.ts src/sections/signals/signals-section.tsx src/sections/signals/guided-signal-section.tsx src/sections/campaigns/campaigns-section.tsx src/sections/campaigns/workflow-section.tsx src/sections/shell/shell-bottom-bar.tsx
git commit -m "refactor: migrate state to typed collections, add section adapters"
```

---

## Task 4: Preset system + unit-тесты

**Цель:** создать `src/state/presets.ts` с seeded-генератором, покрыть unit-тестами.

**Files:**
- Create: `src/state/presets.ts`
- Create: `src/state/presets.test.ts`

- [ ] **Step 1: Написать `src/state/presets.ts`**

Content:
```ts
import { nanoid } from "nanoid";
import type {
  Campaign,
  CampaignStatus,
  Preset,
  Signal,
  SignalType,
} from "./app-state";

const SIGNAL_TYPES: SignalType[] = [
  "Регистрация",
  "Первая сделка",
  "Апсейл",
  "Реактивация",
  "Возврат",
  "Удержание",
];

const PRETTY_NAMES = [
  "Летний апсейл премиум",
  "Возврат Q2",
  "Реактивация спящих",
  "Первая сделка — старт",
  "Регистрация онбординг",
  "Удержание VIP",
  "Апсейл флагман",
  "Возврат после месяца тишины",
];

const DAY_MS = 24 * 60 * 60 * 1000;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rndInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function rndPick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function rndPastDate(rng: () => number, spanDays: number, now: number): string {
  const offset = Math.floor(rng() * spanDays * DAY_MS);
  return new Date(now - offset).toISOString();
}

function rndFutureDate(rng: () => number, spanDays: number, now: number): string {
  const offset = Math.floor(rng() * spanDays * DAY_MS);
  return new Date(now + offset).toISOString();
}

function splitSegments(count: number, rng: () => number): Signal["segments"] {
  const weights = [rng(), rng(), rng(), rng()];
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const max = Math.floor((count * weights[0]) / total);
  const high = Math.floor((count * weights[1]) / total);
  const mid = Math.floor((count * weights[2]) / total);
  const low = count - max - high - mid;
  return { max, high, mid, low };
}

export type PresetKey = "empty" | "mid" | "full";

type GenerateSignalsOpts = {
  count: number;
  seed: number;
  countRange: [number, number];
  dateSpanDays: number;
  now: number;
};

export function generateSignals(opts: GenerateSignalsOpts): Signal[] {
  const rng = mulberry32(opts.seed);
  const out: Signal[] = [];
  for (let i = 0; i < opts.count; i++) {
    const type = SIGNAL_TYPES[i % SIGNAL_TYPES.length];
    const count = rndInt(rng, opts.countRange[0], opts.countRange[1]);
    const createdAt = rndPastDate(rng, opts.dateSpanDays, opts.now);
    const updatedAt = rndPastDate(rng, opts.dateSpanDays, opts.now);
    out.push({
      id: `sig_${nanoid(6)}_${i}`,
      type,
      count,
      segments: splitSegments(count, rng),
      createdAt,
      updatedAt,
    });
  }
  return out;
}

type GenerateCampaignsOpts = {
  seed: number;
  signals: Signal[];
  distribution: Record<CampaignStatus, number>;
  dateSpanDays: number;
  now: number;
};

export function generateCampaigns(opts: GenerateCampaignsOpts): Campaign[] {
  const rng = mulberry32(opts.seed);
  const statuses: CampaignStatus[] = [];
  (Object.keys(opts.distribution) as CampaignStatus[]).forEach((status) => {
    for (let i = 0; i < opts.distribution[status]; i++) statuses.push(status);
  });
  // shuffle deterministically
  for (let i = statuses.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [statuses[i], statuses[j]] = [statuses[j], statuses[i]];
  }

  const out: Campaign[] = [];
  let prettyUsed = 0;
  statuses.forEach((status, idx) => {
    const signal = rndPick(rng, opts.signals);
    const usePretty = rng() < 0.2 && prettyUsed < PRETTY_NAMES.length;
    const name = usePretty
      ? PRETTY_NAMES[prettyUsed++]
      : `${signal.type} #${idx + 1}`;
    const createdAt = rndPastDate(rng, opts.dateSpanDays, opts.now);
    const campaign: Campaign = {
      id: `cmp_${nanoid(6)}_${idx}`,
      name,
      signalId: signal.id,
      status,
      createdAt,
    };
    if (status === "active") {
      campaign.launchedAt = rndPastDate(rng, 30, opts.now);
    }
    if (status === "completed") {
      campaign.launchedAt = rndPastDate(rng, opts.dateSpanDays, opts.now);
      campaign.completedAt = rndPastDate(rng, 30, opts.now);
    }
    if (status === "scheduled") {
      campaign.scheduledFor = rndFutureDate(rng, 30, opts.now);
    }
    out.push(campaign);
  });
  return out;
}

function buildPresets(): Record<PresetKey, Preset> {
  const now = Date.now();

  const midSignals = generateSignals({
    count: 5,
    seed: 0x5eed,
    countRange: [500, 8000],
    dateSpanDays: 30,
    now,
  });
  const midCampaigns = generateCampaigns({
    seed: 0xcafe,
    signals: midSignals,
    distribution: { active: 3, completed: 3, scheduled: 2, draft: 2 },
    dateSpanDays: 30,
    now,
  });

  const fullSignals = generateSignals({
    count: 30,
    seed: 0xb16b00b5,
    countRange: [500, 50000],
    dateSpanDays: 90,
    now,
  });
  const fullCampaigns = generateCampaigns({
    seed: 0xf00d,
    signals: fullSignals,
    distribution: { active: 10, completed: 10, scheduled: 6, draft: 6 },
    dateSpanDays: 90,
    now,
  });

  return {
    empty: { key: "empty", label: "Empty", signals: [], campaigns: [] },
    mid: { key: "mid", label: "Mid", signals: midSignals, campaigns: midCampaigns },
    full: { key: "full", label: "Full", signals: fullSignals, campaigns: fullCampaigns },
  };
}

export const PRESETS: Record<PresetKey, Preset> = buildPresets();
```

- [ ] **Step 2: Написать unit-тесты `src/state/presets.test.ts`**

Content:
```ts
import { describe, it, expect } from "vitest";
import { PRESETS, generateSignals, generateCampaigns } from "./presets";

describe("PRESETS.empty", () => {
  it("has no signals and no campaigns", () => {
    expect(PRESETS.empty.signals).toHaveLength(0);
    expect(PRESETS.empty.campaigns).toHaveLength(0);
  });
});

describe("PRESETS.mid", () => {
  it("has 5 signals", () => {
    expect(PRESETS.mid.signals).toHaveLength(5);
  });

  it("has 10 campaigns with expected status distribution", () => {
    expect(PRESETS.mid.campaigns).toHaveLength(10);
    const counts = { draft: 0, scheduled: 0, active: 0, completed: 0 };
    for (const c of PRESETS.mid.campaigns) counts[c.status]++;
    expect(counts).toEqual({ active: 3, completed: 3, scheduled: 2, draft: 2 });
  });

  it("all campaign signalIds reference existing signals", () => {
    const signalIds = new Set(PRESETS.mid.signals.map((s) => s.id));
    for (const c of PRESETS.mid.campaigns) {
      expect(signalIds.has(c.signalId)).toBe(true);
    }
  });
});

describe("PRESETS.full", () => {
  it("has 30 signals", () => {
    expect(PRESETS.full.signals).toHaveLength(30);
  });

  it("has 32 campaigns with expected status distribution", () => {
    expect(PRESETS.full.campaigns).toHaveLength(32);
    const counts = { draft: 0, scheduled: 0, active: 0, completed: 0 };
    for (const c of PRESETS.full.campaigns) counts[c.status]++;
    expect(counts).toEqual({ active: 10, completed: 10, scheduled: 6, draft: 6 });
  });
});

describe("generateSignals", () => {
  it("produces count signals with valid shape", () => {
    const signals = generateSignals({
      count: 3,
      seed: 42,
      countRange: [100, 500],
      dateSpanDays: 30,
      now: Date.UTC(2026, 3, 18),
    });
    expect(signals).toHaveLength(3);
    for (const s of signals) {
      expect(s.count).toBeGreaterThanOrEqual(100);
      expect(s.count).toBeLessThanOrEqual(500);
      const sum = s.segments.max + s.segments.high + s.segments.mid + s.segments.low;
      expect(sum).toBe(s.count);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = generateSignals({
      count: 5,
      seed: 123,
      countRange: [100, 200],
      dateSpanDays: 10,
      now: 0,
    });
    const b = generateSignals({
      count: 5,
      seed: 123,
      countRange: [100, 200],
      dateSpanDays: 10,
      now: 0,
    });
    expect(a.map((s) => s.count)).toEqual(b.map((s) => s.count));
  });
});

describe("generateCampaigns", () => {
  it("sets launchedAt for active campaigns", () => {
    const signals = generateSignals({
      count: 2,
      seed: 1,
      countRange: [100, 200],
      dateSpanDays: 10,
      now: Date.UTC(2026, 3, 18),
    });
    const campaigns = generateCampaigns({
      seed: 2,
      signals,
      distribution: { active: 2, completed: 0, scheduled: 0, draft: 0 },
      dateSpanDays: 10,
      now: Date.UTC(2026, 3, 18),
    });
    for (const c of campaigns) {
      expect(c.status).toBe("active");
      expect(c.launchedAt).toBeDefined();
    }
  });

  it("sets scheduledFor in the future for scheduled campaigns", () => {
    const now = Date.UTC(2026, 3, 18);
    const signals = generateSignals({
      count: 1,
      seed: 1,
      countRange: [100, 200],
      dateSpanDays: 10,
      now,
    });
    const campaigns = generateCampaigns({
      seed: 2,
      signals,
      distribution: { active: 0, completed: 0, scheduled: 3, draft: 0 },
      dateSpanDays: 10,
      now,
    });
    for (const c of campaigns) {
      expect(c.status).toBe("scheduled");
      expect(c.scheduledFor).toBeDefined();
      expect(new Date(c.scheduledFor!).getTime()).toBeGreaterThan(now);
    }
  });
});
```

- [ ] **Step 3: Прогнать тесты**

Run:
```bash
npm test
```
Expected: все тесты проходят (включая reducer-тесты из Task 2).

- [ ] **Step 4: Commit**

```bash
git add src/state/presets.ts src/state/presets.test.ts
git commit -m "feat: add seeded preset generator for dev state switching"
```

---

## Task 5: Дев-хоткей (hook)

**Цель:** изолированный хук, слушает Cmd/Ctrl+Shift+D и зовёт переданный callback.

**Files:**
- Create: `src/components/dev/use-dev-hotkey.ts`

- [ ] **Step 1: Написать хук**

Content:
```ts
"use client";

import { useEffect } from "react";

export function useDevHotkey(toggle: () => void) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dev/use-dev-hotkey.ts
git commit -m "feat: add Cmd+Shift+D hotkey hook for dev panel"
```

---

## Task 6: Дев-панель (UI-компонент)

**Цель:** компонент `DevPanel`, который рендерится при `open=true`, показывает 3 пресета, применяет через dispatch, сохраняет выбор в localStorage.

**Files:**
- Create: `src/components/dev/dev-panel.tsx`

- [ ] **Step 1: Написать компонент**

Content:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { PRESETS, type PresetKey } from "@/state/presets";
import { cn } from "@/lib/utils";
import { useDevHotkey } from "./use-dev-hotkey";

const STORAGE_KEY = "afina.dev.preset";
const KEYS: PresetKey[] = ["empty", "mid", "full"];

export function DevPanel() {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<PresetKey>("empty");
  const { signals, campaigns } = useAppState();
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "empty" || saved === "mid" || saved === "full") {
      setActiveKey(saved);
      dispatch({ type: "preset_applied", preset: PRESETS[saved] });
    }
  }, [dispatch]);

  useDevHotkey(() => setOpen((o) => !o));

  function apply(key: PresetKey) {
    window.localStorage.setItem(STORAGE_KEY, key);
    setActiveKey(key);
    dispatch({ type: "preset_applied", preset: PRESETS[key] });
  }

  function clear() {
    window.localStorage.removeItem(STORAGE_KEY);
    setActiveKey("empty");
    dispatch({ type: "preset_applied", preset: PRESETS.empty });
  }

  if (!open) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[260px] rounded-[10px] border border-[#2a2a2a] bg-[#161616] p-[14px] shadow-[0_8px_24px_rgba(0,0,0,0.5)] text-[#e5e5e5]">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#888]">
          Dev · состояние
        </div>
        <button
          type="button"
          aria-label="Закрыть дев-панель"
          onClick={() => setOpen(false)}
          className="text-[14px] leading-none text-[#666] transition-colors hover:text-[#aaa]"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {KEYS.map((key) => {
          const preset = PRESETS[key];
          const isActive = activeKey === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => apply(key)}
              className={cn(
                "flex items-center justify-between rounded-md border px-3 py-2.5 text-left text-[13px] transition-colors",
                isActive
                  ? "border-[#4ade80] bg-[#1a2e1f]"
                  : "border-[#2a2a2a] bg-[#1e1e1e] hover:bg-[#242424]"
              )}
            >
              <span>{preset.label}</span>
              <span
                className={cn(
                  "text-[11px]",
                  isActive ? "text-[#4ade80]" : "text-[#666]"
                )}
              >
                {preset.signals.length} · {preset.campaigns.length}
                {isActive ? " ✓" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[#1f1f1f] pt-2.5">
        <span className="text-[10px] text-[#555]">
          signals: {signals.length} · campaigns: {campaigns.length}
        </span>
        <button
          type="button"
          onClick={clear}
          className="text-[11px] text-[#888] transition-colors hover:text-[#aaa]"
        >
          очистить ↻
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dev/dev-panel.tsx
git commit -m "feat: add dev panel component with preset switcher"
```

---

## Task 7: Монтаж в page.tsx + production guard

**Цель:** отрендерить DevPanel в `src/app/page.tsx`, обернуть в `process.env.NODE_ENV === "development"` — чтобы в prod-бандле панель не появлялась.

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Добавить импорт и рендер**

Найти в `src/app/page.tsx` блок импортов и добавить **в конец** списка импортов:
```tsx
import { DevPanel } from "@/components/dev/dev-panel";
```

Затем найти блок:
```tsx
<div className="relative flex flex-1 flex-col overflow-hidden">
  {renderMain()}
  <ShellBottomBar />
</div>
```

Заменить на:
```tsx
<div className="relative flex flex-1 flex-col overflow-hidden">
  {renderMain()}
  <ShellBottomBar />
  {process.env.NODE_ENV === "development" && <DevPanel />}
</div>
```

- [ ] **Step 2: Проверить dev-сборку вручную**

Run (в отдельном терминале):
```bash
npm run dev
```

Открыть http://localhost:3000. На Welcome нажать **Cmd+Shift+D** (или Ctrl+Shift+D). Ожидаемо: в правом нижнем углу появляется панель с 3 кнопками «Empty / Mid / Full».

Проверить по шагам:
1. Кликнуть «Mid» → в счётчике внизу панели появится «signals: 5 · campaigns: 10».
2. Перейти через сайдбар на «Сигналы» → экран не сбрасывается, панель остаётся активной («Mid» подсвечен).
3. Перезагрузить страницу (Cmd+R) → приложение остаётся с Mid-пресетом (signals: 5, campaigns: 10).
4. Нажать «очистить ↻» → счётчик становится 0·0, панель показывает активным «Empty», localStorage ключ удалён (проверить в DevTools → Application → Local Storage).
5. Нажать Cmd+Shift+D → панель закрывается.
6. Нажать снова → открывается.

Остановить сервер (Ctrl+C).

- [ ] **Step 3: Проверить production-бандл (tree-shake)**

Run:
```bash
npm run build
```
Expected: сборка проходит без ошибок.

Run:
```bash
grep -r "afina.dev.preset" .next/static/ 2>/dev/null | head -5
```
Expected: пусто (строка не найдена). Это значит DevPanel элиминирован из prod-бандла.

Если строка найдена в бандле — Next.js не выполнил dead-code elimination. Проверить, что в `page.tsx` используется именно `process.env.NODE_ENV === "development"` точно так, как указано (compile-time константа). Если нужен более жёсткий guard, заменить на dynamic import — но для начала достаточно такого подхода.

- [ ] **Step 4: Прогнать Playwright smoke**

Run:
```bash
npm run test:e2e
```
Expected: 1 passed. Панель не должна мешать тесту — она закрыта по умолчанию.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: mount DevPanel in page.tsx (dev-only)"
```

---

## Task 8: Финальная валидация

**Цель:** полный прогон линтера, unit-тестов, e2e и production-сборки. Фиксация любых последних проблем.

- [ ] **Step 1: Lint**

Run:
```bash
npm run lint
```
Expected: 0 errors, 0 warnings.

- [ ] **Step 2: Unit-тесты**

Run:
```bash
npm test
```
Expected: все файлы (`app-state.test.ts`, `presets.test.ts`) — тесты проходят.

- [ ] **Step 3: E2E**

Run:
```bash
npm run test:e2e
```
Expected: 1 passed.

- [ ] **Step 4: Production build**

Run:
```bash
npm run build
```
Expected: сборка проходит без ошибок и предупреждений от TypeScript.

- [ ] **Step 5: Commit если правился lint/build**

Если Step 1-4 чистые, пропустить коммит.

Если правились файлы после ошибок:
```bash
git add -A
git commit -m "fix: resolve lint/build issues in typed-collections migration"
```

---

## Post-plan: дальнейшие шаги

После этого плана блок **A + A.5** закрыт. Следующий блок — **B: Экраны-списки** (Сигналы / Кампании карточки, empty states, «+ Новый сигнал» dropdown). Он отдельной спекой и отдельным планом. Adapter-слой из Task 3 Step 4-6 удаляется в блоке B.

**Что обновить в памяти после имплементации:**
- `memory/project_afina_18_04_roadmap.md` — отметить A + A.5 как `implemented: yes`.
- `memory/project_afina.md` — обновить раздел про stack (добавить vitest в тестовый стек).
