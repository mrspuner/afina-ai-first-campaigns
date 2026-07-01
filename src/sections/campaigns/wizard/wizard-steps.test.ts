import { describe, expect, it } from "vitest";
import { stepsForIntent } from "./wizard-steps";

describe("stepsForIntent", () => {
  it("signals (A): scenario, intent, interests, analysis, file, budget — no channels", () => {
    expect(stepsForIntent("signals")).toEqual(
      ["scenario", "intent", "interests", "analysis", "file", "budget"],
    );
    expect(stepsForIntent("signals")).not.toContain("channels");
  });
  it("signals-comms (B): scenario, intent, interests, analysis, file, channels, budget", () => {
    expect(stepsForIntent("signals-comms")).toEqual(
      ["scenario", "intent", "interests", "analysis", "file", "channels", "budget"],
    );
  });
  it("comms-own (C): scenario, intent, file, channels, budget — no interests/analysis", () => {
    expect(stepsForIntent("comms-own")).toEqual(
      ["scenario", "intent", "file", "channels", "budget"],
    );
    expect(stepsForIntent("comms-own")).not.toContain("interests");
    expect(stepsForIntent("comms-own")).not.toContain("analysis");
  });
  it("before an intent is chosen, only scenario+intent are known", () => {
    expect(stepsForIntent(undefined)).toEqual(["scenario", "intent"]);
  });
});
