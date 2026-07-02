# PromptBar в Статистике: три зашитых запроса — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подключить три hard-coded запроса в PromptBar, срабатывающие только в разделе «Статистика»: инлайн-перегруппировка по одной оси, композитный 4-польный патч, drawer с chain-of-thoughts.

**Architecture:** Снизу вверх. Сначала поднимаем `applied` StatisticsFilters в AppState (рефакторинг без новой функциональности), затем чистая функция матчинга с TDD, затем параметризованный chat-helper, затем подключение в обработчики submit, в конце — чипы под баром. Каждая задача — атомарный коммит; после каждой `npm test` и `npm run lint` зелёные.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, vitest (reducer + pure-function тесты), motion/react.

**Spec:** `docs/superpowers/specs/2026-05-21-statistics-promptbar-hardcoded-queries-design.md`
**Ветка/воркстри:** `feature/stats-promptbar-queries` / `.worktrees/stats-promptbar-queries`

---

## File Structure

**Create:**
- `src/lib/stats-query-matcher.ts` — нормализация + матчер 3 запросов + `STATS_DEMO_YEAR`
- `src/lib/stats-query-matcher.test.ts` — TDD-юнит-тесты матчера

**Modify:**
- `src/state/app-state.ts` — поле `stats: StatisticsFilters`, 12 action-типов (`stats_*`), хелпер `isOnStatisticsSection`
- `src/state/app-state.test.ts` — тесты на новые action-кейсы
- `src/sections/statistics/statistics-view.tsx` — `applied` из AppState, `useEffect`-ресинк локального `draft`, обновлённые `handleSave`/`handleTemplateSelect`/`PeriodField.onChange`
- `src/lib/complex-thinking-demo.ts` — разделить экспорты на `_SIGNAL` и добавить `_STATS`
- `src/sections/shell/use-chat-submit.ts` — параметризовать `playComplexThinking`, добавить ветку `runStatsQuery` со скоупингом по секции
- `src/sections/shell/shell-bottom-bar.tsx` — подключить `useChatSubmit` для Statistics-ветки в `handlePromptSubmit`, передать `isStatistics` в SuggestionBar, реализовать `onPickStatsQuery` (set + autosubmit)
- `src/state/suggestion-state.ts` — добавить параметр `isStatistics` + state `stats`
- `src/state/suggestion-state.test.ts` — новые кейсы для `isStatistics`
- `src/sections/shell/suggestion-bar.tsx` — ветка `state.kind === "stats"` с 3 чипами, проп `onPickStatsQuery`

---

## Task 0: Создать worktree

**Files:** none (setup)

- [ ] **Step 1: Создать worktree и ветку**

Run из корня репозитория (`/Users/macintosh/Documents/work/afina-ai-first`):

```bash
git worktree add .worktrees/stats-promptbar-queries -b feature/stats-promptbar-queries main
cd .worktrees/stats-promptbar-queries
npm install
```

- [ ] **Step 2: Убедиться, что baseline зелёный**

```bash
npm test
npm run lint
```

Expected: оба зелёные.

**Все последующие шаги выполняются внутри `.worktrees/stats-promptbar-queries/`.**

---

# ФАЗА 1 — Поднять `applied` в AppState (рефакторинг)

## Task 1: Добавить `stats` slice в AppState (TDD)

**Files:**
- Modify: `src/state/app-state.ts`
- Modify: `src/state/app-state.test.ts`

- [ ] **Step 1: Написать failing-тесты для всех 12 action-кейсов**

Добавить в конец `src/state/app-state.test.ts`:

```ts
import {
  DEFAULT_FILTERS,
  type StatisticsFilters,
} from "@/sections/statistics/statistics-state";
import { isOnStatisticsSection } from "./app-state";

describe("appReducer — stats slice", () => {
  it("initialState.stats equals DEFAULT_FILTERS", () => {
    expect(initialState.stats).toEqual(DEFAULT_FILTERS);
  });

  it("stats_set_period replaces period", () => {
    const next = appReducer(initialState, {
      type: "stats_set_period",
      period: { preset: "custom", from: "2026-06-01", to: "2026-06-30" },
    });
    expect(next.stats.period).toEqual({
      preset: "custom",
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });

  it("stats_set_calc_method changes calcMethod", () => {
    const next = appReducer(initialState, {
      type: "stats_set_calc_method",
      method: "cohort",
    });
    expect(next.stats.calcMethod).toBe("cohort");
  });

  it("stats_set_currency changes currency", () => {
    const next = appReducer(initialState, {
      type: "stats_set_currency",
      currency: "usd",
    });
    expect(next.stats.currency).toBe("usd");
  });

  it("stats_set_rows changes rows", () => {
    const next = appReducer(initialState, {
      type: "stats_set_rows",
      rows: "campaigns",
    });
    expect(next.stats.rows).toBe("campaigns");
  });

  it("stats_set_row_count changes rowCount", () => {
    const next = appReducer(initialState, {
      type: "stats_set_row_count",
      count: 10,
    });
    expect(next.stats.rowCount).toBe(10);
  });

  it("stats_set_sub_rows changes subRows", () => {
    const next = appReducer(initialState, {
      type: "stats_set_sub_rows",
      subRows: "none",
    });
    expect(next.stats.subRows).toBe("none");
  });

  it("stats_toggle_column removes existing column", () => {
    const next = appReducer(initialState, {
      type: "stats_toggle_column",
      column: "income",
    });
    expect(next.stats.columns).not.toContain("income");
  });

  it("stats_toggle_column adds missing column", () => {
    const state: AppState = {
      ...initialState,
      stats: { ...initialState.stats, columns: ["approves"] },
    };
    const next = appReducer(state, { type: "stats_toggle_column", column: "ar" });
    expect(next.stats.columns).toContain("ar");
  });

  it("stats_reorder_columns replaces columns array", () => {
    const next = appReducer(initialState, {
      type: "stats_reorder_columns",
      columns: ["ar", "rr"],
    });
    expect(next.stats.columns).toEqual(["ar", "rr"]);
  });

  it("stats_set_condition sets include scope", () => {
    const next = appReducer(initialState, {
      type: "stats_set_condition",
      scope: "include",
      entity: "campaigns",
      values: ["cmp_1", "cmp_2"],
    });
    expect(next.stats.conditions.include.campaigns).toEqual(["cmp_1", "cmp_2"]);
  });

  it("stats_set_sort sets sort", () => {
    const next = appReducer(initialState, {
      type: "stats_set_sort",
      sort: { column: "income", direction: "desc" },
    });
    expect(next.stats.sort).toEqual({ column: "income", direction: "desc" });
  });

  it("stats_reset replaces entire filters", () => {
    const custom: StatisticsFilters = {
      ...DEFAULT_FILTERS,
      rows: "campaigns",
      rowCount: 5,
    };
    const next = appReducer(initialState, { type: "stats_reset", filters: custom });
    expect(next.stats).toEqual(custom);
  });

  it("stats_apply_patch merges multiple fields at once", () => {
    const next = appReducer(initialState, {
      type: "stats_apply_patch",
      patch: {
        rows: "campaigns",
        sort: { column: "income", direction: "desc" },
        rowCount: 10,
      },
    });
    expect(next.stats.rows).toBe("campaigns");
    expect(next.stats.sort).toEqual({ column: "income", direction: "desc" });
    expect(next.stats.rowCount).toBe(10);
    // Untouched fields preserved
    expect(next.stats.currency).toBe(DEFAULT_FILTERS.currency);
  });
});

describe("isOnStatisticsSection", () => {
  it("true when view is section Статистика", () => {
    const state: AppState = {
      ...initialState,
      view: { kind: "section", name: "Статистика" },
    };
    expect(isOnStatisticsSection(state)).toBe(true);
  });

  it("false for other sections", () => {
    const state: AppState = {
      ...initialState,
      view: { kind: "section", name: "Сигналы" },
    };
    expect(isOnStatisticsSection(state)).toBe(false);
  });

  it("false for non-section views", () => {
    expect(isOnStatisticsSection(initialState)).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить тесты — падают**

```bash
npm test -- app-state
```

Expected: FAIL — `stats` отсутствует в AppState, action-типы неизвестны.

- [ ] **Step 3: Расширить AppState и Action в `src/state/app-state.ts`**

В начале файла, рядом с другими импортами:

```ts
import {
  DEFAULT_FILTERS,
  statisticsReducer,
  type StatisticsFilters,
  type Period,
  type CalcMethod,
  type Currency,
  type RowKind,
  type ColumnKey,
  type SortState,
} from "@/sections/statistics/statistics-state";
```

В `AppState` добавить поле перед `// ----- shared state slices added by data-foundations -----` или в любом разумном месте:

```ts
export type AppState = {
  ...
  // Owned by stats-promptbar-queries: filters for the Statistics view
  stats: StatisticsFilters;
  ...
};
```

В `initialState` добавить:

```ts
export const initialState: AppState = {
  ...
  stats: DEFAULT_FILTERS,
  ...
};
```

В `Action`-юнион добавить 12 новых вариантов (рядом с другими action-типами):

```ts
export type Action =
  ...существующие
  | { type: "stats_set_period"; period: Period }
  | { type: "stats_set_calc_method"; method: CalcMethod }
  | { type: "stats_set_currency"; currency: Currency }
  | { type: "stats_set_rows"; rows: RowKind }
  | { type: "stats_set_row_count"; count: number }
  | { type: "stats_set_sub_rows"; subRows: RowKind | "none" }
  | { type: "stats_toggle_column"; column: ColumnKey }
  | { type: "stats_reorder_columns"; columns: ColumnKey[] }
  | { type: "stats_set_condition"; scope: "include" | "exclude"; entity: string; values: string[] }
  | { type: "stats_set_sort"; sort: SortState | null }
  | { type: "stats_reset"; filters: StatisticsFilters }
  | { type: "stats_apply_patch"; patch: Partial<StatisticsFilters> };
```

- [ ] **Step 4: Добавить кейсы в `appReducer`**

Внутри `switch (action.type)` добавить 12 кейсов перед `// PARALLEL-WORTREE INSERTION POINT`. Используем существующий `statisticsReducer` чтобы не дублировать логику — он принимает `StatisticsFilters` и идентичный набор action-типов с UPPERCASE-вариантами. Маппим:

```ts
case "stats_set_period":
  return { ...state, stats: statisticsReducer(state.stats, { type: "SET_PERIOD", period: action.period }) };
case "stats_set_calc_method":
  return { ...state, stats: statisticsReducer(state.stats, { type: "SET_CALC_METHOD", method: action.method }) };
case "stats_set_currency":
  return { ...state, stats: statisticsReducer(state.stats, { type: "SET_CURRENCY", currency: action.currency }) };
case "stats_set_rows":
  return { ...state, stats: statisticsReducer(state.stats, { type: "SET_ROWS", rows: action.rows }) };
case "stats_set_row_count":
  return { ...state, stats: statisticsReducer(state.stats, { type: "SET_ROW_COUNT", count: action.count }) };
case "stats_set_sub_rows":
  return { ...state, stats: statisticsReducer(state.stats, { type: "SET_SUB_ROWS", subRows: action.subRows }) };
case "stats_toggle_column":
  return { ...state, stats: statisticsReducer(state.stats, { type: "TOGGLE_COLUMN", column: action.column }) };
case "stats_reorder_columns":
  return { ...state, stats: statisticsReducer(state.stats, { type: "REORDER_COLUMNS", columns: action.columns }) };
case "stats_set_condition":
  return { ...state, stats: statisticsReducer(state.stats, { type: "SET_CONDITION", scope: action.scope, entity: action.entity, values: action.values }) };
case "stats_set_sort":
  return { ...state, stats: statisticsReducer(state.stats, { type: "SET_SORT", sort: action.sort }) };
case "stats_reset":
  return { ...state, stats: statisticsReducer(state.stats, { type: "RESET", filters: action.filters }) };
case "stats_apply_patch":
  return { ...state, stats: { ...state.stats, ...action.patch } };
```

- [ ] **Step 5: Добавить хелпер `isOnStatisticsSection`**

В `src/state/app-state.ts` рядом с другими селекторами (`isSignalDone`, `isCampaignDone` и т.д.):

```ts
export const isOnStatisticsSection = (s: AppState): boolean =>
  s.view.kind === "section" && s.view.name === "Статистика";
```

- [ ] **Step 6: Запустить тесты — должны пройти**

```bash
npm test -- app-state
```

Expected: PASS — все 14 новых тестов зелёные.

- [ ] **Step 7: Lint + typecheck**

```bash
npm run lint
```

Expected: clean.

- [ ] **Step 8: Коммит**

```bash
git add src/state/app-state.ts src/state/app-state.test.ts
git commit -m "feat(state): add stats slice to AppState with 12 action types"
```

---

## Task 2: Перевести `StatisticsView` на `applied` из AppState

**Files:**
- Modify: `src/sections/statistics/statistics-view.tsx`

Эта задача — рефакторинг без новой функциональности. `applied` теперь живёт в AppState, локальный `draft` остаётся (нужен для commit-on-save в DrillInPopover'ах).

- [ ] **Step 1: Импортировать `useAppDispatch`**

В `src/sections/statistics/statistics-view.tsx` рядом с импортом `useAppState`:

```ts
import { useAppState, useAppDispatch } from "@/state/app-state-context";
```

- [ ] **Step 2: Заменить `useState<StatisticsFilters>(applied)` на чтение из AppState + ресинк draft**

Найти в `StatisticsView` (около строки 132):

```ts
  const [applied, setApplied] = useState<StatisticsFilters>(
    activeTemplate.filters,
  );
  const [draft, dispatch] = useReducer(
    statisticsReducer,
    activeTemplate.filters,
  );
```

Заменить на:

```ts
  const appDispatch = useAppDispatch();
  const applied = useAppState().stats;
  const [draft, dispatch] = useReducer(
    statisticsReducer,
    applied,
  );

  // Re-sync local draft when applied changes externally (e.g. from PromptBar).
  // Keeps DrillInPopover state consistent with whatever the table now shows.
  useEffect(() => {
    dispatch({ type: "RESET", filters: applied });
  }, [applied]);
```

Добавить импорт `useEffect`, если ещё нет:

```ts
import { Fragment, useEffect, useMemo, useReducer, useState } from "react";
```

- [ ] **Step 3: Обновить `handleSave`**

Найти:

```ts
  function handleSave() {
    setApplied(draft);
    setExpandedKeys(new Set());
  }
```

Заменить на:

```ts
  function handleSave() {
    appDispatch({ type: "stats_reset", filters: draft });
    setExpandedKeys(new Set());
  }
```

- [ ] **Step 4: Обновить `handleTemplateSelect`**

Найти:

```ts
  function handleTemplateSelect(id: string) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setActiveTemplateId(id);
    setApplied(tpl.filters);
    dispatch({ type: "RESET", filters: tpl.filters });
    setExpandedKeys(new Set());
    setTemplatePickerOpen(false);
  }
```

Заменить на:

```ts
  function handleTemplateSelect(id: string) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setActiveTemplateId(id);
    appDispatch({ type: "stats_reset", filters: tpl.filters });
    // Local draft will resync via useEffect once applied updates.
    setExpandedKeys(new Set());
    setTemplatePickerOpen(false);
  }
```

- [ ] **Step 5: Обновить `handleSaveTemplate`**

Найти:

```ts
  function handleSaveTemplate(name: string) {
    ...
    setTemplates((prev) => [...prev, tpl]);
    setActiveTemplateId(id);
    setApplied(draft);
    setExpandedKeys(new Set());
  }
```

Заменить `setApplied(draft);` на:

```ts
    appDispatch({ type: "stats_reset", filters: draft });
```

- [ ] **Step 6: Обновить `PeriodField.onChange`**

Найти:

```ts
        <PeriodField
          value={applied.period}
          onChange={(period) => {
            const next = { ...applied, period };
            setApplied(next);
            dispatch({ type: "SET_PERIOD", period });
            setExpandedKeys(new Set());
          }}
          triggerVariant="chip"
        />
```

Заменить на:

```ts
        <PeriodField
          value={applied.period}
          onChange={(period) => {
            appDispatch({ type: "stats_set_period", period });
            // Local draft resyncs via useEffect.
            setExpandedKeys(new Set());
          }}
          triggerVariant="chip"
        />
```

- [ ] **Step 7: Запустить тесты и линт**

```bash
npm test
npm run lint
```

Expected: всё зелёное (тесты `app-state` остаются valid, `StatisticsView` рефакторинг не имеет своих unit-тестов).

- [ ] **Step 8: Запустить дев-сервер и проверить вручную**

```bash
# Сначала освободить порт 3000 — главный чек-аут может быть на нём.
lsof -ti:3000 | xargs kill -9 2>/dev/null; true
npm run dev -- -p 3001 > /tmp/stats-dev.log 2>&1 &
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001
```

Expected: 200.

В браузере открыть `http://localhost:3001`, перейти в раздел «Статистика» (нужна хотя бы одна запущенная кампания — применить пресет «mid» или «full» через dev-панель), затем:

1. Открыть «Настройка вида» → поменять «Строки» с «Дни» на «Кампании» → нажать «Сохранить». Таблица должна перестроиться по кампаниям.
2. Открыть быстрый переключатель периода → выбрать «Этот месяц». Таблица обновляется.
3. Переключить шаблон отчёта в заголовке. Видимое состояние меняется.
4. Открыть DrillInPopover, поменять что-нибудь, **не** нажать «Сохранить», закрыть. dirty-индикатор должен исчезнуть, изменения не применились.

Если любое из этих действий ломается — откатить шаги и разобраться, прежде чем коммитить.

- [ ] **Step 9: Коммит**

```bash
git add src/sections/statistics/statistics-view.tsx
git commit -m "refactor(stats): read applied filters from AppState, keep draft local"
```

---

# ФАЗА 2 — Матчер запросов и chat-helper

## Task 3: Stats-query matcher (TDD)

**Files:**
- Create: `src/lib/stats-query-matcher.ts`
- Create: `src/lib/stats-query-matcher.test.ts`

- [ ] **Step 1: Написать failing-тесты**

Создать `src/lib/stats-query-matcher.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { matchStatsQuery, STATS_DEMO_YEAR } from "./stats-query-matcher";

describe("matchStatsQuery — group-by-campaigns (Q1)", () => {
  it("canonical phrase matches", () => {
    expect(matchStatsQuery("покажи по кампаниям")?.id).toBe("group-by-campaigns");
  });
  it("'покажи мне по кампаниям' matches", () => {
    expect(matchStatsQuery("покажи мне по кампаниям")?.id).toBe("group-by-campaigns");
  });
  it("'сгруппируй по кампаниям' matches", () => {
    expect(matchStatsQuery("сгруппируй по кампаниям")?.id).toBe("group-by-campaigns");
  });
  it("uppercase + ё matches", () => {
    expect(matchStatsQuery("ПОКАЖИ ПО КАМПАНИЯМ")?.id).toBe("group-by-campaigns");
  });
  it("'кампании' alone (no verb) does NOT match", () => {
    expect(matchStatsQuery("кампании")).toBeNull();
  });
});

describe("matchStatsQuery — top-campaigns-income-june (Q2)", () => {
  it("canonical phrase matches", () => {
    expect(matchStatsQuery("топ-10 кампаний по доходу за июнь")?.id).toBe("top-campaigns-income-june");
  });
  it("loose phrasing 'покажи топ кампаний по доходу в июне' matches", () => {
    expect(matchStatsQuery("покажи топ кампаний по доходу в июне")?.id).toBe("top-campaigns-income-june");
  });
  it("'top campaigns income june' (english) matches", () => {
    expect(matchStatsQuery("top campaigns income june")?.id).toBe("top-campaigns-income-june");
  });
  it("Q2 wins over Q1 (priority — Q2 listed first)", () => {
    expect(matchStatsQuery("топ-10 кампаний по доходу за июнь")?.id).toBe("top-campaigns-income-june");
  });
  it("без 'топ' falls through to Q1 if it matches Q1", () => {
    // "покажи кампании по доходу за июнь" — нет "топ", но есть "покажи" + "кампани"
    // → matches Q1 ('group-by-campaigns'), not Q2
    expect(matchStatsQuery("покажи кампании по доходу за июнь")?.id).toBe("group-by-campaigns");
  });
  it("без 'кампани' does NOT match Q2", () => {
    expect(matchStatsQuery("топ-10 по доходу за июнь")).toBeNull();
  });
  it("без 'июн' does NOT match Q2", () => {
    expect(matchStatsQuery("топ-10 кампаний по доходу")).toBeNull();
  });
  it("'июль' instead of 'июнь' does NOT match Q2", () => {
    expect(matchStatsQuery("топ-10 кампаний по доходу за июль")).toBeNull();
  });
});

describe("matchStatsQuery — compare-channels (Q3)", () => {
  it("canonical phrase matches", () => {
    expect(matchStatsQuery("сравни эффективность каналов")?.id).toBe("compare-channels");
  });
  it("'сравни каналы по эффективности' matches", () => {
    expect(matchStatsQuery("сравни каналы по эффективности")?.id).toBe("compare-channels");
  });
  it("без 'канал' does NOT match", () => {
    expect(matchStatsQuery("сравни эффективность")).toBeNull();
  });
  it("без 'сравни' does NOT match", () => {
    expect(matchStatsQuery("эффективность каналов")).toBeNull();
  });
});

describe("matchStatsQuery — normalization", () => {
  it("collapses whitespace", () => {
    expect(matchStatsQuery("покажи    по   кампаниям")?.id).toBe("group-by-campaigns");
  });
  it("strips punctuation", () => {
    expect(matchStatsQuery("покажи, по кампаниям!")?.id).toBe("group-by-campaigns");
  });
  it("treats ё as е", () => {
    expect(matchStatsQuery("сравнЁние каналов и эффективности")?.id).toBe("compare-channels");
  });
});

describe("matchStatsQuery — non-matches", () => {
  it("unrelated text returns null", () => {
    expect(matchStatsQuery("привет, как дела?")).toBeNull();
  });
  it("empty string returns null", () => {
    expect(matchStatsQuery("")).toBeNull();
  });
  it("whitespace-only returns null", () => {
    expect(matchStatsQuery("   ")).toBeNull();
  });
});

describe("STATS_DEMO_YEAR", () => {
  it("equals 2026", () => {
    expect(STATS_DEMO_YEAR).toBe(2026);
  });
});
```

- [ ] **Step 2: Запустить тесты — падают**

```bash
npm test -- stats-query-matcher
```

Expected: FAIL — модуль не существует.

- [ ] **Step 3: Создать `src/lib/stats-query-matcher.ts`**

```ts
/**
 * Hard-coded matcher for the three Statistics-section PromptBar queries.
 * No LLM — three known intents, looser-than-exact matching via required
 * substring groups: each group must have at least one alternative present
 * in the normalized text for the query to match.
 *
 * Order of QUERIES matters: composite Q2 must be checked before generic Q1
 * to avoid stealing matches.
 */

export const STATS_DEMO_YEAR = 2026;

export type StatsQueryId =
  | "group-by-campaigns"
  | "top-campaigns-income-june"
  | "compare-channels";

export interface StatsQueryMatch {
  id: StatsQueryId;
}

interface StatsQueryDef {
  id: StatsQueryId;
  groups: string[][];
}

const QUERIES: StatsQueryDef[] = [
  {
    id: "top-campaigns-income-june",
    groups: [
      ["топ", "top"],
      ["кампани"],
      ["доход", "income", "выручк"],
      ["июн"],
    ],
  },
  {
    id: "compare-channels",
    groups: [
      ["сравни", "сравнить", "сравнение"],
      ["эффективност"],
      ["канал"],
    ],
  },
  {
    id: "group-by-campaigns",
    groups: [
      ["покажи", "показать", "сгруппируй", "группируй", "по разрезу"],
      ["кампани"],
    ],
  },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.,!?…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchStatsQuery(rawText: string): StatsQueryMatch | null {
  const text = normalize(rawText);
  if (!text) return null;

  for (const def of QUERIES) {
    const allGroupsMatch = def.groups.every((alternatives) =>
      alternatives.some((alt) => text.includes(alt))
    );
    if (allGroupsMatch) return { id: def.id };
  }
  return null;
}
```

- [ ] **Step 4: Запустить тесты — все зелёные**

```bash
npm test -- stats-query-matcher
```

Expected: PASS.

- [ ] **Step 5: Lint**

```bash
npm run lint
```

Expected: clean.

- [ ] **Step 6: Коммит**

```bash
git add src/lib/stats-query-matcher.ts src/lib/stats-query-matcher.test.ts
git commit -m "feat(lib): add stats-query-matcher for three hard-coded queries"
```

---

## Task 4: Разделить `complex-thinking-demo` на _SIGNAL/_STATS

**Files:**
- Modify: `src/lib/complex-thinking-demo.ts`
- Modify: `src/sections/shell/use-chat-submit.ts` (только импорты)

- [ ] **Step 1: Прочитать текущий файл**

```bash
cat src/lib/complex-thinking-demo.ts
```

- [ ] **Step 2: Заменить экспорты в `src/lib/complex-thinking-demo.ts`**

Переименовать `COMPLEX_THINKING_STEPS` → `COMPLEX_THINKING_STEPS_SIGNAL`, `COMPLEX_THINKING_FINAL_REPLY` → `COMPLEX_THINKING_FINAL_REPLY_SIGNAL`. Добавить два новых экспорта `*_STATS`. Заменить содержимое файла целиком:

```ts
// src/lib/complex-thinking-demo.ts

/**
 * Шаги chain-of-thoughts, которые проигрываются в drawer'е по hard-coded
 * сложным запросам. Каждый шаг — отдельный pending → resolve в чате;
 * финальное сообщение — короткий ответ модели.
 */
export interface ComplexThinkingStep {
  /** Текст, который "появляется" в pending пузыре. */
  reasoning: string;
  /** Сколько мс держать pending перед update_pending. */
  delayMs: number;
}

/**
 * Signal-section "сложный запрос" demo — exact-string match in non-Stats sections.
 */
export const COMPLEX_THINKING_STEPS_SIGNAL: ComplexThinkingStep[] = [
  { reasoning: "Анализирую запрос и доступные интересы…", delayMs: 600 },
  { reasoning: "Сравниваю текущие триггеры с целью кампании…", delayMs: 700 },
  { reasoning: "Определяю, нужно ли уточнить параметры или достаточно текущего контекста…", delayMs: 700 },
];

export const COMPLEX_THINKING_FINAL_REPLY_SIGNAL =
  "Я понял сложный запрос, поэтому задам дополнительный вопрос. Какие сегменты вы планируете включить — только горячие или ещё тёплые?";

/**
 * Statistics-section "сравни эффективность каналов" demo.
 * Triggered by stats-query-matcher when user is on the Statistics page.
 */
export const COMPLEX_THINKING_STEPS_STATS: ComplexThinkingStep[] = [
  {
    reasoning:
      "Запрос про сравнение эффективности каналов. Эффективность — неоднозначный термин.",
    delayMs: 700,
  },
  {
    reasoning:
      "Возможные интерпретации: конверсия (AR%), доход (Income), отношение Income/Expenses, отклик (Clicks/Sends).",
    delayMs: 900,
  },
  {
    reasoning:
      "Нужно уточнить у пользователя, какую метрику он имеет в виду.",
    delayMs: 700,
  },
];

export const COMPLEX_THINKING_FINAL_REPLY_STATS =
  "Я понял, что нужно сравнить каналы. Какую метрику использовать для оценки эффективности — конверсию, доход, ROI или отклик?";
```

- [ ] **Step 3: Обновить импорты в `src/sections/shell/use-chat-submit.ts`**

Заменить блок импорта:

```ts
import {
  COMPLEX_THINKING_FINAL_REPLY,
  COMPLEX_THINKING_STEPS,
} from "@/lib/complex-thinking-demo";
```

на:

```ts
import {
  COMPLEX_THINKING_FINAL_REPLY_SIGNAL,
  COMPLEX_THINKING_STEPS_SIGNAL,
} from "@/lib/complex-thinking-demo";
```

Также в теле `playComplexThinking` заменить две ссылки:
- `COMPLEX_THINKING_STEPS` → `COMPLEX_THINKING_STEPS_SIGNAL`
- `COMPLEX_THINKING_FINAL_REPLY` → `COMPLEX_THINKING_FINAL_REPLY_SIGNAL`

Это временный шаг, чтобы код собрался; Task 5 полностью перепишет `use-chat-submit.ts` с параметризацией.

- [ ] **Step 4: Тесты + линт**

```bash
npm test
npm run lint
```

Expected: всё зелёное (импорты только переименованы, поведение не изменилось).

- [ ] **Step 5: Коммит**

```bash
git add src/lib/complex-thinking-demo.ts src/sections/shell/use-chat-submit.ts
git commit -m "refactor(chat): split complex-thinking demo into _SIGNAL/_STATS"
```

---

# ФАЗА 3 — Wiring: use-chat-submit + ShellBottomBar

## Task 5: Параметризовать `playComplexThinking` и добавить Statistics-ветку

**Files:**
- Modify: `src/sections/shell/use-chat-submit.ts`

- [ ] **Step 1: Полностью переписать `src/sections/shell/use-chat-submit.ts`**

Заменить файл целиком следующим содержимым (комментарии сохраняем, поведение сигналов не трогаем):

```ts
"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@/state/chat-context";
import { useTriggerEdit } from "@/state/trigger-edit-context";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { isOnStatisticsSection } from "@/state/app-state";
import { mockReplyFor, mockReplyForFreeText } from "@/lib/mock-ai-reply";
import { parseTriggerCommand } from "@/lib/trigger-edit-parser";
import {
  COMPLEX_THINKING_FINAL_REPLY_SIGNAL,
  COMPLEX_THINKING_FINAL_REPLY_STATS,
  COMPLEX_THINKING_STEPS_SIGNAL,
  COMPLEX_THINKING_STEPS_STATS,
  type ComplexThinkingStep,
} from "@/lib/complex-thinking-demo";
import {
  matchStatsQuery,
  STATS_DEMO_YEAR,
  type StatsQueryId,
} from "@/lib/stats-query-matcher";
import type { ChatComposerSubmitPayload } from "./chat-composer";

const LIGHT_QUERY = "лёгкий запрос";
const HEAVY_QUERY = "сложный запрос";

/** Общий обработчик сабмита чата — используется и collapsed-баром, и drawer. */
export function useChatSubmit(): { submit: (payload: ChatComposerSubmitPayload) => void } {
  const chat = useChat();
  const triggerEdit = useTriggerEdit();
  const appState = useAppState();
  const appDispatch = useAppDispatch();
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

  function playComplexThinking(opts: {
    steps: ComplexThinkingStep[];
    finalReply: string;
  }) {
    chat.openSidebar();
    let cursor = 0;
    function nextStep() {
      if (cursor >= opts.steps.length) {
        chat.append({ role: "assistant", text: opts.finalReply });
        return;
      }
      const step = opts.steps[cursor++];
      const id = chat.append({ role: "assistant", text: "", pending: true });
      schedule(() => {
        chat.updatePending(id, step.reasoning);
        nextStep();
      }, step.delayMs);
    }
    nextStep();
  }

  function runStatsQuery(id: StatsQueryId, userText: string) {
    switch (id) {
      case "group-by-campaigns": {
        chat.append({ role: "user", text: userText });
        appDispatch({ type: "stats_set_rows", rows: "campaigns" });
        const replyId = chat.append({ role: "assistant", text: "", pending: true });
        schedule(() => {
          chat.updatePending(replyId, "Перегруппировал по кампаниям.");
        }, 400);
        return;
      }
      case "top-campaigns-income-june": {
        chat.append({ role: "user", text: userText });
        appDispatch({
          type: "stats_apply_patch",
          patch: {
            rows: "campaigns",
            sort: { column: "income", direction: "desc" },
            period: {
              preset: "custom",
              from: `${STATS_DEMO_YEAR}-06-01`,
              to: `${STATS_DEMO_YEAR}-06-30`,
            },
            rowCount: 10,
          },
        });
        const replyId = chat.append({ role: "assistant", text: "", pending: true });
        schedule(() => {
          chat.updatePending(replyId, "Топ-10 кампаний по доходу за июнь.");
        }, 400);
        return;
      }
      case "compare-channels": {
        chat.append({ role: "user", text: userText });
        playComplexThinking({
          steps: COMPLEX_THINKING_STEPS_STATS,
          finalReply: COMPLEX_THINKING_FINAL_REPLY_STATS,
        });
        return;
      }
    }
  }

  function submit(payload: ChatComposerSubmitPayload) {
    const { text, segments } = payload;
    const normalized = text.trim().toLowerCase();

    // Statistics-only hard-coded queries (looser matching). Скоупинг по
    // секции — фразы не должны срабатывать вне Статистики, даже если их
    // случайно ввели в drawer-композиторе.
    if (isOnStatisticsSection(appState)) {
      const match = matchStatsQuery(text);
      if (match) {
        runStatsQuery(match.id, text);
        return;
      }
    }

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
      playComplexThinking({
        steps: COMPLEX_THINKING_STEPS_SIGNAL,
        finalReply: COMPLEX_THINKING_FINAL_REPLY_SIGNAL,
      });
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

- [ ] **Step 2: Тесты + линт**

```bash
npm test
npm run lint
```

Expected: всё зелёное.

- [ ] **Step 3: Коммит**

```bash
git add src/sections/shell/use-chat-submit.ts
git commit -m "feat(chat): wire stats-query-matcher into useChatSubmit"
```

---

## Task 6: Подключить `useChatSubmit` к `ShellBottomBar` для Statistics

**Files:**
- Modify: `src/sections/shell/shell-bottom-bar.tsx`

- [ ] **Step 1: Импортировать `useChatSubmit`**

В `src/sections/shell/shell-bottom-bar.tsx` рядом с другими импортами:

```ts
import { useChatSubmit } from "./use-chat-submit";
```

- [ ] **Step 2: Получить `submit` в компоненте**

Внутри `ShellBottomBar`, рядом с `const dispatch = useAppDispatch();`:

```ts
  const { submit: chatSubmit } = useChatSubmit();
```

- [ ] **Step 3: Добавить ветку для Статистики в `handlePromptSubmit`**

Найти в `handlePromptSubmit`:

```ts
    if (view.kind === "section" && view.name === "Кампании") {
      const { statuses, sort } = parseCampaignQuery(rawText);
      if (statuses.length > 0 || sort !== "default") {
        dispatch({ type: "campaigns_query_set", statuses, sort });
      }
      return;
    }

    if (view.kind !== "workflow" || view.launched) return;
```

Вставить **между** этими двумя блоками:

```ts
    if (view.kind === "section" && view.name === "Статистика") {
      if (rawText.trim()) {
        chatSubmit({ text: rawText, segments });
      }
      editorRef.current?.clear();
      chipsApi.clearChips();
      return;
    }
```

- [ ] **Step 4: Lint**

```bash
npm run lint
```

Expected: clean.

- [ ] **Step 5: Ручная проверка трёх запросов через дев-сервер**

```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null; true
npm run dev -- -p 3001 > /tmp/stats-dev.log 2>&1 &
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001
```

Expected: 200.

В браузере на `http://localhost:3001`:

1. Включить пресет с запущенной кампанией через dev-панель, перейти в «Статистика».
2. В нижний PromptBar ввести `покажи по кампаниям`, нажать Enter. **Ожидание:** таблица перегруппировалась по кампаниям, drawer закрыт. Открыть drawer — увидеть пару user + assistant.
3. Ввести `топ-10 кампаний по доходу за июнь`. **Ожидание:** таблица показывает 10 строк по кампаниям, сортировка по Income↓, шилд периода = «01.06.2026 — 30.06.2026». Открыть drawer — увидеть пару.
4. Ввести `сравни эффективность каналов`. **Ожидание:** drawer открывается автоматически, проигрывает 3 шага размышлений, заканчивается уточняющим вопросом про метрику. Таблица не меняется.
5. Ввести `привет`. **Ожидание:** не матчится → стандартный generic mock-reply в drawer'е.
6. Перейти в «Сигналы», ввести `покажи по кампаниям`. **Ожидание:** **не** матчится как stats-запрос (скоупинг работает); идёт обычный путь.

Если что-то ломается — фиксить, прежде чем коммитить.

- [ ] **Step 6: Коммит**

```bash
git add src/sections/shell/shell-bottom-bar.tsx
git commit -m "feat(shell): route Statistics PromptBar input to useChatSubmit"
```

---

# ФАЗА 4 — Чипы под PromptBar

## Task 7: Расширить `selectSuggestionState` параметром `isStatistics` (TDD)

**Files:**
- Modify: `src/state/suggestion-state.ts`
- Modify: `src/state/suggestion-state.test.ts`

- [ ] **Step 1: Дописать failing-тесты**

Добавить в `src/state/suggestion-state.test.ts` (внутри существующего `describe`):

```ts
  it("on Statistics section without tag → stats suggestions", () => {
    const s = selectSuggestionState({
      hasActiveTag: false,
      activeTagTypedText: false,
      queueLength: 0,
      isWelcome: false,
      isStatistics: true,
    });
    expect(s.kind).toBe("stats");
  });

  it("active tag wins over stats (priority)", () => {
    const s = selectSuggestionState({
      hasActiveTag: true,
      activeTagTypedText: false,
      queueLength: 0,
      isWelcome: false,
      isStatistics: true,
    });
    expect(s.kind).toBe("context");
  });

  it("non-empty queue wins over stats (priority)", () => {
    const s = selectSuggestionState({
      hasActiveTag: false,
      activeTagTypedText: false,
      queueLength: 2,
      isWelcome: false,
      isStatistics: true,
    });
    expect(s.kind).toBe("apply-all");
  });

  it("welcome wins over stats (can't both be true in practice)", () => {
    const s = selectSuggestionState({
      hasActiveTag: false,
      activeTagTypedText: false,
      queueLength: 0,
      isWelcome: true,
      isStatistics: true,
    });
    expect(s.kind).toBe("welcome");
  });

  it("not on Statistics, no tag, empty queue → hidden", () => {
    const s = selectSuggestionState({
      hasActiveTag: false,
      activeTagTypedText: false,
      queueLength: 0,
      isWelcome: false,
      isStatistics: false,
    });
    expect(s.kind).toBe("hidden");
  });
```

Также обновить ВСЕ существующие тесты в файле — добавить `isStatistics: false` в каждый `selectSuggestionState({...})` вызов.

- [ ] **Step 2: Запустить тесты — падают**

```bash
npm test -- suggestion-state
```

Expected: FAIL — у функции нет параметра `isStatistics`, поведения «stats» нет.

- [ ] **Step 3: Обновить `src/state/suggestion-state.ts`**

Заменить файл целиком:

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
  /** Пользователь на странице «Статистика». */
  isStatistics: boolean;
}

export type SuggestionState =
  /** Общие welcome-подсказки (состояние 1, уже работает в проде). */
  | { kind: "welcome" }
  /** Контекстные подсказки активного тега (состояние 2). */
  | { kind: "context" }
  /** Подсказка «Применить все изменения» (состояние 3). */
  | { kind: "apply-all" }
  /** Чипы 3 зашитых stats-запросов (состояние 4). */
  | { kind: "stats" }
  /** Подсказки скрыты. */
  | { kind: "hidden" };

/**
 * Выбирает состояние зоны подсказок.
 * Приоритет:
 *  1. начал печатать после тега → hidden;
 *  2. активный тег → context;
 *  3. непустая очередь без тега → apply-all;
 *  4. welcome-экран → welcome;
 *  5. на странице Статистики → stats;
 *  6. иначе → hidden.
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
  if (input.isStatistics) {
    return { kind: "stats" };
  }
  return { kind: "hidden" };
}
```

- [ ] **Step 4: Запустить тесты — зелёные**

```bash
npm test -- suggestion-state
```

Expected: PASS.

- [ ] **Step 5: Lint**

```bash
npm run lint
```

Expected: clean.

- [ ] **Step 6: Коммит**

```bash
git add src/state/suggestion-state.ts src/state/suggestion-state.test.ts
git commit -m "feat(state): add isStatistics input and stats kind to selectSuggestionState"
```

---

## Task 8: Добавить ветку `stats` в `SuggestionBar` и подключить в `ShellBottomBar`

**Files:**
- Modify: `src/sections/shell/suggestion-bar.tsx`
- Modify: `src/sections/shell/shell-bottom-bar.tsx`

- [ ] **Step 1: Расширить `SuggestionBarProps` и добавить ветку**

Заменить `src/sections/shell/suggestion-bar.tsx` целиком:

```tsx
"use client";

import { AnimatePresence, motion } from "motion/react";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { useDraftQueue } from "@/state/draft-queue-context";
import { selectSuggestionState } from "@/state/suggestion-state";
import { getSuggestionsForTag } from "@/state/suggestion-catalog";
import { APPLY_ALL_COMMAND } from "@/state/prompt-bar-enter";
import { isNodeTagPayload, type PromptChip } from "@/state/prompt-chips-context";

const STATS_CHIPS = [
  "покажи по кампаниям",
  "топ-10 кампаний по доходу за июнь",
  "сравни эффективность каналов",
] as const;

interface SuggestionBarProps {
  /** Активный тег в инпуте, либо null. */
  activeTag: PromptChip | null;
  /** После тега уже что-то напечатано. */
  hasTypedText: boolean;
  /** Welcome-экран — состояние 1 (общие подсказки) разрешено. */
  isWelcome: boolean;
  /** Пользователь на странице «Статистика». */
  isStatistics: boolean;
  /** Welcome-подсказки (рендерятся как есть, состояние 1). */
  welcomeSlot?: React.ReactNode;
  /** Клик по контекстной подсказке → вставить fullText в инпут после тега. */
  onPickSuggestion: (fullText: string) => void;
  /** Клик по «Применить все изменения» → подставить команду в инпут. */
  onPickApplyAll: () => void;
  /** Клик по stats-чипу → подставить фразу и автосабмитнуть. */
  onPickStatsQuery: (phrase: string) => void;
}

const ZONE_TRANSITION = { duration: 0.24, ease: [0.23, 1, 0.32, 1] } as const;

/**
 * Зона подсказок под промпт-баром (M6 + stats-чипы).
 * Состояние выбирается чистой selectSuggestionState;
 * смена состояний — плавная opacity/transform-анимация.
 */
export function SuggestionBar({
  activeTag,
  hasTypedText,
  isWelcome,
  isStatistics,
  welcomeSlot,
  onPickSuggestion,
  onPickApplyAll,
  onPickStatsQuery,
}: SuggestionBarProps) {
  const { drafts } = useDraftQueue();

  const state = selectSuggestionState({
    hasActiveTag: activeTag !== null,
    activeTagTypedText: hasTypedText,
    queueLength: drafts.length,
    isWelcome,
    isStatistics,
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

      {state.kind === "stats" && (
        <motion.div
          key="sg-stats"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={ZONE_TRANSITION}
        >
          <Suggestions>
            {STATS_CHIPS.map((phrase) => (
              <Suggestion
                key={phrase}
                suggestion={phrase}
                onClick={() => onPickStatsQuery(phrase)}
                className="border-white/10 bg-[#171717] text-white hover:bg-[#1f1f1f]"
              />
            ))}
          </Suggestions>
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

- [ ] **Step 2: Подключить `isStatistics` и `onPickStatsQuery` в `ShellBottomBar`**

В `src/sections/shell/shell-bottom-bar.tsx`:

(a) Импортировать `isOnStatisticsSection` рядом с другими импортами `app-state`:

```ts
import {
  isOnWelcome,
  isOnStatisticsSection,
  isWorkflowView,
  type View,
} from "@/state/app-state";
```

(b) Найти рендер `<SuggestionBar ... />` и обновить пропсы:

```tsx
        <SuggestionBar
          activeTag={activeTag}
          hasTypedText={hasTypedText}
          isWelcome={
            onWelcome || (view.kind === "section" && view.name === "Кампании")
          }
          isStatistics={isOnStatisticsSection(state)}
          welcomeSlot={
            onWelcome && welcomeChat ? (
              <OnboardingChatChips
                chips={welcomeChat.chips}
                onChipClick={welcomeChat.submitChip}
              />
            ) : view.kind === "section" &&
              view.name === "Кампании" &&
              campaigns.length > 0 ? (
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
          onPickStatsQuery={(phrase) => {
            // Вставить фразу и тут же отправить через тот же путь, что Enter.
            // chatSubmit маршрутизирует stats-запросы через useChatSubmit.
            chatSubmit({ text: phrase, segments: [] });
            editorRef.current?.clear();
            chipsApi.clearChips();
          }}
        />
```

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: clean.

- [ ] **Step 4: Ручная проверка чипов**

```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null; true
npm run dev -- -p 3001 > /tmp/stats-dev.log 2>&1 &
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001
```

В браузере на `http://localhost:3001`:

1. Перейти в раздел «Статистика» (с активным пресетом, чтобы данные были).
2. **Ожидание:** под PromptBar появились 3 чипа: «покажи по кампаниям», «топ-10 кампаний по доходу за июнь», «сравни эффективность каналов».
3. Кликнуть первый чип. **Ожидание:** таблица перегруппировалась по кампаниям, инпут пуст, чипы остались на месте.
4. Кликнуть второй чип. **Ожидание:** таблица показывает топ-10 кампаний с сортировкой по Income↓ за июнь 2026.
5. Кликнуть третий чип. **Ожидание:** drawer открылся, проиграл chain-of-thoughts, задал уточняющий вопрос.
6. Перейти в «Сигналы». **Ожидание:** stats-чипы исчезли (показывается то, что было раньше для этой секции).
7. Вернуться в «Статистика», начать печатать в инпут что-нибудь — **ожидание:** чипы остаются (а не исчезают, как welcome). Уточнение: они исчезают только когда `hasActiveTag === true && activeTagTypedText === true`, но тегов на стате нет, так что чипы видны всегда.

- [ ] **Step 5: Коммит**

```bash
git add src/sections/shell/suggestion-bar.tsx src/sections/shell/shell-bottom-bar.tsx
git commit -m "feat(suggestion-bar): add stats kind with 3 click-to-submit chips"
```

---

# ФАЗА 5 — Финальная верификация

## Task 9: End-to-end проверка всех сценариев

**Files:** none

- [ ] **Step 1: Полный прогон тестов и линта**

```bash
npm test
npm run lint
```

Expected: оба зелёные.

- [ ] **Step 2: Полная ручная проверка матрицы сценариев**

В браузере на `http://localhost:3001`:

| # | Действие | Контекст | Ожидание |
|---|---|---|---|
| 1 | Печать `покажи по кампаниям` + Enter | Статистика | Таблица перегруппирована, инлайн |
| 2 | Печать `топ-10 кампаний по доходу за июнь` + Enter | Статистика | Таблица: топ-10, Income↓, июнь 2026 |
| 3 | Печать `сравни эффективность каналов` + Enter | Статистика | Drawer открыт, 3 шага размышлений, вопрос |
| 4 | Клик по чипу «покажи по кампаниям» | Статистика | То же, что #1 |
| 5 | Клик по чипу «топ-10 кампаний...» | Статистика | То же, что #2 |
| 6 | Клик по чипу «сравни эффективность каналов» | Статистика | То же, что #3 |
| 7 | Печать с вариациями: `покажи мне по кампаниям` | Статистика | Матчится как Q1 |
| 8 | Печать `top campaigns income june` | Статистика | Матчится как Q2 |
| 9 | Печать `сравнение каналов по эффективности` | Статистика | Матчится как Q3 |
| 10 | Печать `привет` | Статистика | Generic mock reply в drawer'е |
| 11 | Печать `покажи по кампаниям` | Сигналы | Не stats-матч → fallback (или silent drop в зависимости от секции) |
| 12 | Открыть «Настройка вида» после применения Q2, изменить «Строки» обратно, нажать «Сохранить» | Статистика | Настройка применилась, текущее состояние видно в попапе при следующем открытии (ресинк draft работает) |
| 13 | Открыть drawer, ввести `топ-10 кампаний...` напрямую в drawer-композитор | Статистика, drawer открыт | То же, что #2 |
| 14 | Перейти в раздел «Кампании» | — | stats-чипы скрыты, фильтр-чипы кампаний — на месте |

Если хоть один сценарий ведёт себя не так — фиксить, прежде чем закрывать задачу.

- [ ] **Step 3: Финальный коммит (если были hot-fix'ы)**

Если в Step 2 что-то правилось — закоммитить:

```bash
git add -A
git commit -m "fix(stats): <конкретное описание правки>"
```

- [ ] **Step 4: Отчитаться о готовности**

Сообщить пользователю:
- Ветка: `feature/stats-promptbar-queries`
- Worktree: `.worktrees/stats-promptbar-queries`
- Количество коммитов на ветке: `git log --oneline main..HEAD | wc -l`
- Что осталось — мерж/PR (это решение пользователя, агент не мержит сам).
