"use client";

import { useCallback } from "react";
import { nanoid } from "nanoid";
import type { Channel } from "@/types/campaign";
import { CHANNEL_LABEL } from "@/sections/campaigns/campaign-cost";
import { useChat, type TemplateDrawerVariant, type TemplateQuestion } from "@/state/chat-context";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { templateComponentLabels } from "@/state/template-components";

const CHANNELS: Channel[] = ["sms", "email", "push", "ivr"];
const TEMPLATE_GENERATE_URL = "/api/ai/create-template";

/** Сообщение-намерение. Публикуется реактивным эффектом в PromptComposer —
 *  единственный источник (см. #7). Экспортируется, чтобы не дублировать литерал. */
export const INTENT_PROMPT = "Опишите, что нужно донести клиенту — тему, оффер или тон.";

/** Закрытый вопрос выбора канала (#14): 4 опции, без свободного ввода. */
export function channelQuestion(): TemplateQuestion {
  return {
    prompt: "Для какого канала создаём шаблон?",
    allowFreeInput: false,
    options: CHANNELS.map((ch) => ({ id: ch, label: CHANNEL_LABEL[ch] })),
  };
}

/** Открытый вопрос выбора варианта (#14) с составом компонентов (#15). */
export function variantQuestion(variants: TemplateDrawerVariant[]): TemplateQuestion {
  return {
    prompt: "Выберите вариант шаблона",
    allowFreeInput: true,
    options: variants.map((v) => ({ id: v.id, label: v.name, components: v.components })),
  };
}

/** Убирает HTML-теги из значения поля и схлопывает пробелы (#8). */
export function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Человекочитаемое описание одного варианта (#8): заголовок «**<n>. <имя>**»
 * жирным на своей строке, затем поля Тема/Текст (по каналу) — каждое на своей
 * строке. HTML из значений вычищается; текст выводится полностью. Формат —
 * markdown (жирный через **), рендерится Streamdown в чате.
 */
export function describeVariant(variant: TemplateDrawerVariant, index: number): string {
  const { content } = variant;
  const lines: string[] = [`**${index}. ${variant.name}**`];
  switch (content.kind) {
    case "email":
      lines.push(`Тема: ${stripHtml(content.subject)}`, `Текст: ${stripHtml(content.body)}`);
      break;
    case "sms":
      lines.push(`Текст: ${stripHtml(content.text)}`);
      break;
    case "push":
      lines.push(`Заголовок: ${stripHtml(content.title)}`, `Текст: ${stripHtml(content.body)}`);
      break;
    case "ivr":
      lines.push(`Сценарий: ${stripHtml(content.scenario)}`);
      break;
    default:
      lines.push(variant.components.join(", "));
  }
  return lines.join("\n");
}

/**
 * Сообщение ассистента после генерации (#8): подсказка выбора + описания всех
 * вариантов, между вариантами — пустая строка. Markdown (см. describeVariant).
 */
export function buildVariantsMessage(variants: TemplateDrawerVariant[]): string {
  const blocks = variants.map((v, i) => describeVariant(v, i + 1));
  return `Готово. Какой вариант сохранить?\n\n${blocks.join("\n\n")}`;
}

/** Минимальный контракт чата, нужный потоку submitIntent (для тестируемости). */
export interface SubmitIntentChat {
  templateDrawer: { channel: Channel | null; variants: TemplateDrawerVariant[] };
  /** Возвращает id созданного сообщения (нужен для updatePending). */
  append: (m: { role: "user" | "assistant"; text: string; pending?: boolean }) => string;
  updatePending: (id: string, text: string, format?: "markdown") => void;
  setTemplateIntent: (intent: string) => void;
  setTemplateQuestion: (q: TemplateQuestion | null) => void;
  setTemplateGenerating: (v: boolean) => void;
  setTemplateVariants: (variants: TemplateDrawerVariant[]) => void;
}

/**
 * Чистая (не-React) реализация потока намерения → генерация вариантов (#28).
 * Вынесена из useCallback, чтобы покрыть тестами без рендера хука: на успехе
 * добавляет сообщение ассистента, перечисляющее заголовки/тексты каждого
 * варианта (buildVariantsMessage), и ставит вопрос выбора.
 */
export async function runSubmitIntent(chat: SubmitIntentChat, intent: string): Promise<void> {
  const channel = chat.templateDrawer.channel;
  if (!channel || !intent.trim()) return;
  chat.append({ role: "user", text: intent });
  chat.setTemplateIntent(intent);
  chat.setTemplateQuestion(null);
  chat.setTemplateGenerating(true);
  // pending-пузырёк «думания»; резолвим ЕГО же в ответ (#11), а не плодим новое
  // сообщение — иначе точки зависают над вариантами.
  const pendingId = chat.append({ role: "assistant", text: "Готовлю варианты…", pending: true });
  try {
    const res = await fetch(TEMPLATE_GENERATE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel, intent }),
    });
    if (!res.ok) throw new Error("api");
    const json = (await res.json()) as {
      variants?: Array<{ name: string; content: Record<string, unknown> }>;
    };
    const variants: TemplateDrawerVariant[] = (json.variants ?? []).map((v) => {
      const content = v.content as TemplateDrawerVariant["content"];
      return {
        id: nanoid(6),
        name: v.name,
        content,
        components: templateComponentLabels(content),
      };
    });
    chat.setTemplateVariants(variants);
    chat.updatePending(pendingId, buildVariantsMessage(variants), "markdown");
    chat.setTemplateQuestion(variantQuestion(variants));
  } catch {
    chat.updatePending(pendingId, "Не удалось сгенерировать. Попробуйте ещё раз.");
    chat.setTemplateQuestion(null);
  } finally {
    chat.setTemplateGenerating(false);
  }
}

/**
 * Оркестратор потока создания/предпросмотра шаблона в чат-дровере (#14).
 * Каждый шаг публикует вопрос ассистента через chat.append и ставит активный
 * вопрос пикера через setTemplateQuestion. Ответ продвигает state-машину
 * channel → intent → variants. На variants вызывается API create-template,
 * ответ мапится в TemplateDrawerVariant[] с components через
 * templateComponentLabels (#15).
 */
export function useTemplateFlow() {
  const chat = useChat();
  const { templates } = useAppState();
  const dispatch = useAppDispatch();

  /** Старт с шага выбора канала (кнопка «Создать шаблон»). */
  const start = useCallback(() => {
    chat.openSidebar();
    chat.openTemplateDrawer();
    chat.append({ role: "assistant", text: "Для какого канала создаём шаблон?" });
    chat.setTemplateQuestion(channelQuestion());
  }, [chat]);

  /**
   * Старт сразу с шага намерения для уже выбранного канала (шов блока 5).
   * Намеренческое сообщение публикует реактивный эффект в PromptComposer —
   * единая точка как для этого хелпера, так и для прямого
   * chat.openTemplateCreate(channel) из блока 5.
   */
  const startForChannel = useCallback(
    (channel: Channel) => {
      chat.openSidebar();
      chat.openTemplateCreate(channel);
    },
    [chat]
  );

  /** Предпросмотр готового шаблона по id (шов блока 5): read-only, без сохранения. */
  const startPreview = useCallback(
    (templateId: string) => {
      chat.openSidebar();
      chat.openTemplatePreview(templateId);
      const tpl = templates.find((t) => t.id === templateId);
      if (!tpl) {
        chat.append({ role: "assistant", text: "Шаблон не найден." });
        return;
      }
      const makeup = templateComponentLabels(tpl.content).join(" · ");
      chat.append({
        role: "assistant",
        text: `Шаблон «${tpl.name}» (${CHANNEL_LABEL[tpl.channel]}). Состав: ${makeup}.`,
      });
      chat.setTemplateQuestion(null);
    },
    [chat, templates]
  );

  /** Ответ на вопрос канала → шаг намерения. */
  const answerChannel = useCallback(
    (channel: Channel) => {
      chat.append({ role: "user", text: CHANNEL_LABEL[channel] });
      chat.setTemplateChannel(channel);
      // INTENT_PROMPT НЕ публикуем здесь — его шлёт реактивный эффект в
      // PromptComposer при переходе шага в intent. Иначе — дубль (#7).
      chat.setTemplateQuestion(null);
    },
    [chat]
  );

  /** Свободный текст намерения → генерация вариантов. */
  const submitIntent = useCallback((intent: string) => runSubmitIntent(chat, intent), [chat]);

  /** Выбор варианта → сохранить шаблон и закрыть поток. */
  const selectVariant = useCallback(
    (id: string) => {
      const v = chat.templateDrawer.variants.find((x) => x.id === id);
      if (!v || !chat.templateDrawer.channel) return;
      dispatch({
        type: "template_added",
        template: {
          id: `tpl_${nanoid(8)}`,
          channel: chat.templateDrawer.channel,
          name: v.name,
          content: v.content,
          usedInCampaigns: 0,
        },
      });
      chat.append({ role: "assistant", text: `Шаблон «${v.name}» сохранён.` });
      chat.closeTemplateDrawer();
    },
    [chat, dispatch]
  );

  return { start, startForChannel, startPreview, answerChannel, submitIntent, selectVariant };
}
