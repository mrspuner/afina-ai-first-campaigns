# Block C — Canvas Header + Launch Validation (design spec)

**Source:** `docs/2026-04-18-ui-improvements.md` → раздел «Canvas (создание / редактирование кампании) → Header».

**Goal:** Над Canvas появляется sticky-хедер с названием кампании (inline edit), read-only блоком привязанного сигнала, кнопками «Сохранить черновик» и «Запустить». «Запустить» становится единственной точкой запуска (текущая кнопка «Начать кампанию →» в `ShellBottomBar` убирается для `view.kind === "workflow"`). Валидация блокирует запуск с показом ошибки.

## 1. Reusable components (сначала — что уже есть)

- `Button` (`src/components/ui/button.tsx`) — primary / outline / ghost варианты.
- `Input` (`src/components/ui/input.tsx`) — base-ui wrapper для inline edit.
- `WorkflowSection` / `WorkflowView` (`src/sections/campaigns/workflow-*.tsx`) — render-таргет, к которому подвешиваем хедер.
- `StatusBadge` (`src/sections/campaigns/status-badge.tsx`) — если понадобится показать текущий статус кампании в хедере (scoped out MVP — но держим в уме).
- `useAppState` / `useAppDispatch` (`src/state/app-state-context.tsx`) — новые action'ы.
- Паттерн «всплывающей ошибки» из `WorkflowView` (`unknownCmd`) — reused локально для показа launch-error.
- `ShellBottomBar` — убирается кнопка «Начать кампанию →» для `view.kind === "workflow"`, чтобы не дублировать с хедером.

## 2. Scope

**In scope (Block C):**
- Canvas header компонент (имя + signal-info + Сохранить + Запустить).
- Inline edit имени кампании (click-to-edit, Enter/blur = save, Esc = cancel).
- Read-only signal block под именем.
- Кнопка «Сохранить черновик» — подтверждение-тост (in-place, без серверной логики).
- Кнопка «Запустить» — валидация + либо launch, либо ошибка.
- Reducer actions: `campaign_renamed`, `campaign_saved_draft`, и переиспользуем `campaign_status_changed` для запуска.
- Валидация: signal привязан; нет `needsAttention` нод; есть путь к «Успех» ноде.
- Поле `needsAttention?: boolean` на `WorkflowNodeData` (дефолт false) — нужно для вычислимой валидации. В блоке C никакая нода его не выставляет — все проходят. Блок D добавит визуал и выставление флага при пустых параметрах.
- Убрать дублирующую кнопку «Начать кампанию →» из `ShellBottomBar` в workflow-view.

**Out of scope (остаётся блокам D / E):**
- Новые типы нод (Wait, Condition, Merge, Витрина, Лендинг, Email, Push, IVR, Success, End).
- Визуальные состояния нод (⚠ / ✅ / spinning border / green flash).
- Прикрепление формы параметров к ноде.
- Промпт-бар и цикл AI.
- Автошаблон workflow по типу сигнала.

## 3. UI

### 3.1 Header layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ╭─[name: inline-edit]──╮                      [Сохранить черновик]        │
│ │ Апсейл #1            │ ✎                     [Запустить]                │
│ ╰──────────────────────╯                                                   │
│ Апсейл · 2 432 · от 17.04                                                  │
└──────────────────────────────────────────────────────────────────────────┘
```

- Sticky, top-0, height auto (~72px), `bg-background/90 backdrop-blur` + нижняя рамка `border-b border-border`.
- Ширина — вся область canvas (`left-[120px]`), padding `px-6 py-3`.
- Z-index выше графа (z-20) и ниже ShellBottomBar (z-30 у баттом-бара).
- Name inline edit: по умолчанию `<button>` со стилем заголовка (`text-xl font-semibold`) + иконка pencil справа. Клик → `<Input>` тех же метрик; `onBlur`/Enter → commit, Escape → rollback. Пустое имя не сохраняется (восстанавливаем предыдущее).
- Signal block: `text-xs text-muted-foreground`, формат `{type} · {count, ru-locale} · от {updatedAt, dd.MM}`. Если сигнал не найден — «Сигнал не привязан» (красный).
- Buttons: `Button variant="outline"` + `Button variant="default"` с gap-2.

### 3.2 Error toast

- Когда валидация падает — под хедером появляется inline-бар:
  `border border-destructive/30 bg-destructive/10 text-destructive px-3 py-1.5 text-xs rounded-md`.
- Авто-скрытие через 3 с. Можно закрыть (×).
- Текст ошибки «У вас есть ноды не готовые к запуску.» при needsAttention-ноде.
  «Сигнал не привязан» при отсутствии signal.
  «Нет пути к ноде Успех.» если граф не достигает result.

### 3.3 Save-draft feedback

- Короткий toast «Черновик сохранён» — inline справа у кнопки, `text-xs text-muted-foreground`, исчезает за 2 с. Можно использовать ту же toast-инфру, что и для ошибки.

## 4. State machine

### 4.1 AppState / Action

Новые actions:

```ts
| { type: "campaign_renamed"; id: string; name: string }
| { type: "campaign_saved_draft"; id: string }
```

Поведение:
- `campaign_renamed`: апдейт `campaigns[i].name`; если `view.kind === "workflow"` и `view.campaign.id === id` → также обновляем `view.campaign.name`. Если `name.trim() === ""` → no-op.
- `campaign_saved_draft`: no-op на уровне state (пока). Reducer возвращает то же state. Оставлен для будущего (когда появится persistence).

Launch реализуем через уже существующий `campaign_status_changed` + `campaign_created` цепочку **только** если кампания ещё не в `campaigns` — текущие campaigns из `campaign_from_signal` **уже там** со статусом draft. Значит для launch:
- `campaign_status_changed { id, status: "active", timestamp: now }` — апдейтит статус + `launchedAt`, + flipaet `view.launched` для этой кампании.

### 4.2 Workflow type changes

`src/types/workflow.ts`:
- `WorkflowNodeData` расширяется: `needsAttention?: boolean`, `isSuccess?: boolean`.
- `createBaseNodes` помечает последнюю ноду (`id: "result"`) как `isSuccess: true` (условно: «Результат» = «Успех» в текущей модели). В блоке D Успех станет отдельным типом.

### 4.3 Validation helper

`src/state/workflow-validation.ts` (new):
```ts
export interface WorkflowValidation {
  ok: boolean;
  errors: Array<"no-signal" | "needs-attention" | "no-success-path">;
}

export function validateWorkflow(
  graph: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
  signalBound: boolean
): WorkflowValidation;
```

Реализация:
1. `!signalBound` → push "no-signal".
2. `nodes.some(n => n.data.needsAttention)` → push "needs-attention".
3. Path BFS от `nodes[0].id` (обычно "signals") ко всем `isSuccess` нодам. Если не находится хотя бы одна → push "no-success-path". Если нет `isSuccess`-нод вообще → push "no-success-path".
4. `ok = errors.length === 0`.

### 4.4 WorkflowView / WorkflowSection rewire

`WorkflowSection`:
- Поднимает graph state наружу: передаёт `graph`, `setGraph` в `WorkflowView` (currently state is внутри `WorkflowView`). Либо оставляет как есть, но добавляет `onValidate` callback, который возвращает snapshot графа — проще всё-таки перенести state в Section (меньше пропов, легче валидировать на click Запустить).
- Внутри Section рисуем `<CanvasHeader campaign={currentCampaign} signal={currentSignal} onRename={...} onSaveDraft={...} onLaunch={...} onValidate={...} />`.

Если перенос graph в Section ломает слишком много — оставляем state в WorkflowView и прокидываем `onLaunchAttempt` callback, который внутри WorkflowView валидирует и вызывает `onLaunch(valid)`. Выбор решим в плане имплементации по объёму — минимум инвазивности.

### 4.5 ShellBottomBar

- В блоке «workflow && !launched» убрать кнопку «Начать кампанию →» — теперь её делает хедер.
- Остальное не трогаем.

## 5. Files

**Create:**
- `src/sections/campaigns/canvas-header.tsx` — компонент хедера.
- `src/state/workflow-validation.ts` — pure-функция валидации + BFS.
- `src/state/workflow-validation.test.ts` — unit-тесты валидации.

**Modify:**
- `src/state/app-state.ts` — два новых action'а в union + case'ы.
- `src/state/app-state.test.ts` — тесты actions.
- `src/types/workflow.ts` — доп. поля на `WorkflowNodeData` + пометка result-ноды как success.
- `src/sections/campaigns/workflow-section.tsx` — рендер хедера, подъём graph-state или callback launch-validation.
- `src/sections/campaigns/workflow-view.tsx` — изменения согласно 4.4.
- `src/sections/shell/shell-bottom-bar.tsx` — убрать «Начать кампанию →» для workflow view.

## 6. Tests

**Unit (vitest):**
- `workflow-validation.test.ts` — 4-6 кейсов:
  - all ok → ok=true
  - no signal bound → "no-signal"
  - needsAttention-нода → "needs-attention"
  - no success node → "no-success-path"
  - success exists, но edges обрываются → "no-success-path"
  - multiple errors аккумулируются
- `app-state.test.ts`:
  - `campaign_renamed` → меняет name в `campaigns[]`; если совпадает view — меняет `view.campaign.name`.
  - `campaign_renamed` с пустой строкой — no-op.
  - `campaign_saved_draft` — no-op (возвращает same state).

**Integration (Playwright) — `tests/e2e/block-c.spec.ts`:**
- Открыть кампанию из списка (mid preset, карточка draft) → видим хедер с именем и сигналом.
- Клик на имя → появляется input → изменить → Enter → имя обновлено. Вернуться в список → в карточке новое имя.
- Клик «Запустить» на draft кампании без `needsAttention`-нод → view переключается на `launched=true` (появляется WorkflowStatus).
- Намеренно навешиваем `needsAttention: true` через dev-panel (или напрямую через debug action в пресете) → клик «Запустить» → появляется красный тост «У вас есть ноды…». Workflow остаётся в draft.
  - Для простоты теста — добавим dev-only action `dev_flag_attention` или используем отдельный dev-пресет. Решение — в плане.

Если dev-hook для mark needs-attention слишком инвазивен — тест №4 делаем через unit-мок validateWorkflow в jsdom. Зафиксируем в плане.

## 7. Acceptance criteria

1. На canvas (view.kind === "workflow") есть sticky header с именем, signal-блоком и двумя кнопками.
2. Имя редактируется inline и сохраняется в state.
3. «Сохранить черновик» показывает короткий confirmation, state не ломается.
4. «Запустить» при корректном графе переводит кампанию в active и показывает WorkflowStatus.
5. Валидатор — чистая функция, покрыт тестами.
6. «Начать кампанию →» в ShellBottomBar убрана для workflow.
7. Все существующие тесты (vitest + happy-path + block-b) остаются зелёными.

## 8. Risks

- Перенос graph state из WorkflowView в WorkflowSection может сломать анимацию `wf-graph-flash` — валидатор не должен «смотреть» на mutate. Решение: оставить graph в WorkflowView, но передать `onLaunchAttempt: () => boolean` который внутри WorkflowView вызывает validateWorkflow и возвращает ok-флаг; Section по ok делает dispatch.
- Кнопка «Сохранить черновик» пока decorative — честнее не давать её вовсе, но пользователь хочет её в UI. Оставляем с toast «Черновик сохранён» без state-эффекта (кроме emitted action).
- Inline-edit на base-ui input — проверить autoFocus после click. Если не фокусируется — использовать ref + effect.
