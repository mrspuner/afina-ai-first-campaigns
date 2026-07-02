# PromptBar Layout & Node Slide-Up — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Убрать inline-статистику внутри кампании, прижать PromptBar к нижней границе workflow-экрана (overlay поверх canvas), превратить NodeControlPanel в slide-up панель, визуально продолжающую PromptBar.

**Architecture:** Никаких новых файлов. Удаляем `workflow-status.tsx`. Правим `workflow-view.tsx` (убираем status-блок), `workflow-section.tsx` (перестаём передавать `onGoToStats`, CSS-переменная `--promptbar-height`), `shell-bottom-bar.tsx` (`floatBottom: "0%"` для не-welcome, translucent фон для workflow), `node-control-panel.tsx` (slide-up позиционирование через motion, rounded-t без bottom-border). `happy-path.spec.ts` переходит на header-кнопку вместо in-graph CTA.

**Tech Stack:** React 19, Next.js 16, Tailwind v4 (`color-mix`, CSS variables), motion/react (v12), ReactFlow, Playwright.

**Spec:** `docs/superpowers/specs/2026-04-18-promptbar-layout-and-node-slide-up-design.md`

---

### Task 1: Удаление inline WorkflowStatus

**Files:**
- Modify: `src/sections/campaigns/workflow-view.tsx`
- Modify: `src/sections/campaigns/workflow-section.tsx`
- Modify: `tests/e2e/happy-path.spec.ts:61-72`
- Delete: `src/sections/campaigns/workflow-status.tsx`

- [ ] **Step 1: Убрать блок WorkflowStatus из workflow-view.tsx**

В `src/sections/campaigns/workflow-view.tsx`:
- Удалить импорт строк 5 (`AnimatePresence`), строка 7 (`WorkflowStatus`).
- Удалить импорт `motion` если он больше не используется после удаления блока (проверить — остался ли `motion.*` в файле). Если нет — удалить импорт `motion` тоже.
- Удалить JSX-блок строк 173-186 (AnimatePresence с WorkflowStatus).
- В блоке graph (строки 153-170), убрать `style={{ height: launched ? "55%" : "100%", transition: ... }}` — заменить на `style={{ height: "100%", display: "flex", flexDirection: "column", flex: 1 }}`. Убрать `flexShrink: 0`.
- Удалить prop `onGoToStats: () => void` из `WorkflowViewProps` (строка 28).
- Удалить деструктуризацию `onGoToStats` из списка аргументов `WorkflowView` (строка 67).

- [ ] **Step 2: Поправить workflow-section.tsx**

В `src/sections/campaigns/workflow-section.tsx`:
- На строке 212 убрать `onGoToStats={handleGoToStats}` из передачи props в `<WorkflowView>`.
- `handleGoToStats` (строки 170-173) оставить — его всё ещё использует `CanvasHeader` через `onGoToStats` prop.

- [ ] **Step 3: Удалить файл workflow-status.tsx**

```bash
rm src/sections/campaigns/workflow-status.tsx
```

- [ ] **Step 4: Обновить happy-path.spec.ts**

В `tests/e2e/happy-path.spec.ts` заменить строки 61-72:

```ts
  // 13. Wait for campaign to be active (status badge in header)
  await expect(
    page.getByText("Активна")
  ).toBeVisible({ timeout: 5_000 });

  // 14. Click header button "Посмотреть статистику"
  await page
    .getByRole("button", { name: "Посмотреть статистику" })
    .click();

  // 15. StatisticsView visible (scoped to a campaign → campaign-stats heading)
  await expect(
    page.getByRole("heading", { name: "Статистика кампании" })
  ).toBeVisible();
});
```

- [ ] **Step 5: Прогнать тесты**

```bash
npx tsc --noEmit 2>&1 | grep -E "workflow-view|workflow-section|happy-path" || echo "OK"
npx playwright test tests/e2e/happy-path.spec.ts
```

Expected: typecheck не выдаёт ошибок в затронутых файлах; happy-path PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sections/campaigns/workflow-view.tsx \
       src/sections/campaigns/workflow-section.tsx \
       tests/e2e/happy-path.spec.ts
git rm src/sections/campaigns/workflow-status.tsx
git commit -m "refactor(workflow): remove inline WorkflowStatus — stats via header button only"
```

---

### Task 2: B1 — PromptBar pin-to-bottom + translucent overlay

**Files:**
- Modify: `src/sections/shell/shell-bottom-bar.tsx:119-130`

- [ ] **Step 1: Заменить floatBottom и фон для workflow-режима**

В `src/sections/shell/shell-bottom-bar.tsx`:

Найти строку (около 119):
```ts
const floatBottom = isOnWelcome(state) ? "40%" : "3%";
```

Заменить на:
```ts
const floatBottom = isOnWelcome(state) ? "40%" : "0%";
const isWorkflow = isWorkflowView(state);
```

Найти motion.div (строка 124) и изменить `className`:
```tsx
<motion.div
  className={cn(
    "fixed left-[120px] right-0 z-30 px-8 pb-4",
    isWorkflow ? "bg-background/80 backdrop-blur-sm" : "bg-background"
  )}
  style={{ "--promptbar-height": "120px" } as React.CSSProperties}
  initial={false}
  animate={{ bottom: floatBottom }}
  transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
>
```

(Добавляем `cn(...)` для переключения фона + inline CSS-переменную `--promptbar-height` — пригодится для Task 3.)

Найти градиентную маску (строка 130):
```tsx
<div className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-background to-transparent" />
```

Обернуть в условие:
```tsx
{!isWorkflow && (
  <div className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-background to-transparent" />
)}
```

- [ ] **Step 2: Проверить прогон всех тестов**

```bash
npx playwright test
```

Expected: 35/35 PASS (ничего не сломалось). Визуально на workflow-экране PromptBar прижат к низу.

- [ ] **Step 3: Commit**

```bash
git add src/sections/shell/shell-bottom-bar.tsx
git commit -m "feat(shell): pin PromptBar to bottom + translucent overlay on workflow screen (B1)"
```

---

### Task 3: B2 — NodeControlPanel как slide-up панель

**Files:**
- Modify: `src/sections/campaigns/node-control-panel.tsx`
- Modify: `src/sections/campaigns/workflow-section.tsx:220-225`

- [ ] **Step 1: Переверстать NodeControlPanel — rounded-t, slide-up анимация**

Заменить содержимое `src/sections/campaigns/node-control-panel.tsx`:

```tsx
"use client";

import { X } from "lucide-react";
import { motion } from "motion/react";
import {
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import type { WorkflowNodeData, WorkflowNodeType } from "@/types/workflow";
import { NODE_CATEGORY, type NodeCategory } from "@/types/workflow";

interface NodeControlPanelProps {
  node: { id: string; data: WorkflowNodeData };
  onClose: () => void;
}

const TYPE_LABEL: Record<WorkflowNodeType, string> = {
  signal: "Сигнал",
  success: "Успех",
  end: "Конец",
  split: "Сплиттер",
  wait: "Задержка",
  condition: "Условие",
  merge: "Слияние",
  sms: "СМС",
  email: "Email",
  push: "Push",
  ivr: "Звонок",
  storefront: "Витрина",
  landing: "Лендинг",
  default: "Нода",
  channel: "Канал",
  retarget: "Ретаргет",
  result: "Результат",
  new: "Новая",
};

const CATEGORY_CHIPS: Record<NodeCategory, string[]> = {
  communication: ["Изменить текст", "Задержка 2 часа", "Добавить ссылку"],
  logic: ["Добавить ветку", "Убрать"],
  web: ["Сменить оффер", "Добавить баннер"],
  endpoint: ["Изменить цель"],
  legacy: ["Переименовать", "Обновить"],
};

export function NodeControlPanel({ node, onClose }: NodeControlPanelProps) {
  const { id, data } = node;
  const typeLabel = TYPE_LABEL[data.nodeType] ?? data.nodeType;
  const category = NODE_CATEGORY[data.nodeType];
  const chips = CATEGORY_CHIPS[category];
  const { textInput } = usePromptInputController();

  function insertChip(chipText: string) {
    textInput.insertAtCursor(chipText, { separator: "smart" });
  }

  return (
    <motion.div
      key="node-control-panel"
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
      className="pointer-events-auto fixed left-[120px] right-0 z-30 px-8"
      style={{ bottom: "var(--promptbar-height, 120px)" }}
    >
      <div
        role="region"
        aria-label="Управление нодой"
        data-testid="node-control-panel"
        className="mx-auto flex w-full max-w-2xl flex-col gap-2 rounded-t-lg border border-b-0 border-border bg-card/95 px-4 py-3 text-sm backdrop-blur-sm"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {typeLabel}
              </span>
              <span className="text-xs text-muted-foreground">@{data.label}</span>
              <span className="text-xs text-muted-foreground/60">· {category}</span>
              <span className="text-xs text-muted-foreground/40">id: {id}</span>
            </div>
            <p className="truncate text-sm font-medium text-foreground">{data.label}</p>
            {data.sublabel && (
              <p className="truncate text-xs text-muted-foreground">{data.sublabel}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground/80">
              Изменить через промпт ниже.
            </p>
          </div>
          <button
            type="button"
            aria-label="Закрыть панель ноды"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => insertChip(chip)}
                className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-foreground transition-colors hover:bg-muted"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
```

Ключевые изменения от предыдущей версии:
- `motion.div` (из `motion/react`) вместо `div` — с initial/animate/exit для slide-up.
- `bottom: var(--promptbar-height, 120px)` вместо `bottom-[120px]` — связь с bar height через CSS-переменную.
- `rounded-t-lg border-b-0` вместо `rounded-lg` — визуальная сцепка с PromptBar.
- Убрана `shadow-lg` — overlay сам по себе достаточен.

- [ ] **Step 2: Обернуть NodeControlPanel в AnimatePresence**

В `src/sections/campaigns/workflow-section.tsx` найти (около строки 220):

```tsx
{selectedNode && (
  <NodeControlPanel
    node={selectedNode}
    onClose={() => dispatch({ type: "workflow_node_deselected" })}
  />
)}
```

Заменить на:

```tsx
<AnimatePresence>
  {selectedNode && (
    <NodeControlPanel
      node={selectedNode}
      onClose={() => dispatch({ type: "workflow_node_deselected" })}
    />
  )}
</AnimatePresence>
```

В импортах добавить:
```tsx
import { AnimatePresence } from "motion/react";
```

- [ ] **Step 3: Прогнать тесты**

```bash
npx tsc --noEmit 2>&1 | grep -E "node-control|workflow-section" || echo "OK"
npx playwright test
```

Expected: 35/35 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/sections/campaigns/node-control-panel.tsx \
       src/sections/campaigns/workflow-section.tsx
git commit -m "feat(workflow): NodeControlPanel as slide-up attached to PromptBar (B2)"
```

---

### Task 4: E2E кейсы для B1/B2

**Files:**
- Create: `tests/e2e/block-b2.spec.ts`
- Modify: `tests/e2e/block-b.spec.ts` (если конфликт имени — подобрать новое имя файла, например `block-b1.spec.ts`)

- [ ] **Step 1: Создать tests/e2e/block-b2.spec.ts**

```ts
import { test, expect } from "@playwright/test";
import { applyPreset } from "./fixtures/preset";

test.describe("Block B1 — PromptBar pinned + canvas overlay", () => {
  test("PromptBar is pinned near viewport bottom on workflow screen", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: "Кампании" }).click();
    await page.locator('[data-testid="campaign-card"]').first().click();

    const viewport = page.viewportSize();
    if (!viewport) throw new Error("viewport missing");

    const barBox = await page.locator('[role="region"][aria-label="Управление нодой"], form').first().boundingBox();
    // PromptBar form container
    const promptBar = await page.locator("form").filter({ has: page.locator('textarea') }).first().boundingBox();
    expect(promptBar).not.toBeNull();
    if (promptBar) {
      expect(viewport.height - (promptBar.y + promptBar.height)).toBeLessThan(50);
    }
  });

  test("canvas occupies full workflow area (no inline stats panel)", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: "Кампании" }).click();
    // pick an active campaign
    await page.locator('[data-testid="campaign-card"]').filter({ hasText: "Активна" }).first().click();

    await expect(page.getByText("Кампания запущена")).toHaveCount(0);
    const viewport = await page.locator(".react-flow__viewport").first();
    await expect(viewport).toBeVisible();
  });
});

test.describe("Block B2 — NodeControlPanel slide-up", () => {
  test("panel attaches to PromptBar top edge when node is selected", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: "Кампании" }).click();
    await page.locator('[data-testid="campaign-card"]').first().click();

    await page.locator('[data-node-type]').first().click();
    const panel = page.locator('[data-testid="node-control-panel"]');
    await expect(panel).toBeVisible();

    const panelBox = await panel.boundingBox();
    const promptBar = await page.locator("form").filter({ has: page.locator('textarea') }).first().boundingBox();

    expect(panelBox).not.toBeNull();
    expect(promptBar).not.toBeNull();
    if (panelBox && promptBar) {
      // bottom of panel == top of promptbar (±5px tolerance)
      expect(Math.abs((panelBox.y + panelBox.height) - promptBar.y)).toBeLessThan(10);
      // same horizontal centre
      expect(Math.abs((panelBox.x + panelBox.width / 2) - (promptBar.x + promptBar.width / 2))).toBeLessThan(20);
    }
  });

  test("panel slide-up animates on node deselect (pane click closes it)", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: "Кампании" }).click();
    await page.locator('[data-testid="campaign-card"]').first().click();

    await page.locator('[data-node-type]').first().click();
    await expect(page.locator('[data-testid="node-control-panel"]')).toBeVisible();

    await page.locator(".react-flow__pane").click();
    await expect(page.locator('[data-testid="node-control-panel"]')).toBeHidden({ timeout: 1500 });
  });
});
```

- [ ] **Step 2: Прогнать новые тесты**

```bash
npx playwright test tests/e2e/block-b2.spec.ts
```

Expected: 4/4 PASS. Если какой-то кейс шатается из-за visualization timing — использовать `waitForTimeout(300)` после клика на ноду.

- [ ] **Step 3: Прогнать весь suite**

```bash
npx playwright test
```

Expected: 39/39 PASS (35 старых + 4 новых).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/block-b2.spec.ts
git commit -m "test(e2e): B1/B2 layout + slide-up panel coverage"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Cleanup (inline stats removal) → Task 1.
- ✅ B1 pin PromptBar → Task 2.
- ✅ B1 canvas fullscreen → Task 1 (удаление 55%-split) + Task 2 (overlay).
- ✅ B2 slide-up NodeControlPanel → Task 3.
- ✅ E2E для B1/B2 → Task 4.
- ✅ `--promptbar-height` CSS-переменная → Task 2 (inline style).

**2. Placeholder scan:** нет TBD / TODO / «similar to».

**3. Type consistency:** `isWorkflowView` импортируется из `app-state.ts`, уже есть в shell-bottom-bar.tsx (используется в `chatPlaceholder`). `cn` — уже импортирован.

Готово к исполнению.
