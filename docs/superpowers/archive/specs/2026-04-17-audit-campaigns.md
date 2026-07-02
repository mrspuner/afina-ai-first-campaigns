# Аудит раздела «Кампании + Workflow» — 2026-04-17

Scope: `src/components/campaign-type-view.tsx`, `campaign-stepper.tsx`, `workflow-view.tsx`, `workflow-graph.tsx`, `workflow-node.tsx`, `workflow-status.tsx`.

## 1. Иерархия контента

### 1.1 CampaignTypeView (`src/components/campaign-type-view.tsx`)

**Layout:**
- Full-height scrollable container (flex column, flex-1, pt-[140px] pb-40)
- Centered max-w-2xl content area
- Заголовок: «Кампании» (h1, 38px, bold)

**Предлагаемые типы кампаний (5 опций, 3-колоночная сетка):**
1. **Возврат брошенных действий** (id: `abandoned`)
2. **Прогрев до следующего шага** (id: `warmup`)
3. **Стимулирование повторной активности** (id: `reactivation-stimulate`)
4. **Удержание через поведенческие триггеры** (id: `behavioral-retention`)
5. **Реактивация через адаптивный сценарий** (id: `adaptive-reactivation`)

Каждая карточка: title + description, hover:bg-accent, rounded-lg.

**Визуальные состояния:**
- **noSignal=true** — fixed-позиция empty-state «Нет сигналов» + объяснение, что сначала нужен сигнал.
- **campaign prop задан, !noSignal** — карточка активной кампании (зелёный бейдж «Активна», timestamp «Запущена {launchedAt}») + заголовок «Создать ещё одну кампанию» над 5 типами.
- **!campaign, !noSignal** — 5 типов кампаний с заголовком «Выберите тип кампании».

**Props:**
- `onSelect?(id: string, name: string)` → parent: flowPhase="campaign" + selectedCampaign.
- `campaign?: CampaignCardData | null` → `{ typeName, launchedAt }`.
- `noSignal?: boolean` → empty state.

---

### 1.2 CampaignStepper (`src/components/campaign-stepper.tsx`)

**Роль:** вертикальный индикатор шагов. В текущем основном флоу не используется (присутствует как резервный UI для будущих/альтернативных путей).

**Структура:**
- Flex column, gap-1
- 7 жёстко заданных шагов (2–8): «Интересы», «Сегменты», «Бюджет», «База», «Сводка», «Обработка», «Результат»
- Каждый: вертикальная линия-коннектор, круг с номером/галочкой, кликабельный лейбл

**Состояния:**
- Completed (step < currentStep) — галочка, primary-цвет, лейбл кликабелен.
- Active (step === currentStep) — круг с номером, primary-рамка + ring, лейбл bold.
- Pending (step > currentStep) — dim, не кликается.

**Props:**
- `currentStep: number`
- `onStepClick: (step: number) => void`
- `disabled?: boolean`

---

### 1.3 WorkflowView (`src/components/workflow-view.tsx`)

**Роль:** контейнер графа + статус-панели + обработчик команд из чата.

**Layout (flex column, flex-1):**
1. **Верхняя секция (55% при launched, 100% idle):**
   - `WorkflowGraph` рисует DAG
   - Height-анимация 0.55s cubic-bezier
   - Flash-анимация при получении команды (`wf-graph-flash` keyframe, opacity 1→0.45→1, 0.4s)
2. **Нижняя секция (появляется после launched):**
   - `WorkflowStatus` с анимацией входа (opacity 0→1, y 20→0, delay 0.2s, duration 0.4s)
   - Занимает оставшиеся 45% после запуска
3. **Toast обратной связи (опционально):**
   - «Команда не распознана» (absolute, bottom-140px), автозакрытие 2.5s

**Props:**
- `launched: boolean` — управляет высотой графа + видимостью статуса.
- `pendingCommand: string | null` — берётся из родителя (PromptInput).
- `onCommandHandled() => void` — родительский коллбек для очистки workflowCommand.
- `onGoToStats() => void` — кнопка в WorkflowStatus, ведёт в статистику.
- `signalName?: string` — передаётся в `createBaseNodes()`, попадает в sublabel первого узла.

**Обработка команд:**
- useEffect поллит pendingCommand.
- `parseWorkflowCommand(pendingCommand)` → CommandUpdater | null.
- CommandUpdater принимает текущие nodes/edges, возвращает новый граф (перемещение узлов, добавление, смена цвета).
- Parsed → flash + setGraph. Null → error toast.

---

### 1.4 WorkflowGraph (`src/components/workflow-graph.tsx`)

**Роль:** xylflow-рендерер, read-only, только горизонтальный скролл.

**Структура:**
- ReactFlowProvider + GraphInner wrapper (nodeTypes стабильная ссылка вне компонента).
- Контейнер (ref, relative, h-full, w-full).
- Левый/правый fade-оверлеи (20px градиент; opacity меняется когда крайние узлы уходят за viewport).
- ReactFlow: panOnDrag=false, panOnScroll + horizontal mode, zoomOnScroll=false, без drag/connect/select.
- Custom Controls (top-right, showInteractive=false).
- Background: `#0a0a0a`.

**Поведение:**
- Auto-fitView on mount + при смене `compact` (padding 0.15, duration 400ms, delay 60ms).
- Обновляет прозрачность fade-оверлеев при скролле.

**Props:**
- `nodes: WorkflowNode[]`
- `edges: WorkflowEdge[]`
- `compact?: boolean` — триггер recalc fitView (используется когда launched меняется).

---

### 1.5 WorkflowNode (`src/components/workflow-node.tsx`)

**Роль:** отрисовка отдельного узла workflow внутри xylflow.

**Дизайн:**
- Motion wrapper: opacity 0→1, scale 0.88→1, 0.25s easeOut.
- Border + bg + rounded-8 зависят от nodeType.
- Handles (target слева, source справа).

**Типы узлов (6 стилей):**
1. **default** — серый (`#2a2a2a` / `#111111` / `#e5e5e5`)
2. **split** — фиолетовый (`#4c1d95` / `#0d0819` / `#a78bfa`)
3. **channel** — teal (`#134e4a` / `#030f0e` / `#5eead4`)
4. **retarget** — красный (`#7f1d1d` / `#110505` / `#f87171`)
5. **result** — зелёный (`#14532d` / `#030d06` / `#4ade80`)
6. **new** — янтарный (`#78350f` / `#0f0a03` / `#fbbf24`)

**Контент:**
- Label (11px, 500, цвет по nodeType)
- Optional sublabel (10px, 55% opacity white, margin-top 2px)

**Props:**
- `data: WorkflowNode` — NodeProps из xylflow; `data.label`, `data.sublabel`, `data.nodeType`.

---

### 1.6 WorkflowStatus (`src/components/workflow-status.tsx`)

**Роль:** отображение статуса запущенной кампании + анимированные метрики.

**Layout (flex column, items-center, gap-6):**

1. **Status-бейдж (сверху):**
   - Rounded-full pill, border `#14532d`, bg `#030d06`.
   - Пульсирующая зелёная точка (1.5s ease-in-out infinite).
   - Текст: «Кампания запущена» (зелёный `#4ade80`, 12px).

2. **Stat-карточки (центр):**
   - 3 карточки в flex gap-5.
   - Каждая карточка — CounterCard:
     - Большое число (32px bold) + лейбл (11px muted).
     - «Отправлено» (847, без акцента)
     - «Доставлено» (791, accent=green)
     - «Открыто» (214, без акцента)
     - Анимация от 0 до target за 4s (easeOutCubic) со сдвигами: 3000ms, 3300ms, 3700ms.
     - requestAnimationFrame.

3. **Кнопка (снизу):**
   - «Посмотреть статистику →» (border, card bg, hover:bg-accent).
   - Вызывает `onGoToStats()`.

**Props:** `onGoToStats() => void`.

**Стили:** injected `@keyframes wf-pulse` (opacity 1→0.35→1, 1.5s).

---

## 2. Пронумерованные сценарии

### Сценарий 1. Выбор типа кампании из guided-flow (после сигнала)

**Триггер:** завершён сбор сигнала (flowPhase="awaiting-campaign") → клик Step 2 бейджа или кнопки «Запустить кампанию →» на Step 8 CampaignWorkspace.

**Шаги:**
1. `handleStep8Reached(scenarioId)` → signalDone=true, flowPhase="awaiting-campaign".
2. Клик Step 2 → `handleStep2Click()` → flowPhase="campaign".
3. CampaignTypeView рендерится (noSignal=false, campaign=null) — 5 карточек типов.
4. Клик по типу (например, «Возврат брошенных действий») → `onSelect("abandoned", "Возврат брошенных действий")`.
5. Parent: `handleCampaignSelect(id, name)` → selectedCampaign заполнен, flowPhase остаётся "campaign".

**Исход:**
- Монтируется WorkflowView со signalName в sublabel первого узла.
- Placeholder чата меняется на «Опишите изменение сценария…».
- Над чатом появляется кнопка «Начать кампанию →» (пока `!workflowLaunched`).

---

### Сценарий 2. Открытие «Кампании» из сайдбара

**Триггер:** клик по «Кампании» в AppSidebar.

**2a. Нет сигнала (signalDone=false):**
- `handleNavChange("Кампании")` → activeNav="Кампании", flowPhase=null, selectedCampaign=null.
- CampaignTypeView: noSignal=true, campaign=null → empty-state «Нет сигналов».

**2b. Сигнал есть, кампания не запущена (signalDone=true, launchedCampaign=null):**
- CampaignTypeView: noSignal=false, campaign=null → 5 типов, placeholder «Выберите шаг или задайте вопрос…».

**2c. Сигнал + запущенная кампания (signalDone=true, launchedCampaign задан):**
- CampaignTypeView: noSignal=false, campaign={typeName, launchedAt} → карточка «Активна» + заголовок «Создать ещё одну кампанию» + 5 типов.

---

### Сценарий 3. Редактирование workflow через чат

**Триггер:** isWorkflow=true, !workflowLaunched — пользователь пишет команду в PromptInput.

**Шаги:**
1. `handlePromptSubmit(message)` → setWorkflowCommand(message.text).
2. WorkflowView.useEffect ловит pendingCommand.
3. `parseWorkflowCommand(pendingCommand)` → CommandUpdater | null.
4. Если CommandUpdater:
   - Flash (`wf-graph-flash`, 0.4s).
   - `setGraph(prev => updater(prev.nodes, prev.edges))`.
   - Видимые изменения: позиции узлов, цвета (новые узлы "amber"/"new"), sublabels.
   - Примеры команд:
     - «убери sms» — SMS-узел заменяется на Push(M), retarget sublabel обновляется, цвет → amber.
     - «добавь фильтр» — Activity-фильтр между signals/split, downstream-узлы сдвигаются вправо на 220px.
     - «добавь задержку» — Delay + Recheck перед retarget.
     - «условие email» — Engaged заменяется на Email-check с двумя Banner-ветками.
5. Null → toast «Команда не распознана» (2.5s).
6. После обработки → `onCommandHandled()` → родитель очищает workflowCommand.

**Исход:** граф визуально обновлён, состояние сохраняется до следующей команды/запуска.

---

### Сценарий 4. Запуск кампании и переход в статистику

**Триггер:** клик «Начать кампанию →» (виден при isWorkflow && !workflowLaunched).

**Шаги:**
1. onClick: `setWorkflowLaunched(true)`, `setCampaignDone(true)`, `setLaunchedCampaign({typeName, launchedAt})`.
2. WorkflowView получает launched=true:
   - Высота графа 100% → 55% (0.55s cubic-bezier).
   - WorkflowStatus анимируется в (delay 0.2s).
3. WorkflowStatus:
   - Бейдж «Кампания запущена» с пульс-точкой.
   - 3 карточки с анимацией (3000ms, 3300ms, 3700ms).
   - Кнопка «Посмотреть статистику →».
4. Клик по кнопке → `onGoToStats()` → `handleGoToStats()`:
   - activeNav="Статистика", flowPhase=null, selectedCampaign=null, workflowLaunched=false.
5. StatisticsView монтируется.

**Исход:** переход в статистику; campaignDone=true → Шаг 3 бейджа становится активным.

---

### Сценарий 5. Отображение сигнала в WorkflowView

**Триггер:** сигнал собран (signalScenarioId задан) → выбран тип кампании → монтируется WorkflowView.

**Флоу:**
1. `AttachmentEffect` в page.tsx отслеживает flowPhase + selectedCampaign.
2. Когда flowPhase="campaign" && !selectedCampaign && signalScenarioId:
   - Создаёт File: content=JSON.stringify({scenario}), filename=`сигнал_${signalScenarioId}.json`.
   - Добавляет в attachments.
3. WorkflowView получает signalName=`сигнал_${signalScenarioId}.json`.
4. `createBaseNodes(signalName)` → первый узел ("signals") получает sublabel=signalName.
5. Узел отображает: label «Сигналы + сегменты», sublabel — имя файла.

**Исход:** визуальная привязка workflow к конкретному сигналу; attachment виден в header PromptInput.

---

## 3. Точки входа/выхода

### Входы:
1. **WelcomeView → CampaignWorkspace (сигнал):** Step 1 badge click.
2. **AppSidebar «Кампании» → CampaignTypeView standalone:** `handleNavChange("Кампании")`.
3. **Step 2 badge → CampaignTypeView (post-signal):** после awaiting-campaign.
4. **LaunchFlyout → CampaignTypeView или signal flow:** `handleLaunchCampaign()`.
5. **CampaignTypeView → WorkflowView:** `onSelect()`.

### Выходы:
1. **WorkflowView → StatisticsView:** `onGoToStats()` в WorkflowStatus.
2. **WorkflowView → AppSidebar:** клик по любому пункту навигации (сбрасывает flowPhase, selectedCampaign).
3. **CampaignTypeView → StatisticsView/другие разделы:** через сайдбар.
4. **CampaignTypeView (noSignal) → «Сигналы»:** когда пользователь вынужден сначала создать сигнал.

---

## 4. Технические замечания

- **Машина состояний:** flowPhase + selectedCampaign + workflowLaunched определяют все UX-состояния.
- **Мутация графа:** immutable (spread), корректные ре-рендеры.
- **xylflow:** read-only, без drag/connect/select; вся интерактивность через чат-команды.
- **nodeTypes** вынесен вне компонента как стабильная ссылка (требование xylflow).
- **fitView** дебаунсится при смене `compact`.
- **Attachment сигнала** создаётся автоматически при входе в campaign-flow, очищается при уходе.
- **CampaignStepper** существует в коде, но не подключён к активному флоу.

---

**Отчёт сгенерирован:** 2026-04-17
