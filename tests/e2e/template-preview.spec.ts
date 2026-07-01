import { test, expect, type Page } from "@playwright/test";

// Seed a draft campaign whose workflow carries sms + email + push comm nodes,
// then land directly on its (editable) workflow canvas. The graph is derived
// from the campaign's channels, so all three template-bearing nodes exist.
const DRAFT = {
  id: "cmp_preview01",
  name: "Черновик — предпросмотр",
  status: "draft",
  createdAt: "2026-06-20T09:00:00.000Z",
  sourceType: "new",
  channels: ["sms", "email", "push"],
  interests: ["Кредитование"],
  budget: 30_000,
  phase: "communicating",
  scenario: { id: "base-registration", name: "Регистрация" },
};

const SEED = {
  surveyStatus: "completed",
  introSeen: true,
  balance: 100_000,
  campaigns: [DRAFT],
  view: {
    kind: "workflow",
    campaign: { id: DRAFT.id, name: DRAFT.name },
    launched: false,
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((seed) => {
    (window as unknown as { __AFINA_SEED__?: unknown }).__AFINA_SEED__ = seed;
  }, SEED);
  await page.goto("/");
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
});

/**
 * Select the channel node, open its «Шаблон» dropdown, and click the eye
 * («Предпросмотр») on the option whose name matches `optionText`. Returns the
 * opened preview drawer locator.
 */
async function openPreview(page: Page, nodeType: string, optionText: RegExp) {
  await page.locator(`[data-node-type="${nodeType}"]`).first().click();
  const panel = page.getByTestId("node-control-panel");
  await expect(panel).toBeVisible();
  await panel
    .getByRole("button", { name: "Изменить поле «Шаблон»" })
    .click();
  // The eye lives inside the matching option row and does NOT select/close.
  const option = page.getByRole("option", { name: optionText });
  await option.getByRole("button", { name: "Предпросмотр" }).click();
  const drawer = page.getByTestId("template-preview-drawer");
  await expect(drawer).toBeVisible();
  return drawer;
}

test.describe("Template preview drawer — eye-icon opens the selected message", () => {
  test("SMS node → eye opens the styled SMS preview with the seeded text", async ({
    page,
  }) => {
    const drawer = await openPreview(page, "sms", /SMS — напоминание/);
    await expect(drawer).toContainText("Шаблон · SMS");
    await expect(drawer).toContainText(
      "Ваше предложение ждёт. Подробности на сайте.",
    );
    await expect(drawer).toContainText("AFINA");
    // Close affordance works — the drawer dismisses.
    await drawer.getByRole("button", { name: "Закрыть", exact: true }).click();
    await expect(page.getByTestId("template-preview-drawer")).toBeHidden();
  });

  test("Push node → eye opens the styled Push preview with the seeded title/body", async ({
    page,
  }) => {
    const drawer = await openPreview(page, "push", /Push — возвращение/);
    await expect(drawer).toContainText("Шаблон · Push");
    await expect(drawer).toContainText("Давно вас не видели");
    await expect(drawer).toContainText("Загляните — у нас есть кое-что для вас.");
  });

  test("Email node → eye opens the styled Email preview with the seeded subject", async ({
    page,
  }) => {
    const drawer = await openPreview(page, "email", /Приветственное/);
    await expect(drawer).toContainText("Шаблон · Email");
    await expect(drawer).toContainText("Добро пожаловать! Начнём?");
  });
});
