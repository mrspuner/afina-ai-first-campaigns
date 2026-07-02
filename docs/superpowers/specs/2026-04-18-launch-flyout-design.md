# Block F — Launch Flyout: search + live signal list (design spec)

**Source:** `docs/2026-04-18-ui-improvements.md` → раздел «Меню слева → Запустить».

**Goal:** Переработать `LaunchFlyout` так, чтобы он состоял из:
1. Поискового поля сверху (лупа) — фильтрует все элементы флайаута.
2. Секции «Новый сигнал» — фиксированный список из 6 шаблонов (текущая «Запустить поиск сигналов», переименованная + пересортированная).
3. Секции «Новая коммуникационная кампания» — живой список `state.signals`, по которым можно запустить кампанию. Клик → `campaign_from_signal`, переход в Canvas (минуя `campaign-select`).

Без реализации: автокомплит / fuzzy-поиск / keyboard-nav. Только substring (`includes`), case-insensitive.

## 1. Reusable (прежде чем писать новое)

- `Input` (`src/components/ui/input.tsx`) — поле поиска.
- `SignalCard` (`src/sections/signals/signal-card.tsx`) — карточка сигнала в секции Сигналы. Для флайаута нужен компактный вариант без CTA-кнопок. Решение — добавить optional prop `compact?: boolean` который скрывает row с кнопками; либо вынести новый `SignalRow`. Выбрано: **новый компонент `SignalRow`** (минимально инвазивно; не размывает контракт `SignalCard`).
- `campaign_from_signal` action (`src/state/app-state.ts`) — уже есть (Block B).
- `start_signal_flow` action — уже есть, используется шаблонами сигналов без `initialScenario`.
- `flyout_signal_select { id, name }` action — уже есть. Используется шаблонами с `initialScenario`.
- `flyout_close` — уже есть.
- `useAppState` / `useAppDispatch`.
- `Search` icon из `lucide-react`.

## 2. Scope

**In:**
- Search input (state local в `LaunchFlyout`).
- Секция «Новый сигнал» (переименование старой) — те же 6 template-карточек, взятых из текущего хардкода.
- Новая секция «Новая коммуникационная кампания» — итерация по `state.signals` (sorted by `updatedAt desc`). Клик — `campaign_from_signal` + `flyout_close`.
- Compact `SignalRow`: type · count · от dd.MM. Single line, no buttons. Hover/focus highlight. Весь row — button.
- Фильтрация: каждая карточка видима только если title / description / signal.type содержит query (case-insensitive). Если обе секции пусты — «Ничего не найдено».
- Кнопка «+ Загрузить с устройства» в секции сигналов флайаута: **OUT** (upload уже есть в Сигналы/экране, не дублируем во флайауте для B-совместимости).

**Out:**
- Переименование/удаление существующих action'ов.
- Keyboard nav.
- Предварительный просмотр сигнала / кампании hover.
- Поиск по кампаниям (state.campaigns). Only signals + templates.

## 3. Behavior

### Search
- Placeholder «Поиск».
- Фильтрует обе секции.
- Нормализация: `query.toLocaleLowerCase("ru-RU").trim()`; если пусто — показываем всё.

### Новый сигнал
- Если query пустой — 6 шаблонов (как раньше).
- Клик: `flyout_signal_select({ id, name })` + `flyout_close` (текущее поведение).

### Новая коммуникационная кампания
- Если `state.signals.length === 0` — hint: «Нет сигналов. Создайте сигнал в разделе Сигналы.»
- Иначе — `SignalRow` per signal.
- Клик: `campaign_from_signal({ signalId: s.id })` + `flyout_close`. `campaign_from_signal` уже переключает view на workflow и создаёт draft-кампанию — всё как нужно.

### Empty search
- Если ни template, ни signal не подходят под query — «Ничего не найдено» в центре тела флайаута.

## 4. UI

Структура флайаута:

```
┌────── Запустить ────────── × ──┐
│  [🔍 Поиск................]    │
│                                 │
│  НОВЫЙ СИГНАЛ                    │
│  ┌ Регистрация               ┐ │
│  │ Возврат пользователей...  │ │
│  └────────────────────────────┘ │
│  ...6 cards                    │
│                                 │
│  НОВАЯ КОММУНИКАЦИОННАЯ КАМПАНИЯ│
│  ┌ Апсейл · 2 432 · от 17.04  ┐│
│  └────────────────────────────┘ │
│  ...N rows                      │
└────────────────────────────────┘
```

Ширина та же (360 px), position тот же (inset-y-0 left-[120px]).

`SignalRow` — одна строка:
- left: `{signal.type}` (text-sm font-medium)
- right: count + date (text-xs muted)
- полный row — focusable button.

## 5. Files

**Create:**
- `src/sections/shell/signal-row.tsx` — compact single-line row для флайаута.
- `tests/e2e/block-f.spec.ts`.

**Modify:**
- `src/sections/shell/launch-flyout.tsx` — переписать: search input, две секции, empty state.
- `src/app/page.tsx` — `onCampaignSelect` удаляется из пропов (теперь флайаут сам диспатчит `campaign_from_signal`). `campaign_from_signal` уже есть в reducer'е. `onSignalSelect` остаётся.

**Delete:** nothing.

## 6. State / actions

Никаких новых action'ов не нужно. Используются:
- `flyout_signal_select { id, name }` (template click).
- `campaign_from_signal { signalId }` (signal-row click).
- `flyout_close` (× button, backdrop, row click).

`flyout_campaign_select` action больше не используется этим флайаутом, но мы **не** удаляем его из reducer'а (сохранить обратную совместимость с possible legacy wiring). Mark it deprecated in a comment.

## 7. Tests

### Unit
Никаких новых reducer-тестов — action'ы покрыты в B.

### Playwright (`tests/e2e/block-f.spec.ts`)
1. **empty preset** — открыть флайаут (Sidebar «Запустить» кнопка), видим search, секцию «Новый сигнал» с 6 шаблонами, секцию «Новая коммуникационная кампания» с hint «Нет сигналов».
2. **mid preset** — открыть флайаут, во второй секции ≥3 `SignalRow`. Клик по первому → Canvas (`.react-flow` видимый).
3. **search filter** — ввести «апсейл» в поиск → видим только Апсейл-template и Апсейл-сигналы (если есть); скрыт «Регистрация».
4. **empty search result** — ввести «lksadjfasljdf» → «Ничего не найдено».

## 8. Acceptance

1. Флайаут содержит search + 2 секции.
2. Поиск фильтрует обе секции substring-match (case-insensitive).
3. Клик по шаблону → wizard с initialScenario (как раньше).
4. Клик по signal-row → Canvas с draft-кампанией (новое поведение).
5. Когда `signals.length === 0` — секция кампаний показывает hint.
6. Когда query не match'ит ни один элемент — «Ничего не найдено».
7. Все существующие тесты зелёные.

## 9. Risks

- `onCampaignSelect` prop пропадает — в `page.tsx` его нужно удалить вместе с связанным dispatcher'ом (`flyout_campaign_select`). Проверить, что больше никто не вызывает `flyout_campaign_select`.
- Клик на SignalRow дублирует `create-campaign` из signal-card; убеждаемся что reducer идемпотентен — он уже проверен в B-тестах.
