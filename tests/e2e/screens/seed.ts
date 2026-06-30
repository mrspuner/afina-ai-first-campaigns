import { type Page, expect } from "@playwright/test";
import type { Screen } from "./catalog";

/**
 * Inject a screen's state seed onto `window.__AFINA_SEED__` (consumed by the
 * app's `useSeedFromWindow` hook), navigate, and wait for the screen's anchor
 * selector. Reduced motion is forced so JS/CSS transitions settle quickly.
 */
export async function seedScreen(page: Page, screen: Screen) {
  // Pin the clock BEFORE navigation so `now`-relative renders are deterministic
  // and baselines don't drift across calendar days. The campaign-card and
  // section-campaigns screens render metrics that accumulate one row per day up
  // to `new Date()` for an active campaign — without a fixed clock those PNGs
  // change every day.
  await page.clock.setFixedTime(new Date("2026-06-30T12:00:00Z"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((seed) => {
    (window as Window & { __AFINA_SEED__?: unknown }).__AFINA_SEED__ = seed;
  }, screen.seed);
  await page.goto("/");
  await expect(page.locator(screen.expect).first()).toBeVisible({ timeout: 15_000 });
}
