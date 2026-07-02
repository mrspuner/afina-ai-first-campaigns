# AI-reply delivery: unification + delivery fixes + debug indicator

**Date:** 2026-06-16
**Branch:** `fix/ai-reply-delivery` (worktree `.worktrees/plans-001-003`, base `feat/plans-001-003`)
**Status:** Design approved, pending spec review

## Problem

Реальный ИИ подключён в одном месте (оркестратор `POST /api/ai/assist` + клиент
`src/lib/ai/assist-client.ts`), но ответ рисуется в чат **двумя расходящимися
обработчиками**:

- `src/sections/shell/use-chat-submit.ts` → `executeAssistResults` — Статистика,
  Сигналы, Настройки, guided-signal, запущенный (read-only) workflow.
- `src/sections/shell/prompt-composer.tsx` (инлайн, ~393–474) — только
  редактируемый (draft) workflow.

Симптом пользователя: «иногда из разных частей интерфейса не приходит ответ».

### Найденные баги

| # | Severity | Где | Суть |
|---|----------|-----|------|
| 6 | root | оба обработчика | Дублирующий разбор `results[]` с расходящимся поведением — корень #1 и #4. |
| 1 | P0 | `prompt-composer.tsx:349–486` | На редактируемом workflow **текстовый** AI-ответ не получает оболочку: нет реплики пользователя, нет pending-пузыря, на `null` → legacy `workflow_command_submit` (regex), который на вопрос-не-команду молчит в чате. |
| 2 | P0 | `assist-client.ts:78` | Жёсткий таймаут 6 с. Gemini 2.5 Flash с `toolChoice:"required"` + system + graph + dataSummary регулярно превышает его (особенно на workflow — самый тяжёлый контекст) → `null` → фоллбек. Прерывисто и зависит от экрана. |
| 3 | P1 | `prompt-composer.tsx:252–258` | Раздел «Кампании»: текст, не распарсенный в фильтр/сортировку, не зовёт ИИ, ничего не пишет в чат и не сбрасывает редактор. |
| 4 | P1 | `use-chat-submit.ts:485–488` | `default: break` молча роняет графовые `kind` (workflow-ops/rebuild/node-params/undo) — латентный dead-letter. |
| 5 | P2 | оба хука | Гонка: `useState(false)` до завершения mount-пробы → первый сабмит после загрузки уходит в офлайн даже при наличии ключа. |

Дополнительно (объём согласован): индикатор отладки в дев-панели — «ушёл ли
последний запрос к ИИ», т.к. текущий журнал `aiLog` логирует только то, что
дошло до клиента, и не показывает «не-ушедшие» запросы.

## Намеренное разделение, которое сохраняем

Графовые правки (workflow-ops/rebuild/undo) рисуют ответ в чат **сами** через
анимацию «Думаю…» в `runCycle` (`workflow-view.tsx:467–545`, undo — 547–560).
Это часть «магии» продукта и сохраняется. `node-params` ответа-анимации не имеет
(эффект `nodeFieldPatch`, 443–465) — его ответ текстовый.

## Approach (выбран: A — общий executor + единая оболочка)

Свести разбор `results[]` в один раннер; обе поверхности зовут его. Воркфлоу-
специфичный Enter-роутинг (теги, очередь, структурные/нодовые команды) остаётся в
`prompt-composer` — уносится только ветка «свободный текст → ИИ».

### Component 1 — `src/sections/shell/use-assist-runner.ts`

`useAssistRunner()` → `run(args)`:

```
run({ text, segments, context, activeTriggerId }):
  1. chat.append({role:"user", text, ...}) + pendingId = chat.append({role:"assistant", pending:true})
  2. (опц.) chat.openSidebar() — гарантировать видимость ответа на workflow
  3. results = await fetchAssistMulti({ text, history, context })
  4. если results == null → updatePending(pendingId, lookupInformationalReply(text) ?? warmFallbackReply())
  5. иначе executeResults(results, pendingId, { activeTriggerId, ... })
```

`executeResults` — единый `switch` по всем `kind`:

- **Текстовые** (answer, clarify, stats, navigate, triggers, node-params):
  применяют состояние (dispatch) и копят `confirmations[]`; в конце
  `updatePending(pendingId, confirmations.join(...))`. Если `confirmations` пуст
  и ничего не исполнилось → фоллбек.
- **Графовые с анимацией** (workflow-ops, rebuild, undo): dispatch
  соответствующего экшена с прокинутым `replyId = pendingId`; ответ рисует
  `runCycle`. Раннер сам пузырь НЕ закрывает.

Удаляются: `executeAssistResults` из `use-chat-submit.ts` и инлайн-обработчик из
`prompt-composer.tsx`.

**Единая точка входа и сборки контекста — `useChatSubmit.submit`.** Она строит
`context` по текущему экрану для ВСЕХ поверхностей, включая workflow (граф через
`getCachedGraph` + `summarizeGraph`, `selectedNode`, `undoAvailable`), и зовёт
`useAssistRunner.run`. `prompt-composer` для свободного текста на редактируемом
workflow (когда `structural.ops==0 && nodeCommands==0`) больше не делает
собственный `fetchAssistMulti`, а делегирует в `chatSubmit({ text, segments })`
и `return`. Так пропадает второй вызов клиента и расходящееся построение
контекста.

### Component 2 — владение pending-пузырём

Новое опц. поле `replyId?: string` в экшенах
`workflow_structural_commands_submit`, `workflow_rebuild_submit`,
`workflow_ai_undo_request` (`src/state/app-state.ts`). `runCycle`
(`workflow-view.tsx`) и undo-эффект используют переданный `replyId` вместо
`chat.append({pending:true})`. Нет `replyId` (прямой ввод команды без ИИ) →
поведение как сейчас (создаёт свой пузырь). Так пузырь ровно один.

### Component 3 — таймаут (#2)

`assist-client.ts`: `AbortSignal.timeout(6000)` → `20000`. Вынести в именованную
константу `ASSIST_TIMEOUT_MS`.

### Component 4 — «Кампании» (#3)

`prompt-composer.tsx` ветка `view.name === "Кампании"`:
```
const { statuses, sort } = parseCampaignQuery(rawText)
if (statuses.length > 0 || sort !== "default") dispatch(campaigns_query_set)
else if (rawText.trim() || segments.length) chatSubmit({ text: rawText, segments })
resetEditor()
```

### Component 5 — гонка доступности (#5)

В точке AI-гейта: `const useAi = isAiParserEnabled() && (await fetchAssistAvailability())`
вместо чтения устаревшего стейта. Mount-проба остаётся ради прогрева кэша
(промис кэширован в `assist-client`). Касается обеих поверхностей; после
унификации гейт живёт в раннере.

### Component 6 — индикатор отладки + журнал

`AiLogEntry` (`src/state/dev-config.ts`) расширяется (поля опциональны — старые
записи в localStorage совместимы):
```
{ at, text, resultKinds, outcome,        // существующие
  screen?: string,
  route?: "ai" | "offline",
  errorReason?: "timeout" | "no-key" | "rate-limited" | "ai-failed" | null,
  latencyMs?: number }
```
- `assist-client` различает причину сбоя (AbortError → `timeout`; HTTP 503 →
  `no-key`; 502 + body → `rate-limited`/`ai-failed`) и пишет `errorReason` +
  `latencyMs`.
- Раннер логирует `route` (`offline`, когда `useAi=false`) и `screen`.
- `appendAiLogEntry` диспатчит `window` CustomEvent `afina:ai-log`.
- Дев-панель (`src/components/dev/dev-panel.tsx`), секция aiLog: верхняя строка
  «Последний запрос»: ✅ ушёл в ИИ (`<outcome>`, `<latency>с`) / ⚠️ оффлайн
  (`<reason>`) / ⛔ оборвалось (`<errorReason>`). Подписка на `afina:ai-log` для
  живого обновления.

## Data flow

```
PromptComposer.handlePromptSubmit
  ├─ welcome / campaigns-filter / workflow Enter-routing (без изменений по сути)
  ├─ campaigns свободный текст ──┐
  ├─ statistics / sections ──────┤
  └─ workflow свободный текст ────┤
                                  ▼
                       useChatSubmit.submit  (строит context по экрану)
                                  ▼
                       useAssistRunner.run
                       ├─ user echo + pending bubble (+openSidebar)
                       ├─ fetchAssistMulti  ──► /api/ai/assist
                       ├─ executeResults
                       │    ├─ текстовые → updatePending(pending)
                       │    └─ графовые → dispatch(..., replyId=pending) → runCycle рисует в тот же пузырь
                       └─ null → fallback в pending
                       (всё пишет в aiLog: route/screen/errorReason/latency)
```

## Error handling

- AI недоступен/выключен → `route:"offline"`, осмысленный текстовый фоллбек.
- Таймаут/502/503 → `errorReason` в журнал, текстовый фоллбек в пузырь.
- Несуществующий `campaignId`/`signalId` в navigate → подтверждение не пушим;
  если итог пуст → фоллбек (поведение сохраняется из текущего кода).
- rebuild с невалидным графом → текстовый ответ «не получилось собрать…»
  (сохраняется).

## Testing (TDD)

- `use-assist-runner.test.ts`: по каждому `kind` — корректные dispatch/chat;
  правило владения пузырём (текстовый → updatePending; графовый → replyId
  прокинут, второго пузыря нет); null → фоллбек.
- `prompt-composer` routing: «Кампании» не-фильтр → `chatSubmit` вызван +
  resetEditor.
- availability: первый сабмит ждёт `fetchAssistAvailability` (нет ключа →
  offline; есть ключ → ai).
- `assist-client.test.ts`: маппинг сбоев в `errorReason`, `latencyMs` записан.
- `dev-config`: расширенный `AiLogEntry` сериализуется; событие `afina:ai-log`.

## Out of scope

- Переписывание анимации `runCycle`.
- Смена модели/промпта оркестратора.
- Миграция/чистка старых записей журнала (поля опциональны — совместимо).
- Унификация Enter-роутинга workflow (теги/очередь) — остаётся в prompt-composer.
