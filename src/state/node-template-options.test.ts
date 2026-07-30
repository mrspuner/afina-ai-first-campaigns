import { describe, expect, it } from "vitest";
import {
  templateOptionsForKind,
  channelForNodeKind,
  templateParamKeyForKind,
  nodePreviewTemplate,
} from "./node-template-options";
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
});

describe("nodePreviewTemplate", () => {
  it("оборачивает params SMS-ноды в шаблон канала sms", () => {
    const tpl = nodePreviewTemplate("n1", {
      kind: "sms", text: "Текст", alphaName: "AFINA", scheduledAt: "immediate",
    })!;
    expect(tpl.channel).toBe("sms");
    expect(tpl.content).toEqual({
      kind: "sms", text: "Текст", alphaName: "AFINA", scheduledAt: "immediate",
    });
  });

  it("email берёт тему как имя шаблона", () => {
    const tpl = nodePreviewTemplate("n2", {
      kind: "email", subject: "Ваше предложение", body: "Тело", sender: "a@b.c",
    })!;
    expect(tpl.channel).toBe("email");
    expect(tpl.name).toBe("Ваше предложение");
  });

  it("всегда read-only: usedInCampaigns=1 — дровер не даст «Сохранить» в несуществующий id", () => {
    const tpl = nodePreviewTemplate("n3", {
      kind: "push", title: "Заголовок", body: "Текст",
    })!;
    expect(tpl.usedInCampaigns).toBe(1);
  });

  it("id стабилен и уникален по ноде", () => {
    const a = nodePreviewTemplate("n4", { kind: "ivr", scenario: "Возврат", voiceType: "female" })!;
    const b = nodePreviewTemplate("n5", { kind: "ivr", scenario: "Возврат", voiceType: "female" })!;
    expect(a.id).not.toBe(b.id);
    expect(a.id).toBe(nodePreviewTemplate("n4", { kind: "ivr", scenario: "Возврат", voiceType: "female" })!.id);
  });

  it("не-коммуникационные params не дают шаблона", () => {
    expect(nodePreviewTemplate("n6", { kind: "wait", mode: "duration", durationHours: 24 })).toBeNull();
  });
});
