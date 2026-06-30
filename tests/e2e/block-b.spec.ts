import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
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

test.describe("Block B — Signals", () => {
  test("empty preset shows empty state and NewSignalMenu", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "empty");
    await page.getByRole("button", { name: "Сигналы", exact: true }).click();

    await expect(page.getByText(/Ещё нет сигналов/)).toBeVisible();
    await page.getByRole("button", { name: /Новый сигнал/ }).click();
    await expect(page.getByRole("menuitem", { name: /Создать новый/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Загрузить с устройства/ })).toBeVisible();
  });

  test("mid preset renders sorted signal cards in single column", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: "Сигналы", exact: true }).click();

    const cards = page.locator("[data-slot=card]").filter({
      has: page.getByRole("button", { name: "Создать кампанию" }),
    });
    await expect(cards).toHaveCount(5);

    await expect(cards.first()).toContainText(/Макс|Выс|Ср|Низ/);
  });

  test("create campaign from signal navigates to workflow", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: "Сигналы", exact: true }).click();

    await page.getByRole("button", { name: "Создать кампанию" }).first().click();
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 5_000 });
  });

  test("upload dialog adds signal to list", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "empty");
    await page.getByRole("button", { name: "Сигналы", exact: true }).click();

    await page.getByRole("button", { name: /Новый сигнал/ }).click();
    await page.getByRole("menuitem", { name: /Загрузить с устройства/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const fixturePath = path.resolve(__dirname, "fixtures/block-b-signals.csv");
    await dialog.locator('input[type="file"]').setInputFiles(fixturePath);
    await expect(page.getByText("block-b-signals.csv")).toBeVisible();

    await page.getByRole("button", { name: "Импортировать" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });

    const cards = page.locator("[data-slot=card]").filter({
      has: page.getByRole("button", { name: "Создать кампанию" }),
    });
    await expect(cards).toHaveCount(1);
  });
});

test.describe("Block B — Campaigns", () => {
  test("empty preset shows CTA → Signals", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "empty");
    await page.getByRole("button", { name: "Кампании", exact: true }).click();

    await expect(page.getByText("Кампании создаются из Сигналов")).toBeVisible();
    await page.getByRole("button", { name: /Создать сигнал/ }).click();
    await expect(page.getByRole("heading", { name: "Сигналы" })).toBeVisible();
  });

  test("mid preset renders sorted campaign cards with status badges", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: "Кампании", exact: true }).click();

    const cards = page.locator("[data-slot=card]").filter({
      hasText: /Сигнал:/,
    });
    await expect(cards).toHaveCount(10);

    await expect(page.getByText("Активно").first()).toBeVisible();
    await expect(page.getByText("Запланированно").first()).toBeVisible();
    await expect(page.getByText("Не запущено").first()).toBeVisible();
    await expect(page.getByText("Завершено").first()).toBeVisible();
  });

  test("clicking a campaign card opens workflow", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: "Кампании", exact: true }).click();

    const firstCard = page.locator("[data-slot=card]").filter({ hasText: /Сигнал:/ }).first();
    await firstCard.click();
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Block A3 — contextual chat placeholders", () => {
  test("Сигналы section shows contextual placeholder", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: "Сигналы", exact: true }).click();

    await expect(
      page.getByPlaceholder("Напишите, что вы хотите сделать")
    ).toBeVisible();
  });

  test("Кампании section shows contextual placeholder", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: "Кампании", exact: true }).click();

    await expect(
      page.getByPlaceholder("Напишите, что вы хотите сделать")
    ).toBeVisible();
  });
});
