import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  timeout: 60_000,
  // Retry once for timing-sensitive workflow/animation specs (makes
  // `trace: "on-first-retry"` meaningful and stabilizes pre-existing flakes).
  retries: 1,
  expect: {
    // Порог подобран замером, а не на глаз: при `threshold` по умолчанию (0.2)
    // антиалиасинг не считается за разницу, и два идентичных прогона дают ровно
    // 0 отличающихся пикселей на всех 24 экранах. Держим маленький абсолютный
    // запас на случай чужой машины.
    //
    // Почему НЕ maxDiffPixelRatio: 0.01 (как было) — это 12 960 px на кадре
    // 1440×900, туда бесследно помещается целая нода графа (~6 000 px). Именно
    // так снапшоты пропустили появление ноды «Статистика», три переименования
    // заголовков и смену формата валюты (54 px на карточке кампании).
    toHaveScreenshot: { animations: "disabled", scale: "css", maxDiffPixels: 20 },
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
