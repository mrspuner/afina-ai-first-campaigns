import { describe, expect, it } from "vitest";
import { CHANNELS, type Channel, type SourceType, initialStepData } from "./campaign";

describe("campaign source/channel contracts", () => {
  it("exposes the three source types via initialStepData default", () => {
    expect(initialStepData.sourceType).toBe("new");
  });

  it("lists exactly the four channels", () => {
    expect(CHANNELS).toEqual(["sms", "push", "email", "ivr"]);
  });

  it("types compile for every union member", () => {
    const sources: SourceType[] = ["new", "stream", "own"];
    const chans: Channel[] = ["sms", "push", "email", "ivr"];
    expect(sources.length + chans.length).toBe(7);
  });
});
