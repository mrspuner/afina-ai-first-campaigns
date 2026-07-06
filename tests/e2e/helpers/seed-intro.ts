import { type Page, expect } from "@playwright/test";

/**
 * Seed `introSeen: true` onto `window.__AFINA_SEED__` BEFORE the app mounts so
 * the first-run IntroOverlay never renders and never intercepts pointer events.
 *
 * Consumed by the app's dev-only `useSeedFromWindow` hook, which merges the
 * partial into state on mount (no-op in production). The reducer's
 * `preset_applied` action preserves `introSeen`, so seeding once is enough even
 * when a test later applies a dev preset.
 *
 * MUST be called BEFORE `page.goto("/")`.
 */
export async function dismissIntro(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as Window & { __AFINA_SEED__?: unknown }).__AFINA_SEED__ = {
      introSeen: true,
    };
  });
}

/**
 * Dismiss the first-run IntroOverlay through its real UI: advance through every
 * step with «Далее» and finish with the terminal «Понятно, начать» CTA. Used by
 * the welcome-onboarding spec, which exercises the genuine first-run path
 * instead of seeding the flag away.
 *
 * MUST be called AFTER `page.goto("/")`. No-op-safe if the overlay is absent.
 */
export async function dismissIntroOverlay(page: Page): Promise<void> {
  // The dialog's accessible name tracks the per-step title, so anchor on each
  // step's heading to detect presence and drive progression deterministically.
  // The overlay uses motion step transitions (AnimatePresence), so the buttons
  // are constantly mid-animation — force the clicks and gate each step on the
  // next title appearing (this is still the real first-run dismissal path).
  const STEP_TITLES = [
    "Знакомьтесь — афина ИИ",
    "Спрашивайте своими словами",
    "Или начните с подсказки",
    "Сложное — в боковой панели",
  ];
  const firstTitle = page.getByText(STEP_TITLES[0]);
  if ((await firstTitle.count()) === 0) return;
  await expect(firstTitle).toBeVisible();

  const next = page.getByRole("button", { name: "Далее" });
  // Advance through the intermediate steps; each «Далее» reveals the next title.
  for (let i = 1; i < STEP_TITLES.length; i++) {
    await next.click({ force: true });
    await expect(page.getByText(STEP_TITLES[i])).toBeVisible();
  }
  const finish = page.getByRole("button", { name: "Понятно, начать" });
  await finish.click({ force: true });
  await expect(finish).toHaveCount(0);
}
