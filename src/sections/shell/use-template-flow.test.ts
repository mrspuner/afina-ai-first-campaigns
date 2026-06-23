import { describe, it, expect } from "vitest";
import {
  channelQuestion,
  variantQuestion,
  describeVariant,
  buildVariantsMessage,
  runSubmitIntent,
} from "./use-template-flow";
import type { TemplateDrawerVariant } from "@/state/chat-context";

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

describe("describeVariant", () => {
  it("lists subject and body for an email variant", () => {
    const v: TemplateDrawerVariant = {
      id: "v1",
      name: "Тёплый",
      content: {
        kind: "email",
        subject: "Ваша квартира ждёт",
        body: "Успейте забронировать",
        sender: "Афина",
      },
      components: ["тема", "текст", "отправитель"],
    };
    const line = describeVariant(v, 1);
    expect(line).toContain("1.");
    expect(line).toContain("Тёплый");
    expect(line).toContain("Тема: Ваша квартира ждёт");
    expect(line).toContain("Текст: Успейте забронировать");
  });

  it("lists text for an sms variant", () => {
    const v: TemplateDrawerVariant = {
      id: "v2",
      name: "Короткий",
      content: { kind: "sms", text: "Кредит за 5 минут", alphaName: "Bank", scheduledAt: "immediate" },
      components: ["текст", "отправитель"],
    };
    const line = describeVariant(v, 2);
    expect(line).toContain("2.");
    expect(line).toContain("Короткий");
    expect(line).toContain("Текст: Кредит за 5 минут");
  });

  it("lists title and body for a push variant", () => {
    const v: TemplateDrawerVariant = {
      id: "v3",
      name: "Пуш",
      content: { kind: "push", title: "Новое авто", body: "Тест-драйв сегодня" },
      components: ["заголовок", "текст"],
    };
    const line = describeVariant(v, 3);
    expect(line).toContain("3.");
    expect(line).toContain("Пуш");
    expect(line).toContain("Заголовок: Новое авто");
    expect(line).toContain("Текст: Тест-драйв сегодня");
  });

  it("lists scenario for an ivr variant", () => {
    const v: TemplateDrawerVariant = {
      id: "v4",
      name: "Звонок",
      content: { kind: "ivr", scenario: "Приветствие и оффер", voiceType: "female" },
      components: ["сценарий", "голос"],
    };
    const line = describeVariant(v, 4);
    expect(line).toContain("4.");
    expect(line).toContain("Звонок");
    expect(line).toContain("Сценарий: Приветствие и оффер");
  });
});

describe("buildVariantsMessage", () => {
  it("numbers each variant and includes its title/text fields", () => {
    const variants: TemplateDrawerVariant[] = [
      {
        id: "v1",
        name: "Тёплый",
        content: { kind: "email", subject: "Квартира", body: "Бронируйте", sender: "Афина" },
        components: ["тема", "текст", "отправитель"],
      },
      {
        id: "v2",
        name: "Срочный",
        content: { kind: "email", subject: "Последний день", body: "Скидка уходит", sender: "Афина" },
        components: ["тема", "текст", "отправитель"],
      },
    ];
    const msg = buildVariantsMessage(variants);
    expect(msg).toContain("Какой вариант сохранить?");
    // both variants described
    expect(msg).toContain("1.");
    expect(msg).toContain("Тёплый");
    expect(msg).toContain("Тема: Квартира");
    expect(msg).toContain("Текст: Бронируйте");
    expect(msg).toContain("2.");
    expect(msg).toContain("Срочный");
    expect(msg).toContain("Тема: Последний день");
    expect(msg).toContain("Текст: Скидка уходит");
  });
});

describe("submitIntent assistant message", () => {
  it("appends a message that spells out each variant's title/text", async () => {
    const variants = [
      {
        id: "x1",
        name: "Вариант А",
        content: { kind: "email" as const, subject: "Тема А", body: "Текст А", sender: "Афина" },
        components: ["тема", "текст", "отправитель"],
      },
      {
        id: "x2",
        name: "Вариант Б",
        content: { kind: "sms" as const, text: "СМС текст Б", alphaName: "Bank", scheduledAt: "immediate" as const },
        components: ["текст", "отправитель"],
      },
    ];

    const appended: Array<{ role: string; text: string; pending?: boolean }> = [];
    const chat = {
      templateDrawer: { channel: "email" as const, variants: [] },
      append: (m: { role: string; text: string; pending?: boolean }) => appended.push(m),
      setTemplateIntent: () => {},
      setTemplateQuestion: () => {},
      setTemplateGenerating: () => {},
      setTemplateVariants: () => {},
    };

    const fetchMock = async () => ({
      ok: true,
      json: async () => ({
        variants: variants.map((v) => ({ name: v.name, content: v.content })),
      }),
    });
    const orig = globalThis.fetch;
    // @ts-expect-error test stub
    globalThis.fetch = fetchMock;

    try {
      await runSubmitIntent(chat, "хочу оффер");
    } finally {
      globalThis.fetch = orig;
    }

    // The non-pending assistant message after variants are ready.
    const ready = appended.filter((m) => m.role === "assistant" && !m.pending).at(-1);
    expect(ready).toBeDefined();
    const text = ready!.text;
    expect(text).toContain("Вариант А");
    expect(text).toContain("Тема А");
    expect(text).toContain("Текст А");
    expect(text).toContain("Вариант Б");
    expect(text).toContain("СМС текст Б");
  });
});
