# Onboarding chrome and interest chips fix — design

**Дата:** 2026-05-21
**Статус:** на согласовании
**Источник:** ТЗ «Правки интерфейса Афины» v1.1, раздел 3
**Блок:** A из декомпозиции спеки (онбординг-chrome)

## 1. Цель

Привести онбординг к состоянию, описанному в ТЗ:

- Во время онбординга sidebar и PromptBar не отображаются.
- После завершения онбординга они появляются с плавной анимацией.
- Чипсины с направлениями содержат текст (сейчас пустые).
- Ширина контента на экранах онбординга совпадает со стандартом проекта.
- Welcome остаётся как есть — три карточки-ориентира со встроенным CTA «Создать сигнал» на шаге 1 уже реализованы; спека фиксирует это как accepted state.

Не входит в этот блок: разделы 4–8 ТЗ (мастер сценариев, workflow, оплата, PromptBar, ответ нейронки) — отдельные спеки.

## 2. Текущее состояние

| Что | Где | Состояние |
|---|---|---|
| Sidebar mount | `src/app/page.tsx:93` | рендерится всегда |
| PromptBar mount | `src/sections/shell/shell-bottom-bar.tsx` через `BottomBarSlot` в `src/app/page.tsx:111` | рендерится всегда (кроме `mode === "sidebar"` в drawer) |
| Триггер онбординга | `src/app/page.tsx:52` | `view.kind === "welcome" && surveyStatus === "not_started"` запускает `SurveySection` с `withOnboardingScreens` |
| Чипсины интересов | `src/sections/survey/onboarding-interests-screen.tsx:20` | `vertical?.interests.slice(0, 4).map((i) => i.name)` — поле `name` отсутствует в `Interest` (есть только `label` в `src/types/directions.ts:11-16`). Все ярлыки `undefined` |
| Ширина — interests | `src/sections/survey/onboarding-interests-screen.tsx:53` | `max-w-xl` (576 px) |
| Ширина — scenarios | `src/sections/survey/onboarding-scenarios-screen.tsx:17` | `max-w-xl` (576 px) |
| Стандартная ширина | `src/components/...step-content`, `welcome-view.tsx:27`, `survey-form.tsx:62`, `signals-section.tsx:90` | `max-w-2xl` (672 px) |
| Welcome cards | `src/sections/welcome/onboarding-step-cards.tsx` | три карточки, на шаге 1 CTA `Создать сигнал` с диспатчем `start_signal_flow` — соответствует ТЗ 3.6 |

## 3. Дизайн

### 3.1. Новый предикат `isOnboarding`

В `src/state/app-state.ts`:

```ts
export function isOnboarding(state: AppState): boolean {
  return state.view.kind === "welcome" && state.surveyStatus === "not_started";
}
```

Этот же признак уже используется в `page.tsx:52` для решения «рендерить SurveySection vs WelcomeSection». Выносим в один источник истины, чтобы chrome-логика и render-логика всегда синхронизированы.

### 3.2. Скрытие и появление chrome

Подход: **conditional render + `AnimatePresence`** в `src/app/page.tsx`.

Sidebar:

```tsx
<AnimatePresence initial={false}>
  {!onboarding && (
    <motion.div
      key="sidebar"
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.42, ease: CHROME_EASE }}
    >
      <AppSidebar ... />
    </motion.div>
  )}
</AnimatePresence>
```

PromptBar (через тот же `BottomBarSlot`, с обёрткой):

```tsx
<AnimatePresence initial={false}>
  {!onboarding && (
    <motion.div
      key="bottom-bar"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.42, ease: CHROME_EASE }}
    >
      <BottomBarSlot />
    </motion.div>
  )}
</AnimatePresence>
```

`CHROME_EASE = [0.32, 0.72, 0, 1]` — тот же `HERO_EASE`, что уже использован в `welcome-view.tsx`. Bounce/elastic не применяем (соответствует «exponential easing, без bounce» из PRODUCT.md).

`initial={false}` означает: при первом рендере (страница только открылась с `surveyStatus === "not_started"`) chrome не анимируется в обратную сторону — он просто отсутствует. Анимация запускается только в момент перехода из онбординга в welcome.

Stagger между sidebar и promptbar не нужен — они появляются одновременно. Длительность 420 мс согласуется с `HERO_EASE` exit hero-блока в `welcome-view.tsx:26`.

### 3.3. Что происходит при skip

`survey-section.tsx:53` диспатчит `survey_skipped`. По `app-state.ts:127` это переводит `surveyStatus` в `"skipped"`. Поскольку `isOnboarding` проверяет `=== "not_started"`, любое не-`not_started` (включая `skipped`) пропускает chrome к рендеру → анимация появления отрабатывает.

### 3.4. Размонтирование и состояние

`AppSidebar` не имеет локального state, который было бы жалко терять при размонтаже:
- `flyoutOpen` — в `useAppState`
- `activeNav` — в `useAppState`
- Балансы и нотификации — в `useAppState`

`BottomBarSlot` / `ShellBottomBar` локального state, переживающего разиммонтаж, тоже не имеют — `usePromptChips`, `useDraftQueue`, `useChat` все живут на уровне `page.tsx` в провайдерах, которые остаются смонтированными.

Безопасно. Никакого рефакторинга провайдеров не требуется.

### 3.5. Фикс чипсин

В `src/sections/survey/onboarding-interests-screen.tsx:20`:

```ts
// было
return vertical?.interests.slice(0, 4).map((i) => i.name) ?? [];
// станет
return vertical?.interests.slice(0, 4).map((i) => i.label) ?? [];
```

Тип `Interest` (`src/types/directions.ts:11`) имеет `label: string` — TypeScript должен принять без изменений. Заметка: текущий код `i.name` собирается без ошибок, потому что `(i as any).name` в JS даёт `undefined`, JSX рендерит пустую строку. Возможно где-то ослаблен strict — но это не часть этой работы; ограничиваемся точечной правкой поля.

### 3.6. Унификация ширины

Точечная замена:
- `onboarding-interests-screen.tsx:53`: `max-w-xl` → `max-w-2xl`
- `onboarding-scenarios-screen.tsx:17`: `max-w-xl` → `max-w-2xl`

`survey-awaiting.tsx` (loader) сохраняет `max-w-md` — это не контентный экран, его ширина намеренно меньше для центровки сообщения, ТЗ его не упоминает.

### 3.7. Welcome cards — verified, no change

`onboarding-step-cards.tsx` уже отрисовывает три карточки (`STEPS` массив, лк. 20-39): «Получение сигнала», «Запуск кампании», «Получение статистики». На карточке шага 1 — кнопка `Создать сигнал` (лк. 109-115), диспатчит `start_signal_flow`. Это соответствует ТЗ 3.6: «На шаге 1 есть кнопка „Создать сигнал“».

Текстов и визуала не трогаем. Если по результатам ручной проверки тексты карточек захотят поправить — это отдельный мелкий PR.

## 4. Тестирование

### Unit

`src/state/app-state.test.ts` — добавить `describe("isOnboarding")`:

- `{view: welcome, surveyStatus: not_started}` → `true`
- `{view: welcome, surveyStatus: completed}` → `false`
- `{view: welcome, surveyStatus: skipped}` → `false`
- `{view: guided-signal, surveyStatus: not_started}` → `false` (защитный кейс — сейчас такая комбинация не возникает, но предикат должен быть строгим)
- `{view: section, surveyStatus: not_started}` → `false`

### Manual smoke

В dev-сервере на чистом стейте (`localStorage.clear()` + reload):
- chrome не виден на экране survey-form, awaiting, interests, scenarios.
- На interests чипсины показывают тексты («Кредитование», «Рассрочка и BNPL», и т.д.).
- После «Подобрали 24 сценария» → клик → катaлог открывается, chrome всё ещё не виден (онбординг ещё активен в момент catalog_open из onboarding, surveyStatus меняется на completed на том же диспатче).
- После закрытия каталога → welcome → chrome появляется с slide+fade.
- На survey-form: «Пропустить» → welcome → chrome появляется с тем же эффектом.

### Edge cases

- Reload во время онбординга (например, на interests): `surveyStatus` всё ещё `not_started` → SurveySection стартует с phase=form → chrome остаётся скрыт. ОК.
- Reload после онбординга: `surveyStatus` уже не `not_started` → chrome рендерится сразу без анимации (`initial={false}`). ОК.

## 5. Acceptance criteria (из ТЗ §9)

- [ ] При прохождении онбординга (survey + interests + scenarios + caталог из онбординга) sidebar и PromptBar не видны.
- [ ] После завершения онбординга (или skip) sidebar появляется с fade + slide-from-left, PromptBar с fade + slide-from-bottom; длительность ≈420 мс, easing exponential, без bounce.
- [ ] На экране уточнения деталей чипсины показывают названия направлений (например для финансов: «Кредитование», «Рассрочка и BNPL», «Ипотека», «Инвестиции и накопления»).
- [ ] Ширина контента на онбординг-экранах (form, awaiting, interests, scenarios) совпадает с стандартом `max-w-2xl`.
- [ ] На Welcome три карточки-ориентира; на шаге 1 — кнопка «Создать сигнал» (verified — изменений не вносим).

## 6. Файлы, которые будут изменены

- `src/state/app-state.ts` — добавить `isOnboarding`.
- `src/state/app-state.test.ts` — добавить тесты предиката.
- `src/app/page.tsx` — обернуть `AppSidebar` и `BottomBarSlot` в `AnimatePresence`, вычислить `onboarding = isOnboarding(state)`, защитить `LaunchFlyout` условием `&& !onboarding`.
- `src/sections/survey/onboarding-interests-screen.tsx` — `i.name` → `i.label`; `max-w-xl` → `max-w-2xl`.
- `src/sections/survey/onboarding-scenarios-screen.tsx` — `max-w-xl` → `max-w-2xl`.

Реализация ведётся в git worktree (`.worktrees/onboarding-chrome` на ветке `feature/onboarding-chrome`) согласно AGENTS.md.

## 7. Что НЕ делаем в этом блоке

- Не трогаем мастер сценариев (кнопки «Запустить сценарий», категории каталога, белый текст) — блок B.
- Не трогаем workflow header и mini preview — блок C.
- Не делаем экран оплаты кампании — блок D.
- Не правим PromptBar баги (иконки в чипах, дубль текста, hover) — блок E.
- Не унифицируем ответ нейронки — блок F.
- Не переписываем тексты Welcome cards.
- Не правим TS-конфиг даже если он позволяет `i.name` на типе без `name`.

## 8. Риски

- **`AnimatePresence` вокруг `BottomBarSlot` + внутри `BottomBarSlot` есть `return null` (drawer mode)**: при переходе drawer↔inline `AnimatePresence` будет триггерить exit/enter PromptBar. Не критично — анимация короткая, но если в практике это вызовет визуальный «щелчок», переместим `AnimatePresence` внутрь `BottomBarSlot` (после проверки `mode === "sidebar"`, до отрисовки `<ShellBottomBar/>`).
- **Размонтаж sidebar при появлении flyout**: `flyoutOpen` живёт в стейте — не теряется, но flyout (`launch-flyout.tsx`) — отдельный `<aside>`, рендерится из page.tsx параллельно с AppSidebar. Его при онбординге тоже не должно быть видно (он привязан к sidebar-кнопке «Запустить», которая исчезнет вместе с sidebar) — формально `launchFlyoutOpen` в `not_started` состоянии не должен быть `true`, но защитимся: добавим `&& !onboarding` к условию рендера LaunchFlyout. Без motion-обёртки — он и так управляется собственной анимацией внутри.
