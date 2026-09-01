import { test, expect } from "@playwright/test";
import { seedScreen } from "./screens/seed";
import { SCREENS } from "./screens/catalog";

// Task #4 — canonical rule: the primary / forward CTA ("Продолжить" / "Далее" /
// "Запустить" / "Создать кампанию") in every wizard step footer must sit on
// the RIGHT. Where a
// «Назад» secondary exists the footer is justify-between (back left, primary
// right); where it doesn't, the primary is still right-aligned to the content
// column. Both satisfy "primary on the right".
//
// We drive each step through the same screen-seed harness the visual suite uses
// (wizard-1..6 rendered directly via window.__AFINA_SEED__). The workspace
// stacks every reached step (1..N) in one scroll column, so each assertion is
// scoped to the step-under-test's own StepContent root (its `.max-w-2xl`
// container, identified by that step's unique heading from the catalog).
//
// Note: StepContent types its title/subtitle before revealing the body, so the
// footer mounts a beat after the heading — reads go through auto-retrying
// `expect`s, never a bare racy `count()`.

const PRIMARY_LABEL = /^(Продолжить|Далее|Запустить|Создать кампанию)$/;
// The primary button carries no right margin, so its right edge should coincide
// with its footer row's right edge. Allow a few px for sub-pixel rounding.
const RIGHT_EDGE_SLACK = 4;

const wizardScreens = SCREENS.filter((s) => s.id.startsWith("wizard-"));

for (const screen of wizardScreens) {
  test(`wizard primary CTA is right-aligned: ${screen.name} (${screen.id})`, async ({
    page,
  }) => {
    await seedScreen(page, screen);

    // Scope to THIS step's StepContent root so we never collide with the
    // footers of the other stacked steps that share the same button labels.
    // The catalog's `expect` selector is this step's unique <h1>; its
    // grandparent is the StepContent root (`<h1>` → `.mb-8` heading block →
    // root). Anchoring on DOM shape (not the max-w-* class) stays robust across
    // steps that pick a different content width (e.g. budget = max-w-xl).
    const stepRoot = page.locator(screen.expect).locator("xpath=../..");
    const primary = stepRoot.getByRole("button", { name: PRIMARY_LABEL });

    // Step 1 (scenario) advances by selecting a scenario card — it has no
    // footer CTA, so there is nothing to align. Wait for its body to render
    // (the search field) before asserting there is indeed no forward CTA.
    if (screen.id === "wizard-1-scenario") {
      await expect(
        stepRoot.getByRole("textbox", { name: "Поиск по сценариям" }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(primary).toHaveCount(0);
      return;
    }

    // All other steps carry a footer CTA. Auto-wait through the typewriter
    // reveal until the button is on screen, then measure it.
    await expect(primary).toBeVisible({ timeout: 15_000 });
    const primaryBox = await primary.boundingBox();
    expect(primaryBox).not.toBeNull();

    // The footer row is the primary button's immediate parent — full content
    // width in both footer variants (StepFooter's justify-between row and any
    // custom footer). The primary's right edge must hug that row's right edge:
    // that is what "right-aligned" means, and what the interests-step bug broke
    // (its `items-start` footer pinned the CTA to the LEFT).
    const footerRow = primary.locator("xpath=..");
    const rowBox = await footerRow.boundingBox();
    expect(rowBox).not.toBeNull();

    const primaryRight = primaryBox!.x + primaryBox!.width;
    const rowRight = rowBox!.x + rowBox!.width;
    expect(
      rowRight - primaryRight,
      `primary CTA right edge (${primaryRight.toFixed(1)}) should be within ` +
        `${RIGHT_EDGE_SLACK}px of the footer right edge (${rowRight.toFixed(1)}) on ${screen.id}`,
    ).toBeLessThanOrEqual(RIGHT_EDGE_SLACK);

    // When a «Назад» secondary is present, the primary must sit to its right.
    const back = stepRoot.getByRole("button", { name: "Назад" });
    if ((await back.count()) > 0) {
      const backBox = await back.boundingBox();
      expect(backBox).not.toBeNull();
      expect(
        primaryBox!.x,
        `primary CTA (x=${primaryBox!.x.toFixed(1)}) should sit right of «Назад» ` +
          `(x=${backBox!.x.toFixed(1)}) on ${screen.id}`,
      ).toBeGreaterThan(backBox!.x);
    }
  });
}
