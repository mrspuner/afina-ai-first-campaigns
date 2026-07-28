import { test, expect } from "@playwright/test";

// Fix: the IVR node's field used to be «Текст», a free-form combo (scenario/
// voice lived INLINE on the node, with no library templates to match against —
// its own eye previewed the node's raw current text via a synthetic wrapper,
// since there was nothing to look up in the library). IVR now has real library
// templates and the SAME «Шаблон» select control as sms/email/push — its eye
// resolves a real template id and opens the SAME TemplatePreviewDrawer,
// rendering the selected script via IvrRenderer.
//
// We seed a draft campaign with a single «ivr» channel; the derived graph puts
// one IVR comm node on the (editable) canvas, seeded to match the library's
// «Звонок — приветствие» template.

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

test.describe("IVR node preview — eye-icon on the node's «Шаблон» field", () => {
  test("clicking the IVR field eye opens the drawer with the node's call script", async ({
    page,
  }) => {
    // Select the IVR comm node → its control panel (expanded card) appears.
    await page.locator('[data-node-type="ivr"]').first().click();
    const panel = page.getByTestId("node-control-panel");
    await expect(panel).toBeVisible();

    // The eye lives ON the node's «Шаблон» select, before the chevron.
    await panel.getByRole("button", { name: "Предпросмотр" }).click();

    const drawer = page.getByTestId("template-preview-drawer");
    await expect(drawer).toBeVisible();
    // Channel-scoped header + the IvrRenderer «Скрипт звонка» panel.
    await expect(drawer).toContainText("Шаблон · Звонок");
    await expect(drawer).toContainText("Скрипт звонка");
    // The node's current scenario (seeded to match the library's «Звонок —
    // приветствие» template) + its voice meta.
    await expect(drawer).toContainText(
      "Приветствие → проверка интереса → перевод на оператора",
    );
    await expect(drawer).toContainText("Нейтральный");

    // Close affordance dismisses the drawer.
    await drawer.getByRole("button", { name: "Закрыть", exact: true }).click();
    await expect(page.getByTestId("template-preview-drawer")).toBeHidden();
  });
});
