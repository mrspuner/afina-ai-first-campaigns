# Block E — Node Control Panel + AI Cycle (design spec)

**Source:** `docs/2026-04-18-ui-improvements.md` → разделы «Управление нодой», «Промпт-бар» и «Цикл Промпт → AI → Canvas». Зависит от блока D.

**Goal:** При клике на ноду над канвасом (между графом и промпт-баром) появляется управляющий блок: тип, @тег, read-only параметры, подсказка «изменить через промпт» и чипы-примеры. Сабмит промпта при выбранной ноде запускает AI-симуляцию: `processing` → обновлённая sublabel + `justUpdated` → всплывающий AI-ответ → финальное состояние (ready / needsAttention false).

## 1. Reusable

- `WorkflowNode`, `WorkflowNodeData`, `NODE_CATEGORY`, `isCommunicationNode` (`src/types/workflow.ts`) — из D.
- `WorkflowView` (`src/sections/campaigns/workflow-view.tsx`) — уже принимает `onGraphChange`; добавим `onNodeClick`.
- `WorkflowSection` — owner selection state, рендерит новый `NodeControlPanel`.
- `useAppState` / `useAppDispatch` — добавим `selectedWorkflowNode` в state.
- `ShellBottomBar` — инжектит `@label` в prompt при выборе ноды (минимальная доработка).
- `parseWorkflowCommand` — остаётся для legacy; AI-цикл делаем в параллельной ветке (в обход parser когда есть selected node).

## 2. Scope

**In:**
- AppState получает `selectedWorkflowNode: { id: string; label: string } | null`.
- Два action'а: `workflow_node_selected { id, label }`, `workflow_node_deselected`.
- `WorkflowView` — ReactFlow `onNodeClick` переводится в callback `onNodeClick(id)`; `onPaneClick` → deselect. Selected-состояние node рендерится через data flag (поскольку props-реактивность ReactFlow). Либо используем встроенный selected — см. §4.
- `NodeControlPanel` — компонент: показывает тип, `@{label}`, параметры, подсказку, 2–4 чипа-примера (static per category).
- `ShellBottomBar` — на `selectedWorkflowNode` автоматически префиксует `@{label} ` в textarea (через PromptInputProvider / existing API).
- AI-симуляция в `WorkflowView`: принимает новое свойство `nodeCommand: { nodeId, text } | null`; обрабатывает через useEffect — обновляет граф по таймеру.
- Всплывающий AI-ответ поверх промпт-бара (5 с / кнопка закрыть).

**Out:**
- Реальная интеграция с LLM — симулируем canned ответ.
- Динамические чипы-примеры (берём статичные наборы по `NODE_CATEGORY`).
- Голосовой ввод.
- Bulk edits, undo.

## 3. AI cycle timeline

При `onSubmit(promptText)` + `selectedWorkflowNode`:

1. t=0: dispatch `workflow_node_command_submit { id, text }`.
2. WorkflowView subscribes via useEffect:
   - t=0: set `processing: true` on selected node.
   - t=1500ms: set `processing: false`, `justUpdated: true`, `sublabel: deriveFromCommand(text)`, `needsAttention: false`.
   - t=2700ms: set `justUpdated: false`.
3. WorkflowSection получает callback `onAiReply(text)` (через новый prop) — показывает плавающее облачко с текстом «AI: готово. {сжатый summary}» на 5 секунд.

`deriveFromCommand(text)` — примитивный: если `text` включает «2 часа» → «Задержка 2 часа», иначе «Обновлено по запросу». Достаточно для демонстрации цикла без NLP.

## 4. Selection visual

Вариант A (preferred): ReactFlow нативно передаёт `selected` в `NodeProps`. В D мы уже добавили `wf-node-selected` класс при `selected`. Используем: если ReactFlow сам обрабатывает click → OK. Нужно убрать `elementsSelectable={false}` в `WorkflowGraph` (сейчас selectable выключено). Переключаем в true, слушаем `onNodeClick`.

Вариант B: свой selected state в `data.selected` + applying via data. Дороже.

Идём вариантом A: включаем `elementsSelectable`, слушаем `onNodeClick` / `onPaneClick`. Синхронизируем `selectedWorkflowNode` в AppState.

## 5. NodeControlPanel

```tsx
<div className="sticky bottom-[120px] ...">
  <div>Тип: {label} · @{id}</div>
  <div>Параметры:
    <ul>
      <li>label: {label}</li>
      {sublabel && <li>sublabel: {sublabel}</li>}
    </ul>
  </div>
  <p className="hint">Изменить через промпт ниже.</p>
  <div className="chips">
    {chipsFor(category).map(c => <button>{c}</button>)}
  </div>
</div>
```

Chip sets (минимум):
- `communication`: «Изменить текст», «Задержка 2 часа», «Добавить ссылку».
- `logic`: «Добавить ветку», «Убрать».
- `web`: «Сменить оффер».
- `endpoint`: «Изменить цель».
- `legacy`: none (fall through to 2 generic chips).

Клик по чипу — вставляет текст в prompt textarea (через PromptInputController / setter).

## 6. Prompt-bar integration

- `ShellBottomBar` читает `selectedWorkflowNode` и `pendingChip` из AppState (new field: `promptPrefill?: string`).
- При смене `selectedWorkflowNode` — обновляет textarea value на `@{label} ` (preserves user text after the tag if editing).
- На submit с selected node — dispatch'ит `workflow_node_command_submit` вместо `workflow_command_submit`.
- Сброс: при Esc в textarea — dispatch `workflow_node_deselected`.

## 7. Files

**Create:**
- `src/sections/campaigns/node-control-panel.tsx`.
- `tests/e2e/block-e.spec.ts`.

**Modify:**
- `src/state/app-state.ts` — добавить `selectedWorkflowNode`, `workflowNodeCommand`; actions: `workflow_node_selected`, `workflow_node_deselected`, `workflow_node_command_submit`, `workflow_node_command_handled`.
- `src/state/app-state.test.ts` — covers.
- `src/sections/campaigns/workflow-view.tsx` — принять nodeCommand + обновление графа по таймерам; вызывать `onNodeClick` / `onPaneClick`.
- `src/sections/campaigns/workflow-graph.tsx` — включить `elementsSelectable`; проксировать click handlers.
- `src/sections/campaigns/workflow-section.tsx` — рендер `NodeControlPanel`, callback `onAiReply` для показа popup.
- `src/sections/shell/shell-bottom-bar.tsx` — prefix `@{label} ` при selected + routing submit.

## 8. Acceptance

1. Клик по ноде на canvas → нода получает selected-outline + `NodeControlPanel` виден с нужной инфой.
2. При selected, в prompt-bar автоматически вставляется `@{label}`.
3. Submit → на ноде видна processing-анимация, затем justUpdated-flash, затем sublabel обновлён.
4. Всплывает AI-ответ на 5 секунд.
5. Клик по пустому полю canvas → deselect, панель исчезает.
6. Existing tests (a/b/c/d + happy-path) — зелёные.

## 9. Risks

- ReactFlow selectable=true может сломать drag/pan — оставляем `nodesDraggable={false}` и `panOnDrag={false}`, чтобы поведение переключалось минимально.
- Sync `@label` в prompt textarea через `PromptInputProvider` зависит от его API — если не получится вставить программно, используем контролируемое value на уровне ShellBottomBar (контролируем input через React state).
- Popup позиционирование: делаем absolute-элемент поверх ShellBottomBar.
