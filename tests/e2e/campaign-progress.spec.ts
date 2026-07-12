// «Прогресс кампании» — the canonical expandable progress stepper on the
// campaign card. Covers the three type/comm cases:
//   1. non-streaming WITH communication  → Отправка → Проверка → Обработка →
//      Коммуникация по сигналам → Кампания завершена
//   2. non-streaming WITHOUT communication → …→ Обработка → Кампания завершена
//      (no «Коммуникация по сигналам» stage)
//   3. streaming → Подключение к провайдерам → Обработка и коммуникация (+ a
//      «Суммарно» per-day line)
//
// The row is EXPANDED by default (refactor bf9b62c); clicking the chevron
// collapses it. The current processing stage hosts the provider list. Seeds put
// each campaign in the scoring/processing era so the provider list is the
// current stage and renders in the expanded stepper.
import { test, expect } from "@playwright/test";
import { seedScreen } from "./screens/seed";
import type { AppState, Campaign, Artifact, View } from "@/state/app-state";

const FIXED = {
  surveyStatus: "completed" as const,
  introSeen: true,
  balance: 100_000,
};

function cardSeed(campaign: Campaign): Partial<AppState> {
  const artifact: Artifact = {
    id: `art_${campaign.id}`,
    campaignId: campaign.id,
    kind: "signals",
    count: 10_000,
    createdAt: "2026-06-15T14:30:00.000Z",
  };
  return {
    ...FIXED,
    campaigns: [campaign],
    artifacts: [artifact],
    view: {
      kind: "campaign",
      campaign: { id: campaign.id, name: campaign.name },
    } satisfies View,
  } as Partial<AppState>;
}

const base = {
  createdAt: "2026-06-01T10:00:00.000Z",
  launchedAt: "2026-06-15T14:30:00.000Z",
  scenario: { id: "base-registration", name: "Регистрация" },
} as const;

// Non-streaming WITH communication, processing era (phase scoring) → current
// stage «Обработка базы».
const commCampaign: Campaign = {
  ...base,
  id: "cmp_prog_comm",
  name: "С коммуникацией",
  status: "active",
  sourceType: "new",
  channels: ["sms", "email"],
  phase: "scoring",
};

// Non-streaming WITHOUT communication, processing era → current «Обработка базы».
const noCommCampaign: Campaign = {
  ...base,
  id: "cmp_prog_nocomm",
  name: "Без коммуникации",
  status: "active",
  sourceType: "new",
  channels: [],
  phase: "scoring",
};

// Streaming, communicating → current combined stage «Обработка и коммуникация».
const streamCampaign: Campaign = {
  ...base,
  id: "cmp_prog_stream",
  name: "Поток",
  status: "active",
  sourceType: "stream",
  channels: ["sms"],
  phase: "communicating",
};

test.describe("«Прогресс кампании» stepper on the campaign card", () => {
  test("non-streaming WITH comm: collapsible row reveals the full stage sequence + providers", async ({
    page,
  }) => {
    await seedScreen(page, {
      id: "prog-comm",
      name: "progress comm",
      seed: cardSeed(commCampaign),
      expect: 'h1:has-text("С коммуникацией")',
    });

    // Expanded by default: the row is open and the full non-streaming-with-comm
    // sequence is visible without a click (progress is expanded by default).
    const row = page.getByRole("button", { name: /Прогресс/ });
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Обработка базы").first()).toBeVisible();
    await expect(page.getByText("Отправка провайдерам").first()).toBeVisible();
    await expect(page.getByText("Проверка провайдерами").first()).toBeVisible();
    await expect(page.getByText("Коммуникация по сигналам").first()).toBeVisible();
    await expect(page.getByText("Кампания завершена").first()).toBeVisible();

    // Providers render (by name) under the current «Обработка базы» stage.
    // (The «ожидание подключения» status text is streaming-only; non-streaming
    // providers show a status icon, not that label.)
    await expect(page.getByText("Билайн")).toBeVisible();
    await expect(page.getByText("Мегафон")).toBeVisible();

    // Clicking the row collapses it → the downstream stages hide.
    await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText("Отправка провайдерам")).toHaveCount(0);
  });

  test("non-streaming WITHOUT comm: sequence ends at «Кампания завершена», no «Коммуникация по сигналам»", async ({
    page,
  }) => {
    await seedScreen(page, {
      id: "prog-nocomm",
      name: "progress no comm",
      seed: cardSeed(noCommCampaign),
      expect: 'h1:has-text("Без коммуникации")',
    });

    // Expanded by default — no click needed to reveal the sequence.
    const row = page.getByRole("button", { name: /Прогресс/ });
    await expect(row).toHaveAttribute("aria-expanded", "true");

    await expect(page.getByText("Обработка базы").first()).toBeVisible();
    await expect(page.getByText("Кампания завершена").first()).toBeVisible();
    // The communication stage is entirely absent for a no-comm campaign.
    await expect(page.getByText("Коммуникация по сигналам")).toHaveCount(0);
    // Providers still render in the processing stage.
    await expect(page.getByText("Билайн")).toBeVisible();
  });

  test("streaming: two combined stages + a «Суммарно» per-day line", async ({ page }) => {
    await seedScreen(page, {
      id: "prog-stream",
      name: "progress stream",
      seed: cardSeed(streamCampaign),
      expect: 'h1:has-text("Поток")',
    });

    // Expanded by default: both streaming stages are visible without a click.
    const row = page.getByRole("button", { name: /Прогресс/ });
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Обработка и коммуникация").first()).toBeVisible();
    await expect(page.getByText("Подключение к провайдерам")).toBeVisible();
    // The non-streaming stages must NOT appear for a streaming campaign.
    await expect(page.getByText("Отправка провайдерам")).toHaveCount(0);
    await expect(page.getByText("Обработка базы")).toHaveCount(0);
    // Providers + the streaming running total.
    await expect(page.getByText("Билайн")).toBeVisible();
    await expect(page.getByText("Суммарно")).toBeVisible();
  });
});
