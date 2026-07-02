# Block B — Экраны-списки (Сигналы + Кампании)

**Дата:** 2026-04-18
**Блок роадмапа:** B (см. `docs/Доработки интерфейса 18.04.md`, `MEMORY.md → project_afina_18_04_roadmap`)
**Зависимости:** блоки A + A.5 уже в main (typed collections + dev-panel).
**Следующий блок:** C — Canvas header + валидация запуска.

## 1. Цели и scope

Переписать разделы **Сигналы** и **Кампании** (standalone-режим) с adapter-слоя A.5 на реальные списки карточек. Добавить dropdown «+ Новый сигнал» с двумя путями создания: 8-шаговый мастер и модалка загрузки готового файла. Удалить adapter-код блока A.5.

**В скоупе:**
- `SignalsSection` — переписывается в список карточек (одна колонка)
- `CampaignsSection` (standalone) — переписывается в список карточек (одна колонка)
- Dropdown «+ Новый сигнал» → «Создать новый» / «Загрузить с устройства»
- Модалка `UploadSignalDialog` (минимальная: файл + импорт)
- Empty state для обеих секций
- Новые action'ы `campaign_from_signal`, `campaign_opened`
- CTA «Создать кампанию» с карточки сигнала → **сразу в Canvas**, минуя `campaign-select`
- Удаление adapter-кода: `signal-type-view.tsx`, `campaign-type-view.tsx` (опционально — см. §5), `TYPE_TO_SCENARIO` в `scenario-map.ts`, `mode` prop у `CampaignsSection`

**Вне скоупа (в других блоках):**
- Canvas header, кнопки «Сохранить черновик» / «Запустить», валидация (блок C)
- Новые workflow-ноды и визуальные состояния (блок D)
- Промпт-бар и AI-цикл (блок E)
- Переработка левого меню и dropdown «Запустить» (блок F)

## 2. Переиспользование существующих компонентов

Согласно `MEMORY.md → feedback_reuse_audit_in_specs.md` — сначала список того, что берём как есть или с минимальной доработкой:

| Компонент | Путь | Как используется |
|-----------|------|------------------|
| `Card`, `CardContent` | `src/components/ui/card.tsx` | Основа `SignalCard`, `CampaignCard` |
| `Button` | `src/components/ui/button.tsx` | CTA в карточках, модалке, empty states |
| `DropdownMenu` | `src/components/ui/dropdown-menu.tsx` | `NewSignalMenu` |
| `Dialog` | `src/components/ui/dialog.tsx` | `UploadSignalDialog` |
| Drag-and-drop из `step-5-upload.tsx` | `src/sections/signals/steps/step-5-upload.tsx` | Выносится в `DropZone`, переиспользуется в step-5 и модалке |
| `HashingLoader` из `step-5-upload.tsx` | там же | Выносится вместе с `DropZone`, переиспользуется |
| `useAppState` / `useAppDispatch` | `src/state/app-state-context.tsx` | Без изменений |
| `SCENARIO_TO_TYPE` | `src/state/scenario-map.ts` | Продолжает использоваться мастером |
| Presets A.5 | `src/state/presets.ts` | Без изменений — секции начнут показывать реальные данные |
| Reducer case `campaign_selected` | `src/state/app-state.ts` | Новый `campaign_from_signal` переиспользует `view: workflow`-логику |

## 3. UX и layout

### 3.1 Общие правила

- **Одна колонка** для списка карточек (см. `MEMORY.md → feedback_single_column_lists.md`)
- Контейнер `max-w-2xl`, центрированный, тот же паддинг что у текущих секций (`px-8 pb-40 pt-[140px]`)
- Сортировка: по убыванию `updatedAt` для сигналов, по `launchedAt ?? scheduledFor ?? createdAt` для кампаний
- Header секции: 38px заголовок слева; опциональный action справа

### 3.2 Signals section

**Header:**
- Слева: «Сигналы» (38px semibold)
- Справа: кнопка **+ Новый сигнал** (`Button` variant=outline) → открывает `NewSignalMenu`

**`NewSignalMenu` (DropdownMenu):**
- Пункт 1: «Создать новый» → `dispatch({ type: "start_signal_flow" })` (существующий action)
- Пункт 2: «Загрузить с устройства» → открывает `UploadSignalDialog`

**`SignalCard` (inline-минимум, «вариант C»):**
```
Апсейл · 4 312                             18.04.2026
Макс 420 · Выс 1 200 · Ср 1 800 · Низ 892
[Создать кампанию]                              [↓]
```
- Первая строка: `{type} · {count}` слева; `{updatedAt}` справа (формат `dd.MM.yyyy` через `toLocaleDateString('ru-RU')`)
- Вторая строка: сегменты одной строкой `Макс {max} · Выс {high} · Ср {mid} · Низ {low}` (все 4 уровня всегда, даже если 0 — формат стабильный)
- Третья строка: слева — primary-кнопка «Создать кампанию»; справа — icon-only `Download` кнопка
- Клик по пустой области карточки — noop (детализация сигнала вне блока B)
- Клик «Создать кампанию» → `dispatch({ type: "campaign_from_signal", signalId: signal.id })`
- Клик «↓» → `console.log("download signal", signal.id)` (заглушка)

**`SignalsEmptyState`:**
- Центрируется через absolute positioning на свободной площади (по примеру текущего empty state)
- Копи: «Ещё нет сигналов. Создайте первый — или загрузите готовую базу с устройства.»
- CTA: **+ Новый сигнал** — ре-использует `NewSignalMenu`, но как primary-trigger (`Button` без `variant=outline`). Поведение dropdown идентично header-варианту.

**`UploadSignalDialog` (Dialog):**
- Заголовок: «Загрузите файл с номерами»
- Тело: `<DropZone accept=".csv,.xlsx,.txt" onFile={setFile} file={file} />`
- Подсказка: «CSV, XLSX, TXT · до 50 МБ · по одному номеру на строку»
- Footer: кнопка «Импортировать» (disabled без файла)
- Клик «Импортировать» → показывается `HashingLoader` (3 стадии из step-5) → по `onComplete`:
  - Создаётся `Signal`: `id: sig_${nanoid(6)}`, `type: "Регистрация"` (default), `count`: `Math.floor(Math.random() * 4500) + 500` (заглушка, 500–5000), сегменты — `{ max: 0, high: 0, mid: count, low: 0 }` (заглушка: всё идёт в mid, формат стабилен), `createdAt` и `updatedAt` — текущее время
  - `dispatch({ type: "signal_added", signal })`
  - Dialog закрывается

### 3.3 Campaigns section

**Header:**
- Слева: «Кампании» (38px semibold)
- Справа: пусто (кампании создаются из сигналов)

**`CampaignCard`:**
```
Летний апсейл премиум                     [● Активно]
Сигнал: Апсейл · 4 312          Запущена 18.04.2026
```
- Первая строка: имя кампании слева (semibold), `StatusBadge` справа
- Вторая строка: `Сигнал: {signal.type} · {signal.count}` слева; таймстамп-строка справа
  - `active` → «Запущена {launchedAt}»
  - `scheduled` → «Запуск {scheduledFor}»
  - `draft` → «Черновик от {createdAt}»
  - `completed` → «Завершена {completedAt}»
- Если `signalId` не находит сигнал (edge case) — слева «Сигнал: —»
- Клик по карточке → `dispatch({ type: "campaign_opened", id: campaign.id })`

**`StatusBadge`:**
| status | цвет точки | текст | Tailwind-класс для точки |
|--------|------------|-------|---------------------------|
| `active` | зелёный | «Активно» | `bg-green-500` |
| `scheduled` | синий | «Запланированно» | `bg-blue-500` |
| `draft` | серый | «Не запущено» | `bg-muted-foreground` |
| `completed` | приглушённый | «Завершено» | `bg-muted-foreground/50` |

Структура: pill-бейдж с точкой и текстом, `text-xs`, border.

**`CampaignsEmptyState`:**
- Центрируется на свободной площади
- Копи (из спеки): «Кампании создаются из Сигналов»
- CTA: **Создать сигнал →** → `dispatch({ type: "sidebar_nav", section: "Сигналы" })`

## 4. State machine

### 4.1 Новые actions

```ts
| { type: "campaign_from_signal"; signalId: string }
| { type: "campaign_opened"; id: string }
```

**`campaign_from_signal`:**
- Находит `signal` по `signalId` в `state.signals`. Если не найден — no-op.
- Создаёт новый `Campaign`:
  - `id: cmp_${nanoid(6)}`
  - `name: "${signal.type} #${N}"`, где `N` — количество существующих кампаний с этим `signalId` + 1
  - `signalId`
  - `status: "draft"`
  - `createdAt: new Date().toISOString()`
- Эффект:
  ```ts
  campaigns: [...state.campaigns, newCampaign],
  view: { kind: "workflow", campaign: { id: newCampaign.id, name: newCampaign.name }, launched: false },
  activeSection: null,
  ```

**`campaign_opened`:**
- Находит `c` по `id`. Если не найден — no-op.
- Эффект:
  ```ts
  view: { kind: "workflow", campaign: { id: c.id, name: c.name }, launched: c.status === "active" || c.status === "completed" },
  activeSection: null,
  ```

### 4.2 Что остаётся без изменений

- `view.kind === "campaign-select"` сохраняется — используется LaunchFlyout и (опционально) guided-flow. Переработка — в блоке F.
- `campaign_selected` (из `CampaignTypeView`) остаётся — `CampaignTypeView` рендерится напрямую из `page.tsx` для `view.kind === "campaign-select"`.

### 4.3 Удаляется

- `mode` prop у `CampaignsSection` — больше не нужен; `CampaignsSection` рендерится только для `view.kind === "section", name === "Кампании"`.
- `TYPE_TO_SCENARIO` в `src/state/scenario-map.ts` — больше не используется (секции больше не мапят type → scenarioId).

### 4.4 `page.tsx` — рендер-диспетчер

```tsx
if (view.kind === "campaign-select") return <CampaignTypeView onSelect={...} />;
if (view.kind === "section") {
  if (view.name === "Сигналы") return <SignalsSection />;
  if (view.name === "Кампании") return <CampaignsSection />;   // без mode
  // ...
}
```

## 5. Структура файлов

**Новые файлы:**
```
src/sections/signals/
  signal-card.tsx
  signals-empty-state.tsx
  new-signal-menu.tsx
  upload-signal-dialog.tsx

src/sections/campaigns/
  campaign-card.tsx
  campaigns-empty-state.tsx
  status-badge.tsx

src/components/ui/
  drop-zone.tsx          — выделен из step-5-upload.tsx, принимает { accept, file, onFile, disabled, children? }
```

**Переписываются:**
```
src/sections/signals/signals-section.tsx     — список + header + empty state
src/sections/campaigns/campaigns-section.tsx — список + header + empty state (убираем mode)
src/sections/signals/steps/step-5-upload.tsx — рефактор на DropZone (логика та же)
src/state/app-state.ts                       — +2 action'а, +2 case'а
src/state/scenario-map.ts                    — убираем TYPE_TO_SCENARIO
src/app/page.tsx                             — CampaignsSection без mode
```

**Удаляются:**
```
src/sections/signals/signal-type-view.tsx
```

**Остаётся (не удаляется в блоке B):**
```
src/sections/campaigns/campaign-type-view.tsx  — нужен для view.kind === "campaign-select" (LaunchFlyout). Удаление — блок F.
```

## 6. Тесты

### 6.1 Unit (vitest, `src/state/app-state.test.ts`)

- `campaign_from_signal` добавляет `Campaign` со `status: "draft"`, корректным `signalId`, именем `"{type} #1"` для первой кампании по сигналу, `#2` для второй.
- `campaign_from_signal` переводит view в `{ kind: "workflow", launched: false }`.
- `campaign_from_signal` с несуществующим `signalId` — state не меняется.
- `campaign_opened` с `draft` → `workflow, launched: false`.
- `campaign_opened` с `active` или `completed` → `workflow, launched: true`.
- `campaign_opened` с несуществующим id — state не меняется.

### 6.2 Integration (Playwright, `tests/block-b.spec.ts`)

Ветка A — empty preset:
- Сигналы: видно empty state с текстом «Ещё нет сигналов…»
- Клик «+ Новый сигнал» → появляется dropdown с двумя пунктами
- Кампании: видно empty state «Кампании создаются из Сигналов» + CTA
- Клик CTA → переход на раздел Сигналы

Ветка B — mid preset:
- Сигналы: 5 карточек в одной колонке, сверху — самая свежая по `updatedAt`
- Карточка содержит: тип, count, 4 сегмента одной строкой, две кнопки
- Клик «Создать кампанию» → переход в Canvas, в списке кампаний появляется новая draft-кампания
- Кампании: 10 карточек, видны статус-бейджи всех 4 типов
- Верхняя карточка — самая свежая по relevant timestamp
- Клик по карточке → Canvas открывается с именем этой кампании

Ветка C — upload dialog:
- Открытие модалки через «+ Новый сигнал → Загрузить с устройства»
- Drag-and-drop .csv-файла → имя файла отображается
- Клик «Импортировать» → анимация хеширования → модалка закрывается → новый сигнал в списке

## 7. Открытые вопросы

- **Название default-типа при загрузке с устройства** — сейчас хардкодим `"Регистрация"`. Если пользователь захочет выбор — это апгрейд до варианта B из обсуждения. Пока оставляем как есть.
- **Обработка ошибок загрузки** (неподдерживаемый формат, >50 МБ) — не покрывается в блоке B, модалка просто принимает файл. Если нужно — расширяется в отдельной итерации.
- **Детализация сигнала** (drill-down) — не в скоупе. В блоке B карточка сигнала нигде не ведёт, кроме «Создать кампанию».

## 8. Порядок имплементации (для writing-plans)

1. Выделить `DropZone` + `HashingLoader` из step-5-upload.tsx → переиспользовать в step-5 (рефактор без изменения UX).
2. Добавить action'ы `campaign_from_signal`, `campaign_opened` в reducer + unit-тесты.
3. Реализовать `SignalCard`, `SignalsEmptyState`, `NewSignalMenu`, `UploadSignalDialog`.
4. Переписать `SignalsSection`.
5. Реализовать `StatusBadge`, `CampaignCard`, `CampaignsEmptyState`.
6. Переписать `CampaignsSection` (без `mode` prop).
7. Обновить `page.tsx` (убрать `mode` аргумент).
8. Удалить `signal-type-view.tsx`, `TYPE_TO_SCENARIO` из `scenario-map.ts`, комментарии «Adapter (Block A.5)».
9. Playwright-тесты (ветки A/B/C).
10. Прогон vitest + playwright + визуальная проверка на всех 3 пресетах.
