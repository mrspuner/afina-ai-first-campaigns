# Спека — Группа B: источник/поток и переход бюджета (встреча 2026-06-23)

Второй из трёх циклов разбиения правок встречи 2026-06-23 (A → **B** → C). Группа A влита в `integration`.
**Группа B** — блоки 4 и 6: убрать интеграцию из потока, дефолт «Новая база», поддержка нескольких баз (смена модели данных), и переход с шага бюджета на граф кампании вместо карточки.
Источник: `2026-06-23-meeting-1423-edits-spec.md` (блоки 4, 6), AS-IS сверен с кодом `integration` после слияния Группы A.

Все строки — на русском.

---

## Модель данных: один файл → несколько баз

Сейчас загрузка базы — один файл, и это допущение зашито по всему пути:
- `StepData.file: File | null` + `fileRowCount?: number` (`src/types/campaign.ts:23,29`).
- Снимок в кампании `Campaign.file?: { name: string; rowCount: number }` (`src/state/app-state.ts:63`).
- 5 потребителей `Campaign.file`: `campaign-metrics.ts:42`, `artifacts/artifact-screen.tsx:114` (показывает одно имя), `state/presets.ts:169`, `state/artifact-metrics.ts:12`, `campaigns/campaign-payment-screen.tsx:77`.
- Бюджет читает скаляр `data.fileRowCount` как `baseSize` (`step-budget.tsx`).

**Решение (реальный массив):**
- `StepData`: заменить `file: File | null` на **`files: File[]`** (дефолт `[]`). `fileRowCount?: number` оставить, но трактовать как **сумму строк всех файлов** (выставляется при emit) — так код бюджета не меняется.
- `Campaign`: заменить `file?: { name; rowCount }` на **`files?: { name: string; rowCount: number }[]`**.
- Ввести хелпер **`campaignBaseRows(campaign): number`** = сумма `files[].rowCount` (или 0). Перевести на него 4 потребителя, читающих `rowCount`; `artifact-screen` показывает список/число файлов.
- Готовит почву для Блока 8 (граф показывает загруженные файлы и «добавить файл») без переделки.

---

## Блок 4. Источник и поток — убрать интеграцию, дефолт «Новая база», несколько баз

**AS IS.**
- `wizard-steps.ts` `stepsForSource`: stream → `[scenario, source, interests, integration, channels, budget]`; new → `[…, file, …]`; own → `[…, file, …]`. У потока `file`-шага нет.
- `step-integration.tsx` — ввод API-ключа, используется только в цепочке потока.
- `step-source.tsx`: дефолт `sourceType` = `recommended ?? data.sourceType` (`:56-58`); Badge «Рекомендуется» при `opt.value === recommended` (`:98-102`).
- `step-file.tsx`: один файл (`useState<File|null>`, один `DropZone`, один `simulateRowCount`); `fileCopy(sourceType)` без ветки `stream`; emit `{ file, fileRowCount }`.
- Мёртвый `step-4-upload.tsx` — нигде не импортируется, но ссылается на `file`/`fileRowCount`.

**TO BE.**
- Для **потока** убрать шаг интеграции: в `stepsForSource('stream')` заменить `integration` на `file`. `step-integration.tsx` остаётся в репо, но из цепочки выходит.
- **По умолчанию `sourceType = "new"`** — убрать инициализацию от `recommendedSourceType`.
- **Убрать Badge «Рекомендуется»** со step-source.
- **Несколько баз:** на шаге загрузки — кнопка **«Загрузить ещё одну базу»**; модель — `files: File[]` (см. раздел модели данных).
- Текст шага для потока — про постановку на мониторинг.
- Удалить мёртвый `step-4-upload.tsx`.

**Тексты.**
- Шаг загрузки базы для потока: заголовок **«Загрузите базу номеров»**, подзаголовок **«Номера, которые нужно поставить на мониторинг»**.
- Кнопка добавления базы: **«Загрузить ещё одну базу»**.

**Маппинг.**
- `src/types/campaign.ts`: `StepData.file` → `files: File[]`; `fileRowCount` = сумма; `initialStepData.files = []`.
- `src/sections/campaigns/wizard/wizard-steps.ts`: `stepsForSource('stream')` → `[scenario, source, interests, file, channels, budget]`.
- `src/sections/campaigns/wizard/steps/step-file.tsx`: список файлов + «Загрузить ещё одну базу»; `fileCopy` — ветка `stream`; emit `{ files, fileRowCount: сумма }`; `simulateRowCount` по каждому файлу.
- `src/sections/campaigns/wizard/steps/step-source.tsx`: дефолт `useState<SourceType>("new")` (без `recommended`); удалить рендер Badge «Рекомендуется».
- `src/state/app-state.ts`: `Campaign.file` → `files`; в `campaign_created_from_wizard` строить `files` из `sd.files` (имена + посчитанные строки); добавить/использовать `campaignBaseRows`.
- Потребители `Campaign.file`: `campaign-metrics.ts:42`, `artifact-screen.tsx:114`, `presets.ts:169`, `artifact-metrics.ts:12`, `campaign-payment-screen.tsx:77` — перевести на `campaignBaseRows` / список имён.
- `campaign-workspace.tsx`: `count: stepData.fileRowCount ?? FALLBACK` — без изменений (сумма).
- Удалить `src/sections/campaigns/wizard/steps/step-4-upload.tsx`.

**Критерии приёмки.**
- В потоке нет шага интеграции/API-ключа; вместо него — загрузка базы с текстом про мониторинг.
- На шаге источника по умолчанию выбрана «Новая база номеров».
- Badge «Рекомендуется» не отображается.
- На шаге загрузки можно добавить более одной базы кнопкой «Загрузить ещё одну базу»; суммарный размер базы корректно уходит в бюджет/кампанию.
- Кампания хранит список загруженных баз (`Campaign.files`); downstream-потребители используют суммарный размер.

---

## Блок 6. Бюджет — «Далее» открывает workflow кампании (граф)

**AS IS.** `step-budget.tsx` — последний шаг «Прогноз бюджета». Футер `launchButtonLabel(...)` → «Запустить» / «Пополнить и запустить»; `handleContinue` (`:295-304`) при нехватке баланса открывает `TopUpModal`, иначе `proceed()`. `StepBudget.onNext` переопределён в `campaign-workspace.tsx:218` на `handleLaunchFromBudget` (создаёт кампанию). Reducer `campaign_created_from_wizard` (`app-state.ts:463-466`) открывает **карточку** кампании (`view.kind: "campaign"`).

**TO BE.**
- Кнопка футера → **«Далее»** (без `launchButtonLabel`, без оплаты на этом шаге).
- `handleContinue`: убрать ветку открытия `TopUpModal`; всегда `proceed()`.
- Переход после визарда — на **редактор графа**: в `campaign_created_from_wizard` заменить `view: { kind: "campaign", … }` на `view: { kind: "workflow", campaign: { id, name }, launched: false }` (форма как у `campaign_duplicated`, `app-state.ts:577-581`).
- Содержимое прогноза бюджета (цифры, «Рекомендуемая/Своя сумма», дневной бюджет) — без изменений.
- Оплата остаётся downstream на `campaign-payment-screen`.

**Тексты.** Кнопка футера: **«Далее»**.

**Маппинг.**
- `src/sections/campaigns/wizard/steps/step-budget.tsx`: `continueLabel="Далее"`; убрать ветку `setTopUpOpen(true)` в `handleContinue` (оставить `proceed()`); блок прогноза/радиокарточек без изменений. (Сам `TopUpModal` можно оставить смонтированным — он больше не вызывается с этого шага, либо убрать, если станет мёртвым.)
- `src/state/app-state.ts`: в `campaign_created_from_wizard` целевой `view` → `{ kind: "workflow", campaign: { id: newCampaign.id, name: newCampaign.name }, launched: false }`.
- Проверка: свежий draft в `kind==="workflow"` корректно проходит ветки `campaign_renamed` (`:515`), `campaign_status_changed` (`:559`), current-campaign-хелперы (`~1183-1188`) — draft уже в workflow-view сразу после создания.

**Критерии приёмки.**
- На шаге «Прогноз бюджета» кнопка называется «Далее».
- Нажатие «Далее» не открывает оплату/`TopUpModal`, а ведёт на открытый граф кампании.
- Остальное содержимое прогноза не изменилось.
- Оплата по-прежнему доступна downstream на `campaign-payment-screen`.

---

## Порядок реализации внутри Группы B

1. **Блок 6** (переход на граф) — изолированный: правка кнопки/`handleContinue` + одна строка reducer + проверка draft в workflow-view.
2. **Блок 4** — модель данных (`files[]` + хелпер + downstream) → затем UI шага загрузки (несколько баз, ветка stream, дефолт «new», убрать Badge, убрать шаг интеграции из цепочки) → удалить `step-4-upload.tsx`.

Оба блока трогают reducer `campaign_created_from_wizard` (Блок 6 — `view`, Блок 4 — маппинг `files`) в разных строках; делаем последовательно в одной ветке Группы B.
