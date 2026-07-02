# PromptBar Layout & Node Slide-Up — Design

**Дата:** 2026-04-18
**Скоуп:** Блок B (B1 + B2) + preparatory cleanup (убрать inline-статистику в кампании).
**Статус:** design (pre-plan)

## Цель

Финальный layout для workflow-экрана:

1. **Cleanup (prep):** inline-панель `WorkflowStatus` внутри WorkflowView убирается — «Посмотреть статистику» доступно только через header-кнопку в CanvasHeader.
2. **B1 — PromptBar pinned + canvas fullscreen:** PromptBar жёстко закреплён у нижней границы (кроме Welcome, где он всё ещё центрирован на 40% для AI-chat-эффекта). Canvas занимает всю высоту workflow-вьюпорта, PromptBar рендерится overlay-ем поверх.
3. **B2 — Slide-up NodeControlPanel:** при выборе ноды панель параметров выезжает из-за верхнего края PromptBar, визуально продолжая его контейнер (общая ширина, общий фон, нет отдельной floating-карточки).

Пользовательское поведение на Welcome, guided-signal, sections (Сигналы / Кампании / Статистика) не меняется — только workflow-экран.

## Что уже есть (переиспользуем без правок)

- `src/components/ai-elements/prompt-input.tsx` — `PromptInput`, `PromptInputProvider`, `PromptInputBody`, `PromptInputTextarea`, `PromptInputHeader`, `usePromptInputController` с новым `insertAtCursor` (блок A2). Контракты не трогаем.
- `src/sections/campaigns/canvas-header.tsx` — header с динамической кнопочной матрицей (блок A6). `onGoToStats` уже диспатчит `goto_stats { campaignId }` — этого достаточно, in-graph CTA не нужен.
- `src/sections/campaigns/workflow-graph.tsx` — ReactFlow с `panOnDrag=true` (блок A4), `compact` prop, `fitView` re-run. Используется как есть.
- `src/sections/campaigns/workflow-node.tsx` — per-type палитра (восстановлена после A5), состояния ноды, иконки. Не трогаем.
- `src/sections/campaigns/node-control-panel.tsx` — header (тип / тег / категория / id), чипы, close. Правим только позиционирование и DOM-обёртку. Содержимое остаётся.
- `src/sections/shell/shell-bottom-bar.tsx` — обёртка PromptInput с placeholder-логикой, step-бейджами, `SelectedNodeEffect`, `ClearOnLeaveWorkflowEffect`. Правим позиционирование motion-обёртки (`bottom: 3%` → `bottom: 0` для не-welcome).
- `src/state/app-state.ts` — state без изменений (нам не нужно новых action'ов для B).
- `motion/react` — для slide-up анимации NodeControlPanel (у нас уже есть AnimatePresence для других элементов).

## Что убирается / переделывается

### Cleanup (prep)

- `WorkflowStatus` внутри `WorkflowView` (`src/sections/campaigns/workflow-view.tsx:173-186`) — удалить блок целиком, включая `<AnimatePresence>`-обёртку. Импорт `WorkflowStatus` + `AnimatePresence` (если он больше не используется внутри файла) — удалить.
- `onGoToStats` prop у `WorkflowView` — удалить (единственным потребителем был `WorkflowStatus`). `WorkflowSection` перестаёт передавать `onGoToStats={handleGoToStats}` в `<WorkflowView>`. `handleGoToStats` в `WorkflowSection` остаётся — его вызывает `CanvasHeader` через `onGoToStats` prop.
- Файл `src/sections/campaigns/workflow-status.tsx` — удалить (осиротел).
- `tests/e2e/happy-path.spec.ts` — заменить шаги 13-14 (проверка «Кампания запущена» + клик по in-graph CTA «Посмотреть статистику →») на клик по header-кнопке «Посмотреть статистику» (вариант: `page.getByRole("button", { name: /Посмотреть статистику/ })`).

### B1 — PromptBar pinned + canvas fullscreen

**Позиционирование в `shell-bottom-bar.tsx`:**

- Текущая motion-обёртка: `className="fixed left-[120px] right-0 z-30 bg-background px-8 pb-4"` + `animate={{ bottom: floatBottom }}` где `floatBottom = isOnWelcome(state) ? "40%" : "3%"`.
- Новое поведение: `floatBottom = isOnWelcome(state) ? "40%" : "0%"`. Welcome сохраняет эффект «AI-chat-по-центру», остальные экраны получают PromptBar прижатым к низу.
- Убираем `bg-background` из motion-обёртки на workflow-экране — PromptBar должен быть translucent overlay поверх canvas. Вместо сплошного фона — `bg-background/80 backdrop-blur-sm` (лёгкое затенение чтобы текст читался над сеткой graph'а, но canvas просвечивал). Это применяется только когда `view.kind === "workflow"`. Для Welcome и других секций — остаётся `bg-background` (без blur, без прозрачности).
- Градиентная маска `<div className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-background to-transparent" />` — на workflow-экране не нужна (backdrop-blur делает её роль). Оставляем на остальных экранах.

**Layout canvas-области в `workflow-section.tsx` + `workflow-view.tsx`:**

- `WorkflowSection` сейчас возвращает `<div className="relative flex flex-1 flex-col">` с `CanvasHeader` + inner `<div className="relative flex flex-1 flex-col overflow-hidden">` обёрткой вокруг `WorkflowView`. После B1 — inner обёртка занимает всё доступное пространство после header'а, без padding-bottom под PromptBar. PromptBar рендерится overlay-ем.
- `WorkflowView` после удаления inline-stats становится простым `<div className="relative flex flex-1 flex-col overflow-hidden">` с единственным child'ом — `WorkflowGraph` на всю высоту. Prop `launched` всё ещё используется для `compact` в `WorkflowGraph`, но не влияет на высоту контейнера.
- Canvas высотой 100% — ReactFlow сам заполняет, `fitView` переподстраивает зум при mount.

**Overlay-семантика:**

- PromptBar `z-30` — выше canvas (ReactFlow `z-index` default 1-5). Клики по PromptBar не проваливаются в canvas. Pan работает только на пустой области canvas, не под PromptBar (ReactFlow pointer-events ограничены своим контейнером).
- На мобильных разрешениях (≤640px) PromptBar может перекрывать ноды у нижнего края — это ок, пользователь скроллит canvas pan'ом.

### B2 — Slide-up NodeControlPanel

**Задача:** визуально NodeControlPanel «выезжает» из PromptBar — общая ширина (`max-w-2xl`), тот же фон, плотно прилегает к верхней грани бара, анимация раскрытия.

**DOM-архитектура:**

Сохраняем текущее разделение ответственности — `NodeControlPanel` рендерится в `WorkflowSection` (он знает графовой состояние через `graphRef`). Но меняем стиль и позиционирование:

- Контейнер: `fixed left-[120px] right-0 z-30 px-8`, `bottom` вычисляется динамически = высота PromptBar. У PromptBar в workflow-режиме сейчас primary height ≈ 120px (textarea + footer) — зафиксируем CSS-переменной `--promptbar-height: 120px` в shell-bottom-bar.tsx root, и NodeControlPanel позиционируется через `bottom: var(--promptbar-height)`.
- Внутренний card: `mx-auto w-full max-w-2xl` (ровно как `PromptInputBody`), `rounded-t-lg` (только верх, низ плоский — визуальное слияние с PromptBar). `border border-b-0 border-border bg-card/95 backdrop-blur-sm`.
- Анимация: `motion.div` с `initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}`, duration 0.25s, easing `[0.32, 0.72, 0, 1]`. Обернуть в `<AnimatePresence>` внутри `WorkflowSection`.
- При закрытии (крестик или deselect) — анимация вниз + в PromptBar.

**Контент:**

Содержимое панели не меняется — header (тип + тег + категория + id), label + sublabel + подсказка «Изменить через промпт ниже», чипы. Убирается только собственный `shadow-lg` и скругление нижних углов — панель теперь визуально продолжает PromptBar.

**CSS-переменная `--promptbar-height`:**

- Определяется в `shell-bottom-bar.tsx` на root motion-обёртке через inline style: `style={{ "--promptbar-height": "120px" }}`. Если PromptBar растёт (attachments, multi-line input) — значение можно сделать динамическим через `useLayoutEffect + getBoundingClientRect`, но для MVP — фиксированное 120px.
- Для не-workflow экранов переменная не нужна (NodeControlPanel не рендерится).

**Edge cases:**

- `aiReply` (временный popup) сейчас сидит на `bottom-[230px]`. После B2 — его `bottom` тоже должен рассчитываться от PromptBar, чтобы не перекрывался slide-up панелью. Сдвигаем на `bottom: calc(var(--promptbar-height) + 120px)` когда NodeControlPanel открыта, иначе `bottom: calc(var(--promptbar-height) + 10px)`. Или проще: `aiReply` перемещается ВНУТРЬ того же оверлея (сверху slide-up панели) — но это требует лифтинга state. Для MVP: оставляем `aiReply` как отдельный floating-элемент с `bottom: calc(var(--promptbar-height) + 10px)`, и если одновременно видны panel + reply — panel важнее, reply накладывается поверх. Это редкий edge-case.

## Структура файлов

**Удаляется:**
- `src/sections/campaigns/workflow-status.tsx`

**Модифицируется:**
- `src/sections/campaigns/workflow-view.tsx` — удалить WorkflowStatus-блок, `onGoToStats` prop.
- `src/sections/campaigns/workflow-section.tsx` — не передавать `onGoToStats` в WorkflowView; стилизация overlay-контейнера NodeControlPanel через CSS-переменную.
- `src/sections/campaigns/node-control-panel.tsx` — убрать `fixed bottom-[120px] z-30 shadow-lg`, сделать card `rounded-t-lg` без низа, обернуть в `motion.div` с slide-up анимацией.
- `src/sections/shell/shell-bottom-bar.tsx` — `floatBottom` для workflow → `"0%"`, переключение класса для overlay-фона, CSS-переменная `--promptbar-height`.
- `tests/e2e/happy-path.spec.ts` — убрать шаги 13-14 (inline-stats), заменить на клик по header-кнопке «Посмотреть статистику».

**Новых файлов нет.**

## Тесты

**Unit-тесты:** B1/B2 чисто визуальные/layout — unit-тестами не покрываются, логика state не меняется. Поведенческие кейсы — через e2e.

**Playwright e2e — новый файл `tests/e2e/block-b2.spec.ts`:**

1. Удаление inline-stats: после launch'а кампании, `getByText("Кампания запущена")` НЕ виден; но `getByRole("button", { name: /Посмотреть статистику/ })` в header кликается.
2. Canvas fullscreen: после launch'а, bounding rect `.react-flow__viewport` покрывает минимум 70% высоты workflow-контейнера (раньше было ~55%).
3. PromptBar overlay: в workflow-экране PromptBar-контейнер имеет `bottom` близкое к 0 (через `getBoundingClientRect`), а canvas-элемент простирается под ним (т.е. bottom у `.react-flow__renderer` > bottom у PromptBar).
4. NodeControlPanel slide-up: клик по ноде → `data-testid="node-control-panel"` виден, `bottom` близок к `--promptbar-height` (120px), `max-width` матчит PromptInputBody.

**Регрессия:**
- `happy-path.spec.ts` — после правки (шаги 13-14) должен пройти.
- `block-c.spec.ts`, `block-e.spec.ts` — НЕ должны сломаться (они работают с header-кнопкой / node selection, а не с WorkflowStatus).

## Open Questions / Risk Mitigation

- **Риск:** backdrop-blur на PromptBar может давать артефакты на некоторых браузерах (Safari < 14). **Mitigation:** `bg-background/80` fallback без blur визуально тоже ок; приняли как graceful degradation.
- **Риск:** фиксированная `--promptbar-height: 120px` сломается когда пользователь прикрепил файлы (attachments растягивают bar вверх). **Mitigation:** если attachments активны, panel временно накладывается поверх. Для MVP приемлемо; динамическое измерение — future work.
- **Риск:** удаление `WorkflowStatus` теряет визуальный feedback «кампания запущена». **Mitigation:** StatusBadge в header уже показывает статус `active / paused / scheduled / completed` — feedback на месте, просто в другом месте.
- **Риск:** canvas занимает всю высоту, и `panOnDrag` (блок A4) может конфликтовать с PromptBar-overlay'ем — пользователь кликает под PromptBar и попадает на canvas. **Mitigation:** PromptBar имеет `z-30` и `pointer-events-auto` на card; клик по card не проваливается. Drag начатый ПОД PromptBar остаётся внутри его bounding — canvas pan не стартует.

## Порядок имплементации (для будущего plan)

1. **Prep:** удалить WorkflowStatus рендер + файл; поправить `WorkflowView`/`WorkflowSection` props; обновить happy-path.
2. **B1:** переключить `floatBottom` на `"0%"` для не-welcome; добавить overlay-фон для workflow-режима; убедиться что canvas 100% высоты.
3. **B2:** добавить CSS-переменную `--promptbar-height`, обернуть `NodeControlPanel` в `motion.div` с slide-up, переверстать стили под `rounded-t-lg` без нижней границы, обернуть в `AnimatePresence` в `WorkflowSection`.
4. Регрессия: прогон всех 35 Playwright-тестов + добавить 4 новых кейса в `block-b2.spec.ts`.

План пишется отдельным документом: `docs/superpowers/plans/2026-04-18-promptbar-layout-and-node-slide-up.md`.
