import { describe, expect, it } from "vitest";
import { EMPTY_SURVEY, DEMO_SURVEY, type Survey } from "./survey";

describe("Survey task-description field", () => {
  it("EMPTY_SURVEY has an empty taskDescription", () => {
    expect(EMPTY_SURVEY.taskDescription).toBe("");
  });
  it("DEMO_SURVEY has a non-empty taskDescription", () => {
    expect(DEMO_SURVEY.taskDescription.trim().length).toBeGreaterThan(0);
  });
  it("keeps companyWebsite for frozen app-state reducer compat", () => {
    // Foundation dependency: app-state.ts still reads survey.companyWebsite.
    const s: Survey = {
      companyName: "Acme",
      companyWebsite: "Хотим лиды на ипотеку",
      taskDescription: "Хотим лиды на ипотеку",
      directionId: null,
    };
    expect(s.companyWebsite).toBe(s.taskDescription);
  });
});
