# Typed Collections & Dev Panel — Design

**Дата:** 2026-04-18
**Скоуп:** Блок A + A.5 из плана доработок 18.04 (`docs/Доработки интерфейса 18.04.md`).
**Статус:** design (pre-plan)

## Цель

Подготовить фундамент для последующих блоков (B — экраны-списки, C — Canvas header, D — новые ноды, E — AI-цикл, F — «Запустить» dropdown):

1. Перевести reducer с single-instance полей (`signal`, `launchedCampaign`) на массивы (`signals: Signal[]`, `campaigns: Campaign[]`).
2. Добавить дев-панель с тремя пресетами состояния (empty / mid / full) за хоткеем Cmd+Shift+D.

Пользовательское поведение приложения не меняется. Существующий Playwright happy-path остаётся зелёным.

## Что уже есть (переиспользуем)

Эти элементы используются в новой архитектуре **без изменений**. В плане имплементации они упоминаются только как импорты.

- `src/state/app-state-context.tsx` — `AppStateProvider`, `useAppState`, `useAppDispatch`
- `src/state/app-state.ts` — discriminated union `View`, структура reducer-а (правим только поля состояния и action-ы)
- `src/sections/welcome/*` — экран Welcome
- `src/sections/signals/campaign-workspace.tsx` + `steps/*` — 8-шаговый мастер создания сигнала (правится только callback `onStep8Reached`)
- `src/sections/signals/signal-type-view.tsx` — текущая карточка сигнала
- `src/sections/campaigns/campaign-type-view.tsx` — текущий экран кампаний (будет переписан в блоке B, в блоке A работает через adapter)
- `src/sections/campaigns/workflow-view.tsx`, `workflow-graph.tsx`, `workflow-node.tsx`, `workflow-status.tsx` — Canvas и граф (template-маппинг signal-type → graph будет добавлен в блоке D)
- `src/sections/shell/app-sidebar.tsx`, `launch-flyout.tsx` — shell (флайаут «Запустить» правится в блоке F)
- `src/sections/shell/shell-bottom-bar.tsx` — нижняя панель с промптом и step-бейджами (правятся только селекторы)
- `src/sections/statistics/statistics-view.tsx` — StatisticsView
- `src/components/ai-elements/*` — PromptInput и связанные примитивы
- `tests/e2e/happy-path.spec.ts` — Playwright smoke. Обязан остаться зелёным после всех изменений блока A.

## Что делаем нового

### 1. Модель данных

В `src/state/app-state.ts`:

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
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export type CampaignStatus = "draft" | "scheduled" | "active" | "completed";

export type Campaign = {
  id: string;
  name: string;
  signalId: string;
  status: CampaignStatus;
  createdAt: string;
  launchedAt?: string;    // установлен если status был/является active
  completedAt?: string;   // установлен если status = completed
  scheduledFor?: string;  // установлен если status = scheduled
  // workflow?: WorkflowGraph — появится в блоке D/E
};

export type AppState = {
  view: View;
  signals: Signal[];             // NEW, заменяет signal: SignalFact | null
  campaigns: Campaign[];         // NEW, заменяет launchedCampaign
  workflowCommand: string | null;
  launchFlyoutOpen: boolean;
};
```

Словари «Максимальный / Высокий / Средний / Низкий» — 4 уровня сегментации.

Связка «signal → workflow graph» идёт через `signal.type`: одному типу сигнала соответствует один зашитый шаблон графа. В блоке D/E к `Campaign` добавится optional `workflow?` — override шаблона, если пользователь отредактировал граф через промпт. В блоке A это поле не существует: все 32 кампании full-пресета открываются в шаблоне своего типа сигнала.

### 2. Actions reducer-а

Удаляются:
- `signal_step8_reached { scenarioId }` — заменяется на `signal_added`.
- `campaign_launched { typeName, launchedAt }` — заменяется парой `campaign_created` + `campaign_status_changed { status: "active" }`.

Добавляются:
- `signal_added { signal: Signal }` — push в `signals`.
- `campaign_created { campaign: Campaign }` — push в `campaigns`. По умолчанию status = `"draft"`.
- `campaign_status_changed { id: string; status: CampaignStatus }` — мутирует статус и соответствующий timestamp (`launchedAt` / `completedAt` / `scheduledFor`).
- `preset_applied { preset: Preset }` — замещает `signals` и `campaigns` целиком. Поля `view`, `workflowCommand`, `launchFlyoutOpen` не трогаются. Если текущий `view.kind === "workflow"` и `view.campaign.id` не найден в новых `campaigns` — reducer переключает view на `{ kind: "section", name: "Кампании" }` (fallback, чтобы не рендерить мёртвую ссылку).

Без изменений: `start_signal_flow`, `signal_complete`, `step2_clicked`, `campaign_selected`, `workflow_command_submit`, `workflow_command_handled`, `goto_stats`, `sidebar_nav`, `flyout_*`.

### 3. Селекторы

```ts
export const isSignalDone    = (s: AppState) => s.signals.length > 0;
export const isCampaignDone  = (s: AppState) =>
  s.campaigns.some(c => c.status === "active" || c.status === "completed");
export const isStep1Active   = (s: AppState) => !isSignalDone(s);
export const isStep2Active   = (s: AppState) => isSignalDone(s) && !isCampaignDone(s);
export const isStep3Active   = (s: AppState) => isCampaignDone(s);
export const isWorkflowView  = (s: AppState) => s.view.kind === "workflow";
export const isOnWelcome     = (s: AppState) => s.view.kind === "welcome";
```

Поведение step-бейджей в `ShellBottomBar` не меняется: те же подсветки, та же логика «активен/неактивен».

### 4. Adapter-слой для секций (временный, на время блока A)

Экраны-списки будут переписаны в блоке B. В блоке A они продолжают отображать single-item, как сейчас, но через adapter на массивы:

- `SignalsSection` (`src/sections/signals/signals-section.tsx`):
  - `signal = signals.length > 0 ? signals[signals.length - 1] : null`
  - Если `signal` есть — рендерит карточку, как сейчас (через `signal.type` вместо `signal.scenarioId`).
- `CampaignsSection` в `mode="standalone"` (`src/sections/campaigns/campaigns-section.tsx`):
  - `campaign = campaigns.find(c => c.status === "active" || c.status === "completed") ?? null`
  - `noSignal = signals.length === 0`.
- `WorkflowSection` (`src/sections/campaigns/workflow-section.tsx`):
  - `campaign = campaigns.find(c => c.id === view.campaign.id)`
  - `signal = signals.find(s => s.id === campaign.signalId)`
  - `signalFileName = "сигнал_" + signal.type + ".json"` (замена scenarioId)
- `GuidedSignalSection` — `onSignalComplete` теперь собирает `Signal` объект и диспатчит `signal_added`. Поля:
  - `id`: `"sig_" + crypto.randomUUID()` (или `Date.now()` если crypto недоступен)
  - `type`: из выбранного сценария в step-1
  - `count`: 4312 (текущий хардкод в smoke-тесте)
  - `segments`: `{ max: 1000, high: 1500, mid: 1200, low: 612 }` (сумма = 4312)
  - `createdAt` / `updatedAt`: `new Date().toISOString()`

Эти adapter-ы **выкидываются в блоке B**, когда `SignalsSection` и `CampaignsSection` переписываются под реальные списки карточек.

### 5. Пресет-система

Файл: `src/state/presets.ts`

```ts
import type { Signal, Campaign, SignalType, CampaignStatus } from "./app-state";

export type PresetKey = "empty" | "mid" | "full";

export type Preset = {
  key: PresetKey;
  label: string;
  signals: Signal[];
  campaigns: Campaign[];
};

export const PRESETS: Record<PresetKey, Preset>;
```

**Генерация:**
- Seeded random (Mulberry32) — чистая функция, детерминистичная.
- `generateSignals(count, seed)` создаёт массив сигналов. Типы распределяются равномерно. `count` — в диапазоне 500…50 000 (mid — верхняя граница 8000). `segments` — сумма равна `count`. Даты `createdAt`/`updatedAt` — в пределах последних 30 (mid) или 90 (full) дней относительно `Date.now()` на момент импорта модуля.
- `generateCampaigns(count, signals, distribution, seed)` создаёт массив кампаний с заданным распределением статусов. `signalId` — случайный из переданных `signals`. Имена: ~80% технических (`Апсейл #3`, `Реактивация #1`), ~20% из фиксированной палитры красивых (`Летний апсейл премиум`, `Возврат Q2`, и т. п.).

**Распределение:**

| Preset | signals | campaigns | active | completed | scheduled | draft |
|--------|---------|-----------|--------|-----------|-----------|-------|
| empty  | 0       | 0         | —      | —         | —         | —     |
| mid    | 5       | 10        | 3      | 3         | 2         | 2     |
| full   | 30      | 32        | 10     | 10        | 6         | 6     |

**Seeds:**
- mid: `0x5EED` (signals), `0xCAFE` (campaigns)
- full: `0xB16B00B5` (signals), `0xF00D` (campaigns)

**Инвариант:** `PRESETS` вычисляется один раз при импорте модуля. Все `campaign.signalId` указывают на существующие сигналы своего же пресета.

### 6. Дев-панель

**Файлы:**
- `src/components/dev/dev-panel.tsx` — UI-компонент
- `src/components/dev/use-dev-hotkey.ts` — обработчик Cmd/Ctrl+Shift+D

**Поведение:**
- Компонент монтируется в `src/app/page.tsx` рядом с `ShellBottomBar`, обёрнут в `{process.env.NODE_ENV === "development" && <DevPanel />}` — в production-сборке исчезает (tree-shaken).
- Хоткей Cmd+Shift+D (Mac) или Ctrl+Shift+D (Windows/Linux) тоггает видимость панели. `preventDefault()` на event — чтобы не конфликтовать с браузерным «добавить в закладки».
- Если панель закрыта — `return null`. Никакого DOM-следа.

**UI-структура** (см. мокап в `.superpowers/brainstorm/.../dev-panel-layout.html`):
- Плавающая карточка в `bottom-right` (fixed, z-index выше основного UI).
- Фон `#161616`, рамка `#2a2a2a`, скругление `10px`.
- Header: лейбл «Dev • состояние» + крестик закрытия.
- Три кнопки пресетов вертикально:
  - Текстовая метка (Empty / Mid / Full)
  - Счётчик справа «N · M» — сигналов / кампаний в текущем состоянии
  - Активный пресет подсвечивается зелёной рамкой `#4ade80` + галочкой в счётчике
- Footer: подсказка «сохраняется в localStorage» + кнопка «очистить ↻» (удаляет ключ из localStorage и применяет `empty`).

**localStorage:**
- Ключ: `"afina.dev.preset"`
- Значение: `"empty" | "mid" | "full"`
- Чтение происходит один раз в `useEffect` после монтирования (чтобы избежать hydration mismatch между SSR и клиентом). Если ключ есть — диспатчится `preset_applied` с соответствующим пресетом.
- При нажатии на пресет: `localStorage.setItem` + `dispatch({ type: "preset_applied", preset })`.
- При нажатии «очистить»: `localStorage.removeItem` + применяется `empty`.

**Изоляция:**
- DevPanel читает `useAppState()` для счётчика `{signals.length} · {campaigns.length}`.
- DevPanel использует `useAppDispatch()` для применения пресета.
- Хоткей живёт в отдельном хуке — чтобы можно было unit-тестировать без UI.

### 7. Тесты

**Playwright happy-path (`tests/e2e/happy-path.spec.ts`):**
- Без правок. После миграции на массивы поведение UI идентично.
- Единственный риск: на шаге 15 (StatisticsView) путь зависит от того, что `signal` и `launchedCampaign` существуют. В новой модели это `signals[0]` и `campaigns[0]` — adapter-ы обеспечивают то же самое.
- Запускаем после каждого коммита блока A.

**Unit-тесты reducer-а:**
- Новый файл: `src/state/app-state.test.ts`
- Используем либо vitest, либо node built-in test runner (решается в плане имплементации).
- Кейсы:
  1. `initialState` — `signals` и `campaigns` пустые.
  2. `signal_added` — добавляет в `signals`, не меняет остальное.
  3. `campaign_created` — добавляет в `campaigns` со status `draft`.
  4. `campaign_status_changed { status: "active" }` — обновляет статус + `launchedAt`.
  5. `preset_applied { preset: PRESETS.mid }` — `signals.length === 5`, `campaigns.length === 10`, `view` не меняется.
  6. `preset_applied` с активным `workflow` view, у которого несуществующий campaign id — view переключается на section Кампании.

**Дев-панель:**
- E2E-теста нет. Дев-only, риск регрессий низкий, тест добавит ~5 секунд к прогону без пользы.

### 8. Production vs development

- `DevPanel` и `presets.ts` импортируются только в `src/app/page.tsx`, обёрнутые `process.env.NODE_ENV === "development"`. В production-сборке Next.js элиминирует unreachable код + tree-shake зависимости.
- localStorage ключ `afina.dev.preset` никогда не читается в prod.
- Хоткей в prod не регистрируется (хук не монтируется).

## Структура файлов

**Создаётся:**
- `src/state/presets.ts`
- `src/state/app-state.test.ts`
- `src/components/dev/dev-panel.tsx`
- `src/components/dev/use-dev-hotkey.ts`
- `src/components/dev/use-local-storage.ts` (утилитарный хук, если не хочется встраивать `useEffect` прямо в `DevPanel`)

**Модифицируется:**
- `src/state/app-state.ts` — новые типы, новая форма `AppState`, обновлённые actions, новые селекторы
- `src/app/page.tsx` — монтирование `<DevPanel />`
- `src/sections/signals/signals-section.tsx` — adapter
- `src/sections/signals/guided-signal-section.tsx` — новая форма `signal_added`
- `src/sections/campaigns/campaigns-section.tsx` — adapter
- `src/sections/campaigns/workflow-section.tsx` — adapter
- `src/sections/shell/shell-bottom-bar.tsx` — обновлённые селекторы

**Не трогается:**
- Все остальные файлы в `src/sections/*`
- `src/components/ui/*`, `src/components/ai-elements/*`
- `src/hooks/*`, `src/lib/*`, `src/types/*`
- `tests/e2e/*`

## Open Questions / Risk Mitigation

- **Риск:** после миграции smoke-тест падает из-за потерянного `scenarioId` в имени файла на Canvas. **Mitigation:** adapter `WorkflowSection` строит `signalFileName` из `signal.type`, что даёт ту же строку для того же сценария.
- **Риск:** hydration mismatch от localStorage. **Mitigation:** чтение в `useEffect`, не в render.
- **Риск:** пресет меняет campaigns, но `view.kind === "workflow"` держит ссылку на старый id. **Mitigation:** reducer в `preset_applied` делает fallback на section «Кампании», если id не найден.
- **Риск:** при production-сборке DevPanel всё равно попадает в бандл. **Mitigation:** явный `process.env.NODE_ENV === "development"` guard в `page.tsx` + верификация через `npm run build` и проверку бандла на отсутствие строки «afina.dev.preset».

## Порядок имплементации (для будущего plan)

1. Типы `Signal`, `Campaign`, `AppState`, reducer action-ы + adapter-ы в 4 секциях. Smoke зелёный.
2. Unit-тесты reducer-а.
3. `src/state/presets.ts` + seeded-генератор.
4. `src/components/dev/*` + монтирование в `page.tsx` (dev-only).
5. Верификация production-бандла на tree-shaking.

План пишется отдельным документом: `docs/superpowers/plans/2026-04-18-typed-collections-and-dev-panel.md`.
