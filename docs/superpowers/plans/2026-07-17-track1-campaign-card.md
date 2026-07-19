# Track 1 — Карточка — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить блок «Как работает кампания» в «Сценарий кампании» с нодо-блоками и прямой правкой артефактов, перенести прогноз+платежи в блок «Запуск», добавить навигацию и смещение промпт-бара, затем вынести применение графа так, чтобы правка логики работала с карточки, и удалить дублирующую текстовую воронку.

**Architecture:** Спека 1 — чисто UI-реструктуризация карточки + refcount-стейт ширины дровера. Спека 2 — выносим применятель графа (`applyStructuralOps`/rebuild) из `workflow-view.tsx` в общий модуль, headless-потребитель почтового слота применяет его для активной кампании (пишет в graph-cache, бампает версию → `describeWorkflow` пересобирается), единый активный потребитель. Текстовая воронка удаляется.

**Tech Stack:** Next.js 16, Tailwind v4, shadcn/base-ui, motion v12, TypeScript, Vitest, Playwright.

## Global Constraints

- Персист — **in-memory на сессию** (переживает навигацию, НЕ reload).
- Жёлтый — редкий сигнал (PRODUCT.md): один жёлтый акцент на экране (текущий шаг/primary CTA/AI-индикация). ИИ-иконка — AI-индикация.
- Правка артефактов — детерминированная, без ИИ/дровера-воронки, только до запуска; после запуска read-only.
- Число платежей в блоке «Запуск» = число на экране оплаты (общие модули `computeCampaignCost`/`splitCampaignPayments`).
- **Единый активный потребитель** почтового слота графа — не допускать двойного применения ops (view + аппликатор).
- Тексты RU: заголовок «Сценарий кампании»; тег «Логика кампании»; кнопка «К оплате»; подсказки логики: «Добавить шаг», «Изменить ветвление / условие», «Поменять задержку», «Добавить или убрать канал», «Изменить порядок касаний».
- Работать ТОЛЬКО в своём worktree; НИКОГДА `git stash`; dev-сервер только `-p 3001`; перед framework-кодом читать `node_modules/next/dist/docs/`.
- Тесты: unit `npx vitest run <path>`; typecheck `npx tsc --noEmit`; smoke `npm run test:screens`; visual `npm run test:visual`.
- Спеки-первоисточники: `docs/superpowers/specs/2026-07-17-campaign-card-scenario-block-design.md` (1), `...-campaign-card-logic-editing-design.md` (2).

---

## File Structure

| Файл | Ответственность | Действие |
|---|---|---|
| `src/sections/campaigns/campaign-screen.tsx` | блок «Сценарий кампании», нодо-блоки, «Запуск», ИИ-иконка, снятие «Изменить» | Modify |
| `src/sections/campaigns/workflow-description.tsx` | презентационное описание (без edit-флоу) | Modify |
| `src/sections/campaigns/node-card-content.tsx` | переиспользуемый add-file контрол | Read/reuse |
| `src/sections/campaigns/campaign-payment-screen.tsx` | источник `BudgetBreakdown`/`estimateTouches`/cost | Read/reuse |
| `src/sections/shell/prompt-bar.tsx` | правая граница = var(rail), пере-центрирование | Modify |
| `src/state/right-rail.ts` (создать) | refcount-стейт ширины активного дровера | Create |
| `src/sections/campaigns/{scoring-drawer,email-editor-panel,template-preview-drawer}.tsx`, `chat-drawer.tsx` | перевод на refcount | Modify |
| workflow-view (шапка) | кнопка «Назад» → карточка | Modify |
| `src/sections/campaigns/workflow-view.tsx` | вынести применятель графа | Modify |
| `src/sections/campaigns/graph-applier.ts` (создать) | чистый применятель ops/rebuild | Create |
| `src/sections/campaigns/use-campaign-graph-applier.ts` (создать) | headless-потребитель слота для активной кампании | Create |
| `src/sections/shell/use-chat-submit.ts` | граф-контекст при теге «Логика кампании» | Modify |
| `src/state/prompt-chips-context.tsx`, `src/state/select-prompt-suggestions.ts`, `src/state/suggestion-registry/*` | тег + scope подсказок | Modify |
| удалить: `src/sections/shell/use-campaign-edit-flow.ts`, `src/app/api/ai/campaign-edit-questions/`, `campaignEditDrawer` в `chat-context.tsx` | воронка | Delete |

---

## Task 1: Блок «Сценарий кампании» + нодо-блок скоринга/signal

**Files:**
- Modify: `src/sections/campaigns/campaign-screen.tsx:204-229` (CardSection)
- Reuse: `node-card-content.tsx:173-271` (add-file), `interests-triggers-editor.tsx` (панель)

**Interfaces:**
- Produces: перерисованный блок «Сценарий кампании» с нодо-блоком старта.

- [ ] **Step 1: Реализовать** — заголовок `CardSection` → «Сценарий кампании». Оставить `describeWorkflow`-текст и мини-превью. Добавить под этапом «Старт» нодо-блок (цвет по `nodeType`):
  - `new`/`stream` → блок `scoring`: строка «База» (список `campaign.files` + «Добавить файл» через контрол из `node-card-content.tsx`, пишет в `Campaign.files`/`ScoringParams.files`), строка «Интересы и триггеры» (свёрнутая сводка + кнопка раскрытия в боковую панель `InterestsTriggersEditor`).
  - `own` → блок `signal` с файлом (`SignalParams.fileName/files`), без интересов.
  - До запуска — интерактивно; после (`status !== "draft"`) — read-only.

- [ ] **Step 2: Smoke** — `npm run test:screens`. Ожидание: карточка кампании монтируется без ошибок консоли для `new`/`stream` и `own`.

- [ ] **Step 3: Визуальная проверка** — блок называется «Сценарий кампании»; под «Стартом» нодо-блок с базой (+«Добавить файл») и строкой «Интересы и триггеры», открывающей панель; для `own` — signal-блок.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(card): 'Сценарий кампании' block with scoring/signal node-block"`.

---

## Task 2: Нодо-блоки коммуникаций под «Первым касанием»

**Files:**
- Modify: `campaign-screen.tsx` (под этапом first-touch)

- [ ] **Step 1: Реализовать** — под этапом «Первое касание» рендерить нодо-блоки коммуникаций (`sms/email/push/ivr`) по коммуникационным нодам графа, каждый показывает текущий шаблон и открывает существующий редактор шаблона (выбор шаблона — не в этой спеке). До запуска — интерактивно, после — read-only.

- [ ] **Step 2: Smoke + визуальная проверка** — `npm run test:screens`; под первым касанием видны нодо-блоки каналов с шаблонами.

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(card): communication node-blocks under first-touch"`.

---

## Task 3: Блок «Запуск» — прогноз → платежи → «К оплате»

**Files:**
- Modify: `campaign-screen.tsx:248-266`
- Reuse: `campaign-payment-screen.tsx` (`BudgetBreakdown`, `estimateTouches`, `splitCampaignPayments`, `computeCampaignCost`)
- Test: `src/sections/campaigns/campaign-cost-parity.test.ts` (создать)

**Interfaces:**
- Consumes: те же cost-модули, что экран оплаты.

- [ ] **Step 1: Тест «стоимость — производная графа/аудитории»** — фиксирует, что цена **пересчитывается** при смене графа (это и есть содержательная часть критерия 6: карточка и оплата совпадают, потому что обе зовут одну и ту же чистую функцию с одним входом). Сначала найти реальный путь `computeCampaignCost`/`splitCampaignPayments` (импортируются в `campaign-payment-screen.tsx` — взять оттуда точный `import`).

```ts
import { describe, it, expect } from "vitest";
import { computeCampaignCost } from "<точный путь из campaign-payment-screen.tsx>";

describe("campaign cost is derived from graph/audience", () => {
  it("changes when the graph changes (recompute on base/template change)", () => {
    const small = computeCampaignCost(sampleCampaign, graphOneTouch);
    const large = computeCampaignCost(sampleCampaign, graphThreeTouches);
    expect(large).not.toBe(small);
  });
  it("is deterministic for the same inputs (card == payment screen)", () => {
    expect(computeCampaignCost(sampleCampaign, graphOneTouch))
      .toBe(computeCampaignCost(sampleCampaign, graphOneTouch));
  });
});
```

- [ ] **Step 2: Прогнать — падает/уточнить импорт** — `npx vitest run src/sections/campaigns/campaign-cost-parity.test.ts`. Взять точный `import` из `campaign-payment-screen.tsx`.

- [ ] **Step 3: Реализовать** — в блоке «Запуск» (только `status === "draft"`) по порядку: прогноз касаний (`estimateTouches`), платежи (`BudgetBreakdown` на рекомендуемой сумме), кнопка **«К оплате»** → `dispatch({ type:"open_campaign_payment", campaignId })`. Для `paused` — прежняя «Возобновить». Пересчёт — на ре-рендере (читает `launchGraph`/`campaign`).

- [ ] **Step 4: Прогнать — проходит** — `npx vitest run src/sections/campaigns/campaign-cost-parity.test.ts`.

- [ ] **Step 5: Визуальная проверка** — черновик: прогноз → платежи → «К оплате»; число совпадает с экраном оплаты; смена базы/шаблона пересчитывает.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(card): 'Запуск' block with touch forecast + payments + 'К оплате'"`.

---

## Task 4: Кнопка «Назад» в графе → карточка

**Files:**
- Modify: workflow-view (шапка; найти компонент шапки графа рядом с названием кампании)

- [ ] **Step 1: Реализовать** — у названия кампании в workflow-view добавить кнопку «Назад» → навигация на карточку кампании (обратная к `openWorkflow`; открыть `view.kind==="campaign"` для того же id).

- [ ] **Step 2: Smoke + визуальная проверка** — `npm run test:screens`; из графа «Назад» ведёт на карточку; с экрана оплаты «Назад» → граф (регресс не сломан).

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(card): back button in workflow-view header → campaign card"`.

---

## Task 5: refcount ширины дровера + смещение промпт-бара

**Files:**
- Create: `src/state/right-rail.ts`
- Modify: `prompt-bar.tsx:73`, `scoring-drawer.tsx`, `email-editor-panel.tsx`, `template-preview-drawer.tsx`, `chat-drawer.tsx`
- Test: `src/state/right-rail.test.ts`

**Interfaces:**
- Produces: `useReserveRightRail(widthPx: number): void` (монтируется в дровере: mount → добавить ширину, unmount → убрать; публикует **максимум** активных ширин в CSS-переменную `--right-rail-width`); внутренний refcount-реестр с корректным подсчётом при нескольких активных дроверах.

- [ ] **Step 1: Тест refcount** — регистрация двух ширин → опубликован max; снятие большей → опубликована меньшая (а не 0). Тестировать чистую функцию реестра (без React) — вынести логику `reserve(id,w)/release(id)/current()`.

```ts
import { describe, it, expect } from "vitest";
import { createRightRail } from "./right-rail";

it("publishes max active width and never drops to 0 while one remains", () => {
  const rail = createRightRail();
  rail.reserve("a", 480);
  rail.reserve("b", 420);
  expect(rail.current()).toBe(480);
  rail.release("a");
  expect(rail.current()).toBe(420); // NOT 0 — chat-drawer stays reserved
  rail.release("b");
  expect(rail.current()).toBe(0);
});
```

- [ ] **Step 2: Прогнать — падает** — `npx vitest run src/state/right-rail.test.ts`.

- [ ] **Step 3: Реализовать** — `createRightRail()` (Map id→width, `current()` = max или 0) + хук `useReserveRightRail(width)` (useLayoutEffect: reserve на mount, release на unmount, публикует `--right-rail-width` = current). Перевести три дровера на хук (снять их индивидуальные публикации `--email-preview-width`). `chat-drawer` читает `--right-rail-width`. `prompt-bar.tsx`: правая граница = `right: var(--right-rail-width, 0px)` (вместо `right-0`), внутренний `max-w-[720px]` пере-центрируется в области viewport − 120px − rail.

- [ ] **Step 4: Прогнать — проходит** + typecheck — `npx vitest run src/state/right-rail.test.ts && npx tsc --noEmit`.

- [ ] **Step 5: Визуальная проверка** — открыть скоринг-дровер: бар сжат и по центру видимой области, не перекрыт; открыть второй дровер поверх и закрыть первый — ширина не «проваливается» (баг устранён).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(shell): right-rail refcount + prompt-bar shift under drawers"`.

---

## Task 6: Снять кнопку «Изменить» с карточки

**Files:**
- Modify: `campaign-screen.tsx` (снять `canEdit`/кнопку), `workflow-description.tsx` (описание становится презентационным)

- [ ] **Step 1: Реализовать** — убрать кнопку «Изменить» и передачу `canEdit`/edit-пропсов в `WorkflowDescription`. Модуль `useCampaignEditFlow` НЕ удалять (это Task 11). Мини-превью и клик в граф — оставить.

- [ ] **Step 2: Smoke** — `npm run test:screens`. Ожидание: карточка монтируется, кнопки «Изменить» нет.

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(card): remove inline 'Изменить' text-edit affordance"`.

> Здесь спека 1 завершена (критерии 1–7). Дальше — спека 2.

---

## Task 7: Вынести чистый применятель графа

**Files:**
- Create: `src/sections/campaigns/graph-applier.ts`
- Modify: `src/sections/campaigns/workflow-view.tsx:526-551` (вызывать общий применятель)
- Test: `src/sections/campaigns/graph-applier.test.ts`

**Interfaces:**
- Produces: `applyStructuralOps(graph, ops): { nodes, edges }`; `applyRebuild(spec, opts): { nodes, edges }` — чистые функции, повторяющие логику, что сейчас в `useEffect` view (`workflow-view.tsx:526-551`) поверх `buildGraphFromSpec`/`validateAiGraph`.

- [ ] **Step 1: Тест** — `applyStructuralOps` на известном графе + наборе ops даёт ожидаемый граф (перенести/зафиксировать текущую логику view).

- [ ] **Step 2: Прогнать — падает** — `npx vitest run src/sections/campaigns/graph-applier.test.ts`.

- [ ] **Step 3: Реализовать** — вынести логику применения из `workflow-view.tsx` в `graph-applier.ts`; view вызывает её же (без изменения поведения графа).

- [ ] **Step 4: Прогнать — проходит** + smoke — `npx vitest run src/sections/campaigns/graph-applier.test.ts && npm run test:screens`. Регресс: правка в самом графе работает.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "refactor(graph): extract pure graph applier from workflow-view"`.

---

## Task 8: Headless-аппликатор слота для активной кампании

**Files:**
- Create: `src/sections/campaigns/use-campaign-graph-applier.ts`
- Modify: `campaign-screen.tsx` (смонтировать хук), `workflow-graph-cache.ts` (версия), `app-state.ts` (очистка слота)
- Test: интеграционный на reducer-слот + применятель

**Interfaces:**
- Consumes: `applyStructuralOps`/`applyRebuild` (Task 7), `state.workflowStructuralCommands`/`workflowRebuild`/`workflowReplyId`, `getCachedGraph`/`setCachedGraph`.
- Produces: хук `useCampaignGraphApplier(campaignId)` — если слот непуст и **workflow-view не смонтирован** (иначе владелец — view), применяет к графу кампании (из кэша/шаблона), пишет в кэш, **бампает версию** (счётчик в кэше/AppState → `campaign-screen` перечитывает `getCachedGraph`, `describeWorkflow` пересобирается), очищает слот и `workflowReplyId`, закрывает pending-пузырь успехом.

- [ ] **Step 1: Тест** — при непустом слоте и активной кампании хук применяет ops к кэшированному графу и очищает слот/replyId; при смонтированном view — не применяет (единый потребитель).

- [ ] **Step 2: Прогнать — падает** — `npx vitest run src/sections/campaigns/use-campaign-graph-applier.test.ts`.

- [ ] **Step 3: Реализовать** — хук + гард по `view.kind` (или единый общий потребитель, вынесенный из view). Версия кэша: добавить счётчик, `campaign-screen` подписывается. Очистка слота — новый reducer-путь или существующий clear.

- [ ] **Step 4: Прогнать — проходит** — `npx vitest run src/sections/campaigns/use-campaign-graph-applier.test.ts`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(card): headless graph applier consumes mailbox slot from card view"`.

---

## Task 9: Граф-контекст при теге «Логика кампании»

**Files:**
- Modify: `src/sections/shell/use-chat-submit.ts:381-385`

- [ ] **Step 1: Реализовать** — расширить гейт: при активном теге «Логика кампании» на карточке прикладывать граф-контекст активной кампании (граф из кэша/шаблона), чтобы оркестратор получил графовые инструменты и вернул `workflow-ops`/`rebuild`.

- [ ] **Step 2: Smoke** — `npm run test:screens`.

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(card): attach graph context for campaign-logic edits from card"`.

---

## Task 10: ИИ-иконка + тег «Логика кампании» + подсказки

**Files:**
- Modify: `campaign-screen.tsx` (ИИ-иконка), `prompt-chips-context.tsx` (новый kind), `select-prompt-suggestions.ts`, `suggestion-registry/types.ts` + `registry.ts` + новый leaf
- Test: `src/state/select-prompt-suggestions.test.ts` (расширить)

**Interfaces:**
- Produces: `PromptChipKind` += `"campaign-logic"` с payload `{ campaignId }` + гард; scope `campaign-logic` в `Scope` union + ветка в `registry.ts` switch + leaf-файл с подсказками (из Global Constraints).

- [ ] **Step 1: Тест селектора** — при активном теге `campaign-logic` (и не launched) `selectPromptSuggestions` возвращает scope `campaign-logic`; при печати после тега — `hidden` (правило 1 уже есть).

- [ ] **Step 2: Прогнать — падает** — `npx vitest run src/state/select-prompt-suggestions.test.ts`.

- [ ] **Step 3: Реализовать** — новый `PromptChipKind` + гард; ветка в правиле 2 `select-prompt-suggestions.ts`; член union `Scope` + ветка switch в `registry.ts` (исчерпывающий — компилятор заставит) + leaf с подсказками. ИИ-иконка у заголовка «Сценарий кампании» → `pushChip({kind:"campaign-logic", payload:{campaignId}, removable:true})` + фокус бара.

- [ ] **Step 4: Прогнать — проходит** + typecheck — `npx vitest run src/state/select-prompt-suggestions.test.ts && npx tsc --noEmit`.

- [ ] **Step 5: Визуальная проверка** — клик по ИИ-иконке кладёт тег, под баром подсказки логики; печать скрывает; отправка меняет граф (описание/превью пересобираются), пузырь завершается.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(card): AI icon → 'Логика кампании' chip + logic suggestions scope"`.

---

## Task 11: Удалить текстовую воронку правки

**Files:**
- Delete: `src/sections/shell/use-campaign-edit-flow.ts`, `src/app/api/ai/campaign-edit-questions/`
- Modify: `src/state/chat-context.tsx` (вырезать `campaignEditDrawer`), `src/sections/shell/prompt-composer.tsx` (убрать campaign-edit ветку, `VariantPicker` оставить), `workflow-description.tsx` (убрать EditPhase/спиннер)
- Delete tests: `use-campaign-edit-flow.test.ts`; Modify: `chat-context.test.ts` (убрать campaign-edit describe `:405-481`), `campaign-screen.test.tsx`

- [ ] **Step 1: Удалить/вырезать** — файл флоу + эндпоинт; из `chat-context.tsx` убрать тип/стейт/3 действия/редьюсер-кейсы/3 API-метода/сброс scope `:540`; из `prompt-composer.tsx` убрать `answerEditOption/Question` и чтение `chat.campaignEditDrawer` (**`VariantPicker` не трогать** — шарится с `templateDrawer`); `workflow-description.tsx` — убрать зависимость от `EditPhase/SPINNER_TEXT/DRAWER_HINT`, спиннер/`busy`.

- [ ] **Step 2: Обновить тесты** — удалить `use-campaign-edit-flow.test.ts`, вырезать campaign-edit describe в `chat-context.test.ts`, поправить `campaign-screen.test.tsx`.

- [ ] **Step 3: Прогнать всё** — `npx tsc --noEmit && npm test && npm run test:screens`. Ожидание: 0 ошибок типов, тесты зелёные, `VariantPicker` для шаблонов не сломан.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "refactor(card): remove text edit funnel (flow, endpoint, campaignEditDrawer)"`.

---

## Финальная проверка трека

- [ ] `npx tsc --noEmit` — 0 ошибок.
- [ ] `npm test` — зелёно.
- [ ] `npm run test:screens` — зелёно.
- [ ] `npm run test:visual` — просмотреть диффы; обновить baseline осознанно (свой порт).
- [ ] Регресс: правка логики в самом графе работает; двойного применения ops нет.
- [ ] Все критерии приёмки спек 1 (1–7) и 2 (1–5) отмечены.
- [ ] Основной чекаут не тронут.
