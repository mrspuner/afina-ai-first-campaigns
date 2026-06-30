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

// Clicking a campaign card opens its detail screen; the workflow editor is
// entered from there via the clickable mini-preview ("Открыть workflow").
async function openFirstCampaign(page: Page) {
  await page.getByRole("button", { name: "Кампании", exact: true }).click();
  // A draft opens the editable editor (node control panel lives there).
  const card = page
    .locator("[data-slot=card]")
    .filter({ hasText: "Не запущена" })
    .first();
  await card.click();
  await page.getByRole("button", { name: "Открыть workflow" }).click();
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 5_000 });
}

async function openFirstActiveCampaign(page: Page) {
  await page.getByRole("button", { name: "Кампании", exact: true }).click();
  const card = page
    .locator("[data-slot=card]")
    .filter({ hasText: "Запущена" })
    .first();
  await card.click();
  await page.getByRole("button", { name: "Открыть workflow" }).click();
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 5_000 });
}

function promptBarLocator(page: Page) {
  // The composer input is now a contenteditable [role=textbox], not a <textarea>.
  return page
    .locator("form")
    .filter({ has: page.locator("[contenteditable]") })
    .first();
}

// The full motion-wrapped shell at the bottom (includes padding + background).
function promptBarShellLocator(page: Page) {
  return page.locator("div.fixed.left-\\[120px\\].right-0.z-30").first();
}

test.describe("Block B1 — PromptBar pinned + canvas overlay", () => {
  test("PromptBar is pinned near viewport bottom on workflow screen", async ({
    page,
  }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFirstCampaign(page);

    const viewport = page.viewportSize();
    if (!viewport) throw new Error("viewport missing");

    // Allow the motion bottom: animation (~0.55s) to settle.
    await page.waitForTimeout(700);

    const shell = await promptBarShellLocator(page).boundingBox();
    expect(shell).not.toBeNull();
    if (shell) {
      // Shell is now pinned ≈ 20px above the viewport bottom (frosted
      // floating panel). Allow ±8px variance around 20 for motion settle.
      const gap = viewport.height - (shell.y + shell.height);
      expect(gap).toBeGreaterThanOrEqual(12);
      expect(gap).toBeLessThanOrEqual(28);
    }
  });

  test("canvas occupies full workflow area (no inline stats panel)", async ({
    page,
  }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFirstActiveCampaign(page);

    await expect(page.getByText("Кампания запущена")).toHaveCount(0);
    const viewport = page.locator(".react-flow__viewport").first();
    await expect(viewport).toBeVisible();
  });
});

test.describe("Block B2 — NodeControlPanel slide-up", () => {
  test("panel attaches to PromptBar top edge when node is selected", async ({
    page,
  }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFirstCampaign(page);

    await page.locator("[data-node-type]").first().click();
    const panel = page.locator('[data-testid="node-control-panel"]');
    await expect(panel).toBeVisible();

    const panelBox = await panel.boundingBox();
    const promptBar = await promptBarLocator(page).boundingBox();

    expect(panelBox).not.toBeNull();
    expect(promptBar).not.toBeNull();
    if (panelBox && promptBar) {
      // bottom of panel ≈ top of promptbar (±10px tolerance)
      expect(
        Math.abs(panelBox.y + panelBox.height - promptBar.y)
      ).toBeLessThan(40);
      // same horizontal centre (±20px tolerance)
      expect(
        Math.abs(
          panelBox.x + panelBox.width / 2 - (promptBar.x + promptBar.width / 2)
        )
      ).toBeLessThan(20);
    }
  });

  test("panel slide-up animates on node deselect (pane click closes it)", async ({
    page,
  }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFirstCampaign(page);

    await page.locator("[data-node-type]").first().click();
    await expect(
      page.locator('[data-testid="node-control-panel"]')
    ).toBeVisible();

    await page
      .locator(".react-flow__pane")
      .click({ position: { x: 20, y: 20 } });
    await expect(
      page.locator('[data-testid="node-control-panel"]')
    ).toBeHidden({ timeout: 1500 });
  });
});
