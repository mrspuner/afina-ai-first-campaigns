import { describe, expect, it } from "vitest";
import { stepsForSource } from "./wizard-steps";

describe("stepsForSource", () => {
  it("new: scenario, source, interests, file, channels, budget", () => {
    expect(stepsForSource("new")).toEqual(["scenario","source","interests","file","channels","budget"]);
  });
  it("own: scenario, source, file, channels, budget (no interests)", () => {
    expect(stepsForSource("own")).toEqual(["scenario","source","file","channels","budget"]);
  });
  it("stream: scenario, source, interests, file, channels, budget (loads a base, no integration)", () => {
    expect(stepsForSource("stream")).toEqual(["scenario","source","interests","file","channels","budget"]);
    expect(stepsForSource("stream")).not.toContain("integration");
  });
  it("before a source is chosen, only scenario+source are known", () => {
    expect(stepsForSource(undefined)).toEqual(["scenario","source"]);
  });
});
