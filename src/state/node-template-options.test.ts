import { describe, expect, it } from "vitest";
import { templateOptionsForKind, channelForNodeKind } from "./node-template-options";
import { PRESET_TEMPLATES } from "./app-state";

describe("node-template-options", () => {
  it("maps communication node kind → channel", () => {
    expect(channelForNodeKind("sms")).toBe("sms");
    expect(channelForNodeKind("email")).toBe("email");
    expect(channelForNodeKind("push")).toBe("push");
    expect(channelForNodeKind("ivr")).toBe("ivr");
    expect(channelForNodeKind("wait")).toBeUndefined();
  });

  it("filters templates by the node's channel", () => {
    const sms = templateOptionsForKind(PRESET_TEMPLATES, "sms");
    expect(sms.length).toBeGreaterThan(0);
    expect(sms.every((t) => t.channel === "sms")).toBe(true);
    const email = templateOptionsForKind(PRESET_TEMPLATES, "email");
    expect(email.every((t) => t.channel === "email")).toBe(true);
  });

  it("returns id + name for each option (contract with block 2 MessageTemplate)", () => {
    const [first] = templateOptionsForKind(PRESET_TEMPLATES, "email");
    expect(typeof first.id).toBe("string");
    expect(typeof first.name).toBe("string");
  });

  it("non-communication kinds yield no template options", () => {
    expect(templateOptionsForKind(PRESET_TEMPLATES, "wait")).toEqual([]);
  });
});
