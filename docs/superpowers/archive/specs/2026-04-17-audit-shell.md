# Аудит оболочки и навигации (Раздел "Оболочка и навигация")

**Дата аудита:** 17 апреля 2026  
**Версия приложения:** Next.js (Client) → State-Machine-Driven SPА  
**Область обследования:** src/app/page.tsx, src/components/app-sidebar.tsx, src/components/launch-flyout.tsx, UI-компоненты оболочки

---

## 1. Иерархия и топография контента оболочки

### 1.1 Макет экрана (Flex Layout)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [Sidebar: 120px]        [Main Content Area: flex-1]                        │
├──────────────┼───────────────────────────────────────────────────────────────┤
│              │                                                               │
│  • Логотип   │  renderMain():                                               │
│  • Кнопка    │  • CampaignWorkspace (signal/awaiting-campaign)             │
│    "Запустить│  • CampaignTypeView (campaign selection)                   │
│  • Навигация │  • WorkflowView (campaign + workflow)                       │
│    - Сигналы │  • StatisticsView / SignalTypeView / WelcomeView           │
│    - Кампании│                                                              │
│    - Статист.│  ┌──────────────────────────────────────────────────────┐   │
│              │  │ [Bottom Chat Bar] — fixed/float 40% или 3% от низа   │   │
│              │  │ • Chat input + mic button                            │   │
│              │  │ • "Начать кампанию →" button (условный)             │   │
│              │  │ • Step badges [Шаг 1][Шаг 2][Шаг 3]                 │   │
│              │  └──────────────────────────────────────────────────────┘   │
│              │                                                               │
│  Профиль     │                                                               │
│  Баланс      │                                                               │
└──────────────┴───────────────────────────────────────────────────────────────┘
```

### 1.2 Sidebar (src/components/app-sidebar.tsx)

**Структура:**
- **Верхняя секция** (flex-col gap-5):
  - **Logo** (`/logo.svg`, 80×20px, приоритет загрузки)
  - **Кнопка "Запустить"** 
    - Icon: `CirclePlus`
    - Размер: h-[68px]
    - Callback: `onLaunchOpen()`
    - Стиль: `text-muted-foreground` → `hover:bg-accent`
  - **Navigation items** (flex-col gap-6, px-2):
    - "Сигналы" (Bell icon)
    - "Кампании" (Megaphone icon)
    - "Статистика" (BarChart2 icon)
    - Логика выбора: `activeNav === label` → `bg-accent text-accent-foreground`

- **Нижняя секция** (flex-col gap-3):
  - **Баланс** (label + amount: ₽24800)
  - **Dropdown menu** (Profile):
    - Avatar: инициалы "АК"
    - Name: "Арслан К."
    - Email: "arslan@afina.ai"
    - Menu items: Настройки, Финансы, Выйти (destructive)

**Состояние sidebar:**
- Меняет `bg-color` при открытии Launch flyout: `flyoutOpen ? "bg-card" : "bg-background"`

---

### 1.3 Launch Flyout (src/components/launch-flyout.tsx)

**Структура:** Fixed overlay, left-positioned, width 360px, z-50

**Две основные секции:**

#### Секция 1: "Запустить поиск сигналов"
Карточки сигналов (6 вариантов):
1. **Регистрация** — "Возврат пользователей после незавершённой регистрации или брошенной корзины"
2. **Первая сделка** — "Обогащение данных о клиенте, оценка потенциала и рисков"
3. **Апсейл** — "Мониторинг интереса к конкурентам, предотвращение оттока"
4. **Удержание** — "Мониторинг интереса к конкурентам и предотвращение оттока"
5. **Возврат** — "Определение оптимального момента для повторного контакта"
6. **Реактивация** — "Определение оптимального момента для повторного контакта"

Callback при клике: `onSignalSelect(card.id, card.title)` → закрыть flyout

#### Секция 2: "Запустить новую кампанию"
Карточки кампаний (5 вариантов):
1. "Возврат брошенных действий"
2. "Прогрев до следующего шага"
3. "Стимулирование повторной активности"
4. "Удержание через поведенческие триггеры"
5. "Реактивация через адаптивный сценарий"

Callback при клике: `onCampaignSelect()` → закрыть flyout

---

### 1.4 Bottom Chat Bar (фиксированная позиция)

**Контейнер:** `fixed left-[120px] right-0 z-30 bg-background px-8 pb-4`

**Позиция (animated):**
- `onWelcome` (null flowPhase, null activeNav) → `bottom: 40%` (выше, по центру)
- Иначе → `bottom: 3%` (в нижнем углу)
- Transition: 0.55s, ease `[0.32, 0.72, 0, 1]`

**Элементы (сверху вниз):**

1. **Gradient mask** (спец. элемент, `h-10 bg-gradient-to-t from-background to-transparent`)
2. **Launch button** (условный)
   - Текст: "Начать кампанию →"
   - Видимость: `isWorkflow && !workflowLaunched`
   - Callback: `setWorkflowLaunched(true)`, `setCampaignDone(true)`, сохраняет launchedCampaign
   - Стиль: `bg-foreground text-background px-5 py-2 text-sm font-semibold`
3. **PromptInput component** (Textarea + Mic button + Submit)
   - **Textarea:**
     - Placeholder зависит от `flowPhase`:
       - `"campaign" && selectedCampaign` → "Опишите изменение сценария..."
       - `"campaign"` → "Опишите вашу кампанию..."
       - `"signal"` → "Введите ваши параметры или задайте вопрос"
       - по умолчанию → "Выберите шаг или задайте вопрос…"
     - Callback: `onSubmit` → `handlePromptSubmit()`
   - **Mic button** (PromptInputButton, tooltip "Голосовой ввод")
   - **Submit button** (PromptInputSubmit)
   - **Attachment list** (PromptInputHeader — показ загруженных файлов, если есть)

4. **Step badges** (условно, если `!campaignDone`)
   - **Шаг 1: "Получение сигнала"**
     - `active: step1Active` (!signalDone)
     - `onClick: onWelcome ? handleStep1Click : undefined` (кликабелен только на Welcome)
     - Пульсация (зелёная): `animation: step-badge-pulse 1.4s` (не срабатывает)
   - **Шаг 2: "Запуск кампании"**
     - `active: step2Active` (signalDone && !campaignDone)
     - `onClick: flowPhase === "awaiting-campaign" ? handleStep2Click : undefined`
     - **Пульсирует (зелёная обводка)** при переходе в "awaiting-campaign" (1.4s)
   - **Шаг 3: "Статистика кампании"**
     - `active: step3Active` (campaignDone)
     - `onClick: undefined` (не кликабелен)

**Логика видимости:**
- Показывается всегда (`showBottomBar = true`)
- Step badges скрываются после `campaignDone = true`

---

## 2. Состояния и их переходы

### 2.1 Основная государственная машина

#### Тип `FlowPhase`
```typescript
type FlowPhase = "signal" | "awaiting-campaign" | "campaign" | null;
```

| Состояние | Описание | Включает | Выключает |
|-----------|---------|----------|-----------|
| `null` | На Welcome или в Sidebar-навигации | WelcomeView или Sidebar-view (Статистика/Сигналы/Кампании) | Guided flow |
| `"signal"` | Сбор сигнала (CampaignWorkspace) | CampaignWorkspace, Step 1 badge | Sidebar nav |
| `"awaiting-campaign"` | Сигнал завершён, Step 2 пульсирует | CampaignWorkspace (персистирует), Step 2 badge пульс | Campaign selection |
| `"campaign"` | Выбор типа кампании или workflow | CampaignTypeView или WorkflowView | Sidebar nav |

#### Вспомогательные состояния

| Состояние | Тип | Назначение |
|-----------|-----|-----------|
| `signalDone` | boolean | Марка: Step 1 завершён (→ Step 2 active) |
| `campaignDone` | boolean | Марка: Step 3 завершён (скрывает step badges) |
| `selectedCampaign` | `{id, name} \| null` | Хранит выбранный тип кампании |
| `workflowLaunched` | boolean | Workflow запущен (скрывает "Начать кампанию →") |
| `workflowCommand` | `string \| null` | Chat-сообщение в форме команды (при submit в campaign workflow) |
| `activeNav` | `string \| null` | Активный пункт sidebar ("Статистика", "Сигналы", "Кампании") |
| `launchedCampaign` | `{typeName, launchedAt} \| null` | Метаданные запущенной кампании |
| `initialScenario` | `{id, name} \| null` | Сценарий, выбранный из LaunchFlyout (для "Запустить сигнал") |
| `signalScenarioId` | string | ID созданного сценария сигнала |
| `signalCreatedAt` | string | Дата создания сигнала (RU format) |

### 2.2 Граф переходов

```
[null] (Welcome/Sidebar nav)
  ├─ handleStep1Click() → "signal"
  │  (Sidebar: Запустить/Сигналы/onCreateSignal)
  │
  ├─ handleLaunchSignal(id, name) → "signal"
  │  (LaunchFlyout: click signal card)
  │  + initialScenario = {id, name}
  │
  └─ activeNav = "Статистика"/"Сигналы"/"Кампании"
     (Sidebar nav button)

["signal"]
  ├─ handleStep8Reached(scenarioId) → "awaiting-campaign"
  │  (CampaignWorkspace Step 8 counter)
  │  + signalDone = true
  │  + signalScenarioId = scenarioId
  │
  └─ handleNavChange() → null + activeNav
     (Sidebar nav button)

["awaiting-campaign"]
  ├─ handleStep2Click() → "campaign"
  │  (Step 2 badge click)
  │
  └─ handleNavChange() → null + activeNav
     (Sidebar nav button)

["campaign"]
  ├─ !selectedCampaign → CampaignTypeView
  │  ├─ handleCampaignSelect(id, name) → selectedCampaign = {id, name}
  │  │
  │  └─ handleStep2Click() from SignalTypeView (Sidebar nav)
  │
  ├─ selectedCampaign → WorkflowView
  │  ├─ Chat submit → workflowCommand = message.text
  │  │
  │  ├─ Launch button click → workflowLaunched = true, campaignDone = true
  │  │
  │  └─ handleGoToStats() → null + activeNav = "Статистика"
  │
  └─ handleNavChange() → null + activeNav + reset workflow state
     (Sidebar nav button)
```

---

## 3. Сценарии пользователя (пронумерованные потоки)

### Сценарий 1: Клик по пункту сайдбара (Навигация)

**Триггер:** Клик на "Статистика", "Сигналы" или "Кампании" в sidebar

**Шаги:**
1. `handleNavChange(nav)` вызывается с `nav = "Статистика" | "Сигналы" | "Кампании"`
2. Состояние обновляется:
   - `activeNav = nav`
   - `flowPhase = null` (выход из guided flow)
   - `selectedCampaign = null`, `workflowLaunched = false`, `workflowCommand = null`, `initialScenario = null`
3. Sidebar кнопка получает класс `bg-accent text-accent-foreground`
4. Главная область переходит к соответствующему View (StatisticsView, SignalTypeView, CampaignTypeView)

**Исход:**
- Пользователь видит статический контент по выбранному разделу
- Guided flow сбросился, step badges остаются (если `!campaignDone`)

---

### Сценарий 2: Открытие LaunchFlyout и выбор "Запустить сигнал"

**Триггер:** Клик на кнопку "Запустить" (CirclePlus) в sidebar

**Шаги:**
1. `onLaunchOpen()` вызывается → `launchOpen = true`
2. Sidebar меняет фон: `bg-card` (вместо `bg-background`)
3. LaunchFlyout отображается (fixed overlay, z-50, 360px width)
4. Пользователь выбирает карточку сигнала (e.g., "Регистрация")
5. `onSignalSelect("registration", "Регистрация")` вызывается:
   - `launchOpen = false` (flyout закрывается)
   - `activeNav = null`, `initialScenario = {id: "registration", name: "Регистрация"}`
   - `flowPhase = "signal"`
6. CampaignWorkspace инициализируется с `initialScenario`

**Исход:**
- Пользователь входит в guided signal flow
- Step 1 badge активен
- Bottom chat bar показывает плейсхолдер "Введите ваши параметры или задайте вопрос"

---

### Сценарий 3: Открытие LaunchFlyout и выбор "Запустить кампанию"

**Триггер:** Клик на кнопку "Запустить" → выбор карточки кампании

**Шаги:**
1. `onLaunchOpen()` → `launchOpen = true`
2. LaunchFlyout отображается, Sidebar фон = `bg-card`
3. Пользователь выбирает карточку кампании (любую из 5)
4. `onCampaignSelect()` вызывается:
   - `launchOpen = false`
   - Проверка: `if (!signalDone)`:
     - Нет сигнала → `activeNav = "Сигналы"`, `flowPhase = null`
     - → Показывает SignalTypeView (требует завершить сигнал сначала)
   - Проверка: `if (signalDone)`:
     - Сигнал есть → `activeNav = null`, `flowPhase = "campaign"`
     - → Показывает CampaignTypeView (выбор типа кампании)

**Исход:**
- Если нет сигнала: SignalTypeView с сообщением "нужен сигнал"
- Если есть сигнал: CampaignTypeView (выбор типа кампании)

---

### Сценарий 4: Клик по Step 1 badge ("Получение сигнала")

**Триггер:** Клик на badge "Шаг 1 | Получение сигнала"

**Условия активности:**
- Видим: `step1Active = !signalDone` → badge активен (border-border, bg-card)
- Кликабелен: `onClick = onWelcome ? handleStep1Click : undefined`
  - `onWelcome = flowPhase === null && activeNav === null`

**Шаги (если onWelcome = true):**
1. `handleStep1Click()` вызывается:
   - `activeNav = null`
   - `flowPhase = "signal"`
2. CampaignWorkspace загружается
3. Bottom chat bar показывает плейсхолдер "Введите ваши параметры или задайте вопрос"

**Исход:**
- Пользователь входит в guided signal flow
- Если уже в flow (onWelcome = false), клик не действует (disabled стиль)

---

### Сценарий 5: Клик по Step 2 badge ("Запуск кампании") — только в awaiting-campaign

**Триггер:** Клик на badge "Шаг 2 | Запуск кампании"

**Условия активности:**
- Видим: `step2Active = signalDone && !campaignDone` → badge активен
- Кликабелен: `onClick = flowPhase === "awaiting-campaign" ? handleStep2Click : undefined`
- **Пульсирует зелёным** при переходе в "awaiting-campaign" (1.4s анимация)

**Шаги (если flowPhase === "awaiting-campaign"):**
1. `handleStep2Click()` вызывается:
   - `flowPhase = "campaign"`
2. CampaignTypeView загружается (выбор типа кампании)
3. Bottom chat bar показывает плейсхолдер "Опишите вашу кампанию..."

**Исход:**
- Пользователь видит варианты типов кампаний
- Step 2 badge больше не пульсирует

---

### Сценарий 6: Step 8 counter в CampaignWorkspace достигает конца

**Триггер:** CampaignWorkspace триггер Step 8 (counter активирован)

**Шаги:**
1. `onStep8Reached(scenarioId)` вызывается из CampaignWorkspace:
   - `signalDone = true`
   - `signalScenarioId = scenarioId`
   - `signalCreatedAt = new Date().toLocaleDateString("ru-RU")`
   - `flowPhase = "awaiting-campaign"` (но CampaignWorkspace остаётся видимой!)
2. Bottom chat bar:
   - Step 2 badge становится активным (step2Active = true)
   - Step 2 badge **пульсирует зелёным** 1.4s
   - Плейсхолдер остаётся "Введите ваши параметры..."
3. CampaignWorkspace показывает кнопку "Начать кампанию →" (если код это предусмотрел)

**Исход:**
- Пользователь видит визуальный сигнал (пульсирующий badge), что сигнал готов
- Может кликнуть Step 2 badge или кнопку "Начать кампанию →"

---

### Сценарий 7: Выбор типа кампании (CampaignTypeView)

**Триггер:** Пользователь в flowPhase === "campaign" без selectedCampaign, клик на карточку кампании

**Шаги:**
1. `handleCampaignSelect(id, name)` вызывается:
   - `selectedCampaign = {id, name}`
   - `flowPhase = "campaign"` (остаётся)
   - `workflowLaunched = false`, `workflowCommand = null`
2. WorkflowView загружается:
   - Получает `launched={false}`, `pendingCommand={null}`
   - Показывает workflow граф для редактирования
3. Bottom chat bar:
   - Кнопка "Начать кампанию →" видна (исчезнет после click)
   - Плейсхолдер: "Опишите изменение сценария..."
   - Step badges остаются видимыми

**Исход:**
- Пользователь может редактировать workflow и отправлять команды
- Chat input передаёт `workflowCommand` в WorkflowView

---

### Сценарий 8: Chat submit в workflow (WorkflowView edit mode)

**Триггер:** Пользователь в `flowPhase === "campaign" && selectedCampaign && !workflowLaunched`, отправляет сообщение

**Шаги:**
1. `handlePromptSubmit(message)` вызывается:
   - Проверка: `if (flowPhase === "campaign" && selectedCampaign && !workflowLaunched)`
     - **TRUE** → `workflowCommand = message.text`
     - **FALSE** → ничего не делается
2. WorkflowView получает `pendingCommand={message.text}`, обрабатывает команду
3. После обработки WorkflowView вызывает `onCommandHandled()`:
   - `workflowCommand = null` (очищается)

**Логика attachment:**
- При `flowPhase === "campaign" && selectedCampaign === null && signalScenarioId`:
  - Автоматически прикрепляется файл `сигнал_{scenarioId}.json` с содержимым `{scenario: scenarioId}`
  - Показывается в PromptInputHeader

**Исход:**
- Chat input доставляет текстовую команду в workflow для изменения граф-структуры
- WorkflowView мог бы использовать это для AI-модификаций

---

### Сценарий 9: Клик кнопки "Начать кампанию →"

**Триггер:** Видимость: `isWorkflow && !workflowLaunched` (flowPhase === "campaign" && selectedCampaign !== null && !workflowLaunched)

**Шаги:**
1. Пользователь кликает на кнопку "Начать кампанию →"
2. `onClick` callback:
   - `workflowLaunched = true`
   - `campaignDone = true`
   - `launchedCampaign = {typeName: selectedCampaign.name, launchedAt: new Date().toLocaleDateString("ru-RU")}`
3. WorkflowView переходит в режим `launched={true}` (показ результатов, граф read-only)
4. Bottom chat bar:
   - Кнопка "Начать кампанию →" **исчезает** (условие `!workflowLaunched` = false)
   - Step badges **исчезают** (условие `!campaignDone` = false)
   - Chat input остаётся (зависит от implementation)

**Исход:**
- Кампания "запущена", система в финальном состоянии
- Пользователь может просмотреть результаты в StatisticsView

---

### Сценарий 10: "Go to Stats" из WorkflowView

**Триггер:** Пользователь клик на ссылку/кнопку "Перейти в статистику" (из WorkflowView)

**Шаги:**
1. `onGoToStats()` callback из WorkflowView:
   - `activeNav = "Статистика"`
   - `flowPhase = null`
   - `selectedCampaign = null`
   - `workflowLaunched = false` (остальное не тронут)
2. Главная область переходит к StatisticsView
3. Sidebar показывает "Статистика" как активный пункт (bg-accent)

**Исход:**
- Пользователь видит статистику запущенной кампании

---

## 4. Точки входа и выхода в другие разделы

### 4.1 Входы (к оболочке)

| Источник | Действие | Целевое состояние | Передаёт |
|----------|---------|------------------|----------|
| WelcomeView | Click "Шаг 1" или "Запустить сигнал" | flowPhase = "signal" | (none) / initialScenario |
| LaunchFlyout | Select signal card | flowPhase = "signal" | initialScenario = {id, name} |
| LaunchFlyout | Select campaign card | flowPhase = "campaign" или activeNav = "Сигналы" | (none) |
| Sidebar nav | Click "Сигналы"/"Кампании"/"Статистика" | activeNav = nav, flowPhase = null | nav |
| Step badges | Click Step 1 (onWelcome) | flowPhase = "signal" | (none) |
| Step badges | Click Step 2 (awaiting-campaign) | flowPhase = "campaign" | (none) |
| SignalTypeView | Click "Создать сигнал" | flowPhase = "signal" | (none) |
| SignalTypeView | Click "Запустить кампанию" (signalDone) | flowPhase = "campaign" | (none) |
| CampaignTypeView | Click campaign type | selectedCampaign = {id, name}, flowPhase = "campaign" | {id, name} |

### 4.2 Выходы (к другим view)

| Текущее состояние | Выход | Целевой view | Передаёт |
|------------------|-------|-------------|----------|
| activeNav = null, flowPhase = null | (no exit) | WelcomeView | (none) |
| activeNav = "Статистика", flowPhase = null | — | StatisticsView | (none) |
| activeNav = "Сигналы", flowPhase = null | — | SignalTypeView | signal (если signalDone), onCreateSignal, onLaunchCampaign |
| activeNav = "Кампании", flowPhase = null | — | CampaignTypeView | campaign (если launchedCampaign), onSelect, noSignal (если !signalDone) |
| flowPhase = "signal" / "awaiting-campaign" | — | CampaignWorkspace | initialScenario, onSignalComplete, onStep8Reached |
| flowPhase = "campaign", selectedCampaign = null | — | CampaignTypeView | onSelect |
| flowPhase = "campaign", selectedCampaign ≠ null | — | WorkflowView | launched, pendingCommand, onCommandHandled, onGoToStats, signalName |

### 4.3 Интеграция с другими разделами (передача управления)

1. **CampaignWorkspace** (Step 8 counter) → `onStep8Reached(scenarioId)`:
   - Вызывает: `setFlowPhase("awaiting-campaign")`, `setSignalDone(true)`, `setSignalScenarioId(scenarioId)`
   - Оболочка реагирует: Step 2 badge активируется и пульсирует

2. **CampaignWorkspace** (кнопка "Начать кампанию →") → `onSignalComplete()`:
   - Вызывает: `setFlowPhase("campaign")`
   - Оболочка переходит к выбору типа кампании

3. **CampaignTypeView** → `onSelect(id, name)`:
   - Вызывает: `setSelectedCampaign({id, name})`, `setFlowPhase("campaign")`
   - Оболочка загружает WorkflowView

4. **WorkflowView** → `onCommandHandled()`:
   - Вызывает: `setWorkflowCommand(null)`
   - Оболочка очищает очередь команд

5. **WorkflowView** → `onGoToStats()`:
   - Вызывает: `setActiveNav("Статистика")`, `setFlowPhase(null)`, `setSelectedCampaign(null)`
   - Оболочка переходит к StatisticsView

---

## 5. Компоненты UI (краткая роль)

### 5.1 Из src/components/ui/

- **button.tsx** — стандартные кнопки (nav buttons, launch btn, step badges)
- **badge.tsx** — step badges (Шаг 1, 2, 3)
- **card.tsx** — карточки (в LaunchFlyout, UI cards)
- **dropdown-menu.tsx** — profile menu в sidebar (Настройки, Финансы, Выйти)
- **avatar.tsx** — user avatar в sidebar
- **textarea.tsx** — в PromptInput (chat input field)
- **tooltip.tsx** — mic button tooltip
- **spinner.tsx** — возможно, в PromptInputSubmit (loading state)
- **input-group.tsx** — группировка textarea + кнопок в PromptInput

### 5.2 Из src/components/ai-elements/

- **prompt-input.tsx** — основной компонент bottom chat bar:
  - PromptInputProvider, PromptInputHeader, PromptInputBody, PromptInputFooter
  - PromptInputTextarea, PromptInputButton, PromptInputSubmit
  - usePromptInputController(), usePromptInputAttachments()
  - Управляет состоянием input, attachments, submit logic
- **message.tsx** — может быть использована в workflow/statistics view (не в оболочке)

---

## 6. Особенности реализации

### 6.1 Механизм step-badge-pulse

```css
@keyframes step-badge-pulse {
  0%, 100% { border-color: #1e1e1e; box-shadow: none; }
  20%, 60% { border-color: #4ade80; box-shadow: 0 0 8px rgba(74,222,128,0.35); }
  40%, 80% { border-color: #1e1e1e; box-shadow: none; }
}
```

**Триггер:** `stepTwoNew && n === 2` (когда `flowPhase` переходит в "awaiting-campaign")
- `useRef` отслеживает предыдущий `flowPhase`
- При транзиции `null → "awaiting-campaign"` или `"signal" → "awaiting-campaign"`:
  - `setStepTwoNew(true)`
  - Таймер 1400ms → `setStepTwoNew(false)`
- Анимация: 1.4s ease-in-out (совпадает с timeout)

### 6.2 Attachment logic

При `flowPhase === "campaign"` и `selectedCampaign === null` и `signalScenarioId` ≠ "":
- Автоматически создаётся File объект: `новый сигнал_${scenarioId}.json`
- JSON: `{scenario: scenarioId}`
- Добавляется в attachments через `usePromptInputController().attachments.add([file])`
- Показывается в `PromptInputHeader` (список загруженных файлов)

При выходе из этого состояния → `attachments.clear()`

### 6.3 Float/Animate bottom bar

- `floatBottom`: Зависит от `onWelcome` (40% или 3%)
- Transition: 0.55s, ease `[0.32, 0.72, 0, 1]` (custom cubic-bezier)
- Gradient mask для плавного исчезновения контента сзади

### 6.4 Conditional rendering в renderMain()

```typescript
if (flowPhase === "signal" || flowPhase === "awaiting-campaign") → CampaignWorkspace
if (flowPhase === "campaign" && !selectedCampaign) → CampaignTypeView
if (flowPhase === "campaign" && selectedCampaign) → WorkflowView
if (activeNav === "Статистика") → StatisticsView
if (activeNav === "Сигналы") → SignalTypeView
if (activeNav === "Кампании") → CampaignTypeView
// else → WelcomeView
```

---

## 7. Критические зависимости состояний

| Функция | Зависит от | Побочные эффекты |
|---------|-----------|------------------|
| `handleNavChange(nav)` | (user input) | Очищает flowPhase, selectedCampaign, workflowLaunched, workflowCommand, initialScenario |
| `handleStep1Click()` | (user click badge) | Очищает activeNav, устанавливает flowPhase = "signal" |
| `handleStep8Reached(scenarioId)` | CampaignWorkspace step counter | Пульсирует Step 2 badge (1.4s), устанавливает signalDone = true |
| `handlePromptSubmit(message)` | (user chat input) | Только при flowPhase === "campaign" && selectedCampaign, устанавливает workflowCommand |
| `onStep8Reached` → `stepTwoNew` setter | flowPhase transition | Таймер 1400ms, затем reset |

---

## 8. Потенциальные неоднозначности (замечания аудитора)

1. **Attachment persistence:** При переходе из `flowPhase="campaign" && selectedCampaign === null` в другой state — attachments очищаются. Но если пользователь добавил свои файлы вручную, они будут потеряны.

2. **Step 2 pulse trigger:** Пульсация Step 2 badge срабатывает только при транзиции в "awaiting-campaign", но не при повторном входе в state. Это может быть ожидаемым поведением.

3. **Step 1 onClick disabled:** Шаг 1 кликабелен только на Welcome (`onWelcome = true`). Если пользователь находится в guided flow, но захочет "перезагрузить" сигнал — он не может через badge, только через Sidebar → Сигналы → Создать сигнал.

4. **Launch button placement:** Кнопка "Начать кампанию →" находится внутри bottom bar, но её click logic привязана к main page.tsx, а не к компоненту WorkflowView. Это потенциальный UX issue: при разделении WorkflowView в отдельный файл может быть путаница.

5. **Launch Flyout persistence:** Flyout закрывается сразу после выбора (в `onSignalSelect` и `onCampaignSelect` вызывается `onClose()`). Это означает, что пользователь не может выбрать несколько сигналов подряд.

---

## Заключение

Оболочка реализует **трёхуровневую навигационную машину состояний:**
1. **Sidebar navigation** (статические view)
2. **Guided flow** (flowPhase: signal → awaiting-campaign → campaign)
3. **Workflow execution** (WorkflowView + bottom chat bar)

**Ключевые элементы UI:**
- Sidebar (nav, launch button, profile)
- Launch Flyout (signal + campaign cards)
- Bottom Chat Bar (textarea + mic + step badges + launch button)

**Критический path:**
Welcome → Step 1 (signal) → Step 8 (awaiting) → Step 2 (campaign selection) → Campaign type → Workflow (graph edit) → Launch button → campaignDone

**Состояние управляется централизованно в page.tsx**, что упрощает отладку, но создаёт potential scalability issue при добавлении новых состояний.
