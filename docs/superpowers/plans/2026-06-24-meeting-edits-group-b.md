# Группа B — источник/поток и переход бюджета: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Блок 6 (шаг бюджета открывает граф кампании вместо карточки) и Блок 4 (убрать интеграцию из потока, дефолт «Новая база», поддержка нескольких баз через массив `files[]`).

**Architecture:** Сначала изолированный Блок 6 (кнопка + одна строка reducer). Затем Блок 4: фундамент модели данных (`StepData.files[]`, `Campaign.files[]`, хелпер `campaignBaseRows`, маппинг в reducer, 5 downstream-потребителей), потом UI шага загрузки (несколько баз) и мелочи источника/цепочки.

**Tech Stack:** Next.js 16, React, TS, Tailwind v4, motion v12, vitest + @testing-library/react.

**Спека:** `docs/superpowers/specs/2026-06-24-meeting-edits-group-b-design.md`

---

## Preflight

```bash
git worktree add .worktrees/group-b -b feature/group-b integration
cd .worktrees/group-b
git rev-list --count HEAD..integration   # MUST be 0
```
Тесты: `npx vitest run <path>` (воркдерев резолвит родительский node_modules). tsc baseline: **13 пре-существующих ошибок** в `src/components/ai-elements/*` и `campaign-cost.ts` — игнорировать; Группа B не должна добавлять новых в свои файлы. Не пушить, не трогать main.

---

## Файловая карта

| Файл | Блок | Что меняем |
|---|---|---|
| `src/sections/campaigns/wizard/steps/step-budget.tsx` | 6 | кнопка «Далее», убрать ветку TopUpModal в handleContinue |
| `src/state/app-state.ts` | 6, 4 | reducer `campaign_created_from_wizard`: view→workflow + маппинг `files`; тип `Campaign.file`→`files` |
| `src/types/campaign.ts` | 4 | `StepData.file: File\|null` → `files: File[]`; `initialStepData.files=[]` |
| `src/sections/campaigns/campaign-metrics.ts` | 4 | хелпер `campaignBaseRows(c)` + использовать |
| `src/sections/artifacts/artifact-screen.tsx` | 4 | строка «Файл базы» → список имён |
| `src/state/presets.ts` | 4 | `campaign.file?.rowCount` → `campaignBaseRows` |
| `src/state/artifact-metrics.ts` | 4 | то же |
| `src/sections/campaigns/campaign-payment-screen.tsx` | 4 | то же |
| `src/sections/campaigns/wizard/steps/step-file.tsx` | 4 | несколько файлов + «Загрузить ещё одну базу» + ветка stream |
| `src/sections/campaigns/wizard/steps/step-source.tsx` | 4 | дефолт «new», убрать Badge «Рекомендуется» |
| `src/sections/campaigns/wizard/wizard-steps.ts` | 4 | stream: `integration`→`file` |
| `src/sections/campaigns/wizard/steps/step-4-upload.tsx` | 4 | удалить (мёртвый) |

---

## Task 1: Блок 6 — «Далее» открывает граф, без оплаты на шаге

**Files:** `src/sections/campaigns/wizard/steps/step-budget.tsx`, `src/state/app-state.ts`, + затронутые тесты.

- [ ] **Step 1: Reducer-тест — визард открывает граф.** Найти существующий тест reducer (`git grep -l campaign_created_from_wizard` среди `*.test.ts`); если есть — добавить кейс, иначе создать `src/state/app-state.campaign-created.test.ts`. Кейс: диспатч `campaign_created_from_wizard` с минимальным `stepData` → `state.view.kind === "workflow"`, `state.view.launched === false`, `view.campaign.id` совпадает с созданной кампанией. Если в репо уже есть тест, утверждающий `kind==="campaign"` для этого экшена — **обновить его** на `"workflow"`.

```ts
// форма проверки (адаптировать под существующий harness reducer):
const next = reducer(stateWithSurvey, {
  type: "campaign_created_from_wizard",
  stepData: { ...initialStepData, scenario: "scn", sourceType: "new", channels: ["sms"] },
  scenarioName: "Тест",
});
expect(next.view).toMatchObject({ kind: "workflow", launched: false });
expect(next.campaigns.at(-1)!.id).toBe((next.view as { campaign: { id: string } }).campaign.id);
```

- [ ] **Step 2: Прогнать — упадёт** (`npx vitest run <reducer test>`): сейчас reducer отдаёт `kind:"campaign"`.

- [ ] **Step 3: Reducer — открыть граф.** В `src/state/app-state.ts`, case `campaign_created_from_wizard` (строки 459-466), заменить блок `view` на форму как у `campaign_duplicated` (строки 577-581):
```ts
        view: {
          kind: "workflow",
          campaign: { id: newCampaign.id, name: newCampaign.name },
          launched: false,
        },
```
Обновить комментарий строки 462 на «Wizard finish opens the workflow graph editor (draft, not launched).»

- [ ] **Step 4: Прогнать — пройдёт.**

- [ ] **Step 5: step-budget — кнопка «Далее», без TopUpModal.** В `src/sections/campaigns/wizard/steps/step-budget.tsx`:
  - `handleContinue` (строки 295-304): убрать ветку `if (!enoughBalance) { setTopUpOpen(true); return; }` — оставить только `proceed()`.
  - Футер (строки 524-529): `continueLabel={launchButtonLabel({ ... })}` → `continueLabel="Далее"`.
  - Убрать ставшее мёртвым: импорт `launchButtonLabel`, вычисление `enoughBalance`/`required`, и (если больше нигде не используются) `topUpOpen`/`setTopUpOpen`/`handleTopUpSuccess`/рендер `TopUpModal`/импорт `TopUpModal`. Цель — `npx eslint` без unused-var. Блок прогноза/радиокарточек НЕ трогать.
  - Обновить колокейтед-тесты `step-budget.test.ts`/`.test.tsx`: убрать ожидания «Запустить»/«Пополнить и запустить»/top-up; кнопка = «Далее»; нажатие ведёт к `onNext`/launch без модалки.

- [ ] **Step 6: Прогнать step-budget тесты + eslint** (`npx vitest run src/sections/campaigns/wizard/steps/step-budget.test.*` ; `npx eslint src/sections/campaigns/wizard/steps/step-budget.tsx`). Оба чисто.

- [ ] **Step 7: Проверка draft в workflow-view.** `npx tsc --noEmit` (без новых ошибок) и `npx vitest run` (полный — поймать ветки `kind==="workflow"`, реагирующие на свежий draft: `campaign_renamed`, `campaign_status_changed`, current-campaign-хелперы). Если что-то падает — починить минимально.

- [ ] **Step 8: Коммит.**
```bash
git add src/state/app-state.ts src/sections/campaigns/wizard/steps/step-budget.tsx <updated tests>
git commit -m "feat(wizard): шаг бюджета — «Далее» открывает граф кампании (group B #6)"
```

---

## Task 2: Блок 4a — модель данных «несколько баз» (`files[]` + хелпер + downstream)

**Files:** `src/types/campaign.ts`, `src/state/app-state.ts`, `src/sections/campaigns/campaign-metrics.ts`, `src/sections/artifacts/artifact-screen.tsx`, `src/state/presets.ts`, `src/state/artifact-metrics.ts`, `src/sections/campaigns/campaign-payment-screen.tsx`, + затронутые тесты.

- [ ] **Step 1: Хелпер `campaignBaseRows` — тест.** Создать `src/sections/campaigns/campaign-base-rows.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { campaignBaseRows } from "./campaign-metrics";
import type { Campaign } from "@/state/app-state";

const base = { id: "c", name: "n", status: "draft", createdAt: "" } as unknown as Campaign;

describe("campaignBaseRows", () => {
  it("нет файлов → undefined", () => {
    expect(campaignBaseRows({ ...base })).toBeUndefined();
    expect(campaignBaseRows({ ...base, files: [] })).toBeUndefined();
  });
  it("несколько файлов → сумма строк", () => {
    expect(
      campaignBaseRows({ ...base, files: [{ name: "a", rowCount: 100 }, { name: "b", rowCount: 250 }] }),
    ).toBe(350);
  });
});
```

- [ ] **Step 2: Прогнать — упадёт** (нет `campaignBaseRows`, нет `Campaign.files`).

- [ ] **Step 3: Типы.** `src/state/app-state.ts` строка 63: `file?: { name: string; rowCount: number };` → `files?: { name: string; rowCount: number }[];`. `src/types/campaign.ts`: `file: File | null;` (стр 23) → `files: File[];`; обновить doc-комментарий `fileRowCount` (стр 24-29) — «суммарное число строк всех загруженных баз»; `initialStepData` (стр 53-62): `file: null` → `files: []`.

- [ ] **Step 4: Хелпер.** В `src/sections/campaigns/campaign-metrics.ts` добавить и экспортировать:
```ts
/** Суммарный размер базы кампании (строк) по всем файлам; undefined, если файлов нет. */
export function campaignBaseRows(c: Campaign): number | undefined {
  return c.files?.length ? c.files.reduce((sum, f) => sum + f.rowCount, 0) : undefined;
}
```
(Убедиться, что `Campaign` импортирован в файле.)

- [ ] **Step 5: Reducer-маппинг.** `src/state/app-state.ts` case `campaign_created_from_wizard` (строки 436-441): заменить построение `file` на `files` из `sd.files` (каждому файлу — посчитанный размер). Поскольку точные построчные размеры считает шаг загрузки, а в reducer есть только суммарный `sd.fileRowCount`, распределить сумму на файлы поровну, либо (проще и достаточно для прототипа) хранить один rowCount на первом файле, остальные 0 — НО лучше: шаг загрузки уже кладёт `files` и суммарный `fileRowCount`; reducer строит `files: sd.files.map((f) => ({ name: f.name, rowCount: perFileRows }))`. Реализация: распределить `sd.fileRowCount` поровну с остатком на первый файл:
```ts
const total = sd.fileRowCount ?? 0;
const files = sd.files.length
  ? sd.files.map((f, i) => ({
      name: f.name,
      rowCount: i === 0
        ? total - Math.floor(total / sd.files.length) * (sd.files.length - 1)
        : Math.floor(total / sd.files.length),
    }))
  : undefined;
```
Подставить `files` в `newCampaign` вместо `file` (строка 450).

- [ ] **Step 6: Прогнать хелпер-тест — пройдёт.**

- [ ] **Step 7: Downstream-потребители на хелпер.** Заменить чтения `campaign.file?.rowCount` / `campaign.file?.name`:
  - `src/sections/campaigns/campaign-metrics.ts:42` — `recommendBudget(campaign.file?.rowCount ?? 0)` → `recommendBudget(campaignBaseRows(campaign) ?? 0)`.
  - `src/state/presets.ts:169` — `campaign.file?.rowCount ? base : rndInt(...)` → `campaignBaseRows(campaign) ? base : rndInt(...)` (импортировать `campaignBaseRows`).
  - `src/state/artifact-metrics.ts:12` — `if (campaign.file?.rowCount) return campaign.file.rowCount;` → `const rows = campaignBaseRows(campaign); if (rows) return rows;`.
  - `src/sections/campaigns/campaign-payment-screen.tsx:77` — `campaign?.file?.rowCount ?? campaignArtifact?.count ?? FALLBACK_BASE` → `campaignBaseRows(campaign) ?? campaignArtifact?.count ?? FALLBACK_BASE`.
  - `src/sections/artifacts/artifact-screen.tsx:114` — `<SummaryRow label="Файл базы">{campaign.file ? campaign.file.name : "—"}</SummaryRow>` → показать список имён: `{campaign.files?.length ? campaign.files.map((f) => f.name).join(", ") : "—"}`.

- [ ] **Step 8: Найти и обновить ВСЕ прочие ссылки на старую форму.** `git grep -n "\.file\b" src | grep -iE "campaign|stepData|\.file\?" ` и `git grep -n "fileRowCount" src` и `git grep -n "campaign.file" src`. Любой код/тест, читающий `campaign.file` или `stepData.file`, перевести на `files`/`campaignBaseRows`. Особое внимание: тесты состояния/бюджета/артефактов, фикстуры кампаний с `file: {...}` → `files: [{...}]`.

- [ ] **Step 9: tsc + полный прогон.** `npx tsc --noEmit` (нет новых ошибок в Группе B; `file`-обращений к Campaign не осталось) и `npx vitest run` — всё зелёное. Чинить, пока не зелёное.

- [ ] **Step 10: Коммит.**
```bash
git add -A
git commit -m "feat(campaigns): модель нескольких баз — Campaign.files[] + campaignBaseRows (group B #4)"
```

---

## Task 3: Блок 4b — UI шага загрузки (несколько баз) + источник + цепочка

**Files:** `src/sections/campaigns/wizard/steps/step-file.tsx`, `src/sections/campaigns/wizard/steps/step-source.tsx`, `src/sections/campaigns/wizard/wizard-steps.ts`, удалить `step-4-upload.tsx`, + тесты.

- [ ] **Step 1: wizard-steps — поток грузит базу.** Тест: создать/дополнить `src/sections/campaigns/wizard/wizard-steps.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { stepsForSource } from "./wizard-steps";
describe("stepsForSource", () => {
  it("поток: file вместо integration", () => {
    expect(stepsForSource("stream")).toEqual(["scenario","source","interests","file","channels","budget"]);
  });
  it("new и own сохраняют file", () => {
    expect(stepsForSource("new")).toContain("file");
    expect(stepsForSource("own")).toContain("file");
    expect(stepsForSource("stream")).not.toContain("integration");
  });
});
```
- [ ] **Step 2: Прогнать — упадёт.**
- [ ] **Step 3:** В `wizard-steps.ts` строка 19: `: ["interests", "integration"]; // stream` → `: ["interests", "file"]; // stream` (обновить doc-комментарий §6-12). `WizardStepId` тип `integration` оставить (компонент жив, просто не в цепочке).
- [ ] **Step 4: Прогнать — пройдёт.**

- [ ] **Step 5: step-source — дефолт new + без Badge.** Тест: создать `src/sections/campaigns/wizard/steps/step-source.test.tsx` (стабит StepContent, рендерит StepSource с `data` имеющим `scenario` у которого recommended≠new): утверждать, что Badge «Рекомендуется» НЕ в DOM, и что по умолчанию активна «Новая база номеров» (`aria-pressed` на ней). Затем в `step-source.tsx`:
  - строки 53-58: убрать `recommended`; `useState<SourceType>(() => data.sourceType)` (а `initialStepData.sourceType` уже `"new"`).
  - строки 98-102: удалить рендер Badge «Рекомендуется» (и импорт `Badge`, и `getScenario`, если станут не нужны — проверить eslint).
- [ ] **Step 6: Прогнать + eslint step-source.**

- [ ] **Step 7: step-file — несколько баз + ветка stream.** Тест: `step-file.test.tsx` (стаб StepContent, мок DropZone если нужно): один файл → «Далее» эмитит `{ files:[file], fileRowCount:N }`; кнопка «Загрузить ещё одну базу» добавляет второй слот; для `sourceType:"stream"` заголовок «Загрузите базу номеров» и подзаголовок «Номера, которые нужно поставить на мониторинг». В `step-file.tsx`:
  - Состояние одного файла → список: `useState<File[]>(data.files)`. Рендер по одному DropZone на загруженный файл + пустой слот; кнопка **«Загрузить ещё одну базу»** добавляет слот.
  - `fileCopy(sourceType)`: добавить ветку `stream` → `{ title: "Загрузите базу номеров", subtitle: "Номера, которые нужно поставить на мониторинг" }`.
  - `simulateRowCount` по каждому файлу; `emit` кладёт `{ files, fileRowCount: сумма }` (+ `ownSignalType` как раньше для own).
  - `canContinueFromFile` → требуется ≥1 файл (адаптировать к массиву; сохранить экспорт пуро-функции, можно переименовать в `canContinueFromFiles(files: File[])`).
  - Логику хеширования сохранить (хешировать новые файлы).
- [ ] **Step 8: Прогнать step-file тесты.**

- [ ] **Step 9: Удалить мёртвый upload.** `git rm src/sections/campaigns/wizard/steps/step-4-upload.tsx` (и его тест, если есть). Подтвердить грепом, что он нигде не импортируется.

- [ ] **Step 10: tsc + полный прогон + eslint затронутых.** Всё зелёное; tsc без новых ошибок.

- [ ] **Step 11: Коммит.**
```bash
git add -A
git commit -m "feat(wizard): несколько баз на шаге загрузки, дефолт «Новая база», поток грузит базу (group B #4)"
```

---

## Task 4: Финальная проверка Группы B

- [ ] **Step 1:** `npx vitest run` — все тесты зелёные.
- [ ] **Step 2:** `npx tsc --noEmit` — только 13 пре-существующих ошибок (ai-elements + campaign-cost); в файлах Группы B — ни одной; обращений к `Campaign.file`/`StepData.file` (старая форма) не осталось.
- [ ] **Step 3:** `npx eslint <все изменённые файлы>` — без новых ошибок.
- [ ] **Step 4:** Сообщить путь воркдерева и ветку. Слияние — далее по finishing-a-development-branch.

---

## Соответствие критериям приёмки

- **Блок 6:** кнопка «Далее»; нажатие открывает граф (`kind:"workflow"`), без TopUpModal; прогноз не изменён; оплата downstream → Task 1.
- **Блок 4:** нет интеграции в потоке (file вместо неё, текст про мониторинг); дефолт «Новая база»; нет Badge «Рекомендуется»; несколько баз кнопкой «Загрузить ещё одну базу»; `Campaign.files[]` + суммарный размер в бюджет/оплату → Tasks 2-3.
