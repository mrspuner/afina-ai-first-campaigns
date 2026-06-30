import { test, expect } from "@playwright/test";
import { seedScreen } from "./screens/seed";
import { SCREENS } from "./screens/catalog";

test.describe("@visual screens", () => {
  for (const screen of SCREENS) {
    test(`visual: ${screen.name} (${screen.id})`, async ({ page }) => {
      await seedScreen(page, screen);
      await expect(page).toHaveScreenshot(`${screen.id}.png`, {
        fullPage: true,
        mask: (screen.mask ?? []).map((s) => page.locator(s)),
      });
    });
  }
});
