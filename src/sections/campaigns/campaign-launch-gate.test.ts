import { describe, expect, it } from "vitest";
import { canLaunchCampaign, isCollecting } from "./campaign-launch-gate";

describe("isCollecting", () => {
  it("new draft still scoring → collecting", () => {
    expect(isCollecting({ status: "draft", sourceType: "new", phase: "scoring" })).toBe(true);
  });
  it("new draft with phase omitted defaults to scoring → collecting", () => {
    expect(isCollecting({ status: "draft", sourceType: "new" })).toBe(true);
  });
  it("new draft finished collecting (communicating) → not collecting", () => {
    expect(isCollecting({ status: "draft", sourceType: "new", phase: "communicating" })).toBe(false);
  });
  it("stream draft → not collecting", () => {
    expect(isCollecting({ status: "draft", sourceType: "stream" })).toBe(false);
  });
  it("own draft → not collecting", () => {
    expect(isCollecting({ status: "draft", sourceType: "own" })).toBe(false);
  });
  it("active campaign → not collecting", () => {
    expect(isCollecting({ status: "active", sourceType: "new", phase: "scoring" })).toBe(false);
  });
});

describe("canLaunchCampaign", () => {
  it("new draft + scoring → cannot launch", () => {
    expect(canLaunchCampaign({ status: "draft", sourceType: "new", phase: "scoring" })).toBe(false);
  });
  it("new draft + communicating → can launch", () => {
    expect(canLaunchCampaign({ status: "draft", sourceType: "new", phase: "communicating" })).toBe(true);
  });
  it("stream draft → can launch", () => {
    expect(canLaunchCampaign({ status: "draft", sourceType: "stream" })).toBe(true);
  });
  it("own draft → can launch", () => {
    expect(canLaunchCampaign({ status: "draft", sourceType: "own" })).toBe(true);
  });
  it("paused → can launch (resume)", () => {
    expect(canLaunchCampaign({ status: "paused", sourceType: "new" })).toBe(true);
  });
  it("active → cannot launch", () => {
    expect(canLaunchCampaign({ status: "active", sourceType: "stream" })).toBe(false);
  });
  it("completed → cannot launch", () => {
    expect(canLaunchCampaign({ status: "completed", sourceType: "own" })).toBe(false);
  });
});
