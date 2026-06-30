import { type Page, expect } from "@playwright/test";
import type { Screen } from "./catalog";

/**
 * Inject a screen's state seed onto `window.__AFINA_SEED__` (consumed by the
 * app's `useSeedFromWindow` hook), navigate, and wait for the screen's anchor
 * selector. Reduced motion is forced so JS/CSS transitions settle quickly.
 */
export async function seedScreen(page: Page, screen: Screen) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((seed) => {
    (window as Window & { __AFINA_SEED__?: unknown }).__AFINA_SEED__ = seed;
  }, screen.seed);
  await page.goto("/");
  await expect(page.locator(screen.expect).first()).toBeVisible({ timeout: 15_000 });
}
