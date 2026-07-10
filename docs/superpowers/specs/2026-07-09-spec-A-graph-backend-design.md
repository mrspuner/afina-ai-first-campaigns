# Спека A — Бэкенд графа: чистка `merge`, нода «Статистика», формализация подзаголовков

**Пункты:** 12a, 12b, 12c. **Владелец файлов:** модель нод + бэкенд графа (см. обзор).
**Порядок мержа:** первым (A → B → C). **Worktree:** off `integration`.
Все номера строк сверены с `integration`. Формат каждого пункта: AS IS → TO BE → файлы → критерии.

---

## 12a. Полное удаление типа `merge`

### AS IS
Узла «Слияние» в графе уже нет (все билдеры сходят ветки напрямую, в шаблонах комментарии «Слияние удалено»). Но тип `merge` и обвязка остаются:

**Обязательные (сломают компиляцию `Record<WorkflowNodeType,…>` / mapped-типы, если оставить):**
- `src/types/workflow.ts:14` — `| "merge"` в `WorkflowNodeType`
- `src/types/workflow.ts:84` — `export type MergeParams = { kind: "merge" };`
- `src/types/workflow.ts:131` — `MergeParams` в юнионе `NodeParams`
- `src/types/workflow.ts:182` — `merge: "logic",` в `NODE_CATEGORY`
- `src/sections/campaigns/node-visuals.ts:8` — импорт `Merge` из lucide
- `src/sections/campaigns/node-visuals.ts:41` — `merge: { border:"#3730a3", … }` в `NODE_STYLES`
- `src/sections/campaigns/node-visuals.ts:66` — `merge: Merge,` в `NODE_ICON`
- `src/state/node-actions.ts:244` — `merge: [],`
- `src/state/node-field-editability.ts:72` — `merge: {},`
- `src/state/workflow-validation.ts:24` — `case "merge":`
- `src/sections/campaigns/workflow-view.tsx:200` — `case "merge":` в `fallbackParamsPatch` **← файл shared с C; регион A**

**Строковые/каталожные:**
- `src/lib/ai-workflow-schema.ts:27` — `"merge",` в перечне типов (путь: **`src/lib/`**, не `src/lib/ai/`)
- `src/state/structural-commands.ts:101` — `слияние: "слияние",` (**оригинал пропустил**)
- `src/state/structural-commands.ts:102` — `merge: "слияние",` (алиас)
- `src/state/structural-commands.ts:283` — `merge: "Слияние",` в `TYPE_LABEL`
- `src/state/suggestion-registry/node-context.ts:208–210` — `howNode("merge-how", …)`, `ask("merge-node-dedup", …)`, `ask("merge-node-priority", …)`
- `src/state/suggestion-registry/node-context.ts:225` — `merge: MERGE,` в `CATALOG`

**Пользовательский AI-текст (оригинал пропустил, важно):**
- `src/lib/ai/afina-knowledge.ts:24` — прозой описывает граф как «…сплиттер, **слияние**…». Ассистент рассказывает пользователю про узел, которого нет.

**Комментарии (по желанию):** `workflow-view.tsx:170`, `workflow-validation.ts:4`, `suggestion-registry/node-context.ts:6`; «Слияние удалено» в `workflow-templates.ts:137,229,318,411,476` и `channel-nodes.ts:7,182,193,302`.

### TO BE
Удалить тип `merge` и всю обвязку из перечисленного. Обновить `afina-knowledge.ts:24` (убрать «слияние» из описания графа). Обновить тесты (см. ниже).

> **Координация с B:** строка `merge: () => []` в `PARAM_RENDERERS` (`node-card-content.tsx:82`) — файл владельца **B**. A удаляет `merge` из `NodeParams`; B на ребейзе увидит ошибку exhaustive-типа и уберёт эту строку (одновременно добавит `statistics: () => []` из 12b). В спеке B это зафиксировано.

### Ломающиеся тесты (обновить/удалить)
- `src/sections/campaigns/campaign-cost.test.ts:89,180–196,209` — строит `{ kind: "merge" }`-узлы, ассертит `reach.merge === 1000` («sums incoming reach at a merge node»). Удалить merge-специфичный кейс.
- `src/state/workflow-validation.test.ts:105–106` — `nodeNeedsAttention(paramNode("m", { kind: "merge" }))`. Удалить.
- `src/state/suggestion-registry/registry.test.ts:18,23` — `{ nodeType: "merge", … }`. Удалить.
- `src/state/node-field-editability.test.ts:12` — ожидает `"merge"` среди типов. Убрать.
- (Останутся зелёными: `channel-nodes.test.ts`, `workflow-templates.test.ts` — они ассертят отсутствие merge.)

### Критерии приёмки
- [ ] `rg -n "\"merge\"|MergeParams|merge-how|merge-node|: MERGE|слияние" src/` не находит ссылок на узел merge (кроме нейтральных `twMerge`/`mergeProps`).
- [ ] `afina-knowledge.ts` больше не упоминает узел «слияние».
- [ ] `npx tsc --noEmit` и `npm test` проходят (4 теста обновлены).

---

## 12b. Нода «Статистика» — общий терминал-сток (без параметров)

### AS IS
Терминалы: `success` (`SuccessParams { goal }`, `types/workflow.ts:119–122`, label «Успех», `isSuccess:true`) и `end` (`EndParams { reason? }`, `:124–127`, label «Конец»). Ветки сходятся в них. Куда уходит аудитория дальше — граф не показывает.
Экран статистики кампании **уже существует**: `goto_stats(campaignId)` (action `app-state.ts:337`, редьюсер `:863–884` → `view {kind:"section", name:"Статистика", campaignId}`), вызывается кнопкой «Статистика» на карточке (`campaign-screen.tsx:140–146`).
`validateWorkflow` проверяет success-путь по флагу `isSuccess` (`workflow-validation.ts:75–77`), а не по типу терминала — значит не-`isSuccess` нода `statistics` после `success`/`end` не сломает гейтинг запуска.

### TO BE
Добавить **один** тип-терминал `statistics` (footprint симметричен удаляемому `merge` — тоже без полей). Все `success`/`end` → в неё рёбрами. Клик по ноде → `goto_stats(campaignId)`. Неудаляемая (см. `isDeletableNodeType`, п.9). Подзаголовок — из 12c.

Точки регистрации:
1. `types/workflow.ts` — `WorkflowNodeType` (добавить `| "statistics"`); `StatisticsParams = { kind: "statistics" }` в юнион `NodeParams` (`:129–132`); `NODE_CATEGORY` (`:173–192`) — `statistics: "logic"` (или отдельная категория терминала, по образцу `success`/`end`).
2. `node-visuals.ts` — `NODE_STYLES` (`:28–53`) добавить стиль (тёплый нейтрал/бренд-хью, не жёлтый фон); `NODE_ICON` (`:55–73`) — иконка (напр. `ChartNoAxesColumn`/`Activity`/`BarChart3` из lucide).
3. `workflow-validation.ts` — `case "statistics":` в `nodeNeedsAttention` (терминал не требует внимания).
4. `node-actions.ts` / `node-field-editability.ts` — `statistics: []` / `statistics: {}` (exhaustive-карты по `NodeParams["kind"]`).
5. `workflow-view.tsx` `fallbackParamsPatch` — `case "statistics": return null;`.
6. **Шаблоны и билдеры** — добавить узел `statistics` + рёбра `success→statistics` / `end→statistics`:
   - 6 legacy-шаблонов в `workflow-templates.ts` (учесть, что `withSignalPath` перестраивает вход — терминалы не трогает).
   - Билдеры: `buildLinearChannelTemplate` (`:335–406`), `buildSegmentedChannelTemplate` (`:414–518`), `minimalTemplate` (`:536–561`); генерация терминалов в `channel-nodes.ts` (терминалы там создаются динамически — учесть все ветки).
   - **Только ОДНА нода `statistics` на граф** — все терминалы сходятся в неё (fan-in), не по одной на ветку.
7. `rebuild-schema.ts` (`:8–11`, `:33–48`) — **исключить** `statistics` из AI-rebuild enum (терминал добавляется автоматически, не через ИИ). Задокументировать.
8. Клик по ноде: обработчик в графе (там же, где клик по другим нодам открывает карточку) должен для `statistics` вызывать `goto_stats(currentCampaignId)` вместо раскрытия карточки. Найти обработчик выбора ноды (`workflow_node_selected`) и добавить спец-ветку для `statistics`.

> **Координация с B:** `PARAM_RENDERERS` в `node-card-content.tsx` (B) получит `statistics: () => []`. Зафиксировано в спеке B.

### Тексты
Подзаголовок (из 12c): до запуска — «Результаты после запуска»; после — ключевая метрика (напр. «CR 4.2% · 1 240 отправок»).

### Критерии приёмки
- [ ] В каждом шаблоне все `success`/`end` ведут в единственный узел «Статистика».
- [ ] Клик по ноде «Статистика» открывает статистику кампании (`goto_stats`); карточка ноды при этом не раскрывается.
- [ ] Узел неудаляем (`isDeletableNodeType("statistics") === false`).
- [ ] `tsc`/тесты проходят; `validateWorkflow` не ломается на графе с `statistics`.

---

## 12c. Формализация заголовка/подзаголовка по типам нод

### AS IS
`computeDynamicSublabel` (`src/sections/campaigns/workflow-view.tsx:85`) обрабатывает **только** `wait` (мин/ч/дни), `condition` (Открыл?/Не открыл?/Кликнул?/…), `split` (По сегменту/Рандомно/Поровну); прочие → `null`. Остальные подзаголовки — произвольные строки из шаблонов («Регистрация» `workflow-templates.ts:73`, «Welcome» `:75`, «Напоминание» `:79`), не связанные с контентом.

**Текущие заголовки (не совпадают с целью):**
- `condition` → **«Условие»** (`workflow-templates.ts:100,157,188`; `channel-nodes.ts:308,345`; `TYPE_LABEL structural-commands.ts:282`). **НЕ «Проверка»** — «Проверка» только у legacy `"new"`-узлов (`types/workflow.ts:266,379`), это другой тип.
- `split` → **«Сплиттер»** (базовый граф «Split по сегментам»).
- `ivr` → **«Звонок»** (`workflow-templates.ts:159,213`; `TYPE_LABEL:287`).

### TO BE
Жёсткая привязка тип→подзаголовок; подзаголовок выводится из контента узла. Заголовки — из фиксированного маппера (не из произвольных строк шаблона).

| Тип | Заголовок (было → стало) | Подзаголовок (источник) |
|---|---|---|
| `source` | Сигнал | `SignalParams.fileName` · `count` («имя · объём базы»; `count` в черновике 0) |
| `scoring` | Скоринг | «N интересов · M триггеров» (`ScoringParams.interests[]`/`triggers[]`) |
| `split` | **Сплиттер → Ветвление** | `splitSummary(params)` (общий хелпер, см. ниже) |
| `wait` | Задержка | «1 день» / «До: <событие>» (текущая динамика) |
| `condition` | **Условие → Взаимодействие** | «Открыто» / «Кликнуто» / «Доставлено» (`ConditionParams.trigger`; маппер `conditionTriggerLabel`, `node-card-content.tsx:62`) |
| `sms`/`email`/`push` | канал | `email`→шаблон (`EmailParams.emailId`); **`sms`/`push`→«—»** (поля шаблона нет — см. gap) |
| `ivr` | **Звонок → IVR** | сценарий (`IvrParams.scenario`) |
| `success` | Успех | цель (`SuccessParams.goal`) |
| `end` | Конец | причина (`EndParams.reason`) |
| `statistics` | Статистика | «Результаты после запуска» / метрика |

**Реализация:**
- Заменить `computeDynamicSublabel` на полный маппер `type → sublabel` (все типы из таблицы), читающий из `data.params`. Держать в `workflow-view.tsx` (владелец) или вынести в отдельный `state/node-sublabel.ts` и импортировать.
- Заголовки: обновить `TYPE_LABEL` (`structural-commands.ts:282` condition, split, `:287` ivr) и точки создания узлов в `workflow-templates.ts` / `channel-nodes.ts` (condition→«Взаимодействие», split→«Ветвление», ivr→«IVR»). Убрать произвольные sublabel-строки из шаблонов (передавать пусто/каноничные).
- **Общий хелпер `splitSummary(params: SplitParams): string`** — новый экспорт из `src/state/split-segments.ts` (там уже `splitSegmentBranches`). Возвращает «По сегменту · N веток» / «Поровну · N» / «Рандомно · N» из `by` + `branches`. Используется здесь (12c) и в п.3 спеки B (`split-fields.tsx` его импортирует — **не дублировать логику**).

**Gap (задокументировать, не чинить):** `SmsParams` (`types/workflow.ts:29–35`) и `PushParams` (`:47–52`) не имеют поля шаблона — только `EmailParams.emailId` (`:44`). Поэтому подзаголовок sms/push = «—». Добавление поля шаблона к sms/push — вне скоупа.

### Критерии приёмки
- [ ] Подзаголовок каждого типа соответствует таблице и обновляется при изменении контента узла.
- [ ] Заголовки: `condition`=«Взаимодействие», `split`=«Ветвление», `ivr`=«IVR».
- [ ] Нет узлов с произвольным sublabel из шаблона.
- [ ] `splitSummary` — единственный источник сводки сплиттера (импортируется и здесь, и в `split-fields.tsx`).

---

## Экспортируемый контракт для спеки B

- `isDeletableNodeType(type: WorkflowNodeType): boolean` — новый экспорт из `src/state/structural-commands.ts`. Единый источник «какие типы удаляемы». Удаляемы: `sms`, `email`, `push`, `ivr`, `wait`, `split`, `condition`. Неудаляемы: `source`/`signal`, `scoring`, `success`, `end`, `statistics`. **A также добавляет `scoring` и `statistics` в guard `applyRemove`** (`structural-commands.ts:584–589`, сейчас блокирует только `source`/`signal`/`success`/`end`) — используя тот же список. B импортирует `isDeletableNodeType` для видимости кнопки-корзины.
- `splitSummary(params)` из `src/state/split-segments.ts` (см. 12c).
