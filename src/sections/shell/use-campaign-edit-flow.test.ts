import { describe, it, expect, vi } from "vitest";
import {
  runCampaignEdit,
  answerEditQuestion,
  answerEditOption,
  FINAL_REPLY,
  type CampaignEditChat,
  type AnswerEditChat,
} from "./use-campaign-edit-flow";
import type { TemplateQuestion } from "@/state/chat-context";

const Q1: TemplateQuestion = {
  prompt: "Какой канал оставить?",
  allowFreeInput: true,
  options: [{ id: "email", label: "Только Email" }],
};
const Q2: TemplateQuestion = {
  prompt: "Менять ли паузу?",
  allowFreeInput: true,
  options: [{ id: "keep", label: "Оставить 2 дня" }],
};

type Appended = { role: "user" | "assistant"; text: string; pending?: boolean };

function makeChat() {
  const appended: Appended[] = [];
  const opened: Array<{ campaignId: string; questions: TemplateQuestion[] }> = [];
  const chat: CampaignEditChat = {
    append: (m) => appended.push(m),
    openSidebar: vi.fn(),
    openCampaignEdit: (campaignId, questions) => opened.push({ campaignId, questions }),
  };
  return { chat, appended, opened };
}

function stubFetch(impl: () => Promise<unknown>) {
  const orig = globalThis.fetch;
  globalThis.fetch = impl as unknown as typeof fetch;
  return () => {
    globalThis.fetch = orig;
  };
}

const ARGS = {
  campaignId: "cmp_1",
  editText: "убери sms",
  description: "Старт. База проходит скоринг.",
};

describe("runCampaignEdit", () => {
  it("на успехе открывает дровер с очередью вопросов и задаёт первый", async () => {
    const { chat, appended, opened } = makeChat();
    const restore = stubFetch(async () => ({
      ok: true,
      json: async () => ({ questions: [Q1, Q2] }),
    }));
    try {
      const result = await runCampaignEdit(chat, ARGS, { delayMs: 0 });
      expect(result).toBe("asking");
    } finally {
      restore();
    }

    expect(chat.openSidebar).toHaveBeenCalled();
    expect(opened).toHaveLength(1);
    expect(opened[0].campaignId).toBe("cmp_1");
    expect(opened[0].questions).toHaveLength(2);
    // Реплика пользователя и первый вопрос ассистента попадают в историю.
    expect(appended[0]).toMatchObject({ role: "user", text: "убери sms" });
    expect(appended.at(-1)).toMatchObject({ role: "assistant", text: Q1.prompt });
  });

  it("отправляет модели текст правки и описание цепочки", async () => {
    const { chat } = makeChat();
    let body: unknown;
    const restore = stubFetch(async (...args: unknown[]) => {
      body = JSON.parse((args[1] as { body: string }).body);
      return { ok: true, json: async () => ({ questions: [Q1, Q2] }) };
    });
    try {
      await runCampaignEdit(chat, ARGS, { delayMs: 0 });
    } finally {
      restore();
    }
    expect(body).toEqual({
      editText: "убери sms",
      description: "Старт. База проходит скоринг.",
    });
  });

  it("не открывает дровер, когда роут ответил ошибкой", async () => {
    const { chat, opened } = makeChat();
    const restore = stubFetch(async () => ({ ok: false, json: async () => ({}) }));
    try {
      expect(await runCampaignEdit(chat, ARGS, { delayMs: 0 })).toBe("error");
    } finally {
      restore();
    }
    expect(opened).toHaveLength(0);
    expect(chat.openSidebar).not.toHaveBeenCalled();
  });

  it("пустая очередь вопросов — это ошибка, а не пустой дровер", async () => {
    const { chat, opened } = makeChat();
    const restore = stubFetch(async () => ({ ok: true, json: async () => ({ questions: [] }) }));
    try {
      expect(await runCampaignEdit(chat, ARGS, { delayMs: 0 })).toBe("error");
    } finally {
      restore();
    }
    expect(opened).toHaveLength(0);
  });

  it("выдерживает паузу перед открытием дровера, даже если модель ответила мгновенно", async () => {
    vi.useFakeTimers();
    const { chat, opened } = makeChat();
    const restore = stubFetch(async () => ({ ok: true, json: async () => ({ questions: [Q1] }) }));
    try {
      const promise = runCampaignEdit(chat, ARGS, { delayMs: 5000 });
      // Спиннер ещё крутится: дровер не открыт.
      await vi.advanceTimersByTimeAsync(4000);
      expect(opened).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1000);
      expect(await promise).toBe("asking");
      expect(opened).toHaveLength(1);
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it("отмена через AbortSignal не открывает дровер", async () => {
    const { chat, opened } = makeChat();
    const ac = new AbortController();
    const restore = stubFetch(async () => {
      ac.abort();
      return { ok: true, json: async () => ({ questions: [Q1] }) };
    });
    try {
      expect(await runCampaignEdit(chat, ARGS, { delayMs: 0, signal: ac.signal })).toBe("cancelled");
    } finally {
      restore();
    }
    expect(opened).toHaveLength(0);
  });
});

function makeAnswerChat(index: number, questions: TemplateQuestion[]) {
  const appended: Appended[] = [];
  const answered: string[] = [];
  const closed = vi.fn();
  const chat: AnswerEditChat = {
    campaignEditDrawer: { open: true, campaignId: "cmp_1", questions, index, answers: [] },
    append: (m) => appended.push(m),
    answerCampaignEdit: (a) => answered.push(a),
    closeCampaignEdit: closed,
  };
  return { chat, appended, answered, closed };
}

describe("answerEditOption", () => {
  it("подставляет подпись выбранной опции, а не её id", () => {
    const { chat, appended, answered } = makeAnswerChat(0, [Q1, Q2]);
    expect(answerEditOption(chat, "email")).toBe("next");
    expect(answered).toEqual(["Только Email"]);
    expect(appended[0]).toMatchObject({ role: "user", text: "Только Email" });
  });

  it("неизвестный id не роняет поток — уходит как есть", () => {
    const { chat, answered } = makeAnswerChat(0, [Q1, Q2]);
    expect(answerEditOption(chat, "нет-такого")).toBe("next");
    expect(answered).toEqual(["нет-такого"]);
  });

  it("без активного вопроса ничего не делает", () => {
    const { chat, answered, appended } = makeAnswerChat(2, [Q1, Q2]);
    expect(answerEditOption(chat, "email")).toBe("done");
    expect(answered).toEqual([]);
    expect(appended).toEqual([]);
  });
});

describe("answerEditQuestion", () => {
  it("после первого ответа задаёт второй вопрос", () => {
    const { chat, appended, answered } = makeAnswerChat(0, [Q1, Q2]);
    expect(answerEditQuestion(chat, "Только Email")).toBe("next");
    expect(answered).toEqual(["Только Email"]);
    expect(appended[0]).toMatchObject({ role: "user", text: "Только Email" });
    expect(appended.at(-1)).toMatchObject({ role: "assistant", text: Q2.prompt });
  });

  it("после последнего ответа выдаёт детерминированную заглушку и закрывает слой", () => {
    const { chat, appended, closed } = makeAnswerChat(1, [Q1, Q2]);
    expect(answerEditQuestion(chat, "Оставить 2 дня")).toBe("done");
    expect(appended.at(-1)).toMatchObject({ role: "assistant", text: FINAL_REPLY });
    expect(closed).toHaveBeenCalled();
  });

  it("финальная заглушка обещает запуск и признаётся, что ответы не отображаются", () => {
    expect(FINAL_REPLY).toContain("научусь их отображать позже");
    expect(FINAL_REPLY).toContain("можете запускать");
  });
});
