import { test, expect, type Page, type Locator } from "@playwright/test";
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

// Onboarding chips are now suggestion-bar items (`chat-submit`): clicking one
// inserts its label into the composer; pressing Enter submits it (opens the
// drawer + writes the answer). So a chip pick is click + Enter.
async function pickChip(page: Page, scope: Locator, name: string) {
  await scope.getByRole("button", { name }).click();
  await page.keyboard.press("Enter");
}

// Поведение welcome: клик по чипсе открывает правый drawer и пишет диалог туда
// (а не морфит сам экран). Чипса «Создать первый сигнал →» убрана — запуск флоу
// живёт на кнопках героя / post-onboarding чипсах.
test.describe("Welcome onboarding chat (empty preset)", () => {
  test("wave 0 → 1 → 2 → 3 navigation writes answers into the drawer", async ({
    page,
  }) => {
    await openWelcome(page);
    await expect(
      page.getByRole("heading", { name: "Добро пожаловать" })
    ).toBeVisible();

    // Wave-0 chip lives in the bottom suggestion bar; submitting opens the drawer.
    await pickChip(page, page, "Что такое сигнал и кампания?");

    const drawer = page.getByTestId("chat-drawer");
    await expect(drawer).toBeVisible();

    // Wave-1 answer lands in the drawer; wave-2 chips render in the drawer.
    await expect(drawer.getByText("Сигнал — это момент, когда")).toBeVisible();
    await pickChip(page, drawer, "Какие сценарии кампаний бывают?");

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
    await pickChip(page, page, "Откуда берутся мои данные?");

    const drawer = page.getByTestId("chat-drawer");
    await expect(drawer).toBeVisible();
    // Still on welcome — no navigation into the wizard.
    await expect(
      page.getByRole("heading", { name: "Добро пожаловать" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Выберите сценарий/ })
    ).toHaveCount(0);

    // Deep chips never expose a signal-flow CTA.
    await pickChip(page, drawer, "Как это соотносится с требованиями 152-ФЗ?");
    await expect(
      page.getByRole("button", { name: "Создать первый сигнал →" })
    ).toHaveCount(0);
  });

  test("wave-3 extra question is single-use and ends the thread", async ({
    page,
  }) => {
    await openWelcome(page);
    await pickChip(page, page, "Что такое сигнал и кампания?");
    const drawer = page.getByTestId("chat-drawer");
    await pickChip(page, drawer, "Какие сценарии кампаний бывают?");

    await expect(
      drawer.getByRole("button", {
        name: "Как платформа узнаёт об активности моих клиентов?",
      })
    ).toBeVisible();
    await pickChip(page, drawer, "Как платформа узнаёт об активности моих клиентов?");

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
    await pickChip(page, page, "Что я могу сделать со своей базой?");
    const drawer = page.getByTestId("chat-drawer");
    await expect(
      drawer.getByText("База клиентов — это ваша точка")
    ).toBeVisible();

    // Leave to Кампании («Сигналы» section was removed), then back via the logo.
    await page.getByRole("button", { name: "Кампании", exact: true }).click();
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
    const input = page.locator('[role="textbox"][contenteditable="true"]').first();
    await input.click();
    await input.fill("привет");
    await page.keyboard.press("Enter");

    const drawer = page.getByTestId("chat-drawer");
    await expect(drawer.getByText("привет", { exact: true })).toBeVisible();
    // Free text isn't a recognised prompt → warm fallback that nudges to the
    // suggestion chips (all variants mention «подсказк…»).
    await expect(drawer.getByText(/подсказ/)).toBeVisible();
  });
});

test.describe("Welcome post-onboarding (full preset, campaign launched)", () => {
  test("post-campaign welcome shows the done-state hero and interface chips", async ({
    page,
  }) => {
    await openWelcome(page);
    await applyPreset(page, "full");

    // Full preset seeds active/completed campaigns → isCampaignDone === true.
    await expect(
      page.getByRole("heading", { name: "Добро пожаловать" })
    ).toBeVisible();
    // removed: «Запустите ещё один сценарий» done-caption assertion — that
    // caption was removed in the redesign (no replacement).
    // removed: «Получение сигнала» absence assertion — onboarding step cards
    // (Сигналы / Коммуникации / Статистика) are now always rendered, so the
    // old "step cards hidden in done state" premise no longer holds.

    // Done-state hero CTA + post-onboarding chips.
    await expect(
      page.getByRole("button", { name: "Создать кампанию" })
    ).toBeVisible();
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

    await pickChip(page, page, "Создать новую кампанию");

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

  test("'Создать новый сигнал' starts the guided creation flow", async ({
    page,
  }) => {
    await openWelcome(page);
    await applyPreset(page, "full");

    await pickChip(page, page, "Создать новый сигнал");

    // start_campaign_flow enters creation. With the full preset the user already
    // has campaigns, so the survey gate is skipped and the wizard opens directly
    // on its first step.
    await expect(
      page.getByRole("heading", { name: /Выберите сценарий/ })
    ).toBeVisible();
  });
});
