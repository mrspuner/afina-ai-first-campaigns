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
  const draft = page
    .locator("[data-slot=card]")
    .filter({ hasText: "Не запущена" })
    .first();
  await draft.click();
  // Clicking a campaign card opens its detail screen; the workflow editor is
  // entered from there via the clickable mini-preview ("Открыть workflow").
  await page.getByRole("button", { name: "Открыть workflow" }).click();
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 5_000 });
}

test.describe("Block E — Node control + AI cycle", () => {
  test("click node opens control panel and injects @tag", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    const signalNode = page.locator('[data-node-type="signal"]').first();
    await signalNode.click();

    await expect(page.getByTestId("node-control-panel")).toBeVisible();
    // textarea автоматически префиксуется @Сигнал
    const textarea = page.getByRole("textbox").first();
    await expect(textarea).toHaveValue(/^@/);
  });

  test("submit prompt fires AI cycle and shows AI reply", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    // выбираем первый коммуникационный канал из текущего шаблона
    const comms = page.locator(
      '[data-node-type="email"], [data-node-type="sms"], [data-node-type="push"], [data-node-type="ivr"]'
    );
    await comms.first().click();
    await expect(page.getByTestId("node-control-panel")).toBeVisible();

    const textarea = page.getByRole("textbox").first();
    // Wait for auto-inserted @tag then append instruction (preserve the real label).
    await expect(textarea).toHaveValue(/^@/);
    const tagValue = await textarea.inputValue();
    await textarea.fill(`${tagValue}обнови контент`);
    await textarea.press("Enter");

    await expect(page.getByText(/Готово, обновил ноду/)).toBeVisible({ timeout: 5_000 });
  });

  test("pane click closes the control panel", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    await page.locator('[data-node-type="signal"]').first().click();
    await expect(page.getByTestId("node-control-panel")).toBeVisible();

    // клик по заднику канваса (ReactFlow viewport)
    await page.locator(".react-flow__pane").click({ position: { x: 20, y: 20 } });
    await expect(page.getByTestId("node-control-panel")).toBeHidden();
  });

  test("A2 — pane click does NOT clear textarea (only deselects)", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    await page.locator('[data-node-type="signal"]').first().click();
    await expect(page.getByTestId("node-control-panel")).toBeVisible();

    const textarea = page.getByRole("textbox").first();
    // Wait for the textarea to be populated with the @tag (auto-retry).
    await expect(textarea).toHaveValue(/^@/);
    const before = await textarea.inputValue();

    // deselect
    await page.locator(".react-flow__pane").click({ position: { x: 20, y: 20 } });
    await expect(page.getByTestId("node-control-panel")).toBeHidden();

    // textarea value preserved (не очищается на deselect).
    await expect(textarea).toHaveValue(before);
  });

  test("A2 — switching selected node strips stale empty @tag", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    const signal = page.locator('[data-node-type="signal"]').first();
    await signal.click();
    await expect(page.getByTestId("node-control-panel")).toBeVisible();

    const textarea = page.getByRole("textbox").first();
    // Wait for first @tag to appear.
    await expect(textarea).toHaveValue(/^@\S+\s*$/);

    // Select another node — первый пустой тег должен быть замещён новым.
    const comms = page
      .locator(
        '[data-node-type="email"], [data-node-type="sms"], [data-node-type="push"], [data-node-type="ivr"], [data-node-type="split"], [data-node-type="wait"]'
      )
      .first();
    await comms.click();
    await expect(page.getByTestId("node-control-panel")).toBeVisible();

    // After switching, textarea should contain exactly one @tag (stale one stripped).
    await expect(textarea).toHaveValue(/^@\S+\s*$/);
    const secondValue = await textarea.inputValue();
    const atCount = (secondValue.match(/@/g) ?? []).length;
    expect(atCount).toBe(1);
  });

  test("G.4 — node-command: текст СМС обновляется в params-секции", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    const smsNode = page.locator('[data-node-type="sms"]').first();
    if ((await smsNode.count()) === 0) {
      test.skip(true, "SMS-нода отсутствует в первой кампании");
    }
    await smsNode.click();

    const panel = page.getByTestId("node-control-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Текст", { exact: true }).first()).toBeVisible();

    const textarea = page.getByRole("textbox").first();
    await textarea.fill("@СМС текст: новое сообщение");
    await textarea.press("Enter");

    // Submit clears selection → panel closes. Wait for AI-cycle and re-open.
    await expect(panel).toBeHidden({ timeout: 7_000 });
    await page.waitForTimeout(4500);
    await smsNode.click();
    await expect(panel).toContainText("новое сообщение", { timeout: 7_000 });
  });

  test("G.4 — node-command: задержка 2 часа обновляет Wait-ноду", async ({ page }) => {
    await page.goto("/");
    // full preset — больше драфтов, высокая вероятность найти шаблон с Wait.
    await applyPreset(page, "full");

    // Открываем Кампании и ищем драфт с Wait-нодой.
    await page.getByRole("button", { name: "Кампании", exact: true }).click();
    const drafts = page
      .locator("[data-slot=card]")
      .filter({ hasText: "Не запущено" });
    const draftCount = await drafts.count();
    let opened = false;
    for (let i = 0; i < draftCount; i++) {
      await drafts.nth(i).click();
      await expect(page.locator(".react-flow")).toBeVisible({ timeout: 5_000 });
      const waitNode = page.locator('[data-node-type="wait"]').first();
      if ((await waitNode.count()) > 0) {
        opened = true;
        break;
      }
      // Close workflow: click Кампании again
      await page.getByRole("button", { name: "Кампании", exact: true }).click();
    }
    if (!opened) {
      test.skip(true, "Ни в одном draft нет Wait-ноды");
    }

    const waitNode = page.locator('[data-node-type="wait"]').first();
    await waitNode.click();
    const panel = page.getByTestId("node-control-panel");
    await expect(panel).toBeVisible();

    const textarea = page.getByRole("textbox").first();
    await textarea.fill("@Задержка задержка 2 часа");
    await textarea.press("Enter");

    // Submit clears selection → panel closes. Wait and re-open.
    await expect(panel).toBeHidden({ timeout: 7_000 });
    await page.waitForTimeout(4500);
    await waitNode.click();
    await expect(panel).toContainText("2 ч", { timeout: 7_000 });
  });
});
