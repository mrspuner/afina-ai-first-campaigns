import { describe, it, expect } from "vitest";
import { templateComponentLabels } from "./template-components";

describe("templateComponentLabels", () => {
  it("sms → текст, отправитель", () => {
    expect(
      templateComponentLabels({
        kind: "sms",
        text: "Привет",
        alphaName: "Bank",
        scheduledAt: "immediate",
      })
    ).toEqual(["текст", "отправитель"]);
  });
  it("sms с link добавляет ссылку", () => {
    expect(
      templateComponentLabels({
        kind: "sms",
        text: "x",
        alphaName: "B",
        scheduledAt: "immediate",
        link: "https://x",
      })
    ).toEqual(["текст", "отправитель", "ссылка"]);
  });
  it("email → тема, текст, отправитель", () => {
    expect(
      templateComponentLabels({ kind: "email", subject: "S", body: "B", sender: "S" })
    ).toEqual(["тема", "текст", "отправитель"]);
  });
  it("push → заголовок, текст", () => {
    expect(templateComponentLabels({ kind: "push", title: "T", body: "B" })).toEqual([
      "заголовок",
      "текст",
    ]);
  });
  it("ivr → сценарий, голос", () => {
    expect(
      templateComponentLabels({ kind: "ivr", scenario: "S", voiceType: "female" })
    ).toEqual(["сценарий", "голос"]);
  });
});
