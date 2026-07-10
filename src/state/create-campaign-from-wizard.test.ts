import { describe, expect, it } from "vitest";
import { appReducer, initialState } from "./app-state";
import { initialStepData } from "@/types/campaign";

describe("campaign_created_from_wizard", () => {
  it("creates a draft campaign from wizard StepData and opens the campaign card", () => {
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
    // Финал визарда приземляет в карточку кампании, а не в редактор графа —
    // граф живёт внутри карточки, под текстовым описанием цепочки.
    expect(next.view).toMatchObject({ kind: "campaign" });
    expect((next.view as { kind: "campaign"; campaign: { id: string } }).campaign.id).toBe(next.campaigns.at(-1)!.id);
  });

  it("new source starts in the scoring phase (pre-launch collection)", () => {
    const next = appReducer(initialState, {
      type: "campaign_created_from_wizard",
      stepData: { ...initialStepData, scenario: "registration", sourceType: "new", channels: ["sms"] },
      scenarioName: "Регистрация",
    });
    expect(next.campaigns[0].phase).toBe("scoring");
  });

  it("stream source carries no pre-launch phase", () => {
    const next = appReducer(initialState, {
      type: "campaign_created_from_wizard",
      stepData: { ...initialStepData, scenario: "registration", sourceType: "stream", channels: ["sms"] },
      scenarioName: "Регистрация",
    });
    expect(next.campaigns[0].phase).toBeUndefined();
  });

  it("own source carries no pre-launch phase", () => {
    const next = appReducer(initialState, {
      type: "campaign_created_from_wizard",
      stepData: { ...initialStepData, scenario: "registration", sourceType: "own", channels: ["sms"] },
      scenarioName: "Регистрация",
    });
    expect(next.campaigns[0].phase).toBeUndefined();
  });
});
