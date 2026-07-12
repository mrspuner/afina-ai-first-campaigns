// The scoring node's «Интересы и триггеры» opens a SELF-CONTAINED selection
// layer (component ScoringDrawer, testid "scoring-drawer") — the same
// interests/triggers editor the wizard uses, but WITHOUT the «Афина ИИ» chat
// header or prompt composer inside it (refactor 7181b7a: «независимый слой,
// без AI внутри»). Editable while the campaign is a draft, read-only once
// launched. Reuses the catalog's workflow-draft / workflow-launched screens.
import { test, expect, type Page } from "@playwright/test";
import { seedScreen } from "./screens/seed";
import { SCREENS } from "./screens/catalog";

async function openScoringDrawer(page: Page, editLabel: RegExp) {
  await page.locator('[data-node-type="scoring"]').first().click();
  await expect(page.getByTestId("node-control-panel")).toBeVisible();
  await page.getByRole("button", { name: editLabel }).click();
  const drawer = page.getByTestId("scoring-drawer");
  await expect(drawer).toBeVisible();
  return drawer;
}

test.describe("scoring «Интересы и триггеры» drawer — draft editable / launched read-only", () => {
  test("draft: opens the self-contained selection layer (interests toggles + trigger domains)", async ({
    page,
  }) => {
    const screen = SCREENS.find((s) => s.id === "workflow-draft")!;
    await seedScreen(page, screen);
    const drawer = await openScoringDrawer(page, /Изменить интересы и триггеры/);

    // Own layer header — «Скоринг · нода» + the «Интересы и триггеры» title.
    // It is a pure selection panel: NO «Афина ИИ» chat, NO prompt composer.
    await expect(drawer.getByText("Интересы и триггеры")).toBeVisible();
    await expect(drawer.getByText("Афина ИИ")).toHaveCount(0);
    await expect(
      drawer.locator('[role="textbox"][contenteditable="true"]')
    ).toHaveCount(0);

    // Same editor as the wizard: the campaign's interest is a pressed toggle, the
    // direction catalog offers more toggles to pick from.
    await expect(
      drawer.getByRole("button", { name: "Кредитование" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(await drawer.locator("button[aria-pressed]").count()).toBeGreaterThan(1);

    // Triggers + their DOMAINS render (not just interest chips): the selected
    // interest unlocks trigger cards whose domain chips (font-mono) are shown.
    expect(
      await drawer.getByRole("button", { name: /раскрыть триггер/ }).count()
    ).toBeGreaterThan(0);
    expect(await drawer.locator(".font-mono").count()).toBeGreaterThan(0);
  });

  test("launched: drawer is read-only (interests as text, no toggles)", async ({
    page,
  }) => {
    const screen = SCREENS.find((s) => s.id === "workflow-launched")!;
    await seedScreen(page, screen);
    const drawer = await openScoringDrawer(page, /Показать интересы и триггеры/);

    // Still the same self-contained layer.
    await expect(drawer.getByText("Интересы и триггеры")).toBeVisible();

    // Read-only: interests render as plain text, not pressable toggles.
    await expect(drawer.getByText("Кредитование")).toBeVisible();
    await expect(drawer.locator("button[aria-pressed]")).toHaveCount(0);
  });
});
