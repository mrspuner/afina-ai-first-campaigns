# Block F — Launch Flyout: search + live signal list Implementation Plan

**Goal:** Переписать `LaunchFlyout`: поиск + секция шаблонов сигналов + секция живых сигналов для запуска кампаний.

**Spec:** `docs/superpowers/specs/2026-04-18-launch-flyout-design.md`
**Roadmap:** блок F (финальный). HEAD main `1288656`.

---

## File Structure

**Create:**
- `src/sections/shell/signal-row.tsx` — compact single-line row для флайаута.
- `tests/e2e/block-f.spec.ts` — 4 сценария.

**Modify:**
- `src/sections/shell/launch-flyout.tsx` — полная перезапись: search input + 2 секции (templates + live signals) + empty search state.
- `src/app/page.tsx` — убрать `onCampaignSelect` prop; больше не нужен.

---

## Task 1: Build `SignalRow` component

**Files:**
- Create: `src/sections/shell/signal-row.tsx`

Создать компактный row для использования в LaunchFlyout:

```tsx
"use client";

import type { Signal } from "@/state/app-state";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

interface SignalRowProps {
  signal: Signal;
  onClick: (signalId: string) => void;
}

export function SignalRow({ signal, onClick }: SignalRowProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(signal.id)}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-accent"
    >
      <p className="text-sm font-medium text-foreground">{signal.type}</p>
      <p className="text-xs text-muted-foreground">
        {formatNumber(signal.count)} · от {formatDate(signal.updatedAt)}
      </p>
    </button>
  );
}
```

### Verification
- `npx tsc --noEmit` — no new type errors.

### Commit
`feat(shell): add compact SignalRow for launch flyout`

---

## Task 2: Rewrite `LaunchFlyout`

**Files:**
- Modify: `src/sections/shell/launch-flyout.tsx`

Полная перезапись. Структура:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { SignalRow } from "./signal-row";

const SIGNAL_TEMPLATES = [
  { id: "registration", title: "Регистрация",   description: "Возврат пользователей после незавершённой регистрации или брошенной корзины" },
  { id: "first-deal",   title: "Первая сделка", description: "Обогащение данных о клиенте, оценка потенциала и рисков" },
  { id: "upsell",       title: "Апсейл",        description: "Мониторинг интереса к конкурентам, предотвращение оттока" },
  { id: "retention",    title: "Удержание",     description: "Мониторинг интереса к конкурентам и предотвращение оттока" },
  { id: "return",       title: "Возврат",       description: "Определение оптимального момента для повторного контакта" },
  { id: "reactivation", title: "Реактивация",   description: "Определение оптимального момента для повторного контакта" },
];

interface LaunchFlyoutProps {
  open: boolean;
  onClose: () => void;
}

export function LaunchFlyout({ open, onClose }: LaunchFlyoutProps) {
  const { signals } = useAppState();
  const dispatch = useAppDispatch();
  const [query, setQuery] = useState("");

  const normalized = query.trim().toLocaleLowerCase("ru-RU");

  const filteredTemplates = useMemo(() => {
    if (!normalized) return SIGNAL_TEMPLATES;
    return SIGNAL_TEMPLATES.filter((t) =>
      t.title.toLocaleLowerCase("ru-RU").includes(normalized) ||
      t.description.toLocaleLowerCase("ru-RU").includes(normalized)
    );
  }, [normalized]);

  const sortedSignals = useMemo(
    () => [...signals].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [signals]
  );

  const filteredSignals = useMemo(() => {
    if (!normalized) return sortedSignals;
    return sortedSignals.filter((s) =>
      s.type.toLocaleLowerCase("ru-RU").includes(normalized)
    );
  }, [normalized, sortedSignals]);

  const nothingFound =
    normalized &&
    filteredTemplates.length === 0 &&
    filteredSignals.length === 0;

  if (!open) return null;

  function selectTemplate(id: string, name: string) {
    dispatch({ type: "flyout_signal_select", id, name });
    onClose();
  }

  function selectSignal(signalId: string) {
    dispatch({ type: "campaign_from_signal", signalId });
    onClose();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-label="Запустить"
        className="fixed inset-y-0 left-[120px] z-50 flex w-[360px] flex-col bg-card shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Запустить</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск"
              aria-label="Поиск"
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {nothingFound ? (
            <p className="mt-8 text-center text-sm text-muted-foreground">
              Ничего не найдено.
            </p>
          ) : (
            <>
              {filteredTemplates.length > 0 && (
                <section className="mb-2">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-foreground">
                    Новый сигнал
                  </p>
                  <div className="flex flex-col gap-2">
                    {filteredTemplates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => selectTemplate(t.id, t.title)}
                        className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent"
                      >
                        <p className="text-sm font-medium text-foreground">{t.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section className="mt-6">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-foreground">
                  Новая коммуникационная кампания
                </p>
                {signals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Нет сигналов. Создайте сигнал в разделе Сигналы.
                  </p>
                ) : filteredSignals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Сигналы не подходят под запрос.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {filteredSignals.map((s) => (
                      <SignalRow key={s.id} signal={s} onClick={selectSignal} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
```

### Verification
- `npx tsc --noEmit` clean.
- `npm test -- --run` green.

### Commit
`feat(shell): rewrite LaunchFlyout with search + live signal list`

---

## Task 3: Update `page.tsx`

**Files:**
- Modify: `src/app/page.tsx`

Убрать `onSignalSelect` / `onCampaignSelect` проп (теперь LaunchFlyout сам диспатчит):

```tsx
<LaunchFlyout
  open={launchFlyoutOpen}
  onClose={() => dispatch({ type: "flyout_close" })}
/>
```

### Verification
- `npx tsc --noEmit` clean (page.tsx больше не передаёт снятые пропы).
- `npm run test:e2e -- tests/e2e/happy-path.spec.ts` — проверить что legacy-path всё ещё работает.

### Commit
`refactor(shell): simplify LaunchFlyout props`

---

## Task 4: Playwright Block F

**Files:**
- Create: `tests/e2e/block-f.spec.ts`

Четыре сценария:

```ts
import { test, expect, type Page } from "@playwright/test";

async function applyPreset(page: Page, key: "empty" | "mid" | "full") {
  await page.keyboard.press("Control+Shift+KeyD");
  const label = key.charAt(0).toUpperCase() + key.slice(1);
  await page.getByRole("button", { name: new RegExp(`^${label}\\b`) }).click();
  await page.keyboard.press("Control+Shift+KeyD");
}

async function openFlyout(page: Page) {
  await page.getByRole("button", { name: "Запустить" }).first().click();
  await expect(page.getByRole("dialog", { name: "Запустить" })).toBeVisible();
}

test.describe("Block F — Launch flyout", () => {
  test("empty preset shows templates and no-signals hint", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "empty");
    await openFlyout(page);

    await expect(page.getByRole("textbox", { name: "Поиск" })).toBeVisible();
    await expect(page.getByText("Новый сигнал")).toBeVisible();
    await expect(page.getByText(/Нет сигналов\. Создайте сигнал/)).toBeVisible();
  });

  test("mid preset lists live signals; click opens workflow", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFlyout(page);

    await expect(page.getByText("Новая коммуникационная кампания")).toBeVisible();
    // Signal rows — кликаем первый
    const firstRow = page
      .getByRole("dialog", { name: "Запустить" })
      .getByRole("button")
      .filter({ hasText: /·\s+от\s+\d{2}\.\d{2}/ })
      .first();
    await firstRow.click();
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 5_000 });
  });

  test("search filters templates and signals", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFlyout(page);

    await page.getByRole("textbox", { name: "Поиск" }).fill("апсейл");
    await expect(
      page.getByRole("dialog", { name: "Запустить" }).getByText("Апсейл").first()
    ).toBeVisible();
    // «Регистрация» template скрыт
    await expect(
      page.getByRole("dialog", { name: "Запустить" }).getByText("Регистрация")
    ).toBeHidden();
  });

  test("search with no matches shows empty state", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFlyout(page);

    await page.getByRole("textbox", { name: "Поиск" }).fill("qwertyqwerty");
    await expect(page.getByText("Ничего не найдено.")).toBeVisible();
  });
});
```

### Verification
- `npx playwright test tests/e2e/block-f.spec.ts --reporter=list` — 4/4 PASS.
- `npx playwright test --reporter=list` — all 22 tests PASS.

### Commit
`test(e2e): cover Block F flyout search and live signals`

---

## Task 5: Final verification + roadmap

- Run full lint + unit + e2e.
- Merge to main; delete branch.
- Update memory roadmap: F → ✅ implemented, HEAD SHA; mark whole roadmap complete.

### Commit
No code commit — memory file is outside repo.

---

## Self-Review Notes

- Spec §5 file list matches Tasks 1–4.
- Reusable: confirmed (SignalCard intentionally NOT extended; new SignalRow to keep contracts clean).
- No new reducer actions — all required dispatches already present.
- Tests cover: empty/live state, search filter, empty filter, navigation to Canvas.
- Risks addressed: `flyout_campaign_select` unused but kept in reducer; page.tsx prop removal contained.
