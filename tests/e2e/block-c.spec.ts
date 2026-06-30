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

// A campaign card opens its detail screen; the canvas editor is entered from
// there via «Открыть workflow». A draft opens the editable editor.
async function openFirstDraftEditor(page: Page) {
  await page.getByRole("button", { name: "Кампании", exact: true }).click();
  await page
    .locator("[data-slot=card]")
    .filter({ hasText: "Не запущена" })
    .first()
    .click();
  await page.getByRole("button", { name: "Открыть workflow" }).click();
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 5_000 });
}

// Opens the detail screen of the first ACTIVE campaign (badge «Запущена», not
// «Не запущена» — match the exact badge text so drafts are excluded).
async function openFirstActiveDetail(page: Page) {
  await page.getByRole("button", { name: "Кампании", exact: true }).click();
  await page
    .locator("[data-slot=card]")
    .filter({ has: page.getByText("Запущена", { exact: true }) })
    .first()
    .click();
  await expect(page.getByRole("button", { name: "К кампаниям" })).toBeVisible();
}

function headerLaunchButton(page: Page) {
  // base-ui's Tooltip wraps the trigger, so the editor exposes two matching
  // «Запустить» buttons — take the first (the actionable, visible one).
  return page
    .locator('[data-slot="button"]')
    .filter({ hasText: /^Запустить$/ })
    .first();
}

test.describe("Block C — Canvas header (editor)", () => {
  test("renders name, autosave indicator, and launch button", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFirstDraftEditor(page);

    // «Сохранить черновик» is gone — auto-save shows «Изменения сохранены».
    await expect(
      page.getByRole("button", { name: "Сохранить черновик" })
    ).toHaveCount(0);
    await expect(page.getByText("Изменения сохранены")).toBeVisible();
    await expect(headerLaunchButton(page)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Переименовать кампанию" })
    ).toBeVisible();
  });

  test("rename persists and propagates to campaign list", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFirstDraftEditor(page);

    await page
      .getByRole("button", { name: "Переименовать кампанию" })
      .click();
    const input = page.getByRole("textbox", { name: "Название кампании" });
    await input.fill("Переименованная кампания");
    await input.press("Enter");
    await expect(
      page.getByRole("button", { name: "Переименовать кампанию" })
    ).toContainText("Переименованная кампания");

    await page.getByRole("button", { name: "Кампании", exact: true }).click();
    await expect(page.getByText("Переименованная кампания")).toBeVisible();
  });

  test("launch from the editor routes to the payment screen", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFirstDraftEditor(page);

    // The canvas «Запустить» is now a routing hop: it validates the graph and
    // opens the dedicated payment screen (launch itself happens there).
    await headerLaunchButton(page).click();
    await expect(page.getByText("Оплата запуска кампании")).toBeVisible({
      timeout: 5_000,
    });
  });

  // removed: "save-draft button shows info toast" — «Сохранить черновик» was
  // removed; the editor auto-saves and shows «Изменения сохранены» instead
  // (covered above). No toast equivalent.
});

test.describe("Block C — Detail-screen action matrix", () => {
  // The launch/stop/duplicate/stats matrix moved from the canvas header to the
  // campaign detail screen, with new labels: «Остановить» (not «Приостановить»),
  // «Статистика» (not «Посмотреть статистику»), and stop has NO confirm dialog
  // here (the editor's «Приостановить» still confirms).
  test("active campaign exposes stats / duplicate / stop actions", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFirstActiveDetail(page);

    // «Статистика» also matches the sidebar nav button — scope to the last
    // (detail action renders after the sidebar in the DOM).
    await expect(
      page.getByRole("button", { name: "Статистика", exact: true }).last()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Дублировать", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Остановить", exact: true })
    ).toBeVisible();
  });

  test("stop flips to the paused matrix, resume returns to active", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFirstActiveDetail(page);

    // Stop — no confirm dialog on the detail screen.
    await page.getByRole("button", { name: "Остановить", exact: true }).click();

    // Paused: badge «Остановлена», a resume CTA «Запустить» appears, «Остановить»
    // is gone.
    await expect(page.getByText("Остановлена").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Запустить" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Остановить", exact: true })
    ).toHaveCount(0);

    // Resume (paused «Запустить» reactivates directly, no payment) → active.
    await page.getByRole("button", { name: "Запустить" }).click();
    await expect(
      page.getByRole("button", { name: "Остановить", exact: true })
    ).toBeVisible({ timeout: 5_000 });
  });

  test("duplicate opens a new draft named 'Копия — …' in the editor", async ({
    page,
  }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFirstActiveDetail(page);

    const originalName = (await page.locator("h1").first().innerText()).trim();

    // Duplicate — no confirm; lands in the new draft's workflow editor.
    await page.getByRole("button", { name: "Дублировать", exact: true }).click();
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole("button", { name: "Переименовать кампанию" })
    ).toContainText(`Копия — ${originalName}`, { timeout: 5_000 });

    // The copy is a draft → launch button present (it is editable).
    await expect(headerLaunchButton(page)).toBeVisible();
  });

  // NOTE: the former "scheduled → cancel-schedule" case stays removed — the
  // "scheduled" campaign status no longer exists (CampaignStatus is
  // draft | active | paused | completed).
});
