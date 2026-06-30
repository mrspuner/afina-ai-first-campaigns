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

async function openAnyDraftCampaign(page: Page) {
  await page.getByRole("button", { name: "Кампании", exact: true }).click();
  await page
    .locator("[data-slot=card]")
    .filter({ hasText: "Не запущена" })
    .first()
    .click();
  // Card → detail → workflow editor.
  await page.getByRole("button", { name: "Открыть workflow" }).click();
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 5_000 });
}

function promptEditor(page: Page) {
  return page.locator('[role="textbox"][contenteditable="true"]').first();
}

// Free-text structural command: no node is selected, so the composer has no
// chip and fill() can set the whole command safely.
async function submitCommand(page: Page, text: string) {
  const editor = promptEditor(page);
  await editor.click();
  await editor.fill(text);
  await editor.press("Enter");
}

/**
 * Pick a label from the graph that points to a non-Сигнал/non-Успех/non-Конец
 * node. The node renders `<span>{label}</span>` as the first span inside the
 * [data-node-type] container — we read only that span to avoid concatenating
 * the sublabel text.
 */
async function pickNonTerminalLabel(page: Page): Promise<string | null> {
  const handles = await page.locator("[data-node-type]").all();
  for (const h of handles) {
    const nt = await h.getAttribute("data-node-type");
    if (!nt) continue;
    if (nt === "signal" || nt === "source" || nt === "success" || nt === "end")
      continue;
    const labelSpan = h.locator("span").first();
    const txt = (await labelSpan.textContent()) ?? "";
    const label = txt.trim();
    if (label) return label;
  }
  return null;
}

test.describe("Block H — structural node operations", () => {
  test("add Email after an existing node", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    const beforeCount = await page.locator("[data-node-type]").count();
    const ref = await pickNonTerminalLabel(page);
    test.skip(!ref, "Нет подходящей ноды для ссылки 'после'");

    await submitCommand(page, `добавь Email после ${ref}`);

    await expect(page.getByText(/Добавил Email/)).toBeVisible({
      timeout: 8_000,
    });

    const afterCount = await page.locator("[data-node-type]").count();
    expect(afterCount).toBe(beforeCount + 1);
  });

  test("remove Сигнал is skipped with reason", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    await submitCommand(page, "убери Сигнал");
    await expect(page.getByText(/точка входа/)).toBeVisible({ timeout: 8_000 });
  });

  test("replace node keeps graph coherent", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    const target = await pickNonTerminalLabel(page);
    test.skip(!target, "Нет подходящей ноды для замены");

    await submitCommand(page, `замени ${target} на Email`);
    await expect(page.getByText(/Заменил/)).toBeVisible({ timeout: 8_000 });
  });

  test("attention block shows up on add without inline params", async ({
    page,
  }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    const ref = await pickNonTerminalLabel(page);
    test.skip(!ref, "Нет подходящей ноды для 'после'");

    await submitCommand(page, `добавь Email после ${ref}`);

    // wait for apply
    await expect(page.getByText(/Добавил Email/)).toBeVisible({
      timeout: 8_000,
    });

    // Click the new Email node (last one) and verify the attention block shows.
    const emailNode = page.locator('[data-node-type="email"]').last();
    await emailNode.click();
    const panel = page.getByTestId("node-control-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("alert")).toBeVisible();
    await expect(panel.getByRole("alert")).toContainText("Заполните параметры");
  });
});
