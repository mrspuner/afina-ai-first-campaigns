import { test, expect } from "@playwright/test";

// IVR templates carry the actual CALL SCRIPT in `scenario` — it can be long and
// multi-paragraph. The preview drawer must show the WHOLE script (no clipping).
// The IVR node's field is a combo (no eye), so the eye-icon entry point for IVR
// is the Артефакты → Шаблоны template card's «Предпросмотр». We seed a single
// ivr template with a long script and open its preview from there.

const IVR_SCRIPT = [
  "Здравствуйте! Меня зовут Анна, я звоню из компании «Афина».",
  "",
  "Вы недавно интересовались ипотечными программами на нашем сайте.",
  "У нас появилось персональное предложение со ставкой от 5,9%.",
  "",
  "Если вам удобно, я расскажу подробности прямо сейчас — это займёт пару минут.",
].join("\n");

const IVR_TEMPLATE = {
  id: "tpl_ivr_call",
  channel: "ivr",
  name: "Звонок — ипотека",
  content: { kind: "ivr", scenario: IVR_SCRIPT, voiceType: "female" },
  usedInCampaigns: 0,
};

const SEED = {
  surveyStatus: "completed",
  introSeen: true,
  balance: 100_000,
  templates: [IVR_TEMPLATE],
  view: { kind: "section", name: "Артефакты" },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((seed) => {
    (window as unknown as { __AFINA_SEED__?: unknown }).__AFINA_SEED__ = seed;
  }, SEED);
  await page.goto("/");
});

test.describe("IVR template preview — eye-icon shows the full call script", () => {
  test("Шаблоны card → eye opens the drawer with the whole scenario text", async ({
    page,
  }) => {
    // Артефакты → Шаблоны tab lists the seeded ivr template.
    await page.getByRole("tab", { name: "Шаблоны" }).click();
    // The card's «Предпросмотр» eye opens the read-only preview drawer.
    await page.getByRole("button", { name: "Предпросмотр" }).click();

    const drawer = page.getByTestId("template-preview-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Шаблон · Звонок");

    // The FULL script is visible — the opening line AND the trailing line, plus
    // a middle line, prove nothing between is clipped/truncated.
    await expect(drawer).toContainText("Меня зовут Анна");
    await expect(drawer).toContainText("персональное предложение со ставкой от 5,9%");
    await expect(drawer).toContainText("это займёт пару минут");

    // Voice meta label is shown.
    await expect(drawer).toContainText("Женский");
  });
});
