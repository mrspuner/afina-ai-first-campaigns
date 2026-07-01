// The scoring node's «Интересы и триггеры» opens the SAME interests/triggers
// editor the wizard uses, hosted inside the AI sidebar (chat-drawer) that
// already carries «Афина ИИ» + the prompt composer. Editable while the campaign
// is a draft (not launched), read-only once launched. Reuses the catalog's
// workflow-draft (draft) and workflow-launched (active) screens.
import { test, expect, type Page } from "@playwright/test";
import { seedScreen } from "./screens/seed";
import { SCREENS } from "./screens/catalog";

async function openScoringDrawer(page: Page, editLabel: RegExp) {
  await page.locator('[data-node-type="scoring"]').first().click();
  await expect(page.getByTestId("node-control-panel")).toBeVisible();
  await page.getByRole("button", { name: editLabel }).click();
  const drawer = page.getByTestId("chat-drawer");
  await expect(drawer).toBeVisible();
  return drawer;
}

test.describe("scoring «Интересы и триггеры» drawer — draft editable / launched read-only", () => {
  test("draft: opens the shared editor inside the «Афина ИИ» drawer with the prompt composer", async ({
    page,
  }) => {
    const screen = SCREENS.find((s) => s.id === "workflow-draft")!;
    await seedScreen(page, screen);
    const drawer = await openScoringDrawer(page, /Изменить интересы и триггеры/);

    // The drawer IS the «Афина ИИ» AI sidebar (header + prompt composer present).
    await expect(drawer.getByText("Афина ИИ")).toBeVisible();
    await expect(
      drawer.locator('[role="textbox"][contenteditable="true"]')
    ).toBeVisible();

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

  test("launched: drawer is read-only (interests as text, no toggles) but still «Афина ИИ»", async ({
    page,
  }) => {
    const screen = SCREENS.find((s) => s.id === "workflow-launched")!;
    await seedScreen(page, screen);
    const drawer = await openScoringDrawer(page, /Показать интересы и триггеры/);

    // Still the «Афина ИИ» drawer.
    await expect(drawer.getByText("Афина ИИ")).toBeVisible();

    // Read-only: interests render as plain text, not pressable toggles.
    await expect(drawer.getByText("Кредитование")).toBeVisible();
    await expect(drawer.locator("button[aria-pressed]")).toHaveCount(0);
  });
});
