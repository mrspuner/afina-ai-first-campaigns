# Template UI Punch-List — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать 13 UI-правок из очереди aim (спека `docs/superpowers/specs/2026-07-13-template-ui-punchlist-design.md`): унификация карточек, чистка потока создания шаблона, полировка бюджета/визарда, и мини-фича инлайн-редактирования шаблонов с замком и дублированием.

**Architecture:** Точечные правки существующих компонентов + 2 новых экшена app-state (`template_content_updated`, `template_duplicated`) + опциональный флаг `ChatMessage.format`. Дровер предпросмотра шаблона расширяется до редактора с гейтом по `usedInCampaigns`.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, shadcn/ui (base-ui), motion v12, vitest + testing-library, Streamdown (markdown в чате), lucide-react.

**Worktree:** `.worktrees/template-ui-punchlist` (branch `feature/template-ui-punchlist`, off `main`). Все команды и коммиты — там. Тесты: `npm test -- <path>`; типы: `npx tsc --noEmit`. НЕ запускать `git stash`.

---

## Порядок и зависимости

Независимые «мелкие» (1–5) идут первыми — быстрые победы. Мини-фича редактирования (6–11) идёт по зависимостям: экшены → рендереры → дровер. Карточка (12) последняя — зависит от дровера и экшена дублирования.

---

### Task 1: Карточка сигнала — ховер как у кампании

**Files:**
- Modify: `src/sections/artifacts/artifact-card.tsx:53`
- Test: `src/sections/artifacts/artifact-card.test.tsx`

- [ ] **Step 1.** В `artifact-card.tsx` в className `Card` заменить `hover:bg-accent/30` → `hover:bg-accent`. Строка 53: было `"cursor-pointer transition-colors hover:bg-accent/30 focus-visible:..."`, стало `hover:bg-accent`.
- [ ] **Step 2.** Проверить, что тест на класс (если есть) не ломается: `npm test -- artifact-card`. Ожидание: PASS. Если тест ассертит `/30` — обновить на `hover:bg-accent`.
- [ ] **Step 3.** Commit: `git add -A && git commit -m "feat(artifacts): ховер карточки сигнала как у карточки кампании (bg-accent)"`

---

### Task 2: VariantPicker — убрать подсказку и подстроку состава (#9, #10)

**Files:**
- Modify: `src/sections/shell/variant-picker.tsx`
- Test: `src/sections/shell/variant-picker.test.tsx`

- [ ] **Step 1: Обновить тесты (failing).** В `variant-picker.test.tsx`: удалить/инвертировать ассерты на подсказку навигации и на подстроку состава. Добавить:
```tsx
it("не показывает подсказку навигации (#9)", () => {
  render(<VariantPicker question={openQuestion} onSelect={() => {}} onClose={() => {}} onSkip={() => {}} />);
  expect(screen.queryByText(/навигация/)).not.toBeInTheDocument();
});
it("не показывает подстроку состава под опцией (#10)", () => {
  const q = { ...openQuestion, options: [{ id: "a", label: "Вариант", components: ["тема", "текст"] }] };
  render(<VariantPicker question={q} onSelect={() => {}} onClose={() => {}} onSkip={() => {}} />);
  expect(screen.queryByText("тема · текст")).not.toBeInTheDocument();
});
```
- [ ] **Step 2.** Run: `npm test -- variant-picker`. Ожидание: FAIL (подсказка/состав ещё рендерятся).
- [ ] **Step 3: #10** — удалить блок подстроки состава (строки ~102–106):
```tsx
// УДАЛИТЬ:
{opt.components && opt.components.length > 0 && (
  <span className="block truncate text-[11px] text-muted-foreground">
    {opt.components.join(" · ")}
  </span>
)}
```
Осталась только `<span className="block truncate">{opt.label}</span>` внутри `min-w-0 flex-1`.
- [ ] **Step 4: #9** — удалить нижний блок подсказки (строки ~132–135):
```tsx
// УДАЛИТЬ весь блок:
<p className="border-t border-white/8 px-3 py-1.5 text-[11px] text-muted-foreground">
  {VARIANT_PICKER_HINT}
</p>
```
И удалить неиспользуемый экспорт `export const VARIANT_PICKER_HINT = ...` (строка 8). Проверить, что он больше нигде не импортируется: `rg VARIANT_PICKER_HINT src/`.
- [ ] **Step 5.** Run: `npm test -- variant-picker`. Ожидание: PASS.
- [ ] **Step 6.** `npx tsc --noEmit` (нет висячего импорта). Commit: `git add -A && git commit -m "feat(variant-picker): убрать подсказку навигации (#9) и подстроку состава (#10)"`

---

### Task 3: Бюджет — стрелка вниз/вверх + пояснение (#13, #14)

**Files:**
- Modify: `src/sections/campaigns/budget-breakdown.tsx`
- Test: `src/sections/campaigns/budget-breakdown.test.tsx`

- [ ] **Step 1: Тесты (failing).** Добавить в `budget-breakdown.test.tsx`:
```tsx
it("пояснение над таблицей видно в развёрнутом виде (#14)", () => {
  renderBreakdown({ defaultExpanded: true });
  expect(screen.getByText(/дополнительное касание тем, кто не отреагировал/)).toBeInTheDocument();
});
```
(Тест на поворот стрелки — по классу: закрыто без `rotate-180`, открыто с `rotate-180`. Опционально.)
- [ ] **Step 2.** Run: `npm test -- budget-breakdown`. Ожидание: FAIL.
- [ ] **Step 3: #13.** Импорт заменить `ChevronRight` → `ChevronDown` (`import { ChevronDown } from "lucide-react"`). В разметке строки-тоггла заменить:
```tsx
<ChevronDown
  aria-hidden
  className={cn(
    "size-3.5 shrink-0 text-muted-foreground/70 transition-transform",
    expanded && "rotate-180"
  )}
/>
```
(было `ChevronRight` + `expanded && "rotate-90"`).
- [ ] **Step 4: #14.** Внутри `{expanded && (<div className="mb-4 ...">` перед `<table>` добавить:
```tsx
<p className="mb-2 text-[11px] leading-[1.5] text-muted-foreground">
  Первичные — первое касание по каждому получателю. Повторные — дополнительное
  касание тем, кто не отреагировал: обычно это заметно повышает отклик, их можно
  будет отключать при настройке кампании.
</p>
```
- [ ] **Step 5.** Run: `npm test -- budget-breakdown`. Ожидание: PASS.
- [ ] **Step 6.** Commit: `git add -A && git commit -m "feat(budget): стрелка вниз/вверх (#13) + пояснение первичные/повторные (#14)"`

---

### Task 4: «Показать все» — outline-кнопка (#12)

**Files:**
- Modify: `src/sections/campaigns/wizard/steps/step-1-scenario.tsx:171-177`
- Test: `src/sections/campaigns/wizard/steps/step-1-scenario.test.tsx`

- [ ] **Step 1.** Убедиться, что `Button` импортируется (`@/components/ui/button`); если нет — добавить импорт и иконку `List` из lucide-react.
- [ ] **Step 2.** Заменить тихую текстовую кнопку на outline-кнопку:
```tsx
<Button
  type="button"
  variant="outline"
  size="sm"
  onClick={() => setShowAll((v) => !v)}
  className="self-start"
>
  <List className="h-4 w-4" />
  {showAll ? "Свернуть" : "Показать все"}
</Button>
```
- [ ] **Step 3.** Run: `npm test -- step-1-scenario`. Существующие тесты ищут кнопку по имени «Показать все»/«Свернуть» (role=button) — должны пройти. Ожидание: PASS.
- [ ] **Step 4.** Commit: `git add -A && git commit -m "feat(wizard): «Показать все» заметной outline-кнопкой (#12)"`

---

### Task 5: Чат — убрать дубль сообщения-намерения (#7)

**Files:**
- Modify: `src/sections/shell/use-template-flow.ts:180-188` (`answerChannel`)
- Test: `src/sections/shell/use-template-flow.test.*` (если есть тест answerChannel) + `prompt-composer` эффект

- [ ] **Step 1: Тест (failing).** Если есть unit-тест `answerChannel`, изменить ассерт: после `answerChannel` НЕ должно быть ручного `INTENT_PROMPT` (его публикует эффект в PromptComposer). Иначе добавить интеграционный ассерт «одно сообщение-намерение» на поток создания шаблона (см. `templates-tab.test.tsx` / prompt-composer тест).
- [ ] **Step 2.** Run соответствующий тест. Ожидание: FAIL (дубль).
- [ ] **Step 3.** В `answerChannel` (use-template-flow.ts) убрать строку:
```tsx
chat.append({ role: "assistant", text: INTENT_PROMPT });
```
Оставить: `chat.append({ role: "user", text: CHANNEL_LABEL[channel] })`, `chat.setTemplateChannel(channel)`, `chat.setTemplateQuestion(null)`. Реактивный эффект в `prompt-composer.tsx` (строки ~161-180) остаётся единственным источником INTENT_PROMPT. Если `INTENT_PROMPT` больше нигде не используется в файле — константу оставить (её же шлёт эффект? нет — эффект хардкодит строку). Проверить: строка в эффекте (`prompt-composer.tsx`) — литерал `"Опишите, что нужно донести клиенту — тему, оффер или тон."`; чтобы не разъехались, экспортировать `INTENT_PROMPT` из use-template-flow и импортировать в prompt-composer (заменить литерал на `INTENT_PROMPT`). Сделать это.
- [ ] **Step 4.** Run тест. Ожидание: PASS. Плюс `npx tsc --noEmit`.
- [ ] **Step 5.** Commit: `git add -A && git commit -m "fix(chat): убрать дубль сообщения-намерения при выборе канала (#7)"`

---

### Task 6: State — экшены `template_content_updated` и `template_duplicated`

**Files:**
- Modify: `src/state/app-state.ts` (тип `Action` ~строка 392; редьюсер около `template_added`/`template_renamed` ~строки 1050-1090)
- Test: `src/state/app-state.test.ts`

- [ ] **Step 1: Тесты (failing).** В `app-state.test.ts` добавить:
```ts
describe("appReducer — template_content_updated", () => {
  it("патчит content шаблона по id", () => {
    const s0 = appReducer(initialState, { type: "template_added", template: tpl }); // tpl.channel sms
    const s1 = appReducer(s0, { type: "template_content_updated", id: tpl.id, patch: { text: "новый текст" } });
    const t = s1.templates.find((x) => x.id === tpl.id)!;
    expect((t.content as { text: string }).text).toBe("новый текст");
  });
});
describe("appReducer — template_duplicated", () => {
  it("создаёт копию: новый id, имя «… (копия)», usedInCampaigns=0", () => {
    const s0 = appReducer(initialState, { type: "template_added", template: { ...tpl, usedInCampaigns: 3 } });
    const s1 = appReducer(s0, { type: "template_duplicated", id: tpl.id, newId: "tpl_copy1" });
    expect(s1.templates).toHaveLength(2);
    const copy = s1.templates.find((x) => x.id === "tpl_copy1")!;
    expect(copy.usedInCampaigns).toBe(0);
    expect(copy.name).toContain("копия");
    expect(copy.content).toEqual(tpl.content);
  });
});
```
- [ ] **Step 2.** Run: `npm test -- app-state`. Ожидание: FAIL.
- [ ] **Step 3.** В union `Action` добавить:
```ts
| { type: "template_content_updated"; id: string; patch: Partial<NodeParams> }
| { type: "template_duplicated"; id: string; newId: string }
```
- [ ] **Step 4.** В редьюсере добавить кейсы (рядом с `template_renamed`). Для duplicate использовать `nanoid` (см. импорт в app-state; если нет — `import { nanoid } from "nanoid"`):
```ts
case "template_content_updated": {
  return {
    ...state,
    templates: state.templates.map((t) =>
      t.id === action.id ? { ...t, content: { ...t.content, ...action.patch } as NodeParams } : t
    ),
  };
}
case "template_duplicated": {
  const src = state.templates.find((t) => t.id === action.id);
  if (!src) return state;
  const copy: MessageTemplate = {
    ...src,
    id: action.newId,
    name: `${src.name} (копия)`,
    usedInCampaigns: 0,
  };
  const idx = state.templates.findIndex((t) => t.id === action.id);
  const templates = [...state.templates];
  templates.splice(idx + 1, 0, copy);
  return { ...state, templates };
}
```
- [ ] **Step 5.** Run: `npm test -- app-state`. Ожидание: PASS. `npx tsc --noEmit`.
- [ ] **Step 6.** Commit: `git add -A && git commit -m "feat(state): экшены template_content_updated и template_duplicated"`

---

### Task 7: Чат — форматирование сообщения вариантов + markdown-рендер (#8)

**Files:**
- Modify: `src/sections/shell/use-template-flow.ts` (`describeVariant`, `buildVariantsMessage`, добавить `stripHtml`)
- Modify: `src/state/chat-context.tsx` (тип `ChatMessage` — поле `format?`)
- Modify: `src/sections/shell/chat-history-list.tsx` (рендер markdown в `MessageRow`)
- Test: `src/sections/shell/use-template-flow.test.*`

- [ ] **Step 1: Тесты (failing).** Для `buildVariantsMessage`:
```ts
it("вычищает HTML и форматирует варианты (#8)", () => {
  const msg = buildVariantsMessage([
    { id: "1", name: "Деловой", content: { kind: "email", subject: "Тема A", body: "<p>Привет</p><p>Текст</p>", sender: "" }, components: [] },
    { id: "2", name: "Дружеский", content: { kind: "email", subject: "Тема B", body: "<p>Хай</p>", sender: "" }, components: [] },
  ]);
  expect(msg).not.toMatch(/<[a-z]/i);          // нет HTML-тегов
  expect(msg).toContain("**1. Деловой**");     // жирный заголовок на своей строке
  expect(msg).toContain("Тема: Тема A");
  expect(msg).toContain("Текст: Привет Текст"); // теги схлопнуты, текст полный
  expect(msg).toMatch(/\n\n\*\*2\. Дружеский\*\*/); // пустая строка между вариантами
});
```
- [ ] **Step 2.** Run: `npm test -- use-template-flow`. Ожидание: FAIL.
- [ ] **Step 3.** Добавить хелпер и переписать формат в `use-template-flow.ts`:
```ts
/** Убирает HTML-теги, схлопывает пробелы. */
export function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function describeVariant(variant: TemplateDrawerVariant, index: number): string {
  const { content } = variant;
  const lines: string[] = [`**${index}. ${variant.name}**`];
  switch (content.kind) {
    case "email":
      lines.push(`Тема: ${stripHtml(content.subject)}`, `Текст: ${stripHtml(content.body)}`);
      break;
    case "sms":
      lines.push(`Текст: ${stripHtml(content.text)}`);
      break;
    case "push":
      lines.push(`Заголовок: ${stripHtml(content.title)}`, `Текст: ${stripHtml(content.body)}`);
      break;
    case "ivr":
      lines.push(`Сценарий: ${stripHtml(content.scenario)}`);
      break;
    default:
      lines.push(variant.components.join(", "));
  }
  return lines.join("\n");
}

export function buildVariantsMessage(variants: TemplateDrawerVariant[]): string {
  const blocks = variants.map((v, i) => describeVariant(v, i + 1));
  return `Готово. Какой вариант сохранить?\n\n${blocks.join("\n\n")}`;
}
```
- [ ] **Step 4.** Run: `npm test -- use-template-flow`. Ожидание: PASS.
- [ ] **Step 5: markdown-флаг.** В `chat-context.tsx` в тип `ChatMessage` добавить `format?: "markdown"`. В `append` контракте (и `SubmitIntentChat` в Task 8) пробросить флаг. Убедиться, что `append` принимает `format`.
- [ ] **Step 6: рендер.** В `chat-history-list.tsx` `MessageRow` для ассистентского текстового сообщения: если `message.format === "markdown"`, рендерить через `Streamdown` вместо `<span>`. Импорт: `import { Streamdown } from "streamdown"`. Заменить:
```tsx
{message.pending ? <ThinkingDots /> : (
  message.format === "markdown"
    ? <div className="min-w-0 flex-1 text-sm leading-snug [&_p]:my-0 [&_strong]:font-semibold"><Streamdown>{message.text}</Streamdown></div>
    : <span className="leading-snug">{message.text}</span>
)}
```
(Цвет текста не задаём — наследуется от родителя `text-foreground/90`.)
- [ ] **Step 7.** `npx tsc --noEmit` + `npm test -- chat-history-list`. Ожидание: PASS.
- [ ] **Step 8.** Commit: `git add -A && git commit -m "feat(chat): структурировать сообщение вариантов, markdown-рендер, чистка HTML (#8)"`

---

### Task 8: Чат — резолвить pending-пузырёк «думания» (#11)

**Files:**
- Modify: `src/sections/shell/use-template-flow.ts` (`runSubmitIntent`, интерфейс `SubmitIntentChat`)
- Test: `src/sections/shell/use-template-flow.test.*`

- [ ] **Step 1: Тест (failing).** Мок `SubmitIntentChat` с `append` возвращающим id и `updatePending`. Ассерт: после успеха `updatePending` вызван с id пузырька «Готовлю варианты…» и текстом вариантов; НЕ добавлено новое ассистентское сообщение вместо резолва.
```ts
it("резолвит pending-пузырёк в сообщение вариантов (#11)", async () => {
  const calls: string[] = [];
  const chat = makeChat({ onAppend: (m) => calls.push(m.pending ? "pending" : "msg"), /* append returns id */ });
  await runSubmitIntent(chat, "оффер");
  // один pending (Готовлю…), затем updatePending — без второго ассистентского append
  expect(chat.updatePending).toHaveBeenCalledWith(pendingId, expect.stringContaining("Какой вариант"));
});
```
- [ ] **Step 2.** Run. Ожидание: FAIL.
- [ ] **Step 3.** Обновить контракт и поток:
```ts
export interface SubmitIntentChat {
  templateDrawer: { channel: Channel | null; variants: TemplateDrawerVariant[] };
  append: (m: { role: "user" | "assistant"; text: string; pending?: boolean; format?: "markdown" }) => string;
  updatePending: (id: string, text: string) => void;
  setTemplateIntent: (intent: string) => void;
  setTemplateQuestion: (q: TemplateQuestion | null) => void;
  setTemplateGenerating: (v: boolean) => void;
  setTemplateVariants: (variants: TemplateDrawerVariant[]) => void;
}
```
В `runSubmitIntent`:
```ts
chat.append({ role: "user", text: intent });
chat.setTemplateIntent(intent);
chat.setTemplateQuestion(null);
chat.setTemplateGenerating(true);
const pendingId = chat.append({ role: "assistant", text: "Готовлю варианты…", pending: true });
try {
  // ... fetch + map variants ...
  chat.setTemplateVariants(variants);
  chat.updatePending(pendingId, buildVariantsMessage(variants));
  // пометить сообщение markdown — через отдельный путь: updatePending не несёт format.
  // Вариант: расширить update_pending до { format? } ИЛИ добавить экшен set_message_format.
  chat.setTemplateQuestion(variantQuestion(variants));
} catch {
  chat.updatePending(pendingId, "Не удалось сгенерировать. Попробуйте ещё раз.");
  chat.setTemplateQuestion(null);
} finally {
  chat.setTemplateGenerating(false);
}
```
- [ ] **Step 4: markdown на резолве.** Чтобы сообщение вариантов было markdown, расширить экшен `update_pending` в `chat-context.tsx` опциональным `format`:
```ts
| { type: "update_pending"; id: string; text: string; format?: "markdown" }
// reducer: m.id===id ? { ...m, text, pending: undefined, format: action.format } : m
```
и `updatePending(id, text, format?)` в API. В `runSubmitIntent` вызвать `chat.updatePending(pendingId, buildVariantsMessage(variants), "markdown")`. Обновить сигнатуру `updatePending` в `SubmitIntentChat` и во всех вызовах (остальные — без format, обратная совместимость).
- [ ] **Step 5.** Обновить реальный `useTemplateFlow` — `runSubmitIntent(chat, ...)` уже получает `chat` из `useChat()`; убедиться, что `useChat().append` возвращает id и `updatePending` доступен (да). Прокинуть.
- [ ] **Step 6.** Run: `npm test -- use-template-flow` + `npx tsc --noEmit`. Ожидание: PASS.
- [ ] **Step 7.** Commit: `git add -A && git commit -m "fix(chat): резолвить пузырёк «Готовлю варианты…» в ответ, без зависших точек (#11)"`

---

### Task 9: EmailRenderer — нейтральный фокус вместо жёлтого (#3)

**Files:**
- Modify: `src/sections/campaigns/email-renderer.tsx` (`EditableText`, `sharedStyle`)
- Test: `src/sections/campaigns/email-renderer.test.*` (если есть)

- [ ] **Step 1.** В `EditableText` в `sharedStyle` заменить жёлтый glow:
```ts
// было: boxShadow: "0 0 0 3px rgba(255,236,0,0.25)",
boxShadow: "0 0 0 1px #b7b7b0, 0 0 0 3px rgba(120,120,120,0.18)",
```
(border `#c9c9c3` остаётся). Никакого жёлтого.
- [ ] **Step 2.** Run существующие тесты рендерера/дровера: `npm test -- email`. Ожидание: PASS (визуальный класс, логика не тронута).
- [ ] **Step 3.** Commit: `git add -A && git commit -m "feat(email): нейтральный фокус редактируемых полей вместо жёлтого (#3)"`

---

### Task 10: Редактируемые SMS/Push рендереры (#3)

**Files:**
- Create: `src/sections/campaigns/editable-text.tsx` (вынести `EditableText` из email-renderer для переиспользования) ИЛИ экспортировать из email-renderer
- Modify: `src/sections/campaigns/sms-renderer.tsx`, `src/sections/campaigns/push-renderer.tsx`
- Test: `src/sections/campaigns/sms-renderer.test.*`, `push-renderer.test.*`

- [ ] **Step 1: Вынести EditableText.** Скопировать компонент `EditableText` из `email-renderer.tsx` в новый `editable-text.tsx` (экспорт), обновить импорт в email-renderer. Нейтральный фокус (Task 9) — там же. Пропсы: `value, onCommit, readOnly, multiline, inline, placeholder, style, className, renderDisplay`.
- [ ] **Step 2: SMS — тест (failing).**
```tsx
it("клик по тексту → инпут → commit зовёт onChange (не readonly)", () => {
  const onChange = vi.fn();
  render(<SmsRenderer params={sms} readOnly={false} onChange={onChange} />);
  fireEvent.click(screen.getByText(sms.text));
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "новый" } });
  fireEvent.blur(input);
  expect(onChange).toHaveBeenCalledWith({ text: "новый" });
});
it("readOnly — клик не открывает инпут", () => {
  render(<SmsRenderer params={sms} readOnly onChange={() => {}} />);
  fireEvent.click(screen.getByText(sms.text));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
```
- [ ] **Step 3.** Расширить пропсы `SmsRenderer({ params, readOnly = true, onChange })`. Обернуть редактируемые поля (`text`, `alphaName`, `link`) в `EditableText` c `onCommit={(v) => onChange?.({ <field>: v })}`. Дефолт `readOnly` = true (совместимость с текущими вызовами без onChange). Тот же паттерн для `PushRenderer` (`title`, `body`).
- [ ] **Step 4.** Run: `npm test -- sms-renderer push-renderer`. Ожидание: PASS.
- [ ] **Step 5.** `npx tsc --noEmit`. Commit: `git add -A && git commit -m "feat(templates): редактируемые SMS/Push рендереры (общий EditableText) (#3)"`

---

### Task 11: Единый дровер шаблона — правка/замок/дублирование (#3)

**Files:**
- Modify: `src/sections/campaigns/template-preview-drawer.tsx` (правка/гейт/баннер/автосейв)
- Modify: `src/sections/artifacts/templates-tab.tsx` (открытие письма — через тот же дровер, а не EmailEditorPanel-preview)
- Modify: `src/state/chat-context.tsx` (при необходимости — открытие дровера с editable)
- Test: `template-preview-drawer.test.tsx`

- [ ] **Step 1: Тесты (failing).**
```tsx
it("не использован → редактируемый, коммит правки зовёт template_content_updated", () => { /* dispatch spy */ });
it("использован (usedInCampaigns≥1) → read-only + баннер, без инпутов", () => {
  // рендер с used-шаблоном; ожидать баннер /нельзя редактировать/, queryByRole("textbox") == null
});
```
- [ ] **Step 2.** Run. Ожидание: FAIL.
- [ ] **Step 3.** В `TemplatePreviewBody` пробросить `readOnly` и `onChange`:
```tsx
export function TemplatePreviewBody({ template, readOnly, onChange }: {
  template: MessageTemplate; readOnly: boolean; onChange: (patch: Partial<NodeParams>) => void;
}) {
  const { content } = template;
  switch (content.kind) {
    case "email": return <EmailRenderer draft={emailParamsToDraft(content)} readOnly={readOnly} onChange={onChange} />;
    case "sms":   return <SmsRenderer params={content} readOnly={readOnly} onChange={onChange} />;
    case "push":  return <PushRenderer params={content} readOnly={readOnly} onChange={onChange} />;
    case "ivr":   return <IvrRenderer params={content} />; // всегда просмотр
    default: return null;
  }
}
```
(email: `onChange` от EmailRenderer отдаёт `Partial<EmailDraft>` — смапить обратно в `Partial<NodeParams>`: `{ subject, body, sender, link }`.)
- [ ] **Step 4.** В `TemplatePreviewDrawer`: вычислить `const used = template.usedInCampaigns >= 1; const readOnly = used || template.content.kind === "ivr";`. Пробросить `onChange={(patch) => dispatch({ type: "template_content_updated", id: template.id, patch })}` (подключить `useAppDispatch`). Автосейв на каждый commit поля.
- [ ] **Step 5.** Баннер при `used` над предпросмотром:
```tsx
{used && (
  <div className="mx-5 mt-4 flex gap-2 rounded-lg border border-[#e0b060]/25 bg-[#e0b060]/[0.07] px-3 py-2.5 text-xs leading-relaxed text-[#d8b98a]">
    <Lock className="mt-0.5 size-3.5 shrink-0" />
    Шаблон использован в кампаниях, поэтому его нельзя редактировать. Продублируйте — копия откроется черновиком, и её можно будет менять.
  </div>
)}
```
- [ ] **Step 6.** Роутинг письма: в `templates-tab.tsx` `onOpenEmail` заменить открытие `EmailEditorPanel`-preview на открытие единого дровера предпросмотра шаблона (`openTemplatePreview(id)` для всех каналов, включая email). Т.е. `onOpenEmail` больше не нужен — карточка всегда зовёт `onPreview(id)` → `openTemplatePreview(id)` (см. Task 12). Проверить, что email открывается в `TemplatePreviewDrawer`, а не в EmailEditorPanel. `EmailEditorPanel` остаётся для ноды кампании.
- [ ] **Step 7.** Run: `npm test -- template-preview-drawer templates-tab` + `npx tsc --noEmit`. Ожидание: PASS.
- [ ] **Step 8.** Commit: `git add -A && git commit -m "feat(templates): единый дровер шаблона — правка/замок по использованию/автосейв (#3)"`

---

### Task 12: Карточка шаблона — унификация + меню ⋯ (#2, #4, #5, #6)

**Files:**
- Modify: `src/sections/artifacts/template-card.tsx`
- Modify: `src/sections/artifacts/templates-tab.tsx` (проброс onDuplicate + единый onPreview)
- Test: `src/sections/artifacts/template-card.test.tsx`

- [ ] **Step 1: Тесты (failing).**
```tsx
it("вся карточка кликабельна → onPreview (#4)", () => {
  const onPreview = vi.fn();
  render(<TemplateCard template={emailTpl} onRename={()=>{}} onPreview={onPreview} onDuplicate={()=>{}} />);
  fireEvent.click(screen.getByText(emailTpl.name));
  expect(onPreview).toHaveBeenCalledWith(emailTpl.id);
});
it("нет кнопки «Предпросмотр» (#4)", () => { expect(screen.queryByRole("button", { name: /Предпросмотр/ })).not.toBeInTheDocument(); });
it("письмо показывает Тема и Текст (#2)", () => { /* getByText(/Тема:/), /Текст:/ */ });
it("меню ⋯ → Дублировать зовёт onDuplicate", () => { /* открыть dropdown, кликнуть Дублировать */ });
```
- [ ] **Step 2.** Run. Ожидание: FAIL.
- [ ] **Step 3: раскладка.** Переписать `TemplateCard`:
  - `Card` получает `role="button" tabIndex={0} onClick={() => onPreview(id)} onKeyDown={Enter/Space}`, className добавить `group/card cursor-pointer transition-colors hover:bg-accent`.
  - Ряд 1: имя + карандаш (карандаш `className="... opacity-0 group-hover/card:opacity-100"`, `onClick={(e)=>{e.stopPropagation(); startEditing();}}`).
  - Поля (`FieldList`): для email вернуть строки Тема/Текст (см. Step 4) — убрать `EmailField`/`onOpenEmail`.
  - Убрать non-email кнопку «Предпросмотр» (Eye) полностью.
  - Разделитель + подвал: чип канала + чип «Использовано».
  - Меню ⋯ (`MoreHorizontal` + shadcn `DropdownMenu`) в правом верхнем углу (позиционирование как в `ArtifactCard`: контейнер `absolute`/flex, `onClick={(e)=>e.stopPropagation()}`), пункт «Дублировать» → `onDuplicate(id)`.
- [ ] **Step 4: #2 email поля.** В `FieldList` для `content.kind === "email"` вместо `EmailField` вернуть `dl` со строками:
```tsx
rows = [
  { label: "Тема", value: content.subject },
  { label: "Текст", value: content.body },
];
```
и рендерить тем же `dl`-блоком, что sms/push. Значение «Текст» ограничить по высоте: на `dd` для email добавить `line-clamp-2` (превью тела компактно). Убрать компонент `EmailField` и импорт `ChevronRight`/`Eye`.
- [ ] **Step 5.** `templates-tab.tsx`: заменить `onOpenEmail` на единый `onPreview={(id) => openTemplatePreview(id)}` для всех каналов; добавить `onDuplicate={(id) => dispatch({ type: "template_duplicated", id })}`. Проброс в `TemplateCard`. После дублирования открыть копию: диспатч + `openTemplatePreview(newId)` — получить id из состояния (или расширить экшен, чтобы `template_duplicated` также ставил previewTemplateId). Проще: в connected-хендлере вычислить, что копия — последняя добавленная; но чище — вернуть id. Реализация: хендлер `onDuplicate` диспатчит `template_duplicated` и затем открывает предпросмотр по новому id (для детерминизма — сгенерировать id заранее и передать в экшен: расширить `template_duplicated` до `{ id, newId }`, `newId` создать в хендлере через `nanoid`).
- [ ] **Step 6.** Run: `npm test -- template-card templates-tab` + `npx tsc --noEmit`. Ожидание: PASS.
- [ ] **Step 7.** Commit: `git add -A && git commit -m "feat(templates): унификация карточки — письмо в 2 строки, клик по карточке, карандаш на hover, чипы вниз, ⋯-дублирование (#2 #4 #5 #6)"`

---

### Task 13: Финальная проверка

- [ ] **Step 1.** `npx tsc --noEmit` — без ошибок.
- [ ] **Step 2.** `npm run lint` (если есть) — чисто.
- [ ] **Step 3.** `npm test` — вся сюита зелёная (обновить снапшоты визуальных тестов, если раскладка карточек изменилась осознанно: проверить `*.spec.ts`/visual baseline — НЕ обновлять слепо, свериться со спекой).
- [ ] **Step 4.** Ручная проверка в браузере (порт 3001, т.к. 3000 занят основным чекаутом) ключевых экранов: Артефакты → Шаблоны (карточки, клик, ⋯-дублирование, правка/замок), поток создания шаблона (нет дубля, форматирование вариантов, точки резолвятся), бюджет (стрелка, пояснение), шаг сценария (кнопка). Через skill `visual-review` — реальные скриншоты в companion.
- [ ] **Step 5.** Отчитаться: путь воркдерева + ветка; финальный статус тестов.

---

## Self-review: покрытие спеки

| Спека | Task |
|---|---|
| A. Карточка шаблона #2/#4/#5/#6 | 12 |
| A. Карточка сигнала (ховер) | 1 |
| B. #7 дубль | 5 |
| B. #8 форматирование | 7 |
| B. #11 думание | 8 |
| C. #9/#10 VariantPicker | 2 |
| D. #3 экшены | 6 |
| D. #3 нейтральный фокус | 9 |
| D. #3 SMS/Push editable | 10 |
| D. #3 дровер edit/lock/duplicate | 11 |
| E. #13/#14 бюджет | 3 |
| F. #12 кнопка | 4 |

Все требования спеки покрыты. IVR остаётся read-only (Task 11, Step 3). Экшены определены в Task 6 и используются согласованно в Tasks 11–12 (`template_content_updated`, `template_duplicated{ id, newId }`).
