import { describe, expect, it } from "vitest";
import { appReducer, initialState } from "./app-state";

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
