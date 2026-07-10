# Спека B — UI нод-карты: теги, сплиттер, chevron, dirtyDot, глаз, удаление узла

**Пункты:** 2, 3, 4, 5, 6, 9. **Владелец файлов:** `node-card-content.tsx` + все `*-fields.tsx`, `node-template-select.tsx`, `node-field-combobox.tsx`, `chip-editable-input.tsx`, `prompt-chips-context.tsx`, `workflow-node.tsx`.
**Порядок мержа:** второй (после A). **Worktree:** off `integration`, ребейз на A перед мержем.
Все номера строк сверены с `integration`.

> **Зависимости от A (после ребейза на A):**
> - `PARAM_RENDERERS` в `node-card-content.tsx:82` перестанет компилиться: **удалить** `merge: () => []` и **добавить** `statistics: () => []` (A убрал `merge` и добавил `statistics` в `NodeParams`).
> - п.3 импортирует `splitSummary` из `src/state/split-segments.ts` (пишет A).
> - п.9 импортирует `isDeletableNodeType` из `src/state/structural-commands.ts` (пишет A).
>
> **Внутри B:** п.6 зависит от п.4 (стрелка появляется только после Pencil→ChevronDown) — делать п.4 раньше п.6.

---

## 2. Крестики удаления у тегов + снятие тегов при закрытии ноды

### AS IS
- Чипы (`src/state/prompt-chips-context.tsx`) несут `removable: boolean` (интерфейс `PromptChip`, `:16–23`, поле `:22`) и метод `removeChip` (декл. `:113`, реализ. `:131–133`, редьюсер `remove` `:93`). `removeChip` — **только по одному id**.
- Рендер чипов — императивный в `chip-editable-input.tsx`: `createChipElement` (`:523–563`) рисует иконку + текстовый узел, **крестика нет**. Чипы — `contentEditable=false` DOM-узлы, синхронизируются с состоянием эффектом (`:229–301`). Удаление сегодня — **Backspace + MutationObserver** (`:440–464`, вызывает `removeChip` `:458`). **DnD в файле нет** (оригинальная спека ошибалась).
- Крестик закрытия ноды (`workflow-node.tsx:114–125`) на клик делает `e.stopPropagation()` + `dispatch({ type:"workflow_node_deselected" })` (`:119`) — теги не снимает.
- Схема id: узел целиком — `node_${id}` (пуш `prompt-composer.tsx:525`, снятие `node-card-content.tsx:180`); поле — `nodefield_${id}_${label}` (`node-card-content.tsx:352`).

### TO BE
- В `createChipElement` добавить видимый крестик (×) для чипов с `removable === true`. Клик по × → `removeChip(chip.id)`. Т.к. чип — императивный DOM-узел вне React-реконсиляции, повесить обработчик клика прямо в билдере (учесть `stopPropagation`, чтобы не триггерить редактор/фокус).
- При закрытии ноды (`workflow-node.tsx` X-кнопка) **дополнительно** снять её теги: `node_${id}` и все `nodefield_${id}_*`. Направление **одностороннее** (нода → теги).
- Добавить bulk-хелпер в `prompt-chips-context.tsx`: `removeChipsForNode(nodeId: string)` — фильтрует `chips` и убирает `node_${nodeId}` + все `nodefield_${nodeId}_*` (по префиксу). `removeChip` только single-id, поэтому хелпер нужен.

### Файлы
`chip-editable-input.tsx` (крестик в `createChipElement`), `prompt-chips-context.tsx` (`removeChipsForNode`), `workflow-node.tsx` (вызов хелпера при закрытии).

### Критерии приёмки
- [ ] У каждого `removable`-тега в композере есть крестик; клик убирает именно этот тег.
- [ ] Закрытие ноды крестиком снимает `node_${id}` и все `nodefield_${id}_*`; теги других узлов не затронуты.

---

## 3. Параметры сплиттера — в один параметр «Ветвление»

### AS IS
`split-fields.tsx` рисует **две** ИИ-строки `AiRow`: «По» (`by`, `:44–50`) и «Ветки» (`branches`, `:51–57`), обе → `onAiHandoff` → `handleSplitAiField` (`node-card-content.tsx:364–367`, вызывает `handleAiField` + `openSidebar`). Модель `SplitParams { by:"equal"|"random"|"segment"; branches:number }` (`types/workflow.ts:77–82`). Значения уже вычисляются: `BY_LABELS` (`:8–12`), `branchesValue` (`:37–40`), `splitSegmentBranches` (`:35`). Файл **уже использует маскот** (`:120–127`), не карандаш — п.4 его не трогает.

### TO BE
Свернуть в **одну** строку-аффорданс «Ветвление» → открывает ИИ-дровер (тот же `handleSplitAiField`). Поля `by`/`branches` в модели остаются. Значение строки = `splitSummary(params)` (**импорт из `src/state/split-segments.ts`, пишет A** — не дублировать): «По сегменту · N веток» / «Поровну · N» / «Рандомно · N». Совпадает с подзаголовком узла (12c).

### Критерии приёмки
- [ ] У сплиттера в раскрытой карточке одна ИИ-строка «Ветвление», открывающая ИИ-дровер.
- [ ] Сводка берётся из `splitSummary` (единый хелпер), совпадает с подзаголовком узла.

---

## 4. Карандаш → стрелка вниз (только на выпадашках); ScoringRow → маскот/глаз

### AS IS
`Pencil` в нодах:
- Выпадашки (Popover+Command): `node-template-select.tsx:106` (импорт `:3`, в трейлинг-span `:104–107`); `node-field-combobox.tsx:111` (импорт `:4`, span `:101–112`); `wait-fields.tsx:176` (ModeRow) и `:250` (DurationRow), импорт `:3`.
- «Интересы и триггеры» — `ScoringRow` (**inline-компонент в `node-card-content.tsx`**, `export function ScoringRow` `:153`): кнопка `:281–299`, `editable ? <Pencil/> (:295) : <Eye/> (:297)`. Открывает **дровер** (`openInterestsDrawer` `:178–182`), не список.

### TO BE
- **`Pencil` → `ChevronDown`** только в трёх выпадашках: `node-template-select.tsx`, `node-field-combobox.tsx`, `wait-fields.tsx`. Импортировать `ChevronDown` (в этих трёх файлах ещё не импортирован).
- `ScoringRow` (открывает дровер): в черновике (`editable`) — **маскот** `/mascot-icon.svg` (`<Image src="/mascot-icon.svg">`, как уже в `node-card-content.tsx:571`, `split-fields.tsx:120`); при запущенной (`!editable`) — **глаз** (`Eye`). Карандаш убрать.

### Критерии приёмки
- [ ] На трёх выпадашках вместо карандаша — `ChevronDown`.
- [ ] У «Интересы и триггеры»: черновик — маскот; запущенная — глаз; карандаша нет.

---

## 5. Индикатор изменения (жёлтый круг) → к названию параметра

### AS IS
Жёлтый круг (`h-1.5 w-1.5 … rounded-full bg-[#FFEC00]`, title «Параметр изменён») рендерится в **правой** колонке/кластере значения. Сетка строки везде `grid grid-cols-[minmax(72px,max-content)_1fr_auto]` (col1=label, col2=value, col3=dot+affordance). **Дублирован 6× в 4 формах:**
- `node-card-content.tsx` — const `dirtyDot` `:431`, рендер `:524`/`:581`/`:606` (все col3).
- `node-template-select.tsx` — const `dirtyDot` `:61`, рендер `:77`/`:105`.
- `split-fields.tsx` — компонент `DirtyDot()` `:62–70`, рендер `:95`/`:118`.
- `wait-fields.tsx` — **отдельный** `DirtyDot()` `:45–53`, рендер `:155`/`:175`/`:215`/`:249`.
- `node-field-combobox.tsx` — анонимный span `:102–108`.
- `email-field.tsx` — анонимный span `:173–179`.

Логика «когда параметр dirty»: `dirtyParams?: string[]` (`types/workflow.ts:149`), вычисляется в `workflow-view.tsx:450–457` и `:478–489`; per-row `isDirty` через `data.dirtyParams?.includes(paramKey)` (`node-card-content.tsx:428–429`).

### TO BE
- **Вынести общий `<DirtyDot/>`** (новый файл, напр. `src/sections/campaigns/dirty-dot.tsx`) и заменить все 6 копий на него — чтобы не плодить 7-ю расходящуюся копию.
- Перенести круг к **названию** параметра: рендерить в **col1**, вплотную к label, единообразно во всех компонентах. Правая колонка (col3) остаётся под контрол/иконки.
- Логика `dirtyParams` **не меняется** — это чисто презентационный перенос.

### Критерии приёмки
- [ ] У изменённого параметра жёлтый круг стоит рядом с названием (col1), а не у значения — во всех типах полей.
- [ ] Один общий `<DirtyDot/>`; логика `dirtyParams` не изменена.

---

## 6. Глазик превью — внутрь выпадашки, перед стрелкой раскрытия

> **Зависит от п.4:** стрелка (`ChevronDown`) появляется только после п.4. Делать после п.4.

### AS IS
Глаз-превью — **отдельная кнопка справа** от выпадашки, в родителе (`node-card-content.tsx`), после контрола:
- Канал/шаблон: `:474–511` — `<div flex gap-1>` → `<NodeTemplateSelect/>` в `flex-1`, затем `{selected && <button><Eye/></button>}` (`:497–510`), `onClick=openTemplatePreview(selected.id)` (`:504`).
- IVR-combo: `:542–561` — тот же паттерн, `onClick=openTemplatePreview(ivrNodePreviewTemplate(id, ivrParams))` (`:553`).
- Трейлинг выпадашек: `NodeTemplateSelect` — `<span … gap-1.5>{dirtyDot}<Pencil/></span>` (`:104–107`), **уже принимает `onPreview` (`:51`)**; `NodeFieldCombobox` — `<span … gap-1.5>{isDirty&&dot}<Pencil/></span>` (`:101–112`), **`onPreview` нет**. `NodeFieldCombobox` — **общий** (sms «Время», condition, success, end, wait, IVR); `:562–564` намеренно оставляет не-IVR combos без обёртки «чтобы не тронуть снапшоты».

### TO BE
- Перенести глаз **внутрь** трейлинг-области выпадашки, **перед** стрелкой: порядок `[значение …] [глаз] [▼]`.
- Прокинуть в `NodeTemplateSelect` и `NodeFieldCombobox` колбэк превью + флаг «превьюабельно». `NodeTemplateSelect` — переиспользовать существующий `onPreview`. `NodeFieldCombobox` — **добавить** проп `onPreview`.
- Глаз показывать **только**: канал с выбранным шаблоном + IVR. `NodeFieldCombobox` общий → **гейтить пропом** (глаз только для IVR; для sms «Время»/condition/success/end/wait глаза нет). Изменение DOM/снапшотов затронет только IVR-ветку.
- В read-only (запущенная кампания) превью доступно.

### Критерии приёмки
- [ ] В выпадашке шаблона/IVR глаз стоит непосредственно перед стрелкой.
- [ ] Клик по глазу открывает превью, не раскрывая список.
- [ ] У полей без превью глаза нет; sms «Время»/condition/wait/success/end — без глаза.

---

## 9. Кнопка удаления узла

### AS IS
У раскрытого узла (`workflow-node.tsx`) единственная кнопка — X (закрыть карточку, `:113–125`, dispatch `workflow_node_deselected` `:119`). Удаления узла из графа в UI нет.
Механика удаления **уже существует**: action `workflow_structural_commands_submit` (`app-state.ts:332`, стейджинг `:843–849`) с op `remove` (`StructuralOp`, `structural-commands.ts:32`); применяется `applyOps`/`applyRemove` (`structural-commands.ts:955–994`, `:577–641`), вызывается из эффекта в `src/sections/campaigns/workflow-view.tsx:507,552`. `applyRemove` **уже реконнектит рёбра** (`incoming.source → outgoing.target`, `:600–609`) и метит соседей `needsAttention`.

> Оригинал ошибочно: (а) путь редьюсера `src/state/workflow-view.tsx` **не существует**; (б) «реконнект сделан для merge» — merge убрали на генерации шаблонов, `applyRemove` — общий, не «для merge».

### TO BE
- В раскрытой карточке (`workflow-node.tsx`) добавить кнопку-корзину рядом с X, с шагом подтверждения (inline-confirm или второй клик — по образцу существующих подтверждений в проекте).
- Видимость корзины — по **`isDeletableNodeType(type)`** (импорт из `structural-commands.ts`, **пишет A**). Удаляемы: `sms`/`email`/`push`/`ivr`, `wait`, `split`, `condition`. Неудаляемы: `source`/`signal`, `scoring`, `success`, `end`, `statistics`.
- Клик «удалить» → `dispatch({ type:"workflow_structural_commands_submit", ops:[{ kind:"remove", ref: <node> }] })`. Реконнект рёбер делает `applyRemove` (не дублировать).
- Guard в `applyRemove` (backend-защита от удаления `scoring`/`statistics`) — **делает A** (в его файле `structural-commands.ts`), тем же списком, что `isDeletableNodeType`. B полагается на него как на источник правды.

### Критерии приёмки
- [ ] У удаляемых типов в карточке есть корзина с подтверждением; узел и рёбра удаляются, граф остаётся связным (реконнект).
- [ ] У неудаляемых типов (`source`, `scoring`, `success`, `end`, `statistics`) корзины нет.
- [ ] Видимость кнопки и backend-guard используют один список (`isDeletableNodeType`).
