import { describe, it, expect } from "vitest";
import { channelQuestion, variantQuestion } from "./use-template-flow";

describe("channelQuestion", () => {
  it("is a closed question with 4 channel options, no free input", () => {
    const q = channelQuestion();
    expect(q.allowFreeInput).toBe(false);
    expect(q.options.map((o) => o.id)).toEqual(["sms", "email", "push", "ivr"]);
    expect(q.options.map((o) => o.label)).toEqual(["SMS", "Email", "Push", "Звонок"]);
  });
});

describe("variantQuestion", () => {
  it("is open and carries component makeup per option (#15)", () => {
    const variants = [
      {
        id: "v1",
        name: "Тёплый",
        content: { kind: "email" as const, subject: "S", body: "B", sender: "S" },
        components: ["тема", "текст", "отправитель"],
      },
    ];
    const q = variantQuestion(variants);
    expect(q.allowFreeInput).toBe(true);
    expect(q.options[0].label).toBe("Тёплый");
    expect(q.options[0].components).toEqual(["тема", "текст", "отправитель"]);
  });
});
