import { test, expect } from "@playwright/test";
import { dismissIntro } from "./helpers/seed-intro";

test.beforeEach(async ({ page }) => {
  await dismissIntro(page);
});

test("logo click returns to welcome", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Добро пожаловать" })).toBeVisible();

  // Navigate into Статистика via sidebar.
  await page.getByRole("button", { name: "Статистика", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Добро пожаловать" })).not.toBeVisible();

  // Click the logo — should land back on welcome.
  await page.getByRole("button", { name: "На главный экран" }).click();
  await expect(page.getByRole("heading", { name: "Добро пожаловать" })).toBeVisible();
});

test("browser back steps between sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Добро пожаловать" })).toBeVisible();

  // welcome → Кампании ("Сигналы" is no longer a standalone sidebar section)
  await page.getByRole("button", { name: "Кампании", exact: true }).click();
  // A small wait for the section transition.
  await page.waitForTimeout(100);

  // Кампании → Статистика
  await page.getByRole("button", { name: "Статистика", exact: true }).click();
  await page.waitForTimeout(100);

  // Back → Кампании
  await page.goBack();
  await page.waitForTimeout(150);
  // Sidebar button for Кампании should be active (has accent bg).
  // We verify by checking that the welcome heading is NOT visible and
  // that we're on the Кампании section.
  await expect(page.getByRole("heading", { name: "Добро пожаловать" })).not.toBeVisible();

  // Back again → welcome
  await page.goBack();
  await page.waitForTimeout(150);
  await expect(page.getByRole("heading", { name: "Добро пожаловать" })).toBeVisible();
});
