# Спека 2 — Карточка: правка логики через промпт-бар (Трек 1 · часть 2)

Дата: 2026-07-17
Источник: `~/Downloads/afina-spec-2026-07-17.md`, часть A2.2.
Трек: **Карточка**. **Зависимость: после [спеки 1](2026-07-17-campaign-card-scenario-block-design.md).**

Здесь главная архитектурная работа трека — **вынос применения графа из workflow-view**, чтобы правка логики работала с карточки. Плюс удаление дублирующей текстовой воронки.

---

## Цель

Заменить упразднённую кнопку «Изменить» на **ИИ-иконку у заголовка «Сценарий кампании»**, которая кладёт в промпт-бар тег «Логика кампании» и запускает правки **структуры графа** через тот же ИИ-движок, что в графе. Описание и мини-превью детерминированно пересобираются из изменённого графа. Удалить `useCampaignEditFlow`, эндпоинт `/api/ai/campaign-edit-questions`, `campaignEditDrawer` — они дублировали промпт-бар и были заглушкой, не менявшей граф.

## AS IS (проверено против кода 2026-07-17)

Ключевая проблема — применение графа **привязано к монтированию workflow-view**:

- `use-assist-runner.ts:95-113` диспатчит `workflow_structural_commands_submit` (инкрементальные `ops`) и `workflow_rebuild_submit` (полная пересборка через `buildGraphFromSpec` + `validateAiGraph`).
- Редьюсер **только кладёт ops в почтовый ящик**, граф не трогает:
  - `app-state.ts:854` — `workflow_structural_commands_submit` → пишет `state.workflowStructuralCommands`, `workflowReplyId`.
  - `app-state.ts:1237` — `workflow_rebuild_submit` → пишет `state.workflowRebuild`, `workflowReplyId`.
- **Единственный потребитель слота** — `useEffect` в `workflow-view.tsx:526-551`, а `WorkflowSection` монтируется только при `view.kind==="workflow"` (`page.tsx:105`). Граф живёт в: (1) локальном React-стейте WorkflowView, (2) модульном кэше `workflow-graph-cache.ts` (`const graphs = new Map()`, `:15`; переживает unmount, не reload), (3) AppState держит только транзитные слоты.
- Апстрим-гейт `use-chat-submit.ts:381-385`: граф-контекст прикладывается к запросу только при `view.kind==="workflow" && !view.launched`. С карточки оркестратор графовых инструментов не получает.

**Следствие для наивной реализации A2.2:** отправив правку с карточки, мы (а) не приложим граф к контексту → оркестратор не вернёт `workflow-ops`; (б) даже если вернёт — ops лягут в слот, никто не применит, `workflowReplyId` не очистится, а пузырь в чате **зависнет навечно** (`graphReplyOwned=true` глушит fallback-текст, `use-assist-runner.ts:129-132`); ops выстрелят позже, при следующем заходе в граф.

Текстовая воронка (удаляется):
- `use-campaign-edit-flow.ts` — заглушка `FINAL_REPLY` (`:19-20`), граф не трогает (докстринг `:15-18`). Экспорт: `runCampaignEdit`, `answerEditQuestion`, `answerEditOption`, `useCampaignEditFlow`, `EditPhase`, тексты.
- Импортёры: `campaign-screen.tsx:17,87` (после спеки 1 — снятая кнопка, но импорт ещё есть); `workflow-description.tsx:10,29,...` (`DRAWER_HINT`, `SPINNER_TEXT`, `EditPhase`, спиннер/`busy`); `prompt-composer.tsx:49,491-492` (`answerEditOption/Question`, `VariantPicker` из `chat.campaignEditDrawer`).
- `campaignEditDrawer` в `chat-context.tsx`: тип `:143`, стейт `:157`, действия `open_campaign_edit`/`answer_campaign_edit`/`close_campaign_edit` (`:201,205,206`), редьюсер `:270,282,295`, API `openCampaignEdit`/`answerCampaignEdit`/`closeCampaignEdit` (`:664,669,673`), сброс scope `:540`.
- Эндпоинт `src/app/api/ai/campaign-edit-questions/`.
- `VariantPicker` в `prompt-composer.tsx` **шарится** с независимым `templateDrawer` (`tplQuestion`) — удалять только ветку campaign-edit, сам пикер не трогать.
- Тесты: `use-campaign-edit-flow.test.ts`, ветки в `chat-context.test.ts` (`:405-481`), `campaign-screen.test.tsx:61` (комментарий).

Механика тега/подсказок (переиспользуется):
- `PromptChipKind = "trigger"|"mode"|"node"|"section"` (`prompt-chips-context.tsx:14`). `pushChip` — upsert по id (`:86-91,121`). `removable` = «Backspace на пустом редакторе съедает чип» (`:104-113`), не «нельзя удалить».
- `select-prompt-suggestions.ts`: правило 1 «печатает после тега → hidden» (`:88-89`); правило 2 «активный тег» (`:91-113`) — ветки `node`/`trigger`, прочее (`section`) → hidden.
- Scope — член union `Scope` (`suggestion-registry/types.ts:84-106`) + рукописный `switch` в `registry.ts:23-44` (исчерпывающий, без `default`; новый член = ошибка компиляции, пока не добавлена ветка) + leaf-файл.

## TO BE

### 1. Headless-аппликатор графа для активной кампании

Ввести компонент/хук, который **потребляет почтовый слот вне workflow-view** — чтобы правка структуры применялась с карточки:

- Монтируется на shell-уровне (или в `CampaignScreen`), активен, когда выбрана кампания.
- Читает `state.workflowStructuralCommands` / `state.workflowRebuild` + `workflowReplyId`.
- Применяет ops/rebuild к графу активной кампании: берёт граф из `workflow-graph-cache` (`getCachedGraph(campaignId)`; если пусто — строит из шаблона по сценарию, как `campaign-screen.tsx:73-78`), применяет ту же логику, что `workflow-view.tsx:526-551` (переиспользовать/вынести общий применятель `applyStructuralOps`/rebuild), пишет результат обратно в кэш (`setCachedGraph`) и **бампает версию** (счётчик в AppState или в кэше), чтобы `CampaignScreen` перечитал `getCachedGraph` и `describeWorkflow` пересобрался.
- **Очищает слот и `workflowReplyId`** после применения (чинит зависающий спиннер) и закрывает pending-пузырь чата успехом.
- Когда workflow-view смонтирован — он остаётся владельцем применения; аппликатор не должен дублировать (гард по `view.kind` или единый общий потребитель, вынесенный из view). Рекомендуется **вынести применятель в один общий модуль** и вызывать его из обоих мест, а слот потреблять ровно одним активным потребителем.

Апстрим-гейт `use-chat-submit.ts:381-385` расширить: при активном теге «Логика кампании» на карточке прикладывать граф-контекст активной кампании (граф из кэша/шаблона), чтобы оркестратор получил графовые инструменты и вернул `workflow-ops`/`rebuild`.

Undo (`aiSnapshotRef` в WorkflowView, `state.aiUndoAvailable`) — для карточной правки завести аналогичный снапшот в аппликаторе или переиспользовать общий; в прототипе допустимо undo только внутри графа, но `aiUndoAvailable` не должен «зависать» истинным без живого снапшота.

### 2. ИИ-иконка и тег «Логика кампании»

- У заголовка «Сценарий кампании» — **ИИ-иконка** (маскот/AI-индикация, жёлтый как редкий сигнал по PRODUCT.md). По клику:
  - `pushChip` кладёт тег **«Логика кампании»** (`removable:true`). Завести отдельный `PromptChipKind: "campaign-logic"` с payload `{ campaignId }` (чище, чем перегружать `node`), обновив union + гард.
  - Фокус на бар.
- `select-prompt-suggestions.ts` правило 2: добавить ветку для тега `campaign-logic` → новый scope `campaign-logic`.
- Новый scope: член union `Scope` в `suggestion-registry/types.ts` + ветка в `registry.ts` switch + leaf-файл со списком подсказок.
- Правило 1 (печать после тега → hidden) уже работает — ничего не нужно.

Подсказки под баром (правки **структуры**, не артефактов): «Добавить шаг», «Изменить ветвление / условие», «Поменять задержку», «Добавить или убрать канал», «Изменить порядок касаний».

Отправка → тот же `use-assist-runner` (`workflow-ops`/`rebuild`) → меняет граф через аппликатор из п.1 → `describeWorkflow` и мини-превью пересобираются детерминированно из того же графа. Отдельно «применять правку к тексту» не нужно — это чинит нынешнюю заглушку.

### 3. Удаление текстовой воронки

- Удалить `use-campaign-edit-flow.ts` и эндпоинт `src/app/api/ai/campaign-edit-questions/`.
- Из `chat-context.tsx` вырезать `campaignEditDrawer`: тип, стейт, три действия, редьюсер-кейсы, три API-метода, сброс scope. `VariantPicker` в `prompt-composer.tsx` **оставить** (шарится с `templateDrawer`), убрать только campaign-edit ветку (`answerEditOption/Question`, чтение `chat.campaignEditDrawer`).
- `workflow-description.tsx`: убрать зависимость от `EditPhase/SPINNER_TEXT/DRAWER_HINT`, спиннер/`busy`-состояние правки; описание становится чисто презентационным (стадии из `describeWorkflow`).
- Обновить/удалить тесты: `use-campaign-edit-flow.test.ts` (удалить), `chat-context.test.ts` campaign-edit describe (`:405-481`, удалить), `campaign-screen.test.tsx` (обновить).

## Критерии приёмки

1. ИИ-иконка у заголовка «Сценарий кампании» кладёт тег «Логика кампании» в бар и фокусирует его.
2. При активном теге под баром — подсказки логики; печать после тега скрывает подсказки.
3. Отправка правки **с карточки** меняет граф: описание и мини-превью пересобираются из нового графа. Пузырь в чате завершается успехом (не зависает).
4. `useCampaignEditFlow`, эндпоинт `campaign-edit-questions`, `campaignEditDrawer` удалены; сборка/типы/тесты зелёные; `VariantPicker` для шаблонов не сломан.
5. Регресс: правка логики **в самом графе** (workflow-view) продолжает работать; двойного применения ops (view + аппликатор) нет.

## Маппинг файлов

| Область | Файлы |
|---|---|
| Headless-аппликатор + вынос применятеля | новый модуль + `workflow-view.tsx` (общий применятель), `workflow-graph-cache.ts`, `app-state.ts` (версия/очистка слота) |
| Граф-контекст для карточной правки | `use-chat-submit.ts` |
| ИИ-иконка + тег | `campaign-screen.tsx`, `prompt-chips-context.tsx` (новый kind) |
| Подсказки логики | `select-prompt-suggestions.ts`, `suggestion-registry/types.ts` + `registry.ts` + новый leaf |
| Движок графа | `use-assist-runner.ts` (без изменений логики — переиспользуется) |
| Удаление воронки | удалить `use-campaign-edit-flow.ts` + `api/ai/campaign-edit-questions/`; правки `chat-context.tsx`, `prompt-composer.tsx`, `workflow-description.tsx` |

## Риски

- **Двойной потребитель слота.** Если и WorkflowView, и аппликатор читают `workflowStructuralCommands`, ops применятся дважды. Обязателен единый активный потребитель (вынести применятель, гардить по view).
- **Undo без снапшота.** `aiUndoAvailable` живёт в AppState и может пережить ref-снапшот. Для карточной правки — либо свой снапшот, либо не выставлять `aiUndoAvailable` вне графа.
