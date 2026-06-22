import { describe, it, expect } from "vitest";
import { canContinueFromSource } from "./step-source";
import { canContinueFromFile } from "./step-file";

describe("canContinueFromSource (StepSource continue-gate)", () => {
  it("allows continue once a source is selected (all three are valid)", () => {
    expect(canContinueFromSource("new")).toBe(true);
    expect(canContinueFromSource("own")).toBe(true);
    expect(canContinueFromSource("stream")).toBe(true);
  });
});

describe("canContinueFromFile (StepFile continue-gate)", () => {
  it("requires a file before continue", () => {
    expect(canContinueFromFile(null)).toBe(false);
    expect(canContinueFromFile(new File(["x"], "base.csv"))).toBe(true);
  });
});
