import { test, expect } from "@playwright/test";
import path from "node:path";
import { dismissIntro } from "./helpers/seed-intro";

test.beforeEach(async ({ page }) => {
  await dismissIntro(page);
});

// End-to-end smoke of the redesigned creation flow:
// welcome → guided-campaign wizard → workflow editor → payment → active → stats.
// (The old "guided signal → campaign type" split is gone: the wizard now creates
// the campaign directly and drops the user into the workflow editor; launch +
// payment happen on the dedicated CampaignPaymentScreen.)
test("happy path: welcome → guided campaign → editor → launch → stats", async ({
  page,
}) => {
  await page.goto("/");

  // 1. Welcome
  await expect(
    page.getByRole("heading", { name: "Добро пожаловать" })
  ).toBeVisible();

  // Mark the survey as completed via the dev panel — this both surfaces the
  // hero's «Создать кампанию» CTA and lets the wizard skip the survey gate.
  // Top up the balance so the launch step doesn't open the top-up modal.
  await page.keyboard.press("Control+Shift+KeyE");
  await page
    .getByRole("switch", { name: "Переключить статус анкеты" })
    .click();
  await page.getByRole("button", { name: "+ ₽ 10 000" }).click();
  await page.keyboard.press("Control+Shift+KeyE");

  // 2. Start the guided campaign wizard.
  await page.getByRole("button", { name: "Создать кампанию" }).click();

  // 3. Step «Сценарий» — auto-advances on selecting a curated scenario card.
  await expect(
    page.getByRole("heading", { name: /Выберите сценарий/ })
  ).toBeVisible();
  await page.getByRole("button", { name: "Спящий клиент" }).click();

  // 4. Step «Цель» — keep the default «Сигналы + коммуникация», continue.
  await expect(
    page.getByRole("heading", { name: /Что хотите получить/ })
  ).toBeVisible();
  await page.getByRole("button", { name: "Далее" }).last().click();

  // 5. Step «Интересы и триггеры» — pre-filled by AI; continue.
  await expect(
    page.getByRole("heading", { name: /Какие интересы и триггеры/ })
  ).toBeVisible();
  await page.getByRole("button", { name: "Продолжить" }).last().click();

  // 6. Step «Режим анализа» — keep the default «Разовый», continue.
  await expect(
    page.getByRole("heading", { name: /Разовый или потоковый/ })
  ).toBeVisible();
  await page.getByRole("button", { name: "Далее" }).last().click();

  // 7. Step «Файл» — upload the base, then continue (waits out the hashing).
  await expect(
    page.getByRole("heading", { name: "Загрузите вашу базу" })
  ).toBeVisible();
  const fixturePath = path.resolve(__dirname, "fixtures/test-base.csv");
  await page
    .locator('input[type="file"][accept*="csv"]')
    .first()
    .setInputFiles(fixturePath);
  await expect(page.getByText("test-base.csv")).toBeVisible();
  await page.getByRole("button", { name: "Далее" }).last().click();

  // 8. Step «Каналы» — pick one channel, continue. (Heading appears after the
  //    ~hashing step; allow extra time.)
  await expect(
    page.getByRole("heading", { name: /Как будем общаться/ })
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("checkbox", { name: /SMS/ }).click();
  await page.getByRole("button", { name: "Далее" }).last().click();

  // 9. Step «Бюджет» — recommended estimate, continue → workflow editor.
  //    Wait for the step's body (the budget cards) to render before clicking —
  //    StepContent types its title/subtitle first, so «Далее» appears late and
  //    a premature `.last()` would re-hit the previous step's button.
  const budgetHeading = page.getByRole("heading", { name: /Проверьте кампанию/ });
  await expect(budgetHeading).toBeVisible();
  // Карточек «Рекомендуемая / Своя сумма» на шаге больше нет — сумма задаётся
  // на экране оплаты. Признак готовности шага теперь строка прогноза.
  await expect(page.getByText("Рекомендуемый бюджет")).toBeVisible();
  // Scope to the budget step's own StepContent root (heading → .mb-8 → root)
  // rather than a blind `.last()` — the app now has four «Создать кампанию»
  // buttons (welcome view, campaigns section, empty-state card, and this
  // step's forward CTA), so a global `.last()` is no longer safe.
  await budgetHeading
    .locator("xpath=../..")
    .getByRole("button", { name: "Создать кампанию" })
    .click();

  // 10. Campaign card (draft) — the wizard lands here, not in the graph editor.
  //     Its «Сценарий кампании» block carries the mini-graph; the «Запуск»
  //     block below it shows a touch forecast + payments (A2.3), and its
  //     «К оплате» CTA validates the graph and routes to the payment screen
  //     (a routing hop, not the launch itself).
  //     The «Создаём кампанию» waiting screen sits between the click and the
  //     card (durationMs 4000 + a trailing 200ms pause = ~4200ms), so give
  //     the card generous headroom.
  await expect(page.getByText("Сценарий кампании")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10_000 });
  await page
    .locator('[data-slot="button"]')
    .filter({ hasText: /^К оплате$/ })
    .first()
    .click();

  // 11. Payment screen — pick a small custom budget within the seeded balance,
  //     then launch. (Recommended may exceed the seeded balance for a large
  //     base; a custom sum keeps the «Запустить» CTA out of top-up mode.)
  await expect(
    page.getByRole("heading", { name: "test-base.csv" })
  ).toHaveCount(0); // sanity: heading is the campaign name, not the file
  await page.getByRole("button", { name: /Своя сумма/ }).click();
  await page.getByLabel("Своя сумма").fill("500");
  await page
    .locator('[data-slot="button"]')
    .filter({ hasText: /^Запустить$/ })
    .first()
    .click();

  // 12. Launch animation → active campaign detail screen. Wait for a detail-card
  //     action that is unique to that screen («Дублировать») before opening
  //     stats — otherwise the always-present sidebar «Статистика» button would
  //     satisfy the wait during the launch animation and the click would land
  //     on global stats. The «Статистика» action lives on the detail card now
  //     (not the canvas header); `.last()` selects it over the sidebar nav
  //     button (sidebar renders first in the DOM).
  await expect(
    page.getByRole("button", { name: "Дублировать", exact: true })
  ).toBeVisible({ timeout: 10_000 });
  await page
    .getByRole("button", { name: "Статистика", exact: true })
    .last()
    .click();

  // 13. Campaign statistics view.
  await expect(
    page.getByRole("heading", { name: "Статистика кампании" })
  ).toBeVisible();
});
