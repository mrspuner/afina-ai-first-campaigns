import { describe, expect, it } from "vitest";
import {
  templateOptionsForKind,
  channelForNodeKind,
  templateParamKeyForKind,
  ivrNodePreviewTemplate,
} from "./node-template-options";
import { PRESET_TEMPLATES } from "./app-state";
import type { IvrParams } from "@/types/workflow";

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

  // Fix: ivr used to have no entry here at all — its node field couldn't match
  // against the template library, so the "Шаблон" control had nothing to
  // resolve against (matches sms "text" / email+push "body").
  it("maps every communication kind to its matching param key, including ivr", () => {
    expect(templateParamKeyForKind("sms")).toBe("text");
    expect(templateParamKeyForKind("email")).toBe("body");
    expect(templateParamKeyForKind("push")).toBe("body");
    expect(templateParamKeyForKind("ivr")).toBe("scenario");
    expect(templateParamKeyForKind("wait")).toBeUndefined();
  });

  describe("ivrNodePreviewTemplate", () => {
    const params: IvrParams = {
      kind: "ivr",
      scenario: "Приветствие → перевод на оператора",
      voiceType: "female",
    };

    it("wraps the node's ivr params in an ivr-channel MessageTemplate", () => {
      const tpl = ivrNodePreviewTemplate("comm_ivr", params);
      expect(tpl.channel).toBe("ivr");
      expect(tpl.content.kind).toBe("ivr");
      expect(tpl.content).toMatchObject({
        kind: "ivr",
        scenario: params.scenario,
        voiceType: params.voiceType,
      });
    });

    it("derives a stable, node-scoped id (no library entry required)", () => {
      expect(ivrNodePreviewTemplate("comm_ivr", params).id).toBe(
        "ivr_node_preview_comm_ivr",
      );
      // Different nodes → different ids, so previews don't collide.
      expect(ivrNodePreviewTemplate("other", params).id).toBe(
        "ivr_node_preview_other",
      );
    });
  });
});
