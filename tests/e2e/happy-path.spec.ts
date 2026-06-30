import { test, expect } from "@playwright/test";
import path from "node:path";
import { dismissIntro } from "./helpers/seed-intro";

test.beforeEach(async ({ page }) => {
  await dismissIntro(page);
});

test("happy path: welcome → guided signal → campaign type → launch → stats", async ({ page }) => {
  await page.goto("/");

  // 1. Welcome
  await expect(page.getByRole("heading", { name: "Добро пожаловать" })).toBeVisible();

  // Bypass the survey gate via dev panel — the wizard otherwise renders
  // the registration anketa first. Topping up the balance here also keeps
  // the launch step from opening the top-up modal further down the flow.
  await page.keyboard.press("Meta+Shift+E");
  await page
    .getByRole("switch", { name: "Переключить статус анкеты" })
    .click();
  await page.getByRole("button", { name: "+ ₽ 10 000" }).click();
  await page.keyboard.press("Meta+Shift+E");

  // 2. Click "Создать сигнал" CTA → guided signal flow
  await page.getByRole("button", { name: "Создать сигнал" }).click();

  // 3. Step 1: pick scenario (auto-advances on click)
  await expect(page.getByRole("heading", { name: "Выберите тип сигнала" })).toBeVisible();
  await page.getByRole("button", { name: /Регистрация/ }).first().click();

  // 4. Step 2: pick one interest tag + Продолжить (default direction → finance vertical)
  await expect(page.getByRole("heading", { name: /Какие интересы и триггеры/ })).toBeVisible();
  await page.getByRole("button", { name: "Кредитование" }).click();
  await page.getByRole("button", { name: "Продолжить" }).last().click();

  // 5. Step 3: pick segment + Продолжить
  await expect(page.getByRole("heading", { name: "Выберите сегменты сигнала" })).toBeVisible();
  await page.getByRole("button", { name: /Максимальный/ }).click();
  await page.getByRole("button", { name: "Продолжить" }).last().click();

  // 6. Step 4: upload file, Далее, wait hashing (~4.2s) — База теперь идёт раньше Бюджета
  await expect(page.getByRole("heading", { name: "Загрузите вашу базу" })).toBeVisible();
  const fixturePath = path.resolve(__dirname, "fixtures/test-base.csv");
  // The page also has a prompt-bar file input — scope to the dropzone (csv accept).
  await page
    .locator('input[type="file"][accept*="csv"]')
    .setInputFiles(fixturePath);
  await expect(page.getByText("test-base.csv")).toBeVisible();
  await page.getByRole("button", { name: "Далее" }).last().click();

  // 7. Step 5: pick "Своя сумма", enter 500, Далее
  await expect(
    page.getByRole("heading", { name: "Укажите максимальный бюджет" })
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Своя сумма/ }).click();
  await page.getByLabel("Своя сумма").fill("500");
  await page.getByRole("button", { name: "Далее" }).last().click();

  // 8. Step 6: summary → launch (balance was seeded at the top of the test)
  await expect(page.getByRole("heading", { name: "Проверьте настройки сигнала" })).toBeVisible({
    timeout: 15_000,
  });
  // The sidebar also has a "Запустить" button (opens the launch flyout) —
  // scope to the data-slot button that contains exactly "Запустить".
  await page
    .locator('[data-slot="button"]')
    .filter({ hasText: /^Запустить$/ })
    .last()
    .click();

  // 9. Step 7/8: processing screen briefly visible, then result. Skip the
  //    intermediate assertion — at the default 6s processing duration the
  //    flow advances faster than playwright can settle.
  await expect(page.getByRole("heading", { name: /Сигналы готовы/ })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Использовать в кампании" }).click();

  // 11. CampaignTypeView: pick first campaign type
  await expect(page.getByText("Выберите тип кампании")).toBeVisible();
  await page.getByRole("button", { name: /Возврат брошенных действий/ }).click();

  // 12. CanvasHeader → Запустить (scoped: avoid sidebar's Запустить button)
  await page.locator('[data-slot="button"]').filter({ hasText: /^Запустить$/ }).click();

  // 13. Wait for campaign to be active (header shows active-state buttons)
  await expect(
    page.getByRole("button", { name: "Посмотреть статистику" })
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
