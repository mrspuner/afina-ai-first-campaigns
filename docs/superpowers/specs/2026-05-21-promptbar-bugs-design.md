# PromptBar bugs — design

**Дата:** 2026-05-21
**Статус:** на согласовании
**Источник:** ТЗ «Правки интерфейса Афины» v1.1, раздел 7
**Блок:** E из декомпозиции спеки (PromptBar — иконки, дубль, очередь, hover, Enter)

## 1. Цель

Починить четыре бага PromptBar:
1. **Иконки в чипах**: в теге узла и в теге параметра не подтягивается иконка.
2. **Дублирование тег + текст**: клик на параметр узла добавляет в инпут и тег, и текст с названием параметра. Должен только тег.
3. **Очередь vs затирание**: А (узел/параметр) + текст → Б ⇒ А в очередь; А без текста → Б ⇒ А затирается. Сейчас в основном composer (ShellBottomBar) парковки нет вообще.
4. **Hover-highlight**: редактируемый чип в PromptBar должен полностью подсвечиваться при наведении.

Также — verify, что Enter после ввода текста применяет команду (§7.3).

Не входит: переработка структуры PromptBar, изменения PromptInput/PromptInputController.

## 2. Текущее состояние

| Что | Где | Состояние |
|---|---|---|
| createChipElement | `src/components/ai-elements/chip-editable-input.tsx:430-449` | `el.textContent = chip.label` — только текст, иконки нет |
| Дубль на клик параметра | `src/sections/campaigns/node-card-content.tsx:165-185` (`handleAiField`) | вызывает И `insertPrompt(template)`, И `pushChip(...)` — в инпуте появляются и тег, и текст-шаблон |
| Парковка в ChatComposer | `src/sections/shell/chat-composer.tsx:98-106,233` | работает: `onTagSwap={parkPreviousIfNeeded}`. **Но** parkPreviousIfNeeded удаляет старый чип только если в нём был текст. Без текста — старый чип остаётся в инпуте, новый добавляется параллельно |
| Парковка в ShellBottomBar | `src/sections/shell/shell-bottom-bar.tsx:298-302` | НЕ передаёт `onTagSwap` → парковки нет; смена тега → старый просто исчезает с текстом |
| Hover на чипе | `chip-editable-input.tsx:435-446` | нет hover-стиля; class `mx-0.5 inline-flex... border... bg...` |
| Apply on Enter | `src/state/prompt-bar-enter.ts` + `chat-composer.tsx:152`, `shell-bottom-bar.tsx:158` | работает через `decideEnterAction` → `apply-tag` / `park-tag` / `apply-all` / `free-text` |
| NODE_ICON | `src/sections/campaigns/node-visuals.ts:52-67` | Map `nodeType → LucideIcon` (React-компоненты) |

## 3. Дизайн

### 3.1. Pre-render SVG-строк для иконок узлов

В `src/sections/campaigns/node-visuals.ts` добавить:

```ts
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const NODE_ICON_SVG: Partial<Record<WorkflowNodeType, string>> = Object.fromEntries(
  Object.entries(NODE_ICON).map(([nodeType, Icon]) => [
    nodeType,
    renderToStaticMarkup(
      createElement(Icon, {
        size: 14,
        strokeWidth: 2,
        "aria-hidden": true,
      })
    ),
  ])
) as Partial<Record<WorkflowNodeType, string>>;

/** Pre-rendered SVG string for the node-type icon, or null if no icon. */
export function getNodeIconSvg(nodeType: string): string | null {
  return NODE_ICON_SVG[nodeType as WorkflowNodeType] ?? null;
}
```

SVG генерируются один раз при импорте модуля. Безопасно и на сервере (renderToStaticMarkup SSR-friendly), и на клиенте. `currentColor` в SVG attrs наследуется от родительского `color` — это работает само (Lucide иконки задают `stroke="currentColor"`).

### 3.2. Чип с иконкой

В `src/components/ai-elements/chip-editable-input.tsx` поправить `createChipElement`:

```ts
function createChipElement(chip: PromptChip): HTMLElement {
  const el = document.createElement("span");
  el.contentEditable = "false";
  el.setAttribute("data-chip-id", chip.id);
  el.setAttribute("data-chip-kind", chip.kind);
  el.className =
    "chip-hover mx-0.5 inline-flex select-none items-center gap-1 rounded-md border px-2 py-0.5 align-baseline text-xs font-medium cursor-pointer transition-all duration-150";
  // Окраска по цвету узла (NodeTagPayload).
  const payload = chip.payload as { color?: string; nodeType?: string } | null;
  const color = payload && typeof payload.color === "string" ? payload.color : null;
  if (color) {
    el.style.borderColor = `${color}66`;
    el.style.backgroundColor = `${color}1f`;
    el.style.color = color;
  } else {
    el.classList.add("border-white/15", "bg-white/10", "text-white");
  }

  // Иконка узла (или узла-родителя для тега параметра) — иконка одна и та
  // же для обоих типов: цвет тега уже указывает на узел; иконка усиливает
  // это сходство.
  const nodeType = payload && typeof payload.nodeType === "string" ? payload.nodeType : null;
  if (nodeType) {
    const iconSvg = getNodeIconSvg(nodeType);
    if (iconSvg) {
      const iconWrap = document.createElement("span");
      iconWrap.setAttribute("aria-hidden", "true");
      iconWrap.className = "inline-flex shrink-0 items-center";
      iconWrap.innerHTML = iconSvg;
      el.appendChild(iconWrap);
    }
  }

  el.appendChild(document.createTextNode(chip.label));
  return el;
}
```

Импорт `getNodeIconSvg` из `@/sections/campaigns/node-visuals`.

### 3.3. Hover-highlight

Класс `chip-hover` определим в `src/app/globals.css` (или там же в chip-editable-input.tsx через `<style>` — менее предпочтительно):

```css
.chip-hover:hover {
  filter: brightness(1.18);
}
```

`filter: brightness` универсально для любых backgroundColor и border (inline-style цвет узла + Tailwind-классы для нейтрального чипа). Это и есть «полная подсветка при наведении» из ТЗ §7.1.4 — не подсвечивается только текст, подсвечивается весь чип.

Альтернатива через Tailwind utility `hover:brightness-110` — но Tailwind не парсит произвольные CSS внутри inline-стилей и при contenteditable иногда не подхватывает классы из JIT. Безопаснее задать одну строчку в globals.css.

`cursor-pointer transition-all duration-150` уже в className — для плавности.

### 3.4. Дубль text + tag

В `src/sections/campaigns/node-card-content.tsx:165-185`:

```ts
// было
function handleAiField(rowLabel: string) {
  const template = templateByLabel.get(rowLabel);
  if (template) insertPrompt(template);  // ← УДАЛЯЕМ
  const nodeType = data.nodeType;
  const payload: NodeTagPayload = { /* ... */ };
  pushChip({ /* ... */ });
}

// станет
function handleAiField(rowLabel: string) {
  const nodeType = data.nodeType;
  const payload: NodeTagPayload = { /* ... */ };
  pushChip({ /* ... */ });
}
```

Полностью убираем `insertPrompt(template)`. `templateByLabel`, `insertPrompt`, `actions`, `templateByLabel` — оставляем; они могут использоваться в других местах (например, в `useSuggestionCatalog`) или быть удалены позже как dead code, но это вне scope блока E.

После фикса: клик на параметр узла → появляется только тег параметра (с иконкой узла-родителя). Текста-шаблона нет.

### 3.5. Парковка — фикс ChatComposer

В `src/sections/shell/chat-composer.tsx:98-106` (`parkPreviousIfNeeded`):

```ts
// было
function parkPreviousIfNeeded() {
  const prev = prevActiveRef.current;
  if (prev && prev.text.trim().length > 0) {
    parkDraft(prev.chip, prev.text);
    removeChip(prev.chip.id);
  }
  setFromQueueChipId(null);
}

// станет
function parkPreviousIfNeeded() {
  const prev = prevActiveRef.current;
  if (!prev) {
    setFromQueueChipId(null);
    return;
  }
  if (prev.text.trim().length > 0) {
    parkDraft(prev.chip, prev.text);
  }
  // Старый чип убираем ВСЕГДА: либо запаркован (текст был), либо затёрт
  // (текста не было). Без этого новый чип ляжет рядом со старым.
  removeChip(prev.chip.id);
  setFromQueueChipId(null);
}
```

Это закрывает ТЗ §7.2 «без текста → A затирается → в инпуте появляется B».

### 3.6. Парковка — добавить в ShellBottomBar

`ShellBottomBar` — главный composer, используемый на campaign/workflow/sections экранах. Сейчас он НЕ передаёт `onTagSwap`. Нужно повторить механику ChatComposer.

В `src/sections/shell/shell-bottom-bar.tsx`:

1. Добавить хук на парковку рядом с локальными ref:
   ```ts
   const prevActiveRef = useRef<ChipSegment | null>(null);
   const { parkDraft, removeDraft, clearQueue, drafts } = useDraftQueue();
   const { chips: chipsList, removeChip } = chipsApi;

   useEffect(() => {
     const seg = editorRef.current?.getActiveSegment() ?? null;
     if (seg) prevActiveRef.current = seg;
   }, [chipsApi.chips]);

   function parkPreviousIfNeeded() {
     const prev = prevActiveRef.current;
     if (!prev) return;
     if (prev.text.trim().length > 0) {
       parkDraft(prev.chip, prev.text);
     }
     chipsApi.removeChip(prev.chip.id);
   }
   ```

2. Передать в ChipEditableInput:
   ```tsx
   <ChipEditableInput
     ref={editorRef}
     className="px-3 py-2"
     placeholder={chatPlaceholder}
     onTagSwap={parkPreviousIfNeeded}
   />
   ```

3. Очищать `prevActiveRef.current = null` в момент сабмита (после `handlePromptSubmit`'а `decision === "apply-all"` и аналогичных финализирующих веток).

### 3.7. Apply on Enter — verified

`decideEnterAction` в `prompt-bar-enter.ts` уже корректно разделяет:
- `hasActiveTag === true && activeText !== ""` → `apply-tag` (применяет команду к узлу)
- `hasActiveTag === true && activeText === ""` → `park-tag` (без текста — паркует тег как есть, без команды; это используется при Enter без ввода)
- `hasActiveTag === false && hasTypedText` → `free-text`
- queue && APPLY_ALL_COMMAND → `apply-all`

И ChatComposer, и ShellBottomBar используют этот хелпер. Поведение ТЗ §7.3 («Клик на параметр или на узел + ввод текста после тега в PromptBar + нажатие Enter → изменения сразу применяются») уже работает. Спека фиксирует это как verified.

### 3.8. Что не меняем

- `prompt-bar-enter.ts` — без изменений.
- `apply-draft.ts` — без изменений.
- `draft-queue-context.tsx` — без изменений (parkDraft уже корректный).
- `prompt-chips-context.tsx` — без изменений.
- DraftQueueList — без изменений.
- Behavior на welcome/section/campaigns — без изменений (если в этих view сейчас не используется парковка по логике flow, изменения её не сломают).

## 4. Тестирование

### Unit

- Расширить `src/state/draft-queue-context.test.ts` (если есть) или добавить тесты для логики:
  - `parkDraft` с пустым текстом → no-op (уже есть в reducer).
  - `parkDraft` дедуплицирует по `chip.id` (уже есть).
  - Симулировать sequence: pushChip A → set text "..." → pushChip B → ожидать: A запаркован с текстом, в чипах остался только B.
  - sequence: pushChip A → pushChip B (без текста) → ожидать: A удалён, в очереди ничего; в чипах только B.

### Manual smoke

В dev-сервере:
1. Открыть workflow draft-кампании, кликнуть на ноду «SMS» → в PromptBar появляется тег с иконкой `MessageSquare` слева от label.
2. Hover на чип → весь чип становится ярче (brightness +18%).
3. Кликнуть на параметр «Текст SMS» в раскрытом узле → в PromptBar появляется ТОЛЬКО тег с иконкой узла-родителя, без подставленного текста-шаблона.
4. Ввести текст «Привет {name}» → кликнуть на другой параметр другого узла → старый тег с текстом уходит в очередь, в инпуте новый тег.
5. Кликнуть на третий параметр БЕЗ ввода текста → второй тег исчезает (затирается), в инпуте — третий.
6. Кликнуть на DraftQueueList карточку → черновик возвращается в инпут с текстом, активный (если был) уходит в очередь.
7. Ввести текст и нажать Enter → команда применяется к узлу (anim в графе, AI reply).

### Edge cases

- Backspace на чипе → удаление через MutationObserver уже работает, фикс не ломает.
- pushChip с id, который уже есть → push дедуплицирует (`promptChipsReducer.push`), onTagSwap не срабатывает (hadChip→ ChipEditableInput diff'ает selector). Верно.
- Чип без `nodeType` в payload (например, mode/section/trigger) — `getNodeIconSvg(undefined)` возвращает `null`, иконка не отрисуется. ОК.

## 5. Acceptance criteria (из ТЗ §9)

- [ ] В тег узла и в тег параметра подтягивается иконка (иконка узла, у параметра — узла-родителя).
- [ ] При клике на параметр внутри узла в PromptBar появляется только тег параметра (без дублирующего текста). При клике на узел — только тег узла.
- [ ] Логика очереди одинаково работает для узлов и параметров: с текстом → в очередь; без текста → затирается.
- [ ] При наведении на чип он подсвечивается полностью (фон + бордер + текст становятся ярче).
- [ ] Enter после ввода текста применяет команду (verified — уже работает).

## 6. Файлы, которые будут изменены

- `src/sections/campaigns/node-visuals.ts` — добавить `NODE_ICON_SVG`, `getNodeIconSvg`. Импорты: `renderToStaticMarkup`, `createElement`.
- `src/components/ai-elements/chip-editable-input.tsx` — `createChipElement` рендерит иконку из SVG-строки; добавить класс `chip-hover` + `cursor-pointer transition-all`.
- `src/app/globals.css` — добавить `.chip-hover:hover { filter: brightness(1.18); }`.
- `src/sections/campaigns/node-card-content.tsx` — удалить вызов `insertPrompt(template)` в `handleAiField`.
- `src/sections/shell/chat-composer.tsx` — фикс `parkPreviousIfNeeded` (всегда удалять старый чип).
- `src/sections/shell/shell-bottom-bar.tsx` — добавить `parkPreviousIfNeeded`, передать `onTagSwap={parkPreviousIfNeeded}` в `<ChipEditableInput>`; импорты `useDraftQueue`, `ChipSegment`.
- (опционально) `src/state/draft-queue-context.test.ts` — расширить тестами.

Реализация ведётся в git worktree (`.worktrees/promptbar-bugs` на ветке `feature/promptbar-bugs`) согласно AGENTS.md.

## 7. Что НЕ делаем в этом блоке

- Не унифицируем `ShellBottomBar` и `ChatComposer` в один компонент — слишком большой рефакторинг; парковка интегрируется параллельно.
- Не удаляем `NODE_ACTIONS[].promptTemplate` (даже если он не используется на клик) — это data, может пригодиться в drawer или suggestion.
- Не меняем механику Backspace на чипе.
- Не меняем decideEnterAction.
- Не правим SuggestionBar.

## 8. Риски

- **`renderToStaticMarkup` на клиенте.** React DOM Server работает в браузере (хоть и не оптимально). Альтернатива — компилировать SVG в JSON build-time. Сейчас прототип, метод приемлем; если позже окажется тяжелым (13 иконок × 14×14 SVG ≈ 4-8 KB) — рефакторим.
- **Tailwind не парсит динамические классы.** `chip-hover` — статичный класс с CSS-правилом в globals — это не Tailwind utility, парсер их не трогает. Безопасно.
- **`prevActiveRef` race в ShellBottomBar.** Без careful sync можно паркнуть пустой чип (если useEffect для prevActiveRef сработал ПОСЛЕ pushChip но ДО onTagSwap). Используем ту же логику, что в ChatComposer (snapshot активного сегмента на изменении chips). Тесты покрывают.
- **Множественные чипы в одном инпуте.** Сейчас архитектура поддерживает (`getSegments` возвращает массив). Парковка работает на «активный» (последний) сегмент. Если юзер быстро добавляет 3 чипа подряд — первые два могут быть запаркованы по очереди, либо не запаркованы (если onTagSwap не успел поймать). Проверяем в smoke. По ТЗ §7.2 описана пошаговая логика A→B (попарно) — это покрывается.
- **Иконки в Backspace-delete.** При удалении чипа через Backspace MutationObserver всё ещё видит чип как atomic block (contentEditable=false), поэтому одно нажатие удаляет весь чип вместе с иконкой. Lucide SVG внутри `aria-hidden` span не нарушает структуру.
