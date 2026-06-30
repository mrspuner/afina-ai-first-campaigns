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

async function completeSurvey(page: Page) {
  await page.keyboard.press("Control+Shift+KeyE");
  await page
    .getByRole("switch", { name: "Переключить статус анкеты" })
    .click();
  await page.keyboard.press("Control+Shift+KeyE");
}

// The standalone «Сигналы» sidebar section was removed in the redesign. Its
// closest current home is the Артефакты section → «Сигналы» tab, which lists
// the artifacts (collected-signal bases) produced by launched campaigns. Manual
// signal create/upload was removed by design (artifacts-section.tsx), so those
// cases are dropped (see comments) rather than repointed.
test.describe("Block B — Artifacts (repointed from removed Signals section)", () => {
  test("empty preset shows the artifacts empty state", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "empty");
    await page.getByRole("button", { name: "Артефакты", exact: true }).click();

    await expect(page.getByText("Пока нет артефактов")).toBeVisible();
    // removed: NewSignalMenu (Создать новый / Загрузить с устройства) —
    // manual signal create/upload was removed by design (no replacement).
  });

  test("mid preset renders artifact cards", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: "Артефакты", exact: true }).click();

    // One artifact per launched campaign (mid: active 2 + paused 1 + completed 3
    // = 6). Artifact cards carry a «Кампания:» link.
    const cards = page
      .locator("[data-slot=card]")
      .filter({ hasText: /Кампания:/ });
    await expect(cards).toHaveCount(6);
    await expect(cards.first()).toBeVisible();
  });

  // removed: "create campaign from signal navigates to workflow" — campaigns are
  // no longer created from a signal; creation now starts via start_campaign_flow
  // (the Кампании empty-state CTA / «Создать кампанию»). Covered by happy-path.
  // removed: "upload dialog adds signal to list" — manual signal upload was
  // removed by design (artifacts come only from launched campaigns).
});

test.describe("Block B — Campaigns", () => {
  test("empty preset CTA starts the campaign creation flow", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "empty");
    // Survey completed so the CTA lands straight on the wizard (otherwise the
    // survey gate would render first).
    await completeSurvey(page);
    await page.getByRole("button", { name: "Кампании", exact: true }).click();

    // Empty state is now the «Создайте первую кампанию» card (campaigns are no
    // longer created from Сигналы).
    await expect(page.getByText("Создайте первую кампанию")).toBeVisible();
    await page.getByRole("button", { name: "Создать кампанию" }).click();
    await expect(
      page.getByRole("heading", { name: /Выберите сценарий/ })
    ).toBeVisible();
  });

  test("mid preset renders campaign cards with status badges", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: "Кампании", exact: true }).click();

    // Card scenario line is «Сценарий:» (not «Сигнал:»); mid preset = 8 cards.
    const cards = page
      .locator("[data-slot=card]")
      .filter({ hasText: /Сценарий:/ });
    await expect(cards).toHaveCount(8);

    // Redesigned status labels (status-badge.tsx). Mid distribution covers all
    // four: active 2 / paused 1 / completed 3 / draft 2.
    await expect(page.getByText("Запущена").first()).toBeVisible();
    await expect(page.getByText("Не запущена").first()).toBeVisible();
    await expect(page.getByText("Остановлена").first()).toBeVisible();
    await expect(page.getByText("Завершена").first()).toBeVisible();
  });

  test("clicking a campaign card opens its detail screen", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: "Кампании", exact: true }).click();

    // A card now opens the campaign detail screen (not the canvas editor). The
    // editor is reached from there via «Открыть workflow».
    const firstCard = page
      .locator("[data-slot=card]")
      .filter({ hasText: /Сценарий:/ })
      .first();
    await firstCard.click();
    await expect(
      page.getByRole("button", { name: "Открыть workflow" })
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "К кампаниям" })).toBeVisible();
  });
});

test.describe("Block A3 — contextual chat placeholders", () => {
  // The composer is a contenteditable [role=textbox] that carries its hint on
  // `data-placeholder` (not the `placeholder` attribute), so getByPlaceholder no
  // longer matches — target the attribute directly.
  test("Артефакты section shows contextual placeholder", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: "Артефакты", exact: true }).click();

    await expect(
      page.locator('[data-placeholder*="Выберите шаг или задайте вопрос"]')
    ).toBeVisible();
  });

  test("Кампании section shows contextual placeholder", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: "Кампании", exact: true }).click();

    await expect(
      page.locator('[data-placeholder="Напишите, что вы хотите сделать"]')
    ).toBeVisible();
  });
});
