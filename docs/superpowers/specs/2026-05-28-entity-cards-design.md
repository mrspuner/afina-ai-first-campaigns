# Карточки сущностей: кампания и сигнал (единый паттерн)

**Дата:** 2026-05-28
**Ветка:** `feature/entity-cards`

## Цель

1. У каждой кампании (любой статус) появляется **карточка кампании** — промежуточный экран между списком и workflow. Из карточки пользователь решает, что делать: посмотреть, запустить, остановить, дублировать, перейти в workflow/статистику.
2. У каждого готового сигнала появляется **карточка сигнала** — отдельный экран, где финальная сводка (step-8) лишь часть. Сейчас клик по сигналу из списка ведёт сразу в визард на step-8.
3. Обе карточки строятся на **одном общем компоненте** — единый визуальный паттерн.
4. Удаляется статус `scheduled` и всё планирование запуска (перенесено из Афина DMP, в CLP не нужно).

## Reuse audit (что переиспользуем)

- **`CampaignScreen`** (`src/sections/campaigns/campaign-screen.tsx`) — текущая «карточка запущенной кампании». Обобщаем под все статусы.
- **`StatusBadge`** (`status-badge.tsx`) — правим labels, убираем `scheduled`.
- **`ProviderList`** (`provider-list.tsx`) — статус провайдеров для активной кампании.
- **`WorkflowMiniPreview`** (`workflow-mini-preview.tsx`) — кликабельное превью → редактор.
- **`getCampaignStats`** (`mock-stats.ts`) — проверка «есть ли статистика» + ссылка.
- **Step-6 summary** (`steps/step-6-summary.tsx`) — таблица настроек сигнала; логику маппинга сценария/сегментов/цен переиспользуем (вынести общее, если дублируется).
- **Существующие actions:** `campaign_opened`, `open_workflow`, `open_campaign_payment`, `campaign_status_changed`, `campaign_duplicated`, `campaign_renamed`, `goto_stats`, `campaign_from_signal`.
- **ui:** `Button`, `Card`, `Badge`, `Separator`.

## Новый общий компонент: `EntityCardShell`

Файл: `src/components/ui/entity-card.tsx`. Задаёт единый визуальный паттерн обеих карточек.

```
┌─ EntityCardShell ───────────────────────────┐
│ [Title — инлайн-правка]          [● Badge]   │  header
│ [tag] [tag] …                                │  tags (chips)
│ meta-строка                                  │
├─ {children: CardSection-блоки} ─────────────┤  body
├─ [Primary] [Secondary] …                    │  controls
└──────────────────────────────────────────────┘
```

Экспорты:
- `EntityCardShell` — props: `title`, `onRename?`, `badge?: ReactNode`, `tags?: ReactNode`, `meta?: ReactNode`, `children`, `primaryAction?`, `secondaryActions?`.
- `InlineEditableTitle` — клик/иконка карандаша → input, Enter сохраняет, Esc отменяет; пустое значение не сохраняется.
- `CardTag` — chip (нейтральный, тёплая тьма; жёлтый не используем — это не точка фокуса).
- `CardSection` — обёртка-блок (rounded border, опциональный uppercase-лейбл).

Контейнер карточки: `max-w-2xl`, `px-8 pt-[120px]`, секции `gap-4` — как текущий `CampaignScreen`. Page-entrance: staggered reveal (opacity/transform, ease-out-quart), без bounce.

## Карточка кампании (обобщённый `CampaignScreen`)

### Роутинг
`campaign_opened` теперь **всегда** → `{ kind: "campaign", campaign: {id, name} }`, независимо от статуса (сейчас draft → workflow). Из карточки переходы дальше — по кнопкам/превью.

### Атрибуты
- **Название** — инлайн-правка через `campaign_renamed`. Reducer расширяем: синхронизировать `view.campaign.name` и для `kind:"campaign"` (сейчас только для `workflow`).
- **Тег «Сценарий»** — добавляем `scenario?: { id: string; name: string }` в `Campaign`, заполняем при создании (`signal_complete`/`step2_clicked`, `campaign_from_signal`, `campaign_duplicated`). Фолбэк: базовый сценарий из `signal.type` через `SCENARIOS`.
- **Тег «Сигнал»** — `{signal.type} · {count}`.
- **Meta-дата** — контекстная: draft → «Создана {createdAt}»; active → «Запущена {launchedAt}»; paused → «Остановлена {pausedAt}»; completed → «Завершена {completedAt}».
- **Имя по умолчанию** — формат «Сценарий №N» (напр. «Реактивация №1»). N = порядковый номер кампании по этому сценарию/сигналу.

### Секции
1. **Workflow** — `WorkflowMiniPreview` (кликабельный → `open_workflow`).
2. **Слот провайдеров/запуска:**
   - `active` → `ProviderList` (статус подключения).
   - `draft`/`paused` → CTA-блок с крупной кнопкой `Запустить`.
   - `completed` → сводка «Кампания завершена» (без запуска).
3. **Ссылка на статистику** — «Перейти в статистику» (→ `goto_stats` с `campaignId`), показывается только если статистика есть (`active`/`completed`, через `getCampaignStats`).

### Кнопки управления (controls row)
| Статус | Слот провайдеров | Кнопки управления |
|---|---|---|
| `draft` | `Запустить` → `open_campaign_payment` → payment-экран → `campaign_launched` | `Дублировать` |
| `active` | `ProviderList` | `Остановить` (→ `campaign_status_changed: paused`), `Дублировать` |
| `paused` | `Запустить` → resume `campaign_status_changed: active` (без payment, бюджет уже задан) | `Дублировать` |
| `completed` | сводка «завершена» | `Дублировать` |

`Дублировать` → `campaign_duplicated` (создаёт draft-копию «Копия — …», ведёт в workflow) — существующее поведение, для A-B-теста.

## Карточка сигнала (новый `SignalScreen`)

Файл: `src/sections/signals/signal-screen.tsx`.

### Роутинг
- View: добавить `{ kind: "signal"; signal: { id: string } }` в `View` и `ViewAddress` (+ `viewToAddress`/`rebuildViewFromAddress`, fallback к секции «Сигналы» если сигнал исчез).
- Action: `signal_opened { id }` → `{ kind: "signal", … }`.
- `signals-section.tsx`: `handleOpen` для **готового** (`ready`) сигнала → `signal_opened` вместо `resume_signal_in_wizard`. Прочие статусы (awaiting/processing/error/expired) сохраняют текущие кнопочные сценарии в `SignalCard`.
- `page.tsx`: `view.kind === "signal"` → `<SignalScreen />`. Учесть dedupe view-kind в AnimatePresence key (см. коммит 6c84a71).

### Атрибуты (из step-8 / сводки)
- **Название** — инлайн-правка. Добавляем `name?: string` в `Signal` + action `signal_renamed { id, name }`. Фолбэк: `type`.
- **Бейдж статуса** + **тег** `{type} · {count}`.
- **«Сигналы получены»** — индикатор + «Получены {updatedAt}».
- **«Всего сигналов»** — крупное число (сумма сегментов / `count`).
- **Таблица настроек сигнала (step-6)** — Сценарий / Интересы / Триггеры / Сегменты / Файл / Бюджет, из `wizardData`. Где данных нет — «—». Маппинг сценариев/сегментов вынести в общий модуль, чтобы не дублировать step-6.

### Кнопки управления
- `Скачать` (CSV — в прототипе симулировано, как в step-8).
- `Запустить кампанию по сигналу` (primary) → `campaign_from_signal`.

## Удаление `scheduled` и планирования

- `CampaignStatus` (`app-state.ts`) — убрать `"scheduled"`; убрать поле `scheduledFor` из `Campaign`.
- `status-badge.tsx` — убрать запись `scheduled`; обновить labels под спеку: `active` → «Запущена», `draft` → «Не запущена», `paused` → «Остановлена», `completed` → «Завершена».
- `parse-campaign-filter.ts` — убрать роут `scheduled`.
- `presets.ts` — убрать `scheduled` из распределений и `rndFutureDate`/ветку `scheduledFor`.
- `canvas-header.tsx` — убрать 3 места (`scheduled`-строка, блок, `initialIso`).
- **Удалить** `schedule-campaign-dialog.tsx`.
- `campaign-filter-chips.tsx` — убрать `scheduled` из чипов фильтра.
- Reducer: удалить action `campaign_schedule_cancelled` и его кейс; почистить ветки `scheduled` в `campaign_status_changed`, `campaign_opened`, `campaign_selected`, `rebuildViewFromAddress`.
- `campaign-card.tsx` (list item) — убрать ветку `scheduled` в `timestampLine`/`relevantTimestamp`.
- Тесты: `app-state.test.ts`, `presets.test.ts`, `parse-campaign-filter.test.ts` — убрать/переписать `scheduled`-кейсы.

## Тестирование

- Reducer-юниты: `campaign_opened` → `kind:"campaign"` для всех статусов; `signal_opened` → `kind:"signal"`; `signal_renamed`; `campaign_renamed` синк для `campaign`-view; `campaign_status_changed` paused/active без `scheduled`; address round-trip для `signal`.
- Существующие `scheduled`-тесты удалить/переписать.
- Визуальная проверка обеих карточек по статусам через dev-server (порт 3001, т.к. основной checkout может держать 3000).

## Из чего НЕ делаем (YAGNI)

- Нет «Изменить» на карточке кампании (правка — через workflow-превью).
- Нет редактирования сигнала с карточки сигнала (только Скачать + Запустить кампанию).
- Нет планирования/расписания запуска.
