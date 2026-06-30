import { test, expect, type Page } from "@playwright/test";
import { dismissIntro } from "./helpers/seed-intro";

test.beforeEach(async ({ page }) => {
  await dismissIntro(page);
});

async function applyPreset(page: Page, key: "empty" | "mid" | "full") {
  await page.keyboard.press("Control+Shift+KeyE");
  const label = key.charAt(0).toUpperCase() + key.slice(1);
  await page.getByRole("button", { name: new RegExp(`^${label}\\b`) }).click();
  await page.keyboard.press("Control+Shift+KeyE");
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

  test("dialog has no visible heading 'Запустить'", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFlyout(page);

    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Запустить" })
    ).toHaveCount(0);
  });

  test("Escape closes the flyout", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFlyout(page);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Запустить" })).toBeHidden();
  });

  test("subtitle under campaign heading is visible", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFlyout(page);

    await expect(
      page.getByText("Создать кампанию по готовому сигналу")
    ).toBeVisible();
  });
});
