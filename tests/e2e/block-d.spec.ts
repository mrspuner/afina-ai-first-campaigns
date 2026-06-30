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

async function createCampaignForSignal(page: Page, signalType: string) {
  await page.getByRole("button", { name: "Сигналы", exact: true }).click();
  const card = page
    .locator("[data-slot=card]")
    .filter({ hasText: new RegExp(signalType) })
    .first();
  await card.getByRole("button", { name: "Создать кампанию" }).click();
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 5_000 });
}

test.describe("Block D — Workflow templates", () => {
  test("Апсейл template shows split with multiple channels and success", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "full");
    await createCampaignForSignal(page, "Апсейл");

    await expect(page.locator('[data-node-type="split"]')).toBeVisible();
    await expect(page.locator('[data-node-type="storefront"]')).toBeVisible();
    await expect(page.locator('[data-node-type="email"]')).toBeVisible();
    await expect(page.locator('[data-node-type="sms"]')).toBeVisible();
    await expect(page.locator('[data-node-type="success"]')).toBeVisible();
  });

  test("Удержание template shows IVR channel", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "full");
    await createCampaignForSignal(page, "Удержание");

    await expect(page.locator('[data-node-type="ivr"]')).toBeVisible();
    await expect(page.locator('[data-node-type="success"]')).toBeVisible();
  });

  test("Регистрация template shows wait node between email and push", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "full");
    await createCampaignForSignal(page, "Регистрация");

    await expect(page.locator('[data-node-type="email"]')).toBeVisible();
    await expect(page.locator('[data-node-type="wait"]')).toBeVisible();
    await expect(page.locator('[data-node-type="push"]')).toBeVisible();
  });

  test("Edge labels render with background plates", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "full");
    await createCampaignForSignal(page, "Первая сделка");

    // YES/NO labels on the condition edges should render with bg rects
    await expect(page.locator(".react-flow__edge-textbg").first()).toBeVisible();
  });

  test("Canvas pans on left mouse button drag of empty pane", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "full");
    await createCampaignForSignal(page, "Регистрация");

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
