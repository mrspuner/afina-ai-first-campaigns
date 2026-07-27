# Карточка кампании как финал визарда — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Значения параметров кампании становятся кликабельными тегами-пилюлями внутри текста описания; клик по тегу ведёт либо на изолированно открытый шаг визарда, либо в поповер правки по месту, а после запуска теги остаются носителями значений без клика.

**Architecture:** `DescriptionStage.body` переходит со строки на массив сегментов, часть которых — теги с целью. Визард получает сериализуемый снапшот на `Campaign.wizardData` и умеет открываться на одном шаге. Правка применяется одной транзакцией по основной кнопке; каскад обнуления и перестройка графа выполняются в момент коммита.

**Tech Stack:** Next.js 16, React 19 (compiler), TypeScript, Tailwind v4, shadcn/ui на base-ui, motion v12, vitest + @testing-library/react, playwright.

**Спека:** `docs/superpowers/specs/2026-07-27-campaign-card-wizard-finale-design.md`

## Global Constraints

- Работа идёт в worktree `.worktrees/track-card` на ветке `feature/track-card`. Никаких коммитов в `main`.
- Никогда не запускать `git stash` — worktree делит индекс с основным чекаутом.
- Next.js в этом репозитории отличается от того, что вы помните. Перед правкой роутинга или серверных частей читать `node_modules/next/dist/docs/`.
- Порт 3000 может держать основной чекаут. Для dev-прогонов из worktree брать `-p 3001`, кроме шага перегенерации базлайнов (там порт обязан быть 3000, см. Task 14).
- Жёлтый (`--brand`) — редкий сигнал. В тегах не используется ни в каком виде: на карточке их бывает до семи.
- Тексты интерфейса — строго из §3 спеки, дословно.
- Команды: `npm test` (vitest), `npx tsc --noEmit`, `npm run lint`, `npm run test:e2e` (e2e без визуальных), `npm run test:visual` (визуальные).
- Каждый таск заканчивается зелёными `npm test` и `npx tsc --noEmit`. Красное дерево между тасками недопустимо.
- Русские комментарии в коде — норма репозитория, следовать стилю окружающего файла.

---

## Файловая структура

| Файл | Ответственность |
|---|---|
| `src/types/campaign.ts` | `BaseFile`, `StepData.files` на лёгкой модели, `WizardSnapshot`, `StepProps.onValueChange` |
| `src/state/app-state.ts` | `Campaign.wizardData`, общая проекция `StepData → Campaign`, действия `campaign_step_edit_requested` и `campaign_wizard_edit_applied`, `editing` в `View`/`ViewAddress` |
| `src/state/graph-description.ts` | `DescriptionSegment`, `DescriptionTag`, `TagTarget`, `CampaignFacts`, сборка тегов. Остаётся чистой функцией |
| `src/sections/campaigns/description-tag.tsx` | **создать.** Пилюля: визуал, тултип, диспетчер клика, три поповера |
| `src/sections/campaigns/workflow-description.tsx` | Рендер сегментов; знает про пилюлю, но не про её содержимое |
| `src/sections/campaigns/campaign-screen.tsx` | Сбор `CampaignFacts`, снятие нодо-блоков |
| `src/sections/campaigns/node-template-select.tsx` | Расщепление на триггер и переиспользуемый `NodeTemplateList` |
| `src/sections/campaigns/workflow-graph-cache.ts` | `invalidateCachedGraph` |
| `src/state/workflow-templates.ts` | `mergeChannelNodes` — чистая функция мержа графа по смене каналов |
| `src/sections/campaigns/wizard/wizard-navigation.ts` | `STEP_INVALIDATES`, сокращённый сброс по сценарию |
| `src/sections/campaigns/wizard/campaign-workspace.tsx` | Изолированный режим, дорастающая колонка, вычисляемый `continueLabel`, коммит |
| `src/sections/campaigns/wizard/campaign-stepper.tsx` | `STEP_ICON` |
| `src/sections/campaigns/wizard/steps/step-footer.tsx` | `backLabel` и `continueLabel` приходят извне |
| `src/sections/campaigns/wizard/steps/step-file.tsx` | Лёгкая модель, сравнение по значению |
| `src/sections/campaigns/wizard/steps/step-1-scenario.tsx` | Диалог подтверждения смены сценария в режиме правки |
| `src/sections/campaigns/wizard/guided-campaign-section.tsx` | Гидрация снапшотом, перестройка графа перед коммитом |
| `src/sections/campaigns/campaign-scenario-node-block.tsx` | **удалить** |
| `src/sections/campaigns/campaign-communication-node-block.tsx` | **удалить** |

---

### Task 1: Лёгкая модель файлов

`StepData.files` — сырые браузерные `File[]`, невосстановимые из снапшота. Переводим на тот же тип, что уже несёт `Campaign.files`. Это предусловие всего снапшота: без него `StepData` несериализуем.

**Files:**
- Modify: `src/types/campaign.ts`
- Modify: `src/sections/campaigns/wizard/steps/step-file.tsx`
- Modify: `src/state/app-state.ts` (`campaign_created_from_wizard`, распределение строк)
- Test: `src/sections/campaigns/wizard/steps/step-file.test.ts`, `src/state/create-campaign-from-wizard.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `export interface BaseFile { name: string; rowCount: number }` в `src/types/campaign.ts`
  - `StepData.files: BaseFile[]`

- [ ] **Step 1: Написать падающий тест на сравнение по значению**

Дописать в `src/sections/campaigns/wizard/steps/step-file.test.ts`:

```ts
import { sameFileSet } from "./step-file";

describe("sameFileSet", () => {
  it("равные по имени и числу строк наборы считаются неизменными", () => {
    const a = [{ name: "base.csv", rowCount: 1000 }];
    const b = [{ name: "base.csv", rowCount: 1000 }];
    expect(sameFileSet(a, b)).toBe(true);
  });

  it("разное число строк — набор изменился", () => {
    expect(
      sameFileSet(
        [{ name: "base.csv", rowCount: 1000 }],
        [{ name: "base.csv", rowCount: 2000 }],
      ),
    ).toBe(false);
  });

  it("разная длина — набор изменился", () => {
    expect(sameFileSet([{ name: "a.csv", rowCount: 1 }], [])).toBe(false);
  });

  it("порядок значим — перестановка считается изменением", () => {
    const a = [{ name: "a.csv", rowCount: 1 }, { name: "b.csv", rowCount: 2 }];
    const b = [{ name: "b.csv", rowCount: 2 }, { name: "a.csv", rowCount: 1 }];
    expect(sameFileSet(a, b)).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- src/sections/campaigns/wizard/steps/step-file.test.ts`
Expected: FAIL — `sameFileSet` не экспортируется.

- [ ] **Step 3: Ввести тип `BaseFile`**

В `src/types/campaign.ts`, до `interface StepData`:

```ts
/**
 * Лёгкая, сериализуемая модель загруженной базы. Тот же тип, что несёт
 * `Campaign.files`, — поэтому между визардом и кампанией конверсии нет, а
 * `StepData` целиком укладывается в снапшот (объекты `File` невосстановимы).
 */
export interface BaseFile {
  name: string;
  rowCount: number;
}
```

Заменить в `StepData`:

```ts
  /** Загруженные базы (одна или несколько). Пустой массив — база не загружена. */
  files: BaseFile[];
```

- [ ] **Step 4: Перевести шаг «Файл»**

В `src/sections/campaigns/wizard/steps/step-file.tsx`:

1. Заменить состояние `files` на `BaseFile[]`.
2. `DropZone` продолжает отдавать `File` — конвертировать прямо в обработчике: `const toBase = (f: File): BaseFile => ({ name: f.name, rowCount: simulateRowCount(f) })`. Использовать ту же функцию подсчёта строк, что и сейчас в `totalRows` (посмотреть её текущий источник в этом файле и не заводить второй).
3. `DropZone` принимает `file` для отображения — если он типизирован как `File`, передать ему имя из `BaseFile` (посмотреть его props; если он читает только `.name`, достаточно расширить тип props до `{ name: string } | null`).
4. Заменить блок `unchanged` на экспортируемую чистую функцию:

```ts
/**
 * Набор баз не изменился — сравнение ПО ЗНАЧЕНИЮ (имя + число строк), а не по
 * ссылке: после перехода на `BaseFile` объекты пересоздаются при каждой
 * гидрации снапшота, и сравнение по ссылке всегда давало бы «изменился»,
 * запуская лишнее хеширование на каждом входе в шаг.
 */
export function sameFileSet(a: readonly BaseFile[], b: readonly BaseFile[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((f, i) => f.name === b[i].name && f.rowCount === b[i].rowCount);
}
```

и заменить использование: `const unchanged = sameFileSet(files, seededFiles);`

- [ ] **Step 5: Убрать распределение строк в редьюсере**

В `src/state/app-state.ts`, ветка `campaign_created_from_wizard`, заменить блок вычисления `files` (комментарий «StepData.files are raw browser `File[]`…» и следующие за ним ~12 строк) на:

```ts
      // `StepData.files` уже несёт число строк по каждому файлу — распределять
      // суммарный `fileRowCount` по файлам больше не нужно.
      const files = sd.files.length ? sd.files.map((f) => ({ ...f })) : undefined;
```

- [ ] **Step 6: Прогнать затронутые тесты**

Run: `npm test -- src/sections/campaigns/wizard/steps/step-file src/state/create-campaign-from-wizard src/state/campaign-file`
Expected: PASS. Тесты, конструирующие `new File(...)` для `StepData.files`, переписать на литералы `{ name, rowCount }`.

- [ ] **Step 7: Полный прогон и тайпчек**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. Тайпчек укажет все оставшиеся места, где `StepData.files` читался как `File[]` — починить каждое.

- [ ] **Step 8: Коммит**

```bash
git add -A
git commit -m "refactor(wizard): StepData.files на лёгкую модель BaseFile"
```

---

### Task 2: Снапшот визарда на кампании

**Files:**
- Modify: `src/types/campaign.ts` (`WizardSnapshot`)
- Modify: `src/state/app-state.ts` (`Campaign.wizardData`, общая проекция, запись/копирование/удаление)
- Test: `src/state/create-campaign-from-wizard.test.ts`

**Interfaces:**
- Consumes: `BaseFile`, `StepData` из Task 1.
- Produces:
  - `export type WizardSnapshot = StepData` в `src/types/campaign.ts`
  - `Campaign.wizardData?: WizardSnapshot`
  - `export function projectStepDataOntoCampaign(sd: StepData, scenarioName: string): Partial<Campaign>` в `src/state/app-state.ts` — общая проекция для создания и для коммита правки

- [ ] **Step 1: Написать падающие тесты**

Дописать в `src/state/create-campaign-from-wizard.test.ts`:

```ts
  it("создание из визарда кладёт снапшот на кампанию", () => {
    const state = reducer(baseState, {
      type: "campaign_created_from_wizard",
      stepData: { ...initialStepData, scenario: "s1", channels: ["sms"], budget: 5000 },
      scenarioName: "Тестовый",
    });
    const created = state.campaigns.at(-1)!;
    expect(created.wizardData).toBeDefined();
    expect(created.wizardData!.channels).toEqual(["sms"]);
    expect(created.wizardData!.budget).toBe(5000);
  });

  it("запуск кампании удаляет снапшот — двух источников правды не остаётся", () => {
    const created = reducer(baseState, {
      type: "campaign_created_from_wizard",
      stepData: { ...initialStepData, scenario: "s1" },
      scenarioName: "Тестовый",
    });
    const id = created.campaigns.at(-1)!.id;
    const launched = reducer(created, {
      type: "campaign_status_changed",
      id,
      status: "active",
      timestamp: "2026-07-27T10:00:00.000Z",
    });
    expect(launched.campaigns.find((c) => c.id === id)!.wizardData).toBeUndefined();
  });

  it("дубль черновика уносит снапшот — копия остаётся правимой", () => {
    const created = reducer(baseState, {
      type: "campaign_created_from_wizard",
      stepData: { ...initialStepData, scenario: "s1", channels: ["email"] },
      scenarioName: "Тестовый",
    });
    const id = created.campaigns.at(-1)!.id;
    const dup = reducer(created, { type: "campaign_duplicated", id, newId: "cmp_copy" });
    expect(dup.campaigns.find((c) => c.id === "cmp_copy")!.wizardData?.channels).toEqual([
      "email",
    ]);
  });
```

`baseState`, `reducer` и `initialStepData` — уже используемые в этом файле помощники; посмотреть их имена в шапке и подставить фактические.

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- src/state/create-campaign-from-wizard.test.ts`
Expected: FAIL — `created.wizardData` is undefined.

- [ ] **Step 3: Ввести тип**

В `src/types/campaign.ts`, после `StepData`:

```ts
/**
 * Сериализуемый слепок ответов визарда, хранимый на кампании.
 *
 * Совпадает со `StepData` — после перевода `files` на `BaseFile` в нём нет
 * несериализуемых значений, поэтому параллельного типа не заводим. Псевдоним
 * существует ради читаемости на стороне `Campaign`.
 */
export type WizardSnapshot = StepData;
```

- [ ] **Step 4: Выделить общую проекцию**

В `src/state/app-state.ts` вынести тело ветки `campaign_created_from_wizard`, отвечающее за перенос полей, в экспортируемую функцию над `reducer`:

```ts
/**
 * Проекция ответов визарда в поля кампании. Общая для создания
 * (`campaign_created_from_wizard`) и для коммита правки с карточки
 * (`campaign_wizard_edit_applied`) — иначе две ветки неизбежно разъехались бы
 * в том, какие поля переносятся.
 *
 * `id`, `name`, `createdAt`, `status` и `phase` сюда НЕ входят: они зависят от
 * того, создаётся кампания или правится, и решаются на стороне вызова.
 */
export function projectStepDataOntoCampaign(sd: StepData): Partial<Campaign> {
  return {
    sourceType: sd.sourceType,
    channels: sd.channels,
    interests: sd.interests,
    triggers: sd.triggers,
    triggerConfig:
      Object.keys(sd.triggerConfig).length > 0 ? sd.triggerConfig : undefined,
    files: sd.files.length ? sd.files.map((f) => ({ ...f })) : undefined,
    budget: sd.budget ?? undefined,
    dailyBudget: sd.dailyBudget,
    maxDailyBudget: sd.maxDailyBudget,
    wizardData: structuredClone(sd),
  };
}
```

Переписать ветку `campaign_created_from_wizard` так, чтобы она собирала `newCampaign` из `projectStepDataOntoCampaign(sd)` плюс собственные поля (`id`, `name`, `status`, `createdAt`, `phase`, `scenario`).

- [ ] **Step 5: Добавить поле и жизненный цикл**

В типе `Campaign` (`app-state.ts:56`), после `scenario`:

```ts
  /**
   * Слепок ответов визарда. Нужен ТОЛЬКО для гидрации визарда при точечной
   * правке с карточки — значения для тегов описания берутся с полей самой
   * кампании, поэтому удаление снапшота при запуске ничего в тексте не рушит.
   * Отсутствует у запущенных кампаний и у сидовых пресетов.
   */
  wizardData?: WizardSnapshot;
```

В ветке `campaign_status_changed` при переходе в `"active"` — снимать поле (`wizardData: undefined`). В ветке `campaign_duplicated` — переносить `wizardData` на копию, как уже переносятся остальные поля.

- [ ] **Step 6: Прогнать и закоммитить**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

```bash
git add -A
git commit -m "feat(state): снапшот визарда на кампании и общая проекция StepData"
```

---

### Task 3: Сегментная модель описания (нейтральный рефактор)

Меняем тип `body` со строки на массив сегментов, ПОКА без тегов. Поведение и текст не меняются — это подготовка почвы, чтобы следующий таск занимался только тегами.

**Files:**
- Modify: `src/state/graph-description.ts`
- Modify: `src/sections/campaigns/workflow-description.tsx`
- Test: `src/state/graph-description.test.ts`, `src/sections/campaigns/workflow-description.test.tsx`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `export type DescriptionSegment = { kind: "text"; text: string } | { kind: "tag"; tag: DescriptionTag }`
  - `DescriptionStage.body: DescriptionSegment[]`
  - `export function segmentsText(segments: DescriptionSegment[]): string` — склейка в строку, для тестов и для `title`-атрибутов

- [ ] **Step 1: Ввести типы и помощник**

В `src/state/graph-description.ts`, рядом с `DescriptionStage`:

```ts
/**
 * Кусок текста описания. Значения параметров кампании выносятся в теги-пилюли,
 * поэтому тело этапа больше не строка — оно чередует текст и теги.
 * `DescriptionTag` объявляется в следующем шаге трека; пока сегменты только
 * текстовые.
 */
export type DescriptionSegment =
  | { kind: "text"; text: string }
  | { kind: "tag"; tag: DescriptionTag };

/** Короткий конструктор текстового сегмента — читаемость сборки описания. */
const t = (text: string): DescriptionSegment => ({ kind: "text", text });

/** Плоский текст сегментов — для тестов, тултипов и заголовков. */
export function segmentsText(segments: DescriptionSegment[]): string {
  return segments
    .map((s) => (s.kind === "text" ? s.text : s.tag.label))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
```

Временно объявить `interface DescriptionTag { id: string; label: string }` — Task 4 его расширит.

Заменить в `DescriptionStage`: `body: DescriptionSegment[]`.

- [ ] **Step 2: Перевести сборку**

В `describeWorkflow` обернуть каждое присваивание `body` в массив из одного текстового сегмента: `body: [t(startBody)]` и так далее. `startBody` с pending-доменами собрать как два сегмента — Task 4 вставит между ними тег доменов:

```ts
    body: pendingDomains.length
      ? [
          t(`${startBody} Домены `),
          t(pendingDomains.join(", ")),
          t(" отправлены на модерацию — в кампанию войдут только одобренные; не прошедшие проверку не подключаются, отклонённые удаляются из кампании."),
        ]
      : [t(startBody)],
```

- [ ] **Step 3: Перевести рендер**

В `src/sections/campaigns/workflow-description.tsx` заменить `{stage.body}` на рендер сегментов:

```tsx
          <p>
            <strong className="font-semibold text-foreground">{stage.heading}</strong>{" "}
            {stage.body.map((segment, i) =>
              segment.kind === "text" ? (
                <span key={i}>{segment.text}</span>
              ) : null,
            )}
          </p>
```

Ветка тегов появится в Task 5 — здесь она осознанно пустая, потому что тегов ещё никто не производит.

- [ ] **Step 4: Починить тесты**

В `src/state/graph-description.test.ts` заменить каждое утверждение вида `expect(stage.body).toContain("…")` на `expect(segmentsText(stage.body)).toContain("…")`. То же в `workflow-description.test.tsx`, где тест читает текст напрямую — там текст рендерится в DOM без изменений, так что большинство утверждений уцелеет; чинить только те, что падают.

- [ ] **Step 5: Прогнать, тайпчекнуть, закоммитить**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. Видимый текст в приложении не изменился ни на символ.

```bash
git add -A
git commit -m "refactor(description): body этапа на сегментную модель"
```

---

### Task 4: Теги в describeWorkflow

Чистая функция получает факты кампании и вставляет теги в текст. Логика тегирования тестируется без React.

**Files:**
- Modify: `src/state/graph-description.ts`
- Test: `src/state/graph-description.test.ts`

**Interfaces:**
- Consumes: `DescriptionSegment`, `segmentsText` из Task 3.
- Produces:
  - `export interface DescriptionTag { id: string; label: string; target: TagTarget; hoverList?: string[] }`
  - `export type TagTarget = { kind: "wizard-step"; step: WizardStepId } | { kind: "template"; nodeId: string } | { kind: "node-fields"; nodeId: string } | { kind: "domains" }`
  - `export interface CampaignFacts { … }` (полный состав ниже)
  - `describeWorkflow(graph, templates, facts?: CampaignFacts): DescriptionStage[]`
  - `DescriptionMessage.templateTag?: DescriptionTag`

- [ ] **Step 1: Написать падающие тесты**

Дописать в `src/state/graph-description.test.ts`:

```ts
import { describeWorkflow, segmentsText, type CampaignFacts } from "./graph-description";

/** Все теги описания одним плоским списком — удобно для утверждений. */
const allTags = (stages: ReturnType<typeof describeWorkflow>) =>
  stages.flatMap((s) => [
    ...s.body.filter((seg) => seg.kind === "tag").map((seg) => seg.tag),
    ...(s.messages ?? []).flatMap((m) => (m.templateTag ? [m.templateTag] : [])),
  ]);

const facts: CampaignFacts = {
  pending: [],
  baseRows: 12_000,
  triggers: ["Ипотека", "Новостройки", "Вторичка", "Аренда"],
  channels: ["sms", "email"],
  budget: 50_000,
  analysisMode: "once",
  scenarioName: "Ипотечный интерес",
  editableSteps: ["scenario", "intent", "interests", "analysis", "file", "channels", "budget"],
};

describe("describeWorkflow — теги", () => {
  it("без фактов тегов нет — описание остаётся чистым текстом", () => {
    const tags = allTags(describeWorkflow(graph, templates));
    expect(tags).toHaveLength(0);
  });

  it("число строк базы, каналы, бюджет, режим и сценарий присутствуют тегами", () => {
    const tags = allTags(describeWorkflow(graph, templates, facts));
    const steps = tags
      .filter((t) => t.target.kind === "wizard-step")
      .map((t) => (t.target as { step: string }).step);
    expect(steps).toEqual(
      expect.arrayContaining(["file", "interests", "channels", "budget", "analysis", "scenario"]),
    );
  });

  it("перечисление триггеров — два названных плюс схлопка с формой числительного", () => {
    const tags = allTags(describeWorkflow(graph, templates, facts));
    const collapse = tags.find((t) => t.label.startsWith("ещё "));
    expect(collapse?.label).toBe("ещё 2 триггерам");
    // Схлопка ведёт туда же, куда названные триггеры.
    expect(collapse?.target).toEqual({ kind: "wizard-step", step: "interests" });
    // По наведению — остаток перечисления.
    expect(collapse?.hoverList).toEqual(["Вторичка", "Аренда"]);
  });

  it("три триггера дают форму «ещё 1 триггеру»", () => {
    const tags = allTags(
      describeWorkflow(graph, templates, { ...facts, triggers: ["А", "Б", "В"] }),
    );
    expect(tags.find((t) => t.label.startsWith("ещё "))?.label).toBe("ещё 1 триггеру");
  });

  it("два триггера схлопки не дают", () => {
    const tags = allTags(
      describeWorkflow(graph, templates, { ...facts, triggers: ["А", "Б"] }),
    );
    expect(tags.some((t) => t.label.startsWith("ещё "))).toBe(false);
  });

  it("пустой editableSteps снимает цель со всех шаговых тегов — кампания запущена", () => {
    const tags = allTags(describeWorkflow(graph, templates, { ...facts, editableSteps: [] }));
    expect(tags.some((t) => t.target.kind === "wizard-step")).toBe(false);
    // Значения при этом остаются — теги носители данных, а не только аффорданс.
    expect(tags.some((t) => t.label.includes("50 000"))).toBe(true);
  });

  it("шаг, отсутствующий у этой цели, тега не даёт", () => {
    // Собственная база: шагов «Режим» и «Интересы» в её визарде не существует.
    const tags = allTags(
      describeWorkflow(graph, templates, {
        ...facts,
        analysisMode: undefined,
        editableSteps: ["scenario", "intent", "file", "channels", "budget"],
      }),
    );
    expect(tags.some((t) => t.label === "разовый")).toBe(false);
  });

  it("отсутствующее значение тега не даёт, текст остаётся связным", () => {
    const stages = describeWorkflow(graph, templates, { ...facts, baseRows: undefined });
    const tags = allTags(stages);
    expect(tags.some((t) => t.target.kind === "wizard-step" && t.target.step === "file")).toBe(
      false,
    );
    expect(segmentsText(stages[0].body)).not.toContain("undefined");
    expect(segmentsText(stages[0].body)).not.toMatch(/\s{2}/);
  });

  it("домены на модерации несут тег со всеми доменами и статусами", () => {
    const stages = describeWorkflow(graph, templates, {
      ...facts,
      pending: ["new.example.ru"],
      domains: [
        { domain: "new.example.ru", status: "pending" },
        { domain: "old.example.ru", status: "approved" },
      ],
    });
    const tag = allTags(stages).find((t) => t.target.kind === "domains");
    expect(tag).toBeDefined();
    expect(tag!.label).toBe("new.example.ru");
  });

  it("название шаблона становится тегом с целью на свою ноду", () => {
    const stages = describeWorkflow(graph, templates, facts);
    const message = stages.find((s) => s.id === "first-touch")?.messages?.[0];
    expect(message?.templateTag?.target.kind).toBe("template");
  });

  it("пауза несёт тег с целью node-fields на ноду ожидания", () => {
    const tags = allTags(describeWorkflow(graph, templates, facts));
    const wait = tags.find((t) => t.target.kind === "node-fields");
    expect(wait).toBeDefined();
    expect(wait!.label).toMatch(/дн|час/);
  });

  it("идентификаторы тегов уникальны — годятся как React-ключи", () => {
    const ids = allTags(describeWorkflow(graph, templates, facts)).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

`graph` и `templates` — фикстуры, уже объявленные в этом тестовом файле; посмотреть их фактические имена и подставить. Граф фикстуры обязан содержать коммуникационные ноды и ноду `wait`, иначе тесты шаблона и паузы бессмысленны — если такой фикстуры нет, собрать её тем же способом, что соседние тесты файла.

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- src/state/graph-description.test.ts`
Expected: FAIL — `CampaignFacts` не экспортируется.

- [ ] **Step 3: Объявить типы**

В `src/state/graph-description.ts` заменить временный `DescriptionTag` из Task 3 и `DomainStatuses` на:

```ts
/**
 * Куда ведёт клик по тегу. Единственная цель, уводящая с карточки, — шаг
 * визарда; остальные раскрываются поповером у самой пилюли. `none` — значение
 * без цели: кампания запущена или такого шага в её визарде не существует.
 */
export type TagTarget =
  | { kind: "wizard-step"; step: WizardStepId }
  | { kind: "template"; nodeId: string }
  | { kind: "node-fields"; nodeId: string }
  | { kind: "domains" }
  | { kind: "none" };

/** Значение параметра, вынесенное в кликабельную пилюлю внутри текста. */
export interface DescriptionTag {
  /** Уникален в пределах описания — используется как React-ключ. */
  id: string;
  label: string;
  target: TagTarget;
  /** Раскрывается по наведению: остаток схлопнутого перечисления. */
  hoverList?: string[];
}

/**
 * Факты кампании, которые описание вплетает в текст тегами.
 *
 * `describeWorkflow` остаётся ЧИСТОЙ функцией от графа: состояние она не
 * читает, всё приходит сюда от вызывающего (`CampaignScreen`). Поле `pending`
 * — прежний `DomainStatuses`, сохранено ради обратной совместимости вызова.
 */
export interface CampaignFacts {
  /** Домены на модерации — управляет выводом фразы о модерации. */
  pending: string[];
  /** Все домены триггеров со статусами — содержимое поповера доменов. */
  domains?: { domain: string; status: DomainStatus }[];
  baseRows?: number;
  triggers?: string[];
  channels?: Channel[];
  budget?: number;
  /** Отсутствует у собственной базы — шага «Режим» в её визарде нет. */
  analysisMode?: AnalysisMode;
  scenarioName?: string;
  /**
   * Шаги, на которые тег имеет право увести. Пустой список = кампания
   * запущена: теги рендерятся как носители значений без клика. Это и есть
   * механизм read-only, отдельной ветки рендера не требуется.
   */
  editableSteps?: WizardStepId[];
}
```

Импорты: `WizardStepId` из `@/sections/campaigns/wizard/wizard-steps`, `DomainStatus` из `@/types/account-settings`, `Channel` и `AnalysisMode` из `@/types/campaign`.

Дописать в `DescriptionMessage`:

```ts
  /** Название шаблона как тег — раскрывает поповер выбора шаблона у пилюли. */
  templateTag?: DescriptionTag;
```

- [ ] **Step 4: Собрать теги**

В `graph-description.ts` добавить помощники над `describeWorkflow`:

```ts
/**
 * Сегмент-тег со значением параметра, ведущий на шаг визарда.
 *
 * Если шаг недоступен (кампания запущена — `editableSteps` пуст; либо шага в
 * визарде этой цели нет — например «Режим» у собственной базы), цель
 * становится `none`: пилюля рендерится без клика, но значение показывает.
 * Отдельной ветки read-only-рендера поэтому не требуется.
 */
function stepTag(
  id: string,
  label: string,
  step: WizardStepId,
  editableSteps: WizardStepId[] | undefined,
  hoverList?: string[],
): DescriptionSegment {
  const editable = editableSteps?.includes(step) ?? false;
  return {
    kind: "tag",
    tag: {
      id,
      label,
      target: editable ? { kind: "wizard-step", step } : { kind: "none" },
      ...(hoverList ? { hoverList } : {}),
    },
  };
}
```

Формулировки с тегами (вставляются в существующие тела этапов):

- «Старт»: после `startBody` — фраза о базе, если `baseRows` задан: `t(" В работу идёт ")`, тег `база на 12 000 строк` → шаг `file`, `t(".")`. Число форматировать `toLocaleString("ru-RU")`.
- «Старт»: если заданы `triggers` — фраза о сигналах: два первых названия отдельными тегами → шаг `interests`, затем, если триггеров больше двух, схлопка `ещё N ${pluralRu(N, ["триггеру","триггерам","триггерам"])}` с `hoverList` из остатка.
- «Старт»: `analysisMode` → тег `разовый` / `потоковый` → шаг `analysis`. `scenarioName` → тег со значением → шаг `scenario`.
- «Старт», фраза о модерации: `pendingDomains.join(", ")` заменить тегом с целью `{ kind: "domains" }`.
- «Первое касание»: `channels` → тег с перечислением каналов через `CHANNEL_LABEL` → шаг `channels`.
- «Пауза и повтор»: `waitPhrase(retryParams)` заменить тегом с целью `{ kind: "node-fields", nodeId: retryWaits[0].id }`.
- «Итог»: `budget` → тег `50 000 ₽` → шаг `budget`. Форматирование суммы — существующей `formatRubPlain` из `@/lib/format-rub`.
- `describeMessage` дополнительно возвращает `templateTag` с целью `{ kind: "template", nodeId: node.id }`, когда `templateName` резолвится.

Идентификаторы тегов: `${stageId}-${role}` (`start-base`, `start-trigger-0`, `start-triggers-more`, `first-touch-channels`, `retry-wait`, `outcome-budget`, `msg-${node.id}-template`) — уникальны по построению.

Тег не создаётся, когда значения нет. Текст вокруг собирать вместе с тегом (условная фраза целиком), а не обрамлять дыру — иначе в тексте останутся двойные пробелы, что и проверяет соответствующий тест.

- [ ] **Step 5: Обновить сигнатуру и вызов**

`describeWorkflow(graph, templates, facts?: CampaignFacts)`. Внутри `const pendingDomains = facts?.pending ?? []` — прежнее поведение сохраняется. Переименовать оставшиеся упоминания `domainStatuses` в `facts`. Тип `DomainStatuses` удалить и починить его импорт в `campaign-screen.tsx` (там он передаётся объектным литералом, менять вызов пока не нужно).

- [ ] **Step 6: Прогнать, тайпчекнуть, закоммитить**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

```bash
git add -A
git commit -m "feat(description): теги значений в описании кампании"
```

---

### Task 5: Пилюля-тег — визуал и тултип

**Files:**
- Create: `src/sections/campaigns/description-tag.tsx`
- Create: `src/sections/campaigns/description-tag.test.tsx`
- Modify: `src/sections/campaigns/wizard/campaign-stepper.tsx` (`STEP_ICON`)
- Modify: `src/sections/campaigns/workflow-description.tsx`

**Interfaces:**
- Consumes: `DescriptionTag`, `TagTarget` из Task 4.
- Produces:
  - `export const STEP_ICON: Record<WizardStepId, LucideIcon>` в `campaign-stepper.tsx`
  - `export function DescriptionTagPill({ tag, onActivate }: { tag: DescriptionTag; onActivate?: (tag: DescriptionTag) => void })`
  - `WorkflowDescriptionProps` получает `onTagActivate?: (tag: DescriptionTag) => void`

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sections/campaigns/description-tag.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DescriptionTagPill } from "./description-tag";
import type { DescriptionTag } from "@/state/graph-description";

afterEach(cleanup);

const stepTag: DescriptionTag = {
  id: "start-base",
  label: "база на 12 000 строк",
  target: { kind: "wizard-step", step: "file" },
};

const valueTag: DescriptionTag = {
  id: "start-base",
  label: "база на 12 000 строк",
  target: { kind: "none" },
};

describe("DescriptionTagPill", () => {
  it("тег с целью — кнопка, клик поднимает наверх", () => {
    const onActivate = vi.fn();
    render(<DescriptionTagPill tag={stepTag} onActivate={onActivate} />);
    fireEvent.click(screen.getByRole("button", { name: /база на 12 000 строк/ }));
    expect(onActivate).toHaveBeenCalledWith(stepTag);
  });

  it("тег без цели — не кнопка, но значение показывает", () => {
    render(<DescriptionTagPill tag={valueTag} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/база на 12 000 строк/)).toBeInTheDocument();
  });

  it("схлопка перечисления несёт остаток в title для наведения", () => {
    render(
      <DescriptionTagPill
        tag={{ ...stepTag, label: "ещё 2 триггерам", hoverList: ["Вторичка", "Аренда"] }}
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("title", "Вторичка, Аренда");
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- src/sections/campaigns/description-tag.test.tsx`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Карта иконок шагов**

В `src/sections/campaigns/wizard/campaign-stepper.tsx`, рядом с `STEP_LABELS`:

```tsx
/**
 * Иконка шага для тега-пилюли в описании кампании. Парная `STEP_LABELS`:
 * держим рядом, чтобы новый шаг нельзя было завести с подписью, но без иконки.
 */
export const STEP_ICON: Record<WizardStepId, LucideIcon> = {
  scenario: Route,
  intent: Target,
  interests: Gauge,
  analysis: Repeat,
  file: Database,
  integration: Plug,
  channels: MessageSquare,
  budget: Wallet,
};
```

Импорт: `import { Check, Database, Gauge, MessageSquare, Plug, Repeat, Route, Target, Wallet, type LucideIcon } from "lucide-react";`

- [ ] **Step 4: Написать пилюлю**

Создать `src/sections/campaigns/description-tag.tsx`. Требования к реализации:

- Тег с `target.kind === "none"` рендерится как `<span>`, без тултипа и без клика — это носитель значения у запущенной кампании (§2.12 спеки).
- Остальные — `<button type="button">`, поднимающий `onActivate(tag)`.
- `hoverList`, если задан, кладётся в `title` строкой через `", "`.
- Визуал: `inline-flex items-baseline gap-1 rounded-md border px-1.5 py-0 align-baseline text-[0.95em]`. Иконка — `h-3 w-3 shrink-0 self-center`.
- Цель `wizard-step` — нейтральные `border-border bg-card text-foreground`, иконка из `STEP_ICON[target.step]`.
- Цели `template` и `node-fields` — рамка и цвет из `NODE_STYLES` соответствующей ноды, иконка из `NODE_ICON` (`./node-visuals`). Тип ноды приходит пропом `nodeType?: WorkflowNodeType`, потому что сам тег его не знает; при отсутствии — нейтральный вид.
- Цель `domains` — нейтральный вид с иконкой `Globe`.
- Жёлтый (`--brand`) не используется нигде.
- Тултип «Нажмите для изменения» с задержкой 1 с: обернуть кликабельную пилюлю в `<Tooltip>`/`<TooltipTrigger>`/`<TooltipContent>` из `@/components/ui/tooltip`, а группу тегов — в `<TooltipProvider delay={1000}>` на уровне `WorkflowDescription` (один провайдер на описание, а не по одному на тег).

- [ ] **Step 5: Подключить к рендеру описания**

В `src/sections/campaigns/workflow-description.tsx`:

- Добавить проп `onTagActivate?: (tag: DescriptionTag) => void`.
- Ветка `segment.kind === "tag"` рендерит `<DescriptionTagPill key={segment.tag.id} tag={segment.tag} onActivate={onTagActivate} />`.
- Строку сообщения дополнить: если `message.templateTag` задан, вместо `, шаблон «Имя»` рендерить `, шаблон ` + пилюлю.
- Всё описание обернуть в `<TooltipProvider delay={1000}>`.

- [ ] **Step 6: Прогнать, тайпчекнуть, закоммитить**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

```bash
git add -A
git commit -m "feat(description): пилюля-тег с иконкой шага и тултипом"
```

---

### Task 6: CampaignFacts на карточке и снятие нодо-блоков

Теги впервые появляются на экране. Одновременно снимаются оба нодо-блока — они показывают ровно то, что теперь несёт текст.

**Files:**
- Modify: `src/sections/campaigns/campaign-screen.tsx`
- Modify: `src/sections/campaigns/node-card-content.tsx` (ветка `view.kind === "campaign"`)
- Delete: `src/sections/campaigns/campaign-scenario-node-block.tsx`
- Delete: `src/sections/campaigns/campaign-communication-node-block.tsx`
- Test: `src/sections/campaigns/campaign-screen.test.tsx`

**Interfaces:**
- Consumes: `CampaignFacts` из Task 4, `WorkflowDescription` из Task 5.
- Produces: ничего для последующих тасков, кроме заглушки `handleTagActivate` в `CampaignScreen`, которую Task 11 доводит до диспатча.

- [ ] **Step 1: Написать падающие тесты**

Дописать в `src/sections/campaigns/campaign-screen.test.tsx`:

```tsx
  it("описание черновика несёт теги значений", () => {
    renderCard(draftCampaign);
    expect(screen.getByRole("button", { name: /база на/ })).toBeInTheDocument();
  });

  it("режим анализа выводится из sourceType, а не из снапшота", () => {
    renderCard({ ...draftCampaign, sourceType: "stream", wizardData: undefined });
    expect(screen.getByText("потоковый")).toBeInTheDocument();
  });

  it("у запущенной кампании теги показывают значения, но не кликаются", () => {
    renderCard({ ...draftCampaign, status: "active", wizardData: undefined });
    expect(screen.getByText(/база на/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /база на/ })).toBeNull();
  });

  it("нодо-блоки «Старта» и «Первого касания» с карточки сняты", () => {
    renderCard(draftCampaign);
    expect(screen.queryByText("Скоринг")).toBeNull();
  });
```

`renderCard` и `draftCampaign` — существующие помощники файла; посмотреть фактические имена. Утверждение про «Скоринг» уточнить по реальной подписи, которую рендерил `CampaignScenarioNodeBlock`, — прочитать компонент до удаления.

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- src/sections/campaigns/campaign-screen.test.tsx`
Expected: FAIL — тегов нет, нодо-блоки на месте.

- [ ] **Step 3: Собрать факты**

В `campaign-screen.tsx` заменить формирование `pendingDomains` и вызов `describeWorkflow` на сбор полного `CampaignFacts`:

```tsx
  // Все домены триггеров кампании со статусами — и для фразы о модерации, и
  // для поповера тега: одобренные и отклонённые сегодня не видны нигде, хотя
  // именно они решают итоговый состав аудитории.
  const campaignDomains = campaign
    ? [
        ...new Set(
          Object.values(campaign.triggerConfig ?? {}).flatMap((delta) => delta.added),
        ),
      ].map((domain) => ({
        domain,
        status: resolveDomainStatus(domain, accountSettings.ownDomains),
      }))
    : [];

  // Режим анализа выводится ИЗ sourceType, а не из снапшота: снапшот удаляется
  // при запуске, а тег обязан продолжать нести значение (§2.3 спеки).
  const analysisMode: AnalysisMode | undefined =
    campaign?.sourceType === "stream"
      ? "stream"
      : campaign?.sourceType === "new"
        ? "once"
        : undefined;

  // Пустой список = правка недоступна: запущенная кампания или потерянный
  // снапшот. Тогда шаговые теги рендерятся носителями значений без клика.
  const editableSteps =
    campaign?.status === "draft" && campaign.wizardData
      ? stepsForIntent(campaign.wizardData.intent)
      : [];

  const facts: CampaignFacts = {
    pending: campaignDomains.filter((d) => d.status === "pending").map((d) => d.domain),
    domains: campaignDomains,
    baseRows: campaign ? campaignBaseRows(campaign) : undefined,
    triggers: campaign?.triggers,
    channels: campaign?.channels,
    budget: campaign?.budget,
    analysisMode,
    scenarioName: campaign?.scenario?.name,
    editableSteps,
  };

  const descriptionStages = launchGraph
    ? describeWorkflow(launchGraph, templates, facts)
    : [];
```

- [ ] **Step 4: Снять нодо-блоки**

- Удалить проп `stageSlots` из вызова `WorkflowDescription` целиком (механизм слотов в компоненте остаётся — он ещё пригодится).
- Удалить импорты `CampaignScenarioNodeBlock`, `CampaignCommunicationNodeBlock`, `firstTouchCommunicationNodes` и переменную `firstTouchNodes`.
- Удалить файлы обоих блоков и их тесты, если такие есть.
- В `node-card-content.tsx` в вычислении `campaignId` убрать ветку `state.view.kind === "campaign"` — `ScoringRow` остаётся смонтирован только в карточке узла графа.

`firstTouchCommunicationNodes` из `graph-description.ts` удалять только если после снятия блоков у неё не осталось потребителей — проверить `grep -rn "firstTouchCommunicationNodes" src/`.

- [ ] **Step 5: Добавить заглушку активации тега**

```tsx
  // Теги с целью на шаг визарда уводят в изолированный режим (Task 11).
  // Поповерные цели обрабатываются внутри самой пилюли (Task 7–8).
  function handleTagActivate(tag: DescriptionTag) {
    if (tag.target.kind !== "wizard-step" || !campaignId) return;
    // Диспатч появится в Task 11.
  }
```

и передать `onTagActivate={handleTagActivate}` в `WorkflowDescription`.

- [ ] **Step 6: Прогнать всё**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS. Тесты удалённых блоков удалить вместе с ними.

- [ ] **Step 7: Коммит**

```bash
git add -A
git commit -m "feat(card): теги значений на карточке, нодо-блоки сняты"
```

---

### Task 7: Поповер выбора шаблона

Сегодня триггер и содержимое `NodeTemplateSelect` сросшиеся: триггер сверстан как строка сетки узла (`rowGrid`). Расщепляем, сохраняя публичный API компонента, — карточка узла графа не должна заметить изменения.

**Files:**
- Modify: `src/sections/campaigns/node-template-select.tsx`
- Modify: `src/sections/campaigns/description-tag.tsx`
- Test: `src/sections/campaigns/node-template-select.test.tsx`, `src/sections/campaigns/description-tag.test.tsx`

**Interfaces:**
- Consumes: `DescriptionTagPill` из Task 5.
- Produces:
  - `export function NodeTemplateList({ templates, selectedName, onSelect, onPreview, onCreate }: { templates: MessageTemplate[]; selectedName: string; onSelect: (t: MessageTemplate) => void; onPreview: (templateId: string) => void; onCreate: () => void })` — содержимое поповера, без триггера

- [ ] **Step 1: Вынести содержимое**

В `node-template-select.tsx` вынести всё, что сейчас лежит внутри `<PopoverContent>` (компонент `Command` со списком, разделителем и пунктом «Создать новый шаблон»), в экспортируемый `NodeTemplateList`. `NodeTemplateSelect` продолжает рендерить `<Popover>` с прежним триггером, а внутри `<PopoverContent>` — `<NodeTemplateList …/>`.

Публичный API `NodeTemplateSelect` (`label`, `templates`, `selectedName`, `selectedTemplateId`, `isDirty`, `readOnly`, `onSelect`, `onPreview`, `onCreate`) не меняется.

- [ ] **Step 2: Проверить, что карточка узла графа не сломалась**

Run: `npm test -- src/sections/campaigns/node-template-select.test.tsx`
Expected: PASS без правок теста. Если тест упал — расщепление изменило поведение, чинить реализацию, а не тест.

- [ ] **Step 3: Написать падающий тест на поповер у тега**

Дописать в `description-tag.test.tsx`:

```tsx
  it("тег шаблона раскрывает список шаблонов канала прямо у пилюли", async () => {
    renderPillWithProviders({
      tag: { id: "msg-n1-template", label: "Приветствие", target: { kind: "template", nodeId: "n1" } },
    });
    fireEvent.click(screen.getByRole("button", { name: /Приветствие/ }));
    expect(await screen.findByText("Создать новый шаблон")).toBeInTheDocument();
  });
```

`renderPillWithProviders` — локальный помощник теста, оборачивающий пилюлю в провайдеры состояния и чата, которые нужны списку шаблонов. Посмотреть, как это делают существующие тесты `node-template-select.test.tsx`, и повторить.

- [ ] **Step 4: Подключить поповер к пилюле**

В `description-tag.tsx` для `target.kind === "template"`: пилюля становится `PopoverTrigger`, содержимое — `NodeTemplateList` с шаблонами, отфильтрованными по каналу ноды через `templateOptionsForKind` из `@/state/node-template-options`.

- Выбор шаблона диспатчит `workflow_node_field_set` по ключу params канала — тот же ключ, что использует `NodeTemplateSelect` (`TEMPLATE_MATCH_KEY` в `graph-description.ts`); вынести карту в общий модуль, если она нужна в обоих местах, а не дублировать.
- Превью открывает `TemplatePreviewDrawer` тем же способом, что карточка узла, и поповер НЕ закрывает.
- «Создать новый шаблон» открывает дровер создания для канала ноды и поповер закрывает.

Ноду по `nodeId` брать из кэша графа (`getCachedGraph(campaignId)`); `campaignId` приходит в `DescriptionTagPill` пропом от `WorkflowDescription`, который получает его от `CampaignScreen`.

- [ ] **Step 5: Прогнать, тайпчекнуть, закоммитить**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

```bash
git add -A
git commit -m "feat(card): поповер выбора шаблона у тега названия"
```

---

### Task 8: Поповеры паузы и доменов

**Files:**
- Modify: `src/sections/campaigns/description-tag.tsx`
- Modify: `src/sections/settings/domains-block.tsx` (экспорт `DomainStatusBadge`)
- Test: `src/sections/campaigns/description-tag.test.tsx`

**Interfaces:**
- Consumes: `WaitFields` из `./wait-fields` (без изменений), `DomainStatusBadge`.
- Produces: `export { DomainStatusBadge }` из `domains-block.tsx`.

- [ ] **Step 1: Написать падающие тесты**

```tsx
  it("тег паузы раскрывает поля режима и длительности", async () => {
    renderPillWithProviders({
      tag: { id: "retry-wait", label: "2 дня", target: { kind: "node-fields", nodeId: "n_wait" } },
    });
    fireEvent.click(screen.getByRole("button", { name: /2 дня/ }));
    expect(await screen.findByText("Режим")).toBeInTheDocument();
  });

  it("тег доменов показывает все домены со статусами, включая одобренные и отклонённые", async () => {
    renderPillWithProviders({
      tag: { id: "start-domains", label: "new.example.ru", target: { kind: "domains" } },
      domains: [
        { domain: "new.example.ru", status: "pending" },
        { domain: "ok.example.ru", status: "approved" },
        { domain: "no.example.ru", status: "rejected" },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /new\.example\.ru/ }));
    expect(await screen.findByText("ok.example.ru")).toBeInTheDocument();
    expect(screen.getByText("no.example.ru")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- src/sections/campaigns/description-tag.test.tsx`
Expected: FAIL — поповеры не реализованы.

- [ ] **Step 3: Поповер паузы**

Для `target.kind === "node-fields"`: содержимое поповера — `<WaitFields nodeId={target.nodeId} params={waitParams} readOnly={false} onEventAiHandoff={() => {}} />`. Компонент самодостаточен: диспатчит `workflow_node_field_set` сам. `waitParams` берутся из ноды в кэше графа; если нода не найдена или её `params.kind !== "wait"` — пилюля рендерится без клика.

- [ ] **Step 4: Поповер доменов**

Экспортировать `DomainStatusBadge` из `src/sections/settings/domains-block.tsx` (сменить `function` на `export function`) — формулировки статусов не должны разойтись между реестром и карточкой.

Для `target.kind === "domains"`: содержимое — список `facts.domains` строками «домен + `DomainStatusBadge`». Правок в поповере нет, он информационный. Домены приходят пропом от `WorkflowDescription`.

- [ ] **Step 5: Прогнать, тайпчекнуть, закоммитить**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

```bash
git add -A
git commit -m "feat(card): поповеры паузы и статусов доменов у тегов"
```

---

### Task 9: Инвалидация кэша и мерж графа по каналам

Чистая логика перестройки графа, до подключения к UI. `mergeChannelNodes` — единственная существенно новая логика трека, поэтому тестируется в изоляции.

**Files:**
- Modify: `src/sections/campaigns/workflow-graph-cache.ts`
- Modify: `src/state/workflow-templates.ts`
- Test: `src/sections/campaigns/workflow-graph-cache.test.ts`, `src/state/workflow-templates.test.ts`

**Interfaces:**
- Consumes: `buildChannelBlock`, `CHANNEL_NODE_MAP` из `@/state/channel-nodes`; `CachedGraph` из кэша.
- Produces:
  - `export function invalidateCachedGraph(campaignId: string | undefined): void`
  - `export function mergeChannelNodes(graph: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }, nextChannels: Channel[]): { nodes: WorkflowNode[]; edges: WorkflowEdge[] }`

- [ ] **Step 1: Написать падающие тесты мержа**

Дописать в `src/state/workflow-templates.test.ts`:

```ts
describe("mergeChannelNodes", () => {
  it("снятый канал уходит вместе со своими рёбрами", () => {
    const graph = createTemplate("mortgage", "new", ["sms", "email"]);
    const merged = mergeChannelNodes(graph, ["sms"]);
    expect(merged.nodes.some((n) => n.data.nodeType === "email")).toBe(false);
    const ids = new Set(merged.nodes.map((n) => n.id));
    for (const e of merged.edges) {
      expect(ids.has(e.source), `висячее ребро ${e.source}→${e.target}`).toBe(true);
      expect(ids.has(e.target), `висячее ребро ${e.source}→${e.target}`).toBe(true);
    }
  });

  it("цепочка не рвётся: путь от корня до конца сохраняется", () => {
    const graph = createTemplate("mortgage", "new", ["sms", "email"]);
    const merged = mergeChannelNodes(graph, ["sms"]);
    const hasIncoming = new Set(merged.edges.map((e) => e.target));
    const roots = merged.nodes.filter((n) => !hasIncoming.has(n.id));
    expect(roots).toHaveLength(1);
    // Все ноды достижимы из корня — изолированных кусков не осталось.
    const adjacency = new Map<string, string[]>();
    for (const e of merged.edges) {
      adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);
    }
    const seen = new Set([roots[0].id]);
    const queue = [roots[0].id];
    while (queue.length) {
      for (const next of adjacency.get(queue.shift()!) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    expect(seen.size).toBe(merged.nodes.length);
  });

  it("отредактированные вручную тексты остальных узлов сохраняются", () => {
    const graph = createTemplate("mortgage", "new", ["sms", "email"]);
    const sms = graph.nodes.find((n) => n.data.nodeType === "sms")!;
    sms.data.params = { ...sms.data.params, text: "Правка руками" } as typeof sms.data.params;
    const merged = mergeChannelNodes(graph, ["sms"]);
    const keptSms = merged.nodes.find((n) => n.data.nodeType === "sms")!;
    expect((keptSms.data.params as { text: string }).text).toBe("Правка руками");
  });

  it("новый канал добавляется нодой по умолчанию", () => {
    const graph = createTemplate("mortgage", "new", ["sms"]);
    const merged = mergeChannelNodes(graph, ["sms", "push"]);
    expect(merged.nodes.some((n) => n.data.nodeType === "push")).toBe(true);
  });

  it("задержки и условия остаются нетронутыми", () => {
    const graph = createTemplate("mortgage", "new", ["sms", "email"]);
    const before = graph.nodes.filter((n) =>
      ["wait", "condition", "split"].includes(n.data.nodeType),
    ).length;
    const merged = mergeChannelNodes(graph, ["sms"]);
    const after = merged.nodes.filter((n) =>
      ["wait", "condition", "split"].includes(n.data.nodeType),
    ).length;
    expect(after).toBe(before);
  });

  it("тот же набор каналов граф не меняет", () => {
    const graph = createTemplate("mortgage", "new", ["sms", "email"]);
    const merged = mergeChannelNodes(graph, ["sms", "email"]);
    expect(merged.nodes.map((n) => n.id)).toEqual(graph.nodes.map((n) => n.id));
  });
});
```

`"mortgage"` — подставить фактический `SignalType` из проекта (посмотреть `TEMPLATE_BY_TYPE` в `workflow-templates.ts`).

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- src/state/workflow-templates.test.ts`
Expected: FAIL — `mergeChannelNodes is not a function`.

- [ ] **Step 3: Реализовать мерж**

В `src/state/workflow-templates.ts`:

```ts
/**
 * Мерж графа под новый набор каналов — смена каналов не должна стоить
 * пользователю ручных и ИИ-правок остального графа.
 *
 * Снятые каналы: коммуникационные ноды удаляются, а их входящие рёбра
 * переподключаются на цели исходящих — иначе цепочка порвалась бы и часть
 * графа осталась недостижимой. Новые каналы: добавляются ноды по умолчанию,
 * параллельно уже существующим коммуникациям первого прохода.
 *
 * Задержки, условия, разветвления и отредактированные тексты остальных нод
 * не трогаются вовсе.
 */
export function mergeChannelNodes(
  graph: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
  nextChannels: Channel[],
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } { … }
```

Порядок реализации:

1. Собрать множество типов нод, соответствующих `nextChannels`, через `CHANNEL_NODE_MAP`.
2. Найти удаляемые ноды: коммуникационные (`isCommunicationNode`), чей канал не входит в `nextChannels`.
3. Для каждой удаляемой ноды переподключить рёбра: для всех входящих `(a → x)` и исходящих `(x → b)` создать `(a → b)`, затем удалить все рёбра, инцидентные `x`. Дедуплицировать получившиеся рёбра по паре `source|target`.
4. Найти добавляемые каналы: те из `nextChannels`, для которых коммуникационной ноды нет.
5. Для каждого добавляемого канала создать ноду через `buildChannelBlock([channel])` (или `channelDefaultParams`, если блок избыточен) и подключить её параллельно существующей коммуникационной ноде первого прохода: те же входящие источники и те же исходящие цели. Если коммуникационных нод не осталось вовсе — подключить между последней нодой до коммуникаций и первой после.
6. Позиции новых нод раскладывать по той же сетке, что `buildChannelBlock`, — не оставлять `{x:0,y:0}`, иначе они лягут друг на друга в графе.

- [ ] **Step 4: Добавить инвалидацию кэша**

В `src/sections/campaigns/workflow-graph-cache.ts`:

```ts
/**
 * Выбросить кэшированный граф кампании. Нужен смене сценария: граф там
 * собирается заново из шаблона, и без сброса кэш всегда побеждал бы шаблон
 * (карточка читает `getCachedGraph(...) ?? createTemplate(...)`).
 */
export function invalidateCachedGraph(campaignId: string | undefined): void {
  if (!campaignId) return;
  graphs.delete(campaignId);
  bumpVersion();
}
```

Дописать тест в `workflow-graph-cache.test.ts`: после `setCachedGraph` + `invalidateCachedGraph` чтение возвращает `undefined`, а версия выросла.

- [ ] **Step 5: Прогнать, тайпчекнуть, закоммитить**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

```bash
git add -A
git commit -m "feat(graph): мерж графа по смене каналов и инвалидация кэша"
```

---

### Task 10: Каскад сброса шагов

**Files:**
- Modify: `src/sections/campaigns/wizard/wizard-navigation.ts`
- Modify: `src/sections/campaigns/wizard/campaign-workspace.tsx` (применение сокращённого сброса)
- Test: `src/sections/campaigns/wizard/wizard-navigation.test.ts`

**Interfaces:**
- Consumes: `WizardStepId` из `./wizard-steps`.
- Produces:
  - `export const STEP_INVALIDATES: Partial<Record<WizardStepId, WizardStepId[]>>`
  - `export function invalidatedBy(step: WizardStepId): WizardStepId[]`
  - `export function resetFieldsFor(steps: WizardStepId[]): Partial<StepData>` — значения по умолчанию для обнулённых шагов

- [ ] **Step 1: Написать падающие тесты**

Дописать в `src/sections/campaigns/wizard/wizard-navigation.test.ts`:

```ts
describe("STEP_INVALIDATES", () => {
  it("смена каналов обнуляет бюджет", () => {
    expect(invalidatedBy("channels")).toEqual(["budget"]);
  });

  it("смена базы и режима анализа обнуляет бюджет", () => {
    expect(invalidatedBy("file")).toEqual(["budget"]);
    expect(invalidatedBy("analysis")).toEqual(["budget"]);
  });

  it("смена сценария обнуляет только бюджет — интересы и база от него не зависят", () => {
    expect(invalidatedBy("scenario")).toEqual(["budget"]);
  });

  it("интересы и бюджет не обнуляют ничего", () => {
    expect(invalidatedBy("interests")).toEqual([]);
    expect(invalidatedBy("budget")).toEqual([]);
  });

  it("сброс бюджета возвращает поля шага к значениям по умолчанию", () => {
    expect(resetFieldsFor(["budget"])).toEqual({
      budget: null,
      budgetMode: undefined,
      dailyBudget: undefined,
      maxDailyBudget: undefined,
    });
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- src/sections/campaigns/wizard/wizard-navigation.test.ts`
Expected: FAIL — `invalidatedBy is not a function`.

- [ ] **Step 3: Реализовать карту**

В `wizard-navigation.ts`:

```ts
/**
 * Что обнуляется при смене значения шага.
 *
 * Таблица закрывает и обычный проход визарда, и точечную правку с карточки —
 * иначе два пути неизбежно разъехались бы в том, что считается протухшим.
 *
 * Шаг «Бюджет» пересчитывается по `[scenario, sourceType, channels,
 * fileRowCount]` (см. `step-budget.tsx`) — исчерпывающий список входов,
 * отсюда и состав ключей. «Цель» отсутствует намеренно: она меняет сам
 * СОСТАВ шагов, а не значения, и обрабатывается отдельной веткой полного
 * сброса в `computeStepTransition`.
 */
export const STEP_INVALIDATES: Partial<Record<WizardStepId, WizardStepId[]>> = {
  scenario: ["budget"],
  analysis: ["budget"],
  file: ["budget"],
  channels: ["budget"],
};

export function invalidatedBy(step: WizardStepId): WizardStepId[] {
  return STEP_INVALIDATES[step] ?? [];
}

/** Значения по умолчанию для обнулённых шагов. Автоматического пересчёта нет —
 *  в том числе для рекомендуемой суммы бюджета: шаг проходится заново вручную. */
export function resetFieldsFor(steps: WizardStepId[]): Partial<StepData> {
  const patch: Partial<StepData> = {};
  if (steps.includes("budget")) {
    patch.budget = null;
    patch.budgetMode = undefined;
    patch.dailyBudget = undefined;
    patch.maxDailyBudget = undefined;
  }
  return patch;
}
```

- [ ] **Step 4: Сократить сброс по сценарию в обычном проходе**

В `campaign-workspace.tsx`, ветка `handleNext` с `scenarioChanged`: заменить `setStepData({ ...initialStepData, ...partial })` на сохранение всего, кроме обнулённого каскадом:

```tsx
        if (scenarioChanged) {
          // Сценарий больше НЕ стирает интересы, триггеры, базу и каналы: они
          // от него не зависят (каталог интересов определяется направлением
          // бизнеса аккаунта). Обнуляется только то, что перечислено в
          // STEP_INVALIDATES — бюджет.
          setStepData((prev) => ({
            ...prev,
            ...partial,
            ...resetFieldsFor(invalidatedBy("scenario")),
          }));
        } else {
```

Ветка `intentChanged` (полный сброс ниже цели) сохраняется как есть.

`computeStepTransition` при `scenarioChanged` больше не должна отматывать на `SCENARIO_STEP + 1` со сбросом всего — но её `resetData` теперь означает только «пересобрать граф». Переименовать флаг в `rebuildGraph` и обновить тесты, если это делает смысл яснее; менять `step` не нужно.

- [ ] **Step 5: Прогнать, тайпчекнуть, закоммитить**

Run: `npm test && npx tsc --noEmit && npm run test:e2e -- wizard-buttons`
Expected: PASS. E2E визарда проверяет проход по шагам — сокращение сброса не должно его сломать.

```bash
git add -A
git commit -m "feat(wizard): карта зависимостей шагов и сокращённый сброс по сценарию"
```

---

### Task 11: Вход в визард с карточки

**Files:**
- Modify: `src/state/app-state.ts` (`View`, `ViewAddress`, действие, роутинг)
- Modify: `src/sections/campaigns/campaign-screen.tsx` (диспатч в `handleTagActivate`)
- Modify: `src/sections/campaigns/wizard/guided-campaign-section.tsx`
- Test: `src/state/routing.test.ts`, `src/state/app-state.test.ts`

**Interfaces:**
- Consumes: `WizardStepId`, `Campaign.wizardData` из Task 2.
- Produces:
  - действие `{ type: "campaign_step_edit_requested"; campaignId: string; step: WizardStepId }`
  - `View` ветка `guided-campaign` получает `editing?: { campaignId: string; step: WizardStepId }`
  - `ViewAddress` ветка `guided-campaign` получает `campaignId?: string; step?: WizardStepId`

- [ ] **Step 1: Написать падающие тесты**

Дописать в `src/state/routing.test.ts`:

```ts
  it("правка шага переживает round-trip через адрес", () => {
    const view: View = {
      kind: "guided-campaign",
      editing: { campaignId: "cmp_1", step: "channels" },
    };
    const restored = rebuildViewFromAddress(viewToAddress(view), [draftCampaign]);
    expect(restored).toEqual(view);
  });

  it("исчезнувшая кампания роняет адрес в обычный визард, а не в пустой экран", () => {
    const addr = viewToAddress({
      kind: "guided-campaign",
      editing: { campaignId: "cmp_нет", step: "channels" },
    });
    expect(rebuildViewFromAddress(addr, [])).toEqual({ kind: "guided-campaign" });
  });

  it("кампания без снапшота правку не открывает", () => {
    const addr = viewToAddress({
      kind: "guided-campaign",
      editing: { campaignId: "cmp_1", step: "channels" },
    });
    const launched = { ...draftCampaign, wizardData: undefined };
    expect(rebuildViewFromAddress(addr, [launched])).toEqual({ kind: "guided-campaign" });
  });
```

и в `src/state/app-state.test.ts`:

```ts
  it("campaign_step_edit_requested открывает визард на нужном шаге", () => {
    const next = reducer(stateWithDraft, {
      type: "campaign_step_edit_requested",
      campaignId: "cmp_1",
      step: "interests",
    });
    expect(next.view).toEqual({
      kind: "guided-campaign",
      editing: { campaignId: "cmp_1", step: "interests" },
    });
  });
```

`draftCampaign`/`stateWithDraft` — фикстуры с непустым `wizardData`; собрать их в тестовом файле, если готовых нет.

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- src/state/routing.test.ts src/state/app-state.test.ts`
Expected: FAIL — поле `editing` не существует.

- [ ] **Step 3: Расширить View, ViewAddress и роутинг**

- `View`: `| { kind: "guided-campaign"; initialScenario?: { id: string; name: string }; editing?: { campaignId: string; step: WizardStepId } }`
- `ViewAddress`: та же ветка получает `campaignId?: string; step?: WizardStepId` ДОПОЛНИТЕЛЬНО к существующим `scenarioId`/`scenarioName` — их не трогать.
- `viewToAddress`: прокидывать `campaignId: view.editing?.campaignId, step: view.editing?.step`.
- `rebuildViewFromAddress`: если `addr.campaignId` и `addr.step` заданы, найти кампанию; при наличии её и непустого `wizardData` вернуть `editing`, иначе — обычный `guided-campaign` без `editing`.

- [ ] **Step 4: Добавить действие**

Ветка редьюсера:

```ts
    case "campaign_step_edit_requested":
      return {
        ...state,
        view: {
          kind: "guided-campaign",
          editing: { campaignId: action.campaignId, step: action.step },
        },
        activeSection: null,
      };
```

- [ ] **Step 5: Подключить карточку и секцию**

В `campaign-screen.tsx` довести `handleTagActivate` до диспатча:

```tsx
  function handleTagActivate(tag: DescriptionTag) {
    if (tag.target.kind !== "wizard-step" || !campaignId) return;
    dispatch({
      type: "campaign_step_edit_requested",
      campaignId,
      step: tag.target.step,
    });
  }
```

В `guided-campaign-section.tsx`:

- Прочитать `view.editing`, найти кампанию, взять `wizardData`.
- Гейт анкеты в режиме правки не применять — кампания уже создана.
- Передать в `CampaignWorkspace` новые пропы: `editing={{ campaignId, step }}` и `initialStepDataOverride={campaign.wizardData}`. Сам изолированный режим появится в Task 12 — пока `CampaignWorkspace` их принимает и игнорирует, чтобы дерево оставалось зелёным.

- [ ] **Step 6: Прогнать, тайпчекнуть, закоммитить**

Run: `npm test && npx tsc --noEmit && npm run test:e2e -- view-history`
Expected: PASS. `view-history` проверяет back/forward — новая ветка адреса не должна его сломать.

```bash
git add -A
git commit -m "feat(state): адрес и действие точечной правки шага визарда"
```

---

### Task 12: Изолированный режим визарда

**Files:**
- Modify: `src/sections/campaigns/wizard/campaign-workspace.tsx`
- Modify: `src/sections/campaigns/wizard/steps/step-footer.tsx`
- Modify: `src/types/campaign.ts` (`StepProps.onValueChange`)
- Modify: `src/sections/campaigns/wizard/guided-campaign-section.tsx` (коммит)
- Modify: `src/state/app-state.ts` (действие `campaign_wizard_edit_applied`)
- Test: `src/sections/campaigns/wizard/campaign-workspace.test.tsx` (создать, если нет)

**Interfaces:**
- Consumes: `invalidatedBy`, `resetFieldsFor` из Task 10; `projectStepDataOntoCampaign` из Task 2; `editing` из Task 11.
- Produces:
  - `StepProps.onValueChange?: (partial: Partial<StepData>) => void`
  - `StepFooter` получает `backLabel?: string`
  - действие `{ type: "campaign_wizard_edit_applied"; campaignId: string; stepData: StepData }`

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sections/campaigns/wizard/campaign-workspace.test.tsx`:

```tsx
  it("изолированный режим показывает только запрошенный шаг", () => {
    renderWorkspace({ editing: { campaignId: "cmp_1", step: "channels" }, snapshot });
    expect(screen.getByText("Каналы")).toBeInTheDocument();
    expect(screen.queryByText("Бюджет кампании")).toBeNull();
  });

  it("без правки основная кнопка читается как «Применить и вернуться»", () => {
    renderWorkspace({ editing: { campaignId: "cmp_1", step: "channels" }, snapshot });
    expect(screen.getByRole("button", { name: "Применить и вернуться" })).toBeInTheDocument();
  });

  it("снятие канала обнуляет бюджет, шаг появляется в колонке, кнопка — «Далее»", () => {
    renderWorkspace({ editing: { campaignId: "cmp_1", step: "channels" }, snapshot });
    fireEvent.click(screen.getByRole("checkbox", { name: /Email/ }));
    expect(screen.getByRole("button", { name: "Далее" })).toBeInTheDocument();
  });

  it("слева — «Отмена», а не «Назад»", () => {
    renderWorkspace({ editing: { campaignId: "cmp_1", step: "channels" }, snapshot });
    expect(screen.getByRole("button", { name: "Отмена" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Назад" })).toBeNull();
  });

  it("«Отмена» ничего не применяет", () => {
    const onCommit = vi.fn();
    renderWorkspace({ editing: { campaignId: "cmp_1", step: "channels" }, snapshot, onCommit });
    fireEvent.click(screen.getByRole("checkbox", { name: /Email/ }));
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("коммит один — на последней основной кнопке, а не на каждом «Далее»", () => {
    const onCommit = vi.fn();
    renderWorkspace({ editing: { campaignId: "cmp_1", step: "channels" }, snapshot, onCommit });
    fireEvent.click(screen.getByRole("checkbox", { name: /Email/ }));
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(onCommit).not.toHaveBeenCalled(); // прошли на бюджет — наружу ничего не ушло
    // добить бюджет и нажать «Применить и вернуться» — тогда ровно один вызов
  });
```

Селекторы шагов («Каналы», «Бюджет кампании», чекбокс Email) уточнить по фактической разметке `step-channels.tsx` и `step-budget.tsx`.

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- src/sections/campaigns/wizard/campaign-workspace.test.tsx`
Expected: FAIL — изолированного режима нет.

- [ ] **Step 3: Расширить StepProps и StepFooter**

`src/types/campaign.ts`:

```ts
  /**
   * Живое уведомление о текущем выборе шага — до нажатия основной кнопки.
   * Нужно изолированному режиму правки: он сравнивает выбор со снапшотом и
   * решает, какие шаги обнулились и как читается основная кнопка. Обычный
   * проход визарда коллбек не передаёт.
   */
  onValueChange?: (partial: Partial<StepData>) => void;
```

Каждый шаг, чьё значение может обнулить что-то ниже (`scenario`, `analysis`, `file`, `channels`), вызывает `onValueChange` при изменении своего локального состояния. Остальные шаги трогать не нужно.

`step-footer.tsx` получает `backLabel = "Назад"` и рендерит его вместо константы.

- [ ] **Step 4: Реализовать изолированный режим**

В `campaign-workspace.tsx`:

```tsx
  /** Точечная правка с карточки: колонка начинается с одного шага и дорастает
   *  ровно на те шаги, которые обнулила правка. */
  editing?: { campaignId: string; step: WizardStepId };
  /** Коммит правки — вызывается ОДИН раз, на основной кнопке последнего шага
   *  сессии. Промежуточные «Далее» наружу ничего не пишут: брошенная на
   *  полпути правка не должна оставить черновик с обнулённым бюджетом. */
  onCommit?: (stepData: StepData) => void;
```

Логика:

- `visibleSteps` в режиме правки = индекс запрошенного шага плюс индексы шагов из `pendingResets` (шаги, обнулённые правкой и ещё не пройденные), в порядке `stepsForIntent`.
- `onValueChange` от активного шага сравнивается со снапшотом по полям этого шага. Если значение отличается — `pendingResets = invalidatedBy(stepId)`, иначе пусто.
- `continueLabel` = `pendingResets` не пуст и текущий шаг не последний в колонке → `"Далее"`, иначе `"Применить и вернуться"`.
- Нажатие «Далее»: применить `resetFieldsFor(pendingResets)` к ЛОКАЛЬНОМУ `stepData`, добавить обнулённые шаги в колонку, проскроллить к следующему. Наружу ничего.
- Нажатие «Применить и вернуться»: собрать финальный `stepData` и вызвать `onCommit(stepData)`.
- Нажатие «Отмена»: вызвать `onCancel()` — возврат на карточку без коммита.
- Степпер: показывает полный список шагов, кликабельны только попавшие в колонку.

- [ ] **Step 5: Действие коммита**

В `app-state.ts`:

```ts
    case "campaign_wizard_edit_applied": {
      return {
        ...state,
        campaigns: state.campaigns.map((c) =>
          c.id === action.campaignId
            ? { ...c, ...projectStepDataOntoCampaign(action.stepData) }
            : c,
        ),
        // Финал правки — та же карточка, что и финал визарда.
        view: (() => {
          const c = state.campaigns.find((cc) => cc.id === action.campaignId);
          return c
            ? { kind: "campaign" as const, campaign: { id: c.id, name: c.name } }
            : state.view;
        })(),
      };
    }
```

- [ ] **Step 6: Связать в секции**

В `guided-campaign-section.tsx` передать `onCommit` и `onCancel`:

- `onCommit(stepData)`: если набор каналов изменился — `setCachedGraph(campaignId, mergeChannelNodes(currentGraph, stepData.channels))`; затем `dispatch({ type: "campaign_wizard_edit_applied", campaignId, stepData })`.
- `onCancel()`: `dispatch({ type: "campaign_opened", ... })` или существующее действие возврата на карточку — посмотреть, каким действием карточка открывается из списка, и переиспользовать его.

Перестройка графа при смене сценария — Task 13.

- [ ] **Step 7: Прогнать, тайпчекнуть, закоммитить**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS.

```bash
git add -A
git commit -m "feat(wizard): изолированный режим правки шага с одним коммитом"
```

---

### Task 13: Смена сценария — диалог и пересборка графа

**Files:**
- Modify: `src/sections/campaigns/wizard/steps/step-1-scenario.tsx`
- Modify: `src/sections/campaigns/wizard/guided-campaign-section.tsx`
- Test: `src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx`

**Interfaces:**
- Consumes: `invalidateCachedGraph`, `createTemplate` из Task 9; `onCommit` из Task 12.
- Produces: ничего.

- [ ] **Step 1: Написать падающие тесты**

Дописать в `src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx`:

```tsx
  it("в режиме правки смена сценария сначала спрашивает подтверждение", () => {
    renderStep({ editing: true, data: { ...stepData, scenario: "s1" } });
    fireEvent.click(screen.getByRole("button", { name: /Другой сценарий/ }));
    expect(
      screen.getByText(
        "Смена сценария пересоберёт цепочку кампании. Правки логики, сделанные вручную и через ИИ, будут потеряны.",
      ),
    ).toBeInTheDocument();
  });

  it("подтверждение применяет смену", () => {
    const onNext = vi.fn();
    renderStep({ editing: true, data: { ...stepData, scenario: "s1" }, onNext });
    fireEvent.click(screen.getByRole("button", { name: /Другой сценарий/ }));
    fireEvent.click(screen.getByRole("button", { name: "Сменить сценарий" }));
    expect(onNext).toHaveBeenCalled();
  });

  it("отмена оставляет на шаге и сценарий не меняет", () => {
    const onNext = vi.fn();
    renderStep({ editing: true, data: { ...stepData, scenario: "s1" }, onNext });
    fireEvent.click(screen.getByRole("button", { name: /Другой сценарий/ }));
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onNext).not.toHaveBeenCalled();
  });

  it("клик по уже выбранному сценарию диалога не поднимает", () => {
    renderStep({ editing: true, data: { ...stepData, scenario: "s1" } });
    fireEvent.click(screen.getByRole("button", { name: /Текущий сценарий/ }));
    expect(screen.queryByText(/пересоберёт цепочку/)).toBeNull();
  });

  it("в обычном проходе визарда диалога нет", () => {
    const onNext = vi.fn();
    renderStep({ editing: false, data: stepData, onNext });
    fireEvent.click(screen.getByRole("button", { name: /Другой сценарий/ }));
    expect(onNext).toHaveBeenCalled();
  });
```

Имена сценариев в селекторах подставить фактические из `SCENARIO_NAMES`.

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx`
Expected: FAIL — диалога нет.

- [ ] **Step 3: Реализовать диалог**

`Step1Scenario` получает необязательный проп `editing?: boolean`. При `editing` и клике по сценарию, отличному от `data.scenario`, вместо немедленного `onNext({ scenario: id })` открывается `AlertDialog` (посмотреть, есть ли он в `src/components/ui/`; если нет — использовать `Dialog` в той же роли) с текстами §3 спеки:

- тело: «Смена сценария пересоберёт цепочку кампании. Правки логики, сделанные вручную и через ИИ, будут потеряны.»
- подтверждение: «Сменить сценарий»
- отказ: «Отмена»

Подтверждение вызывает `onNext({ scenario: id })`, отказ закрывает диалог. Шаг остаётся без `StepFooter` — автоприменение сохраняется, диалог его и заменяет.

- [ ] **Step 4: Пересобрать граф при коммите смены сценария**

В `guided-campaign-section.tsx`, внутри `onCommit`, до диспатча:

```tsx
      const scenarioChanged = stepData.scenario !== campaign.wizardData?.scenario;
      if (scenarioChanged) {
        // Полная пересборка: ручные и ИИ-правки структуры теряются — ровно то,
        // о чём предупредил диалог на шаге.
        invalidateCachedGraph(campaign.id);
        const signalType = stepData.scenario
          ? getScenario(stepData.scenario)?.signalType
          : undefined;
        if (signalType) {
          setCachedGraph(
            campaign.id,
            createTemplate(signalType, stepData.sourceType, stepData.channels),
          );
        }
      } else if (channelsChanged) {
        setCachedGraph(campaign.id, mergeChannelNodes(currentGraph, stepData.channels));
      }
```

`channelsChanged` — сравнение `stepData.channels` со снапшотом по значению.

- [ ] **Step 5: Прогнать, тайпчекнуть, закоммитить**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

```bash
git add -A
git commit -m "feat(wizard): подтверждение смены сценария и пересборка графа"
```

---

### Task 14: Сквозная верификация и базлайны

**Files:**
- Modify: снимки в `tests/e2e/*-snapshots/` (перегенерация)

**Interfaces:**
- Consumes: всё предыдущее.
- Produces: зелёный прогон.

- [ ] **Step 1: Полный прогон юнит-тестов**

Run: `npm test`
Expected: PASS целиком.

- [ ] **Step 2: Тайпчек и линт**

Run: `npx tsc --noEmit && npm run lint`
Expected: без ошибок.

- [ ] **Step 3: Паритет сумм**

Run: `npm test -- campaign-cost-parity`
Expected: PASS. Это критерий 23: число касаний и суммы в блоке «Запуск» обязаны совпадать с экраном оплаты после любой правки, затронувшей граф.

- [ ] **Step 4: E2E без визуальных**

Run: `npm run test:e2e`
Expected: PASS. Особое внимание `happy-path`, `wizard-buttons`, `view-history`, `scoring-drawer`.

- [ ] **Step 5: Пройти критерии приёмки руками**

Поднять dev-сервер из этого worktree на свободном порту:

```bash
npm run dev -- -p 3001
```

Пройти по всем 23 критериям §6 спеки. Особенно те, что юнит-тестами не ловятся: тултип через секунду, превью шаблона не закрывает поповер, описание перерисовывается без перезагрузки карточки, ни один тег кроме шаговых не уводит с карточки.

- [ ] **Step 6: Перегенерировать визуальные базлайны**

Карточка кампании меняется радикально: появились теги, исчезли нодо-блоки.

**Ловушка, которая уже срабатывала:** `playwright.config.ts` жёстко задаёт `baseURL: "http://localhost:3000"` и `reuseExistingServer: !process.env.CI`. Если на 3000 висит dev-сервер ОСНОВНОГО чекаута, playwright молча переиспользует его и снимет базлайны с кода без ваших правок. Порт конфигом не параметризуется.

```bash
# 1. Освободить 3000 — в том числе dev-сервер с шага 5, он на 3001.
lsof -ti:3000 | xargs -r kill

# 2. Запускать ИЗ .worktrees/track-card: playwright поднимет `npm run dev`
#    в текущей рабочей директории, то есть в этом worktree.
npm run test:visual:update
```

Перед прогоном проверить, что в `src/app/layout.tsx` нет инжектированного оверлейного `<script>` от инструмента aim — он попадает в снимки и делает базлайны невоспроизводимыми.

После прогона открыть изменившиеся снимки карточки и убедиться глазами, что теги отрисовались пилюлями в потоке текста, а не съехали с базовой линии.

- [ ] **Step 7: Проверить, что правки не утекли в основной чекаут**

Run:
```bash
git -C /Users/macintosh/Documents/work/afina-ai-first_campaing-centric status --short
```
Expected: только `?? docs/afina-frontend-spec.md`. Любой другой изменённый файл — правка утекла мимо worktree, вернуть её на место.

- [ ] **Step 8: Коммит**

```bash
git add -A
git commit -m "test(visual): базлайны карточки с тегами значений"
```

- [ ] **Step 9: Отчитаться**

Сообщить пользователю путь worktree (`.worktrees/track-card`), имя ветки (`feature/track-card`) и список коммитов. Мерж и удаление worktree — решение пользователя, самостоятельно в `main` не мержить.

---

## Self-Review

**Покрытие спеки:**

| Раздел спеки | Таск |
|---|---|
| §2.1 Снапшот на кампании, жизненный цикл | Task 2 |
| §2.2 Сегментная модель, `CampaignFacts`, `editableSteps` | Task 3, Task 4 |
| §2.3 Инвентарь тегов, `analysisMode` из `sourceType` | Task 4, Task 6 |
| §2.4 Визуал тега, `STEP_ICON`, тултип 1 с | Task 5 |
| §2.5 Вход в визард, `View`/`ViewAddress` | Task 11 |
| §2.6 Три поповера | Task 7, Task 8 |
| §2.7 Один коммит, футер, шаг сценария | Task 12, Task 13 |
| §2.8 Каскад сброса | Task 10 |
| §2.9 Перестройка графа, мерж, инвалидация | Task 9, Task 13 |
| §2.10 Снятие нодо-блоков и дровера | Task 6 |
| §2.11 Лёгкая модель файлов | Task 1 |
| §2.12 Поведение после запуска | Task 4 (пустой `editableSteps`), Task 6 (тест) |
| §3 Тексты интерфейса | Task 12 (футер), Task 13 (диалог), Task 5 (тултип) |
| §5 Риски | Task 9 (мерж), Task 14 (базлайны, паритет) |
| §6 Критерии 1–23 | Task 14, шаг 5 — сквозной проход |

Пробелов нет.

**Проверка типов между тасками:** `BaseFile` (Task 1) → `WizardSnapshot` (Task 2) → гидрация (Task 11). `DescriptionSegment`/`segmentsText` (Task 3) → `DescriptionTag`/`TagTarget`/`CampaignFacts` (Task 4) → `DescriptionTagPill` (Task 5) → `onTagActivate` (Task 6, Task 11). `invalidatedBy`/`resetFieldsFor` (Task 10) → изолированный режим (Task 12). `mergeChannelNodes`/`invalidateCachedGraph` (Task 9) → коммит (Task 12) и смена сценария (Task 13). `projectStepDataOntoCampaign` (Task 2) → `campaign_wizard_edit_applied` (Task 12). Имена совпадают везде.

`TagTarget` несёт пять форм, включая `none`. Пилюля (Task 5) обязана обрабатывать `none` как неинтерактивный `<span>` — на этом держится §2.12, поэтому тест «тег без цели — не кнопка» в Task 5 не факультативен.
