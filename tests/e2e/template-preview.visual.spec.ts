import { test, expect, type Page } from "@playwright/test";

// Visual regression for the new styled SMS + Push template previews. We seed a
// draft workflow (sms/email/push comm nodes), open the preview via the node's
// eye-icon, and snapshot ONLY the drawer element — the canvas behind it is
// irrelevant and non-deterministic, so it is never part of the shot. All
// timestamps inside the previews are hard-coded (сейчас / 12:30), so no clock
// dependency; the fixed clock + reduced motion mirror the screens harness.

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

async function openDrawer(page: Page, nodeType: string, optionText: RegExp) {
  await page.locator(`[data-node-type="${nodeType}"]`).first().click();
  const panel = page.getByTestId("node-control-panel");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Изменить поле «Шаблон»" }).click();
  await page
    .getByRole("option", { name: optionText })
    .getByRole("button", { name: "Предпросмотр" })
    .click();
  const drawer = page.getByTestId("template-preview-drawer");
  await expect(drawer).toBeVisible();
  return drawer;
}

test.describe("@visual template preview drawers", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-06-30T12:00:00Z"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((seed) => {
      (window as unknown as { __AFINA_SEED__?: unknown }).__AFINA_SEED__ = seed;
    }, SEED);
    await page.goto("/");
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
  });

  test("visual: SMS preview drawer", async ({ page }) => {
    const drawer = await openDrawer(page, "sms", /SMS — напоминание/);
    await expect(drawer).toHaveScreenshot("template-preview-sms.png");
  });

  test("visual: Push preview drawer", async ({ page }) => {
    const drawer = await openDrawer(page, "push", /Push — возвращение/);
    await expect(drawer).toHaveScreenshot("template-preview-push.png");
  });
});

// This visual covers the library-template entry point (Артефакты → Шаблоны card
// «Предпросмотр»). The IVR node's field also has its own eye now, but the drawer
// it opens renders the same IvrRenderer, so no extra snapshot is needed. The
// script text is static, so no clock dep.
const IVR_SCRIPT = [
  "Здравствуйте! Меня зовут Анна, я звоню из компании «Афина».",
  "",
  "Вы недавно интересовались ипотечными программами на нашем сайте.",
  "У нас появилось персональное предложение со ставкой от 5,9%.",
  "",
  "Если вам удобно, я расскажу подробности прямо сейчас — это займёт пару минут.",
].join("\n");

const IVR_SEED = {
  surveyStatus: "completed",
  introSeen: true,
  balance: 100_000,
  templates: [
    {
      id: "tpl_ivr_call",
      channel: "ivr",
      name: "Звонок — ипотека",
      content: { kind: "ivr", scenario: IVR_SCRIPT, voiceType: "female" },
      usedInCampaigns: 0,
    },
  ],
  view: { kind: "section", name: "Артефакты" },
};

test.describe("@visual template preview drawer — IVR", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-06-30T12:00:00Z"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((seed) => {
      (window as unknown as { __AFINA_SEED__?: unknown }).__AFINA_SEED__ = seed;
    }, IVR_SEED);
    await page.goto("/");
  });

  test("visual: IVR preview drawer (full script)", async ({ page }) => {
    await page.getByRole("tab", { name: "Шаблоны" }).click();
    await page.getByRole("button", { name: "Предпросмотр" }).click();
    const drawer = page.getByTestId("template-preview-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveScreenshot("template-preview-ivr.png");
  });
});
