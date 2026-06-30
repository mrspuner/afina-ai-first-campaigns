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

// The launch flyout was rebuilt as the «Последнее» panel: a recent-campaigns
// finder opened from the sidebar «Последнее» button. It no longer lists
// templates or signals or offers a campaign-creation heading — it surfaces and
// searches recent campaigns, and clicking one opens its detail screen.
async function openFlyout(page: Page) {
  await page.getByRole("button", { name: "Последнее", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Последнее" })).toBeVisible();
}

function flyout(page: Page) {
  return page.getByRole("dialog", { name: "Последнее" });
}

function searchBox(page: Page) {
  return flyout(page).getByRole("textbox", { name: "Поиск по кампаниям" });
}

function campaignRows(page: Page) {
  return flyout(page).getByRole("button").filter({ hasText: "Кампания" });
}

test.describe("Block F — Последнее (recent campaigns) panel", () => {
  test("empty preset shows search and the empty hint", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "empty");
    await openFlyout(page);

    await expect(searchBox(page)).toBeVisible();
    await expect(page.getByText("Здесь появятся ваши кампании.")).toBeVisible();
    // removed: templates list / «Новый сигнал» / no-signals hint — the flyout no
    // longer creates campaigns from templates or signals (no replacement here).
  });

  test("mid preset lists recent campaigns; click opens the detail screen", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFlyout(page);

    await expect(campaignRows(page).first()).toBeVisible();
    await campaignRows(page).first().click();

    // Clicking a row opens the campaign detail screen (not the workflow editor).
    await expect(
      page.getByRole("button", { name: "Открыть workflow" })
    ).toBeVisible({ timeout: 5_000 });
  });

  test("search narrows the recent list", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFlyout(page);

    // Read the actual rows from the preset (names are unique per campaign).
    const names = (await campaignRows(page).locator("p").allTextContents()).map(
      (n) => n.trim(),
    );
    const initialCount = names.length;
    expect(initialCount).toBeGreaterThan(1);

    // Search by the first campaign's full (unique) name — a term that matches
    // exactly ONE known row. Pick a known NON-matching campaign to assert it
    // disappears (a name that does not contain firstName as a substring).
    const firstName = names[0];
    expect(firstName.length).toBeGreaterThan(0);
    const otherName = names
      .slice(1)
      .find(
        (n) =>
          n !== firstName &&
          !n
            .toLocaleLowerCase("ru-RU")
            .includes(firstName.toLocaleLowerCase("ru-RU")),
      );
    expect(otherName, "preset must have a non-matching campaign").toBeTruthy();

    await searchBox(page).fill(firstName);

    // (a) the matching campaign's row stays visible …
    await expect(flyout(page).getByText(firstName, { exact: true })).toBeVisible();
    // (b) … and the known non-matching campaign's row is gone.
    await expect(
      flyout(page).getByText(otherName!, { exact: true }),
    ).toHaveCount(0);
    // The list strictly shrank — the search actually narrowed it.
    expect(await campaignRows(page).count()).toBeLessThan(initialCount);
  });

  test("search with no matches shows empty state", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFlyout(page);

    await searchBox(page).fill("qwertyqwerty");
    await expect(page.getByText("Ничего не нашлось. Измените запрос.")).toBeVisible();
  });

  test("panel has the «Последнее» heading and no «Запустить» heading", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFlyout(page);

    await expect(
      flyout(page).getByRole("heading", { name: "Последнее" })
    ).toBeVisible();
    await expect(
      flyout(page).getByRole("heading", { name: "Запустить" })
    ).toHaveCount(0);
  });

  test("Escape closes the panel", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await openFlyout(page);

    await page.keyboard.press("Escape");
    await expect(flyout(page)).toBeHidden();
  });

  // removed: "subtitle under campaign heading is visible" — the «Создать
  // кампанию по готовому сигналу» heading/subtitle no longer exists; the panel
  // is a recent-campaigns finder whose copy is covered by the cases above.
});
