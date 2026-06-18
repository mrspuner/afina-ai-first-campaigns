import { describe, it, expect } from "vitest";
import { canContinueFromSource } from "./step-source";

describe("canContinueFromSource (StepSource continue-gate)", () => {
  it("own source requires a file before continue", () => {
    expect(canContinueFromSource("own", null)).toBe(false);
    expect(canContinueFromSource("own", new File(["x"], "base.csv"))).toBe(true);
  });

  it("new source can continue without a file (file optional)", () => {
    expect(canContinueFromSource("new", null)).toBe(true);
  });

  it("stream source can continue without a file (source connected externally)", () => {
    expect(canContinueFromSource("stream", null)).toBe(true);
  });
});
