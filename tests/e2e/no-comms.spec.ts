// Bug 2a/2b — «без коммуникации» campaign (empty channels): its workflow graph
// must carry NO communication nodes (email/sms/push/ivr) and its payment screen
// must show NO communication budget (the «Коммуникация» line collapses to «—»
// with no per-channel breakdown). Both surfaces read the same template, so the
// single minimal-template fix corrects them together.
//
// Reuses `seedScreen` and the catalog's existing `campaign-payment-no-comms`
// entry; the workflow variant is built inline (data only) so no extra visual
// baseline is added.
import { test, expect } from "@playwright/test";
import { seedScreen } from "./screens/seed";
import { SCREENS, type Screen } from "./screens/catalog";
import type { AppState, Campaign, View } from "@/state/app-state";

const noCommsCampaign: Campaign = {
  id: "cmp_nocomms",
  name: "Без коммуникации",
  status: "draft",
  createdAt: "2026-06-20T09:00:00.000Z",
  sourceType: "new",
  channels: [],
  phase: "communicating",
  scenario: { id: "base-registration", name: "Регистрация" },
};

const workflowNoComms: Screen = {
  id: "workflow-draft-no-comms",
  name: "Воркфлоу — черновик без коммуникации",
  seed: {
    surveyStatus: "completed",
    introSeen: true,
    balance: 100_000,
    campaigns: [noCommsCampaign],
    view: {
      kind: "workflow",
      campaign: { id: noCommsCampaign.id, name: noCommsCampaign.name },
      launched: false,
    } satisfies View,
  } as Partial<AppState>,
  expect: ".react-flow",
};

test.describe("«без коммуникации» — no comm nodes, no comm budget (bug 2a/2b)", () => {
  test("workflow graph has zero communication nodes", async ({ page }) => {
    await seedScreen(page, workflowNoComms);
    // The signal path is present…
    await expect(page.locator('[data-node-type="scoring"]')).toHaveCount(1);
    await expect(page.locator('[data-node-type="signal"]')).toHaveCount(1);
    await expect(page.locator('[data-node-type="success"]')).toHaveCount(1);
    // …and NOT a single communication node.
    for (const t of ["email", "sms", "push", "ivr"]) {
      await expect(page.locator(`[data-node-type="${t}"]`)).toHaveCount(0);
    }
  });

  test("payment screen shows no communication budget line", async ({ page }) => {
    const screen = SCREENS.find((s) => s.id === "campaign-payment-no-comms");
    expect(screen, "campaign-payment-no-comms must exist in the catalog").toBeTruthy();
    await seedScreen(page, screen!);

    // The «Коммуникация» label still exists structurally, but its value is «—»
    // (zero) and there is NO per-channel breakdown.
    const commLabel = page.getByText("Коммуникация", { exact: true });
    await expect(commLabel).toBeVisible();
    const commValue = commLabel.locator("xpath=following-sibling::span[1]");
    await expect(commValue).toHaveText("—");

    // No primary/repeat communication breakdown groups.
    await expect(page.getByText("Первичные", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Повторные", { exact: true })).toHaveCount(0);
  });
});
