// Task #6 — the shared BudgetBreakdown renders identically on the wizard Бюджет
// step and the campaign payment screen: a merged «Сигналы» row + a collapsible
// «Коммуникации» row whose expanded state reveals a per-channel table
// (Канал | Первичные | Повторные | Итого). Reuses the screen catalog + seedScreen.
import { test, expect, type Page } from "@playwright/test";
import { seedScreen } from "./screens/seed";
import { SCREENS } from "./screens/catalog";

function screen(id: string) {
  const s = SCREENS.find((x) => x.id === id);
  expect(s, `${id} must exist in the catalog`).toBeTruthy();
  return s!;
}

async function commButton(page: Page) {
  const btn = page.getByRole("button", { name: /Коммуникации/ });
  await expect(btn).toBeVisible({ timeout: 15_000 });
  return btn;
}

for (const id of ["wizard-7-budget", "campaign-payment"]) {
  test.describe(`BudgetBreakdown collapsible «Коммуникации» — ${id}`, () => {
    test("collapsed by default, click reveals the per-channel table, click hides it", async ({
      page,
    }) => {
      await seedScreen(page, screen(id));

      const btn = await commButton(page);
      // Collapsed by default: the table + its column headers are not present.
      await expect(page.getByText("Канал", { exact: true })).toHaveCount(0);
      await expect(btn).toHaveAttribute("aria-expanded", "false");

      // Expand → the Канал | Первичные | Повторные | Итого table appears with rows.
      await btn.click();
      await expect(btn).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByText("Канал", { exact: true })).toBeVisible();
      await expect(page.getByText("Первичные", { exact: true })).toBeVisible();
      await expect(page.getByText("Повторные", { exact: true })).toBeVisible();
      // Both seeds carry SMS + Email channels → at least those channel rows show.
      const table = page.locator("table");
      await expect(table.getByText("SMS", { exact: true })).toBeVisible();
      await expect(table.getByText("Email", { exact: true })).toBeVisible();

      // Collapse again → table gone.
      await btn.click();
      await expect(btn).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByText("Канал", { exact: true })).toHaveCount(0);
    });
  });
}
