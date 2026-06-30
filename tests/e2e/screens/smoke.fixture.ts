import { test as base, expect } from "@playwright/test";

const IGNORE = [/favicon/i, /Download the React DevTools/i, /\[Fast Refresh\]/i];

export const test = base.extend<{ errors: string[] }>({
  // The fixture-injector arg is positional in Playwright; named `provide` (not
  // `use`) so eslint-plugin-react-hooks doesn't mistake it for the React `use`.
  errors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !IGNORE.some((r) => r.test(m.text()))) {
        errors.push(m.text());
      }
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await provide(errors);
  },
});

export { expect };
