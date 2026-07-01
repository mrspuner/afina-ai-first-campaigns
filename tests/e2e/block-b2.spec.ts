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
// entered from there via «Открыть workflow».
async function openFirstCampaign(page: Page) {
  await page.getByRole("button", { name: "Кампании", exact: true }).click();
  // A draft opens the editable editor (node selection / control panel lives there).
  await page
    .locator("[data-slot=card]")
    .filter({ hasText: "Не запущена" })
    .first()
    .click();
  await page.getByRole("button", { name: "Открыть workflow" }).click();
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 5_000 });
}

async function openFirstActiveCampaign(page: Page) {
  await page.getByRole("button", { name: "Кампании", exact: true }).click();
  // Match the exact «Запущена» badge so drafts («Не запущена») are excluded.
  await page
    .locator("[data-slot=card]")
    .filter({ has: page.getByText("Запущена", { exact: true }) })
    .first()
    .click();
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

test.describe("Block B2 — NodeControlPanel (expanded node card)", () => {
  test("selecting a node opens a canvas-anchored control panel", async ({
    page,
  }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFirstCampaign(page);

    await page.locator("[data-node-type]").first().click();
    const panel = page.locator('[data-testid="node-control-panel"]');
    await expect(panel).toBeVisible();

    // The control panel IS the expanded node card on the canvas — it carries the
    // node's editable body, including a close control.
    await expect(
      panel.getByRole("button", { name: "Закрыть карточку ноды" })
    ).toBeVisible();

    // The old "panel docks to the PromptBar top edge" contract was removed: the
    // panel is anchored to the node on the canvas, well clear of the prompt bar
    // (a real gap, not a ≤40px dock).
    const panelBox = await panel.boundingBox();
    const promptBar = await promptBarLocator(page).boundingBox();
    expect(panelBox).not.toBeNull();
    expect(promptBar).not.toBeNull();
    if (panelBox && promptBar) {
      const gap = promptBar.y - (panelBox.y + panelBox.height);
      expect(gap).toBeGreaterThan(40);
    }
  });

  test("pane click closes the control panel", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFirstCampaign(page);

    await page.locator("[data-node-type]").first().click();
    await expect(
      page.locator('[data-testid="node-control-panel"]')
    ).toBeVisible();

    // Click an empty pane area to deselect. Compute a point in the fit-view
    // padding ABOVE the topmost node (at horizontal centre) so the click never
    // lands on a node.
    const point = await page.evaluate(() => {
      const pane = document
        .querySelector(".react-flow__pane")!
        .getBoundingClientRect();
      const nodes = Array.from(
        document.querySelectorAll("[data-node-type]")
      ).map((n) => n.getBoundingClientRect());
      const minTop = Math.min(...nodes.map((r) => r.top));
      return {
        x: pane.left + pane.width / 2,
        y: Math.max(pane.top + 8, (pane.top + minTop) / 2),
      };
    });
    await page.mouse.click(point.x, point.y);

    await expect(
      page.locator('[data-testid="node-control-panel"]')
    ).toBeHidden({ timeout: 1500 });
  });
});
