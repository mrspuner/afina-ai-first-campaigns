import { describe, expect, it } from "vitest";
import { appReducer, initialState } from "./app-state";

describe("start_campaign_flow", () => {
  it("routes a survey-completed user into the wizard", () => {
    const ready = { ...initialState, surveyStatus: "completed" as const };
    const next = appReducer(ready, { type: "start_campaign_flow" });
    expect(next.view.kind).toBe("guided-campaign");
  });

  it("routes a first-time user into the survey", () => {
    const next = appReducer(initialState, { type: "start_campaign_flow" });
    expect(next.view.kind).toBe("survey");
  });
});
