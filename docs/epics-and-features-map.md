# Карта эпиков и фич прототипа Афины

> Документ построен по методологии из `epics-and-features-definition.md`: **эпик = секция** (`src/sections/<секция>`) или сквозной слой, **фича = связный кластер компонентов и состояния внутри секции**, реализующий одну узнаваемую пользователем пользу. Уровни story/task не вводятся. Ниже — результат обхода фактического кода (`src/sections`, `src/state`, `src/app/page.tsx`).

## Как читать

Каждая фича сформулирована в формате `<действие> <результат>` и привязана к адресуемой группе файлов. Отдельные компоненты, контексты и утилиты вынесены в раздел «Инфраструктура» — по методологии это не фичи, а детали реализации.

Прототип — это SPA с одним роутом (`src/app/page.tsx`); навигация между эпиками идёт через `view.kind` и `activeSection` в `src/state/app-state.ts`. Четыре раздела сайдбара (`SectionName = "Сигналы" | "Кампании" | "Статистика" | "Настройки"`) плюс два сквозных флоу (онбординг, AI-оболочка) и анкета-гейт дают семь эпиков.

## Сводка

| # | Эпик | Каталог | Тип | Фич |
|---|------|---------|-----|-----|
| 1 | Онбординг и приветствие | `sections/welcome` | Сквозной флоу (первый запуск) | 4 |
| 2 | Анкета аккаунта | `sections/survey` | Гейт перед работой | 3 |
| 3 | Сигналы | `sections/signals` | Раздел навигации | 6 |
| 4 | Кампании | `sections/campaigns` | Раздел навигации | 6 |
| 5 | Статистика | `sections/statistics` | Раздел навигации | 4 |
| 6 | Настройки | `sections/settings` | Раздел навигации | 1 (6 блоков) |
| 7 | AI-оболочка | `sections/shell` + `state/suggestion-registry` | Сквозной слой | 5 |

Итого: **7 эпиков**, ~29 фич.

---

## 1. Онбординг и приветствие — `sections/welcome`

Первый запуск: знакомство с продуктом и AI-режимами до начала работы. Узнаётся как «большой сценарий» (первый вход), а не пункт навигации.

| Фича | Польза | Код-якорь |
|------|--------|-----------|
| Интро-оверлей AI-режимов | Объяснить пользователю, как работает AI-первый интерфейс, при первом входе | `intro-overlay.tsx` |
| Онбординг-чат | Провести пользователя через первый диалог с проводником | `onboarding-chat.ts`, `onboarding-chat-view.tsx`, `use-onboarding-chat.ts` |
| Стартовые карточки шагов | Показать стартовые шаги-карточки как точки входа в продукт | `onboarding-step-cards.tsx`, `welcome-view.tsx` |
| Сборка welcome-экрана | Скомпоновать welcome как единый экран первого запуска | `welcome-section.tsx`, `welcome-chat-context.tsx` |

Инфраструктура эпика: `welcome-chat-context.tsx` (контекст чата welcome, инстанцируется внутри общего `ChatProvider` — см. `WelcomeChatBridge` в `page.tsx`).

## 2. Анкета аккаунта — `sections/survey`

Настройка бизнес-профиля как гейт перед работой. Гейт реализован в `state/survey-gate.ts` + `state/survey-validation.ts`.

| Фича | Польза | Код-якорь |
|------|--------|-----------|
| Форма анкеты направлений | Заполнить бизнес-профиль (направления) для настройки продукта | `survey-form.tsx`, `direction-combobox.tsx`, `survey-section.tsx` |
| Экран выбора интересов | Выбрать интересы аудитории для подбора сигналов | `onboarding-interests-screen.tsx` |
| Экран выбора сценариев | Выбрать сценарии работы для персонализации | `onboarding-scenarios-screen.tsx` |

Инфраструктура: `survey-awaiting.tsx` (состояние ожидания обработки), `index.ts`; гейт-логика в `state/survey-gate.ts`, `state/survey-validation.ts`.

## 3. Сигналы — `sections/signals`

Подбор интент-аудиторий по сценарию. Раздел сайдбара «Сигналы». Центральная фича — мастер из 8 шагов (`steps/`).

| Фича | Польза | Код-якорь |
|------|--------|-----------|
| Мастер создания сигнала (8 шагов) | Создать интент-сигнал по сценарию пошагово | `steps/step-1..8-*.tsx`, `campaign-stepper.tsx`, `wizard-navigation.ts`, `guided-signal-section.tsx`, `campaign-workspace.tsx` |
| Карточка и экран сигнала | Посмотреть и открыть готовый сигнал | `signal-card.tsx`, `signal-screen.tsx`, `signal-summary-data.ts` |
| Каталог сценариев | Выбрать сценарий для нового сигнала | `scenario-card.tsx`, `segments-catalog.ts`, `new-signal-menu.tsx` |
| Разбивка приоритета сегментов | Понять структуру и приоритеты сегментов сигнала | `segment-priority-breakdown.tsx` |
| Пополнение баланса | Пополнить баланс под запуск сигнала | `top-up-modal.tsx` |
| Загрузка готового сигнала | Загрузить уже подготовленный сигнал файлом | `upload-signal-dialog.tsx`, `steps/step-4-upload.tsx` |

Инфраструктура: `signals-section.tsx`, `signals-empty-state.tsx`, `wizard-navigation.ts` (логика навигации мастера). Внутренние шаги мастера — структура одной фичи, не отдельные фичи.

## 4. Кампании — `sections/campaigns`

Запуск и управление рекламными кампаниями поверх сигналов. Раздел сайдбара «Кампании». Самый крупный каталог секций.

| Фича | Польза | Код-якорь |
|------|--------|-----------|
| Конструктор воркфлоу кампании | Настроить воркфлоу кампании на графе узлов | `workflow-graph.tsx`, `workflow-node.tsx`, `workflow-section.tsx`, `workflow-view.tsx`, `node-card-content.tsx` |
| Редактор письма | Отредактировать письмо кампании | `email-editor-panel.tsx`, `email-field.tsx`, `email-renderer.tsx` |
| Оплата кампании | Оплатить запуск кампании | `campaign-payment-screen.tsx` |
| Список и карточки кампаний | Просмотреть и отфильтровать список кампаний | `campaigns-section.tsx`, `campaign-card.tsx`, `campaign-filter-chips.tsx`, `campaigns-no-results.tsx` |
| Создание кампании | Создать новую кампанию из сигнала | `new-campaign-card.tsx`, `new-campaign-menu.tsx`, `campaign-type-view.tsx` |
| Экран кампании | Открыть кампанию и её показатели | `campaign-screen.tsx`, `campaign-metrics.ts` |

Инфраструктура: `node-field-combobox.tsx`, `status-badge.tsx`, `split-fields.tsx`, `provider-list.tsx`, `canvas-header.tsx`, `workflow-mini-preview.tsx`, `node-visuals.ts`, `workflow-graph-cache.ts`, `campaign-cost.ts`, контексты `workflow-readonly-context.ts` / `workflow-signal-context.ts`. Валидация воркфлоу — `state/workflow-validation.ts`, шаблоны — `state/workflow-templates.ts`.

## 5. Статистика — `sections/statistics`

Аналитика по кампаниям и сигналам. Раздел сайдбара «Статистика». Построена вокруг конструктора отчёта и куба фактов (`fact-cube.ts`).

| Фича | Польза | Код-якорь |
|------|--------|-----------|
| Конструктор отчёта | Собрать отчёт по нужным условиям и уровням | `search-conditions.tsx`, `search-settings-levels.tsx`, `view-settings-levels.tsx`, `fields/*.tsx` |
| Drill-in по показателям | Провалиться вглубь показателя для детализации | `drill-in-popover.tsx` |
| Шаблоны отчётов | Сохранить и переиспользовать конфигурацию отчёта | `report-templates.ts`, `save-template-dialog.tsx` |
| Просмотр отчёта | Посмотреть собранный отчёт | `statistics-view.tsx`, `statistics-section.tsx` |

Инфраструктура: `fact-cube.ts` (движок агрегации), `mock-data.ts`, `period-utils.ts`, `statistics-state.ts`; поля-контролы `fields/chip-multiselect.tsx`, `grouped-select.tsx`, `period-field.tsx`, `simple-select.tsx`.

## 6. Настройки — `sections/settings`

Профиль аккаунта. Раздел сайдбара «Настройки». По методологии это один эпик с одной пользой («управлять профилем аккаунта»), реализованной набором тематических блоков — каждый блок не самостоятельная польза, а часть профиля.

| Фича | Польза | Код-якорь |
|------|--------|-----------|
| Управление профилем аккаунта | Отредактировать настройки бизнес-профиля | `settings-section.tsx` + блоки: `business-block.tsx`, `site-block.tsx`, `domains-block.tsx`, `interests-block.tsx`, `regions-block.tsx`, `voice-block.tsx`, `summary-block.tsx` |

Инфраструктура: `settings-field.tsx` (общий контрол поля).

> Замечание: если какой-то из блоков (например, домены или голос бренда) разовьётся в самостоятельный сценарий с собственной пользой, его стоит выделить в отдельную фичу. Сейчас блоки — внутренняя структура одной фичи.

## 7. AI-оболочка (сквозной эпик) — `sections/shell` + `state/suggestion-registry`

Единый AI-слой поверх всех разделов. Не пункт навигации, но самостоятельный крупный блок: PromptBar, чат-дровер, очередь черновиков, контекстные подсказки.

| Фича | Польза | Код-якорь |
|------|--------|-----------|
| PromptBar — единая точка ввода | Ввести AI-запрос из любого раздела | `prompt-bar.tsx`, `prompt-composer.tsx`, `shell-bottom-bar.tsx` |
| Чат-дровер для сложных запросов | Вести развёрнутый диалог с AI в дровере | `chat-drawer.tsx`, `chat-panel.tsx`, `chat-panel-header.tsx`, `chat-history-list.tsx` |
| Очередь черновиков | Просмотреть и применить AI-черновики изменений | `draft-queue-list.tsx`; логика `state/draft-queue-context.tsx`, `state/apply-draft.ts` |
| Контекстные подсказки | Получить релевантные подсказки под текущий экран | `suggestion-bar.tsx`; реестр `state/suggestion-registry/` (`registry.ts`, `sections.ts`, `views.ts`, `wizard.ts`, `commands.ts`, `node-context.ts`, `welcome-waves.ts`) |
| Сайдбар и навигация оболочки | Переключаться между разделами и флоу | `app-sidebar.tsx`, `launch-flyout.tsx` |

Инфраструктура: `transient-reply.tsx`, `use-ai-reply-auto-dismiss.ts`, `use-chat-submit.ts`; общие контексты `state/chat-context.tsx`, `state/prompt-chips-context.tsx`, `state/trigger-edit-context.tsx`; разбор команд `state/structural-commands.ts`, `state/select-prompt-suggestions.ts`.

---

## Инфраструктура вне эпиков

Сквозные слои, обслуживающие фичи, но не являющиеся фичами сами по себе (по методологии):

- **Глобальное состояние:** `state/app-state.ts` (+ `app-state-context.tsx`) — единый редьюсер view/навигации.
- **Справочники и движки:** `state/field-directory.ts`, `state/email-directory.ts`, `state/scenario-map.ts`, `state/scenario-display.ts`, `state/metrics.ts`, `state/presets.ts`, `statistics/fact-cube.ts`, `signals/segments-catalog.ts`.
- **Валидация:** `state/survey-validation.ts`, `state/workflow-validation.ts`, `state/node-field-editability.ts`.
- **Типы и данные:** `src/types`, `src/data`.
- **Общие UI-компоненты:** `src/components` (включая `ai-elements`, `dev`).

## Наблюдения

1. **Соответствие методологии однозначное.** Каждый раздел сайдбара = эпик-каталог, крупные флоу (welcome, shell) = сквозные эпики — ровно как в определении. Карта из `epics-and-features-definition.md` подтверждается фактическим кодом без расхождений.
2. **Кампании — самый тяжёлый эпик** (~33 файла): кандидат на дополнительную внутреннюю декомпозицию, если фич станет больше (например, выделить «провайдеры/каналы доставки» при росте `provider-list`).
3. **Настройки — пограничный случай:** формально один эпик с одной пользой. Шесть `*-block.tsx` пока не тянут на отдельные фичи (нет отдельной узнаваемой пользы у каждого).
4. **AI-оболочка опирается на `suggestion-registry`** как на свою «карту контекста»: подсказки разведены по слоям (секции, view, мастер, узлы, welcome-волны) — это ядро фичи «контекстные подсказки».
5. **Каждую фичу можно привязать к вопросу из трекинг-таблицы** напрямую; статус вопроса живёт на вопросе, а не на фиче.
