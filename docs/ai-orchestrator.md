# AI-оркестратор Афины: архитектура

**Статус:** Реализован (план 004)
**Дата:** 2026-06-11
**Наследник:** `docs/ai-workflow-integration-spike.md` (спайк 002 — AI-парсер структурных команд воркфлоу)

---

## 1. Схема потока

```
PromptBar / ChatDrawer
    │
    ▼
use-chat-submit.ts (финальный фоллбек)
    │   Клиент собирает:
    │     { text, history ≤ 8 (без pending), context { screen, dataSummary } }
    │
    ▼
POST /api/ai/assist
    │
    ▼
4-слойный системный промпт (buildSystemPrompt — orchestrator-prompt.ts):
    1. Роль и голос (ROLE_AND_VOICE): уверенный, точный, ненавязчивый
    2. База знаний Афины (AFINA_KNOWLEDGE — afina-knowledge.ts): ~3–4K токенов
    3. Контекст момента: screen + dataSummary из data-summary.ts
    4. (Инструменты регистрируются отдельно через Vercel AI SDK tool())
    │
    ▼
Gemini 2.5 Flash (google() из @ai-sdk/google, toolChoice: "required")
    │   Function calling — одна из зарегистрированных функций за ход
    │
    ▼
AssistResult: { kind: "answer" | "clarify" | "none" }
    │
    ▼
Клиент: use-chat-submit.ts диспатчит в chat.updatePending(id, text)
    │   answer → показать ответ напрямую
    │   clarify → вопросы через join(" ")
    │   null / none → офлайн-каталог (lookupInformationalReply) + warmFallbackReply
```

**Контекст `screen`** собирается из `view.kind`:
- `section:Кампании`, `section:Сигналы`, `section:Статистика`, `section:Настройки`
- `workflow`, `guided-signal`, `welcome`, `survey`, …

**`dataSummary`** — компактный плоский текст, строится функцией `buildDataSummary({ campaigns, signals })` из `src/lib/ai/data-summary.ts`. Содержит: число кампаний, имена/статусы/бюджеты (до 20), число сигналов, типы/объёмы/сегменты (до 20). Параметры нод и аудитория не уходят.

---

## 2. Таблица инструментов

| Инструмент | Kind | Описание | Статус |
|------------|------|----------|--------|
| `answer` | `"answer"` | Ответить текстом (1–3 предложения в голосе продукта) | Реализован (план 004) |
| `clarify` | `"clarify"` | Задать 1–2 уточняющих вопроса (один раунд) | Реализован (план 004) |
| `edit_workflow` | `"workflow-ops"` | Редактировать граф воркфлоу через NL-команду | Реализован (план 005) |
| `rebuild_workflow` | `"rebuild"` | Пересобрать граф полностью по описанию | Реализован (план 005) |
| `edit_node_params` | `"node-params"` | Изменить параметры конкретной ноды | Реализован (план 005) |
| `undo_last` | `"undo"` | Откатить последнюю AI-правку графа | Реализован (план 005) |
| `configure_stats` | `"stats"` | Применить фильтры/группировку в разделе Статистика | Реализован (план 006) |
| `navigate` | `"navigate"` | Перейти в раздел / открыть кампанию / открыть сигнал | Реализован (план 006) |
| `edit_triggers` | `"triggers"` | Добавить/исключить домены в триггере | Реализован (план 006) |

Инструменты фильтруются по `context.screen` (и `selectedNode`, `undoAvailable`) — на экране воркфлоу подключаются граф-инструменты (`edit_workflow`, `rebuild_workflow`, `edit_node_params`, `undo_last`). `configure_stats` зарегистрирован **безусловно** — доступен с любого экрана. Остальные инструменты регистрируются по условию экрана/контекста.

### Аргументы граф-инструментов

**`edit_workflow`** — принимает плоский массив `ops` (тип `StructuralOp[]` из `ops-wire-schema.ts`). Схема намеренно **не discriminated-union** — плоская форма `{ kind, ...payload }` позволяет Gemini генерировать корректный JSON без подсказки о разрешённых discriminant-значениях. Discriminated union в одном Zod-объекте требует от модели знания всех вариантов kind заранее, что приводило к генерации `{}` при незнакомых операциях (баг, выявленный live-вызовом серии 005, зафиксирован в `docs/plans/005-ai-workflow-tools.md §17`).

**`rebuild_workflow`** — принимает `{ nodes, edges, assumptions }` (тип `RebuildGraphSpec` из `rebuild-schema.ts`). После получения клиент прогоняет граф через `validateAiGraph()` из `ai-graph-validation.ts`: если валидация не прошла — ошибка отображается в чате без применения. Условие регистрации: `screen === "workflow"`.

**`edit_node_params`** — принимает `{ nodeId, patch, confirmation }`. `patch` — `Record<string, unknown>` (сервер не может строго типизировать union по kind ноды); редьюсер мерджит patch поверх существующих params, невалидные ключи безвредны. Условие регистрации: `screen === "workflow" && selectedNode != null`.

**`undo_last`** — принимает пустой объект `{}`. Условие регистрации: `screen === "workflow" && undoAvailable === true`.

### Аргументы инструментов план 006

**`configure_stats`** — принимает `{ patch: StatsPatch, confirmation: string }`. `StatsPatch` (`stats-patch-schema.ts`) охватывает rows/subRows/rowCount/sort/clearSort/period. `toFiltersPatch(patch)` нормирует wire-форму в `Partial<StatisticsFilters>` (clearSort:true → sort:null). Клиент диспатчит `stats_apply_patch`. Инструмент зарегистрирован **безусловно** — доступен с любого экрана, не только из раздела Статистика.

**`navigate`** — принимает `{ target: { kind } }`, где target — discriminated union трёх форм:
- `{ kind: "section", name: SectionName }` — переход в раздел: `sidebar_nav`.
- `{ kind: "campaign-workflow", campaignId: string }` — открыть воркфлоу кампании: `open_workflow` (launched = status !== "draft"). Несуществующий id → confirmations не накапливается → офлайн-фоллбек.
- `{ kind: "signal", signalId: string }` — открыть экран сигнала: `signal_opened`. Несуществующий id — аналогично.

Wire-схема для Gemini живёт в `navigate-schema.ts` (плоская форма без discriminated union); клиент получает уже валидированный контракт через `assistResultSchema`.

**`edit_triggers`** — принимает `{ add: string[], exclude: string[], clearAdded?: boolean, clearExcluded?: boolean, confirmation: string }`. Требует активного trigger-тега в промпт-баре (activeTrigger в контексте). Клиент вызывает `triggerEdit.applyToTrigger` для каждой операции: clear-added/clear-excluded/edit. Если activeTrigger не передан — результат игнорируется, confirmations пусты → офлайн-фоллбек.

---

## 2a. Откат (undo)

Механика отката — глубина 1, хранение в памяти компонента:

1. **Снапшот** — перед применением каждой структурной AI-операции (`structuralOps`) или rebuild в `workflow-view.tsx` внутри `apply(prev)` колбэка `runCycle` записывается `aiSnapshotRef.current = prev`. Флаг `workflow_ai_undo_availability: true` ставится сразу же — гарантируя, что снапшот уже записан в момент активации флага.
2. **Подсказка** — когда `state.aiUndoAvailable === true` и workflow не запущен (`!v.launched`), `selectPromptSuggestions` добавляет item `{ id: "ai-undo", label: "↩ Откатить" }` первым в список подсказок воркфлоу.
3. **Применение** — клик по подсказке или `result.kind === "undo"` от оркестратора диспатчит `workflow_ai_undo_request`; undo-эффект в `workflow-view.tsx` восстанавливает `aiSnapshotRef.current` и очищает флаг.
4. **Сброс при анмаунте** — cleanup-эффект в `workflow-view.tsx` диспатчит `workflow_ai_undo_availability: false` при размонтировании компонента (например, при запуске кампании).
5. **Страховка** — если `workflow_ai_undo_request` пришёл при `null`-снапшоте (edge case: размонтирование между событиями), флаг принудительно сбрасывается перед `return`.

---

## 2b. Составные просьбы (план 006)

Оркестратор может вернуть до **2 результатов** в одном ответе (например: `navigate` + `stats`). Порядок исполнения совпадает с порядком в `results[]`. Правила:

- Для граф-видов (`workflow-ops`, `rebuild`, `node-params`, `undo`) действует guard `graphOpApplied`: только первый из них исполняется — защита от двойной правки одного графа за один сабмит.
- Кросс-экранная правка графа (navigate + graph-op в одном ответе) **запрещена** логически: navigate меняет view до того, как граф применяется — результат непредсказуем. Оркестратор не должен комбинировать эти виды (промпт-контракт). Если такой ответ придёт — graph-op будет заблокирован guard'ом.
- `stats`, `navigate`, `answer`, `clarify` — исполняются в любой комбинации.

Формат ответа сервера: `{ results: AssistResult[] }` (план 006); для обратной совместимости `fetchAssistMulti` принимает также старый одиночный `AssistResult`.

---

## 3. Контракт

**Файл:** `src/lib/ai/assist-contract.ts`

Принцип: **AI заменяет парсеры, не аппликаторы.** LLM возвращает те же типизированные структуры, которые сегодня выдаёт regex/каталог. Существующие аппликаторы (chat.updatePending, dispatch-пайплайн, анимации воркфлоу) не меняются.

Ключевые типы:
- `AssistRequest` — `{ text, history: HistoryMessage[], context: AssistContext }`
- `AssistContext` — `{ screen: string, dataSummary: string, wizardStep?: { step, title }, activeTrigger?: { id, label }, graph?, selectedNode?, undoAvailable? }`
- `AssistResult` — discriminated union: `{ kind: "answer" | "clarify" | "none" | "workflow-ops" | "rebuild" | "node-params" | "undo" | "stats" | "navigate" | "triggers" }`
- `AssistResponse` — `{ results: AssistResult[] }` (план 006, max 2)

Zod-схемы (`assistRequestSchema`, `assistResultSchema`, `assistResponseSchema`) используются для валидации как на клиенте (`fetchAssistMulti`), так и на сервере.

Клиентский слой: `fetchAssistMulti` (приоритетный) возвращает `AssistResult[] | null`. Deprecated `fetchAssist` сохранён для документации — в потребителях (`use-chat-submit.ts`, `prompt-composer.tsx`) не используется.

---

## 4. Fallback-цепочка (use-chat-submit, план 006)

```
Пользователь отправил свободный вопрос в чат
    │
    ▼
isAiParserEnabled()? — нет (localStorage "off") ──→ useAi=false
    │
   да
    │
    ▼
assistAvailable? — нет (ключ не прошёл пробу) ──→ useAi=false
    │
   да (useAi=true)
    │
    ▼
Быстрые предварительные ветки (до AI):
    • email-редактор: прямая обработка черновика
    • read-only workflow + node-тег: ответ о дублировании
    • домен/доступн: checkDomainAvailability
    • LIGHT_QUERY / HEAVY_QUERY: demo-функции
    • trigger-сегмент + parsed.kind !== "fallback": regex-fast-path (мгновенно)
    │
    ▼  (все быстрые ветки пропущены ИЛИ trigger-fallback)
канированные stats-запросы? — ТОЛЬКО при useAi=false
    │
    ▼
fetchAssistMulti({ text, history, context }) — AbortSignal.timeout(6000)
    │
    ├── null (таймаут/ошибка/схема) ───→ офлайн-путь
    │
    └── results[] → executeAssistResults():
        ├── stats   → stats_apply_patch(toFiltersPatch(patch)) + confirmation
        ├── navigate→ sidebar_nav / open_workflow / signal_opened + confirmation
        ├── triggers→ applyToTrigger (если activeTrigger в контексте) + confirmation
        ├── answer  → confirmation.push(text)
        ├── clarify → confirmation.push(questions.join(" "))
        └── (all confirmations empty) → офлайн-путь

Офлайн-путь:
    lookupInformationalReply(text) ?? warmFallbackReply()
    (каталог ~40 записей + тёплая заглушка — бит-в-бит как без ключа)
```

**Важно:** путь «нет ключа» (`!assistAvailable || !isAiParserEnabled()`) — **синхронный**, без единого `await`. Поведение бит-в-бит как до интеграции.

**Privacy-граница:** на сервер уходят текст вопроса, история сессии (≤8 сообщений), сводка моковых данных кампаний/сигналов. Тексты запросов и ответов модели **не логируются** (только тип ошибки при сбое — `"rate-limited"` или `"ai-failed"`). Полный стейт, параметры нод, данные аудитории, ключи — не уходят никогда.

---

## 5. Как добавить новый инструмент

1. **Zod-схема аргументов** — описать `inputSchema: z.object({ ... })` прямо в определении `tool()` в `src/app/api/ai/assist/route.ts`.
2. **`tool()` в route.ts** — зарегистрировать инструмент в объекте `tools`, `execute` пишет в `result`.
3. **Kind в `assistResultSchema`** — добавить вариант в discriminated union в `src/lib/ai/assist-contract.ts` (и соответствующий тип).
4. **Ветка исполнения на клиенте** — добавить `else if (result?.kind === "новый_инструмент")` в `use-chat-submit.ts` (финальный фоллбек) или в соответствующий обработчик.
5. **Кейсы в evals** — добавить тесты в план 007 (экзамен оркестратора): ожидаемый kind + ключевые слова в тексте ответа.

---

## 6. Файловая карта

| Файл | Роль |
|------|------|
| `src/app/api/ai/assist/route.ts` | Route handler: GET (проба ключа), POST (LLM-вызов, инструменты) |
| `src/lib/ai/assist-contract.ts` | Zod-схемы + TypeScript-типы запроса/ответа |
| `src/lib/ai/assist-client.ts` | `fetchAssistAvailability()`, `fetchAssistMulti()` — клиентский слой (план 006) |
| `src/lib/ai/stats-patch-schema.ts` | `StatsPatch` схема + `toFiltersPatch()` — wire → StatisticsFilters |
| `src/lib/ai/orchestrator-prompt.ts` | `buildSystemPrompt()`, `buildMessages()` — системный промпт |
| `src/lib/ai/afina-knowledge.ts` | `AFINA_KNOWLEDGE` — база знаний о продукте (~3–4K токенов) |
| `src/lib/ai/data-summary.ts` | `buildDataSummary()` — сводка стейта для промпта |
| `src/sections/shell/use-chat-submit.ts` | Точка интеграции: финальный фоллбек → оркестратор |
| `src/sections/shell/prompt-composer.tsx` | Воркфлоу-ветка: граф-инструменты через оркестратор (план 005) |
| `src/lib/ai/graph-summary.ts` | `summarizeGraph()` — компактная сводка нод/рёбер для контекста |
| `src/lib/ai/rebuild-schema.ts` | `rebuildGraphSchema`, `buildGraphFromSpec()` — спека и билдер пересборки |
| `src/state/ai-graph-validation.ts` | `validateAiGraph()` — валидация графа перед применением rebuild |
| `src/sections/campaigns/workflow-graph-cache.ts` | `getCachedGraph()` / `setCachedGraph()` — персистентный кэш текущего графа |
| `src/state/suggestion-registry/views.ts` | `resolveWorkflowScenario(aiUndoAvailable)` — подсказка «↩ Откатить» |
| `evals/cases.mjs` | 40 тест-кейсов экзамена оркестратора |
| `scripts/run-evals.mjs` | Runner экзамена: `npm run eval` |

---

## 7. Экзамен (evals)

Оркестратор покрыт автоматическими поведенческими тестами (`evals/cases.mjs`, 40 кейсов). Подробная документация: [`evals/README.md`](../evals/README.md).

**5 моментов для запуска:**

1. При разработке AI-слоя (основной цикл: провал → правка знаний/промпта → точечный перегон → полный прогон).
2. Перед коммитом правок AI-файлов (`afina-knowledge.ts`, `orchestrator-prompt.ts`, схемы инструментов, `route.ts`).
3. Перед демо или коридорным тестом.
4. После коридорного теста — для новых кейсов из журнала.
5. При смене модели (`AFINA_AI_MODEL`).

```bash
npm run dev -- -p 3001   # dev-сервер с ключом
npm run eval              # полный прогон
npm run eval -- <имя>    # фильтр по имени кейса
```

---

## 8. Журнал (aiLog)

Клиентский журнал AI-обменов для коридорных тестов. Реализован в `src/state/dev-config.ts`.

- **Флаг:** `isAiLogEnabled()` — по умолчанию `false` (приватность). Включается в дев-панели переключателем «Журнал AI».
- **Cap:** 200 последних записей (FIFO), хранятся в `localStorage`.
- **Выгрузка:** кнопка «Выгрузить журнал» в дев-панели — скачивает JSON-файл.
- **Формат записи:** `{ at: ISO, text: string, resultKinds: string[], outcome: "applied"|"clarify"|"answer"|"fallback" }`.
- **Очистка:** кнопка «Очистить» в дев-панели.

Журнал — главный источник новых кейсов экзамена. Кандидаты: `outcome: "fallback"` (AI не справился) и `outcome: "applied"` при подозрительных результатах.

Памятка фасилитатора коридорного теста: [`docs/ai-corridor-testing.md`](./ai-corridor-testing.md).
