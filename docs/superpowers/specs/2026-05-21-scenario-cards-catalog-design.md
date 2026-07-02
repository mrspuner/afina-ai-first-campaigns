# Scenario cards + catalog — design

**Дата:** 2026-05-21
**Статус:** на согласовании
**Источник:** ТЗ «Правки интерфейса Афины» v1.1, разделы 2 и 4
**Блок:** B из декомпозиции спеки (карточки сценариев + каталог)

## 1. Цель

- Добавить в каждую карточку сценария кнопку «Запустить сценарий».
- Убрать категоризацию в каталоге сценариев — отображать единый список.
- В карточках каталога сделать оба текста (название и описание) `text-foreground` и пересмотреть фон карточки, чтобы белый текст был контрастным.
- На step-1 карточки остаются как есть.
- Унифицировать размеры кнопок мастера со стандартом `<Button>` size default.

Не входит: внутренняя структура wizard, переход на шаг 2 (уже работает), сам каталог как dialog (используем существующую модалку).

## 2. Текущее состояние

| Что | Где | Состояние |
|---|---|---|
| Карточка сценария | `src/sections/signals/scenario-card.tsx:12-31` | вся карточка — `<button>`, внутри только название (`text-foreground`) и описание (`text-muted-foreground`). Действие — `onClick(id)` по карточке |
| Step 1 — секции 6+6 | `src/sections/signals/steps/step-1-scenario.tsx:53-100` | разбито на «Базовые сценарии» и «Подобрано для вас», grid-cols-3 |
| Кнопка «Все N сценариев» | `src/sections/signals/steps/step-1-scenario.tsx:91-97` | нативная `<button>` с `px-4 py-2 text-sm` — НЕ соответствует Button default (`h-8 px-2.5 text-sm`) |
| Каталог сценариев | `src/sections/signals/scenario-catalog-modal.tsx:63-115` | Dialog с поиском + фильтр-чипсы категорий (`SCENARIO_CATEGORIES`, строки 81-101) + grid-cols-3 карточек |
| Эталонная кнопка мастера | `src/sections/signals/steps/step-3-segments.tsx:105`, `step-5-limit.tsx:188` | `<Button>` size default — `h-8 px-2.5 text-sm` с надписью «Далее» |

## 3. Дизайн

### 3.1. `ScenarioCard` — два варианта через prop

Карточка остаётся кликабельной (по всей площади) + внутри есть кнопка «Запустить сценарий», которая выполняет тот же action. Чтобы избежать nested `<button>` (HTML-невалидно), карточка становится `<div role="button" tabIndex={0}>` с handlers `onClick`, `onKeyDown` (Enter/Space). Кнопка внутри карточки — `<Button>`, её клик останавливает propagation, чтобы не было двойного вызова.

Новый prop `variant`:

```ts
interface ScenarioCardProps {
  scenario: Scenario;
  selected?: boolean;
  onClick: (id: string) => void;
  variant?: "compact" | "catalog";  // default "compact"
}
```

Поведение:
- **`variant="compact"`** (step-1, default): название `text-foreground`, описание `text-muted-foreground`, фон `bg-card` — как сейчас. Это сохраняет визуальную плотность секций 6+6 и не выводит изменения за рамки явного ТЗ.
- **`variant="catalog"`**: оба текста `text-foreground`, фон карточки `bg-muted` (или другой более тёмный — финальный токен подбирается визуально при имплементации, в пределах PRODUCT.md «тёплая тьма», без чистого `bg-background` — карточка должна оставаться отделимой от фона диалога).

В обоих вариантах внутри добавляется кнопка:

```tsx
<Button
  variant="secondary"
  size="default"
  onClick={(e) => { e.stopPropagation(); onClick(scenario.id); }}
>
  Запустить сценарий
</Button>
```

Размещение: внизу карточки после описания, с отступом сверху (`mt-3`). Карточка получает `flex-col` + `justify-between`, чтобы кнопки выровнялись по нижнему краю при разной длине описаний.

Карточка как `<div role="button">` поддерживает keyboard: Enter и Space → onClick. ARIA `aria-pressed={selected}` сохраняется.

Гипотеза: внутренняя кнопка перехватывает фокус — это нормально, потому что keyboard-юзер сначала ловит кнопку (более конкретный target), а не саму карточку.

### 3.2. Step 1 — замена кнопки «Все N сценариев»

В `src/sections/signals/steps/step-1-scenario.tsx:91-97` заменить нативную `<button>` на:

```tsx
<Button
  variant="outline"
  size="default"
  onClick={handleOpenCatalog}
  className="self-start"
>
  Все {scenarioCount} сценариев →
</Button>
```

Это применяет ТЗ §2 (унификация размера кнопок мастера со стандартом).

ScenarioCard передаётся без prop — получает `variant="compact"` по умолчанию.

### 3.3. Каталог — убрать категории

В `src/sections/signals/scenario-catalog-modal.tsx`:

- Удалить блок фильтров категорий (строки 81-101) и связанный state `activeCategories`, `toggleCategory`.
- В `filtered` (строки 38-44) убрать `if (activeCategories.size > 0 && !activeCategories.has(s.category)) return false;`. Остаётся только фильтр по `matchesQuery`.
- В `handleOpenChange` убрать сброс `activeCategories`.
- В импортах удалить `ScenarioCategory`, `SCENARIO_CATEGORIES` если они нигде больше не используются (проверим перед удалением).
- При вызове `ScenarioCard` передавать `variant="catalog"`:

```tsx
<ScenarioCard key={s.id} scenario={s} onClick={onSelect} variant="catalog" />
```

Поиск (Input) остаётся как есть.

### 3.4. Стандарт кнопки

«Эталонная кнопка мастера» в этой спеке = `<Button size="default">` из `src/components/ui/button.tsx`:
- height: `h-8`
- padding: `px-2.5`
- text: `text-sm font-medium`
- gap: `gap-1.5`

Это та же спецификация, что используется в step-3, step-5. Внутри карточек кнопка «Запустить сценарий» — `variant="secondary"` + size default. Кнопка «Все N сценариев» — `variant="outline"` + size default.

### 3.5. Что не меняем

- Логика wizard `onNext` / `dispatch catalog_open` — без изменений.
- Структура секций 6+6 на step-1 — без изменений.
- Поиск в каталоге — без изменений.
- Тексты названий сценариев и описаний (источник — `src/data/scenarios.ts`) — без изменений.

## 4. Тестирование

### Unit

ScenarioCard не имеет логики, которую стоит unit-тестировать (props → JSX), достаточно type checks. Однако если у проекта уже есть snapshot test для ScenarioCard — обновить.

### Manual smoke в dev-сервере

- Войти в wizard, увидеть step-1.
- Каждая карточка содержит кнопку «Запустить сценарий».
- Клик по карточке → переход на step-2 с выбранным сценарием.
- Клик по кнопке «Запустить сценарий» → то же поведение.
- Tab по карточкам — фокус ловится; Enter/Space на карточке = переход.
- Кнопка «Все N сценариев» имеет тот же размер, что «Далее» на step-3.
- Открыть каталог: фильтр-чипсы категорий отсутствуют.
- Карточки в каталоге визуально отличаются от карточек на step-1: и название, и описание — белые; фон карточки темнее.
- Клик по карточке в каталоге или по кнопке внутри неё → закрытие диалога + переход на step-2 с выбранным сценарием.
- Поиск в каталоге всё ещё работает.

### Edge cases

- Длинное описание сценария: карточки в одной секции должны выровняться по высоте (кнопки внизу). Используем `h-full` на детях `grid-cols-3` через flex, либо `auto-rows-fr` на grid-родителе.
- Keyboard-нав без мыши: Tab → фокус на карточке (рамка focus-visible); Tab дальше → фокус на кнопке внутри карточки; Shift+Tab — обратно. Enter/Space на любом из них — выбирает сценарий.

## 5. Acceptance criteria (из ТЗ §9)

- [ ] На экране выбора сигнала отображается 6 базовых + 6 персонализированных карточек + кнопка «Все N сценариев» (это уже есть, проверяем регрессии).
- [ ] В каждой карточке (на step-1 и в каталоге) есть кнопка «Запустить сценарий».
- [ ] Клик по карточке (вся область) тоже выбирает сценарий — соответствует решению развилки.
- [ ] Каталог сценариев без категоризации (нет фильтр-чипсов сверху).
- [ ] Цвет текста в карточках каталога — белый (`text-foreground`) для названия И описания; фон карточки в каталоге отличается от фона диалога (более тёмный).
- [ ] Размер кнопки «Запустить сценарий» совпадает с другими кнопками мастера (Button size default).
- [ ] Размер кнопки «Все N сценариев» совпадает со стандартом Button size default.

## 6. Файлы, которые будут изменены

- `src/sections/signals/scenario-card.tsx` — добавить prop `variant`, переделать на `<div role="button">`, добавить внутреннюю кнопку с `stopPropagation`, поддержать keyboard (Enter/Space).
- `src/sections/signals/steps/step-1-scenario.tsx` — заменить нативную `<button>` «Все N сценариев» на `<Button variant="outline" size="default">`.
- `src/sections/signals/scenario-catalog-modal.tsx` — удалить блок фильтров категорий и связанный state; передать `variant="catalog"` в ScenarioCard; удалить неиспользуемые импорты.

Реализация ведётся в git worktree (`.worktrees/scenario-cards-catalog` на ветке `feature/scenario-cards-catalog`) согласно AGENTS.md.

## 7. Что НЕ делаем в этом блоке

- Не трогаем `src/data/scenarios.ts` (поле `category` остаётся в данных, даже если в UI не показывается — кто-то может использовать в логике; удалять отдельно при подтверждении).
- Не правим визуал ScenarioCard на step-1 (variant="compact" = текущий вид).
- Не меняем поведение Dialog (max-w-3xl, layout) — кроме удаления блока категорий.
- Не объединяем step-1 с каталогом в один компонент.

## 8. Риски

- **a11y nested role="button"**: `<div role="button">` с `<Button>` внутри валиден HTML и работает с screen-reader, но требует аккуратной обработки клика (`stopPropagation` на внутренней кнопке) и keyboard (Enter/Space на карточке должны срабатывать). Тестируем в smoke.
- **focus-visible на div**: дефолтные стили focus в проекте опираются на `:focus-visible` для `<button>`. Для `<div role="button">` нужно добавить `focus-visible:ring-2 focus-visible:ring-ring/50 outline-none` явно — иначе фокус «потеряется».
- **поле `category` в данных**: после удаления UI-фильтров оно станет неиспользуемым в UI, но останется в типе. Не удаляем — это вне scope блока B; пометить как «потенциально неиспользуемое» на ревью.
- **grid alignment**: после добавления кнопки разные высоты карточек могут «прыгать». Решение через `grid auto-rows-fr` (равные строки) + `h-full` + `flex-col justify-between` на карточке.
