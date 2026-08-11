# Карточка компании («финалочка») — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пересобрать карточку кампании в графоподобный редактируемый обзор из 3 блоков (Сигнал → Коммуникации → Итог) с единой механикой правки и контекстными чипами в промпт-баре.

**Architecture:** Меняем чистую функцию `describeWorkflow` (данные) и её рендер (`workflow-description.tsx`) — этапы группируются в 3 блока через новое поле `block`. Экран (`campaign-screen.tsx`) сливает «Запуск» в «Итог». Промпт-бар получает контекст скоринга через существующий механизм чип→scope (правится один баг + добавляется набор подсказок). Всё грунтовано спекой [`2026-08-11-campaign-card-finale-rework-design.md`](../specs/2026-08-11-campaign-card-finale-rework-design.md).

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind v4, Vitest (`*.test.ts(x)`), Testing Library.

**Порядок фаз:** Фаза 1 (промпт-бар) независима и чинит заодно граф — делаем первой. Фазы 2→3 (данные→рендер) связаны. Фаза 4 (деньги/блок①) и 5 (поповеры/чипы) — поверх.

**Проверка после каждой задачи:** `npm run test -- <файл>` зелёный; типы: `npx tsc --noEmit`. НЕ запускать `next dev` (порт занят другим воркти); НИКОГДА не `git stash`.

---

## File Structure

**Изменяемые:**
- `src/state/suggestion-registry/node-context.ts` — добавить `scoring` в CATALOG (наборы подсказок).
- `src/sections/campaigns/node-card-content.tsx` — `ScoringRow.openInterestsDrawer`: ставить чип скоринга вместо снятия.
- `src/state/select-prompt-suggestions.ts` — section-чипы «Интересы/Триггеры» → node-context(scoring, param).
- `src/state/graph-description.ts` — поле `block` у этапов; merge «Проверка+Пауза»; rename «Второе касание»; нарратив конверсии в конец коммуникаций; убрать сценарий/режим/бюджет из настроек скоринга.
- `src/sections/campaigns/workflow-description.tsx` — группировка этапов по `block` с заголовками блоков и вложенностью; коммуникации как текст-история.
- `src/sections/campaigns/campaign-screen.tsx` — «Запуск» → «Итог» (та же таблица денег, денежная подводка); блок ① с баблами База/Интересы/Триггеры и их чипами.
- `src/sections/campaigns/description-tag.tsx` — новый поповер «База»; клики баблов кладут контекст-чипы.

**Затрагиваемые тесты:** `node-context`/registry.test.ts, `select-prompt-suggestions.test.ts`, `node-card-content.test.tsx`, `graph-description.test.ts`, `campaign-screen.test.tsx`, `description-tag.test.tsx`.

---

## Фаза 1 — Промпт-бар: контекст скоринга и подсказки

### Task 1: Набор подсказок скоринга в реестре

**Files:**
- Modify: `src/state/suggestion-registry/node-context.ts` (рядом со `SMS`/`EMAIL`, регистрация в `CATALOG` ~строка 206-213)
- Test: `src/state/suggestion-registry/registry.test.ts`

- [ ] **Step 1: Написать падающий тест**

В `registry.test.ts` добавить:

```ts
import { resolveSuggestions } from "./registry";

describe("scoring node-context", () => {
  it("отдаёт подсказки для целого узла скоринга", () => {
    const items = resolveSuggestions({ kind: "node-context", nodeType: "scoring" });
    expect(items.length).toBeGreaterThan(0);
    expect(items.map((i) => i.label)).toContain("Сузить аудиторию");
  });
  it("отдаёт подсказки для параметра «Триггеры»", () => {
    const items = resolveSuggestions({
      kind: "node-context", nodeType: "scoring", paramLabel: "Триггеры",
    });
    expect(items.some((i) => i.action.kind === "submit")).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — тест падает**

Run: `npm run test -- src/state/suggestion-registry/registry.test.ts`
Expected: FAIL (scoring резолвится в GENERIC, «Сузить аудиторию» нет).

- [ ] **Step 3: Реализация — добавить `SCORING` и зарегистрировать**

В `node-context.ts` перед объявлением `CATALOG` добавить (используя существующие `ask`, `howNode`, `WHOLE_NODE_KEY`):

```ts
const SCORING: ParamSuggestions = {
  [WHOLE_NODE_KEY]: [
    howNode("scoring-how", "Объясни простыми словами, как работает скоринг базы: что он делает и как отбирает аудиторию."),
    ask("scoring-narrow", "Сузить аудиторию", "Сделай отбор строже — оставь только самых горячих."),
    ask("scoring-widen", "Расширить охват", "Ослабь отбор — добавь тёплую аудиторию."),
  ],
  "База": [
    ask("scoring-base-reupload", "Перезалить базу", "Хочу заменить загруженную базу на другую."),
    ask("scoring-base-add", "Добавить базу", "Добавь ещё один файл базы к текущим."),
    ask("scoring-base-quality", "Оценить базу", "Оцени качество и размер загруженной базы."),
  ],
  "Интересы": [
    ask("scoring-int-narrow", "Сузить интересы", "Убери лишние интересы, оставь ключевые."),
    ask("scoring-int-widen", "Добавить интересы", "Предложи ещё релевантные интересы."),
  ],
  "Триггеры": [
    { id: "scoring-trg-domains", label: "Проверить домены",
      action: { kind: "submit", phrase: "проверить доступность доменов" } },
    ask("scoring-trg-add", "Добавить триггер", "Добавь триггер по конкретному домену."),
  ],
};
```

В объекте `CATALOG` добавить строку `scoring: SCORING,`.

- [ ] **Step 4: Запустить — тест зелёный**

Run: `npm run test -- src/state/suggestion-registry/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/suggestion-registry/node-context.ts src/state/suggestion-registry/registry.test.ts
git commit -m "feat(promptbar): scoring node-context suggestions"
```

### Task 2: Section-чипы «Интересы/Триггеры» → node-context(scoring), а не hidden

**Files:**
- Modify: `src/state/select-prompt-suggestions.ts` (правило 2, ветка `if (ctx.activeTag)`, обработка `kind === "section"`)
- Test: `src/state/select-prompt-suggestions.test.ts`

- [ ] **Step 1: Падающий тест**

```ts
it("section-чип «Триггеры» даёт scoring-подсказки, а не hidden", () => {
  const res = selectPromptSuggestions(baseState, {
    activeTag: { id: "section_triggers", kind: "section", label: "Триггеры",
      payload: { section: "triggers", scoringNodeId: "sc1" }, removable: true },
    hasTypedText: false, queueLength: 0, welcomeChips: [],
  });
  expect(res.kind).toBe("items");
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npm run test -- src/state/select-prompt-suggestions.test.ts`
Expected: FAIL (сейчас section → `{ kind: "hidden" }`).

- [ ] **Step 3: Реализация**

В `select-prompt-suggestions.ts`, внутри `if (ctx.activeTag)`, ПЕРЕД финальным `return { kind: "hidden" }` для прочих section-тегов, добавить:

```ts
// Section-чипы интересов/триггеров скоринга — контекст ноды скоринга,
// а не «спрятать»: подсказки должны меняться под баром (spec §8).
if (ctx.activeTag.kind === "section") {
  const p = ctx.activeTag.payload as { section?: string } | null;
  const paramLabel =
    p?.section === "interests" ? "Интересы"
    : p?.section === "triggers" ? "Триггеры"
    : undefined;
  if (paramLabel) {
    return resolved({ kind: "node-context", nodeType: "scoring", paramLabel });
  }
}
```

- [ ] **Step 4: Зелёный**

Run: `npm run test -- src/state/select-prompt-suggestions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/select-prompt-suggestions.ts src/state/select-prompt-suggestions.test.ts
git commit -m "feat(promptbar): section chips resolve to scoring node-context"
```

### Task 3: Фикс графа — при открытии боковика ставить чип скоринга (не снимать)

**Files:**
- Modify: `src/sections/campaigns/node-card-content.tsx` (`ScoringRow`, `openInterestsDrawer` ~строка 178-182; импорт `NODE_STYLES` из `./node-visuals`; взять `pushChip` из `usePromptChips`)
- Test: `src/sections/campaigns/node-card-content.test.tsx`

- [ ] **Step 1: Падающий тест**

В `node-card-content.test.tsx` (сценарий scoring-ноды) — при клике по иконке ИИ «Интересы и триггеры» ожидать чип `node_<id>` в баре:

```ts
it("открытие боковика скоринга кладёт чип скоринга в бар", async () => {
  const { pushed } = renderScoringRow({ nodeId: "sc1" });
  await user.click(screen.getByLabelText(/интересы и триггеры/i));
  expect(pushed).toContainEqual(
    expect.objectContaining({ id: "node_sc1", kind: "node" })
  );
});
```

(Использовать существующий в файле мок `usePromptChips`; если он мокает только `removeChip`, добавить в мок `pushChip: (c) => pushed.push(c)`.)

- [ ] **Step 2: Запустить — падает**

Run: `npm run test -- src/sections/campaigns/node-card-content.test.tsx`
Expected: FAIL (сейчас вызывается `removeChip`, а не `pushChip`).

- [ ] **Step 3: Реализация**

Импорт вверху файла: `import { NODE_STYLES } from "./node-visuals";`
В деструктуризации `usePromptChips()` (строка 162) добавить `pushChip`: `const { removeChip, pushChip } = usePromptChips();`
Заменить тело `openInterestsDrawer`:

```ts
function openInterestsDrawer() {
  if (!campaignId) return;
  // spec §8: боковик скоринга ДОЛЖЕН нести контекст в бар (иначе ИИ отвечает
  // «нет такой ноды»). Ставим whole-node чип скоринга (раньше он тут снимался).
  pushChip({
    id: `node_${nodeId}`,
    kind: "node",
    label: "Скоринг",
    payload: {
      nodeId,
      nodeType: "scoring",
      color: NODE_STYLES.scoring.color,
    },
    removable: true,
  });
  chat.openScoringDrawer({ nodeId, campaignId, editable });
}
```

- [ ] **Step 4: Зелёный**

Run: `npm run test -- src/sections/campaigns/node-card-content.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/campaigns/node-card-content.tsx src/sections/campaigns/node-card-content.test.tsx
git commit -m "fix(graph): scoring drawer pushes scoring context chip to prompt bar"
```

---

## Фаза 2 — `describeWorkflow`: 3 блока и правки этапов

### Task 4: Поле `block` у этапов описания

**Files:**
- Modify: `src/state/graph-description.ts` (тип `DescriptionStage`; проставить `block` каждому `stages.push(...)`)
- Test: `src/state/graph-description.test.ts`

- [ ] **Step 1: Падающий тест**

```ts
it("каждый этап несёт block: signal | communication | outcome", () => {
  const stages = describeWorkflow(graph, templates, facts);
  expect(stages.find((s) => s.id === "start")?.block).toBe("signal");
  expect(stages.find((s) => s.kind === "touch")?.block).toBe("communication");
  expect(stages.find((s) => s.id === "outcome")?.block).toBe("outcome");
});
```

- [ ] **Step 2: Падает**

Run: `npm run test -- src/state/graph-description.test.ts`
Expected: FAIL (`block` не существует).

- [ ] **Step 3: Реализация**

В `graph-description.ts` в интерфейс `DescriptionStage` добавить:

```ts
/** Верхнеуровневый блок карточки, куда попадает этап. */
block: "signal" | "communication" | "outcome";
```

Проставить при создании этапов:
- этап `start` (скоринг/загрузка базы): `block: "signal"`.
- все волновые этапы (`touch`/`fork`), `check`, `retry`: `block: "communication"`.
- этап `outcome`: `block: "outcome"`.

(Добавить `block: "..."` в каждый литерал `stages.push({ ... })`.)

- [ ] **Step 4: Зелёный**

Run: `npm run test -- src/state/graph-description.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/graph-description.ts src/state/graph-description.test.ts
git commit -m "feat(description): tag stages with top-level block"
```

### Task 5: Merge «Проверка реакции» + «Пауза»; rename «Второе касание»

**Files:**
- Modify: `src/state/graph-description.ts` (ветка `step.kind === "check"`; заголовки касаний `TOUCH_HEADING`; заголовок retry-этапа «Пауза и повтор»)
- Test: `src/state/graph-description.test.ts`

- [ ] **Step 1: Падающий тест**

```ts
it("объединяет проверку реакции и паузу в один шаг перед вторым касанием", () => {
  const stages = describeWorkflow(retryGraph, templates, facts);
  const headings = stages.map((s) => s.heading);
  expect(headings).toContain("Проверка реакции и пауза");
  expect(headings).not.toContain("Пауза и повтор");
  expect(headings).toContain("Второе касание");
});
```

- [ ] **Step 2: Падает**

Run: `npm run test -- src/state/graph-description.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализация**

1. `TOUCH_HEADING` → `["Первое касание", "Второе касание", "Третье касание", "Четвёртое касание"]` (было «Повторное касание»).
2. Ветка `check` (`heading: "Проверка реакции"`, body «кто отреагировал…») — объединить с паузой: этап `retry`/повтор больше не рисует отдельный «Пауза и повтор». Вместо этого этап проверки становится «Проверка реакции и пауза» с телом, включающим паузу и подводку ко второму касанию:

```ts
// Проверка реакции + пауза одним шагом (spec §5).
stages.push({
  id: `check-${checkOrdinal}`,
  kind: "check",
  block: "communication",
  heading: "Проверка реакции и пауза",
  body: mergeTextSegments(
    waitTagForNextRetry
      ? [
          t(multiChannel
            ? "Кто отреагировал по любому каналу — уходит в успех и покидает кампанию. Остальным выдерживаем паузу "
            : "Кто отреагировал — уходит в успех и покидает кампанию. Остальным выдерживаем паузу "),
          ...valueSegments(hasFacts, waitTagForNextRetry),
          t(" и делаем второе касание."),
        ]
      : [t("Кто отреагировал — уходит в успех и покидает кампанию. Остальным делаем второе касание.")],
  ),
});
```

3. Волна-повтор (`wave.repeatsPrevious`) больше НЕ создаёт этап `heading: "Пауза и повтор"` — она рендерится как обычное касание через `touchHeading(touchOrdinal)` («Второе касание»), а её `waitBefore` уже озвучен в шаге проверки+паузы выше. (Убрать/упростить ветку `if (wave.repeatsPrevious)`, оставив нумерацию касаний; паузу из тела повтора убрать — она в шаге проверки.)

_Примечание для исполнителя:_ извлечь `waitTagForNextRetry` — это `waitTag` СЛЕДУЮЩЕЙ волны-повтора; проще собрать список волн заранее и в шаге `check` заглянуть на ближайшую последующую `repeatsPrevious`-волну за её `waitBefore`. Если пауза не резолвится — ветка без пилюли (см. код выше).

- [ ] **Step 4: Зелёный + smoke прочих тестов описания**

Run: `npm run test -- src/state/graph-description.test.ts`
Expected: PASS. Обновить существующие ассерты, где ждали «Пауза и повтор»/«Повторное касание».

- [ ] **Step 5: Commit**

```bash
git add src/state/graph-description.ts src/state/graph-description.test.ts
git commit -m "feat(description): merge reaction-check with pause; rename to Второе касание"
```

### Task 6: Нарратив конверсии — в конец «Коммуникаций»; «Итог»-этап без текста конверсии

**Files:**
- Modify: `src/state/graph-description.ts` (этап `outcome`; добавить закрывающий этап коммуникаций)
- Test: `src/state/graph-description.test.ts`

- [ ] **Step 1: Падающий тест**

```ts
it("нарратив конверсии закрывает блок коммуникаций, а не блок outcome", () => {
  const stages = describeWorkflow(retryGraph, templates, facts);
  const commClose = stages.filter((s) => s.block === "communication").at(-1);
  expect(segmentsText(commClose!.body)).toMatch(/завершают путь без конверсии/);
  const outcome = stages.find((s) => s.block === "outcome");
  expect(segmentsText(outcome!.body)).not.toMatch(/без конверсии/);
});
```

- [ ] **Step 2: Падает**

Run: `npm run test -- src/state/graph-description.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализация**

Текст конверсии («Отреагировавшие — в успех, остальные завершают путь без конверсии») переносится: добавить его как последний `block: "communication"` этап (id `comm-outcome`, `kind: "check"`, без groups) ПОСЛЕ волн, ТОЛЬКО если `waveOrdinal > 0`. Существующий этап `outcome` (`block: "outcome"`) больше НЕ несёт конверсионный текст — его body становится денежной подводкой (или пустым, т.к. деньги рендерит экран, см. Фаза 4). Минимально: оставить `outcome` как якорь блока с пустым body или короткой строкой «Итог» — фактические деньги придут из `campaign-screen`.

_Решение:_ `outcome`-этап описания оставляем существовать (несёт `heading: "Итог"`, `block: "outcome"`, `body: []`) — он служит якорем блока; денежная таблица и подводка живут в `campaign-screen` (Фаза 4), не в описании.

- [ ] **Step 4: Зелёный**

Run: `npm run test -- src/state/graph-description.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/graph-description.ts src/state/graph-description.test.ts
git commit -m "feat(description): conversion narrative closes communications block"
```

### Task 7: Убрать сценарий/режим/бюджет из настроек скоринга

**Files:**
- Modify: `src/state/graph-description.ts` (сборка `settings` в этапе `start` — убрать `start-scenario`, `start-mode`, `start-budget`)
- Test: `src/state/graph-description.test.ts`

- [ ] **Step 1: Падающий тест**

```ts
it("настройки скоринга не содержат сценарий/режим/бюджет", () => {
  const stages = describeWorkflow(graph, templates, facts);
  const start = stages.find((s) => s.id === "start")!;
  const ids = (start.settings ?? []).map((s) => s.id);
  expect(ids).not.toContain("start-scenario");
  expect(ids).not.toContain("start-mode");
  expect(ids).not.toContain("start-budget");
  expect(ids).toContain("start-triggers"); // входы остаются
});
```

- [ ] **Step 2: Падает**

Run: `npm run test -- src/state/graph-description.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализация**

В `describeWorkflow` удалить блоки `settings.push({ id: "start-scenario" ... })`, `settings.push({ id: "start-mode" ... })` и `settings.push({ id: "start-budget" ... })`. Оставить `start-base` и `start-triggers`. (Сценарий/режим — идентификатор в шапке карточки, рендерится `campaign-screen`, не описанием.)

- [ ] **Step 4: Зелёный**

Run: `npm run test -- src/state/graph-description.test.ts`
Expected: PASS. Поправить/удалить тесты, ждавшие эти настройки.

- [ ] **Step 5: Commit**

```bash
git add src/state/graph-description.ts src/state/graph-description.test.ts
git commit -m "feat(description): drop scenario/mode/budget from scoring settings"
```

---

## Фаза 3 — Рендер: 3 блока с вложенностью и текст-история коммуникаций

### Task 8: Группировка этапов по `block` с заголовками блоков

**Files:**
- Modify: `src/sections/campaigns/workflow-description.tsx` (обход `stages` → группировка по `stage.block`)
- Test: `src/sections/campaigns/workflow-description.test.tsx` (создать, если нет)

- [ ] **Step 1: Падающий тест**

```tsx
it("рендерит три заголовка блоков: Сигнал, Коммуникации, Итог", () => {
  render(<WorkflowDescription stages={threeBlockStages} />);
  expect(screen.getByText("Сигнал (Скоринг)")).toBeInTheDocument();
  expect(screen.getByText("Коммуникации")).toBeInTheDocument();
  expect(screen.getByText("Итог")).toBeInTheDocument();
});
```

- [ ] **Step 2: Падает**

Run: `npm run test -- src/sections/campaigns/workflow-description.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Реализация**

Ввести карту заголовков блоков и сгруппировать `stages` по `block` перед рендером `<ol>`:

```tsx
const BLOCK_LABEL: Record<"signal" | "communication" | "outcome", string> = {
  signal: "Сигнал (Скоринг)",
  communication: "Коммуникации",
  outcome: "Итог",
};
const BLOCK_ORDER = ["signal", "communication", "outcome"] as const;
```

Рендерить по порядку блоков: для каждого блока — заголовок `<h3>{BLOCK_LABEL[block]}</h3>`, затем этапы этого блока (существующий рендер `<li>` внутри, но нумерация/рельс — уже внутри блока). Этапы блока `communication` рендерятся как вложенные под-шаги (существующий вид `stage.heading` + body + groups), под заголовком «Коммуникации».

_Замечание:_ существующий таймлайн-рельс/номера этапов оставить внутри блока; заголовок этапа `start` («Скоринг базы») теперь дублирует заголовок блока «Сигнал (Скоринг)» — для блока `signal` (один этап) скрыть внутренний `stage.heading`, показать только заголовок блока.

- [ ] **Step 4: Зелёный**

Run: `npm run test -- src/sections/campaigns/workflow-description.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/campaigns/workflow-description.tsx src/sections/campaigns/workflow-description.test.tsx
git commit -m "feat(card): group description stages into three blocks"
```

### Task 9: Коммуникации — текст-история вместо таблицы

**Files:**
- Modify: `src/sections/campaigns/workflow-description.tsx` (рендер `stage.groups` для блока `communication`)
- Test: `src/sections/campaigns/workflow-description.test.tsx`

- [ ] **Step 1: Падающий тест**

```tsx
it("шаг касания показывает канал и шаблон-бабл без таблицы", () => {
  render(<WorkflowDescription stages={touchStages} nodeTypes={nodeTypes} />);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.getByText("Push")).toBeInTheDocument();
  // шаблон-бабл — пилюля
  expect(screen.getByText("Push — возвращение")).toBeInTheDocument();
});
```

- [ ] **Step 2: Падает**

Run: `npm run test -- src/sections/campaigns/workflow-description.test.tsx`
Expected: FAIL (сейчас рендерится `<table>`).

- [ ] **Step 3: Реализация**

Для блока `communication` заменить рендер `group.rows` из `<table>` на строчную текст-историю: на каждую строку — `канал` (текст) + `templateTag` через `<DescriptionTagPill>`. Кнопка предпросмотра остаётся (`PreviewButton`) рядом с баблом (та же логика `openTemplatePreview`). Убрать колонки «Контент шаблона»/шапку/`<colgroup>`. ◈-подписи групп (`group.label`) оставить как подзаголовки веток.

```tsx
{group.rows.map((row) => (
  <div key={row.nodeId} className="flex items-center gap-2 py-1 text-sm">
    <span className="font-medium">{row.channel}</span>
    {row.templateTag && (
      <DescriptionTagPill tag={row.templateTag} onActivate={onTagActivate}
        nodeType={nodeTypeForTag(row.templateTag, nodeTypes)} />
    )}
    <PreviewButton row={row} nodeParams={nodeParams}
      stageHeading={stage.heading}
      stageId={ambiguousHeadings.has(stage.heading) ? stage.id : undefined}
      groupLabel={group.label} rowLabel={distinctions.get(row.nodeId)} />
  </div>
))}
```

- [ ] **Step 4: Зелёный**

Run: `npm run test -- src/sections/campaigns/workflow-description.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/campaigns/workflow-description.tsx src/sections/campaigns/workflow-description.test.tsx
git commit -m "feat(card): render communications as text-story with template bubbles"
```

---

## Фаза 4 — Экран: «Итог» = «Запуск», блок ① и чипы

### Task 10: «Запуск» → «Итог» (та же таблица денег, денежная подводка)

**Files:**
- Modify: `src/sections/campaigns/campaign-screen.tsx` (секция `showLaunch` / «Запуск»: заголовок `label="Итог"`, добавить строку подводки; таблицу `BudgetBreakdown` НЕ менять)
- Test: `src/sections/campaigns/campaign-screen.test.tsx`

- [ ] **Step 1: Падающий тест**

```tsx
it("блок денег называется «Итог» и несёт денежную подводку", () => {
  seedDraftCampaignWithComms();
  render(<CampaignScreen />);
  expect(screen.getByText("Итог")).toBeInTheDocument();
  expect(screen.getByText(/списывается во время запуска/i)).toBeInTheDocument();
  expect(screen.getByText("К оплате")).toBeInTheDocument();
});
```

- [ ] **Step 2: Падает**

Run: `npm run test -- src/sections/campaigns/campaign-screen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Реализация**

В `CampaignScreen`, в ветке `showLaunch` (draft) заменить `<CardSection label="Запуск">` на `label="Итог"`, добавить перед `BudgetBreakdown` строку:

```tsx
<p className="text-sm text-muted-foreground">
  За что платите: скоринг базы и коммуникации. Списывается во время запуска.
</p>
```

`BudgetBreakdown` и расчёты (`draftPaymentSplit`, `draftCommGroups`) оставить БЕЗ изменений (spec §6 — таблица один в один). Прогноз касаний оставить.

- [ ] **Step 4: Зелёный**

Run: `npm run test -- src/sections/campaigns/campaign-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/campaigns/campaign-screen.tsx src/sections/campaigns/campaign-screen.test.tsx
git commit -m "feat(card): rename Запуск block to Итог with payment lead-in"
```

### Task 11: Блок ① — баблы База/Интересы/Триггеры кладут контекст-чипы

**Files:**
- Modify: `src/sections/campaigns/campaign-screen.tsx` (обработчик клика тега → `pushChip` контекста скоринга по paramLabel; проброс в `WorkflowDescription`)
- Test: `src/sections/campaigns/campaign-screen.test.tsx`

- [ ] **Step 1: Падающий тест**

```tsx
it("клик по баблу «Триггеры» кладёт scoring-чип с paramLabel Триггеры", async () => {
  const pushed = seedAndSpyChips();
  seedDraftSignalCampaign();
  render(<CampaignScreen />);
  await user.click(screen.getByText(/Триггеры/));
  expect(pushed).toContainEqual(expect.objectContaining({
    kind: "node",
    payload: expect.objectContaining({ nodeType: "scoring", paramLabel: "Триггеры" }),
  }));
});
```

- [ ] **Step 2: Падает**

Run: `npm run test -- src/sections/campaigns/campaign-screen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Реализация**

Расширить `handleTagActivate` в `CampaignScreen`: для тегов входов скоринга (цель ведёт на шаги `file`/`interests`) — вместо/вместе с навигацией класть чип контекста скоринга:

```tsx
const scoringNodeId = launchGraph?.nodes.find((n) => n.data.nodeType === "scoring")?.id;
function pushScoringContext(paramLabel: "База" | "Интересы" | "Триггеры") {
  if (!scoringNodeId) return;
  pushChip({
    id: `nodefield_${scoringNodeId}_${paramLabel}`,
    kind: "node",
    label: paramLabel,
    payload: { nodeId: scoringNodeId, nodeType: "scoring",
      color: NODE_STYLES.scoring.color, paramLabel },
    removable: true,
  });
}
```

Вызывать `pushScoringContext("Триггеры"/"Интересы"/"База")` в `handleTagActivate` по цели тега (сопоставление шаг→paramLabel: `interests`→«Триггеры» для триггеров и «Интересы» для интересов; `file`→«База»). Импортировать `NODE_STYLES`.

- [ ] **Step 4: Зелёный**

Run: `npm run test -- src/sections/campaigns/campaign-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/campaigns/campaign-screen.tsx src/sections/campaigns/campaign-screen.test.tsx
git commit -m "feat(card): block-1 bubbles push scoring context chips"
```

---

## Фаза 5 — Поповер «База»

### Task 12: Поповер выбора/добавления/удаления базы у бабла «База»

**Files:**
- Modify: `src/sections/campaigns/description-tag.tsx` (новый `BaseFilesTagPopover` по образцу `TemplateTagPopover`/`TagPopoverShell`)
- Test: `src/sections/campaigns/description-tag.test.tsx`

- [ ] **Step 1: Падающий тест**

```tsx
it("поповер базы: список файлов, добавить, удалить (если не единственный)", async () => {
  renderBasePill({ files: [{ name: "a.csv", rowCount: 12000 }, { name: "b.xlsx", rowCount: 3400 }] });
  await user.click(screen.getByText(/Выбрать базу/));
  expect(screen.getByText("a.csv")).toBeInTheDocument();
  expect(screen.getByText("Добавить файл")).toBeInTheDocument();
  expect(screen.getAllByLabelText(/Удалить файл/)).toHaveLength(2); // >1 → можно удалять
});

it("единственный файл удалить нельзя", async () => {
  renderBasePill({ files: [{ name: "a.csv", rowCount: 12000 }] });
  await user.click(screen.getByText(/Выбрать базу/));
  expect(screen.queryByLabelText(/Удалить файл/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Падает**

Run: `npm run test -- src/sections/campaigns/description-tag.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Реализация**

Добавить `BaseFilesTagPopover` в `description-tag.tsx` через существующий `TagPopoverShell`. Содержимое — список `campaign.files` (имя + `~N строк`), кнопка «Добавить файл» (скрытый `<input type="file" accept=".csv,.xlsx,.txt">` → `campaign_file_added`), крестик удаления у каждого файла ТОЛЬКО при `files.length > 1` → `campaign_file_removed` по индексу. Диспатчить через `useAppDispatch` (как `TemplateTagPopover` диспатчит `workflow_node_field_set`). Роутинг цели: для тега базы (paramLabel/target «База») в `DescriptionTagPill` открывать `BaseFilesTagPopover` вместо навигации (по образцу ветки `template`).

```tsx
function BaseFilesTagPopover({ campaignId, files, className, style, hint, children }: {
  campaignId: string; files: { name: string; rowCount: number }[];
  className: string; style?: CSSProperties; hint?: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const dispatch = useAppDispatch();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <TagPopoverShell open={open} onOpenChange={setOpen} className={className}
      style={style} hint={hint} contentClassName="w-72 p-2"
      content={
        <div className="flex flex-col gap-1.5">
          {files.map((f, i) => (
            <div key={`${f.name}_${i}`} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
              <span className="truncate text-xs text-foreground">{f.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">~{f.rowCount.toLocaleString("ru-RU")} строк</span>
              {files.length > 1 && (
                <button type="button" aria-label={`Удалить файл: ${f.name}`}
                  onClick={() => dispatch({ type: "campaign_file_removed", campaignId, index: i })}>✕</button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => inputRef.current?.click()}
            className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground">
            + Добавить файл
          </button>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.txt" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) dispatch({ type: "campaign_file_added", campaignId, file: { name: f.name, rowCount: 1000 } }); }} />
        </div>
      }
    >
      {children}
    </TagPopoverShell>
  );
}
```

_(Число строк при добавлении — детерминированная заглушка, как в `ScoringRow.scoringFileRowCount`; переиспользовать при интеграции.)_

- [ ] **Step 4: Зелёный**

Run: `npm run test -- src/sections/campaigns/description-tag.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/campaigns/description-tag.tsx src/sections/campaigns/description-tag.test.tsx
git commit -m "feat(card): base files popover (list/add/remove) on База bubble"
```

---

## Финальная проверка

- [ ] **Прогон всего пакета:** `npm run test`
- [ ] **Типы:** `npx tsc --noEmit`
- [ ] **Визуальная сверка** (по правилу проекта — реальные скриншоты): открыть карточку сигнальной и базовой кампании (draft), проверить 3 блока, боковик/поповеры, «Итог», подсказки под баром при кликах баблов.

---

## Self-review (заполнено автором плана)

**Покрытие спеки:** §3 (3 блока) → T4/T8; §4 (входы, сценарий/режим вне блока) → T7/T11; база-поповер → T12; §5 (merge, rename, нарратив, текст-история) → T5/T6/T9; §6 (Итог = Запуск, подводка, без стоимости касания) → T10; §8 (чипы/подсказки, scoring-фикс, section→scoring) → T1/T2/T3/T11. §7 жесты — поповеры сохранены (T9 предпросмотр, T12 база). §10 (сложные коммуникации) — отложено, не в задачах (осознанно).

**Плейсхолдеры:** код приведён для каждого шага; T5 содержит примечание об извлечении `waitTagForNextRetry` — это указание по реализации, не плейсхолдер.

**Согласованность типов:** `block: "signal"|"communication"|"outcome"` — един в T4/T6/T8; `NodeTagPayload {nodeId, nodeType, color, paramLabel?}` — един в T3/T11; chip id `node_<id>` (whole) и `nodefield_<id>_<param>` — по конвенции `prompt-chips-context.tsx`.
