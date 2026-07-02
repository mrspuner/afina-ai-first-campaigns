# PromptBar в разделе «Статистика»: три зашитых запроса

**Дата:** 2026-05-21
**Источник требований:** `~/Downloads/promptbar-statistika-zashitye-zaprosy.md` (внутренний документ заказчика, подложен в чат)
**Предыдущие связанные спеки:** `2026-05-01-chat-panel-and-trigger-popover-design.md`, `2026-05-15-afina-mechanics-spec.md`

## Цель

Дополнить существующий глобальный PromptBar тремя зашитыми (hard-coded) запросами, которые срабатывают только на странице «Статистика» и демонстрируют три качественно разных сценария взаимодействия пользователя с таблицей статистики через текстовый ввод:

1. **Лёгкий** — изменение одной оси таблицы инлайн, без drawer'а
2. **Композитный** — изменение четырёх параметров одной фразой, без drawer'а
3. **Сложный** — drawer открывается, разворачивается chain-of-thoughts, AI задаёт уточняющий вопрос, таблица не меняется

Реальная LLM не используется — фразы матчатся локальным детерминированным алгоритмом.

## Не в скоупе

- Поддержка любых других месяцев кроме июня в запросе 2
- Парсер чисел в «топ-N» — N всегда 10
- Диалог-продолжение после уточняющего вопроса запроса 3 (ответ пользователя падает в обычный fallback)
- Анимация перестроения таблицы — используем то, что есть (если потребуется улучшение, отдельная задача)
- Undo для применённых фраз — пользователь сбрасывает существующей кнопкой «Сбросить»

## Существующие компоненты, которые переиспользуем

| Компонент / модуль | Файл | Зачем |
|---|---|---|
| `SuggestionBar` | `src/sections/shell/suggestion-bar.tsx` | Добавляем 4-е состояние `stats` |
| `selectSuggestionState` | `src/state/suggestion-state.ts` | Расширяем параметром `isStatistics` |
| `Suggestions` / `Suggestion` | `src/components/ai-elements/suggestion.tsx` | Чипы под баром |
| `playComplexThinking` | `src/sections/shell/use-chat-submit.ts:39-55` | Параметризуем `{ steps, finalReply }` |
| `COMPLEX_THINKING_STEPS` | `src/lib/complex-thinking-demo.ts` | Разбиваем на `_SIGNAL` и `_STATS` |
| Chat-контекст | `src/state/chat-context.tsx` | `append`, `updatePending`, `openSidebar` — без изменений |
| DrillInPopover'ы Статистики | `src/sections/statistics/view-settings-levels.tsx`, `search-settings-levels.tsx` | Не меняем поведение, только путь диспатча |

## Архитектура

### 1. `StatisticsFilters` поднимаются в `AppState`

Сейчас `StatisticsFilters` живут в локальном `useReducer(statisticsReducer, ...)` внутри `StatisticsView`. Глобальный PromptBar физически не может изменить эти фильтры.

**Изменение:**

В `src/state/app-state.ts` добавляется поле `stats: StatisticsFilters` (начальное значение = текущий `DEFAULT_FILTERS`). 11 существующих action-типов `StatisticsAction` интегрируются в общий `Action`-юнион с префиксом `stats_`:

```ts
type Action =
  | ...существующие
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
  | { type: "stats_apply_patch"; patch: Partial<StatisticsFilters> }   // НОВЫЙ
```

`stats_apply_patch` — специальный кейс для композитного запроса 2: меняет несколько полей одной операцией. Один render, один пересчёт таблицы, согласованная анимация UI-индикаторов.

В `appReducer` добавляются 12 case-веток. Существующая логика из `statisticsReducer` переносится буква-в-букву, кроме `RESET` (становится `stats_reset`) и нового `stats_apply_patch`:

```ts
case "stats_apply_patch":
  return { ...state, stats: { ...state.stats, ...action.patch } };
```

### 2. `StatisticsView` читает из `AppState` (с сохранением draft/apply-механики)

В `StatisticsView` сейчас две копии фильтров:
- `applied: StatisticsFilters` — видимое состояние, источник истины для таблицы и CSV-выгрузки.
- `draft: StatisticsFilters` (через локальный `useReducer(statisticsReducer)`) — редактируется в DrillInPopover'ах «Настройка вида» / «Условия поиска». Коммитится в `applied` по кнопке «Сохранить» через `setApplied(draft)`. Это даёт dirty-индикатор и возможность отменить незакоммиченные правки.

**Поднимаем только `applied` в AppState.** Локальный `draft` + `useReducer(statisticsReducer)` сохраняются — иначе ломается механика попапов (живые правки вместо commit-on-save).

Файл `src/sections/statistics/statistics-view.tsx`:

- `applied` теперь читается из `useAppState().stats` (вместо локального `useState`)
- `draft` остаётся как локальный `useReducer(statisticsReducer, applied)`
- Добавляется `useEffect`, который при изменении `applied` (внешний апдейт от PromptBar) делает `dispatch({ type: "RESET", filters: applied })` — пересинхронизирует draft, чтобы при открытии попапа пользователь видел актуальное состояние
- `handleSave` вместо `setApplied(draft)` диспатчит в AppState: `appDispatch({ type: "stats_reset", filters: draft })`
- `handleTemplateSelect` аналогично: вместо `setApplied(tpl.filters)` диспатчит `stats_reset` с filters шаблона
- `PeriodField.onChange` (живой апдейт, не draft): диспатчит `stats_set_period` (apllied меняется → useEffect ресинкнет draft)

Файл `src/sections/statistics/statistics-state.ts`:

- Типы (`StatisticsFilters`, `RowKind`, `ColumnKey`, `SortState` и т.д.) остаются
- `statisticsReducer` **остаётся** — продолжает обслуживать локальный `draft`
- `DEFAULT_FILTERS` остаётся (используется как начальное значение в AppState)
- `filtersEqual` остаётся (используется для dirty-индикатора)

DrillInPopover-билдеры (`view-settings-levels`, `search-settings-levels`) **не трогаем** — они принимают локальный `dispatch` (от draft-reducer) и продолжают работать как раньше.

### 3. Скоупинг submit-обработчика по секции и подключение из глобального бара

`ShellBottomBar.handlePromptSubmit` сейчас сам рутит submit по `view.kind`: welcome → welcomeChat, Кампании → парсер фильтра, workflow → команды узлов. **Для Статистики обработчика нет — ввод молча проглатывается** (ранний `return` на check `view.kind !== "workflow"`). Drawer-вой композитор использует `useChatSubmit` отдельно.

Делаем так:
1. В `use-chat-submit.ts` в начале `submit` добавляется проверка `isOnStatisticsSection(appState)` и Statistics-матчер.
2. В `ShellBottomBar.handlePromptSubmit` добавляется новая ветка **перед** workflow-guard'ом:

   ```ts
   if (view.kind === "section" && view.name === "Статистика") {
     chatSubmit.submit({ text: rawText, segments });
     editorRef.current?.clear();
     chipsApi.clearChips();
     return;
   }
   ```

   где `chatSubmit = useChatSubmit()` объявлен на верху компонента рядом с другими хуками.

Этим достигается:
- Ввод из глобального бара на Statistics → routes через `useChatSubmit` → матчер срабатывает.
- Ввод из drawer-композитора всегда уже идёт через `useChatSubmit` → матчер срабатывает (но только когда `currentSection === "Статистика"` благодаря скоупингу внутри).

Имя поля в `AppState`, описывающее текущую секцию — `view.kind === "section" && view.name === "Статистика"` (или `activeSection === "Статистика"` — оба пишутся в AppState синхронно через `goto_stats`/`sidebar_nav`). Helper:

```ts
function isOnStatisticsSection(state: AppState): boolean {
  return state.view.kind === "section" && state.view.name === "Статистика";
}
```

## Матчинг и нормализация

Новый файл `src/lib/stats-query-matcher.ts`. Единственный экспорт:

```ts
export function matchStatsQuery(rawText: string): { id: StatsQueryId } | null
```

### Нормализация

Одна строка-пайплайн:

```ts
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.,!?…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
```

### Алгоритм матчинга

Каждый запрос задан как массив групп. Группа — массив подстрок-альтернатив. Запрос совпадает, если **в каждой группе хотя бы одна альтернатива входит** (через `String.includes`) в нормализованный текст.

```ts
type StatsQueryDef = { id: StatsQueryId; groups: string[][] };

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
```

**Порядок важен:** проверяется сверху вниз, первый совпавший выигрывает. Композитный запрос идёт раньше «группировки по кампаниям», иначе «топ-10 кампаний...» свалился бы в первый матч.

**Намеренно не ловится:** одиночные слова «кампании», «доход», «каналы» без глагола или контекста — слишком общо, риск false positives.

## SuggestionBar — новое состояние `stats`

### `src/state/suggestion-state.ts`

Сигнатура `selectSuggestionState` расширяется:

```ts
selectSuggestionState({
  hasActiveTag,
  activeTagTypedText,
  queueLength,
  isWelcome,
  isStatistics,   // НОВЫЙ
}): { kind: "welcome" | "context" | "apply-all" | "stats" | "hidden" }
```

Новое правило: если `!hasActiveTag && !isWelcome && isStatistics` → возврат `{ kind: "stats" }`. Приоритет: context > apply-all > welcome > stats > hidden. Stats-чипы не конкурируют с context-подсказками активного тега.

### `src/sections/shell/suggestion-bar.tsx`

Добавляется 4-я ветка в `AnimatePresence`:

```tsx
{state.kind === "stats" && (
  <motion.div key="sg-stats" /* same ZONE_TRANSITION */>
    <Suggestions>
      <Suggestion suggestion="покажи по кампаниям"
        onClick={() => onPickStatsQuery("покажи по кампаниям")} />
      <Suggestion suggestion="топ-10 кампаний по доходу за июнь"
        onClick={() => onPickStatsQuery("топ-10 кампаний по доходу за июнь")} />
      <Suggestion suggestion="сравни эффективность каналов"
        onClick={() => onPickStatsQuery("сравни эффективность каналов")} />
    </Suggestions>
  </motion.div>
)}
```

Новый проп `onPickStatsQuery: (phrase: string) => void` приходит из `ShellBottomBar`. Реализация в `ShellBottomBar`:

1. Вставить `phrase` в инпут (через ChipEditableInput API — установить text + очистить теги)
2. Сразу вызвать `composer.submit()` — пользователь не остаётся с заполненным инпутом, это quick action

### `src/sections/shell/shell-bottom-bar.tsx`

- Читает текущую секцию из `AppState`, передаёт `isStatistics` в `<SuggestionBar>`
- Реализует `onPickStatsQuery` (set + autosubmit, см. выше)

## Поведение трёх запросов

### Общая структура

После всех изменений в `use-chat-submit.ts`:

```ts
function submit(payload) {
  const { text, segments } = payload;
  const normalized = normalize(text);

  // Скоупинг по секции
  if (isOnStatisticsSection(appState)) {
    const match = matchStatsQuery(normalized);
    if (match) {
      runStatsQuery(match.id, text);
      return;
    }
  }

  // Существующая логика: LIGHT_QUERY, HEAVY_QUERY, триггеры, fallback
  ...
}
```

### Запрос 1: `покажи по кампаниям`

```ts
case "group-by-campaigns": {
  chat.append({ role: "user", text: userText });
  appDispatch({ type: "stats_set_rows", rows: "campaigns" });
  const replyId = chat.append({ role: "assistant", text: "", pending: true });
  schedule(() => {
    chat.updatePending(replyId, "Перегруппировал по кампаниям.");
  }, 400);
  return;
}
```

- Drawer не открывается
- Таблица перестраивается синхронно с диспатчем
- Реплика «Перегруппировал по кампаниям.» уходит в чат-историю через 400 мс (тот же тайминг, что у существующего `LIGHT_QUERY`)
- Если пользователь позже откроет drawer — увидит полную пару user + assistant

### Запрос 2: `топ-10 кампаний по доходу за июнь`

```ts
case "top-campaigns-income-june": {
  chat.append({ role: "user", text: userText });
  appDispatch({
    type: "stats_apply_patch",
    patch: {
      rows: "campaigns",
      sort: { column: "income", direction: "desc" },
      period: { preset: "custom", from: "2026-06-01", to: "2026-06-30" },
      rowCount: 10,
    },
  });
  const replyId = chat.append({ role: "assistant", text: "", pending: true });
  schedule(() => {
    chat.updatePending(replyId, "Топ-10 кампаний по доходу за июнь.");
  }, 400);
  return;
}
```

- Drawer не открывается
- Все 4 изменения применяются одним патчем → один render, согласованная перестройка таблицы и UI-индикаторов
- Константа года: `const STATS_DEMO_YEAR = 2026` рядом с матчером, чтобы при смене года прототипа поменять в одном месте

### Запрос 3: `сравни эффективность каналов`

Переиспользует `playComplexThinking` с новыми текстами:

```ts
// в complex-thinking-demo.ts
export const COMPLEX_THINKING_STEPS_STATS: ComplexThinkingStep[] = [
  { reasoning: "Запрос про сравнение эффективности каналов. Эффективность — неоднозначный термин.", delayMs: 700 },
  { reasoning: "Возможные интерпретации: конверсия (AR%), доход (Income), отношение Income/Expenses, отклик (Clicks/Sends).", delayMs: 900 },
  { reasoning: "Нужно уточнить у пользователя, какую метрику он имеет в виду.", delayMs: 700 },
];

export const COMPLEX_THINKING_FINAL_REPLY_STATS =
  "Я понял, что нужно сравнить каналы. Какую метрику использовать для оценки эффективности — конверсию, доход, ROI или отклик?";

// Существующие COMPLEX_THINKING_STEPS / COMPLEX_THINKING_FINAL_REPLY
// переименовать в *_SIGNAL и сохранить значения как есть.
```

```ts
// в use-chat-submit.ts — параметризованный playComplexThinking
function playComplexThinking({ steps, finalReply }) {
  chat.openSidebar();
  /* ... существующая логика, читает steps вместо константы ... */
}

// case в runStatsQuery
case "compare-channels": {
  chat.append({ role: "user", text: userText });
  playComplexThinking({
    steps: COMPLEX_THINKING_STEPS_STATS,
    finalReply: COMPLEX_THINKING_FINAL_REPLY_STATS,
  });
  return;
}

// существующий HEAVY_QUERY ветка вызывает с _SIGNAL вариантами
```

- Drawer открывается через `chat.openSidebar()`
- 3 шага размышлений (с `ThinkingDots`) → финальный уточняющий вопрос
- Таблица не меняется

## Краевые случаи

| Случай | Поведение |
|---|---|
| Пользователь повторяет ту же фразу | В чат уходят ещё одна пара сообщений. `stats_apply_patch` отдаст новый объект, даже если значения те же — таблица перерендерится. Это допустимое поведение для прототипа; не оптимизируем |
| Сброс фильтров пользователем после фразы | Существующая кнопка «Сбросить» диспатчит `stats_reset`, возвращает к `DEFAULT_FILTERS`. Никакой отдельной «отмени фразу» нет |
| Drawer уже открыт во время Q1/Q2 | Пара user + assistant просто появляется в открытом drawer'е, изменения таблицы происходят параллельно |
| Drawer уже открыт во время Q3 | `chat.openSidebar()` идемпотентен — цепочка размышлений доигрывается в открытом drawer'е |
| Прерывание Q3 новым сабмитом | Существующее поведение — шаги доигрываются (это часть существующего механизма `playComplexThinking`, не правим в этом скоупе) |
| Активный тег в инпуте на странице Статистики | `hasActiveTag === true` → побеждает context-state, stats-чипы скрываются. Корректно |
| Фраза введена не в Статистике | Скоупинг отсекает на верхнем уровне, попадает в существующий fallback (generic mock reply) |
| Пользователь печатает «за июль» вместо «июнь» | Не матчится (группа требует именно `"июн"`) — намеренно. Парсер месяцев не в скоупе |
| Ответ пользователя на уточняющий вопрос Q3 | Падает в fallback. Это документированное ограничение |

## Сводный список файлов

**Изменяются:**

- `src/state/app-state.ts` — добавить `stats` slice + 12 action-кейсов в `appReducer`
- `src/sections/statistics/statistics-view.tsx` — `applied` читать из AppState, локальный `draft` оставить, добавить `useEffect`-ресинк, `handleSave`/`handleTemplateSelect`/`PeriodField.onChange` диспатчить в AppState
- `src/sections/statistics/statistics-state.ts` — без изменений (типы + `statisticsReducer` для локального draft остаются)
- `src/sections/statistics/view-settings-levels.tsx` — без изменений
- `src/sections/statistics/search-settings-levels.tsx` — без изменений
- `src/lib/complex-thinking-demo.ts` — разбить на `_SIGNAL` и `_STATS` константы
- `src/sections/shell/use-chat-submit.ts` — параметризовать `playComplexThinking`, добавить ветку Statistics-матчинга со скоупингом
- `src/state/suggestion-state.ts` — добавить параметр `isStatistics` + state `stats`
- `src/sections/shell/suggestion-bar.tsx` — добавить ветку `state.kind === "stats"` с 3 чипами + проп `onPickStatsQuery`
- `src/sections/shell/shell-bottom-bar.tsx` — подключить `useChatSubmit` для Statistics-ветки в `handlePromptSubmit`, пробросить `isStatistics` в SuggestionBar, реализовать `onPickStatsQuery` (set + autosubmit)

**Новые:**

- `src/lib/stats-query-matcher.ts` — чистая функция матчинга + `STATS_DEMO_YEAR`
