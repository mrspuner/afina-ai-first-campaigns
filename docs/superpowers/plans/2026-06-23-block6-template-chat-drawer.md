# Создание шаблона в чат-дровере + пикер вариантов — Implementation Plan

> Блок 6 из `docs/superpowers/specs/2026-06-23-aim-batch-decomposition-design.md` — AIM-правки **14** («перенести создание/предпросмотр шаблона из модалки в боковой чат-дровер») и **15** («в пунктах варианта показывать состав компонентов шаблона»).

## Цель

Убрать модальную «мочалку» `TemplateDrawerView` (`src/sections/artifacts/template-drawer.tsx`). Поток создания и предпросмотра шаблона переезжает в **существующий** боковой чат-дровер `ChatDrawer` (`src/sections/shell/chat-drawer.tsx`):

- Каждый вопрос ИИ — **отдельное сообщение ассистента** в `ChatHistoryList` (через `chat.append`).
- Варианты ответа рендерятся в **новом компоненте `VariantPicker`** над промпт-баром (внутри `PromptComposer`).
- На шаге выбора варианта каждый пункт показывает **состав компонентов** шаблона (заголовок / текст / отправитель / …), а не только название (правка 15).
- Экспортируем шовный API для блока 5: `openTemplateCreate(channel)` и `openTemplatePreview(templateId)`.

## Seams / dependencies

- **Этот блок — единоличный владелец `src/state/chat-context.tsx`.** Блок 5 НЕ редактирует этот файл параллельно; он только потребляет экспортируемый API через `useChat()`.
- **Экспортируемый контракт для блока 5** (метод `ChatContextValue`, добавляется в этом блоке):
  - `openTemplateCreate(channel: Channel): void` — открывает дровер сразу на шаге намерения для уже выбранного канала (минуя шаг выбора канала). Для пункта селекта «создать новый шаблон» в ноде.
  - `openTemplatePreview(templateId: string): void` — открывает дровер в режиме предпросмотра, показывая ИИ-расписанные компоненты готового шаблона по id, **не закрывая вызывающий селект** (дровер — отдельный фиксированный `aside`, поверх ничего не закрывает; селект ноды остаётся открытым). Read-only режим: без кнопки «Сохранить».
  - Существующий `openTemplateDrawer()` сохраняется (вызывается из `templates-tab.tsx:55`) — открывает полный поток с шага канала.
- **`MessageTemplate`** (`src/state/app-state.ts:93`) — общая форма с блоком 2; этот блок её НЕ меняет, только диспатчит `template_added` (как сейчас в `template-drawer.tsx:194`).
- **API route** `src/app/api/ai/create-template/route.ts` — не меняем (контракт `{channel,intent}` → `{variants:[{name,content}]}` остаётся). Поле `components` для правки 15 **выводится на клиенте** из `content` (NodeParams), а не запрашивается у модели.
- **`motion/react`** — drawer-анимация уже используется (`motion.aside`, `AnimatePresence`, `transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}` в `chat-drawer.tsx:52–63`). VariantPicker анимируем тем же easing (ease-out-quint-подобный bezier), opacity+transform, без bounce (PRODUCT.md принцип 8). Новых motion-API не вводим.
- **Примитивы:** `cmdk` установлен, `src/components/ui/command.tsx` присутствует. НО пикер — это узкая нумерованная панель с ручной ↑↓/Enter/цифровой навигацией над композером, а не overlay command-palette. Реализуем **на чистом React** (локальный `activeIndex` + `onKeyDown`), без `Command`/`cmdk` — это проще и точнее ложится на анатомию из референса. (Зафиксировано: cmdk доступен, но не нужен.)

## Анатомия `VariantPicker` (из референса пользователя, все строки — русские)

```
┌──────────────────────────────────────────────┐
│  <текст вопроса>                          ✕   │  ← заголовок = вопрос + закрыть
├──────────────────────────────────────────────┤
│  1  Вариант 1            заголовок · текст  ⏎ │  ← активная строка: ⏎ справа
│  2  Вариант 2            тема · текст · …      │     под названием — состав компонентов (#15)
│  3  Вариант 3            …                     │
├──────────────────────────────────────────────┤
│  ✎  Другой вариант              [ Пропустить ]│  ← ТОЛЬКО если allowFreeInput=true
└──────────────────────────────────────────────┘
   [ композер: «Или напишите ответ…» ]
   ↑↓ — навигация · Enter — выбрать · или впишите ниже   ← хинт-строка
```

- Заголовок панели = текст текущего вопроса; справа `✕` (`X` из lucide), `aria-label="закрыть"` → закрывает дровер-поток (`closeTemplateDrawer`).
- Пронумерованные опции `1, 2, 3…`. Навигация `↑`/`↓` меняет `activeIndex`; `Enter` выбирает активную; цифровые клавиши `1`–`9` выбирают опцию по номеру. У активной строки справа — иконка `⏎` (`CornerDownLeft` из lucide).
- Под названием опции — **состав компонентов** (правка 15): чипсы/строка вида `заголовок · текст · отправитель`, выведенные из `variant.components`.
- Строка «Другой вариант» (иконка `Pencil`) + кнопка «Пропустить» справа — рендерятся **только** когда `question.allowFreeInput === true`. Для закрытых множеств (выбор канала SMS/Email/Push/Звонок) — НЕ рендерятся.
- Композер ниже (существующий `PromptComposer`) с русским плейсхолдером «Или напишите ответ…».
- Хинт-строка под композером: `↑↓ — навигация · Enter — выбрать · или впишите ниже`.

## Модель вопроса (новый тип в chat-context)

```ts
export interface TemplateQuestionOption {
  id: string;
  label: string;            // «SMS», «Вариант 1», …
  /** Состав компонентов шаблона (#15): человекочитаемые имена полей. */
  components?: string[];    // ["заголовок","текст","отправитель"]
}

export interface TemplateQuestion {
  /** Текст вопроса = заголовок пикера и текст сообщения ассистента. */
  prompt: string;
  options: TemplateQuestionOption[];
  /** Для закрытых множеств (канал) = false → строки «Другой вариант»/«Пропустить» нет. */
  allowFreeInput: boolean;
}
```

`TemplateDrawerState` расширяется полем `mode: "create" | "preview"` и `question: TemplateQuestion | null` (активный вопрос пикера). `TemplateDrawerVariant` расширяется полем `components: string[]`.

## Состав компонентов по каналу (вывод из NodeParams на клиенте, правка 15)

Хелпер `templateComponentLabels(content: NodeParams): string[]` (новый файл `src/state/template-components.ts`, чистая функция → тестируется отдельно):

| kind  | поля NodeParams (`src/types/workflow.ts`)              | русские лейблы компонентов            |
|-------|--------------------------------------------------------|----------------------------------------|
| sms   | `text`, `alphaName`, (`link?`)                         | «текст», «отправитель», («ссылка»)     |
| email | `subject`, `body`, `sender`, (`link?`)                 | «тема», «текст», «отправитель», («ссылка») |
| push  | `title`, `body`, (`deeplink?`)                         | «заголовок», «текст», («диплинк»)      |
| ivr   | `scenario`, `voiceType`                                | «сценарий», «голос»                    |

Опциональные поля включаются в список только если присутствуют в `content`.

---

## Задачи (TDD, bite-sized)

> Worktree (AGENTS.md):
> ```bash
> git worktree add .worktrees/block6-template-chat-drawer -b feature/block6-template-chat-drawer main
> cd .worktrees/block6-template-chat-drawer && npm install
> ```
> Dev-сервер при необходимости — `npm run dev -- -p 3001` (основной порт 3000 у другого worktree). Проверки в этом worktree: `npm run test`, `npm run lint`.

### Задача 1 — Хелпер состава компонентов (правка 15, чистая функция)

**Файлы:** новый `src/state/template-components.ts`, новый `src/state/template-components.test.ts`.

1.1 **Red.** Написать `src/state/template-components.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { templateComponentLabels } from "./template-components";

describe("templateComponentLabels", () => {
  it("sms → текст, отправитель", () => {
    expect(templateComponentLabels({ kind: "sms", text: "Привет", alphaName: "Bank", scheduledAt: "immediate" }))
      .toEqual(["текст", "отправитель"]);
  });
  it("sms с link добавляет ссылку", () => {
    expect(templateComponentLabels({ kind: "sms", text: "x", alphaName: "B", scheduledAt: "immediate", link: "https://x" }))
      .toEqual(["текст", "отправитель", "ссылка"]);
  });
  it("email → тема, текст, отправитель", () => {
    expect(templateComponentLabels({ kind: "email", subject: "S", body: "B", sender: "S" }))
      .toEqual(["тема", "текст", "отправитель"]);
  });
  it("push → заголовок, текст", () => {
    expect(templateComponentLabels({ kind: "push", title: "T", body: "B" }))
      .toEqual(["заголовок", "текст"]);
  });
  it("ivr → сценарий, голос", () => {
    expect(templateComponentLabels({ kind: "ivr", scenario: "S", voiceType: "female" }))
      .toEqual(["сценарий", "голос"]);
  });
});
```
Запуск: `npm run test -- template-components` → **ожидаем FAIL** (модуль не существует).

1.2 **Green.** Создать `src/state/template-components.ts`:
```ts
import type { NodeParams } from "@/types/workflow";

/**
 * Состав компонентов шаблона по каналу — человекочитаемые русские лейблы
 * полей (#15). Опциональные поля включаются только при наличии в content.
 */
export function templateComponentLabels(content: NodeParams): string[] {
  switch (content.kind) {
    case "sms": {
      const out = ["текст", "отправитель"];
      if (content.link) out.push("ссылка");
      return out;
    }
    case "email": {
      const out = ["тема", "текст", "отправитель"];
      if (content.link) out.push("ссылка");
      return out;
    }
    case "push": {
      const out = ["заголовок", "текст"];
      if (content.deeplink) out.push("диплинк");
      return out;
    }
    case "ivr":
      return ["сценарий", "голос"];
    default:
      return [];
  }
}
```
Запуск: `npm run test -- template-components` → **ожидаем 5 passed**.

**Commit:** `feat(templates): templateComponentLabels helper for variant makeup (aim #15)`

---

### Задача 2 — Расширить chat-context: типы вопроса, mode, components, новые actions

**Файлы:** `src/state/chat-context.tsx`, `src/state/chat-context.test.ts`. **Единоличный владелец.**

2.1 **Red.** Дописать в `src/state/chat-context.test.ts` (после блока `templateDrawer slice (#15)`):
```ts
describe("chatReducer — template create/preview seam (#14)", () => {
  it("open_template_create opens at intent step for the given channel", () => {
    const s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_create", channel: "sms" });
    expect(s.templateDrawer.open).toBe(true);
    expect(s.templateDrawer.mode).toBe("create");
    expect(s.templateDrawer.channel).toBe("sms");
    expect(s.templateDrawer.step).toBe("intent");
  });

  it("open_template_preview opens in preview mode with templateId", () => {
    const s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_preview", templateId: "tpl_1" });
    expect(s.templateDrawer.open).toBe(true);
    expect(s.templateDrawer.mode).toBe("preview");
    expect(s.templateDrawer.previewTemplateId).toBe("tpl_1");
  });

  it("set_template_question stores the active picker question", () => {
    let s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_drawer" });
    const question = {
      prompt: "Выберите канал",
      allowFreeInput: false,
      options: [{ id: "sms", label: "SMS" }, { id: "email", label: "Email" }],
    };
    s = chatReducer(s, { type: "set_template_question", question });
    expect(s.templateDrawer.question?.prompt).toBe("Выберите канал");
    expect(s.templateDrawer.question?.allowFreeInput).toBe(false);
  });

  it("set_template_variants carries components per variant (#15)", () => {
    let s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_drawer" });
    s = chatReducer(s, { type: "set_template_channel", channel: "email" });
    s = chatReducer(s, {
      type: "set_template_variants",
      variants: [
        { id: "v1", name: "A", content: { kind: "email", subject: "S", body: "B", sender: "S" }, components: ["тема", "текст", "отправитель"] },
      ],
    });
    expect(s.templateDrawer.variants[0].components).toEqual(["тема", "текст", "отправитель"]);
  });

  it("open_template_drawer default mode is create", () => {
    const s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_drawer" });
    expect(s.templateDrawer.mode).toBe("create");
  });
});
```
Запуск: `npm run test -- chat-context` → **ожидаем FAIL** (новые actions/поля отсутствуют).

2.2 **Green.** В `src/state/chat-context.tsx`:

a) Добавить типы перед `TemplateDrawerState` (рядом со строкой 33):
```ts
export interface TemplateDrawerVariant {
  id: string;
  name: string;
  content: NodeParams;
  /** Состав компонентов шаблона (#15) — человекочитаемые имена полей. */
  components: string[];
}

export interface TemplateQuestionOption {
  id: string;
  label: string;
  /** Состав компонентов варианта (#15). */
  components?: string[];
}

export interface TemplateQuestion {
  /** Текст вопроса = заголовок пикера и текст assistant-сообщения. */
  prompt: string;
  options: TemplateQuestionOption[];
  /** false для закрытых множеств (канал) → нет строки «Другой вариант»/«Пропустить». */
  allowFreeInput: boolean;
}
```
> Примечание: `components` стало обязательным в `TemplateDrawerVariant`. Подправить тип-тесты в `chat-context.test.ts` (existing variants в `set_template_variants` test, строка ~186) — добавить `components: [...]`, иначе TS-ошибка в тесте.

b) Расширить `TemplateDrawerState` (строки 43–51):
```ts
export interface TemplateDrawerState {
  open: boolean;
  mode: "create" | "preview";
  step: "channel" | "intent" | "variants";
  channel: Channel | null;
  intent: string;
  variants: TemplateDrawerVariant[];
  selectedId: string | null;
  generating: boolean;
  /** Активный вопрос пикера (#14). */
  question: TemplateQuestion | null;
  /** id шаблона в режиме preview (#14, шов для блока 5). */
  previewTemplateId: string | null;
}
```

c) Добавить варианты в `ChatAction` (после строки 103):
```ts
  | { type: "open_template_create"; channel: Channel }
  | { type: "open_template_preview"; templateId: string }
  | { type: "set_template_question"; question: TemplateQuestion };
```

d) Добавить кейсы в `chatReducer` (рядом со строкой 167):
```ts
    case "open_template_create": {
      return {
        ...state,
        templateDrawer: {
          ...INITIAL_TEMPLATE_DRAWER,
          open: true,
          mode: "create",
          channel: action.channel,
          step: "intent",
        },
      };
    }
    case "open_template_preview": {
      return {
        ...state,
        templateDrawer: {
          ...INITIAL_TEMPLATE_DRAWER,
          open: true,
          mode: "preview",
          previewTemplateId: action.templateId,
        },
      };
    }
    case "set_template_question": {
      return {
        ...state,
        templateDrawer: { ...state.templateDrawer, question: action.question },
      };
    }
```
В `open_template_drawer` (строка 167) добавить `mode: "create"` явно (через spread `INITIAL_TEMPLATE_DRAWER` — он уже задаёт; см. ниже).

e) Обновить `INITIAL_TEMPLATE_DRAWER` (строки 215–223):
```ts
const INITIAL_TEMPLATE_DRAWER: TemplateDrawerState = {
  open: false,
  mode: "create",
  step: "channel",
  channel: null,
  intent: "",
  variants: [],
  selectedId: null,
  generating: false,
  question: null,
  previewTemplateId: null,
};
```

f) Расширить `ChatContextValue` (строки 273–281) и провайдер (361–382, 384–429):
```ts
  // в интерфейсе:
  openTemplateCreate: (channel: Channel) => void;
  openTemplatePreview: (templateId: string) => void;
  setTemplateQuestion: (question: TemplateQuestion) => void;
```
```ts
  // в ChatProvider:
  const openTemplateCreate = useCallback(
    (channel: Channel) => dispatch({ type: "open_template_create", channel }),
    []
  );
  const openTemplatePreview = useCallback(
    (templateId: string) => dispatch({ type: "open_template_preview", templateId }),
    []
  );
  const setTemplateQuestion = useCallback(
    (question: TemplateQuestion) => dispatch({ type: "set_template_question", question }),
    []
  );
```
Добавить три в объект `value` и в массив зависимостей `useMemo`.

g) Также подправить тест из задачи 2.1 `set_template_variants` (строка ~186 в существующем `#15` блоке) — variants теперь требуют `components`.

Запуск: `npm run test -- chat-context` → **ожидаем all passed**. `npm run lint` чисто.

**Commit:** `feat(chat-context): template create/preview seam + question model + variant components (aim #14, #15)`

---

### Задача 3 — Компонент `VariantPicker` (нумерованные опции, клавиатура, состав компонентов)

**Файлы:** новый `src/sections/shell/variant-picker.tsx`, новый `src/sections/shell/variant-picker.test.tsx`. Чистый presentational (как `TemplateDrawerView` был) — props in, callbacks out. **Все строки русские.**

3.1 **Red.** `src/sections/shell/variant-picker.test.tsx`:
```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VariantPicker } from "./variant-picker";
import type { TemplateQuestion } from "@/state/chat-context";

const closedQuestion: TemplateQuestion = {
  prompt: "Выберите канал",
  allowFreeInput: false,
  options: [
    { id: "sms", label: "SMS" },
    { id: "email", label: "Email" },
    { id: "push", label: "Push" },
  ],
};

const openQuestion: TemplateQuestion = {
  prompt: "Выберите вариант",
  allowFreeInput: true,
  options: [
    { id: "v1", label: "Вариант 1", components: ["тема", "текст", "отправитель"] },
    { id: "v2", label: "Вариант 2", components: ["тема", "текст"] },
  ],
};

const base = { onSelect: () => {}, onClose: () => {}, onSkip: () => {} };

describe("VariantPicker", () => {
  it("renders the question text as panel header", () => {
    render(<VariantPicker question={closedQuestion} {...base} />);
    expect(screen.getByText("Выберите канал")).toBeInTheDocument();
  });

  it("renders numbered options 1,2,3", () => {
    render(<VariantPicker question={closedQuestion} {...base} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows component makeup for each option (#15)", () => {
    render(<VariantPicker question={openQuestion} {...base} />);
    expect(screen.getByText(/тема · текст · отправитель/)).toBeInTheDocument();
  });

  it("calls onSelect with option id on click", () => {
    const onSelect = vi.fn();
    render(<VariantPicker question={closedQuestion} {...base} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Email"));
    expect(onSelect).toHaveBeenCalledWith("email");
  });

  it("Enter selects the active (first) option", () => {
    const onSelect = vi.fn();
    render(<VariantPicker question={closedQuestion} {...base} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByTestId("variant-picker"), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("sms");
  });

  it("ArrowDown then Enter selects the second option", () => {
    const onSelect = vi.fn();
    render(<VariantPicker question={closedQuestion} {...base} onSelect={onSelect} />);
    const root = screen.getByTestId("variant-picker");
    fireEvent.keyDown(root, { key: "ArrowDown" });
    fireEvent.keyDown(root, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("email");
  });

  it("number key selects the matching option", () => {
    const onSelect = vi.fn();
    render(<VariantPicker question={closedQuestion} {...base} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByTestId("variant-picker"), { key: "2" });
    expect(onSelect).toHaveBeenCalledWith("email");
  });

  it("HIDES «Другой вариант»/«Пропустить» for a closed question", () => {
    render(<VariantPicker question={closedQuestion} {...base} />);
    expect(screen.queryByText("Другой вариант")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Пропустить" })).not.toBeInTheDocument();
  });

  it("SHOWS «Другой вариант»/«Пропустить» for an open question", () => {
    render(<VariantPicker question={openQuestion} {...base} />);
    expect(screen.getByText("Другой вариант")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Пропустить" })).toBeInTheDocument();
  });

  it("renders the navigation hint line", () => {
    render(<VariantPicker question={openQuestion} {...base} />);
    expect(screen.getByText(/↑↓ — навигация · Enter — выбрать · или впишите ниже/)).toBeInTheDocument();
  });

  it("calls onClose when ✕ pressed", () => {
    const onClose = vi.fn();
    render(<VariantPicker question={closedQuestion} {...base} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "закрыть" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onSkip when «Пропустить» pressed (open only)", () => {
    const onSkip = vi.fn();
    render(<VariantPicker question={openQuestion} {...base} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button", { name: "Пропустить" }));
    expect(onSkip).toHaveBeenCalled();
  });
});
```
Запуск: `npm run test -- variant-picker` → **ожидаем FAIL** (нет модуля).

3.2 **Green.** `src/sections/shell/variant-picker.tsx`:
```tsx
"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { X, CornerDownLeft, Pencil } from "lucide-react";
import type { TemplateQuestion } from "@/state/chat-context";

export interface VariantPickerProps {
  question: TemplateQuestion;
  onSelect: (optionId: string) => void;
  onClose: () => void;
  /** Только для allowFreeInput-вопросов. */
  onSkip: () => void;
}

/**
 * Пикер вариантов над промпт-баром (#14). Нумерованные опции с навигацией
 * ↑↓ / Enter / цифры; у активного пункта — иконка ⏎. Под названием опции —
 * состав компонентов шаблона (#15). Строка «Другой вариант» + «Пропустить»
 * показывается только для вопросов с allowFreeInput. Все строки русские.
 */
export function VariantPicker({ question, onSelect, onClose, onSkip }: VariantPickerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const count = question.options.length;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % count);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + count) % count);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = question.options[activeIndex];
      if (opt) onSelect(opt.id);
    } else if (/^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      const opt = question.options[idx];
      if (opt) {
        e.preventDefault();
        onSelect(opt.id);
      }
    }
  }

  return (
    <motion.div
      data-testid="variant-picker"
      role="listbox"
      aria-label={question.prompt}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="mb-2 flex flex-col overflow-hidden rounded-[10px] border border-white/10 bg-[#131313]"
    >
      {/* Header = question text + close */}
      <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
        <span className="text-xs font-medium text-white/90">{question.prompt}</span>
        <button
          type="button"
          aria-label="закрыть"
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Numbered options */}
      <ul className="flex flex-col py-1">
        {question.options.map((opt, i) => {
          const active = i === activeIndex;
          return (
            <li key={opt.id}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => onSelect(opt.id)}
                className={[
                  "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors",
                  active ? "bg-primary/10 text-white" : "text-white/80 hover:bg-white/5",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px]",
                    active ? "bg-primary/20 text-primary" : "bg-white/8 text-white/50",
                  ].join(" ")}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{opt.label}</span>
                  {opt.components && opt.components.length > 0 && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {opt.components.join(" · ")}
                    </span>
                  )}
                </span>
                {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Free-input row — ONLY for open questions */}
      {question.allowFreeInput && (
        <div className="flex items-center justify-between border-t border-white/8 px-3 py-2">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Pencil className="h-3 w-3" />
            Другой вариант
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="rounded border border-white/15 px-2 py-0.5 text-xs text-white/70 hover:border-white/30 hover:text-white"
          >
            Пропустить
          </button>
        </div>
      )}
    </motion.div>
  );
}
```
> Хинт-строка (`↑↓ — навигация · Enter — выбрать · или впишите ниже`) рендерится в `PromptComposer` под композером (задача 5), чтобы быть физически под полем ввода — но тест на неё в этом файле ожидает её в дереве. Решение: вынести хинт в маленький экспортируемый компонент `VariantPickerHint` в этом же файле и рендерить его внутри `VariantPicker` (под free-input строкой / в самом низу панели), чтобы тест 3.1 проходил, а `PromptComposer` не дублировал. Финальное размещение: хинт — нижняя строка панели пикера.

Добавить в конец `variant-picker.tsx`:
```tsx
export const VARIANT_PICKER_HINT = "↑↓ — навигация · Enter — выбрать · или впишите ниже";
```
и в JSX `VariantPicker` после `<ul>`/free-input блока:
```tsx
      <p className="border-t border-white/8 px-3 py-1.5 text-[11px] text-muted-foreground">
        {VARIANT_PICKER_HINT}
      </p>
```

Запуск: `npm run test -- variant-picker` → **ожидаем all passed**. `npm run lint` чисто.

**Commit:** `feat(shell): VariantPicker — numbered keyboard picker with component makeup (aim #14, #15)`

---

### Задача 4 — Прокинуть VariantPicker в чат-дровер над промпт-баром

**Файлы:** `src/sections/shell/prompt-composer.tsx`. Тест-покрытие — через задачу 6 (orchestration). Здесь — wiring.

4.1 В `PromptComposer` (`prompt-composer.tsx`) подтянуть `chat.templateDrawer.question` и операции. Над `<PromptInput>` (строка 381) отрендерить `VariantPicker`, когда дровер открыт и есть активный вопрос:
```tsx
import { VariantPicker } from "./variant-picker";
// ...
const tplQuestion = chat.templateDrawer.open ? chat.templateDrawer.question : null;
// ...
return (
  <>
    <SelectedNodeChipEffect ... />
    {tplQuestion && (
      <VariantPicker
        question={tplQuestion}
        onSelect={(id) => handleTemplateAnswer(id)}
        onClose={chat.closeTemplateDrawer}
        onSkip={() => handleTemplateAnswer(null)}
      />
    )}
    <PromptInput onSubmit={handlePromptSubmit} className={inputClassName}>
      <ChipEditableInput ... placeholder={tplQuestion ? "Или напишите ответ…" : placeholder} ... />
      ...
```
- Когда активен вопрос шаблона, плейсхолдер композера — `"Или напишите ответ…"` (русский).
- `handleTemplateAnswer(optionIdOrNull)` — диспатчер шага потока (задача 5): для closed-вопроса канал → переходит к намерению; свободный текст из композера для open-вопроса роутится туда же (ветка в `handlePromptSubmit`: если `tplQuestion`, отправить как ответ, а не в `chatSubmit`).

> Контроллер потока (`handleTemplateAnswer`, генерация вопросов, append assistant-сообщений) живёт в новом хуке `useTemplateFlow` (задача 5), чтобы `PromptComposer` не раздувался. `PromptComposer` только рендерит пикер и делегирует.

4.2 `npm run lint` + `npm run test` (регрессий нет).

**Commit:** `feat(shell): render VariantPicker above the prompt bar in chat drawer (aim #14)`

---

### Задача 5 — Хук-оркестратор потока `useTemplateFlow` (вопросы как сообщения ассистента)

**Файлы:** новый `src/sections/shell/use-template-flow.ts`, новый `src/sections/shell/use-template-flow.test.ts`. Логика: каждый шаг публикует вопрос ассистента через `chat.append` и ставит `setTemplateQuestion`; ответ продвигает state-машину (channel→intent→variants), на variants — вызывает API `create-template`, мапит ответ в `TemplateDrawerVariant[]` с `components` через `templateComponentLabels`, и публикует вопрос выбора варианта (`allowFreeInput: true`).

5.1 **Red.** `use-template-flow.test.ts` — юнит на чистые части. Вынести генерацию вопросов в чистые функции и тестировать их (хук с fetch/контекстом покрыт интеграционно через DOM в задаче 6). Чистые функции в том же файле:
```ts
import { describe, it, expect } from "vitest";
import { channelQuestion, variantQuestion } from "./use-template-flow";

describe("channelQuestion", () => {
  it("is a closed question with 4 channel options, no free input", () => {
    const q = channelQuestion();
    expect(q.allowFreeInput).toBe(false);
    expect(q.options.map((o) => o.id)).toEqual(["sms", "email", "push", "ivr"]);
    expect(q.options.map((o) => o.label)).toEqual(["SMS", "Email", "Push", "Звонок"]);
  });
});

describe("variantQuestion", () => {
  it("is open and carries component makeup per option (#15)", () => {
    const variants = [
      { id: "v1", name: "Тёплый", content: { kind: "email" as const, subject: "S", body: "B", sender: "S" }, components: ["тема", "текст", "отправитель"] },
    ];
    const q = variantQuestion(variants);
    expect(q.allowFreeInput).toBe(true);
    expect(q.options[0].label).toBe("Тёплый");
    expect(q.options[0].components).toEqual(["тема", "текст", "отправитель"]);
  });
});
```
Запуск: `npm run test -- use-template-flow` → **FAIL**.

5.2 **Green.** `use-template-flow.ts`:
```ts
"use client";

import { useCallback } from "react";
import { nanoid } from "nanoid";
import type { Channel } from "@/types/campaign";
import { CHANNEL_LABEL } from "@/sections/campaigns/campaign-cost";
import { useChat, type TemplateDrawerVariant, type TemplateQuestion } from "@/state/chat-context";
import { useAppDispatch } from "@/state/app-state-context";
import { templateComponentLabels } from "@/state/template-components";

const CHANNELS: Channel[] = ["sms", "email", "push", "ivr"];
const TEMPLATE_GENERATE_URL = "/api/ai/create-template";

export function channelQuestion(): TemplateQuestion {
  return {
    prompt: "Для какого канала создаём шаблон?",
    allowFreeInput: false,
    options: CHANNELS.map((ch) => ({ id: ch, label: CHANNEL_LABEL[ch] })),
  };
}

export function variantQuestion(variants: TemplateDrawerVariant[]): TemplateQuestion {
  return {
    prompt: "Выберите вариант шаблона",
    allowFreeInput: true,
    options: variants.map((v) => ({ id: v.id, label: v.name, components: v.components })),
  };
}

export function useTemplateFlow() {
  const chat = useChat();
  const dispatch = useAppDispatch();

  // Ответ на вопрос канала: сообщение ассистента уже опубликовано при открытии.
  const answerChannel = useCallback(
    (channel: Channel) => {
      chat.append({ role: "user", text: CHANNEL_LABEL[channel] });
      chat.setTemplateChannel(channel);
      chat.append({
        role: "assistant",
        text: "Опишите, что нужно донести клиенту — тему, оффер или тон.",
      });
      chat.setTemplateQuestion({ prompt: "", allowFreeInput: true, options: [] });
      // пустые options → пикер не рендерим; ждём свободный текст из композера.
    },
    [chat]
  );

  const submitIntent = useCallback(
    async (intent: string) => {
      const channel = chat.templateDrawer.channel;
      if (!channel || !intent.trim()) return;
      chat.append({ role: "user", text: intent });
      chat.setTemplateIntent(intent);
      chat.setTemplateQuestion(null as unknown as TemplateQuestion); // скрыть пикер на время генерации
      chat.setTemplateGenerating(true);
      chat.append({ role: "assistant", text: "Готовлю варианты…", pending: true });
      try {
        const res = await fetch(TEMPLATE_GENERATE_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ channel, intent }),
        });
        if (!res.ok) throw new Error("api");
        const json = (await res.json()) as { variants?: Array<{ name: string; content: Record<string, unknown> }> };
        const variants: TemplateDrawerVariant[] = (json.variants ?? []).map((v) => {
          const content = v.content as TemplateDrawerVariant["content"];
          return { id: nanoid(6), name: v.name, content, components: templateComponentLabels(content) };
        });
        chat.setTemplateVariants(variants);
        chat.append({ role: "assistant", text: "Готово. Какой вариант сохранить?" });
        chat.setTemplateQuestion(variantQuestion(variants));
      } catch {
        chat.setTemplateGenerating(false);
        chat.append({ role: "assistant", text: "Не удалось сгенерировать. Попробуйте ещё раз." });
      } finally {
        chat.setTemplateGenerating(false);
      }
    },
    [chat]
  );

  const selectVariant = useCallback(
    (id: string) => {
      const v = chat.templateDrawer.variants.find((x) => x.id === id);
      if (!v || !chat.templateDrawer.channel) return;
      dispatch({
        type: "template_added",
        template: {
          id: `tpl_${nanoid(8)}`,
          channel: chat.templateDrawer.channel,
          name: v.name,
          content: v.content,
          usedInCampaigns: 0,
        },
      });
      chat.append({ role: "assistant", text: `Шаблон «${v.name}» сохранён.` });
      chat.closeTemplateDrawer();
    },
    [chat, dispatch]
  );

  return { answerChannel, submitIntent, selectVariant };
}
```
> `null as unknown as TemplateQuestion` некрасиво — вместо этого `set_template_question` принимает `TemplateQuestion | null`. Подправить action/метод сигнатуру в задаче 2: `setTemplateQuestion: (q: TemplateQuestion | null) => void` и `{ type: "set_template_question"; question: TemplateQuestion | null }`. **Зафиксировать это в задаче 2.2c/2.2f** (исправление inline ниже в self-review).

Запуск: `npm run test -- use-template-flow` → **passed**.

**Commit:** `feat(shell): useTemplateFlow — chat-driven template creation orchestration (aim #14)`

---

### Задача 6 — Связать дровер: open at channel publishes the first question; удалить модалку

**Файлы:** `src/sections/shell/prompt-composer.tsx`, `src/sections/artifacts/template-drawer.tsx`, `src/app/page.tsx`, `src/sections/artifacts/template-drawer.test.tsx`.

6.1 **Открытие потока публикует первый вопрос.** Где `openTemplateDrawer()` вызывается (`templates-tab.tsx:55`) — заменить на orchestration: при открытии нужно `openSidebar()` + append assistant-вопроса канала + `setTemplateQuestion(channelQuestion())`. Чтобы не дублировать, добавить в `useTemplateFlow` метод `start()`:
```ts
const start = useCallback(() => {
  chat.openSidebar();
  chat.openTemplateDrawer();
  chat.append({ role: "assistant", text: "Для какого канала создаём шаблон?" });
  chat.setTemplateQuestion(channelQuestion());
}, [chat]);
```
И `startForChannel(channel)` для блока 5 (минуя выбор канала):
```ts
const startForChannel = useCallback((channel: Channel) => {
  chat.openSidebar();
  chat.openTemplateCreate(channel);   // mode=create, step=intent
  chat.append({ role: "assistant", text: "Опишите, что нужно донести клиенту — тему, оффер или тон." });
  chat.setTemplateQuestion(null);
}, [chat]);
```
Обновить `TemplatesTab` (`templates-tab.tsx:54`) использовать `useTemplateFlow().start()` вместо `chat.openTemplateDrawer()`.

> **Шов для блока 5:** блок 5 НЕ импортирует `useTemplateFlow` (он в shell). Блок 5 вызывает `chat.openTemplateCreate(channel)` / `chat.openTemplatePreview(id)` из chat-context напрямую. Чтобы при этом публиковался вопрос/намерение, оркестрацию первого шага вешаем на **эффект в `PromptComposer`** (единственная точка, где живёт `useTemplateFlow`): следить за `chat.templateDrawer.open && mode==="create" && step==="intent" && !question && messages-без-вопроса` → опубликовать намеренческое сообщение. Проще и надёжнее: задокументировать, что блок 5 для «создать новый» использует **именно** `chat.openTemplateCreate(channel)`, а публикация намеренческого сообщения делается реактивно в `PromptComposer` через `useEffect` на изменение `templateDrawer.open/step`. Реализовать этот эффект здесь.

6.2 **handlePromptSubmit — ветка ответа на вопрос шаблона.** В начало `handlePromptSubmit` (после получения `rawText`, перед веткой 1) добавить:
```ts
if (chat.templateDrawer.open && chat.templateDrawer.mode === "create" && chat.templateDrawer.step === "intent" && rawText.trim()) {
  void templateFlow.submitIntent(rawText);
  resetEditor();
  return;
}
```
Подключить `const templateFlow = useTemplateFlow();` в `PromptComposer`. Связать `VariantPicker` `onSelect`: для канал-вопроса → `templateFlow.answerChannel(id as Channel)`; для вариант-вопроса → `templateFlow.selectVariant(id)`. Различать по `chat.templateDrawer.step` (channel vs variants).

6.3 **Удалить модалку.** В `src/sections/artifacts/template-drawer.tsx` удалить `TemplateDrawerView` (строки 1–171) и connected `TemplateDrawer` (175–253). Удалить монтаж в `src/app/page.tsx:12` (import) и `:159` (`<TemplateDrawer />`). Удалить файл `template-drawer.tsx` целиком ИЛИ оставить пустую заглушку — предпочтительно `git rm`.

6.4 **Удалить устаревший тест модалки.** `git rm src/sections/artifacts/template-drawer.test.tsx` — он тестирует удалённый `TemplateDrawerView`. Поведение покрыто `variant-picker.test.tsx` + `use-template-flow.test.ts` + reducer-тестами.

6.5 Запуск: `npm run test` (вся сюита) → **ожидаем all passed** (после удаления старого теста). `npm run lint` → чисто. `npm run build` → успешно (проверить, что нет висящих импортов `TemplateDrawer`/`TemplateDrawerView` — `grep -rn "TemplateDrawerView\|<TemplateDrawer" src` должен быть пуст).

**Commit:** `refactor(templates): move template create flow into chat drawer; remove modal (aim #14)`

---

### Задача 7 — Smoke в браузере (опционально, dev на 3001)

**Файлы:** none (ручная проверка).

7.1 `npm run dev -- -p 3001`. Артефакты → «Создать шаблон»: дровер открывается справа, ассистент задаёт вопрос канала, пикер над промпт-баром показывает SMS/Email/Push/Звонок **без** «Другой вариант»/«Пропустить». Выбор канала клавишей `2` → следующий вопрос (намерение) с плейсхолдером «Или напишите ответ…». Ввод намерения → варианты с составом компонентов под названием, теперь «Другой вариант»/«Пропустить» видны. Выбор варианта → «Шаблон … сохранён», дровер закрыт, карточка появилась.
7.2 Проверить отсутствие модалки (overlay `bg-black/50` больше не появляется).

**Commit:** (нет, если правок не потребовалось.)

---

## Финальная проверка перед хендоффом

- `npm run test` — вся сюита зелёная (новые: `template-components`, `chat-context` доп., `variant-picker`, `use-template-flow`; удалён `template-drawer.test`).
- `npm run lint` — чисто.
- `npm run build` — успешно; `grep -rn "TemplateDrawerView" src` пуст.
- Отчитаться: worktree path `.worktrees/block6-template-chat-drawer`, branch `feature/block6-template-chat-drawer`. Cleanup — за пользователем.

## Self-review vs спецификация

- **Правка 14 (поток в чат-дровер):** ✓ модалка удалена (задача 6.3), вопросы — отдельные assistant-сообщения через `chat.append` (задача 5), пикер над промпт-баром (задачи 3–4).
- **Правка 15 (состав компонентов в пунктах):** ✓ `templateComponentLabels` (задача 1), `components` в `TemplateDrawerVariant`/`TemplateQuestionOption` (задача 2), рендер строки `components.join(" · ")` (задача 3).
- **Анатомия пикера:** ✓ заголовок=вопрос + ✕; нумерованные опции 1,2,3; ↑↓/Enter/цифры; ⏎ у активной; «Другой вариант»(✎)+«Пропустить» условно; плейсхолдер «Или напишите ответ…»; хинт-строка.
- **RU-only:** ✓ все строки русские; английские строки референса не используются.
- **Closed vs open:** ✓ канал — `allowFreeInput:false` (нет free-input строки); выбор варианта — `allowFreeInput:true` (есть). Тесты на оба случая (задача 3.1).
- **Шов API для блока 5:** ✓ `openTemplateCreate(channel)`, `openTemplatePreview(templateId)` экспортированы из chat-context (задача 2), preview не закрывает вызывающий селект (отдельный `aside`), документирован в «Seams / dependencies».
- **Владение chat-context:** ✓ зафиксировано — единоличный владелец; блок 5 только потребляет.
- **«Not the Next.js you know»:** ✓ motion/react drawer API уже в репо (`motion.aside`/`AnimatePresence`), не выдумываем; cmdk доступен, но осознанно НЕ используем (узкий нумерованный пикер на чистом React).
- **Inline-исправление (выявлено при написании задачи 5):** `setTemplateQuestion` и action `set_template_question` должны принимать `TemplateQuestion | null` (скрытие пикера во время генерации/на шаге свободного намерения), а не только `TemplateQuestion`. Задача 2 уже это учитывает (сигнатуры с `| null`). Тест 2.1 на `set_template_question` остаётся валиден (передаёт непустой question).
- **Inline-исправление (open-намерение без опций):** на шаге намерения пикер не рендерится (`question === null`), ввод идёт свободным текстом из композера → ветка `submitIntent` в `handlePromptSubmit` (задача 6.2). Это согласуется с правкой 14 (вопрос — отдельное сообщение, ответ — в композер).
- **`previewTemplateId` рендер:** preview-режим (`mode==="preview"`) показывает компоненты готового шаблона без кнопки сохранения. Полный UI предпросмотра по id — стыкуется с блоком 5; в этом блоке реализуем state-приём (`open_template_preview`) и место рендера (assistant-сообщение со списком компонентов выбранного шаблона по `previewTemplateId` из `useAppState().templates`). Добавить в задачу 5/6: при `mode==="preview"` публиковать одно assistant-сообщение с составом компонентов шаблона и НЕ показывать пикер.
```
