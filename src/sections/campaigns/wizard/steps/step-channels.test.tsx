import { describe, it, expect } from "vitest";
import { toggleChannel } from "./step-channels";

describe("toggleChannel (StepChannels selection logic)", () => {
  it("adds a channel when absent", () => {
    expect(toggleChannel([], "sms")).toEqual(["sms"]);
  });
  it("removes a channel when present", () => {
    expect(toggleChannel(["sms", "push"], "sms")).toEqual(["push"]);
  });
  it("preserves canonical channel order", () => {
    const out = toggleChannel(["push"], "sms");
    expect(out).toEqual(["sms", "push"]);
  });
});
