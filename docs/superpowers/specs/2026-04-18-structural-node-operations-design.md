# Structural Node Operations — Design

**Дата:** 2026-04-18
**Скоуп:** Блок H — добавление, удаление и замена workflow-нод через промпт.
**Статус:** design (pre-plan)

## Цель

Дать пользователю возможность редактировать структуру workflow-графа через тот же промпт-бар, что используется для изменения параметров нод (block G):

```
добавь Email после СМС, убери Push, замени Витрину на Лендинг
@СМС текст: новая скидка @Email тема: для тебя
```

В одном сообщении могут смешиваться:

- `@<label> ...` — изменение параметров ноды (уже есть из G).
- Структурные команды — `добавь / убери / замени` с привязкой к существующим нодам.

Поведение **never-block**: любая операция, которая привела к структурно подозрительному состоянию (декартов bypass, потерянный путь к Успеху, нераспознанные параметры), — применяется, но затронутые ноды получают `needsAttention=true` с человекочитаемым `attentionReason`. Финальный gate — это уже существующая `validateWorkflow` на запуске кампании.

## Что уже есть (переиспользуем без правок)

- `src/state/node-actions.ts` — `NODE_ACTIONS` с `parse(...)` per kind. Используется для парсинга inline-params в `add` и `replace` (не дублируем regex).
- `src/state/workflow-templates.ts` — генерация дефолтной болванки ноды, numeric-суффикс на дублях label.
- `src/types/workflow.ts` — `WorkflowNodeType`, `WorkflowNodeData`, `WorkflowNode`, `WorkflowEdge`, `NodeParams`. Расширяется только полем `attentionReason?: string`.
- `src/sections/shell/shell-bottom-bar.tsx` — `parseTagSegments` (для @-режима) остаётся как есть. Перед ним добавляется вызов нового `parseStructuralCommands`.
- `src/sections/campaigns/workflow-view.tsx` — `useState<GraphState>` хранит граф. Применение operations идёт через тот же setGraph, что и AI-цикл из G.
- `src/sections/campaigns/workflow-section.tsx` — wiring: подписка на новый pending-state, проброс в WorkflowView.
- `src/sections/campaigns/node-control-panel.tsx` — добавляется блок «attention reason» сверху, остальное не меняется.
- AI-reply chat-bubble (Sparkles) из B/A6 — переиспользуется для отчёта о выполненных/пропущенных structural-операциях.
- `motion/react` `AnimatePresence` — для появления/исчезновения нод и рёбер (паттерн уже применяется в NodeControlPanel).

## Что делаем нового

### 1. Грамматика структурных команд

```
ADD     ::= ("добавь"|"добавить"|"вставь"|"вставить") <тип> [<inline_params>] (<placement> | <auto>)
REMOVE  ::= ("убери"|"убрать"|"удали"|"удалить") <ref>
REPLACE ::= ("замени"|"заменить") <ref> "на" <тип> [<inline_params>]

placement ::= "после" <ref>
            | "перед" <ref>
            | "между" <ref> "и" <ref>
auto      ::= ""   (placement опущен → перед ближайшим Успех/Конец)

ref       ::= label существующей ноды («СМС», «Задержка 1», «Email»)
тип       ::= одно из: СМС, Email, Push, Звонок, Задержка, Витрина, Лендинг, Успех, Конец
inline_params ::= хвостовой текст, прогоняется через NODE_ACTIONS[<тип>].parse
```

**Особенности парсера:**

- Регистр у глаголов и имён типов игнорируется. Английские ключевые слова не поддерживаются (только русский UI).
- Структурные команды отделяются друг от друга и от @-сегментов через `.`, `,`, `;`, ` и `.
- **Внутри @-сегмента** structural-глаголы — часть контента (мы уже зашли в @-режим, всё до следующего `@<label>` или конца — это param-text).
- Если `<ref>` не найден в графе — операция пропускается, причина перечисляется в AI-ответе.
- Если `<ref>` неоднозначен (нет точного совпадения, но есть близкие) — пропуск с подсказкой `«не нашёл "Push", есть Push 1, Push 2 — уточните»`.
- Если `<тип>` неизвестен — операция пропускается с причиной `«не знаю тип "Витрина 2"»`.

### 2. Семантика операций

#### ADD

1. Создать болванку ноды нового типа: `nodeType`, `label = TYPE_LABEL[<тип>]` + numeric-суффикс если такой label уже есть, пустые `params`, `position` пока `{ x: 0, y: 0 }`.
2. `inlineParams` (если есть) — прогнать через `NODE_ACTIONS[<тип>]` (та же `matchActions` что для @-режима). Распознанные поля → `params`, `needsAttention=false`. Не распознали ничего → `params` остаются по дефолту, `needsAttention=true`, `attentionReason="Заполните параметры — нода добавлена пустой"`.
3. Геометрия:
   - `"после X"` — собрать все исходящие из X. Удалить эти рёбра, добавить `X → новая` + `новая → каждая_бывшая_цель`.
   - `"перед X"` — все входящие в X: удалить, добавить `каждый_бывший_источник → новая` + `новая → X`.
   - `"между X и Y"` — найти ребро `X → Y`. Если есть — удалить, добавить `X → новая` + `новая → Y`. Если нет — пропуск с причиной.
   - `auto` (placement опущен) — найти ближайший по BFS-расстоянию от Сигнал терминальный узел (`isSuccess` или `nodeType === "end"`), вставить «перед» этим узлом.
4. `position` — середина между источником и целью (`{ x: (src.x + tgt.x) / 2, y: (src.y + tgt.y) / 2 }`). Для `auto` — за позицией существующего терминала минус 180px по X.

#### REMOVE

1. Найти ноду по точному label.
2. Запрет: `Сигнал` нельзя удалить — пропуск с причиной `«Сигнал — точка входа, удалять нельзя»`.
3. Применить **smart bypass** (Q3 ответ C):

| in × out | Поведение | needsAttention на |
|---|---|---|
| 1 × 1 | чистый bypass: соединить предшественник → преемник | — |
| 1 × N | предшественник получает N исходящих | предшественник |
| N × 1 | преемник получает N входящих | преемник |
| N × M | декартово произведение N×M рёбер | все предшественники + преемники |

4. `attentionReason` для случаев 1×N / N×1 / N×M — «Перепроверь связи: после удаления соседа изменилась маршрутизация».
5. Удалить ноду из массива nodes, удалить все рёбра, у которых source или target — удалённая нода (после bypass).

#### REPLACE

1. Найти X по label.
2. Запрет: `Сигнал` заменить нельзя.
3. Создать новую ноду: тот же `id`, тот же `position`, новый `nodeType`, новый `label` (с numeric-суффиксом по новой группе типа), новые `params` через NODE_ACTIONS (как в ADD).
4. `needsAttention` по тому же правилу: распознали `inlineParams` → false; нет → true с reason `«Поля сброшены — заполните параметры заново»`.
5. **Рёбра не трогаем.** Поскольку `id` тот же, `source/target` рёбер остаются валидными. Это атомарная замена «карточки».

#### Common

- После каждой операции прогоняется лёгкая структурная валидация: `bfsHasPath(signal, anyIsSuccess)`. Если путь оборвался — все терминалы (`isSuccess` + `nodeType === "end"`) и `Сигнал` получают `needsAttention=true`, `attentionReason="Нет пути от Сигнала к Успеху"`.
- **Атомарность нет.** Операции в одном промпте применяются по очереди. Если одна сломалась — остальные продолжаются. AI-ответ показывает раздельно «Готово:» и «Не выполнено:».

### 3. UX и визуальный фидбек

#### Анимации

- **Add:** новая нода — `motion` initial `{ opacity: 0, scale: 0.88 }` → `{ opacity: 1, scale: 1 }`, 250ms (то же что при первом mount шаблона). Если `needsAttention=true` — после анимации появления стартует пульсация (`wf-node-needs-attention`, уже есть).
- **Remove:** нода — `exit={{ opacity: 0, scale: 0.85 }}`, 250ms. Рёбра, привязанные к ней (старые), исчезают одновременно. Bypass-рёбра (новые) — fade-in 250ms после удаления.
- **Replace:** старая нода — exit (200ms), новая на её месте — enter (200ms). Поскольку `id` сохраняется, ReactFlow не пересоздаёт DOM-элемент; визуальная замена через смену внутреннего контента (label, иконка, цвет — всё через CATEGORY/TYPE_STYLE при перерисовке). Лёгкое масштабирование `scale: 0.92 → 1` подсвечивает изменение.

#### AI-ответ

Структурные операции выводят **отдельное** сообщение в существующем chat-bubble (Sparkles + текст), формат:

```
Готово:
• Добавил Email после СМС
• Убрал Push
• Заменил Витрину на Лендинг

Не выполнено:
• «Виноват» — нет такой ноды
• «Сигнал» — точка входа, удалять нельзя
```

Если все ОК и операция одна — однострочное сообщение «Добавил Email после СМС.» (без списка).

При смешанной отправке (structural + @-сегменты) — одно сообщение, в нём оба блока:

```
Готово:
• Обновил @СМС (текст, alpha-name)
• Добавил Email после СМС
```

#### attention reason в панели

Новое поле `WorkflowNodeData.attentionReason?: string`. При установке `needsAttention=true` в любой структурной операции записывается соответствующая причина.

В `NodeControlPanel` — новый блок **выше** существующего (тип / @-тег / category / id):

```
┌─────────────────────────────────────┐
│ ⚠ Заполните параметры — нода        │
│   добавлена пустой                  │
├─────────────────────────────────────┤
│ [Email] @Email · communication      │
│ ...
```

Стиль блока: `border-amber-500/40 bg-amber-500/10 text-amber-200`, иконка `AlertTriangle` из lucide-react. Скрывается, если `needsAttention=false`.

### 4. Архитектура и файлы

#### Новый модуль — `src/state/structural-commands.ts`

```ts
export type Placement =
  | { mode: "after"; ref: string }
  | { mode: "before"; ref: string }
  | { mode: "between"; refA: string; refB: string }
  | { mode: "auto" };

export type StructuralOp =
  | { kind: "add"; nodeType: WorkflowNodeType; placement: Placement; inlineParams?: string }
  | { kind: "remove"; ref: string }
  | { kind: "replace"; ref: string; newType: WorkflowNodeType; inlineParams?: string };

export type AppliedOp = { op: StructuralOp; description: string };
export type SkippedOp = { op: StructuralOp; reason: string };

export function parseStructuralCommands(input: string): {
  ops: StructuralOp[];
  unrecognized: string[];   // для отчёта «не понял эту часть»
};

export function applyOps(
  graph: GraphState,
  ops: StructuralOp[]
): {
  graph: GraphState;
  applied: AppliedOp[];
  skipped: SkippedOp[];
};
```

Парсер — regex-based, не LLM. Унит-тестируется отдельно. `applyOps` — чистая функция (immutable update of graph), без side-effects.

#### Модификации существующих файлов

- **`src/types/workflow.ts`** — `WorkflowNodeData.attentionReason?: string`.

- **`src/state/app-state.ts`** — новое поле:
  ```ts
  workflowStructuralCommands: { ops: StructuralOp[] } | null
  ```
  Новые actions:
  ```ts
  | { type: "workflow_structural_commands_submit"; ops: StructuralOp[] }
  | { type: "workflow_structural_commands_handled" }
  ```
  Submit-action хранит массив ops; handle-action чистит.

- **`src/sections/shell/shell-bottom-bar.tsx`** — `handlePromptSubmit`:
  1. `parseStructuralCommands(rawText)` → получить `{ ops, unrecognized }`.
  2. Из `unrecognized` (и из текста до/между structural-командами, не попавших в ops) прогнать через `parseTagSegments` → `tagSegments`.
  3. Если `ops.length > 0` → `dispatch({ type: "workflow_structural_commands_submit", ops })`.
  4. Если `tagSegments.length > 0` → `dispatch({ type: "workflow_node_command_submit", commands })`.
  5. Если оба пусты и rawText непустой → `dispatch({ type: "workflow_command_submit", text: rawText })` (как сейчас).

- **`src/sections/campaigns/workflow-section.tsx`** — `useEffect` на `state.workflowStructuralCommands`, передаёт ops в `WorkflowView` как новый prop `structuralOps?: StructuralOp[] | null`.

- **`src/sections/campaigns/workflow-view.tsx`** — новый `useEffect` на `structuralOps`:
  1. Вызвать `applyOps(graph, ops)`.
  2. `setGraph(result.graph)`.
  3. Собрать AI-сообщение из `applied` и `skipped`, диспатчить `ai_reply_shown`.
  4. Диспатчить `workflow_structural_commands_handled`.
  AnimatePresence уже применяется в графе (через ReactFlow internal); опционально оборачиваем `WorkflowGraph` в обёртку, передающую `key={node.id}` для `motion`-обёртки внутри NodeComponent (если ReactFlow это поддерживает; иначе animation на CSS-классе через нашу `wf-node-state` инфраструктуру).

- **`src/sections/campaigns/node-control-panel.tsx`** — `data.attentionReason` рендерится в новом блоке наверху (см. UX-раздел).

#### Тесты

- **`src/state/structural-commands.test.ts`** (новый):
  - `parseStructuralCommands` — ~25 кейсов: каждый глагол × placement × inline-params; смешение с @-сегментами; unknown types; ambiguous refs; пустой ввод; падежи глаголов.
  - `applyOps` — ~15 кейсов: ADD каждый placement, REMOVE каждый rewiring-сценарий (1×1, 1×N, N×1, N×M), REPLACE с/без inline-params, broken success path → needsAttention на терминалах, несуществующая ref → skipped.

- **`tests/e2e/block-h.spec.ts`** (новый):
  - `«добавь Email после СМС»` → новая нода видна в графе, attention-блок в панели если params пустые.
  - `«убери Push»` → нода исчезает.
  - `«замени Витрину на Лендинг»` → label/icon меняются, position фиксирован.
  - Смешанный промпт: `«@СМС текст: hello, добавь Email после СМС»` → обе операции применились.
  - Запрет на удаление Сигнала → AI-сообщение «Не выполнено».

### 5. Что НЕ делаем в этом блоке

- **Persistence** графа в `Campaign.workflow`. Граф остаётся в `useState` внутри WorkflowView — на ре-открытие кампании сбрасывается на шаблон. Это общий тех-долг и для блока G; решается отдельной задачей.
- **Undo (Ctrl+Z)** — нет в скоупе.
- **Branching-типы (Условие / Сплиттер / Слияние)** — отдельный блок H.5. Текущая семантика рассчитана на linear-only.
- **Drag-and-drop в канвасе** — добавление только через промпт.
- **Автолейаут** после структурных правок — простая интерполяция координат, никаких сложных алгоритмов раскладки.

## Open Questions / Risk Mitigation

- **Риск:** парсер неправильно классифицирует «добавь» внутри @-сегмента (например, `@СМС текст: добавь скидку 20%`). **Mitigation:** правило «внутри @-сегмента structural-глаголы — контент» — эта проверка делается на уровне порядка проходов: сначала вычленяются @-сегменты по `@<word>` и границам, **затем** на оставшемся (вне-@) тексте ищутся structural-команды. Юнит-тест на этот edge-case обязателен.
- **Риск:** ReactFlow не любит изменения id внутри одного render. **Mitigation:** REPLACE сохраняет `id` — ноды для ReactFlow это та же сущность, просто `data` поменялась. ADD создаёт новый id (`nanoid`-style как в campaigns), REMOVE убирает. Никаких id-mutations.
- **Риск:** position для новой ноды совпал с существующей — визуально перекрывается. **Mitigation:** после `applyOps` прогоняется простой коллизион-чек: если у новой позиция в радиусе 50px от существующей — сдвигаем на 60px вниз. Тривиально.
- **Риск:** текст AI-ответа со списком из 5+ операций превышает высоту chat-bubble. **Mitigation:** в bubble уже есть scroll (overflow-y-auto), max-height ограничен `40vh`.
- **Риск:** numeric-суффикс label-конфликт при ADD: добавил «Email» в граф где уже «Email» → должна стать «Email 1» или «Email 2»? Текущее правило A5 — суффикс начинается с 1, если групп >1. После ADD проверяем, считаем встречаемость. **Mitigation:** хелпер `assignUniqueLabel(graph, kind)` гарантирует уникальность.

## Порядок имплементации (для будущего plan)

1. `WorkflowNodeData.attentionReason?: string` + `wf-node-needs-attention`-блок в `NodeControlPanel`.
2. `src/state/structural-commands.ts` — парсер + applyOps + unit-тесты.
3. `app-state.ts` — новое поле, новые actions, reducer, юнит-тесты.
4. `shell-bottom-bar.tsx` — двойной парсинг (structural + @-tag).
5. `workflow-section.tsx` + `workflow-view.tsx` — wiring + apply + AI-сообщение.
6. E2E `block-h.spec.ts`.

План пишется отдельным документом: `docs/superpowers/plans/2026-04-18-structural-node-operations.md`.
