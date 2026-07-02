# M3 — Статистика: попапы вместо дровера — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Убрать правый дровер статистики и перенести весь его функционал в две тулбар-кнопки («Настройка вида», «Условия поиска»), каждая из которых открывает Notion-style drill-in попап с сохранением на каждом уровне и защитой от потери несохранённых правок.

**Architecture:** Создаётся один переиспользуемый компонент `DrillInPopover` — обёртка над shadcn `Popover`, которая держит стек уровней (level stack), рисует «назад»/«Сохранить» в шапке/футере каждого уровня и перехватывает закрытие при наличии несохранённых правок. Содержимое уровней (управление столбцами, общие параметры, условия поиска) поставляется как массив описаний уровней. Состояние фильтров остаётся `draft` (useReducer) / `applied` (useState) — таблица перерисовывается только когда `handleSave` копирует `draft` в `applied`. Сортировка добавляется в `StatisticsFilters` как новое чистое поле `sort` и обслуживается reducer-экшеном.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, shadcn/ui on base-ui, motion v12, vitest

**Source spec:** `docs/superpowers/specs/2026-05-15-afina-mechanics-spec.md` — Механика 3

---

## Worktree setup

Per AGENTS.md, всю работу вести в отдельном воркстри.

```bash
git worktree add .worktrees/m3-statistics-popups -b feature/m3-statistics-popups main
cd .worktrees/m3-statistics-popups
npm install
```

Все последующие команды (`npx vitest`, `git commit`, просмотр на `localhost:3000`) — изнутри `.worktrees/m3-statistics-popups`. Дев-сервер уже крутится на `:3000` из основной директории на ветке, которую смотрит пользователь; в воркстри дев-сервер НЕ запускать (если нужно — `npx next dev -p 3001`). Чекпоинты в задачах сформулированы под `:3000` — пользователь сам переключит сервер на нужную ветку.

---

## Reusable components (audit verified 2026-05-15)

| Компонент / модуль | Путь | Решение | Что делаем |
|---|---|---|---|
| `Popover` / `PopoverContent` / `PopoverTrigger` (shadcn на base-ui) | `src/components/ui/popover.tsx` | Reuse as-is | База для `DrillInPopover` и для подтверждающего поповера закрытия. Не трогаем. |
| `Button` (variants `outline`/`default`/`ghost`, sizes `default`/`sm`/`icon`/`icon-sm`) | `src/components/ui/button.tsx` | Reuse as-is | Тулбар-кнопки, «Сохранить», «назад», «Подтвердить»/«Отмена». |
| `Separator` | `src/components/ui/separator.tsx` | Reuse as-is | Разделители внутри уровней. |
| `ColumnsList` (видимость + порядок столбцов) | сейчас в `statistics-settings-drawer.tsx` (внутр. компонент, строки 303–383) | Extended | Переносится в новый файл `view-settings-levels.tsx`, расширяется блоком сортировки (выбор столбца + направление). |
| `SimpleSelect<T>` | `src/sections/statistics/fields/simple-select.tsx` | Reuse as-is | Валюта, метод расчёта внутри drill-in уровней. |
| `GroupedSelect<T>` | `src/sections/statistics/fields/grouped-select.tsx` | Reuse as-is | Строки / подстроки внутри drill-in уровней. |
| `PeriodField` | `src/sections/statistics/fields/period-field.tsx` | Reuse as-is | Период внутри drill-in уровня. `triggerVariant="field"` (default). |
| `ChipMultiselect` | `src/sections/statistics/fields/chip-multiselect.tsx` | Reuse as-is | Внутри `SearchConditionsBlock`. |
| `SearchConditionsBlock` | `src/sections/statistics/search-conditions.tsx` | Reuse as-is | Целиком вставляется в уровень попапа «Условия поиска». Props `{ conditions, dispatch }` — без изменений. |
| `SaveTemplatePopover` | `src/sections/statistics/save-template-dialog.tsx` | Reuse as-is | Остаётся как механизм «Сохранить как шаблон»; вызывается из футера 1-го уровня «Настройка вида». |
| `statisticsReducer` / `StatisticsFilters` / `filtersEqual` / `DEFAULT_FILTERS` | `src/sections/statistics/statistics-state.ts` | Extended | Добавляется поле `sort` и экшен `SET_SORT`. |
| `report-templates.ts` (`BUILTIN_TEMPLATES`, `ReportTemplate`) | `src/sections/statistics/report-templates.ts` | Extended | `ReportTemplate.filters` получает поле `sort` транзитивно через `StatisticsFilters`; явных правок не требует, т.к. все шаблоны строятся из `DEFAULT_FILTERS`. |
| `statistics-view.tsx` template picker Popover (название отчёта) | `src/sections/statistics/statistics-view.tsx` строки 249–292 | Reuse as-is | Спека 3.5 — не трогаем. |
| `mock-data.ts` (`generateRows`, `cellValue`) | `src/sections/statistics/mock-data.ts` | Extended | `generateRows` получает сортировку строк по `filters.sort` (применяется к топ-уровневым строкам). |
| `DrillInPopover` (drill-in framework) | — | **Create new** | Новый переиспользуемый компонент, см. ниже. |
| `statistics-settings-drawer.tsx` (Sheet 640px) | `src/sections/statistics/statistics-settings-drawer.tsx` | **Delete** | Sheet удаляется целиком; внутренние `Section`/`FormRow`/`Descriptions`/`ColumnsList` и константы переносятся в новые файлы. |

> **Discrepancy с маппинг-репортом:** в репорте `ColumnsList` показан с props `{ selected, onToggle, onReorder }` — это верно, но в репорте также сказано «up/down/delete buttons» — фактически в коде это `↑` `↓` (текстовые символы) + `Trash2Icon`. Учтено в Task 3.

---

## File structure

| Файл | Действие | Ответственность |
|---|---|---|
| `src/sections/statistics/statistics-state.ts` | **Modify** | Новый тип `SortState`, поле `sort` в `StatisticsFilters`, экшен `SET_SORT` в `StatisticsAction` + reducer-кейс, `sort` в `DEFAULT_FILTERS`. |
| `src/sections/statistics/mock-data.ts` | **Modify** | `generateRows` сортирует топ-строки по `filters.sort` (новая чистая функция `sortRows`). |
| `src/sections/statistics/drill-in-popover.tsx` | **Create** | Новый переиспользуемый компонент `DrillInPopover` — стек уровней, «назад», «Сохранить» на каждом уровне, guard на закрытие с несохранёнными правками + подтверждающий поповер. Drill-in framework живёт здесь. |
| `src/sections/statistics/view-settings-levels.tsx` | **Create** | Описание уровней попапа «Настройка вида»: корневое меню + уровни «Управление столбцами» (расширенный `ColumnsList` + сортировка), «Общие параметры» (валюта / метод / период / строки / подстроки / кол-во строк). Переносит сюда `ColumnsList`, `FormRow`, константы `CALC_METHOD_OPTIONS` / `CURRENCY_OPTIONS` / `ROW_GROUPS` / `SUB_ROW_GROUPS` / `COLUMN_LABELS` / `ALL_COLUMNS` из удаляемого дровера. |
| `src/sections/statistics/search-settings-levels.tsx` | **Create** | Описание единственного уровня попапа «Условия поиска» — обёртка над `SearchConditionsBlock`. |
| `src/sections/statistics/statistics-view.tsx` | **Modify** | Убрать `StatisticsSettingsDrawer` и `drawerOpen`, заменить кнопку-шестерёнку на две кнопки «Настройка вида» / «Условия поиска», подключить два `DrillInPopover`, прокинуть `handleSave` (бывший `handleApply`). Заголовок таблицы «Название» получает кликабельную сортировку. |
| `src/sections/statistics/statistics-settings-drawer.tsx` | **Delete** | Sheet больше не нужен (спека 3.1). |
| `src/sections/statistics/statistics-state.test.ts` | **Create (test)** | TDD: reducer-кейс `SET_SORT`, `filtersEqual` с учётом `sort`, `DEFAULT_FILTERS.sort`. |
| `src/sections/statistics/mock-data.test.ts` | **Create (test)** | TDD: `sortRows` сортирует по числовой/строковой колонке в обе стороны. |

**Решение по drill-in:** drill-in меню — это **новый переиспользуемый компонент** `src/sections/statistics/drill-in-popover.tsx`. Он не знает про статистику: принимает корневой уровень и рендерит произвольное дерево уровней. Конкретное содержимое («Настройка вида», «Условия поиска») задаётся декларативно через тип `DrillLevel` из этого же файла и собирается в `view-settings-levels.tsx` / `search-settings-levels.tsx`.

---

## Tasks

### Task 1: Чистое состояние сортировки в reducer (TDD)

Спека 3.2 требует сортировку внутри «Управления столбцами». Сортировки в `StatisticsFilters` сейчас нет (заголовок таблицы рисует нефункциональный `ChevronsUpDown`). Добавляем чистое поле `sort` и экшен `SET_SORT`.

**Files:**
- Modify: `src/sections/statistics/statistics-state.ts` (типы — строки 57–83; экшены — строки 105–120; reducer — строки 122–164; `DEFAULT_FILTERS` — строки 85–103)
- Test: `src/sections/statistics/statistics-state.test.ts` (create)

- [ ] **Step 1: Написать тест ПЕРВЫМ** — создать `src/sections/statistics/statistics-state.test.ts` с полным кодом:
```ts
import { describe, expect, it } from "vitest";

import {
  DEFAULT_FILTERS,
  filtersEqual,
  statisticsReducer,
  type StatisticsFilters,
} from "./statistics-state";

describe("statisticsReducer — SET_SORT", () => {
  it("устанавливает столбец и направление сортировки", () => {
    const next = statisticsReducer(DEFAULT_FILTERS, {
      type: "SET_SORT",
      sort: { column: "income", direction: "desc" },
    });
    expect(next.sort).toEqual({ column: "income", direction: "desc" });
  });

  it("сбрасывает сортировку при sort: null", () => {
    const withSort: StatisticsFilters = {
      ...DEFAULT_FILTERS,
      sort: { column: "approves", direction: "asc" },
    };
    const next = statisticsReducer(withSort, { type: "SET_SORT", sort: null });
    expect(next.sort).toBeNull();
  });

  it("не мутирует прочие поля фильтра", () => {
    const next = statisticsReducer(DEFAULT_FILTERS, {
      type: "SET_SORT",
      sort: { column: "clicks", direction: "asc" },
    });
    expect(next.columns).toBe(DEFAULT_FILTERS.columns);
    expect(next.period).toBe(DEFAULT_FILTERS.period);
  });
});

describe("DEFAULT_FILTERS.sort", () => {
  it("по умолчанию сортировки нет", () => {
    expect(DEFAULT_FILTERS.sort).toBeNull();
  });
});

describe("filtersEqual учитывает sort", () => {
  it("разные sort → не равны", () => {
    const a: StatisticsFilters = {
      ...DEFAULT_FILTERS,
      sort: { column: "income", direction: "desc" },
    };
    const b: StatisticsFilters = {
      ...DEFAULT_FILTERS,
      sort: { column: "income", direction: "asc" },
    };
    expect(filtersEqual(a, b)).toBe(false);
  });

  it("одинаковый sort → равны", () => {
    const a: StatisticsFilters = {
      ...DEFAULT_FILTERS,
      sort: { column: "income", direction: "desc" },
    };
    const b: StatisticsFilters = {
      ...DEFAULT_FILTERS,
      sort: { column: "income", direction: "desc" },
    };
    expect(filtersEqual(a, b)).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить тест — ожидать FAIL** — Run: `npx vitest run src/sections/statistics/statistics-state.test.ts`; Expected: тесты падают с TypeScript-ошибкой (`SET_SORT` нет в `StatisticsAction`, `sort` нет в `StatisticsFilters`).

- [ ] **Step 3: Добавить тип `SortState`** — в `statistics-state.ts` после блока `ColumnKey` (после строки 67) добавить:
```ts
export type SortDirection = "asc" | "desc";

export type SortState = {
  column: ColumnKey;
  direction: SortDirection;
};
```

- [ ] **Step 4: Добавить поле `sort` в `StatisticsFilters`** — в типе `StatisticsFilters` (строки 74–83) добавить последним полем `sort: SortState | null;` так, чтобы тип стал:
```ts
export type StatisticsFilters = {
  calcMethod: CalcMethod;
  currency: Currency;
  period: Period;
  rows: RowKind;
  rowCount: number;
  subRows: RowKind | "none";
  columns: ColumnKey[];
  conditions: SearchConditions;
  sort: SortState | null;
};
```

- [ ] **Step 5: Добавить `sort: null` в `DEFAULT_FILTERS`** — в объект `DEFAULT_FILTERS` (строки 85–103) добавить последним полем `sort: null,`.

- [ ] **Step 6: Добавить экшен `SET_SORT`** — в union `StatisticsAction` (строки 105–120) добавить вариант перед `{ type: "RESET"; ... }`:
```ts
  | { type: "SET_SORT"; sort: SortState | null }
```

- [ ] **Step 7: Добавить reducer-кейс `SET_SORT`** — в `switch` reducer'а (строки 126–163) добавить кейс перед `case "RESET":`:
```ts
    case "SET_SORT":
      return { ...state, sort: action.sort };
```

- [ ] **Step 8: Запустить тест — ожидать PASS** — Run: `npx vitest run src/sections/statistics/statistics-state.test.ts`; Expected: все 6 тестов зелёные.

- [ ] **Step 9: Commit** — `git commit -m "feat(m3): add sort state to statistics filters reducer"`

---

### Task 2: Сортировка строк в mock-data (TDD)

«Сохранить» должен реально перерисовать таблицу с применённой сортировкой. Добавляем чистую функцию сортировки топ-строк отчёта.

**Files:**
- Modify: `src/sections/statistics/mock-data.ts` (`generateRows` — строки 267–300; добавить экспорт `sortRows`)
- Test: `src/sections/statistics/mock-data.test.ts` (create)

- [ ] **Step 1: Написать тест ПЕРВЫМ** — создать `src/sections/statistics/mock-data.test.ts` с полным кодом:
```ts
import { describe, expect, it } from "vitest";

import { sortRows, type GeneratedRow, type RowData } from "./mock-data";

function row(key: string, data: Partial<RowData>): GeneratedRow {
  const base: RowData = {
    expenses: "0,00 ₽",
    income: "0,00 ₽",
    sends: 0,
    actions: 0,
    holds: 0,
    approves: 0,
    ar: "0.00%",
    rejects: 0,
    rr: "0.00%",
    clicks: 0,
  };
  return { key, label: key, data: { ...base, ...data }, subRows: [] };
}

describe("sortRows", () => {
  const rows: GeneratedRow[] = [
    row("a", { clicks: 30 }),
    row("b", { clicks: 10 }),
    row("c", { clicks: 20 }),
  ];

  it("sort: null оставляет порядок как есть", () => {
    expect(sortRows(rows, null).map((r) => r.key)).toEqual(["a", "b", "c"]);
  });

  it("сортирует по числовой колонке по возрастанию", () => {
    const out = sortRows(rows, { column: "clicks", direction: "asc" });
    expect(out.map((r) => r.key)).toEqual(["b", "c", "a"]);
  });

  it("сортирует по числовой колонке по убыванию", () => {
    const out = sortRows(rows, { column: "clicks", direction: "desc" });
    expect(out.map((r) => r.key)).toEqual(["a", "c", "b"]);
  });

  it("сортирует по денежной строковой колонке по числовому значению", () => {
    const money: GeneratedRow[] = [
      row("x", { income: "1 200,50 ₽" }),
      row("y", { income: "980,00 ₽" }),
      row("z", { income: "12 000,00 ₽" }),
    ];
    const out = sortRows(money, { column: "income", direction: "desc" });
    expect(out.map((r) => r.key)).toEqual(["z", "x", "y"]);
  });

  it("сортирует по процентной колонке по числовому значению", () => {
    const pct: GeneratedRow[] = [
      row("p", { ar: "3.50%" }),
      row("q", { ar: "12.00%" }),
      row("r", { ar: "0.20%" }),
    ];
    const out = sortRows(pct, { column: "ar", direction: "asc" });
    expect(out.map((r) => r.key)).toEqual(["r", "p", "q"]);
  });

  it("не мутирует входной массив", () => {
    const input = [...rows];
    sortRows(input, { column: "clicks", direction: "asc" });
    expect(input.map((r) => r.key)).toEqual(["a", "b", "c"]);
  });
});
```

- [ ] **Step 2: Запустить тест — ожидать FAIL** — Run: `npx vitest run src/sections/statistics/mock-data.test.ts`; Expected: падает — `sortRows` не экспортируется из `mock-data.ts`.

- [ ] **Step 3: Добавить импорт `SortState`** — в `mock-data.ts` в импорт из `./statistics-state` (строки 12–17) добавить `SortState`:
```ts
import type {
  ColumnKey,
  Currency,
  RowKind,
  SortState,
  StatisticsFilters,
} from "./statistics-state";
```

- [ ] **Step 4: Добавить чистую функцию `sortRows`** — в `mock-data.ts` перед `export function generateRows` (перед строкой 267) вставить:
```ts
/**
 * Превращает значение ячейки (число или денежная/процентная строка вида
 * "1 200,50 ₽" / "3.50%") в число для сравнения. Нечисловые остатки
 * отбрасываются, запятая трактуется как десятичный разделитель.
 */
function numericCellValue(data: RowData, column: ColumnKey): number {
  const raw = data[column];
  if (typeof raw === "number") return raw;
  const cleaned = raw
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Сортирует топ-уровневые строки отчёта по выбранной колонке.
 * sort: null оставляет исходный порядок. Не мутирует вход.
 */
export function sortRows(
  rows: GeneratedRow[],
  sort: SortState | null,
): GeneratedRow[] {
  if (!sort) return rows;
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = numericCellValue(a.data, sort.column);
    const bv = numericCellValue(b.data, sort.column);
    return (av - bv) * factor;
  });
}
```

- [ ] **Step 5: Применить `sortRows` в `generateRows`** — в `generateRows` заменить финальный `return` (строка 299) с
```ts
  return rows.slice(0, Math.max(1, filters.rowCount));
```
на
```ts
  return sortRows(rows.slice(0, Math.max(1, filters.rowCount)), filters.sort);
```

- [ ] **Step 6: Запустить тест — ожидать PASS** — Run: `npx vitest run src/sections/statistics/mock-data.test.ts`; Expected: все 6 тестов зелёные.

- [ ] **Step 7: Commit** — `git commit -m "feat(m3): sort report rows by selected column in mock-data"`

---

### Task 3: Drill-in framework — компонент `DrillInPopover`

Главный новый компонент. Notion-style вложенное меню: стек уровней, «назад», «Сохранить» на каждом уровне, перехват закрытия с несохранёнными правками. Это UI-компонент — без unit-тестов, проверка визуальная.

**Files:**
- Create: `src/sections/statistics/drill-in-popover.tsx`

**Полный дизайн компонента (типы, props, state, навигация — verbatim):**

Тип уровня — декларативное дерево. Каждый уровень знает свой заголовок и рендерит контент; контент может через `onDrill(childId)` уйти на дочерний уровень.

```ts
export type DrillLevel = {
  /** Уникальный id уровня в дереве. */
  id: string;
  /** Заголовок уровня (показывается в шапке попапа). */
  title: string;
  /**
   * Рендер тела уровня. `drill` открывает дочерний уровень по его id.
   * Дочерние уровни перечислены в `children`.
   */
  render: (drill: (childId: string) => void) => React.ReactNode;
  /** Дочерние уровни, доступные из этого. */
  children?: DrillLevel[];
};
```

Props компонента:

```ts
export type DrillInPopoverProps = {
  /** Контент тулбар-кнопки, открывающей попап. */
  trigger: React.ReactNode;
  /** Корневой уровень дерева. */
  root: DrillLevel;
  /** Есть ли несохранённые изменения (draft !== applied). */
  dirty: boolean;
  /** Применить draft → applied и перезагрузить таблицу. */
  onSave: () => void;
  /** align для PopoverContent. По умолчанию "end". */
  align?: "start" | "center" | "end";
  /** Доп. узлы футера 1-го уровня (например, «Сохранить как шаблон»). */
  rootFooterExtra?: React.ReactNode;
};
```

State (всё внутри `DrillInPopover`):

```ts
const [open, setOpen] = useState(false);
// Стек id уровней от корня до текущего. Первый элемент — всегда root.id.
const [stack, setStack] = useState<string[]>([root.id]);
// true когда показан подтверждающий поповер закрытия.
const [confirmOpen, setConfirmOpen] = useState(false);
```

Навигация — все функции verbatim:

```ts
// Находит уровень по пути id'шек начиная от root.
function resolveLevel(path: string[]): DrillLevel {
  let level = root;
  for (let i = 1; i < path.length; i++) {
    const next = level.children?.find((c) => c.id === path[i]);
    if (!next) break;
    level = next;
  }
  return level;
}

const currentLevel = resolveLevel(stack);
const atRoot = stack.length === 1;

// Drill вниз: ребёнок текущего уровня.
function drillInto(childId: string) {
  setStack((prev) => [...prev, childId]);
}

// Назад на один уровень. На корне ничего не делает.
function goBack() {
  setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
}

// Запрос на закрытие попапа (крестик / клик вне / Esc / явный close).
// При несохранённых правках — перехватываем и показываем подтверждение.
function requestClose() {
  if (dirty) {
    setConfirmOpen(true);
    return;
  }
  closeNow();
}

// Безусловное закрытие: сбрасывает стек к корню.
function closeNow() {
  setConfirmOpen(false);
  setOpen(false);
  setStack([root.id]);
}

// Сохранение с любого уровня: применяем и закрываем попап.
function handleSaveClick() {
  onSave();
  closeNow();
}

// Подключение к Popover.onOpenChange:
function handleOpenChange(next: boolean) {
  if (next) {
    setOpen(true);
    setStack([root.id]); // каждый раз открываем с корня
    return;
  }
  // next === false → попытка закрытия, проходит через guard
  requestClose();
}
```

Структура рендера (presentational JSX — описано структурно):

- `<Popover open={open} onOpenChange={handleOpenChange}>`.
- `<PopoverTrigger render={<Button variant="outline" size="default">{trigger}</Button>} />`.
- `<PopoverContent align={align ?? "end"} side="bottom" className="w-80 p-0 gap-0">`:
  - **Шапка уровня** — `flex items-center gap-2 px-2 py-2 border-b border-border`:
    - если `!atRoot` — кнопка «назад»: `<Button variant="ghost" size="icon-sm" onClick={goBack} aria-label="Назад"><ChevronLeftIcon /></Button>`.
    - `<span className="text-sm font-medium">{currentLevel.title}</span>`.
  - **Тело уровня** — `div` с `max-h-[60vh] overflow-y-auto p-1`: `{currentLevel.render(drillInto)}`.
  - **Футер** — `flex items-center gap-2 px-2 py-2 border-t border-border`:
    - `<Button size="sm" onClick={handleSaveClick}>Сохранить</Button>` — **на каждом уровне, включая корень и глубже** (спека 3.4).
    - если `atRoot && rootFooterExtra` — рядом отрисовать `rootFooterExtra`.
    - если `dirty` — `<span className="ml-auto text-xs text-muted-foreground">Не сохранено</span>`.
- **Подтверждающий поповер закрытия** — отдельный `<Popover open={confirmOpen} onOpenChange={setConfirmOpen}>`:
  - триггер — невидимый якорь, спозиционированный поверх `PopoverContent` (использовать `<PopoverTrigger render={<span className="sr-only" />} />` внутри основного `PopoverContent`, либо отрисовать confirm-`PopoverContent` с `side="bottom"` от того же anchor). Простейший рабочий вариант для прототипа: рендерить confirm как вложенный `Popover`, чей `PopoverTrigger` — `span` с `className="absolute inset-x-0 bottom-0 h-0"` внутри основного `PopoverContent`.
  - `<PopoverContent align="center" side="top" className="w-64">`:
    - `<div className="text-sm font-medium">Закрыть без сохранения?</div>`.
    - `<div className="text-xs text-muted-foreground">Несохранённые изменения настроек будут потеряны.</div>`.
    - ряд кнопок: `<Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>Отмена</Button>` и `<Button variant="destructive" size="sm" onClick={closeNow}>Закрыть</Button>`.

Импорты файла: `useState` из `react`; `ChevronLeftIcon` из `lucide-react`; `Button`; `Popover`, `PopoverContent`, `PopoverTrigger`; `cn`.

> **Примечание по `base-ui` Popover:** `onOpenChange` вызывается и при клике вне попапа, и при Esc, и при крестике — поэтому единый guard в `handleOpenChange` перехватывает все пути закрытия. Drill-навигация (`drillInto`/`goBack`) НЕ закрывает попап — стек живёт внутри одного открытого `Popover`.

- [ ] **Step 1: Создать файл `drill-in-popover.tsx`** — создать `src/sections/statistics/drill-in-popover.tsx` с `"use client"` в первой строке, импортами выше, экспортируемыми типами `DrillLevel` / `DrillInPopoverProps` и компонентом `DrillInPopover`, реализованным строго по дизайну выше (все функции навигации — verbatim как в блоке выше).

- [ ] **Step 2: Реализовать шапку и тело уровня** — внутри `PopoverContent` отрисовать шапку (кнопка «назад» при `!atRoot` + `currentLevel.title`) и тело (`currentLevel.render(drillInto)`) по структуре выше.

- [ ] **Step 3: Реализовать футер с «Сохранить» на каждом уровне** — отрисовать футер с `<Button size="sm" onClick={handleSaveClick}>Сохранить</Button>`, опциональным `rootFooterExtra` (только при `atRoot`) и индикатором «Не сохранено» при `dirty`.

- [ ] **Step 4: Реализовать подтверждающий поповер закрытия** — вложенный `Popover` с `confirmOpen`/`setConfirmOpen`, кнопками «Отмена» (`setConfirmOpen(false)`) и «Закрыть» (`closeNow`). Триггер — скрытый `span`-якорь внутри основного `PopoverContent`.

- [ ] **Step 5: Verify (компиляция)** — Run: `npx tsc --noEmit -p tsconfig.json`; Expected: нет ошибок типов в `drill-in-popover.tsx` (компонент ещё нигде не используется — это нормально, импорт-варнингов быть не должно).

- [ ] **Step 6: Commit** — `git commit -m "feat(m3): add reusable DrillInPopover (Notion-style drill-in menu)"`

---

### Task 4: Уровни попапа «Настройка вида» (M3.2 + M3.3)

Содержимое первой кнопки. Корневое меню → drill-in уровни. Расширяем `ColumnsList` блоком сортировки (M3.2). Добавляем уровень «Общие параметры» (M3.3). Перенос внутренних компонентов и констант из удаляемого дровера.

**Files:**
- Create: `src/sections/statistics/view-settings-levels.tsx`

- [ ] **Step 1: Создать файл и перенести константы** — создать `src/sections/statistics/view-settings-levels.tsx` с `"use client"`. Перенести из `statistics-settings-drawer.tsx` (строки 32–114) verbatim: `CALC_METHOD_OPTIONS`, `CURRENCY_OPTIONS`, `ROW_GROUPS`, `SUB_ROW_GROUPS`, `COLUMN_LABELS`, `ALL_COLUMNS`. Импортировать: `GroupedSelect`, `PeriodField`, `SimpleSelect` из `./fields/*`; типы `CalcMethod`, `ColumnKey`, `Currency`, `RowKind`, `SortDirection`, `SortState`, `StatisticsAction`, `StatisticsFilters` из `./statistics-state`; тип `DrillLevel` из `./drill-in-popover`; `GripVerticalIcon`, `Trash2Icon`, `ChevronRightIcon`, `ArrowUpIcon`, `ArrowDownIcon` из `lucide-react`; `cn` из `@/lib/utils`.

- [ ] **Step 2: Перенести и расширить `ColumnsList`** — перенести `ColumnsList` (строки 303–383 дровера) в этот файл. Props остаются `{ selected, onToggle, onReorder }` плюс добавляются `sort: SortState | null` и `onSortChange: (sort: SortState | null) => void`. Внутри контейнера, ПОСЛЕ списка столбцов, добавить блок сортировки:
```tsx
<div className="mt-2 border-t border-border pt-2">
  <div className="px-2 py-1 text-xs text-muted-foreground">Сортировка</div>
  {selected.map((col) => {
    const isSortCol = sort?.column === col;
    return (
      <div
        key={`sort-${col}`}
        className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
      >
        <span>{COLUMN_LABELS[col]}</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label={`Сортировать ${COLUMN_LABELS[col]} по возрастанию`}
            onClick={() =>
              onSortChange(
                isSortCol && sort?.direction === "asc"
                  ? null
                  : { column: col, direction: "asc" },
              )
            }
            className={cn(
              "rounded p-0.5 transition-colors hover:bg-muted",
              isSortCol && sort?.direction === "asc"
                ? "text-primary"
                : "text-muted-foreground",
            )}
          >
            <ArrowUpIcon className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Сортировать ${COLUMN_LABELS[col]} по убыванию`}
            onClick={() =>
              onSortChange(
                isSortCol && sort?.direction === "desc"
                  ? null
                  : { column: col, direction: "desc" },
              )
            }
            className={cn(
              "rounded p-0.5 transition-colors hover:bg-muted",
              isSortCol && sort?.direction === "desc"
                ? "text-primary"
                : "text-muted-foreground",
            )}
          >
            <ArrowDownIcon className="size-3.5" />
          </button>
        </div>
      </div>
    );
  })}
</div>
```
Логика: повторный клик по уже активному направлению сбрасывает сортировку (`onSortChange(null)`). Сортировать можно только по видимым (`selected`) столбцам.

- [ ] **Step 3: Добавить вспомогательный `MenuRow`** — для строк корневого меню drill-in добавить в файл презентационный компонент:
```tsx
function MenuRow({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
    >
      <span>{label}</span>
      <span className="flex items-center gap-1.5">
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Написать билдер дерева уровней `buildViewSettingsLevel`** — экспортировать чистую функцию, собирающую `DrillLevel`-дерево из `draft` и `dispatch`:
```tsx
export function buildViewSettingsLevel(
  draft: StatisticsFilters,
  dispatch: (action: StatisticsAction) => void,
): DrillLevel {
  const columnsLevel: DrillLevel = {
    id: "columns",
    title: "Управление столбцами",
    render: () => (
      <ColumnsList
        selected={draft.columns}
        sort={draft.sort}
        onToggle={(column) => dispatch({ type: "TOGGLE_COLUMN", column })}
        onReorder={(columns) => dispatch({ type: "REORDER_COLUMNS", columns })}
        onSortChange={(sort) => dispatch({ type: "SET_SORT", sort })}
      />
    ),
  };

  const generalLevel: DrillLevel = {
    id: "general",
    title: "Общие параметры отчёта",
    render: () => (
      <div className="flex flex-col gap-3 p-2">
        <FieldRow label="Метод расчёта">
          <SimpleSelect
            value={draft.calcMethod}
            onChange={(method) => dispatch({ type: "SET_CALC_METHOD", method })}
            options={CALC_METHOD_OPTIONS}
          />
        </FieldRow>
        <FieldRow label="Валюта отчёта">
          <SimpleSelect
            value={draft.currency}
            onChange={(currency) => dispatch({ type: "SET_CURRENCY", currency })}
            options={CURRENCY_OPTIONS}
          />
        </FieldRow>
        <FieldRow label="Период">
          <PeriodField
            value={draft.period}
            onChange={(period) => dispatch({ type: "SET_PERIOD", period })}
          />
        </FieldRow>
        <FieldRow label="Строки">
          <GroupedSelect<RowKind>
            value={draft.rows}
            onChange={(rows) => dispatch({ type: "SET_ROWS", rows })}
            groups={ROW_GROUPS}
          />
        </FieldRow>
        <FieldRow label="Количество строк">
          <input
            type="number"
            value={draft.rowCount}
            onChange={(e) =>
              dispatch({
                type: "SET_ROW_COUNT",
                count: Math.max(1, Number(e.target.value) || 0),
              })
            }
            className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </FieldRow>
        <FieldRow label="Подстроки">
          <GroupedSelect<RowKind | "none">
            value={draft.subRows}
            onChange={(subRows) => dispatch({ type: "SET_SUB_ROWS", subRows })}
            groups={SUB_ROW_GROUPS}
          />
        </FieldRow>
      </div>
    ),
  };

  return {
    id: "view-root",
    title: "Настройка вида",
    render: (drill) => (
      <div className="flex flex-col gap-0.5 p-1">
        <MenuRow
          label="Управление столбцами"
          hint={`${draft.columns.length} видимых`}
          onClick={() => drill("columns")}
        />
        <MenuRow
          label="Общие параметры отчёта"
          onClick={() => drill("general")}
        />
      </div>
    ),
    children: [columnsLevel, generalLevel],
  };
}
```
И добавить презентационный `FieldRow`:
```tsx
function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
```

- [ ] **Step 5: Verify (компиляция)** — Run: `npx tsc --noEmit -p tsconfig.json`; Expected: нет ошибок типов в `view-settings-levels.tsx`. (Файл `statistics-settings-drawer.tsx` ещё существует — ошибок дублирования имён нет, т.к. это разные модули.)

- [ ] **Step 6: Commit** — `git commit -m "feat(m3): build view-settings drill-in levels (columns + sort + general params)"`

---

### Task 5: Уровень попапа «Условия поиска» (M3.4) + подключение кнопок, удаление дровера (M3.1)

Содержимое второй кнопки + замена тулбара в `statistics-view.tsx` + удаление Sheet.

**Files:**
- Create: `src/sections/statistics/search-settings-levels.tsx`
- Modify: `src/sections/statistics/statistics-view.tsx` (импорты — строки 1–45; state — строки 134–137; `handleApply` — строки 179–183; `handleSaveTemplate` — строки 185–202; toolbar — строки 311–345; рендер дровера — строки 451–460)
- Delete: `src/sections/statistics/statistics-settings-drawer.tsx`

- [ ] **Step 1: Создать `search-settings-levels.tsx`** — создать файл с `"use client"`. Импортировать `SearchConditionsBlock` из `./search-conditions`, типы `StatisticsAction`, `StatisticsFilters` из `./statistics-state`, тип `DrillLevel` из `./drill-in-popover`. Экспортировать билдер:
```tsx
export function buildSearchSettingsLevel(
  draft: StatisticsFilters,
  dispatch: (action: StatisticsAction) => void,
): DrillLevel {
  return {
    id: "search-root",
    title: "Условия поиска",
    render: () => (
      <div className="p-2">
        <SearchConditionsBlock conditions={draft.conditions} dispatch={dispatch} />
      </div>
    ),
  };
}
```
`SearchConditionsBlock` остаётся плоским блоком (include + collapsible exclude) — drill-in здесь одноуровневый, кнопка «Сохранить» всё равно в футере `DrillInPopover` (спека 3.4 не требует дробить условия поиска на под-уровни).

- [ ] **Step 2: Обновить импорты в `statistics-view.tsx`** — заменить блок импортов так, чтобы:
  - убрать `Settings2` из импорта `lucide-react` (строка 9), добавить `SlidersHorizontal` и `Search` (для двух кнопок). Итог импорта lucide: `ChevronDown, ChevronRight, ChevronsUpDown, Download, RefreshCw, Search, SlidersHorizontal`.
  - удалить строку `import { StatisticsSettingsDrawer } from "./statistics-settings-drawer";` (строка 39).
  - добавить:
    ```ts
    import { DrillInPopover } from "./drill-in-popover";
    import { buildViewSettingsLevel } from "./view-settings-levels";
    import { buildSearchSettingsLevel } from "./search-settings-levels";
    import { SaveTemplatePopover } from "./save-template-dialog";
    ```
  - в импорте из `./statistics-state` (строки 40–45) добавить `type SortState`.

- [ ] **Step 3: Убрать state дровера** — удалить строку `const [drawerOpen, setDrawerOpen] = useState(false);` (строка 135).

- [ ] **Step 4: Переименовать `handleApply` → `handleSave`** — заменить функцию (строки 179–183) на:
```ts
  function handleSave() {
    setApplied(draft);
    setExpandedKeys(new Set());
  }
```
(`setDrawerOpen(false)` удаляется — закрытие попапа делает сам `DrillInPopover`.)

- [ ] **Step 5: Почистить `handleSaveTemplate`** — в `handleSaveTemplate` (строки 185–202) удалить последнюю строку `setDrawerOpen(false);`.

- [ ] **Step 6: Заменить toolbar-кнопку на две drill-in кнопки** — в блоке toolbar (строки 324–344) заменить `div` с кнопкой «Настройки отчёта» так, чтобы справа были: кнопка «Обновить», `Separator`, и два `DrillInPopover`:
```tsx
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            aria-label="Обновить"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <DrillInPopover
            trigger={
              <>
                <SlidersHorizontal className="h-4 w-4" />
                Настройка вида
              </>
            }
            root={buildViewSettingsLevel(draft, dispatch)}
            dirty={dirty}
            onSave={handleSave}
            rootFooterExtra={
              <SaveTemplatePopover onSave={handleSaveTemplate} disabled={!dirty}>
                Сохранить как шаблон
              </SaveTemplatePopover>
            }
          />
          <DrillInPopover
            trigger={
              <>
                <Search className="h-4 w-4" />
                Условия поиска
              </>
            }
            root={buildSearchSettingsLevel(draft, dispatch)}
            dirty={dirty}
            onSave={handleSave}
          />
        </div>
```

- [ ] **Step 7: Удалить рендер дровера** — удалить блок `<StatisticsSettingsDrawer ... />` (строки 451–460) целиком.

- [ ] **Step 8: Удалить файл дровера** — `git rm src/sections/statistics/statistics-settings-drawer.tsx`.

- [ ] **Step 9: Verify** — Run: `npx tsc --noEmit -p tsconfig.json` и `npx next lint`; Expected: компиляция без ошибок, нет неиспользуемых импортов (`Settings2`, `StatisticsSettingsDrawer` удалены). Затем: open http://localhost:3000 → Статистика (нужна хотя бы одна запущенная кампания, иначе empty state) → в тулбаре нет шестерёнки и нет правого дровера; видны две кнопки «Настройка вида» и «Условия поиска»; клик по каждой открывает попап; в «Настройке вида» вход в «Управление столбцами» и «Общие параметры отчёта», кнопка «назад» возвращает в корневое меню; «Условия поиска» открывает include/exclude фильтры.

- [ ] **Step 10: Commit** — `git commit -m "feat(m3): replace stats drawer with two drill-in popover buttons"`

---

### Task 6: Проверка «Сохранить» перезагружает таблицу + защита от закрытия (M3.5 + M3.6)

Логика «Сохранить» и confirm-поповера уже реализованы в Task 3 (`DrillInPopover`) и подключены в Task 5. Эта задача — сквозная проверка чекпоинтов M3.5 и M3.6 и фиксация поведения сортировки в заголовке таблицы.

**Files:**
- Modify: `src/sections/statistics/statistics-view.tsx` (заголовок таблицы — строки 357–362)

- [ ] **Step 1: Сделать заголовок «Название» отражающим сортировку** — в `thead` (строки 357–362) индикатор `ChevronsUpDown` сейчас нефункционален. Сортировка управляется из попапа (Task 4), поэтому заголовки колонок-чисел должны лишь *отражать* активную сортировку. Заменить ячейку «Название» и числовые `th` так, чтобы числовой заголовок с активной сортировкой подсвечивался. В блоке `applied.columns.map` (строки 363–370) заменить рендер `th` на:
```tsx
              {applied.columns.map((col) => {
                const isSortCol = applied.sort?.column === col;
                return (
                  <th
                    key={col}
                    className={cn(
                      "px-4 py-3 text-right text-xs font-medium whitespace-nowrap",
                      isSortCol ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {COLUMN_HEADERS[col]}
                      {isSortCol &&
                        (applied.sort?.direction === "asc" ? (
                          <ArrowUpIcon className="h-3 w-3" />
                        ) : (
                          <ArrowDownIcon className="h-3 w-3" />
                        ))}
                    </span>
                  </th>
                );
              })}
```
Добавить `ArrowUpIcon`, `ArrowDownIcon` в импорт из `lucide-react`. Ячейку «Название» оставить как есть (`ChevronsUpDown` там — декоративный индикатор сортируемости, не трогаем).

- [ ] **Step 2: Verify M3.5 (сохранение перезагружает таблицу)** — Run: open http://localhost:3000 → Статистика → «Настройка вида» → «Управление столбцами» → снять галочку с одного столбца и задать сортировку по «Income ↓» → нажать «Сохранить»; Expected: попап закрылся, таблица перерисовалась — снятый столбец исчез, строки отсортированы по Income убыванию, заголовок Income подсвечен со стрелкой вниз. До нажатия «Сохранить» таблица НЕ менялась (не реактивно).

- [ ] **Step 3: Verify M3.5 (сохранение с глубокого уровня)** — Run: open http://localhost:3000 → Статистика → «Настройка вида» → «Общие параметры отчёта» → сменить валюту на «$ Доллары» → нажать «Сохранить» прямо на этом уровне; Expected: попап закрылся, таблица перезагрузилась с долларовыми суммами. «Сохранить» работает с любого уровня drill-in.

- [ ] **Step 4: Verify M3.6 (защита от закрытия)** — Run: open http://localhost:3000 → Статистика → «Условия поиска» → выбрать значение в любом фильтре (например, «Кампания 1») → кликнуть вне попапа (попытка закрыть); Expected: попап не закрылся, появился поповер «Закрыть без сохранения?» с кнопками «Отмена» и «Закрыть». «Отмена» оставляет попап открытым с правками, «Закрыть» закрывает и сбрасывает несохранённый draft не применяя.

- [ ] **Step 5: Verify (закрытие без правок)** — Run: open http://localhost:3000 → Статистика → «Настройка вида» → ничего не менять → кликнуть вне попапа; Expected: попап закрывается сразу, без поповера-подтверждения (`dirty === false`).

- [ ] **Step 6: Прогнать все тесты** — Run: `npx vitest run`; Expected: тесты Task 1 и Task 2 (`statistics-state.test.ts`, `mock-data.test.ts`) зелёные.

- [ ] **Step 7: Commit** — `git commit -m "feat(m3): reflect active sort in table header, finalize save + close guard"`

---

## Финальная проверка механики M3 (spec — раздел «Проверка»)

После Task 6 единым проходом убедиться (open http://localhost:3000 → Статистика):
- в статистике нет правого дровера;
- две кнопки открывают drill-in попапы Notion-стиля;
- на каждом уровне (корень, «Управление столбцами», «Общие параметры») есть «Сохранить»;
- закрытие с несохранёнными правками спрашивает подтверждение;
- «Сохранить» перезагружает таблицу, на лету таблица не перерисовывается;
- выпадашка шаблонов рядом с названием отчёта не изменилась.

Затем сообщить пользователю путь воркстри (`.worktrees/m3-statistics-popups`) и ветку (`feature/m3-statistics-popups`) — мерж и удаление воркстри за пользователем (AGENTS.md).
