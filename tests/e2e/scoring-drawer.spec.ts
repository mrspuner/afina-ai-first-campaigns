// 2c — the scoring node's «Интересы и триггеры» drawer is EDITABLE while the
// campaign is a draft (not launched) and READ-ONLY once launched. Reuses the
// catalog's workflow-draft (draft) and workflow-launched (active) screens.
import { test, expect, type Page } from "@playwright/test";
import { seedScreen } from "./screens/seed";
import { SCREENS } from "./screens/catalog";

async function openScoringDrawer(page: Page, editLabel: RegExp) {
  await page.locator('[data-node-type="scoring"]').first().click();
  await expect(page.getByTestId("node-control-panel")).toBeVisible();
  await page.getByRole("button", { name: editLabel }).click();
  const drawer = page.locator('[data-slot="sheet-content"]');
  await expect(drawer).toBeVisible();
  return drawer;
}

test.describe("scoring «Интересы и триггеры» drawer — draft editable / launched read-only (2c)", () => {
  test("draft: drawer is editable (interest toggles reflect selection)", async ({
    page,
  }) => {
    const screen = SCREENS.find((s) => s.id === "workflow-draft")!;
    await seedScreen(page, screen);
    const drawer = await openScoringDrawer(page, /Изменить интересы и триггеры/);
    // The campaign's interest is rendered as a pressed toggle button, and the
    // catalog direction offers more to pick from → multiple toggles present.
    await expect(
      drawer.getByRole("button", { name: "Кредитование" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await drawer.locator('button[aria-pressed]').count()
    ).toBeGreaterThan(1);
  });

  test("launched: drawer is read-only (no interest toggles)", async ({
    page,
  }) => {
    const screen = SCREENS.find((s) => s.id === "workflow-launched")!;
    await seedScreen(page, screen);
    const drawer = await openScoringDrawer(page, /Показать интересы и триггеры/);
    // Read-only: interests render as plain text, not pressable toggles.
    await expect(drawer.getByText("Кредитование")).toBeVisible();
    await expect(drawer.locator("button[aria-pressed]")).toHaveCount(0);
  });
});
