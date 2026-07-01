import { describe, expect, it } from "vitest";
import {
  CHANNELS,
  type Channel,
  type SourceType,
  deriveSourceType,
  initialStepData,
} from "./campaign";

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

describe("deriveSourceType", () => {
  it("comms-own → own regardless of analysis mode", () => {
    expect(deriveSourceType("comms-own", "once")).toBe("own");
    expect(deriveSourceType("comms-own", "stream")).toBe("own");
  });
  it("signals / signals-comms + once → new", () => {
    expect(deriveSourceType("signals", "once")).toBe("new");
    expect(deriveSourceType("signals-comms", "once")).toBe("new");
  });
  it("signals / signals-comms + stream → stream", () => {
    expect(deriveSourceType("signals", "stream")).toBe("stream");
    expect(deriveSourceType("signals-comms", "stream")).toBe("stream");
  });
});

describe("initialStepData defaults", () => {
  it("intent=signals-comms, analysisMode=once, sourceType stays consistent", () => {
    expect(initialStepData.intent).toBe("signals-comms");
    expect(initialStepData.analysisMode).toBe("once");
    expect(initialStepData.sourceType).toBe(
      deriveSourceType(initialStepData.intent, initialStepData.analysisMode),
    );
  });
});
