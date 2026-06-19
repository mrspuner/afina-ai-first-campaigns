# Design: завершение campaign-first миграции (V2) + перенос UI сигналов в Артефакты

**Дата:** 2026-06-19
**Статус:** утверждён в брейншторме, ждёт вычитки пользователем перед writing-plans.
**Ветка реализации:** будет создана воркстри `feature/finish-campaign-first` (см. §9).

## 0. Контекст и диагноз

Идёт миграция на campaign-first модель (исходная спека: `docs/superpowers/specs/2026-06-18-campaign-first-migration-design.md`, план фундамента: `docs/superpowers/plans/2026-06-18-campaign-first-foundation.md`). Фундамент (Волна 0) и эпики (Волна 1) уже мёрджились в `integration`, **но финальные destructive-шаги фундамента не доехали**. Текущие симптомы (жалобы пользователя):

1. Остались «осиротевшие» top-level сигналы без привязки к артефактам; сигналы не должны жить отдельно.
2. Артефакты кампании не генерятся.
3. Флоу кампании пустой в конце — после «Запустить» ничего не появляется.
4. Отдельного раздела «Сигналы» быть не должно — всё живёт в «Артефактах».

**Что фундамент сделал (additive-first):** добавлен тип `Artifact` с `campaignId`, поле `Campaign.phase`, экшн `campaign_artifact_ready` в reducer, секция «Артефакты» с табами, `CampaignSignalProgress`, `CampaignArtifactsBlock`, экшн `campaign_phase_advanced` (авто-переход через 8с). Тесты `src/state/create-flow-inversion.test.ts` и `src/state/artifact-badge.test.ts` уже зелёные и campaign-first.

**Что не доехало (корни всех 4 симптомов):**
- Инверсия create-flow не случилась: визард всё ещё `signal_added` → `signals[]` (`src/sections/signals/guided-signal-section.tsx:181`), а не «создать Campaign-корень».
- Генерацию артефактов не подключили: `campaign_artifact_ready` диспатчится только из тестов, нигде в проде → `state.artifacts` всегда `[]` → конец флоу пуст.
- Старая поверхность не удалена: `signals[]`, `signal_*` экшены, `SignalsSection`, `signal-screen`, `campaign.signalId` (`@deprecated`), роут `src/app/page.tsx:99`, `SectionName "Сигналы"` (`src/state/app-state.ts:195`), signal-строки во flyout.
- git mv визарда частичный: `src/sections/campaigns/wizard/` существует, но `guided-signal-section.tsx` остался в `src/sections/signals/`.

## 1. Governing principles

1. **Цель — прототип для валидации UX** (PRODUCT.md), не перформанс. Оптимизируем под скорость валидации и низкий риск, но архитектура должна биться с продуктовой логикой (полная инверсия V2 — решение пользователя).
2. **UI меняется минимально**, переиспользуем существующие компоненты/паттерны/цвета.
3. **Граница итерации:** только эти 4 проблемы + перенос UI. **Не трогаем** в этой итерации: плоские `MessageTemplate`, graph-less budget-estimator, детектор `needsAttention` нод — это отдельная следующая итерация.

## 2. Решения брейншторма (зафиксированы)

- **Глубина:** полная инверсия V2 — top-level `Signal` исчезает, `Artifact` — единственная «сигналоподобная» сущность, порождается кампанией.
- **Граница:** доделать потерянные destructive-шаги фундамента, не весь оставшийся «Волна 0».
- **Тайминг артефакта:** строго по матрице источников (§3 исходной спеки).
- **Перенос UI:** дотащить богатство сигнального UI, адаптировав под модель артефакта (вариант «adapt»).
- **Лейбл kind:** оставить «Сигналы» / «Сигналы и конверсии» (без изменений).
- **Удаление артефакта:** оставить (новый экшн `artifact_deleted` + меню/confirm).

## 3. Модель сущностей — конечное состояние

- **Удаляем** интерфейс `Signal` и коллекцию `signals: Signal[]` из `AppState` (`src/state/app-state.ts`). `SignalStatus` (`src/types/signal-status.ts`) растворяется в `Campaign.status`/`Campaign.phase` — удаляется, если не остаётся читателей.
- **`SignalType` остаётся** — переосмыслен как тип сценария/скоринга; на него ссылается `Scenario.signalType` (`src/data/scenarios.ts`).
- **`Campaign`** — удаляем поле `signalId` (сейчас `@deprecated`). Остаётся корнем.
- **`Artifact`** — без изменений по форме: `{ id, campaignId, kind: "signals" | "signals_conversions", count, createdAt }`. Per-contact скор-данные не вводим (не нужны для 4 проблем).

## 4. Инверсия create-flow

Сейчас: визард (`guided-signal-section.tsx`) собирает `StepData`, на финише `signal_added` → создаёт `Signal`, view → `awaiting-campaign`, затем `campaign_from_signal` создаёт `Campaign`.

Станет:
- **Выбор сценария создаёт draft `Campaign`** напрямую (через единый экшн создания кампании — консолидировать `campaign_from_signal` / `campaign_selected` / фоллбэки `signal_complete`/`step2_clicked`).
- Шаги визарда правят поля draft-кампании: `scenario`, `sourceType`, `channels`, `interests`, `triggers`, `budget`, `file`.
- Завершение визарда → экран оплаты (`campaign-payment-screen.tsx`) → `campaign_launched`. Промежуточный top-level Signal **не создаётся никогда**.
- Оркестратор (`guided-signal-section.tsx` + связанные) дочищается и переезжает в `src/sections/campaigns/wizard/`. Экшены `signal_added`, `signal_status_changed`, `signal_deleted`, `signal_renamed`, `resume_signal_in_wizard`, `signal_opened` удаляются (или переименовываются в campaign-эквиваленты там, где функция нужна).
- view-kinds `guided-signal` / `awaiting-campaign` остаются как стадии кампания-флоу (или переименовываются), но без создания Signal.

## 5. Генерация артефактов по матрице источников

Дисперсия по `Campaign.sourceType` (точно по §3 исходной спеки):

| sourceType | Когда артефакт | Фаза |
|---|---|---|
| `own` | сразу при `campaign_launched` (скоринга нет) | сразу `communicating` |
| `new` | по завершении скоринг-окна (`campaign_phase_advanced`, переход `scoring → communicating`) | `scoring` → `communicating` |
| `stream` | при старте; `count` растёт перпетуально (по существующему таймеру) | `communicating` (перпетуальная) |

- `kind`: `channels.length === 0` → `"signals"` (вырожденная кампания), иначе `"signals_conversions"`.
- `count`: из оценки охвата сценария / `fileRowCount` (для `own`).
- Точки диспатча: `own` — внутри reducer `campaign_launched` (детерминированно); `new` — эффект в `campaign-screen.tsx` при переходе фазы; `stream` — при запуске + инкремент по таймеру.
- Эффект авто-перехода фазы в `campaign-screen.tsx` учитывает `sourceType`: `own` минует скоринг-окно (`SCORING_WINDOW_MS`), сразу `communicating`.

## 6. Удаление раздела «Сигналы»

- Удалить `SectionName "Сигналы"` (`src/state/app-state.ts:195`), ветку роута `src/app/page.tsx:99` (`<SignalsSection />`), компоненты `src/sections/signals/signals-section.tsx`, `signal-screen.tsx`, `signal-card.tsx`, `signals-empty-state.tsx`, `upload-signal-dialog.tsx`, `new-signal-menu.tsx` (после переноса нужного UI — §7).
- `launch-flyout.tsx` — убрать signal-строки/`openSignal`, оставить кампании (и при желании артефакты); кнопки «назад», ведущие в `{name:"Сигналы"}` (`signal-screen.tsx:61`, `upload-signal-dialog.tsx:69`), перенаправить в «Артефакты».
- Таб «Артефакты → Сигналы» (`src/sections/artifacts/signals-tab.tsx`) **остаётся** — он уже читает `artifacts[]`.

## 7. Перенос UI сигналов → Артефакты (вариант «adapt»)

Цель: «Артефакты» должны выглядеть так же богато, как старые «Сигналы», но честно по новой модели (у артефакта нет `segments`, статусов, ручного create/upload).

### 7.1. Карточка-файла (`artifact-card.tsx`)
Оставляем 4 поля (текущие + с картинки пользователя): **тип** (`ARTIFACT_KIND_LABEL`) · **привязанная кампания** (ссылка) · **дата создания + кол-во контактов** · **«Скачать»**.

Дотащить из `signal-card.tsx`:
- **Открытие по клику** → детальный экран артефакта (`artifact_opened`). Сейчас `ArtifactCard` некликабельна — добавить `role/tabIndex/onClick`, action-кнопки внутри `stopPropagation`.
- **Удаление** — меню (`DropdownMenu`) + confirm-`Dialog`, новый экшн `artifact_deleted`.
- Stagger-анимация появления — уже есть, оставить.

Не тащим: статус-бейджи, разбивка Макс/Выс/Ср/Низ (сегментов нет), «Использовать в кампании» (артефакт уже привязан), create/upload, rename.

### 7.2. Открытая карточка (`artifact-screen.tsx`)
К текущему («Всего сигналов» count · Тип файла CSV · Кампания · Тип · Создан · «Скачать» · «Артефакт собран · дата») добавить **таблицу настроек из родительской кампании** (артефакт не хранит их сам — берём из `campaigns.find(c => c.id === artifact.campaignId)`):
- Сценарий (`campaign.scenario?.name`)
- Источник (`sourceType`: Новая база / Поток / Своя база)
- Интересы (`campaign.interests`)
- Триггеры (если доступны в `campaign`/`wizardData`)
- Каналы (`campaign.channels`) — осмысленно для «Сигналы и конверсии»
- Файл базы (`campaign.file`)
- Бюджет (`campaign.budget`) — фактический/плановый
- **Удаление** артефакта (то же действие, что на карточке).

Не тащим: rename, «Использовать в кампании».

### 7.3. Пустое состояние (`artifacts-empty-state.tsx`)
Дотащить качество/стиль копирайта из `signals-empty-state.tsx`, но **без CTA создать/загрузить** (вручную артефакт не создать). Текст артефакт-корректный: появляются при запуске кампании. Возможность «загрузить свою базу» не теряется — переезжает в визард, шаг «Источник» = «Своя база».

## 8. Демо / пресеты

`preset_applied` (`src/state/app-state.ts`) сейчас сеет `signals[]` (`Preset.signals`). Пересеять: `Preset` отдаёт `campaigns[]` + готовые `artifacts[]` (несколько active/completed кампаний с артефактами), иначе раздел «Артефакты» в демо пуст. `DEMO_*` константы обновить соответственно.

## 9. Тесты

- Оставляем: `src/state/create-flow-inversion.test.ts`, `src/state/artifact-badge.test.ts` (уже campaign-first).
- Удалить/переписать сигнал-центричные тесты (всё, что ссылается на `signals[]`, `signal_added`, `Signal`).
- Добавить:
  - артефакт `own` появляется сразу при `campaign_launched`;
  - артефакт `new` появляется при `campaign_phase_advanced` (scoring→communicating);
  - `kind` зависит от `channels.length`;
  - `artifact_deleted` удаляет артефакт;
  - роут/секция «Сигналы» отсутствует; завершение визарда создаёт `Campaign`, не `Signal`.
- Зелёный гейт после каждой задачи: `npx tsc --noEmit && npx vitest run`.

## 10. Риски / на что смотреть

- `src/sections/campaigns/campaign-screen.tsx:36,64` читает `signals.find(... campaign.signalId)` — переписать на `artifacts`.
- Вычистить остальных читателей `signals` (StatsContext и прочие — список из аудита кода).
- Широкая правка тестов — основная цена.
- Среда: имя папки репозитория содержит неразрывный пробел (NFC/NFD) — инструменты `Read`/`Write` создают папку-двойник. Работать через shell (его cwd — настоящий репозиторий) или ASCII-симлинк `ln -sfn "$(pwd)" /tmp/afina-repo`.
- **Граница:** не трогаем плоские MessageTemplate, budget-estimator, валидацию нод — отдельная итерация.

## 11. Открытые вопросы

- Нет блокирующих. Точная форма консолидированного экшна создания кампании и судьба view-kinds `guided-signal`/`awaiting-campaign` (оставить/переименовать) — решается на writing-plans, на дизайн не влияет.
