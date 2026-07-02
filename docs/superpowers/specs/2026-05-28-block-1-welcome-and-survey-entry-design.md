# Block 1 — Welcome screen and Survey entry point — design

**Дата:** 2026-05-28
**Статус:** на согласовании
**Источник:** `Блок-1_Welcome-Screen.md` (внешний бриф, с уточнениями по сессии)
**Связанные спеки:**
- `2026-05-21-onboarding-chrome-design.md` — старый подход к скрытию chrome через предикат `isOnboarding`. **Не был реализован** (в `page.tsx` `AppSidebar` и `BottomBarSlot` сейчас рендерятся безусловно, `isOnboarding` в коде отсутствует). Этот документ замещает старый подход.

## 1. Цель и scope

Перенести Survey из «входной заглушки до Welcome» в полноценную точку входа, открываемую с Welcome по кнопке «Расскажите о себе». Привести Welcome к виду из брифа: одинаковые описательные плашки, единый primary CTA, два state'а (first-time / returning) с разным контентом.

**В scope:**
- Welcome screen — копирайт, состав, два состояния, отказ от лейблов «Шаг N» и `opacity-35`.
- Survey — переход в fullscreen-режим (новый `view.kind: "survey"`), скрытие sidebar и promptbar, удаление возможности пропустить.
- State / actions — новый `open_survey`, удаление `survey_skipped` и `"skipped"`-значения.
- Плавный переход Survey → wizard step 1 через `AnimatePresence`.

**НЕ в scope (явно):**
- Wizard step 1 (`step-1-scenario.tsx`) — внутренности не трогаем, только мягкий вход.
- Структура шагов Survey (4 фазы остаются как есть: `form` / `awaiting` / `interests` / `scenarios`).
- Содержание `OnboardingInterestsScreen` (multi-select остаётся, тексты не правим).
- Маскот / AI-индикаторы.
- Shared-element transitions между survey scenarios и wizard scenarios.

## 2. Расхождения брифа и текущего кода

| Утверждение брифа | Реальность в коде | Резолюция |
|---|---|---|
| Шаг 3 Survey = «одобрение тематики» (YES/NO подтверждение) | Шаг 3 = `OnboardingInterestsScreen`, multi-select интересов | Структуру не трогаем (решение пользователя), тексты не переписываем |
| Шаг 4 Survey = «витрина ценности» с одной кнопкой | Шаг 4 = `OnboardingScenariosScreen` с выбором сценария → `survey_completed + catalog_open` | Структуру не трогаем; меняем только заголовок и подзаголовок |
| Сайт обязателен, пропустить нельзя | `SurveyForm` имеет кнопку «Пропустить», action `survey_skipped`, статус `"skipped"` | Удаляем skip полностью (см. §5.3) |
| Ссылка `onboarding-step-cards.tsx:50` | `STEPS` массив начинается с lines 20-39, лейбл «Шаг N» рендерится на line 51 | Косметика, обновляем ссылки |
| Ссылка `shell-bottom-bar.tsx:249` | Файл вырос до 389 строк | Косметика |
| Spec ссылается на `page.tsx:93` для AppSidebar | Совпадает | OK |

## 3. Reuse-аудит — что переиспользуем

| Компонент / модуль | Где живёт | Роль в новой работе |
|---|---|---|
| `WelcomeSection` | `src/sections/welcome/welcome-section.tsx` | Обновляется (содержит two-state логику hero + plates + CTA) |
| `OnboardingStepCards` | `src/sections/welcome/onboarding-step-cards.tsx` | Существенно упрощается — три равнозначные декоративные карточки. Удаляются лейблы «Шаг N», `opacity-35`, встроенный CTA, props `isStep*Active`. |
| `SurveySection` | `src/sections/survey/survey-section.tsx` | Используется как есть. Удаляется только prop `skippable`. |
| `SurveyForm`, `SurveyAwaiting`, `OnboardingInterestsScreen`, `OnboardingScenariosScreen` | `src/sections/survey/*` | Используются как есть. Меняются только тексты в `SurveyForm`, `SurveyAwaiting`, `OnboardingScenariosScreen`. `OnboardingInterestsScreen` тексты не трогаются. Из `SurveyForm` удаляется кнопка «Пропустить». |
| `Button` | `src/components/ui/button.tsx` | Для CTA «Расскажите о себе» и «Запустить новый сценарий». |
| `AppSidebar`, `ShellBottomBar`, `BottomBarSlot` | `src/sections/shell/*`, `src/app/page.tsx:30-40` | Получают условие видимости `view.kind !== "survey"`. |
| `AnimatePresence` из `motion/react` | глобально | Обёртка `renderMain()` для fade-перехода survey → guided-signal. Stagger для появления AppSidebar и BottomBarSlot. |
| Action types и reducer | `src/state/app-state.ts` | Добавляется `open_survey`, удаляется `survey_skipped`. Тип `View` пополняется `{ kind: "survey" }`. |
| `useAppState`, `useAppDispatch` | `src/state/app-state-context.ts` | Без изменений, потребляются в `WelcomeSection` для условного рендера hero+CTA по `surveyStatus`. |

Новых компонентов **не создаём.** Все правки — внутри существующих файлов.

## 4. AS IS — короткий разрез

- `page.tsx:48-62`: при `view.kind === "welcome" && surveyStatus === "not_started"` рендерится `SurveySection` со `skippable` и `withOnboardingScreens`. Иначе — `WelcomeSection`. То есть Survey сейчас стоит **перед** Welcome.
- `welcome-view.tsx:44-61`: hero c h1 «Добро пожаловать в афина» и подзаголовком «Превратите вашу базу в клиентов за три шага:», далее `OnboardingStepCards`.
- `onboarding-step-cards.tsx`: три карточки с лейблами «Шаг 1/2/3», `opacity-35` на неактивных (lines 51, 75); первая карточка содержит CTA «Создать сигнал» (lines 109-115) → `start_signal_flow`; вторая карточка кликабельна как навигация в «Кампании»; третья всегда disabled.
- `survey-section.tsx`: 4 фазы (`form` / `awaiting` / `interests` / `scenarios`). `skippable` управляет показом «Пропустить». Сайт сохраняется в `state.survey.companyWebsite` через `survey_updated` и корректно прокидывается в wizard (wizard re-ask нет).
- `app-state.ts`: `surveyStatus: "not_started" | "completed" | "skipped"`, actions включают `survey_skipped` (lines 230, 682-683).
- `page.tsx:93, 111`: `AppSidebar` и `BottomBarSlot` всегда смонтированы (с поправкой на `mode === "sidebar"` для BottomBarSlot).

## 5. Дизайн

### 5.1. Welcome — структура и состояния

`WelcomeSection` рендерит два разных layout'а по `surveyStatus`.

**Состояние A — `not_started` (first-time):**

```
Hero (left-aligned)
  h1: Добро пожаловать в афина
  p:  афина работает сценариями. Сценарий — это готовый план работы
      с вашей аудиторией: он находит нужных клиентов, запускает
      кампанию и показывает результат.
  p:  Каждый сценарий состоит из трёх частей — сигнал, кампания
      и статистика. Вот как это устроено:

Plates (три равнозначные декоративные карточки, БЕЗ click handlers, БЕЗ opacity-35, БЕЗ лейблов "Шаг N")
  ┌─ Сигналы ──┐  ┌─ Кампании ──┐  ┌─ Статистика ──┐
  │ <описание> │  │ <описание>  │  │ <описание>    │
  └────────────┘  └─────────────┘  └───────────────┘

CTA-блок
  Заголовок:   Подберём сценарии под ваш бизнес
  Подзаголовок: Расскажите о себе за минуту — и афина предложит
               сценарии, которые подойдут именно вашей кампании.
  Button:      Расскажите о себе   →  dispatch({ type: "open_survey" })
```

**Состояние B — `completed` (returning):**

```
Hero
  h1:       Добро пожаловать в афина
  subtitle: Сценарии уже подобраны под ваш бизнес — запустите ещё один.

(нет плашек)

Button:     Запустить новый сценарий →   dispatch({ type: "start_signal_flow" })
```

`AppSidebar` и `ShellBottomBar` видны и функциональны в обоих состояниях.

Поведение `OnboardingChatHistory` сохраняется: если пользователь начнёт вводить в promptbar, `conversationStarted` становится `true` и чат замещает hero+plates+CTA как сейчас — никаких новых сценариев чата не добавляется.

### 5.2. Survey — fullscreen-режим

Survey больше не рендерится перед Welcome. Гейт `view.kind === "welcome" && surveyStatus === "not_started"` (page.tsx:48-62) удаляется — `welcome` всегда рендерит `WelcomeSection`.

Открытие Survey — только через action `open_survey`, который ставит `view.kind = "survey"`.

В `page.tsx`:
- `renderMain()` получает кейс `if (view.kind === "survey") return <SurveySection withOnboardingScreens={true} onComplete={...} />;` — без `skippable`, без `onSkip`.
- `AppSidebar` оборачивается условием `view.kind !== "survey"` (либо AnimatePresence для плавного исчезновения — см. §5.4).
- `BottomBarSlot` получает дополнительный кейс: `if (view.kind === "survey") return null;`.

Структура шагов Survey не меняется. Меняются только тексты — см. §6.

### 5.3. State / event flow

**Новый action `open_survey`:**

```ts
| { type: "open_survey" }
```

Reducer:
```ts
case "open_survey":
  return { ...state, view: { kind: "survey" } };
```

**Новый view kind:**

```ts
type View =
  | { kind: "welcome" }
  | { kind: "survey" }              // ← новый
  | { kind: "guided-signal" }
  | { kind: "awaiting-campaign" }
  | { kind: "campaign-select" }
  | { kind: "workflow" }
  | { kind: "campaign" }
  | { kind: "section"; section: ... }
```

**Завершение Survey:** `OnboardingScenariosScreen` уже диспатчит `survey_completed + catalog_open` (через `handleChooseScenario` в `survey-section.tsx`). Дополнительно в reducer'е этих actions ставим `view.kind = "guided-signal"`, чтобы пользователь оказался в визарде. Альтернатива — `catalog_open` уже может это делать; проверить и не дублировать.

**Удаления:**
- `type: "survey_skipped"` action — удалить из union, удалить case в reducer (`app-state.ts:230, 682-683`).
- `"skipped"` из `SurveyStatus` (`src/types/survey.ts:9`) — стать `"not_started" | "completed"`.
- prop `skippable` из `SurveySection` — удалить (становится мёртвым кодом).
- callback `onSkip` из `SurveySection` — удалить.
- Кнопка «Пропустить» из `SurveyForm` — удалить.
- Условный рендер по `skippable` в `survey-section.tsx` — удалить.

**Гейт внутри `GuidedSignalSection`** (line 134, `gatePassed = surveyStatus === "completed"`) оставляем как defensive fallback. В нормальном потоке он всегда `true` к моменту входа в guided-signal.

**Поведение CTA «Расскажите о себе» в Welcome:**
- При `surveyStatus === "not_started"` → видимая, активная.
- При `surveyStatus === "completed"` → не рендерится, на её месте CTA «Запустить новый сценарий».

**Сайт.** Уже корректно прокидывается через `state.survey.companyWebsite` (`survey-form.tsx:35,52`). Wizard `step-1-scenario.tsx` повторно не запрашивает. Изменений не требуется.

### 5.4. Переход Survey → wizard step 1

Один диспатч (`survey_completed + catalog_open`, дополненный сменой `view.kind`) запускает все следующие анимации одновременно. Конкретики:

**Корневой `renderMain()`:** оборачивается в `<AnimatePresence mode="wait">` с ключом `view.kind`.
- Survey exit: `opacity 1→0`, `translateY 0→-8`, **220ms**, ease-out-quart.
- Guided-signal enter: `opacity 0→1`, `translateY 8→0`, **260ms**, ease-out-quart, задержка **60ms**.

**AppSidebar enter (когда view.kind перестаёт быть "survey"):**
- `opacity 0→1`, `translateX -16→0`, **280ms**, ease-out-quart, задержка **120ms**.
- Через `<AnimatePresence initial={false}>` обёртку: `initial={false}` чтобы при первом mount (если пользователь сразу попадает не на survey) sidebar не анимировался.

**ShellBottomBar / BottomBarSlot enter:**
- `opacity 0→1`, `translateY 12→0`, **280ms**, ease-out-quart, задержка **140ms**.
- Та же `AnimatePresence initial={false}` обёртка.

**Easing constant:**
```ts
const SHELL_EASE = [0.32, 0.72, 0, 1]; // ease-out-quart, exponential
```
Тот же, что `HERO_EASE` в `welcome-view.tsx` и `CHROME_EASE` из старой (не реализованной) спеки — единое семейство.

**Без shared elements.** Карточки сценариев на финальном экране Survey и в wizard step 1 визуально не связаны через layout-id.

**Анимация в обратную сторону (открытие survey с welcome)**:
- Welcome exit: тот же `opacity + translateY` 220ms.
- Survey enter: 260ms с задержкой 60ms.
- Sidebar / BottomBarSlot exit: `opacity 1→0`, `translateX 0→-16` / `translateY 0→12`, 240ms.

## 6. Финальные тексты

### 6.1. Welcome — состояние `not_started`

**Hero:**
| Элемент | Текст |
|---|---|
| h1 | Добро пожаловать в афина |
| Подзаголовок (1) | афина работает сценариями. Сценарий — это готовый план работы с вашей аудиторией: он находит нужных клиентов, запускает кампанию и показывает результат. |
| Подзаголовок (2) | Каждый сценарий состоит из трёх частей — сигнал, кампания и статистика. Вот как это устроено: |

**Плашки** (без лейблов «Шаг N», без `opacity-35`):
| # | Заголовок | Описание |
|---|---|---|
| 1 | Сигналы | афина находит, кто из вашей аудитории готов к покупке прямо сейчас — по поведению и данным. |
| 2 | Кампании | Запускаем точечную кампанию на этих клиентов: нужное сообщение в нужный момент. |
| 3 | Статистика | Видите результат в цифрах — кто отреагировал, сколько принесла кампания. |

**CTA-блок:**
| Элемент | Текст |
|---|---|
| Заголовок | Подберём сценарии под ваш бизнес |
| Подзаголовок | Расскажите о себе за минуту — и афина предложит сценарии, которые подойдут именно вашей кампании. |
| Button | Расскажите о себе |

### 6.2. Welcome — состояние `completed`

| Элемент | Текст |
|---|---|
| h1 | Добро пожаловать в афина |
| Подзаголовок | Сценарии уже подобраны под ваш бизнес — запустите ещё один. |
| Button | Запустить новый сценарий → |

### 6.3. Survey (тексты, которые меняются)

**Шаг 1 — `SurveyForm`:**
| Элемент | Текст |
|---|---|
| Заголовок | С чего начнём — дайте ссылку на ваш сайт |
| Подзаголовок | По сайту афина поймёт, чем вы занимаетесь, и подберёт подходящие сценарии. |
| Placeholder | example.com |
| Button | Продолжить |
| Кнопка «Пропустить» | **удалить** |

**Шаг 2 — `SurveyAwaiting`:**
| Элемент | Текст |
|---|---|
| Заголовок | Изучаем ваш бизнес |
| Подзаголовок | афина анализирует сайт и сопоставляет его с данными об аудитории. Это займёт несколько секунд. |
| Состояние загрузки | Анализируем {site}… |

**Шаг 3 — `OnboardingInterestsScreen`:** тексты НЕ трогаем (multi-select остаётся, копирайт сохраняется).

**Шаг 4 — `OnboardingScenariosScreen`:**
| Элемент | Текст |
|---|---|
| Заголовок | Готово — подобрали {N} сценариев под ваш бизнес |
| Подзаголовок | Каждый сценарий заточен под вашу аудиторию. Выберите, с какого начать. |
| Кнопка на карточке | (текущая) |

Промпт-бар на Welcome не меняется: placeholder остаётся «Задайте вопрос…».

## 7. Файлы для изменения

| Файл | Что меняется |
|---|---|
| `src/state/app-state.ts` | Добавить `open_survey` action и reducer-case; в reducer-case для `survey_completed` (или `catalog_open`) поставить `view.kind = "guided-signal"`; удалить `survey_skipped` action и case; удалить `"skipped"` из union тип SurveyStatus (через `src/types/survey.ts`). |
| `src/types/survey.ts` | `SurveyStatus = "not_started" \| "completed"` — удалить `"skipped"`. |
| `src/app/page.tsx` | Удалить гейт Survey-перед-Welcome (lines 48-62); добавить кейс `view.kind === "survey"` в `renderMain()`; обернуть `AppSidebar` и `BottomBarSlot` (и `LaunchFlyout`) в `AnimatePresence` с условием `view.kind !== "survey"`; обернуть `renderMain()` в `AnimatePresence mode="wait"` с ключом `view.kind`. |
| `src/sections/welcome/welcome-section.tsx` | Two-state рендер по `surveyStatus`; для `not_started` — hero (h1 + два subtitle) + `OnboardingStepCards` + CTA-блок «Подберём сценарии…»; для `completed` — hero (h1 + один subtitle) + кнопка «Запустить новый сценарий →». |
| `src/sections/welcome/welcome-view.tsx` | Обновить hero-тексты на финальные из §6.1; добавить блок CTA «Подберём сценарии под ваш бизнес». |
| `src/sections/welcome/onboarding-step-cards.tsx` | Удалить лейблы «Шаг N» (line 51), `opacity-35` (line 75), in-card CTA «Создать сигнал» (lines 109-115), props `isStep*Active` и связанную условную логику; обновить тексты STEPS на «Сигналы / Кампании / Статистика» по §6.1; убрать клик-обработчик с карточки «Кампании»; превратить все три карточки в однотипный декоративный компонент. |
| `src/sections/survey/survey-section.tsx` | Удалить prop `skippable`, callback `onSkip`, диспатч `survey_skipped`. |
| `src/sections/survey/survey-form.tsx` | Удалить кнопку «Пропустить»; обновить заголовок, подзаголовок, placeholder, label кнопки на §6.3. |
| `src/sections/survey/survey-awaiting.tsx` | Обновить тексты по §6.3. |
| `src/sections/survey/onboarding-scenarios-screen.tsx` | Обновить заголовок и подзаголовок по §6.3. |
| `src/sections/signals/guided-signal-section.tsx` | Не меняется (defensive gate остаётся). |
| `src/state/app-state.test.ts` | Тесты на `open_survey` action; удалить тесты `survey_skipped` если есть. |

## 8. Что НЕ делаем в этом блоке

- Не трогаем wizard step 1 (`step-1-scenario.tsx`) — отдельный блок.
- Не трогаем структуру шагов Survey, механику multi-select интересов, выбор сценария.
- Не трогаем `OnboardingInterestsScreen` тексты (помечено TODO для отдельной итерации).
- Не добавляем маскот / AI-индикаторы.
- Не делаем shared-element transitions.
- Не реализуем escape mechanism из fullscreen Survey — пользователь либо завершает Survey, либо использует browser back/refresh.
- Не правим TypeScript-конфиг и не меняем фундаментально структуру state-машины.

## 9. Критерии приёмки

1. При первом заходе (`surveyStatus === "not_started"`) пользователь видит Welcome, **не** Survey. AppSidebar и ShellBottomBar видны.
2. На Welcome три плашки: «Сигналы / Кампании / Статистика». Нет лейблов «Шаг 1/2/3». Нет `opacity-35` ни на одной карточке. Карточки не кликаются.
3. Над плашками — h1 + два абзаца hero-текста (§6.1). Под плашками — CTA-блок «Подберём сценарии под ваш бизнес» с кнопкой «Расскажите о себе».
4. Клик на «Расскажите о себе» открывает Survey в fullscreen: AppSidebar и ShellBottomBar плавно исчезают, контент Survey появляется.
5. Survey проходит шаги: сайт (обязателен — нет кнопки «Пропустить») → насыщение → интересы → подобранные сценарии.
6. На финальном экране Survey клик по сценарию диспатчит `survey_completed + catalog_open`, и пользователь оказывается на wizard step 1.
7. Переход Survey → wizard: контент survey мягко уходит (opacity + translateY), контент wizard появляется, AppSidebar въезжает слева, ShellBottomBar — снизу. Без «моргания», без шахматного промежуточного состояния. Длительность всего перехода ~400ms.
8. Сайт, введённый в Survey, **не запрашивается повторно** в wizard step 1.
9. При возврате на Welcome после успешного прохождения Survey (`surveyStatus === "completed"`) пользователь видит компактный hero (h1 + один подзаголовок) + кнопку «Запустить новый сценарий →». Плашек нет. Клик возвращает в wizard.
10. Все тексты соответствуют §6. Терминология — везде «сценарии», не «шаги».
11. `surveyStatus = "skipped"` нигде не достижим; action `survey_skipped` удалён; prop `skippable` удалён.

## 10. Риски и открытые вопросы

- **Миграция localStorage:** существующие пользователи с persisted `surveyStatus: "skipped"` после деплоя получат невалидное значение. План: при гидратации мапить `"skipped"` → `"not_started"`. Implementation план должен это учесть.
- **`OnboardingChatHistory` поверх hero на Welcome:** при наборе текста в promptbar `conversationStarted` становится true и чат замещает hero. Это поведение сохраняется как есть. Не проверял визуально, что новый CTA-блок корректно исчезает вместе с hero — implementation должен проверить.
- **`catalog_open` reducer:** существующий action может уже менять `view.kind`. Нужно убедиться, что добавление `view.kind = "guided-signal"` не конфликтует. Implementation должен прочитать текущий reducer-case `catalog_open` перед правкой.
- **Анимация на первой загрузке:** `AnimatePresence initial={false}` на sidebar/bottom-bar нужен, чтобы при первом монтаже (если пользователь сразу попадает в welcome, без survey) chrome не «въезжал». Implementation должен это аккуратно настроить.
- **Текущая реализация второй карточки** (`OnboardingStepCards`, click → секция «Кампании») удаляется. Если это используется как навигационный shortcut в продакшене — мы его теряем. Пользователь подтвердил, что плашки должны быть только декоративные, риск принят.
