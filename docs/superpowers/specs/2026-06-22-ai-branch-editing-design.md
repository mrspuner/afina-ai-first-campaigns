# AI-редактирование графа: ветки/условия (#7) — Design

**Дата:** 2026-06-22
**Статус:** дизайн утверждён (брейншторм с визуальным компаньоном), готов к написанию плана.
**Источник:** aim batch 3 правка #7; скоупинг — `docs/superpowers/specs/2026-06-22-workflow-ai-backlog.md` §2.
**Объём (решение брейншторма):** «Полный» — все три части ниже.

## Проблема

AI правит граф через промпт-бар двумя путями, и оба сейчас «плоские»:
- `rebuild_workflow` (`rebuildGraphSchema`, `src/lib/ai/rebuild-schema.ts`): схема **уже** поддерживает ветки (произвольные `from→to` + label, `nodeType` включает condition/split/merge), но `buildGraphFromSpec` раскладывает ноды линейно по индексу (`position.x = STEP*(i+1)`, `y` зависит только от `end`), игнорируя топологию рёбер → ветки визуально вырождаются в кашу/линию. `relayoutGraph` на rebuild не вызывается.
- `edit_workflow` (`wireOpSchema`, `src/state/ops-wire-schema.ts`): плоские операции add/remove/replace с одиночной врезкой по ребру; нет операции «добавить условие с двумя ветками».

## Ключевое: мы НЕ заперты в логике условий

Дизайн оставляет свободу. Подтверждено по `src/state/ai-graph-validation.ts`.

- **`rebuild_workflow` — свободная пересборка.** Модель эмитит произвольную топологию: любое число условий/split/merge, любые ветки — **или вообще без условий** (чистый happy-path явно допустим). Ограничения только: zod-схема (2–20 нод, валидные типы, ≥1 ребро) + 5 правил целостности. Запрос, не укладывающийся в инкрементальные операции, оркестратор направляет сюда → граф пересобирается из видения модели.
- **`edit_workflow`/`addCondition` — инкрементальная правка.** Фиксированная форма операции (см. часть 3) — лишь способ держать одну операцию валидной; не ограничивает множество достижимых графов (AI дособирает доп. операциями либо уходит в rebuild).

**5 правил валидации (общие для обоих путей, условий не требуют):** `no-signal-entry`, `no-success-terminal`, `dangling-edge`, `unreachable-node`, `condition-degree` (срабатывает только когда condition уже есть → ровно 2 исходящих). Happy-path без условий проходит валидацию.

**Routing edit vs rebuild** выбирает оркестратор по формулировке; описания инструментов направляют: точечная правка → `edit_workflow`; структурная перестройка вне инкрементальных операций → `rebuild_workflow`.

## Дизайн (3 части, по возрастанию стоимости)

### 1. Фикс раскладки rebuild — корень «плоскости»
`buildGraphFromSpec` (`src/lib/ai/rebuild-schema.ts`) вместо линейного позиционирования возвращает `relayoutGraph({ nodes, edges })`. `relayoutGraph` (`src/state/structural-commands.ts:696`) уже существует, принимает тот же `GraphState = { nodes, edges }` и раскладывает BFS-колонками по глубине от signal-ноды (ветки расходятся по строкам). Рёбра, которые модель уже эмитит (включая YES/NO, split/merge), сразу превращаются в настоящие ветки. Импорт `rebuild-schema → structural-commands` безопасен (обратной зависимости нет; `ops-wire-schema` уже импортит из обоих).

### 2. Метки рёбер в контекст промпта
Сейчас граф-контекст отдаёт модели только `from → to` без меток — AI не видит существующие ветки. Прокинуть `edge.label` через цепочку построения контекста (`summarizeGraph` → `assistContext.graph.edges` → `buildSystemPrompt`, `src/lib/ai/orchestrator-prompt.ts`), рендерить как `from →[YES] to`. Точные имена функций/строк зафиксировать при планировании. После — AI осведомлён о текущем ветвлении при правках.

### 3. Branch-операция `addCondition` в `edit_workflow`
Новая структурная операция. **Семантика (утверждено — простая и всегда валидная):**

```
addCondition(ref, trigger):
  было:  ref → next            (ref должна иметь ровно одно исходящее ребро)
  стало: ref → [Условие] ─YES→ next
                          └NO → [Конец]   (новый терминальный лист)
```

Гарантированно ровно 2 исходящих ребра у нового условия → проходит `condition-degree`. Сложные ветки («…а кто не открыл — позвони») AI собирает **досбором операций** (`addCondition`, затем врезка IVR на NO-ветку) или через `rebuild_workflow`. Так инкрементальная операция остаётся минимальной и надёжной.

Прокидка через слои: `wireOpSchema` (`ops-wire-schema.ts`) → `toStructuralOp` → zod-зеркало `structuralOpSchema` → `applyOps` (новый `case "addCondition"` + функция `applyAddCondition` в `structural-commands.ts`) → описание инструмента `edit_workflow` в роуте оркестратора.

## Затронутые файлы (карта)

- **Изменить:**
  - `src/lib/ai/rebuild-schema.ts` — `buildGraphFromSpec` возвращает `relayoutGraph(...)` (+ импорт). НЕ трогает `defaultParams` (зона #6).
  - `src/lib/ai/orchestrator-prompt.ts` (+ `summarizeGraph`/граф-контекст) — метки рёбер.
  - `src/state/structural-commands.ts` — новый член union `StructuralOp`, `applyAddCondition`, `case "addCondition"` в `applyOps`. НЕ трогает `defaultParamsFor` (зона #6).
  - `src/state/ops-wire-schema.ts` — `wireOpSchema` + маппинг в `StructuralOp`.
  - роут оркестратора — описание инструмента `edit_workflow`.

## Тестирование

- **Layout:** rebuild со спецификацией, содержащей условие с YES/NO → ноды разнесены по колонкам/строкам (не в один ряд); существующие тесты `rebuild-schema.test.ts` обновить под новые позиции.
- **Метки рёбер:** граф с labeled-ребром → системный промпт содержит `→[YES]`/`→[NO]` (тест на `orchestrator-prompt`/`graph-summary`).
- **addCondition:** применение к ноде с одним исходящим → ровно 2 исходящих у условия, NO ведёт в новый `end`, граф проходит `validateAiGraph`; применение к ноде с ≠1 исходящим → операция отклоняется (skipped).
- Регрессия: happy-path без условий по-прежнему `ok:true`.

## Кросс-cutting заметка для #6

#7 трогает те же два файла, что и #6 (`rebuild-schema.ts`, `structural-commands.ts`), но в **других функциях**: #7 — `buildGraphFromSpec` / `relayoutGraph` / `applyOps` / новый union-член; #6 — `defaultParams` / `defaultParamsFor` (дедуп каналов). Пересечение ограничено блоками импортов — тривиально мержится.
