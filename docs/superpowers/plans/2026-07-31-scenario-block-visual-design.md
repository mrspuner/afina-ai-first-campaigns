# Визуальный дизайн блока «Сценарий кампании» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Привести блок «Сценарий кампании» к макету: белые теги-параметры с поповером «Изменить», цвета тегов по каналам из общего с графом справочника, бейджи шагов с таймлайном, таблица в обрамлённой панели, кнопка предпросмотра иконкой.

**Architecture:** Цвет узлов и тегов остаётся единым справочником `NODE_STYLES` — правим его, и граф с описанием едут вместе. Новые значения макета заводятся токенами в `globals.css`, а не хексами по компонентам. Поведение клика по тегу-настройке переезжает с прямого перехода на поповер с кнопкой, переиспользуя существующую оболочку `TagPopoverShell`.

**Tech Stack:** TypeScript, React 19, Next.js 16, Tailwind v4, vitest + @testing-library/react (jsdom), Playwright.

## Global Constraints

- Спека: `docs/superpowers/specs/2026-07-31-scenario-block-visual-design.md`. При расхождении — прав план, расхождение назвать в отчёте.
- Работать ТОЛЬКО в worktree `.worktrees/scenario-block-refinement`, ветка `feature/scenario-block-refinement`. Основной чекаут не трогать.
- **ЗАПРЕЩЕНО: `git stash`, `git reset --hard`, `git checkout -- .`, `git clean`.**
- Тесты: `npx vitest run <путь>`; полный прогон `npx vitest run`. Тайпчек: `npx tsc --noEmit` — обязан остаться ровно **13 предсуществующих** ошибок в `src/components/ai-elements/*` и `src/sections/campaigns/campaign-cost.ts`. Линт: `npx eslint <файлы>`.
- Старт: `npx vitest run` даёт **0 красных**. Любой рост — регресс, разбирать, а не списывать.
- Дев-сервер worktree работает на `localhost:3000` (запущен отдельно, через `nohup`). Не убивайте его и не поднимайте свой; Playwright переиспользует.
- Новые цвета макета — **токенами в `src/app/globals.css`** (секция тёмной темы), а не хексами в компонентах. Исключение: `NODE_STYLES` — это уже реестр сырых хексов и единственный источник цвета узлов.
- Жёлтый `#FFEC00` не применять. Янтарь паузы `#f2b34a` приходит из палитры узла, а не из акцента.
- Комментарии по-русски, идентификаторы по-английски; комментарий объясняет ПОЧЕМУ.
- **НЕ трогать** формулировку «Аудитория делится по каналам» и Push-контент «заголовок + текст» — оба оставлены сознательно (спека, Р5 и Р8).
- TDD там, где меняется поведение; для чисто визуальных значений — тест на класс/токен плюс проверка глазами.
- Коммит после каждой задачи, сообщение по-русски в стиле репозитория.

---

### Task 1: Палитра узлов и токены макета

**Files:**
- Modify: `src/sections/campaigns/node-visuals.ts`
- Modify: `src/app/globals.css`
- Modify/Create: `src/sections/campaigns/node-visuals.test.ts`

**Interfaces:**
- Produces: обновлённый `NODE_STYLES` (тот же тип `Record<WorkflowNodeType, NodeStyle>`), новые CSS-переменные темы.

`NODE_STYLES` — единственный источник цвета и для узла графа, и для тега описания. Правка перекрашивает канвас и мини-превью тоже — это требование спеки, а не побочный эффект.

Новые значения:

| Узел | border | bg | color |
|---|---|---|---|
| `sms` | `#2f6b4d` | `#12241b` | `#8ff0c4` |
| `channel` (легаси-дубль sms) | `#2f6b4d` | `#12241b` | `#8ff0c4` |
| `push` | `#2f5580` | `#111d2b` | `#a9caff` |
| `email` | `#523a78` | `#1b1327` | `#d6bcff` |
| `ivr` | `#7a5730` | `#271a10` | `#ffcf9e` |
| `wait` | `#4a3c1c` | `#2a2314` | `#f2b34a` |
| `condition` | `#5a2f52` | `#241020` | `#e08bd0` |
| `split` | `#5a2f52` | `#241020` | `#e08bd0` |

Остальные узлы не трогать.

Токены в `globals.css` (секция `.dark`), именами с префиксом `--scenario-`:

```
--scenario-tag-bg: #4C4C4E;
--scenario-tag-hover: #8B8B8D;
--scenario-badge-bg: #17171A;
--scenario-badge-border: #2A2A30;
--scenario-badge-text: #9596A0;
--scenario-rail: #212127;
--scenario-panel: #101012;
--scenario-th: #6D6E78;
--scenario-heading: #ECECED;
```

Зарегистрируйте их в `@theme` рядом с существующими, чтобы Tailwind-утилиты вида `bg-scenario-panel` работали; проверьте по существующим записям файла, как именно это делается в этом проекте (там уже есть пары `--color-*: var(--*)`).

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, expect, it } from "vitest";
import { NODE_STYLES } from "./node-visuals";

describe("NODE_STYLES — палитра каналов", () => {
  it("каналы различаются по цвету и совпадают с макетом", () => {
    expect(NODE_STYLES.sms.color).toBe("#8ff0c4");
    expect(NODE_STYLES.push.color).toBe("#a9caff");
    expect(NODE_STYLES.email.color).toBe("#d6bcff");
    expect(NODE_STYLES.ivr.color).toBe("#ffcf9e");
  });

  it("email больше не циан — прямой анти-референс PRODUCT.md", () => {
    expect(NODE_STYLES.email.color).not.toBe("#67e8f9");
  });

  it("ни один канал не повторяет цвет другого", () => {
    const colors = ["sms", "push", "email", "ivr"].map((k) => NODE_STYLES[k as "sms"].color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("легаси channel держит палитру sms — он её дубль", () => {
    expect(NODE_STYLES.channel).toEqual(NODE_STYLES.sms);
  });

  it("условие и деление красятся одинаково розовым", () => {
    expect(NODE_STYLES.condition.color).toBe("#e08bd0");
    expect(NODE_STYLES.split.color).toBe("#e08bd0");
  });

  it("пауза — янтарь макета, не брендовый жёлтый", () => {
    expect(NODE_STYLES.wait.color).toBe("#f2b34a");
    expect(NODE_STYLES.wait.color).not.toBe("#FFEC00");
  });
});
```

- [ ] **Step 2: Прогнать тест и убедиться, что он падает**

Run: `npx vitest run src/sections/campaigns/node-visuals.test.ts`
Expected: FAIL — `expected '#5eead4' to be '#8ff0c4'`.

- [ ] **Step 3: Реализовать**

Обновить таблицу в `NODE_STYLES`, сохранив комментарий о том, что это источник правды и для карточки, и для тегов. Добавить токены в `globals.css`.

- [ ] **Step 4: Прогнать тесты и проверить, что граф не сломался**

Run: `npx vitest run src/sections/campaigns/node-visuals.test.ts && npx vitest run && npx tsc --noEmit`
Expected: новый файл зелёный, полный прогон 0 красных (если какой-то тест фиксировал старый цвет — обновить его, не ослабляя), тайпчек 13.

- [ ] **Step 5: Коммит**

```bash
git add src/sections/campaigns/node-visuals.ts src/sections/campaigns/node-visuals.test.ts src/app/globals.css
git commit -m "feat(nodes): палитра каналов по макету — граф и теги описания едут вместе"
```

---

### Task 2: Тег-параметр — вид и поповер «Изменить»

**Files:**
- Modify: `src/sections/campaigns/description-tag.tsx`
- Modify: `src/sections/campaigns/description-tag.test.tsx`

**Interfaces:**
- Consumes: токены `--scenario-tag-bg` / `--scenario-tag-hover` (Task 1); существующие `TagPopoverShell`, `STEP_ICON`.
- Produces: `NEUTRAL_CLASS` нового вида; цель `wizard-step` рендерится поповером, а не прямой кнопкой перехода.

Две правки в одном файле:

**(а) Вид.** `NEUTRAL_CLASS` вместо `border-transparent bg-foreground text-background` становится фоном `--scenario-tag-bg`, обводкой 1px белой, текстом и иконкой белыми. Радиус — 7px (`rounded-[7px]`), паддинг по горизонтали 7px. Вес 600 уже на `PILL_BASE`. Hover только у интерактивного тега: фон `--scenario-tag-hover`. Демоция в `none` оставляет ТОТ ЖЕ класс — снимает интерактив, а не цвет.

**(б) Поповер.** Цель `wizard-step` сейчас рендерится кнопкой с тултипом «Нажмите для изменения», клик по которой сразу зовёт `onActivate`. Становится: клик раскрывает поповер через существующую `TagPopoverShell`, внутри — подпись «Настройка · <label шага>» и кнопка «Изменить», и уже она зовёт `onActivate(tag)` и закрывает поповер. Тултип «Нажмите для изменения» у этой цели снимается — его роль берёт поповер.

Человекочитаемое имя шага берите из существующего источника подписей шагов визарда (`wizard-steps.ts` — там же, откуда `STEP_ICON`); новую карту названий не заводите.

- [ ] **Step 1: Написать падающие тесты**

```tsx
describe("тег-параметр: вид", () => {
  it("несёт фон макета и белую обводку, а не светлую заливку", () => {
    render(<DescriptionTagPill tag={{ id: "t", label: "разовый", target: { kind: "none" } }} />);
    const box = screen.getByText("разовый").parentElement as HTMLElement;
    expect(box.className).toContain("bg-scenario-tag");
    expect(box.className).not.toContain("bg-foreground");
    expect(box.className).toContain("font-semibold");
  });

  it("демоция не меняет фон — только интерактив", () => {
    const { container: live } = render(
      <DescriptionTagPill tag={{ id: "a", label: "разовый", target: { kind: "wizard-step", step: "analysis" } }} />,
    );
    const { container: dead } = render(
      <DescriptionTagPill tag={{ id: "b", label: "разовый", target: { kind: "none", step: "analysis" } }} />,
    );
    const cls = (c: HTMLElement) => (c.querySelector("[class*='rounded-']") as HTMLElement).className;
    expect(cls(dead.firstChild as HTMLElement)).toContain("bg-scenario-tag");
    expect(cls(live.firstChild as HTMLElement)).toContain("bg-scenario-tag");
  });
});

describe("тег-параметр: поповер «Изменить»", () => {
  it("клик по тегу не уводит сразу — он раскрывает поповер", async () => {
    const onActivate = vi.fn();
    render(
      <DescriptionTagPill
        tag={{ id: "t", label: "разовый", target: { kind: "wizard-step", step: "analysis" } }}
        onActivate={onActivate}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /разовый/ }));
    expect(onActivate).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Изменить" })).toBeTruthy();
  });

  it("«Изменить» в поповере уводит на шаг визарда", async () => {
    const onActivate = vi.fn();
    render(
      <DescriptionTagPill
        tag={{ id: "t", label: "разовый", target: { kind: "wizard-step", step: "analysis" } }}
        onActivate={onActivate}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /разовый/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Изменить" }));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0][0].target).toEqual({ kind: "wizard-step", step: "analysis" });
  });

  it("у запущенной кампании поповера нет вовсе", async () => {
    render(<DescriptionTagPill tag={{ id: "t", label: "разовый", target: { kind: "none", step: "analysis" } }} />);
    await userEvent.click(screen.getByText("разовый"));
    expect(screen.queryByRole("button", { name: "Изменить" })).toBeNull();
  });
});
```

(Импорты `userEvent` и `vi` — по образцу существующих тестов файла.)

- [ ] **Step 2: Прогнать и убедиться, что падают**

Run: `npx vitest run src/sections/campaigns/description-tag.test.tsx`
Expected: FAIL — класс содержит `bg-foreground`; кнопка «Изменить» не найдена.

- [ ] **Step 3: Реализовать**

Существующие тесты файла, ожидавшие прямого вызова `onActivate` по клику на тег или тултип «Нажмите для изменения» у `wizard-step`, привести к новому поведению — не ослабляя того, что они проверяли.

- [ ] **Step 4: Прогнать тесты, тайпчек, линт**

Run: `npx vitest run src/sections/campaigns/description-tag.test.tsx && npx vitest run && npx tsc --noEmit && npx eslint src/sections/campaigns/description-tag.tsx`
Expected: 0 красных, тайпчек 13, линт чист. `campaign-screen.test.tsx` содержит тест «клик по кликабельному тегу диспатчит `campaign_step_edit_requested`» — он теперь обязан кликать ещё и «Изменить»; обновите его.

- [ ] **Step 5: Коммит**

```bash
git add src/sections/campaigns/description-tag.tsx src/sections/campaigns/description-tag.test.tsx src/sections/campaigns/campaign-screen.test.tsx
git commit -m "feat(description): тег-настройка по макету и поповер «Изменить» вместо прямого перехода"
```

---

### Task 3: Тег условия становится кликабельным

**Files:**
- Modify: `src/state/graph-description.ts`
- Modify: `src/sections/campaigns/description-tag.tsx`
- Modify: `src/state/graph-description.test.ts`
- Modify: `src/sections/campaigns/description-tag.test.tsx`

**Interfaces:**
- Consumes: `NodeFieldCombobox` (`src/sections/campaigns/node-field-combobox.tsx`), `TagPopoverShell`.
- Produces: у пилюли развилки-условия цель `{ kind: "node-fields", nodeId }` вместо `none`, пока граф правится.

Сейчас пилюли развилок (`[открыл письмо?]`, `[уровню склонности]`) — обе `{ kind: "none", nodeId }`. Меняется только условие:

- **Условие** (`forkKind === "condition"`) → цель `node-fields`, пока `graphEditable`; иначе `none`. Поповер — `NodeFieldCombobox` над полем «Событие» (`optionsKey: "eventCatalog"`, `paramKey: "trigger"`), выбор диспатчит `workflow_node_field_set`, как это делает поповер шаблона. `onAiHandoff` НЕ передавать: на карточке нет ИИ-дровера полей, и отсутствие колбэка само гасит пункт «Сформировать с помощью ИИ» — заглушка была бы кнопкой, которая ничего не делает.
- **Деление** (`forkKind === "split"`) остаётся `none` НАВСЕГДА — поля сплиттера правятся только через ИИ (`NODE_FIELD_EDITABILITY.split` → `editability: "ai"`), которого на карточке нет. Оставьте комментарий с этой причиной, иначе следующий читатель сочтёт это недоделкой.

`waitParamsForTag` в `workflow-description.tsx` резолвит поповер паузы по `params.kind === "wait"`; для условия понадобится такой же резолв по `params.kind === "condition"`. Расширьте существующий путь, не заводя третий лукап.

- [ ] **Step 1: Написать падающие тесты**

```ts
// graph-description.test.ts
it("пилюля условия кликабельна, пока граф правится", () => {
  const stages = describeWorkflow(conditionForkGraph(), T, {
    pending: [], editableSteps: [], graphEditable: true,
  });
  const fork = stages.find((s) => s.kind === "fork")!;
  const tag = fork.body.find((s) => s.kind === "tag")!;
  expect(tag.kind === "tag" && tag.tag.target).toEqual({ kind: "node-fields", nodeId: "react" });
});

it("после запуска пилюля условия теряет клик, но не личность", () => {
  const stages = describeWorkflow(conditionForkGraph(), T, {
    pending: [], editableSteps: [], graphEditable: false,
  });
  const fork = stages.find((s) => s.kind === "fork")!;
  const tag = fork.body.find((s) => s.kind === "tag")!;
  expect(tag.kind === "tag" && tag.tag.target).toEqual({ kind: "none", nodeId: "react" });
});

it("пилюля деления некликабельна всегда — поля сплиттера правит только ИИ", () => {
  const stages = describeWorkflow(TEMPLATE_BY_TYPE["Удержание"](), T, {
    pending: [], editableSteps: [], graphEditable: true,
  });
  const fork = stages.find((s) => s.kind === "fork")!;
  const tag = fork.body.find((s) => s.kind === "tag")!;
  expect(tag.kind === "tag" && tag.tag.target.kind).toBe("none");
});
```

`conditionForkGraph()` — рукотворный граф формы `signal → email → condition(opened) → ДА:email / НЕТ:sms`; такой уже есть в `graph-waves.test.ts`, переиспользуйте форму, а не копируйте её вслепую.

```tsx
// description-tag.test.tsx
it("поповер условия предлагает события справочника", async () => {
  render(
    <DescriptionTagPill
      tag={{ id: "c", label: "открыл письмо?", target: { kind: "node-fields", nodeId: "react" } }}
      nodeType="condition"
      conditionParams={{ kind: "condition", trigger: "opened" }}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: /открыл письмо/ }));
  expect(await screen.findByText("Письмо открыто")).toBeTruthy();
});
```

(Имя пропа для параметров условия выберите по образцу существующего `waitParams`; в тесте используйте то, что реализовали.)

- [ ] **Step 2: Прогнать и убедиться, что падают**

Run: `npx vitest run src/state/graph-description.test.ts src/sections/campaigns/description-tag.test.tsx`
Expected: FAIL — цель равна `none`; поповер условия не рендерится.

- [ ] **Step 3: Реализовать**

- [ ] **Step 4: Прогнать всё**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src/state/graph-description.ts src/sections/campaigns/description-tag.tsx`
Expected: 0 красных, тайпчек 13, линт чист.

- [ ] **Step 5: Коммит**

```bash
git add src/state/graph-description.ts src/sections/campaigns/description-tag.tsx src/state/graph-description.test.ts src/sections/campaigns/description-tag.test.tsx
git commit -m "feat(description): условие правится с карточки, деление остаётся за ИИ"
```

---

### Task 4: Бейджи шагов, таймлайн, панель таблицы, кнопка-иконка

**Files:**
- Modify: `src/sections/campaigns/workflow-description.tsx`
- Modify: `src/sections/campaigns/workflow-description.test.tsx`

**Interfaces:**
- Consumes: токены `--scenario-badge-*`, `--scenario-rail`, `--scenario-panel`, `--scenario-th`, `--scenario-heading` (Task 1).

Четыре правки одного файла:

1. **Бейдж шага.** Номер — в кружке Ø28px: фон `--scenario-badge-bg`, обводка `--scenario-badge-border`, цифра `--scenario-badge-text`, `tabular-nums`. `aria-hidden` сохраняется (порядок несёт `<ol>`).
2. **Таймлайн.** Вертикальная линия 2px `--scenario-rail` слева вдоль бейджей, от первого до последнего. Реализуйте её так, чтобы она не тянулась ниже последнего бейджа (в прототипе это `::before` у контейнера с `top`/`bottom` отступами) и не появлялась, когда шаг один.
3. **Панель таблицы.** Каждая таблица — в обрамлении: фон `--scenario-panel`, обводка `--scenario-rail`, радиус 10px, `overflow: hidden`. Разделители строк — `--scenario-rail`; у последней строки разделителя нет. Заголовки столбцов — 10px, uppercase, `--scenario-th`, вес 500. Ширины `<colgroup>` привести к макету: `110px` / `196px` / авто / `52px` — и они обязаны остаться ОДИНАКОВЫМИ у всех таблиц шага (на этом держится выравнивание ◈-групп).
4. **Кнопка предпросмотра.** Квадратная кнопка только с иконкой глаза: обводка `--scenario-badge-border`, фон `--scenario-badge-bg`, иконка `--scenario-badge-text`; hover — светлее. Подпись уходит из видимого текста, но `aria-label` (уже уникальный) сохраняется, и добавляется `title` с тем же текстом.

Заголовок шага — 15.5px / 600 / `--scenario-heading`.

- [ ] **Step 1: Написать падающие тесты**

```tsx
it("номер шага — в кружке-бейдже, а не плоской цифрой", () => {
  const { container } = render(<WorkflowDescription stages={STAGES} />);
  const badge = container.querySelector("[data-testid='stage-number']") as HTMLElement;
  expect(badge.className).toContain("rounded-full");
  expect(badge.className).toContain("tabular-nums");
});

it("шаги связаны вертикальной линией-таймлайном", () => {
  const { container } = render(<WorkflowDescription stages={STAGES} />);
  expect(container.querySelector("[data-testid='stage-rail']")).toBeTruthy();
});

it("одинокий шаг линии не рисует", () => {
  const { container } = render(
    <WorkflowDescription stages={[{ id: "o", kind: "outcome", heading: "Итог", body: t("Всё.") }]} />,
  );
  expect(container.querySelector("[data-testid='stage-rail']")).toBeNull();
});

it("таблица лежит в обрамлённой панели", () => {
  const { container } = wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
  const panel = container.querySelector("[data-testid='table-panel']") as HTMLElement;
  expect(panel.className).toContain("rounded-[10px]");
  expect(panel.className).toContain("overflow-hidden");
});

it("кнопка предпросмотра — только иконка, подпись остаётся доступной", () => {
  wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
  const btn = screen.getAllByRole("button", { name: /^Предпросмотр/ })[0];
  expect(btn.textContent).toBe("");
  expect(btn.getAttribute("title")).toMatch(/Предпросмотр/);
});
```

- [ ] **Step 2: Прогнать и убедиться, что падают**

Run: `npx vitest run src/sections/campaigns/workflow-description.test.tsx`
Expected: FAIL — `rounded-full` нет, `stage-rail` не найден, кнопка несёт текст.

- [ ] **Step 3: Реализовать**

- [ ] **Step 4: Прогнать всё**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src/sections/campaigns/workflow-description.tsx`
Expected: 0 красных, тайпчек 13, линт чист.

- [ ] **Step 5: Коммит**

```bash
git add src/sections/campaigns/workflow-description.tsx src/sections/campaigns/workflow-description.test.tsx
git commit -m "feat(description): бейджи шагов с таймлайном, таблица в панели, предпросмотр иконкой"
```

---

### Task 5: Сквозная проверка, глаза и базлайны

**Files:**
- Modify: `tests/e2e/**` — снапшоты карточки и графа

- [ ] **Step 1: Полный прогон**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: 0 красных, тайпчек 13 предсуществующих, линт без новых ошибок в тронутых файлах.

- [ ] **Step 2: Функциональные e2e**

Run: `npm run test:e2e`
Expected: те же 2 предсуществующих падения (`template-preview-ivr.spec.ts`, `block-b2.spec.ts`) — они падают и на базовом коммите ветки, проверено. Любое НОВОЕ падение — регресс, разбирать.

- [ ] **Step 3: Проверка глазами**

Снимите временным Playwright-спеком блок описания на черновике и на запущенной кампании (харнесс `tests/e2e/screens/seed.ts` + `catalog.ts`, экраны `campaign-card` и `campaign-card-draft`, селектор блока `ol:has([data-testid='stage-number'])`), плюс экран графа (`workflow-draft`). **Посмотрите PNG своими глазами** и убедитесь: теги-настройки серые с белой обводкой и белым текстом; теги шаблонов различаются по каналам; цвета узлов на графе те же, что у тегов; номера в кружках, соединённых линией; таблица в панели с разделителями; кнопка предпросмотра — квадратная иконка. Спек удалите после.

Отдельно проверьте поповеры: клик по тегу «Режим» на черновике раскрывает поповер с «Изменить»; клик по тегу условия — комбо событий.

- [ ] **Step 4: Базлайны**

Порт 3000 занят дев-сервером worktree — Playwright его переиспользует, свой поднимать не нужно. Обновите снапшоты: `npm run test:visual:update`, затем проверочный `npm run test:visual` — должен быть зелёным. Изменятся и карточка, и экраны графа (палитра узлов). Перечислите в отчёте, что именно изменилось на каждом.

- [ ] **Step 5: Коммит**

```bash
git add -A
git commit -m "test(visual): базлайны под палитру каналов и оформление блока сценария"
```

---

## Self-Review

**Покрытие спеки:**

| Требование | Задача |
|---|---|
| §1 Тег-параметр (вид) | 2 |
| §2 Поповер «Изменить» | 2 |
| §3 Палитра узлов и тегов | 1 |
| §4 Теги паузы / условия / деления | 1 (цвет), 3 (поведение) |
| §5 Бейдж и таймлайн | 4 |
| §6 Панель таблицы, ширины, кнопка-иконка | 4 |
| §7 ◈-подзаголовок | **ошибка плана, закрыто фикс-раундом финального ревью.** Строка утверждала «уже реализован; цвет приходит из §3» — неправда: глиф наследовал `text-foreground`, подзаголовок весил 500, отступ между группами был 12px, а цвет из §3 туда ниоткуда не приходил (`NODE_STYLES` в `workflow-description.tsx` вообще не импортировался). Никто не заметил, потому что этапы-развилки на сидовых данных не встречаются — они достижимы только ИИ-правкой графа (см. уточнение в разделе «Риски» спеки логики, `docs/superpowers/specs/2026-07-30-scenario-block-refinement-design.md`). Реализовано в фикс-раунде: глиф `NODE_STYLES.condition.color`, `font-semibold`, `mt-[22px]` |
| Токены | 1 |
| Критерии приёмки 1–9 | 1–4 |
| Критерий приёмки 10 | 5 |

**Не внедряется по решению владельца:** Р5 (формулировка «по каналам» остаётся), Р8 (Push — заголовок и текст). Р2 — вопрос данных сида, не кода. Р9 — оставлено как есть.

**Согласованность:** токены `--scenario-*` вводятся в Task 1 и потребляются в 2 и 4. `NODE_STYLES` правится только в Task 1. Цель `node-fields` у условия вводится в Task 3 и опирается на резолв параметров, который расширяется там же.
