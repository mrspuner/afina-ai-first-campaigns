# Спека C — Нода «Сигнал» (полная), дневной бюджет на карточке, welcome-экран

**Пункты:** 1 (полный), 10, 11. **Владелец файлов:** экраны + сигнальная фича.
**Порядок мержа:** третий (после B). **Worktree:** off `integration`, ребейз на B перед мержем.
Все номера строк сверены с `integration`.

> **Shared-file touches (регионы разные, C мержится последним — резолвит на ребейзе):**
> - `types/workflow.ts` — `SignalParams.files` (A правит `merge`/`statistics` в других регионах).
> - `node-visuals.ts` — `NODE_ICON.signal` → Radar (A правит `merge`/`statistics`; другой ключ).
> - `sections/campaigns/workflow-view.tsx` — ветка `initialGraph` при пустом `signalType` (A правит sublabel/fallback).
> - `node-card-content.tsx` — монтаж `<SignalFiles/>` в ветке `signal` (владелец B; C добавляет спец-кейс, как split/wait).
>
> `app-state.ts`, `artifact-screen.tsx`, `signals-tab.tsx`, `campaign-screen.tsx`, `campaign-card.tsx`, welcome-файлы, новый `signal-files.tsx` — не пересекаются с A/B.

---

## 1. Нода сигналов (полная)

### AS IS
- **Реально рендерится не тот узел, что в оригинале.** `createTemplate()` всегда прогоняет `withSignalPath()` (`workflow-templates.ts:262–311`), которая **выкидывает** шаблонный `source`/`Database`-узел (`rest = t.nodes.slice(1)`) и подставляет `signal_result` с **`nodeType: "signal"`** (`:299–302`). Иконка берётся из `NODE_ICON.signal` = **`SignalLow`** (`node-visuals.ts:56`). `rebuild-schema.ts` тоже хардкодит `nodeType: "signal"` (`:60–68`). ⇒ Radar менять в `NODE_ICON.signal`, **не** в `source`/`Database`.
- В раскрытой карточке signal-узел выводит одну строку `Файл: <fileName>` — `PARAM_RENDERERS.signal` (`node-card-content.tsx:87–89`), plain-text, без пустого состояния.
- `SignalParams` (`types/workflow.ts:86–91`): `{ kind:"signal", fileName:string, count:number, segments }` — **один `fileName`, не массив**. Для `own`-источника `applyCampaignContext` склеивает имена в `fileName` через запятую; для `new`/`stream` список файлов физически лежит на `ScoringParams.files`.
- Legacy-узел `signals` (`id "signals"`, «Сигналы + сегменты», `nodeType "default"`) создаётся в `createBaseNodes()` (`types/workflow.ts:259`, узел `:261`) / `createBaseEdges()` (`:273`), используется как фолбэк-граф при пустом `signalType`: `sections/campaigns/workflow-view.tsx:76`, `workflow-mini-preview.tsx:56`.
- Кнопка «Назад» на экране артефакта (`artifact-screen.tsx`): `backLabel="К артефактам"` (**L73**), `onBack` захардкожен `dispatch({ type:"sidebar_nav", section:"Артефакты" })` (**L183**). Origin-плюминга нет: `artifact_opened` (action `app-state.ts:355`), `View {kind:"artifact", artifactId}` (`:189`), `ViewAddress` (`:202`) несут только `artifactId`. Навигация на экран артефакта — `artifact_opened` из `signals-tab.tsx:80` (из раздела «Артефакты») и `campaign-screen.tsx:234` (из кампании) — оба без origin.
- Модель артефакта (`app-state.ts:95–110`): `Artifact { id, campaignId, kind:"signals"|"signals_conversions", count, createdAt, variant?, periodDate? }` — **коллекция с count, без списка имён файлов**.

### TO BE

**1) Иконка Radar.** `NODE_ICON.signal` (`node-visuals.ts:56`) `SignalLow` → `Radar` (lucide, добавить импорт). Одна иконка на всех кодопутях (рендер идёт через `signal`).

**2) Модель — список файлов на сигнальном узле (новая модель, «полный» скоуп).**
- Добавить `SignalParams.files: string[]` (имена файлов). Заполнять при применении контекста кампании — там же, где сейчас формируется `fileName` (`applyCampaignContext`; для `new`/`stream` брать из того же источника, что `ScoringParams.files`; для `own` — из загруженной базы). `fileName` оставить для обратной совместимости (или дублировать первый файл).
- Черновик (файлов нет / кампания не запущена) → `files` пуст.
- После запуска → `files` заполнен.

**3) Тело узла — компонент `SignalFiles` (новый файл `src/sections/campaigns/signal-files.tsx`).**
- Рендерится в ветке `signal` карточки — спец-кейс в `node-card-content.tsx` по образцу `SplitFields`/`WaitFields` (которые рендерятся отдельными компонентами, минуя `PARAM_RENDERERS`; см. `:385–394`, исключение generic-пути `:416–418`). C добавляет аналогичный спец-кейс для `signal`.
- **Черновик:** заглушка «После запуска здесь появятся файлы сигналов».
- **После запуска:** список всех файлов (`params.files`) + строка-действие «Посмотреть все».
- «Посмотреть все» → навигация на экран артефакта коллекции сигналов этой кампании: резолвит артефакт кампании (`kind:"signals"`) через app-state по `campaignId` и диспатчит `artifact_opened` с **`origin:"campaign"`** (см. п.4). `SignalFiles` имеет доступ к app-state/контексту (как `ScoringRow`).

**4) Контекстная кнопка «Назад» (origin-трекинг).**
- Расширить `artifact_opened` (`app-state.ts:355`): `origin?: "campaign" | "artifacts"`. Пробросить в `View {kind:"artifact", artifactId, origin?}` (`:189`) и `ViewAddress` (`:202`).
- `artifact-screen.tsx` выводит `backLabel`/`onBack` из `view.origin`:
  - `"campaign"` → **«К кампании»**, `onBack` → `dispatch(campaign_opened, campaignId)` (campaignId берётся из артефакта — `Artifact.campaignId`). Возврат в воркфлоу.
  - `"artifacts"` (дефолт) → **«К артефактам»**, `onBack` → `sidebar_nav "Артефакты"` (текущее поведение, L183).
- Проставить origin в точках входа: `signals-tab.tsx:80` → `"artifacts"`; `campaign-screen.tsx:234` → `"campaign"` (чинит текущий баг — сейчас из кампании кидает в «Артефакты»); `SignalFiles` «Посмотреть все» → `"campaign"`.

**5) Удаление legacy `signals`.**
- Удалить `createBaseNodes()` / `createBaseEdges()` и узел `signals` (`types/workflow.ts:259,261,273`).
- Ветку «`signalType` не задан» в `sections/campaigns/workflow-view.tsx:76` и `workflow-mini-preview.tsx:56` схлопнуть в **пустой граф** (`{ nodes:[], edges:[] }`). Пользователь в это состояние не попадает (любая кампания из визарда имеет `signalType`) — продуктовый пустой экран не проектируем.
- Обновить тесты, если ассертят `createBaseNodes`/`signals`.

### Тексты
- Пустое состояние: **«После запуска здесь появятся файлы сигналов»**
- Действие: **«Посмотреть все»**
- Back: **«К кампании»** / **«К артефактам»**

### Файлы
`node-visuals.ts` (иконка, shared), `types/workflow.ts` (`SignalParams.files`, удаление legacy `signals`, shared), `applyCampaignContext` (заполнение `files`), `signal-files.tsx` (новый), `node-card-content.tsx` (монтаж, shared с B), `sections/campaigns/workflow-view.tsx` (пустой фолбэк, shared с A), `workflow-mini-preview.tsx`, `app-state.ts` (origin), `artifact-screen.tsx` (back из origin), `signals-tab.tsx`, `campaign-screen.tsx`.

### Критерии приёмки
- [ ] Входной узел «Сигнал» — с иконкой **Radar** во всех сценариях и в мини-превью.
- [ ] В черновике узел показывает заглушку; списка файлов нет.
- [ ] После запуска узел показывает список файлов + «Посмотреть все», ведущую в карточку артефакта сигналов этой кампании.
- [ ] «Назад» в карточке артефакта: «К кампании»+возврат в воркфлоу при входе из ноды/кампании; «К артефактам»+возврат в раздел при входе из «Артефактов».
- [ ] Узел `signals` и `createBaseNodes`/`createBaseEdges` удалены; сборка и тесты проходят.

---

## 10. Дневной бюджет на карточке кампании

### AS IS
- `Campaign.dailyBudget?: number` — **`app-state.ts:75`** (не `campaign.ts:59` — там `StepData.dailyBudget`). Заполняется только для stream (визард `step-budget.tsx:282–284` при `isStream`; на карточке видно `campaign.sourceType`).
- Считается/показывается: визард `step-budget.tsx` (`BudgetBreakdown`, лейбл «Дневной бюджет», `:308–314`, только при `isStream`); оплата `campaign-payment-screen.tsx:320` («Дневной бюджет · потолок», значение через `formatRubPlain` `:36–38,323`).
- Карточка `campaign-card.tsx`: строки через локальный `StatItem` (`:108–115`) — «Коммуникация» (только degenerate `:84`), «Отправки»/«CR» (только launched, `:88–89`), «Бюджет (расчётный)» (всегда `:93–96`), «Бюджет (факт)» (launched `:97–102`). **Дневного бюджета нет.**
- Дискриминатор: `campaign.sourceType` (`:45`), `SourceType="new"|"stream"|"own"` (`campaign.ts:3`). Stream = `"stream"`.
- **`formatRub` на карточке (`:24–29`) — КОМПАКТНЫЙ** («28 тыс ₽», «1.5 млн ₽»), отличается от точного на оплате.

> Оригинал: «вернуть» неверно — по git дневного бюджета на карточке **никогда не было**. Это новая строка.

### TO BE
- Добавить строку **«Дневной бюджет»** (`StatItem`) для **stream**-кампаний, где `dailyBudget != null`. Для разовых (`sourceType !== "stream"` / `dailyBudget` undefined) — **скрыть**.
- Значение — **точный формат «12 000 ₽»** (как на оплате), а не компактный `formatRub` карточки. Чтобы не плодить 4-ю копию формата: вынести общий `formatRubPlain` (сейчас локальный в `campaign-payment-screen.tsx:36–38`) в общий util и использовать и там, и на карточке; либо, если вынос слишком инвазивен, добавить локальный точный форматтер на карточке. Рекомендация — общий util.
- Позиция — рядом с бюджетными строками.

### Файлы
`sections/campaigns/campaign-card.tsx` (+ общий money-util, если выносим `formatRubPlain`).

### Критерии приёмки
- [ ] У stream-кампании на карточке видна «Дневной бюджет» с точным значением («12 000 ₽»).
- [ ] У разовой кампании строки нет.

---

## 11. Приветственный экран

### AS IS
- H1 «Добро пожаловать в афину» (`welcome-view.tsx:52`) + подзаголовок (`:54–58`): «В афине вы создаёте кампанию по готовому сценарию: афина находит, кому нужна коммуникация прямо сейчас, запускает сообщения в нужный момент и показывает результат в статистике.»
- Три карточки — массив `PLATES` (`onboarding-step-cards.tsx:10`, тип `Plate = {heading, description}` `:5–8`): «Сигналы» (`:11–15`), «Коммуникации» (`:16–20`), «Статистика» (`:21–25`).
- Тесты ассертят текущие тексты: `onboarding-step-cards.test.tsx` (`getByText("Сигналы"/"Коммуникации"/"Статистика")` `:8–10`, `queryByText("Кампании")` отсутствует `:11`, описания `:16–29`); `welcome-view.test.tsx` (`HERO_PARAGRAPH` подзаголовок `:5–6,17`).

### TO BE
- H1 **без изменений**.
- Подзаголовок (`welcome-view.tsx`) →
  > В афине вы запускаете кампании. Кампания находит, кому из ваших клиентов нужна коммуникация прямо сейчас, и может сама отправить сообщения — или работать по загруженной базе. Платите только за то, что используете: сигналы, коммуникацию или всё вместе.
- Карточки (`PLATES`) → три конфигурации (= три модели оплаты); «Статистика» убрать:

  | Заголовок | Описание |
  |---|---|
  | Только сигналы | Афина находит, кому из клиентов нужна коммуникация прямо сейчас, и отдаёт готовые сегменты. Платите за сигналы. |
  | Сигналы + коммуникация | Афина находит нужный момент и сама запускает сообщения по выбранным каналам. Платите за сигналы и коммуникацию. |
  | Коммуникация по файлу | Уже знаете, кому писать — загрузите свою базу, афина отправит сообщения по каналам. Платите за коммуникацию. |

- Структура (H1 + подзаголовок + 3 карточки heading/description) сохраняется — меняется только текст.
- Обновить тесты `onboarding-step-cards.test.tsx` и `welcome-view.test.tsx` (все ассерты старых текстов → новые; `HERO_PARAGRAPH` → новый подзаголовок).

### Файлы
`sections/welcome/welcome-view.tsx`, `sections/welcome/onboarding-step-cards.tsx`, + их тесты.

### Критерии приёмки
- [ ] Подзаголовок и три карточки заменены; «Статистика» из карточек убрана.
- [ ] Тесты `onboarding-step-cards.test.tsx` / `welcome-view.test.tsx` обновлены и проходят.
