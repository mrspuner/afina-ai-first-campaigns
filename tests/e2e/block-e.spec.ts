import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { dismissIntro } from "./helpers/seed-intro";
import { forceOfflineAi } from "./helpers/force-offline-ai";

test.beforeEach(async ({ page }) => {
  // Тесты этого файла ждут КОНКРЕТНЫЕ офлайн-реплики regex-пути («Готово,
  // обновил ноду»), но офлайн-путь до сих пор не пинили — на машине с
  // настроенным ключом (`.env.local`) они гонятся с асинхронной пробой
  // доступности реального оркестратора, и та иногда успевает резолвиться до
  // Enter. Тогда отвечает живой ИИ («Изменил задержку на 2 часа») — ответ
  // верный по существу, но не тот, что проверяет тест. Гонка предсуществующая
  // (см. force-offline-ai.ts); набор падающих тестов от прогона к прогону
  // менялся, а с утяжелением приложения проба стала выигрывать чаще.
  await forceOfflineAi(page);
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

// The prompt composer is a contenteditable [role=textbox]; a selected node's
// reference is a span[data-chip-id] chip inside it (label = node label, no «@»).
function promptEditor(page: Page) {
  return page.locator('[role="textbox"][contenteditable="true"]').first();
}

function promptChips(page: Page) {
  return promptEditor(page).locator("[data-chip-id]");
}

// Place the caret at the very end of the editor (after the chip + its trailing
// space) and type — this appends a command without clobbering the chip (fill()
// would wipe it).
async function appendToPrompt(page: Page, text: string) {
  await promptEditor(page).evaluate((el) => {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  });
  await page.keyboard.type(text);
}

// Click an empty pane area (deselect). Compute a point in the fit-view padding
// above the topmost node and at horizontal centre.
async function clickEmptyPane(page: Page) {
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
}

// Drives the wizard to the editor with a known channel set (so a specific
// channel node — and the comm-unit Wait node — are guaranteed to exist).
async function createCampaignViaWizard(page: Page, channel: "sms") {
  await page.goto("/");
  await page.keyboard.press("Control+Shift+KeyE");
  await page
    .getByRole("switch", { name: "Переключить статус анкеты" })
    .click();
  await page.keyboard.press("Control+Shift+KeyE");
  await page.getByRole("button", { name: "Создать кампанию" }).click();
  await page.getByRole("button", { name: "Спящий клиент" }).click();
  // Цель — keep the default «Сигналы + коммуникация» (path B → channels step).
  await expect(
    page.getByRole("heading", { name: /Что хотите получить/ })
  ).toBeVisible();
  await page.getByRole("button", { name: "Далее" }).last().click();
  await expect(
    page.getByRole("heading", { name: /Какие интересы и триггеры/ })
  ).toBeVisible();
  await page.getByRole("button", { name: "Продолжить" }).last().click();
  // Режим анализа — keep the default «Разовый».
  await expect(
    page.getByRole("heading", { name: /Разовый или потоковый/ })
  ).toBeVisible();
  await page.getByRole("button", { name: "Далее" }).last().click();
  await expect(
    page.getByRole("heading", { name: "Загрузите вашу базу" })
  ).toBeVisible();
  await page
    .locator('input[type="file"][accept*="csv"]')
    .first()
    .setInputFiles(path.resolve(__dirname, "fixtures/test-base.csv"));
  await expect(page.getByText("test-base.csv")).toBeVisible();
  await page.getByRole("button", { name: "Далее" }).last().click();
  await expect(
    page.getByRole("heading", { name: /Как будем общаться/ })
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("checkbox", { name: new RegExp(channel, "i") }).click();
  await page.getByRole("button", { name: "Далее" }).last().click();
  const budgetHeading = page.getByRole("heading", { name: /Проверьте кампанию/ });
  await expect(budgetHeading).toBeVisible();
  // Карточек «Рекомендуемая / Своя сумма» на шаге больше нет — сумма задаётся
  // на экране оплаты. Признак готовности шага теперь строка прогноза.
  await expect(page.getByText("Рекомендуемый бюджет")).toBeVisible();
  // Scope to the budget step's own StepContent root (heading → .mb-8 → root)
  // rather than a blind `.last()` — the app now has four «Создать кампанию»
  // buttons (welcome view, campaigns section, empty-state card, and this
  // step's forward CTA), so a global `.last()` is no longer safe.
  await budgetHeading
    .locator("xpath=../..")
    .getByRole("button", { name: "Создать кампанию" })
    .click();
  // Финал визарда приземляет в КАРТОЧКУ кампании, а не в редактор графа.
  // Мини-граф карточки рендерит те же ноды, но не кликается — за редактором
  // идём через «Открыть workflow» (aria-label мини-превью).
  // The «Создаём кампанию» waiting screen sits between the click and the card
  // (durationMs 4000 + a trailing 200ms pause = ~4200ms) — give it headroom.
  await expect(page.getByText("Сценарий кампании")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Открыть workflow" }).click();
  await expect(page.getByText("Сценарий кампании")).toHaveCount(0);
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 8_000 });
}

test.describe("Block E — Node control + AI cycle", () => {
  test("click node opens control panel and adds a node chip", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    const signalNode = page.locator('[data-node-type="signal"]').first();
    await signalNode.click();

    await expect(page.getByTestId("node-control-panel")).toBeVisible();
    // The composer now gets a node-reference CHIP (label = node label), not an
    // «@»-prefixed text tag.
    await expect(promptChips(page)).toHaveCount(1);
    await expect(promptChips(page)).toContainText("Сигнал");
  });

  test("submit prompt fires AI cycle and shows AI reply", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    const comms = page.locator(
      '[data-node-type="email"], [data-node-type="sms"], [data-node-type="push"], [data-node-type="ivr"]'
    );
    await comms.first().click();
    await expect(page.getByTestId("node-control-panel")).toBeVisible();
    await expect(promptChips(page)).toHaveCount(1);

    // Type a command after the chip, then submit.
    await appendToPrompt(page, "обнови контент");
    await page.keyboard.press("Enter");

    await expect(page.getByText(/Готово, обновил ноду/)).toBeVisible({
      timeout: 8_000,
    });
  });

  test("pane click closes the control panel", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    await page.locator('[data-node-type="signal"]').first().click();
    await expect(page.getByTestId("node-control-panel")).toBeVisible();

    await clickEmptyPane(page);
    await expect(page.getByTestId("node-control-panel")).toBeHidden();
  });

  test("A2 — pane click does NOT clear the composer (only deselects)", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    await page.locator('[data-node-type="signal"]').first().click();
    await expect(page.getByTestId("node-control-panel")).toBeVisible();
    await expect(promptChips(page)).toHaveCount(1);
    await appendToPrompt(page, "обнови");

    // Deselect via pane click.
    await clickEmptyPane(page);
    await expect(page.getByTestId("node-control-panel")).toBeHidden();

    // Composer is preserved on deselect: chip + typed text remain.
    await expect(promptChips(page)).toHaveCount(1);
    await expect(promptEditor(page)).toContainText("обнови");
  });

  test("A2 — switching selected node replaces the stale empty chip", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openAnyDraftCampaign(page);

    await page.locator('[data-node-type="signal"]').first().click();
    await expect(page.getByTestId("node-control-panel")).toBeVisible();
    await expect(promptChips(page)).toHaveCount(1);

    // Switch to another node WITHOUT typing — the stale empty chip is discarded
    // and replaced (the composer keeps exactly one active tag).
    const comms = page
      .locator(
        '[data-node-type="email"], [data-node-type="sms"], [data-node-type="push"], [data-node-type="ivr"], [data-node-type="split"], [data-node-type="wait"]'
      )
      .first();
    await comms.click();
    await expect(page.getByTestId("node-control-panel")).toBeVisible();
    await expect(promptChips(page)).toHaveCount(1);
  });

  test("G.4 — node-command edits the SMS content (params section marks it dirty)", async ({ page }) => {
    // Build a campaign with the SMS channel so the SMS node is guaranteed.
    await createCampaignViaWizard(page, "sms");

    const smsNode = page.locator('[data-node-type="sms"]').first();
    await smsNode.click();
    await expect(page.getByTestId("node-control-panel")).toBeVisible();
    await expect(promptChips(page)).toHaveCount(1);

    await appendToPrompt(page, "текст: новое сообщение");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Готово, обновил ноду/)).toBeVisible({
      timeout: 8_000,
    });

    // The SMS content is now managed via a template selector («Шаблон»,
    // paramKey "text"), so the raw text no longer renders as a «Текст» row. The
    // faithful current signal that the AI command edited the CONTENT param is
    // the "edited" marker (yellow dot, title «Параметр изменён») on the
    // «Шаблон» row specifically — scope to that row, not any dirty param.
    await page.locator('[data-node-type="sms"]').first().click();
    const panel = page.getByTestId("node-control-panel");
    await expect(panel).toBeVisible();
    const contentRow = panel.getByRole("button", {
      name: "Изменить поле «Шаблон»",
    });
    await expect(
      contentRow.locator('[title="Параметр изменён"]')
    ).toBeVisible({ timeout: 7_000 });
  });

  test("G.4 — node-command sets a 2-hour Wait delay", async ({ page }) => {
    // Any channel produces a comm unit that contains a Wait node.
    await createCampaignViaWizard(page, "sms");

    const waitNode = page.locator('[data-node-type="wait"]').first();
    await waitNode.click();
    await expect(page.getByTestId("node-control-panel")).toBeVisible();
    await expect(promptChips(page)).toHaveCount(1);

    await appendToPrompt(page, "задержка 2 часа");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Готово, обновил ноду/)).toBeVisible({
      timeout: 8_000,
    });

    await page.locator('[data-node-type="wait"]').first().click();
    await expect(page.getByTestId("node-control-panel")).toContainText("2 ч", {
      timeout: 7_000,
    });
  });
});
