import { describe, expect, it } from "vitest";
import { appReducer, initialState } from "./app-state";
import { initialStepData } from "@/types/campaign";

describe("campaign_created_from_wizard", () => {
  it("creates a draft campaign from wizard StepData and opens the workflow", () => {
    const next = appReducer(initialState, {
      type: "campaign_created_from_wizard",
      stepData: { ...initialStepData, scenario: "registration", sourceType: "new", channels: ["sms"], budget: 1000 },
      scenarioName: "Регистрация",
    });
    expect(next.campaigns).toHaveLength(1);
    const c = next.campaigns[0];
    expect(c.status).toBe("draft");
    expect(c.sourceType).toBe("new");
    expect(c.channels).toEqual(["sms"]);
    expect(c.scenario).toEqual({ id: "registration", name: "Регистрация" });
    expect("signalId" in c).toBe(false);
    expect(next.view).toMatchObject({ kind: "workflow", campaign: { id: c.id }, launched: false });
  });
});
