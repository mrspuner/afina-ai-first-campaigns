"use client";

import { useCallback, useRef, useState } from "react";
import { useChat, type CampaignEditDrawerState, type TemplateQuestion } from "@/state/chat-context";

const QUESTIONS_URL = "/api/ai/campaign-edit-questions";

/** Спиннер держим не меньше этого времени, иначе анимацию не успевают прочитать. */
export const EDIT_DELAY_MS = 5000;

export const SPINNER_TEXT = "Исправляю кампанию";
export const DRAWER_HINT = "Есть несколько вопросов — посмотрите в открытом дровере";
export const ERROR_TEXT = "Не удалось разобрать правку — попробуйте ещё раз.";

/**
 * Детерминированная заглушка: правка НЕ применяется к графу. Ответы собираются,
 * но не отображаются — говорим об этом честно, а не делаем вид, что сработало.
 */
export const FINAL_REPLY =
  "Ответы принял, научусь их отображать позже, но я всё запомнил и кампания работает как вы просили, можете запускать.";

/** Фаза правки, которую отражает карточка кампании. */
export type EditPhase = "idle" | "working" | "asking";

// ── Чистый поток: запрос вопросов ────────────────────────────────────────────

export interface CampaignEditChat {
  append: (m: { role: "user" | "assistant"; text: string; pending?: boolean }) => void;
  openSidebar: () => void;
  openCampaignEdit: (campaignId: string, questions: TemplateQuestion[]) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Спрашивает у модели уточняющие вопросы по тексту правки и открывает ИИ-дровер.
 *
 * Модель получает текст правки и ТО ЖЕ человекочитаемое описание цепочки,
 * которое читает пользователь, — граф в JSON ей не нужен.
 *
 * Запрос и пауза идут параллельно: дровер открывается, когда завершились ОБА.
 * Так спиннер всегда успевают увидеть, но медленную модель мы не обрываем.
 */
export async function runCampaignEdit(
  chat: CampaignEditChat,
  args: { campaignId: string; editText: string; description: string },
  opts?: { delayMs?: number; signal?: AbortSignal },
): Promise<"asking" | "error" | "cancelled"> {
  const { campaignId, editText, description } = args;
  const delayMs = opts?.delayMs ?? EDIT_DELAY_MS;

  let questions: TemplateQuestion[];
  try {
    const [res] = await Promise.all([
      fetch(QUESTIONS_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ editText, description }),
        signal: opts?.signal,
      }),
      sleep(delayMs),
    ]);
    if (!res.ok) throw new Error("api");
    const json = (await res.json()) as { questions?: TemplateQuestion[] };
    questions = json.questions ?? [];
  } catch {
    return opts?.signal?.aborted ? "cancelled" : "error";
  }

  // Отмена могла случиться, пока летел запрос — дровер уже никому не нужен.
  if (opts?.signal?.aborted) return "cancelled";
  // Пустая очередь — это сломанный ответ, а не «вопросов нет»: открытый дровер
  // без вопросов оставил бы текст под блюром навсегда.
  if (!questions.length) return "error";

  chat.openSidebar();
  chat.append({ role: "user", text: editText });
  chat.openCampaignEdit(campaignId, questions);
  chat.append({ role: "assistant", text: questions[0].prompt });
  return "asking";
}

// ── Чистый поток: ответ на вопрос ────────────────────────────────────────────

export interface AnswerEditChat {
  campaignEditDrawer: CampaignEditDrawerState;
  append: (m: { role: "user" | "assistant"; text: string }) => void;
  answerCampaignEdit: (answer: string) => void;
  closeCampaignEdit: () => void;
}

/**
 * Принимает ответ на текущий вопрос: публикует реплику пользователя, двигает
 * очередь и либо задаёт следующий вопрос, либо закрывает поток заглушкой.
 * Граф и шаблоны не трогаются ни на одном шаге.
 */
export function answerEditQuestion(chat: AnswerEditChat, answer: string): "next" | "done" {
  const { questions, index } = chat.campaignEditDrawer;
  // Очередь исчерпана — отвечать не на что; молча выходим, не дублируя заглушку.
  if (!questions[index]) return "done";

  chat.append({ role: "user", text: answer });
  chat.answerCampaignEdit(answer);

  const next = questions[index + 1];
  if (next) {
    chat.append({ role: "assistant", text: next.prompt });
    return "next";
  }
  chat.append({ role: "assistant", text: FINAL_REPLY });
  chat.closeCampaignEdit();
  return "done";
}

/**
 * Ответ выбором чипа: в историю уходит ПОДПИСЬ опции, а не её технический id.
 * Неизвестный id (рассинхрон пикера и очереди) пропускаем как есть — поток
 * важнее строгости.
 */
export function answerEditOption(chat: AnswerEditChat, optionId: string): "next" | "done" {
  const { questions, index } = chat.campaignEditDrawer;
  const current = questions[index];
  if (!current) return "done";
  const label = current.options.find((o) => o.id === optionId)?.label ?? optionId;
  return answerEditQuestion(chat, label);
}

// ── Хук для карточки кампании ────────────────────────────────────────────────

/**
 * Оркестрирует фазу правки на карточке: спиннер → вопросы в дровере → снятие
 * блюра. Ответы принимает `PromptComposer` через `answerEditQuestion`, поэтому
 * здесь мы лишь следим, когда слой закрылся (ответили до конца или отменили).
 */
export function useCampaignEditFlow(campaignId: string, description: string) {
  const chat = useChat();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Фаза ВЫВОДИТСЯ, а не хранится: открытость слоя — уже источник правды.
  // Последний ответ (или «Отмена») закрывает слой → блюр снимается сам, без
  // синхронизирующего эффекта, который мог бы разъехаться со стейтом чата.
  const phase: EditPhase = working
    ? "working"
    : chat.campaignEditDrawer.open
      ? "asking"
      : "idle";

  const submit = useCallback(
    async (editText: string) => {
      setError(null);
      setWorking(true);
      const controller = new AbortController();
      abortRef.current = controller;
      const result = await runCampaignEdit(
        chat,
        { campaignId, editText, description },
        { signal: controller.signal },
      );
      // На успехе дровер уже открыт → phase сам станет «asking».
      setWorking(false);
      if (result === "error") setError(ERROR_TEXT);
    },
    [chat, campaignId, description],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    chat.closeCampaignEdit();
    setError(null);
    setWorking(false);
  }, [chat]);

  return { phase, error, submit, cancel };
}
