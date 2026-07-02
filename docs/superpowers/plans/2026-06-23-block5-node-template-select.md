# Селект шаблонов в нодах — Implementation Plan

Блок 5 декомпозиции AIM 2026-06-23 — правки **9, 10, 11**.
Спека: `docs/superpowers/specs/2026-06-23-aim-batch-decomposition-design.md` (раздел «Модель шаблонов» + строка таблицы блока 5).

Цель блока:
- **Правка 10** — убрать свободные поля **Текст / Заголовок** из коммуникационных нод (sms, email, push); вместо них — одно поле **«Шаблон»**.
- **Правки 9 + 10** — «Шаблон» рендерится **селектом** из **единого источника** `app-state.templates` (тип `MessageTemplate`), отфильтрованного по каналу ноды. У каждого пункта справа кнопка предпросмотра; есть пункт «Создать новый шаблон». Ноды и карточки Артефактов читают один источник.
- **Правка 11** — убрать/загейтить поведение «чат правит текст ноды»: ветка `case "node-params"` в `executeAssistResults` мутирует ноду вместо ответа. Вопрос должен давать **answer**, а не мутацию. Смягчить bias на `selectedNode` в `orchestrator-prompt.ts`.

Worktree (AGENTS.md):
```bash
git worktree add .worktrees/block5-node-template-select -b feature/block5-node-template-select main
cd .worktrees/block5-node-template-select
npm install
```
Dev-сервер (если не основной viewer): `npm run dev -- -p 3001`. Тесты/линт гоняем в worktree.

Тест-раннер: **vitest** (`npm test` = `vitest run --passWithNoTests`). Юнит-тесты — colocated `*.test.ts(x)` рядом с модулем (см. `src/state/node-field-editability.test.ts`, `src/sections/shell/use-assist-runner.test.ts`).

---

## Seams / dependencies

Три явных шва. Зафиксировать их в этом блоке, прежде чем трогать UI.

### 1. Контракт дровера с блоком 6 (создание + предпросмотр шаблона)

Блок 5 (селект) дёргает дровер, владелец которого — блок 6 (`src/state/chat-context.tsx`). В chat-context **уже есть** API дровера создания: `openTemplateDrawer()` (no-arg, строка 361), `TemplateDrawerState` (строка 43), `TemplateDrawerVariant` (строка 33). Чего НЕТ: (а) приёма канала при открытии создания, (б) открытия **предпросмотра по `templateId`** без закрытия селекта.

**Контракт, который блок 5 ожидает от блока 6 (две callback-функции):**

```ts
// Открыть дровер создания нового шаблона, преднастроенный на канал ноды.
openTemplateCreate(channel: Channel): void
// Открыть дровер предпросмотра существующего шаблона по id, НЕ закрывая
// вызывающий селект (предпросмотр — отдельная боковая панель чат-дровера).
openTemplatePreview(templateId: string): void
```

**Стратегия стыковки (выбрана для независимой тестируемости блока 5):**
Блок 5 **НЕ** меняет `chat-context.tsx` (это файл-владелец блока 6). Вместо этого новый компонент `NodeTemplateSelect` принимает оба callback как **пропсы** от `NodeCardBody`. В `NodeCardBody` callback-и берутся из `useChat()` опционально-безопасно: если метод уже есть — используем его; если ещё нет (блок 6 не влит) — **стаб no-op с `// TODO(block6): wire openTemplateCreate/openTemplatePreview`**. Это делает блок 5 компилируемым и тестируемым в одиночку, а стыковка с блоком 6 — замена стаба на реальный вызов (одна правка в `NodeCardBody`, без изменения `NodeTemplateSelect`).

Конкретно в `NodeCardBody`:
```ts
const chat = useChat();
// SEAM(block6): пока блок 6 не добавил канало-параметризованное открытие и
// предпросмотр по id — стаб. Замена: chat.openTemplateCreate?.(channel) ?? chat.openTemplateDrawer().
const openTemplateCreate = (_channel: Channel) => {
  // TODO(block6): открыть дровер создания, преднастроенный на _channel.
  chat.openTemplateDrawer();
};
const openTemplatePreview = (_templateId: string) => {
  // TODO(block6): открыть боковую панель предпросмотра шаблона по id, не закрывая селект.
};
```
`NodeTemplateSelect` вызывает только переданные пропсы — он не знает про chat-context. Тесты блока 5 передают `vi.fn()` стабы и проверяют, что они вызваны с правильными аргументами.

### 2. `src/lib/ai/orchestrator-prompt.ts` — общий с блоком 7

Оба блока правят этот файл (блок 5 — снимает уклон в node-params; блок 7 — чинит ops ветвления, `buildSystemPrompt` строка 15). **Правило: правка блока 5 минимальна и локализована в один помеченный участок** — строки 38–42 (блок `...(context.selectedNode ? [...] : [])`). Обернуть изменение комментарием-маркером:
```
// BLOCK5-EDIT(node-params bias): ...
// /BLOCK5-EDIT
```
чтобы при merge с блоком 7 конфликт был очевиден и точечен. **Координация:** если блок 7 вливается первым — взять его версию файла за основу и наложить только этот помеченный диапазон; если первым блок 5 — блок 7 накладывает свои правки на `buildSystemPrompt`-тело, не трогая помеченный участок. Никаких других строк файла блок 5 не касается.

### 3. `MessageTemplate` — общий с блоком 2

`MessageTemplate` (`src/state/app-state.ts:93`) уже несёт всё, что нужно блоку 5:
```ts
type MessageTemplate = {
  id: string;
  channel: Channel;        // фильтр селекта по каналу ноды
  name: string;            // подпись пункта селекта
  content: NodeParams;     // состав компонентов (для предпросмотра блока 6)
  usedInCampaigns: number;
};
```
Блок 5 читает шаблоны **только по `name` + `channel` + `id`** (плюс `content` отдаёт в предпросмотр через `openTemplatePreview(id)`). Блок 2 добавляет rename-action на `name` — форма не меняется, конфликта типов нет. **Контракт:** если блок 2 переименует/добавит поля — `name`, `channel`, `id` обязаны сохраниться. Если их не станет — это явный contract-break, который ловит тест `node-template-options.test.ts` (см. задачу 2).

---

## Модель (из спеки, подтверждено)

Шаблон = именованный набор компонентов одного канала. В коммуникационной ноде свободные Текст/Заголовок убираются → единственное редактируемое текстовое поле — **«Шаблон»** (простой select). Опции = `templates.filter(t => t.channel === nodeChannel)`. Каждый пункт: слева имя шаблона, справа кнопка-иконка **«Предпросмотр»** → `openTemplatePreview(t.id)` (не закрывает селект). Последний пункт списка — **«Создать новый шаблон»** → `openTemplateCreate(nodeChannel)`. Выбор пункта пишет `templateId` (и заодно копирует компоненты в params ноды через существующий `applyFieldValue`-механизм). Все строки — русские.

**Маппинг kind ноды → Channel:** `sms→"sms"`, `email→"email"`, `push→"push"`, `ivr→"ivr"`. Поля, которые убираем (правка 10): `Текст` у sms/email/push, `Заголовок` у push. `email.Текст` сейчас — спец-контрол `EmailField` (`control: "email"`); он тоже заменяется на «Шаблон» (email уже имеет понятие письма/шаблона — селект шаблонов канала email его поглощает). `ivr` свободного Текста не имеет (только `Сценарий`/`Голос`) — его не трогаем.

**Param-ключ.** Поле «Шаблон» пишет `templateId` в params ноды. `NodeParams` для коммуникационных kind не имеет поля `templateId` — но `workflow_node_field_set`/`patchNodeParams` работают по `Partial<NodeParams>` и dirty-метятся по ключам патча (`workflow-view.tsx:461–485`), а тип патча в reducer — `Record`/`Partial`. Чтобы не расширять `NodeParams` (вне скоупа блока 5 и риск конфликта с другими блоками), храним выбранный шаблон **двумя совместимыми путями**: (1) при выборе применяем `content` шаблона в params ноды через `applyFieldValue` по соответствующим ключам (для sms — `text`; email — `subject`/`body`/`sender`; push — `title`/`body`) — так нода реально несёт текст шаблона; (2) `NodeTemplateSelect` показывает текущий выбор, сопоставляя params ноды с `templates` по содержимому/имени. Это держит блок 5 в рамках существующих reducer'ов. (Если позже понадобится явный `templateId` в `NodeParams` — это отдельный кросс-блочный контракт, здесь его НЕ вводим.)

---

## Задачи (TDD, bite-sized)

Порядок: 1 (editability) → 2 (источник опций) → 3 (компонент select) → 4 (wiring в карточке) → 5 (правка 11 runner) → 6 (правка 11 prompt) → 7 (финальная проверка).

Каждая задача: **RED** (тест падает) → **GREEN** (минимальная реализация) → команда + ожидаемый вывод → коммит.

---

### Задача 1 — Правка 10: заменить Текст/Заголовок на «Шаблон» в editability + рендерерах (в синхроне)

Файлы: `src/state/node-field-editability.ts`, `src/sections/campaigns/node-card-content.tsx`, тест `src/state/node-field-editability.test.ts`.

Добавить новый `FieldControl` тип `"template"` и единое поле «Шаблон» для sms/email/push; убрать «Текст» (sms:38, email:45, push:51) и «Заголовок» (push:50).

**RED** — дописать в `node-field-editability.test.ts`:
```ts
it("communication nodes expose «Шаблон» instead of free Текст/Заголовок", () => {
  expect(getFieldMeta("sms", "Шаблон")?.control).toBe("template");
  expect(getFieldMeta("email", "Шаблон")?.control).toBe("template");
  expect(getFieldMeta("push", "Шаблон")?.control).toBe("template");
  // free text fields removed
  expect(getFieldMeta("sms", "Текст")).toBeUndefined();
  expect(getFieldMeta("email", "Текст")).toBeUndefined();
  expect(getFieldMeta("push", "Текст")).toBeUndefined();
  expect(getFieldMeta("push", "Заголовок")).toBeUndefined();
});

it("«Шаблон» field is manual but carries no combo optionsKey", () => {
  const m = getFieldMeta("sms", "Шаблон");
  expect(m?.editability).toBe("manual");
  expect(m?.optionsKey).toBeUndefined();
});
```
Запуск: `npx vitest run src/state/node-field-editability.test.ts` → **FAIL** (нет «Шаблон», старые «Текст» ещё определены).
Существующие тесты `classifies sms text as manual` (строка 36) и `gives former-manual fields a combo control` (49) и `gives the email body the email control` (56) — **обновить**, т.к. они ссылаются на `sms/Текст`, `email/Текст`. Заменить `"Текст"` на новые ожидания: `getFieldMeta("sms","Текст")` → undefined; убрать проверку email body как `control:"email"` (поле уходит).

**GREEN** — `node-field-editability.ts`:
1. Строка 12: `export type FieldControl = "combo" | "email" | "select" | "template";`
2. Блок `sms` (37–42): удалить строку `"Текст"`; добавить `"Шаблон": { editability: "manual", paramKey: "text", control: "template" }`.
3. Блок `email` (43–48): удалить строки `"Тема"`? — НЕТ, `Тема` остаётся combo (это subject, не тело). Удалить строку `"Текст"` (45, бывший `control:"email"`); добавить `"Шаблон": { editability: "manual", paramKey: "body", control: "template" }`.
4. Блок `push` (49–53): удалить строки `"Заголовок"` (50) и `"Текст"` (51); добавить `"Шаблон": { editability: "manual", paramKey: "body", control: "template" }`.

`node-card-content.tsx` `PARAM_RENDERERS` (в синхроне, те же RU-лейблы):
1. `sms` (23–29): заменить строку `{ label: "Текст", value: p.text || "—" }` → `{ label: "Шаблон", value: p.text || "—" }`.
2. `email` (30–36): убрать `{ label: "Текст", value: p.body || "—" }`; оставить `Тема`; добавить `{ label: "Шаблон", value: p.body || "—" }` (между Тема и Отправитель). `Тема`/`Отправитель`/`Ссылка` остаются.
3. `push` (37–42): убрать `{ label: "Заголовок", ... }` и `{ label: "Текст", ... }`; добавить `{ label: "Шаблон", value: p.body || p.title || "—" }`.

Запуск: `npx vitest run src/state/node-field-editability.test.ts` → **PASS** (включая обновлённый covers-every-kind и combo-инварианты — «Шаблон» не combo, optionsKey не требуется).
Так же прогнать существующий: `npx vitest run src/state` чтобы поймать соседние тесты, которые читали `email/Текст` (`apply-draft.test.ts`, `email-directory.test.ts` — проверить, не сломались).

**Коммит:** `feat(block5): replace free Текст/Заголовок with «Шаблон» field (aim #10)`

---

### Задача 2 — Правка 9: источник опций селекта из app-state.templates по каналу

Файл: новый `src/state/node-template-options.ts` + тест `src/state/node-template-options.test.ts`.

Чистая функция-выборка (без React) — единый источник опций для нод из `templates`.

**RED** — `node-template-options.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { templateOptionsForKind, channelForNodeKind } from "./node-template-options";
import { PRESET_TEMPLATES } from "./app-state";

describe("node-template-options", () => {
  it("maps communication node kind → channel", () => {
    expect(channelForNodeKind("sms")).toBe("sms");
    expect(channelForNodeKind("email")).toBe("email");
    expect(channelForNodeKind("push")).toBe("push");
    expect(channelForNodeKind("ivr")).toBe("ivr");
    expect(channelForNodeKind("wait")).toBeUndefined();
  });

  it("filters templates by the node's channel", () => {
    const sms = templateOptionsForKind(PRESET_TEMPLATES, "sms");
    expect(sms.length).toBeGreaterThan(0);
    expect(sms.every((t) => t.channel === "sms")).toBe(true);
    const email = templateOptionsForKind(PRESET_TEMPLATES, "email");
    expect(email.every((t) => t.channel === "email")).toBe(true);
  });

  it("returns id + name for each option (contract with block 2 MessageTemplate)", () => {
    const [first] = templateOptionsForKind(PRESET_TEMPLATES, "email");
    expect(typeof first.id).toBe("string");
    expect(typeof first.name).toBe("string");
  });

  it("non-communication kinds yield no template options", () => {
    expect(templateOptionsForKind(PRESET_TEMPLATES, "wait")).toEqual([]);
  });
});
```
Запуск: `npx vitest run src/state/node-template-options.test.ts` → **FAIL** (модуля нет).

**GREEN** — `src/state/node-template-options.ts`:
```ts
import type { Channel } from "@/types/campaign";
import type { NodeParams } from "@/types/workflow";
import type { MessageTemplate } from "./app-state";

/** Коммуникационные kind нод → канал шаблонов (правка 9: единый источник). */
const KIND_TO_CHANNEL: Partial<Record<NodeParams["kind"], Channel>> = {
  sms: "sms",
  email: "email",
  push: "push",
  ivr: "ivr",
};

export function channelForNodeKind(kind: NodeParams["kind"]): Channel | undefined {
  return KIND_TO_CHANNEL[kind];
}

/** Шаблоны, доступные ноде данного kind: фильтр по каналу. Один источник — app-state.templates. */
export function templateOptionsForKind(
  templates: MessageTemplate[],
  kind: NodeParams["kind"]
): MessageTemplate[] {
  const channel = channelForNodeKind(kind);
  if (!channel) return [];
  return templates.filter((t) => t.channel === channel);
}
```
Запуск: `npx vitest run src/state/node-template-options.test.ts` → **PASS** (4 теста).

**Коммит:** `feat(block5): single-source template options filtered by node channel (aim #9)`

---

### Задача 3 — Правки 9+10: компонент NodeTemplateSelect (имя + предпросмотр + «создать»)

Файлы: новый `src/sections/campaigns/node-template-select.tsx` + тест `src/sections/campaigns/node-template-select.test.tsx`.

Простой select на тех же примитивах, что `NodeFieldCombobox` (Popover + Command), но опции — `MessageTemplate[]`. Пропсы (контракт со швом 1):
```ts
{
  label: string;            // "Шаблон"
  templates: MessageTemplate[]; // уже отфильтрованы по каналу (задача 2)
  selectedName: string;     // текущее имя (или "")
  isDirty: boolean;
  readOnly?: boolean;
  onSelect: (template: MessageTemplate) => void;
  onPreview: (templateId: string) => void;     // SEAM block6
  onCreate: () => void;                          // SEAM block6 (channel замкнут вызывающим)
}
```
Рендер: строка-триггер (как combobox: лейбл слева, значение/«—», карандаш). В попапе — `CommandItem` на каждый шаблон: слева `{t.name}`, справа кнопка-иконка `<Eye/>` (lucide) с `aria-label="Предпросмотр"`, `onClick` → `e.stopPropagation(); onPreview(t.id)` (НЕ закрывает попап — не вызываем `setOpen(false)`). Клик по телу пункта → `onSelect(t); setOpen(false)`. Последний пункт после `CommandSeparator`: `CommandItem` «Создать новый шаблон» (иконка `<Plus/>`), `onSelect` → `onCreate(); setOpen(false)`. Пустой список → `CommandEmpty` «Нет шаблонов для этого канала». Все строки русские.

**RED** — `node-template-select.test.tsx` (RTL + jsdom, как `template-drawer.test.tsx`):
```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NodeTemplateSelect } from "./node-template-select";
import type { MessageTemplate } from "@/state/app-state";

const TPLS: MessageTemplate[] = [
  { id: "t1", channel: "sms", name: "SMS — напоминание", content: { kind: "sms", text: "x", alphaName: "A", scheduledAt: "immediate" }, usedInCampaigns: 0 },
  { id: "t2", channel: "sms", name: "SMS — акция", content: { kind: "sms", text: "y", alphaName: "A", scheduledAt: "immediate" }, usedInCampaigns: 0 },
];

function open() {
  fireEvent.click(screen.getByRole("button", { name: /Шаблон/i }));
}

describe("NodeTemplateSelect", () => {
  it("lists template names for the channel", () => {
    render(<NodeTemplateSelect label="Шаблон" templates={TPLS} selectedName="" isDirty={false} onSelect={vi.fn()} onPreview={vi.fn()} onCreate={vi.fn()} />);
    open();
    expect(screen.getByText("SMS — напоминание")).toBeInTheDocument();
    expect(screen.getByText("SMS — акция")).toBeInTheDocument();
  });

  it("selecting a template fires onSelect with that template", () => {
    const onSelect = vi.fn();
    render(<NodeTemplateSelect label="Шаблон" templates={TPLS} selectedName="" isDirty={false} onSelect={onSelect} onPreview={vi.fn()} onCreate={vi.fn()} />);
    open();
    fireEvent.click(screen.getByText("SMS — акция"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "t2" }));
  });

  it("preview button fires onPreview(id) without selecting", () => {
    const onSelect = vi.fn(); const onPreview = vi.fn();
    render(<NodeTemplateSelect label="Шаблон" templates={TPLS} selectedName="" isDirty={false} onSelect={onSelect} onPreview={onPreview} onCreate={vi.fn()} />);
    open();
    fireEvent.click(screen.getAllByRole("button", { name: "Предпросмотр" })[0]);
    expect(onPreview).toHaveBeenCalledWith("t1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("«Создать новый шаблон» fires onCreate", () => {
    const onCreate = vi.fn();
    render(<NodeTemplateSelect label="Шаблон" templates={TPLS} selectedName="" isDirty={false} onSelect={vi.fn()} onPreview={vi.fn()} onCreate={onCreate} />);
    open();
    fireEvent.click(screen.getByText("Создать новый шаблон"));
    expect(onCreate).toHaveBeenCalled();
  });

  it("empty channel shows the russian empty state", () => {
    render(<NodeTemplateSelect label="Шаблон" templates={[]} selectedName="" isDirty={false} onSelect={vi.fn()} onPreview={vi.fn()} onCreate={vi.fn()} />);
    open();
    expect(screen.getByText("Нет шаблонов для этого канала")).toBeInTheDocument();
  });
});
```
Запуск: `npx vitest run src/sections/campaigns/node-template-select.test.tsx` → **FAIL** (компонента нет).

**GREEN** — реализовать `NodeTemplateSelect` по образцу `NodeFieldCombobox` (Popover/Command, `shouldFilter={false}`), импорт `Eye, Plus, Pencil` из `lucide-react`. readonly-ветка как в combobox (просто текст без попапа). Preview-кнопка — вложенный `<button type="button">` внутри `CommandItem` с `onClick` `stopPropagation`.

Запуск: → **PASS** (5 тестов).

**Коммит:** `feat(block5): NodeTemplateSelect — select with per-item preview + create (aim #9,#10)`

---

### Задача 4 — Правка 9/10: подключить NodeTemplateSelect в NodeCardBody (со швом блока 6)

Файл: `src/sections/campaigns/node-card-content.tsx`.

В `NodeCardBody`: добавить `const chat = useChat();` (импорт `useChat` из `@/state/chat-context`) и `useAppState` для чтения `templates`. В цикле рендера строк — ветку для `control === "template"`, ДО combo-ветки (262):
```tsx
if (control === "template" && data.params) {
  const channel = channelForNodeKind(data.params.kind);
  const opts = templateOptionsForKind(templates, data.params.kind);
  // SEAM(block6): стабы до влития блока 6 (см. план, раздел Seams §1).
  const openTemplateCreate = () => {
    // TODO(block6): открыть дровер создания, преднастроенный на channel.
    chat.openTemplateDrawer();
  };
  const openTemplatePreview = (_id: string) => {
    // TODO(block6): открыть предпросмотр шаблона по id, не закрывая селект.
  };
  if (readOnly) return (/* readonly row как combo-ветка */);
  const paramKey = meta!.paramKey!;
  return (
    <NodeTemplateSelect
      key={row.label}
      label={row.label}
      templates={opts}
      selectedName={row.value === "—" ? "" : row.value}
      isDirty={isDirty}
      onSelect={(t) => {
        // применяем компоненты шаблона в params ноды (см. «Модель»: путь 1).
        applyFieldValue(paramKey, t.content[paramKey as keyof NodeParams] as string ?? t.name);
      }}
      onPreview={openTemplatePreview}
      onCreate={openTemplateCreate}
    />
  );
}
```
Импорты сверху: `import { useChat } from "@/state/chat-context";`, `import { useAppState } from "@/state/app-state-context";`, `import { NodeTemplateSelect } from "./node-template-select";`, `import { channelForNodeKind, templateOptionsForKind } from "@/state/node-template-options";`, `import type { Channel } from "@/types/campaign";`. Достать `const { templates } = useAppState();`.

**RED/GREEN тест** — этот wiring зависит от провайдеров (useChat/useAppState), поэтому покрываем его на уровне smoke через существующий тип-чек + lint, а поведенческие гарантии уже зафиксированы в задачах 1–3 (editability → «Шаблон»+control template; опции по каналу; select-поведение). Явный e2e-сценарий «выбор шаблона ставит param» добавим в задаче 7 как unit над `applyFieldValue`-эффектом, без поднятия всей карточки.

Проверка: `npx tsc --noEmit` → без ошибок; `npm run lint` (или `npx eslint src/sections/campaigns/node-card-content.tsx`) → clean. Запустить dev `-p 3001`, открыть ноду sms → видно поле «Шаблон» (селект), нет «Текст».

**Коммит:** `feat(block5): wire NodeTemplateSelect into NodeCardBody (aim #9,#10)`

---

### Задача 5 — Правка 11: вопрос в чате даёт answer, а не мутацию ноды

Файл: `src/sections/shell/use-assist-runner.ts` (ветка `case "node-params"` 91–97), тест `src/sections/shell/use-assist-runner.test.ts`.

Сейчас `node-params` диспатчит `workflow_node_field_set` (мутирует ноду). Теперь свободные текстовые поля убраны (задачи 1,4) — правка текста ноды через чат не имеет смысла; вопрос должен **отвечаться**. Загейтить: вместо мутации класть `r.confirmation` в `confirmations` как ответ, **не** диспатчить.

**RED** — добавить в `use-assist-runner.test.ts`:
```ts
it("node-params → отвечает текстом, НЕ мутирует ноду (aim #11)", () => {
  const d = makeDeps();
  executeAssistResults(
    [{ kind: "node-params", nodeId: "n1", patch: { text: "x" }, confirmation: "Текст задаётся через шаблон." } as AssistResult],
    d
  );
  // не диспатчим workflow_node_field_set
  expect(d.dispatch).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: "workflow_node_field_set" })
  );
  // закрываем пузырь подтверждением как ответом
  expect(d.chat.updatePending).toHaveBeenCalledWith("P", "Текст задаётся через шаблон.");
});
```
Запуск: `npx vitest run src/sections/shell/use-assist-runner.test.ts` → **FAIL** (текущий код диспатчит).

**GREEN** — `use-assist-runner.ts` строки 91–97, заменить тело `case "node-params"`:
```ts
      case "node-params":
        // aim #11: свободные текстовые поля ноды убраны (текст живёт в шаблоне).
        // Вопрос про параметры ноды отвечается, а не мутирует граф.
        confirmations.push(r.confirmation);
        break;
```
(Удаляется `dispatch(workflow_node_field_set ...)` и флаг `graphApplied = true` для этой ветки.) Импорт `NodeParams` (строка 17) остаётся — он ещё используется в `applyFieldValue`? Нет, в этом файле `NodeParams` использовался только здесь (строка 93). Убрать неиспользуемый импорт `import type { NodeParams } ...` (17), иначе lint-ошибка.

Запуск: → **PASS**. Прогнать весь файл: `npx vitest run src/sections/shell/use-assist-runner.test.ts` (все 11 — старый тест про node-params, если был, обновить/убрать).

**Коммит:** `fix(block5): chat answers node-params instead of mutating node text (aim #11)`

---

### Задача 6 — Правка 11: смягчить bias на selectedNode в orchestrator-prompt (шов §2)

Файл: `src/lib/ai/orchestrator-prompt.ts` строки 38–42 (только этот участок — см. шов §2).

Сейчас при `selectedNode` промпт сообщает модели выбранную ноду. С убранными текстовыми полями модель не должна предлагать правку текста ноды как `node-params`. Добавить уточнение, что текст коммуникаций задаётся **шаблоном** (через UI-селект), а не правкой полей через чат.

**GREEN** (нет отдельного RED — это строковый промпт; проверяем существующим snapshot/構成 тестом, если есть, иначе tsc+lint):
```ts
    // BLOCK5-EDIT(node-params bias): текст коммуникаций — через шаблон, не через чат
    ...(context.selectedNode
      ? [
          `Выбрана нода: [${context.selectedNode.id}] "${context.selectedNode.label}" (${context.selectedNode.nodeType}). ` +
          `Текст и заголовок коммуникационных нод задаются ШАБЛОНОМ через интерфейс, а не правкой полей через чат — на вопрос о тексте отвечай (answer), не предлагай node-params.`,
        ]
      : []),
    // /BLOCK5-EDIT
```
Проверка: `npx tsc --noEmit` clean; если есть `orchestrator-prompt.test.ts` — прогнать (`grep -l buildSystemPrompt src/lib/ai/*.test.ts`). Менять **только** помеченный диапазон 38–42.

**Коммит:** `chore(block5): de-bias node-params in orchestrator prompt (aim #11, seam with block7)`

---

### Задача 7 — Регрессия + финальная проверка

1. Полный прогон: `npm test` → ожидаем **all passed** (новые файлы: `node-template-options.test.ts`, `node-template-select.test.tsx`; изменённые: `node-field-editability.test.ts`, `use-assist-runner.test.ts`).
2. Тип-чек: `npx tsc --noEmit` → нет ошибок.
3. Линт: `npm run lint` → clean (особенно неиспользуемый импорт `NodeParams` в use-assist-runner).
4. Dev smoke (`-p 3001`): открыть sms/email/push ноду → поле «Шаблон» как селект, фильтр по каналу, кнопка предпросмотра у пунктов, пункт «Создать новый шаблон»; свободных «Текст»/«Заголовок» нет. В чате спросить «какой текст у ноды» → приходит ответ, граф не меняется.
5. Греп-проверка чистоты: `grep -rn "FIELD_PRESETS\|getFieldOptions" src/sections/campaigns/node-card-content.tsx` → пусто для template-полей (combo-поля прочих нод — landing/success/end/ivr/email.Тема — продолжают использовать combo, это ОК и вне скоупа правки 10).

**Коммит (если нужны мелкие правки):** `test(block5): full regression for node template select (aim #9,#10,#11)`

---

## Чеклист соответствия спеке

- **Правка 9** (единый источник) — задача 2: ноды читают `app-state.templates` (тот же массив, что карточки Артефактов), фильтр по каналу. ✓
- **Правка 10** (убрать свободные поля) — задача 1 (editability + рендереры в синхроне, ключ = RU-лейбл) + задача 4 (рендер селекта). ✓
- **Правка 11** (убрать чат-правку текста) — задача 5 (`node-params`→answer) + задача 6 (de-bias промпта). `MessageRow`/`ChatHistoryList` НЕ трогаются. ✓
- **Модель** — селект по имени, фильтр по каналу, предпросмотр у пункта (не закрывает селект), «Создать новый шаблон». ✓
- **Шов §1 (дровер)** — контракт `openTemplateCreate(channel)`/`openTemplatePreview(id)` как пропсы `NodeTemplateSelect`; стабы в `NodeCardBody` с TODO(block6); chat-context не меняется. ✓
- **Шов §2 (orchestrator-prompt)** — минимальная помеченная правка 38–42, координация с блоком 7 задокументирована. ✓
- **Шов §3 (MessageTemplate)** — читаем `id`/`name`/`channel`/`content`; тест ловит contract-break. ✓
- **RU-строки** — «Шаблон», «Создать новый шаблон», «Предпросмотр», «Нет шаблонов для этого канала». ✓
