/**
 * POST /api/ai/create-template — генерация вариантов шаблона (#15).
 * Принимает {channel, intent}, возвращает {variants:[{name,content}]} (~3 штуки).
 * Использует тот же провайдер/модель, что и оркестратор (/api/ai/assist).
 * Privacy: intent не логируем.
 */

import { generateText, tool } from "ai";
import { z } from "zod";
import {
  activeProviderId,
  providerKeyPresent,
  resolveModel,
} from "@/lib/ai/provider";
import { unstringifyJsonArgs } from "@/lib/ai/repair-tool-call";
import { starterTemplateVariants } from "@/state/template-starters";

const requestSchema = z.object({
  channel: z.enum(["sms", "email", "push", "ivr"]),
  intent: z.string().min(1).max(1000),
});

const CHANNEL_SYSTEM_HINTS: Record<string, string> = {
  sms: "SMS: text (до 160 символов), alphaName (короткое имя отправителя, до 11 символов), scheduledAt: \"immediate\".",
  email: "Email: subject (тема), body (HTML-текст письма), sender (имя отправителя), опционально link (URL).",
  push: "Push-уведомление: title (заголовок, до 50 символов), body (текст, до 120 символов), опционально deeplink.",
  ivr: "IVR-звонок: scenario (текст сценария голосового обзвона), voiceType: \"male\" | \"female\" | \"neutral\".",
};

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = requestSchema.safeParse(await request.json());
  } catch {
    return Response.json({ error: "invalid-json" }, { status: 400 });
  }
  if (!parsed.success) {
    return Response.json({ error: "invalid-request" }, { status: 400 });
  }
  const { channel, intent } = parsed.data;

  // Block 7 §5 — без AI-ключа отдаём стартовые варианты из пресетов канала
  // (осиротевшие тексты шаблонов), чтобы создание шаблона работало в прототипе.
  if (!providerKeyPresent(activeProviderId())) {
    return Response.json({ variants: starterTemplateVariants(channel) }, { status: 200 });
  }

  const hint = CHANNEL_SYSTEM_HINTS[channel] ?? "";
  const system = [
    "Ты — AI-помощник продукта Афина (B2B marketing automation).",
    `Создай ровно 3 варианта сообщения для канала «${channel.toUpperCase()}».`,
    "Контекст канала: " + hint,
    "Требования:",
    "  • Верни ровно 3 варианта через инструмент create_variants.",
    "  • Каждый вариант — объект {name: string, content: {...поля канала}}.",
    "  • content.kind ОБЯЗАТЕЛЬНО = \"" + channel + "\".",
    "  • Варианты различаются тоном и формулировкой.",
    "  • Пиши по-русски, профессионально, без клише.",
    "  • НЕ добавляй пояснений вне инструмента.",
  ].join("\n");

  const variants: Array<{ name: string; content: Record<string, unknown> }> = [];

  try {
    await generateText({
      model: resolveModel(),
      system,
      prompt: "Создай 3 варианта: " + intent,
      tools: {
        create_variants: tool({
          description: "Вернуть 3 готовых варианта шаблона сообщения.",
          inputSchema: z.object({
            variants: z.array(
              z.object({
                name: z.string(),
                content: z.record(z.string(), z.unknown()),
              })
            ).length(3),
          }),
          execute: ({ variants: v }) => {
            variants.push(...v);
            return "ok" as const;
          },
        }),
      },
      toolChoice: "required",
      experimental_repairToolCall: async ({ toolCall }) => {
        const repaired = unstringifyJsonArgs(toolCall.input);
        return repaired ? { ...toolCall, input: repaired } : null;
      },
    });

    if (variants.length === 0) {
      // Block 7 §5 — пустой результат AI → стартовые варианты из пресетов.
      return Response.json({ variants: starterTemplateVariants(channel) }, { status: 200 });
    }
    return Response.json({ variants }, { status: 200 });
  } catch (err) {
    const s = String(err).toLowerCase();
    const rateLimited = s.includes("429") || s.includes("rate") || s.includes("quota");
    console.error("[ai/create-template] LLM call failed:", rateLimited ? "rate-limited" : "ai-failed");
    // Block 7 §5 — AI недоступен → стартовые варианты из пресетов канала.
    return Response.json({ variants: starterTemplateVariants(channel) }, { status: 200 });
  }
}
