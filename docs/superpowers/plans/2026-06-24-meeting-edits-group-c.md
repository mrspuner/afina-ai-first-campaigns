# Группа C — граф как путь кампании и кампания без стадий: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Блок 9 (открытая кампания без стадийного индикатора; поток — сигнал в реальном времени; `phase` остаётся внутренним гейтом запуска) и Блок 8 (граф читается как путь **Файл → Скоринг → Сигнал → Коммуникация**: показ баз на ноде «Файл», действие «Добавить файл», правка интересов/триггеров скоринга через дровер).

**Architecture:** Сначала изолированный Блок 9 (чистка мёртвого индикатора + переосмысление `signal-progress`/`campaign-screen`, без смены модели `phase`). Затем Блок 8 на **влитой Группе B** (`Campaign.files[]`): фундамент модели графа (`ScoringParams` + порядок нод в шаблоне), потом UI графа (базы на ноде, «добавить файл», дровер скоринга). Блок 8 строится на **текущей** модели нод (`scoring` через `withScoring`) — перестройка нод из Блока 7 вне скоупа.

**Tech Stack:** Next.js 16, React, TS, Tailwind v4, motion v12, vitest + @testing-library/react.

**Спека:** `docs/superpowers/specs/2026-06-24-meeting-edits-group-c-design.md`

---

## Preflight

```bash
# Блок 8 требует Campaign.files[] из Группы B. Если B уже влита в integration:
git worktree add .worktrees/group-c -b feature/group-c integration
# Если B ещё НЕ влита — базироваться на ветке B (иначе Блок 8 не скомпилируется):
#   git worktree add .worktrees/group-c -b feature/group-c feature/group-b
cd .worktrees/group-c
git rev-list --count HEAD..integration   # при базе на integration — 0; при базе на feature/group-b — допустимо >0
```
Тесты: `npx vitest run <path>` (воркдерев резолвит родительский `node_modules`). tsc baseline: **13 пре-существующих ошибок** в `src/components/ai-elements/*` и `campaign-cost.ts` — игнорировать; Группа C не должна добавлять новых в свои файлы. Не пушить, не трогать `main`.

**Сверка AS-IS перед стартом:** `integration` дрейфует — перечитать актуальные file:line в `workflow-templates.ts`, `campaign-screen.tsx`, `campaign-launch-gate.ts`, `campaign-signal-progress.tsx` (спека писалась на снимке).

---

## Файловая карта

| Файл | Блок | Что меняем |
|---|---|---|
| `src/sections/campaigns/campaign-path-indicator.tsx` | 9 | удалить (мёртвый — нигде не отрисовывается) |
| `src/sections/campaigns/campaign-path-indicator.test.tsx` | 9 | удалить |
| `src/sections/campaigns/campaign-signal-progress.tsx` | 9 | неэтапный прогресс; ветка `stream` — «сигнал в реальном времени» + статистика |
| `src/sections/campaigns/campaign-screen.tsx` | 9 | pre-launch-блок → новая подача; realtime для потока; таймер/гейт НЕ трогать |
| `src/state/workflow-templates.ts` | 8 | входная нода «Файл»; добавить ноду «Сигнал» после `scoring`; `ScoringParams` на `scoring` |
| `src/types/workflow.ts` (где `SignalParams`) | 8 | `ScoringParams { kind:"scoring"; interests:string[]; triggers:string[] }` |
| `src/sections/campaigns/node-visuals.ts` | 8 | лейблы/иконки «Файл» (Database), «Сигнал» (SignalLow), «Скоринг» (Gauge) |
| `src/sections/campaigns/workflow-view.tsx` | 8 | показ `campaign.files` на ноде «Файл»; действие «Добавить файл»; дровер скоринга (интересы/триггеры) |
| `src/sections/campaigns/node-card-content.tsx` | 8 | секции «Интересы»/«Триггеры» в дровере для `scoring` |
| `src/state/app-state.ts` | 8 | экшен добавления базы в `Campaign.files` с графа (если ещё нет) |

---

## Task 1: Блок 9 — кампания без стадий; поток в реальном времени; `phase` внутренний

**Files:** `campaign-path-indicator.tsx` (+тест) — удалить; `campaign-signal-progress.tsx` (+тест); `campaign-screen.tsx` (+тест). `phase`-модель и `campaign-launch-gate.ts` — **не трогать**.

- [ ] **Step 1: Подтвердить, что индикатор мёртвый.** `grep -rn "CampaignPathIndicator\|campaign-path-indicator" src/ | grep -v "\.test\."` — должно быть пусто (только определение). Если где-то рендерится — СТОП, обновить план.
- [ ] **Step 2: Удалить мёртвый индикатор.** `git rm src/sections/campaigns/campaign-path-indicator.tsx src/sections/campaigns/campaign-path-indicator.test.tsx`. `npx tsc --noEmit` — без новых ошибок.
- [ ] **Step 3: Тест `signal-progress` — поток в реальном времени.** В `campaign-signal-progress.test.tsx` добавить кейс: для `sourceType:"stream"` рендерится текст **«Файл сигнала пишется в реальном времени»** + строка статистики; для `new`/`own` — неэтапный прогресс без нумерованных стадий «Шаг 1/2/3». Прогнать — упадёт.
- [ ] **Step 4: `campaign-signal-progress.tsx` — реализовать.** Убрать стадийный чек-лист как «путь» (нейтральный прогресс «Идёт сбор аудитории»); ветка `sourceType:"stream"` → realtime-подача + статистика (детерминированная по id, без RNG — стабильность тестов). Зависимость от `phase` сохранить только для «готово/не готово», не как «стадию». Прогнать — пройдёт.
- [ ] **Step 5: `campaign-screen.tsx` — подключить.** pre-launch-блок (`~:177-184`) → новая подача; для `stream` показывать realtime-блок. **Не трогать** таймер `SCORING_WINDOW_MS` (`~:45-53`) и гейт `canLaunchCampaign` (`~:72,202`). Обновить `campaign-screen.test.tsx` (видимость провайдеров на `phase` остаётся).
- [ ] **Step 6: Гейт запуска не сломан.** `npx vitest run src/sections/campaigns/campaign-launch-gate.test.ts src/state/campaign-phase.test.ts` — зелёные **без правок** (модель `phase` не менялась). Если красные — значит модель тронута, откатить.
- [ ] **Step 7: tsc + полный прогон + eslint затронутых.** `npx tsc --noEmit` (нет новых), `npx vitest run` (всё зелёное), `npx eslint <изменённые>`.
- [ ] **Step 8: Коммит.**
```bash
git add -A
git commit -m "feat(campaigns): кампания без стадий + поток в реальном времени (group C #9)"
```

---

## Task 2: Блок 8a — модель графа (`ScoringParams` + порядок нод Файл→Скоринг→Сигнал→Коммуникация)

**Files:** `src/state/workflow-templates.ts`, `src/state/node-params.ts` (где определены `*Params`), `src/sections/campaigns/node-visuals.ts`, + тесты. **Требует `Campaign.files[]` (Группа B).**

- [ ] **Step 1: Тест шаблона — новый порядок + ScoringParams.** В `workflow-templates.test.ts` добавить кейсы: для `new`/`stream` путь содержит **Файл → Скоринг → Сигнал → [каналы]** (входная нода — лейбл «Файл»; есть нода `signal` после `scoring`); нода `scoring` несёт `ScoringParams` (`interests`/`triggers`, пусть пустые). Для `own` — **Файл → Сигнал → [каналы]** (без скоринга). Прогнать — упадёт.
- [ ] **Step 2: `ScoringParams`.** В `src/types/workflow.ts` (где `SignalParams`) добавить `ScoringParams { kind: "scoring"; interests: string[]; triggers: string[] }` и включить в union params; дефолт — пустые массивы (param-less-инвариант: пустые → `nodeNeedsAttention` = false, скоринг не блокирует запуск).
- [ ] **Step 3: `workflow-templates.ts` — реализовать.**
  - Входная `source`-нода → лейбл **«Файл»** (сублейбл — имя/число баз).
  - `withScoring`: ноде `scoring` дать `ScoringParams` (из `campaign.interests`/триггеров при создании, иначе пустые).
  - Добавить ноду **«Сигнал»** (`signal`) после `scoring` (для `new`/`stream`) и Файл→Сигнал для `own`; пересчитать позиции/рёбра (как делает `withScoring` со `STEP`).
  - Сохранить инвариант уникальности id/лейблов (проверяет тест).
- [ ] **Step 4: Прогнать — пройдёт.**
- [ ] **Step 5: `node-visuals.ts`.** Убедиться, что «Файл» (Database), «Сигнал» (SignalLow), «Скоринг» (Gauge) имеют консистентные иконки/палитры; обновить `node-visuals.test.ts` при необходимости.
- [ ] **Step 6: tsc + полный прогон.** Нет новых ошибок; всё зелёное (особое внимание — ai-graph-validation, workflow-validation: новый порядок нод не должен ломать валидацию).
- [ ] **Step 7: Коммит.**
```bash
git add -A
git commit -m "feat(graph): путь Файл→Скоринг→Сигнал→Коммуникация + ScoringParams (group C #8)"
```

---

## Task 3: Блок 8b — UI графа (базы на ноде «Файл», «Добавить файл», дровер скоринга)

**Files:** `src/sections/campaigns/workflow-view.tsx`, `src/sections/campaigns/node-card-content.tsx`, `src/state/app-state.ts`, + тесты.

- [ ] **Step 1: Тест — нода «Файл» показывает базы.** Тест `workflow-view`: при `campaign.files = [{name,rowCount}, …]` нода «Файл» показывает имена/число баз; при пустом — плейсхолдер. Прогнать — упадёт.
- [ ] **Step 2: Реализовать показ баз.** `workflow-view.tsx` — пробросить `campaign.files` (или `campaignBaseRows`/имена) в рендер ноды «Файл».
- [ ] **Step 3: Тест — «Добавить файл».** Действие на ноде «Файл» (или пане) открывает загрузку (`DropZone`) и добавляет базу в `Campaign.files`; диспатчит соответствующий экшен. Прогнать — упадёт.
- [ ] **Step 4: Реализовать «Добавить файл».** Экшен в `app-state.ts` (добавить базу в `campaign.files`), кнопка/действие в `workflow-view.tsx` (reuse `DropZone` из Группы B). Прототип: имя + `simulateRowCount`.
- [ ] **Step 5: Дровер скоринга — интересы/триггеры.** При выборе `scoring`-ноды боковой дровер (`node-card-content.tsx`) показывает секции **«Интересы»**/**«Триггеры»** из `ScoringParams`, редактируемые (базовая правка; AI-правка полей — Блок 7, вне скоупа). Тест на рендер секций для `scoring`.
- [ ] **Step 6: Прогнать — пройдёт.**
- [ ] **Step 7: tsc + полный прогон + eslint затронутых.** Всё зелёное; tsc без новых.
- [ ] **Step 8: Коммит.**
```bash
git add -A
git commit -m "feat(graph): базы на ноде «Файл», «Добавить файл», дровер скоринга (group C #8)"
```

---

## Task 4: Финальная проверка Группы C

- [ ] **Step 1:** `npx vitest run` — все тесты зелёные.
- [ ] **Step 2:** `npx tsc --noEmit` — только 13 пре-существующих ошибок (ai-elements + campaign-cost); в файлах Группы C — ни одной.
- [ ] **Step 3:** `npx eslint <все изменённые файлы>` — без новых ошибок.
- [ ] **Step 4:** Гейт запуска `new`-draft работает (окно скоринга), модель `phase` не сломана; граф читается как путь Файл→Скоринг→Сигнал→Коммуникация; поток показывает realtime-сигнал.
- [ ] **Step 5:** Сообщить путь воркдерева и ветку. Слияние — далее по `finishing-a-development-branch`.

---

## Соответствие критериям приёмки

- **Блок 9:** стадийный индикатор удалён; нет нумерованных стадий на экране кампании; поток показывает «файл сигнала пишется в реальном времени» + статистику; «Запустить» гейтится корректно (`phase` внутренний, не сломан) → Task 1.
- **Блок 8:** граф = Файл → Скоринг → Сигнал → Коммуникация (own: без скоринга); нода «Файл» показывает базы + «Добавить файл»; дровер скоринга правит интересы/триггеры; скоринг не блокирует запуск → Tasks 2-3.

---

## Открытые развилки (см. спеку, §«Развилки»)

1. **Блок 8 — «Файл» и «Сигнал» две ноды или относировать одну.** Дефолт: входная `source` → «Файл», отдельная нода `signal` после скоринга.
2. **Блок 8 — где живут интересы/триггеры скоринга.** Дефолт: `ScoringParams` со списками, заполняется из визарда.
3. **Блок 9 — глубина удаления `phase`.** Дефолт: оставить внутренним (гейт запуска), убрать только UI-стадии. Не рекомендуется рвать модель.

Эти решения приняты по умолчанию в плане; при реализации подтвердить или скорректировать, зафиксировав в коммите.
