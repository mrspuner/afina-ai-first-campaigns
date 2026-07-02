# Копии карточек онбординга — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переписать копию первых двух карточек онбординга на welcome-экране так, чтобы карточка 1 рассказывала про **Сигналы** (intent-аудитории), а карточка 2 — про **Кампании**; синхронизировать колокейтед-тест.

**Architecture:** Чистая правка контента. Источник истины для текста карточек — module-level массив `PLATES` в `src/sections/welcome/onboarding-step-cards.tsx`; компонент мапит его в DOM, консьюмер (`welcome-view.tsx`) копию не хардкодит. Меняем две из трёх записей `PLATES` (heading + description), третью («Статистика») не трогаем. Тест `onboarding-step-cards.test.tsx` ассертит старые строки — сначала приводим тест к новому ожиданию (red), затем меняем копию (green).

**Tech Stack:** Next.js 16, React, TypeScript, Vitest + Testing Library (колокейтед `*.test.tsx`).

---

## Контекст: блок 8 из спека

Спек: `docs/superpowers/specs/2026-06-23-aim-batch-decomposition-design.md`, раздел «Дополнение: вторая волна правок 17–20», строка 117 (правки #17 / #18). Блок полностью независим от блоков 1–7.

Намерение (из aim-комментариев пользователя):
- **Карточка 1** (сейчас heading «Кампании») — комментарий «Давай тут вернем текст про сигналы» → карточка должна описывать **Сигналы** (intent-аудитории: кому нужна коммуникация прямо сейчас, по поведению и данным).
- **Карточка 2** (сейчас heading «Коммуникация») — комментарий «А тут про кампанию» → карточка должна описывать **Кампании** (создать кампанию под выбранную аудиторию).

**Решение по объёму правки:** меняем И heading, И description у карточек 1 и 2. Комментарии относятся к *предмету* карточки (её теме), а не только к тексту описания: «текст про сигналы» означает, что карточка теперь про сигналы, значит её заголовок «Кампании» уже не подходит. Поэтому heading 1 → «Сигналы», heading 2 → «Кампании». Карточка 3 «Статистика» — без изменений.

> ⚠️ **Точные формулировки ниже — ПРЕДЛОЖЕННЫЕ.** Пользователь может скорректировать слова. Что важно структурно и обязательно: (а) какие записи `PLATES` меняются (1-я и 2-я), (б) что heading+description обе записи меняются, (в) что тест синхронизирован. Финальные строки подтвердить у пользователя — это явный открытый вопрос блока 8 в спеке (строка 140).

### Соответствие модели продукта (PRODUCT.md)

Поток продукта: **Сигналы (intent-аудитории) → Кампании → Статистика**. Голос: «магия под капотом», уверенный/точный/ненавязчивый. Никогда не раскрываем тех-детали (regex, маппинг доменов, ML). Три карточки = три шага потока в правильном порядке: сначала находим аудиторию (сигнал), потом запускаем на неё кампанию, потом смотрим результат. Предложенные строки описывают *что происходит*, а не *как это устроено*.

---

## Task 1: Синхронизировать тест под новую копию (red)

**Files:**
- Test: `src/sections/welcome/onboarding-step-cards.test.tsx`

Текущий тест (verbatim) ассертит на старую копию:

```tsx
describe("OnboardingStepCards — block-7 copy", () => {
  it("renders the three concept headings with the first card as Кампании", () => {
    render(<OnboardingStepCards />);
    expect(screen.getByText("Кампании")).toBeInTheDocument();
    expect(screen.getByText("Коммуникация")).toBeInTheDocument();
    expect(screen.getByText("Статистика")).toBeInTheDocument();
    expect(screen.queryByText("Сигналы")).not.toBeInTheDocument();
  });

  it("renders the Коммуникация description", () => {
    render(<OnboardingStepCards />);
    expect(
      screen.getByText(
        "Запускаем нужное сообщение в нужный момент — по выбранным каналам.",
      ),
    ).toBeInTheDocument();
  });
});
```

Проблемы под новую модель: первый тест требует «Кампании» как первую карточку и явно запрещает «Сигналы» (`queryByText("Сигналы")).not.toBeInTheDocument()`) — обе ассерции инвертируются. Второй тест ассертит старое описание «Коммуникации», которое мы удаляем.

- [ ] **Step 1: Переписать тест на новое ожидание**

Заменить весь блок `describe(...)` (строки 5–22) на:

```tsx
describe("OnboardingStepCards — block-8 copy", () => {
  it("renders the three concept headings with the first card as Сигналы", () => {
    render(<OnboardingStepCards />);
    expect(screen.getByText("Сигналы")).toBeInTheDocument();
    expect(screen.getByText("Кампании")).toBeInTheDocument();
    expect(screen.getByText("Статистика")).toBeInTheDocument();
    expect(screen.queryByText("Коммуникация")).not.toBeInTheDocument();
  });

  it("renders the Сигналы description about intent audiences", () => {
    render(<OnboardingStepCards />);
    expect(
      screen.getByText(
        "Находим, кому из клиентов нужна коммуникация прямо сейчас — по поведению и данным.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the Кампании description about launching on the audience", () => {
    render(<OnboardingStepCards />);
    expect(
      screen.getByText(
        "Запускаем кампанию на собранную аудиторию — нужное сообщение в нужный момент, по выбранным каналам.",
      ),
    ).toBeInTheDocument();
  });
});
```

Импорты (строки 1–3) не меняются.

- [ ] **Step 2: Запустить тест — убедиться, что падает (red)**

Run: `npm test -- onboarding-step-cards`
Expected: **FAIL.** `getByText("Сигналы")` бросает «Unable to find an element with the text: Сигналы» (компонент всё ещё рендерит старые строки); `queryByText("Коммуникация")` находит существующий heading и валит `.not.toBeInTheDocument()`; новые описания не находятся. Heading «Статистика» по-прежнему проходит.

- [ ] **Step 3: Коммит red-теста**

```
git add src/sections/welcome/onboarding-step-cards.test.tsx
git commit -m "test(welcome): expect Сигналы/Кампании onboarding cards (aim #17,#18)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Переписать копию карточек 1 и 2 (green)

**Files:**
- Modify: `src/sections/welcome/onboarding-step-cards.tsx:11-20`

Текущий `PLATES` (verbatim, строки 10–26) — меняем только первые две записи, третью оставляем:

```tsx
const PLATES: readonly Plate[] = [
  {
    heading: "Кампании",
    description:
      "Создаём кампанию под нужную аудиторию — определяем, кому из клиентов нужна коммуникация прямо сейчас, по поведению и данным.",
  },
  {
    heading: "Коммуникация",
    description:
      "Запускаем нужное сообщение в нужный момент — по выбранным каналам.",
  },
  {
    heading: "Статистика",
    description:
      "Показываем результат в цифрах — кто отреагировал, сколько принесла кампания.",
  },
] as const;
```

- [ ] **Step 1: Заменить запись карточки 1 (строки 11–15)**

Было:

```tsx
  {
    heading: "Кампании",
    description:
      "Создаём кампанию под нужную аудиторию — определяем, кому из клиентов нужна коммуникация прямо сейчас, по поведению и данным.",
  },
```

Стало:

```tsx
  {
    heading: "Сигналы",
    description:
      "Находим, кому из клиентов нужна коммуникация прямо сейчас — по поведению и данным.",
  },
```

- [ ] **Step 2: Заменить запись карточки 2 (строки 16–20)**

Было:

```tsx
  {
    heading: "Коммуникация",
    description:
      "Запускаем нужное сообщение в нужный момент — по выбранным каналам.",
  },
```

Стало:

```tsx
  {
    heading: "Кампании",
    description:
      "Запускаем кампанию на собранную аудиторию — нужное сообщение в нужный момент, по выбранным каналам.",
  },
```

Запись карточки 3 «Статистика» (строки 21–25) — **не трогать.** `Plate`-тип, `plateClass`, `staggerStyle`, `OnboardingStepCards`, `key={plate.heading}` (heading-ключи остаются уникальными: Сигналы / Кампании / Статистика) — без изменений.

- [ ] **Step 3: Запустить тест — убедиться, что проходит (green)**

Run: `npm test -- onboarding-step-cards`
Expected: **PASS** (3 теста). Все три heading находятся, «Коммуникация» отсутствует, оба новых описания находятся.

- [ ] **Step 4: Полный прогон тестов + lint**

Run: `npm test`
Expected: **PASS** — никакой другой тест не ссылается на старую копию (консьюмер `welcome-view.tsx` копию не хардкодит — у него собственный hero-текст, не из `PLATES`).

Run: `npm run lint`
Expected: clean (только текстовые правки внутри строк).

- [ ] **Step 5: Коммит green**

```
git add src/sections/welcome/onboarding-step-cards.tsx
git commit -m "feat(welcome): onboarding cards — Сигналы then Кампании (aim #17,#18)

Card 1 now describes signals (intent audiences); card 2 describes
campaigns, matching the signals→campaigns→stats product flow.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Worktree (AGENTS.md)

Перед началом, из корня репозитория:

```bash
git worktree add .worktrees/block8-onboarding-copy -b feature/block8-onboarding-copy main
cd .worktrees/block8-onboarding-copy
npm install
```

Все правки, тесты и коммиты — внутри этого worktree. `npm test` колокейтед (vitest), dev-сервер не нужен. По завершении сообщить пользователю путь worktree и имя ветки; merge/cleanup — на стороне пользователя.

---

## Self-review vs спек

- **Обе карточки покрыты:** Task 2 Step 1 (карточка 1 → Сигналы) + Step 2 (карточка 2 → Кампании). ✓
- **Heading + description меняются у обеих** (решение зафиксировано выше). Карточка 3 не тронута. ✓
- **Тест синхронизирован:** Task 1 переписывает обе старые ассерции (инвертирует Кампании↔Сигналы и Коммуникация, заменяет описания). ✓
- **RU-only:** все новые строки на русском. ✓
- **TDD:** тест сначала падает (Task 1), потом зелёный (Task 2). ✓
- **Магия скрыта:** описания говорят «что» (находим аудиторию / запускаем кампанию), не «как» (нет regex/доменов/ML). ✓
- **Открытый вопрос (спек, строка 140):** точные формулировки — предложенные, подтвердить у пользователя; структурная часть (какие записи + тест) от слов не зависит.
