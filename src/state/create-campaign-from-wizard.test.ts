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

  // Потолок дневного бюджета вводит пользователь (только stream). Это durable
  // значение кампании — в отличие от расчётного dailyBudget, который
  // пересчитывается от стоимости графа.
  it("переносит введённый maxDailyBudget на кампанию", () => {
    const next = appReducer(initialState, {
      type: "campaign_created_from_wizard",
      stepData: {
        ...initialStepData,
        scenario: "registration",
        sourceType: "stream",
        channels: ["sms"],
        budget: 1000,
        maxDailyBudget: 5000,
      },
      scenarioName: "Регистрация",
    });
    expect(next.campaigns[0].maxDailyBudget).toBe(5000);
  });

  it("без введённого потолка maxDailyBudget не выставляется", () => {
    const next = appReducer(initialState, {
      type: "campaign_created_from_wizard",
      stepData: { ...initialStepData, scenario: "registration", sourceType: "stream", channels: ["sms"] },
      scenarioName: "Регистрация",
    });
    expect(next.campaigns[0].maxDailyBudget).toBeUndefined();
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

  // Task 1 moved StepData.files to BaseFile (each entry already carries its
  // own rowCount). Campaign.files must carry that per-file rowCount straight
  // through, NOT redistribute a wizard-level total across the files evenly —
  // Task 2's snapshot round-trip depends on this mapping being an identity.
  it("carries each file's own rowCount through to Campaign.files, not a redistributed total", () => {
    const next = appReducer(initialState, {
      type: "campaign_created_from_wizard",
      stepData: {
        ...initialStepData,
        scenario: "registration",
        sourceType: "new",
        channels: ["sms"],
        files: [
          { name: "base-1.csv", rowCount: 12_000 },
          { name: "base-2.csv", rowCount: 3_000 },
        ],
        fileRowCount: 15_000,
      },
      scenarioName: "Регистрация",
    });
    expect(next.campaigns[0].files).toEqual([
      { name: "base-1.csv", rowCount: 12_000 },
      { name: "base-2.csv", rowCount: 3_000 },
    ]);
  });
});
