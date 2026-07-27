import { describe, expect, it } from "vitest";
import {
  appReducer,
  initialState,
  rebuildViewFromAddress,
  viewToAddress,
  type Campaign,
  type View,
} from "./app-state";
import { initialStepData } from "@/types/campaign";

describe("artifacts routing", () => {
  it("sidebar_nav to Артефакты opens the artifacts section", () => {
    const next = appReducer(initialState, { type: "sidebar_nav", section: "Артефакты" });
    expect(next.view).toMatchObject({ kind: "section", name: "Артефакты" });
  });

  it("flyout_campaign_select goes straight to the wizard (no campaign-select)", () => {
    const ready = { ...initialState, surveyStatus: "completed" as const };
    const next = appReducer(ready, { type: "flyout_campaign_select" });
    expect(next.view.kind).toBe("guided-campaign");
  });
});

describe("вход в визард с карточки — адрес правки шага", () => {
  const draftCampaign: Campaign = {
    id: "cmp_1",
    name: "Черновик",
    status: "draft",
    createdAt: "2026-04-01T00:00:00.000Z",
    wizardData: { ...initialStepData, scenario: "registration", sourceType: "new" },
  };

  it("правка шага переживает round-trip через адрес", () => {
    const view: View = {
      kind: "guided-campaign",
      editing: { campaignId: "cmp_1", step: "channels" },
    };
    const restored = rebuildViewFromAddress(viewToAddress(view), [draftCampaign]);
    expect(restored).toEqual(view);
  });

  it("исчезнувшая кампания роняет адрес в обычный визард, а не в пустой экран", () => {
    const addr = viewToAddress({
      kind: "guided-campaign",
      editing: { campaignId: "cmp_нет", step: "channels" },
    });
    expect(rebuildViewFromAddress(addr, [])).toEqual({ kind: "guided-campaign" });
  });

  it("кампания без снапшота правку не открывает", () => {
    const addr = viewToAddress({
      kind: "guided-campaign",
      editing: { campaignId: "cmp_1", step: "channels" },
    });
    const launched = { ...draftCampaign, wizardData: undefined };
    expect(rebuildViewFromAddress(addr, [launched])).toEqual({ kind: "guided-campaign" });
  });
});
