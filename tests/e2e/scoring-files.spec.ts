// The standalone «Файл» entry node was removed and folded into the graph root:
// for a `new`/`stream` campaign the scoring node is the root and hosts a «Файлы»
// parameter (list + add-file control, editable in a draft). The old floating
// «Добавить файл» pane control is gone. Reuses the catalog's workflow-draft.
import { test, expect } from "@playwright/test";
import { seedScreen } from "./screens/seed";
import { SCREENS } from "./screens/catalog";

test.describe("scoring «Файлы» param + add-file (no «Файл» entry node)", () => {
  test("draft (new): no «Файл»/source node; scoring hosts «Файлы» + add control; no floating add-file", async ({
    page,
  }) => {
    const screen = SCREENS.find((s) => s.id === "workflow-draft")!;
    await seedScreen(page, screen);
    await expect(page.locator(".react-flow")).toBeVisible();

    // The standalone «Файл» entry node is gone; scoring is the graph root.
    await expect(page.locator('[data-node-type="source"]')).toHaveCount(0);
    await expect(page.locator('[data-node-type="scoring"]')).toHaveCount(1);

    // The old floating «Добавить файл» pane control (a TEXT button) is removed —
    // adding files now happens on the scoring node's «Файлы» param instead.
    await expect(page.getByText("Добавить файл", { exact: true })).toHaveCount(0);

    // Open the scoring node card → «Файлы» param row + add-file control.
    await page.locator('[data-node-type="scoring"]').first().click();
    const panel = page.getByTestId("node-control-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Файлы", { exact: true })).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Добавить файл" })
    ).toBeVisible();
  });

  test("launched (read-only): scoring shows «Файлы» but NO add-file control", async ({
    page,
  }) => {
    const screen = SCREENS.find((s) => s.id === "workflow-launched")!;
    await seedScreen(page, screen);
    await expect(page.locator(".react-flow")).toBeVisible();
    await expect(page.locator('[data-node-type="source"]')).toHaveCount(0);

    await page.locator('[data-node-type="scoring"]').first().click();
    const panel = page.getByTestId("node-control-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Файлы", { exact: true })).toBeVisible();
    // Read-only: no add-file affordance.
    await expect(
      panel.getByRole("button", { name: "Добавить файл" })
    ).toHaveCount(0);
  });
});
