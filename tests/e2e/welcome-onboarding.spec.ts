import { test, expect, type Page } from "@playwright/test";
import { dismissIntroOverlay } from "./helpers/seed-intro";

async function applyPreset(page: Page, key: "empty" | "mid" | "full") {
  await page.keyboard.press("Control+Shift+KeyE");
  const label = key.charAt(0).toUpperCase() + key.slice(1);
  await page.getByRole("button", { name: new RegExp(`^${label}\\b`) }).click();
  await page.keyboard.press("Control+Shift+KeyE");
}

// This spec intentionally exercises the real first-run path: the IntroOverlay is
// dismissed through its own UI (Далее → … → «Понятно, начать») rather than seeded
// away, so we keep e2e coverage that a new user can get past it and reach the
// welcome onboarding chat.
async function openWelcome(page: Page) {
  await page.goto("/");
  await dismissIntroOverlay(page);
}

// Поведение welcome унифицировано: клик по чипсе/вопрос открывает правый
// drawer и пишет диалог туда (а не морфит сам экран). Чипса «Создать первый
// сигнал →» убрана — запуск флоу живёт на кнопках героя.
test.describe("Welcome onboarding chat (empty preset)", () => {
  test("wave 0 → 1 → 2 → 3 navigation writes answers into the drawer", async ({
    page,
  }) => {
    await openWelcome(page);
    await expect(
      page.getByRole("heading", { name: "Добро пожаловать" })
    ).toBeVisible();

    // Wave-0 chip lives under the collapsed bar; clicking opens the drawer.
    await page
      .getByRole("button", { name: "Что такое сигнал и кампания?" })
      .click();

    const drawer = page.getByTestId("chat-drawer");
    await expect(drawer).toBeVisible();

    // Wave-1 answer lands in the drawer; wave-2 chips render in the drawer.
    await expect(drawer.getByText("Сигнал — это момент, когда")).toBeVisible();
    await drawer
      .getByRole("button", { name: "Какие сценарии кампаний бывают?" })
      .click();

    // Wave-2 answer + the single wave-3 chip (terminal CTA removed).
    await expect(
      drawer.getByText("Платформа покрывает шесть типовых ситуаций")
    ).toBeVisible();
    await expect(
      drawer.getByRole("button", {
        name: "Как платформа узнаёт об активности моих клиентов?",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Создать первый сигнал →" })
    ).toHaveCount(0);
  });

  test("welcome chips open the drawer instead of redirecting to the signal flow", async ({
    page,
  }) => {
    await openWelcome(page);
    await page
      .getByRole("button", { name: "Откуда берутся мои данные?" })
      .click();

    const drawer = page.getByTestId("chat-drawer");
    await expect(drawer).toBeVisible();
    // Still on welcome — no navigation into the wizard.
    await expect(
      page.getByRole("heading", { name: "Добро пожаловать" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Выберите тип сигнала" })
    ).toHaveCount(0);

    // Deep chips never expose a signal-flow CTA.
    await drawer
      .getByRole("button", { name: "Как это соотносится с требованиями 152-ФЗ?" })
      .click();
    await expect(
      page.getByRole("button", { name: "Создать первый сигнал →" })
    ).toHaveCount(0);
  });

  test("wave-3 extra question is single-use and ends the thread", async ({
    page,
  }) => {
    await openWelcome(page);
    await page
      .getByRole("button", { name: "Что такое сигнал и кампания?" })
      .click();
    const drawer = page.getByTestId("chat-drawer");
    await drawer
      .getByRole("button", { name: "Какие сценарии кампаний бывают?" })
      .click();

    const extra = drawer.getByRole("button", {
      name: "Как платформа узнаёт об активности моих клиентов?",
    });
    await expect(extra).toBeVisible();
    await extra.click();

    // Answer shown; the extra chip is consumed and no chips remain.
    await expect(
      drawer.getByText("Источник сигналов — поведенческие модели")
    ).toBeVisible();
    await expect(
      drawer.getByRole("button", {
        name: "Как платформа узнаёт об активности моих клиентов?",
      })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Создать первый сигнал →" })
    ).toHaveCount(0);
  });

  test("history resets when user leaves welcome and returns", async ({
    page,
  }) => {
    await openWelcome(page);
    await page
      .getByRole("button", { name: "Что я могу сделать со своей базой?" })
      .click();
    const drawer = page.getByTestId("chat-drawer");
    await expect(
      drawer.getByText("База клиентов — это ваша точка")
    ).toBeVisible();

    // Leave to Сигналы, then back via the logo.
    await page.getByRole("button", { name: "Сигналы" }).click();
    await expect(
      page.getByRole("heading", { name: "Добро пожаловать" })
    ).toHaveCount(0);
    await page.getByRole("button", { name: "На главный экран" }).click();

    // Back on welcome — wave-0 chips again, prior answer cleared.
    await expect(
      page.getByRole("heading", { name: "Добро пожаловать" })
    ).toBeVisible();
    await expect(
      page.getByText("База клиентов — это ваша точка")
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Что такое сигнал и кампания?" })
    ).toBeVisible();
  });

  test("free-form submit opens the drawer with user + bot messages", async ({
    page,
  }) => {
    await openWelcome(page);
    const input = page.getByRole("textbox").first();
    await input.click();
    await input.fill("привет");
    await page.keyboard.press("Enter");

    const drawer = page.getByTestId("chat-drawer");
    await expect(drawer.getByText("привет", { exact: true })).toBeVisible();
    await expect(
      drawer.getByText("Пока умею отвечать только на подсказки")
    ).toBeVisible();
  });
});

test.describe("Welcome post-onboarding (full preset, campaign launched)", () => {
  test("post-campaign welcome shows the done caption and interface chips", async ({
    page,
  }) => {
    await openWelcome(page);
    await applyPreset(page, "full");

    // Full preset seeds active/completed campaigns → isCampaignDone === true.
    await expect(
      page.getByRole("heading", { name: "Добро пожаловать" })
    ).toBeVisible();
    await expect(page.getByText("Запустите ещё один сценарий")).toBeVisible();

    // Onboarding step cards are not rendered in the done state.
    await expect(page.getByText("Получение сигнала")).toHaveCount(0);

    // Post-onboarding chips visible.
    await expect(
      page.getByRole("button", { name: "Создать новый сигнал" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Создать новую кампанию" })
    ).toBeVisible();
  });

  test("'Создать новую кампанию' replies inside the drawer", async ({ page }) => {
    await openWelcome(page);
    await applyPreset(page, "full");

    await page.getByRole("button", { name: "Создать новую кампанию" }).click();

    const drawer = page.getByTestId("chat-drawer");
    await expect(
      drawer.getByText(
        "Для этого выберите существующий сигнал или создайте новый."
      )
    ).toBeVisible();
    // Chips remain available in the drawer.
    await expect(
      drawer.getByRole("button", { name: "Создать новую кампанию" })
    ).toBeVisible();
  });

  test("'Создать новый сигнал' starts the guided signal flow", async ({
    page,
  }) => {
    await openWelcome(page);
    await applyPreset(page, "full");

    await page.getByRole("button", { name: "Создать новый сигнал" }).click();

    // start_signal_flow входит в визард с первого шага (ссылка на сайт).
    await expect(
      page.getByRole("heading", { name: /С чего начнём/ })
    ).toBeVisible();
  });
});
