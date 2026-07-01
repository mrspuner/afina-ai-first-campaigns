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

const CHANNEL_LABEL: Record<string, RegExp> = {
  sms: /SMS/,
  email: /Email/,
  push: /Push/,
  ivr: /Звонок/,
};

/**
 * Drives the guided-campaign wizard to completion and lands in the workflow
 * editor. Post-redesign there is no per-signal «Создать кампанию»: a campaign's
 * workflow is built by createTemplate(signalType, sourceType, channels), so the
 * rendered node types depend on the CHANNELS the user picks here. We therefore
 * pick the scenario AND the channels to assert a template's node composition.
 *
 * Each wizard step's body is typed in by StepContent before its footer renders,
 * so we wait for a step-specific control before clicking «Далее».
 */
async function createCampaignViaWizard(
  page: Page,
  scenarioCardName: string,
  channels: Array<"sms" | "email" | "push" | "ivr">,
) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Добро пожаловать" })
  ).toBeVisible();

  // Survey completed (skips the gate + surfaces «Создать кампанию»).
  await page.keyboard.press("Control+Shift+KeyE");
  await page
    .getByRole("switch", { name: "Переключить статус анкеты" })
    .click();
  await page.keyboard.press("Control+Shift+KeyE");

  await page.getByRole("button", { name: "Создать кампанию" }).click();

  // Scenario (auto-advances on click).
  await page.getByRole("button", { name: scenarioCardName }).click();

  // Цель — keep the default «Сигналы + коммуникация» (path B → channels step).
  await expect(
    page.getByRole("heading", { name: /Что хотите получить/ })
  ).toBeVisible();
  await page.getByRole("button", { name: "Далее" }).last().click();

  // Interests — pre-filled, continue.
  await expect(
    page.getByRole("heading", { name: /Какие интересы и триггеры/ })
  ).toBeVisible();
  await page.getByRole("button", { name: "Продолжить" }).last().click();

  // Режим анализа — keep the default «Разовый».
  await expect(
    page.getByRole("heading", { name: /Разовый или потоковый/ })
  ).toBeVisible();
  await page.getByRole("button", { name: "Далее" }).last().click();

  // File — upload, continue (waits out hashing).
  await expect(
    page.getByRole("heading", { name: "Загрузите вашу базу" })
  ).toBeVisible();
  await page
    .locator('input[type="file"][accept*="csv"]')
    .first()
    .setInputFiles(path.resolve(__dirname, "fixtures/test-base.csv"));
  await expect(page.getByText("test-base.csv")).toBeVisible();
  await page.getByRole("button", { name: "Далее" }).last().click();

  // Channels — select the requested set, continue.
  await expect(
    page.getByRole("heading", { name: /Как будем общаться/ })
  ).toBeVisible({ timeout: 15_000 });
  for (const ch of channels) {
    await page.getByRole("checkbox", { name: CHANNEL_LABEL[ch] }).click();
  }
  await page.getByRole("button", { name: "Далее" }).last().click();

  // Budget — recommended, continue → workflow editor. Wait for the body to
  // render so «Далее» is the budget step's button (not a stale earlier one).
  await expect(
    page.getByRole("heading", { name: /Прогноз бюджета/ })
  ).toBeVisible();
  await expect(page.getByText("Рекомендуемая")).toBeVisible();
  await page.getByRole("button", { name: "Далее" }).last().click();

  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 8_000 });
}

/** Opens the first preset campaign's workflow editor (card → detail → workflow). */
async function openPresetCampaignWorkflow(page: Page) {
  await page.goto("/");
  await applyPreset(page, "mid");
  await page.getByRole("button", { name: "Кампании", exact: true }).click();
  await page.locator("[data-slot=card]").filter({ hasText: /Сценарий:/ }).first().click();
  await page.getByRole("button", { name: "Открыть workflow" }).click();
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 5_000 });
}

test.describe("Block D — Workflow templates", () => {
  // Апсейл is a segmented scenario → split + per-segment comm units. With
  // email+sms channels selected, both channel nodes appear, plus the success
  // node. (The former storefront node was removed by design — commit 4483ac6.)
  test("Апсейл template shows split with multiple channels and success", async ({ page }) => {
    await createCampaignViaWizard(page, "Новая категория", ["email", "sms"]);

    await expect(page.locator('[data-node-type="split"]').first()).toBeVisible();
    await expect(page.locator('[data-node-type="email"]').first()).toBeVisible();
    await expect(page.locator('[data-node-type="sms"]').first()).toBeVisible();
    await expect(page.locator('[data-node-type="success"]').first()).toBeVisible();
    // removed: storefront node assertion — storefront/landing nodes were
    // removed from the app entirely (commit 4483ac6), no replacement.
  });

  test("Удержание template shows IVR channel", async ({ page }) => {
    await createCampaignViaWizard(page, "Лояльность под угрозой", ["ivr"]);

    await expect(page.locator('[data-node-type="ivr"]').first()).toBeVisible();
    await expect(page.locator('[data-node-type="success"]').first()).toBeVisible();
  });

  test("Регистрация template shows wait node alongside email and push", async ({ page }) => {
    await createCampaignViaWizard(page, "Брошенная корзина", ["email", "push"]);

    await expect(page.locator('[data-node-type="email"]').first()).toBeVisible();
    await expect(page.locator('[data-node-type="wait"]').first()).toBeVisible();
    await expect(page.locator('[data-node-type="push"]').first()).toBeVisible();
  });

  test("Edge labels render with background plates", async ({ page }) => {
    // Any template's condition/segment edges carry labels (YES/NO, segment
    // names) rendered with background rects. A preset campaign's workflow is
    // enough to exercise this.
    await openPresetCampaignWorkflow(page);
    await expect(page.locator(".react-flow__edge-textbg").first()).toBeVisible();
  });

  test("Canvas pans on left mouse button drag of empty pane", async ({ page }) => {
    await openPresetCampaignWorkflow(page);

    const viewport = page.locator(".react-flow__viewport");
    await expect(viewport).toBeVisible();

    const initialTransform = await viewport.evaluate(
      (el) => (el as HTMLElement).style.transform,
    );

    const pane = page.locator(".react-flow__pane");
    const box = await pane.boundingBox();
    if (!box) throw new Error("react-flow pane has no bounding box");

    // Drag from an empty area near the top-left corner of the pane
    const startX = box.x + 40;
    const startY = box.y + 40;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 200, startY + 80, { steps: 10 });
    await page.mouse.up();

    // Allow ReactFlow to commit the transform update
    await page.waitForTimeout(100);

    const nextTransform = await viewport.evaluate(
      (el) => (el as HTMLElement).style.transform,
    );
    expect(nextTransform).not.toBe(initialTransform);
  });
});
