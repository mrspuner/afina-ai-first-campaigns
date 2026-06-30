import { test, expect } from "./screens/smoke.fixture";
import { seedScreen } from "./screens/seed";
import { SCREENS } from "./screens/catalog";

for (const screen of SCREENS) {
  test(`smoke: ${screen.name} (${screen.id})`, async ({ page, errors }) => {
    await seedScreen(page, screen);
    // Next 16 always keeps a <nextjs-portal> mounted whose <... data-nextjs-toast>
    // is the dev-tools indicator (NOT an error). The build/runtime error overlay
    // mounts a dialog-overlay — assert that specifically is absent.
    await expect(page.locator("[data-nextjs-dialog-overlay]")).toHaveCount(0);
    expect(
      errors,
      `console/page errors on ${screen.id}:\n${errors.join("\n")}`,
    ).toEqual([]);
  });
}
