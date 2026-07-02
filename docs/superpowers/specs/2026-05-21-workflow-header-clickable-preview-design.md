# Workflow header + clickable mini preview — design

**Дата:** 2026-05-21
**Статус:** на согласовании
**Источник:** ТЗ «Правки интерфейса Афины» v1.1, раздел 5
**Блок:** C из декомпозиции спеки (workflow header + clickable preview)

## 1. Цель

- Миниатюра workflow на экране кампании становится кликабельной — клик ведёт в просмотр workflow.
- Кнопка «Открыть workflow» убирается.
- Шапка просмотра workflow унифицируется с шапкой редактируемого workflow: тот же компонент `CanvasHeader` для обоих режимов.
- В read-only режиме появляется крупная стрелка «Назад» слева от заголовка; подзаголовок — «Просмотр workflow»; Pencil-edit названия остаётся (по решению — переименование разрешено).

Не входит: переименование действия `campaign_opened`, изменения внутри `WorkflowView`, изменения логики статусов кампании.

## 2. Текущее состояние

| Что | Где | Состояние |
|---|---|---|
| Mini preview | `src/sections/campaigns/workflow-mini-preview.tsx:27-34` | `<div className="pointer-events-none">` — клики проходят через; non-interactive |
| Кнопка «Открыть workflow» | `src/sections/campaigns/campaign-screen.tsx:55-57` | `<Button variant="outline" onClick={openWorkflow}>Открыть workflow →</Button>` |
| Read-only шапка | `src/sections/campaigns/workflow-section.tsx:352-371` (`ReadOnlyWorkflowHeader`) | Маленькая полоса: `<Button variant="ghost" size="sm">` со стрелкой + текстом «Назад», далее `text-sm font-medium` название, потом `· workflow · просмотр` |
| Editable шапка | `src/sections/campaigns/canvas-header.tsx:153-276` | `text-xl font-semibold` название с Pencil-edit, `signalLine` подзаголовок, StatusBadge + statusDescription, блок кнопок справа. **Стрелки «Назад» нет** |
| Switch read-only vs edit | `src/sections/campaigns/workflow-section.tsx:256-279` | `view.launched ? <ReadOnlyWorkflowHeader/> : <CanvasHeader/>` |
| Mini preview wrapper | `src/sections/campaigns/campaign-screen.tsx:51-58` | flex с `<WorkflowMiniPreview>` слева и `<Button>Открыть workflow</Button>` справа |

## 3. Дизайн

### 3.1. `CanvasHeader` — добавить read-only режим

Новый prop:

```ts
interface CanvasHeaderProps {
  // ...existing
  mode?: "edit" | "read-only";  // default "edit"
  onBack?: () => void;           // обязателен при mode="read-only"
}
```

Поведение по `mode`:

- **`mode="edit"`** — текущее поведение CanvasHeader без изменений. Стрелки «Назад» нет.
- **`mode="read-only"`**:
  - Слева от блока с названием появляется крупная стрелка «Назад» — `<Button variant="ghost" size="icon-lg" onClick={onBack} aria-label="Назад"><ArrowLeft className="size-5" /></Button>`. Размер `icon-lg` = 36×36, иконка size-5 (20px) — заметно крупнее текущей маленькой ghost-кнопки.
  - Подзаголовок `signalLine` заменяется на статичный текст «Просмотр workflow» — `text-xs text-muted-foreground uppercase tracking-widest` (визуально перекликается с `· workflow · просмотр` из старой шапки, но в новом lockup).
  - StatusBadge + statusDescription остаются — они уместны и в просмотре.
  - Pencil-edit названия остаётся доступен (по решению — переименовать launched кампанию можно).
  - Блок кнопок справа остаётся как есть — `CanvasHeader` уже умеет отрисовывать набор по `campaign.status`. Для launched кампании это будет, например, `active` → «Посмотреть статистику» + «Приостановить» + «Дублировать». Эти кнопки полезны и в read-only.

Layout: контейнер `flex items-start gap-3` — стрелка слева, дальше existing `flex min-w-0 flex-1 flex-col` с заголовком и подзаголовком. Стрелка занимает узкую колонку, не «съедает» ширину заголовка.

### 3.2. `workflow-section.tsx` — удалить ReadOnlyWorkflowHeader

В `src/sections/campaigns/workflow-section.tsx`:

- Удалить компонент `ReadOnlyWorkflowHeader` (строки 352-371).
- Удалить связанные импорты (`ArrowLeft`, `Button` остаются — они используются в других местах).
- В render-блоке (строки 256-279) убрать условную ветку и всегда рендерить `CanvasHeader`:

```tsx
<CanvasHeader
  campaign={currentCampaign}
  signal={currentSignal}
  onRename={handleRename}
  onSaveDraft={handleSaveDraft}
  onLaunch={handleLaunch}
  onSchedule={handleSchedule}
  onPause={handlePause}
  onResume={handleResume}
  onDuplicate={handleDuplicate}
  onGoToStats={handleGoToStats}
  onCancelSchedule={handleCancelSchedule}
  toast={toast}
  onDismissToast={dismissToast}
  mode={view.launched ? "read-only" : "edit"}
  onBack={
    view.launched
      ? () => dispatch({ type: "campaign_opened", id: currentCampaign.id })
      : undefined
  }
/>
```

### 3.3. Mini preview — кликабельная

В `src/sections/campaigns/workflow-mini-preview.tsx`:

- Контейнер становится кнопкой. Подходящий pattern: внешний `<button type="button" onClick={onClick}>` оборачивает существующий `<div className="pointer-events-none ...">`. `pointer-events-none` оставляем на внутреннем div, чтобы клик попадал на button, а не на ноды графа.
- Новый prop `onClick?: () => void`. Если не передан — превью остаётся не-кликабельным (защита от регрессий, если где-то ещё мини-превью используется).

```tsx
interface WorkflowMiniPreviewProps {
  signalType?: SignalType;
  onClick?: () => void;
}

// если onClick задан — рендерим <button>; иначе <div> как сейчас.
```

CSS button:
- `block w-full text-left` — кнопка не должна сжиматься
- `rounded-lg overflow-hidden border border-border bg-card`
- `transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/50 outline-none`
- Внутри div переносится: `relative h-32 w-full` (теперь без `pointer-events-none` на внешней рамке — она на самом графе)

Внутренний контейнер с `pointer-events-none` оставляем — чтобы клик не нырял в WorkflowGraph и не вызывал zoom/pan/выбор нод.

`aria-label`: «Открыть workflow». Visually-hidden или просто на button.

### 3.4. `campaign-screen.tsx` — убрать кнопку

В `src/sections/campaigns/campaign-screen.tsx:51-58`:

```tsx
// было
<div className="flex items-center gap-3">
  <div className="flex-1">
    <WorkflowMiniPreview signalType={signalType} />
  </div>
  <Button variant="outline" onClick={openWorkflow}>
    Открыть workflow →
  </Button>
</div>

// станет
<WorkflowMiniPreview signalType={signalType} onClick={openWorkflow} />
```

`openWorkflow` остаётся как есть.

### 3.5. Что не меняем

- `WorkflowView` (граф) — без изменений.
- `WorkflowGraph` — без изменений.
- Логика `view.kind === "workflow"`, `view.launched` — без изменений.
- Action `campaign_opened` — целевой dispatch onBack в read-only.
- StatusBadge, ScheduleCampaignDialog, confirm dialogs внутри CanvasHeader — без изменений.

## 4. Тестирование

### Manual smoke

1. Открыть launched кампанию → click on mini preview → переход в просмотр workflow.
2. На экране просмотра workflow видна крупная стрелка «Назад» слева от заголовка, подзаголовок «Просмотр workflow», название кампании с Pencil-edit.
3. Клик по стрелке «Назад» → возврат на экран кампании.
4. Pencil-edit → переименовать → подтвердить Enter → название обновилось и в шапке, и (после возврата) на экране кампании.
5. Открыть draft (не launched) кампанию в режим редактирования → шапка прежняя (без стрелки), кнопки «Сохранить черновик», «Запустить», «Запланировать».
6. Кнопка «Открыть workflow» отсутствует на экране кампании.
7. Hover на mini preview → бордер подсвечивается, курсор pointer.
8. Tab по странице → фокус ловится на mini preview (focus-visible ring); Enter — открывает workflow.

### Edge cases

- Кампания с `status="paused"` в launched-режиме → шапка показывает «Посмотреть статистику» + «Дублировать» + «Возобновить» — это нормально для read-only режима по PRODUCT.md (юзер должен иметь экшены).
- Без сигнала (signal=null) — `signalLine` в edit показывает destructive «Сигнал не привязан». В read-only этого не должно случиться (launched кампания имеет signal), но защитный кейс: при `mode="read-only"` подзаголовок всегда «Просмотр workflow», игнорируя signal.

## 5. Acceptance criteria (из ТЗ §9)

- [ ] Миниатюра workflow кликабельна, открывает экран просмотра.
- [ ] Кнопка «Открыть workflow» удалена.
- [ ] Шапка нередактируемого workflow (read-only) визуально соответствует шапке редактируемого: тот же компонент CanvasHeader.
- [ ] Кнопка «Назад» = крупная стрелка слева от заголовка (видна только в read-only).
- [ ] Под заголовком в read-only — подпись «Просмотр workflow».
- [ ] Pencil-edit названия доступен и в read-only (название можно менять).

## 6. Файлы, которые будут изменены

- `src/sections/campaigns/canvas-header.tsx` — добавить props `mode`, `onBack`; рендер стрелки `ArrowLeft` слева в `mode="read-only"`; замена подзаголовка на «Просмотр workflow» в read-only.
- `src/sections/campaigns/workflow-section.tsx` — удалить `ReadOnlyWorkflowHeader`; всегда рендерить `CanvasHeader` с `mode={view.launched ? "read-only" : "edit"}` и `onBack`.
- `src/sections/campaigns/workflow-mini-preview.tsx` — добавить prop `onClick`; обернуть в `<button>` когда задан; внутренний div сохраняет `pointer-events-none`.
- `src/sections/campaigns/campaign-screen.tsx` — удалить кнопку «Открыть workflow»; передать `onClick={openWorkflow}` в `WorkflowMiniPreview`.

Реализация ведётся в git worktree (`.worktrees/workflow-header-preview` на ветке `feature/workflow-header-preview`) согласно AGENTS.md.

## 7. Что НЕ делаем в этом блоке

- Не меняем поведение действия `campaign_opened` (целевой dispatch onBack уже корректен).
- Не меняем поведение `view.launched` флага в state.
- Не объединяем `campaign-screen.tsx` со `workflow-section.tsx`.
- Не правим `WorkflowGraph` (внутренний xyflow).

## 8. Риски

- **CanvasHeader становится «универсальным» — рост сложности.** Условие `mode === "read-only"` появляется в двух местах (left arrow render, подзаголовок). Это терпимо; если в будущем добавятся ещё ветки — рассмотреть выделение `ReadOnlyHeader` как отдельной компоновки. Сейчас не разделяем — иначе будем дублировать all StatusBadge + кнопки.
- **Mini preview как `<button>` оборачивающий граф.** Нужно убедиться, что внутренний `pointer-events-none` остаётся на div вокруг WorkflowGraph. Иначе клики по нодам могут стрелять `onNodeClick` или zoom-handler.
- **Focus order на кнопке-картинке.** После замены button-кнопки на превью focus order становится: header → preview button → providers → CTA. Это лучше текущего (preview сейчас вообще не получает focus).
- **«Просмотр workflow» как подзаголовок vs `signalLine`.** Тратим читаемость для unification. Можно показать оба (`signalLine` + label «Просмотр workflow» в строке выше) — но это удваивает высоту шапки. Принимаем простой вариант — один подзаголовок «Просмотр workflow».
