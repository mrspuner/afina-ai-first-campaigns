import { test, expect } from "@playwright/test";

// The IVR node's «Текст» field is a combo (scenario/voice live INLINE on the
// node, not in the templates library). It now carries an eye («Предпросмотр»)
// next to the field — clicking it opens the SAME TemplatePreviewDrawer used by
// sms/email/push, rendering the node's CURRENT call script via IvrRenderer.
//
// We seed a draft campaign with a single «ivr» channel; the derived graph puts
// one IVR comm node on the (editable) canvas with its template scenario.

const DRAFT = {
  id: "cmp_ivr_node01",
  name: "Черновик — IVR-нода",
  status: "draft",
  createdAt: "2026-06-20T09:00:00.000Z",
  sourceType: "new",
  channels: ["ivr"],
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

test.describe("IVR node preview — eye-icon on the node's «Текст» field", () => {
  test("clicking the IVR field eye opens the drawer with the node's call script", async ({
    page,
  }) => {
    // Select the IVR comm node → its control panel (expanded card) appears.
    await page.locator('[data-node-type="ivr"]').first().click();
    const panel = page.getByTestId("node-control-panel");
    await expect(panel).toBeVisible();

    // The eye lives ON the node next to the «Текст» combo (not inside a dropdown).
    await panel.getByRole("button", { name: "Предпросмотр" }).click();

    const drawer = page.getByTestId("template-preview-drawer");
    await expect(drawer).toBeVisible();
    // Channel-scoped header + the IvrRenderer «Скрипт звонка» panel.
    await expect(drawer).toContainText("Шаблон · Звонок");
    await expect(drawer).toContainText("Скрипт звонка");
    // The node's current scenario (template default) + its voice meta.
    await expect(drawer).toContainText("Персональное предложение");
    await expect(drawer).toContainText("Нейтральный");

    // Close affordance dismisses the drawer.
    await drawer.getByRole("button", { name: "Закрыть", exact: true }).click();
    await expect(page.getByTestId("template-preview-drawer")).toBeHidden();
  });
});
