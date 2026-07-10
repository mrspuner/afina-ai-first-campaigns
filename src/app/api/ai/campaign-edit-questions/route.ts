/**
 * POST /api/ai/campaign-edit-questions — уточняющие вопросы перед правкой кампании.
 * Принимает {editText, description}, возвращает {questions:[{prompt, options, allowFreeInput}]} (ровно 2).
 * Использует тот же провайдер/модель, что и оркестратор (/api/ai/assist).
 * Privacy: текст правки не логируем.
 */

import { generateText, tool } from "ai";
import { z } from "zod";
import {
  activeProviderId,
  providerKeyPresent,
  resolveModel,
} from "@/lib/ai/provider";
import { unstringifyJsonArgs } from "@/lib/ai/repair-tool-call";
import { starterEditQuestions } from "@/state/campaign-edit-starters";

const requestSchema = z.object({
  editText: z.string().min(1).max(1000),
  description: z.string().min(1).max(4000),
});

const QUESTION_COUNT = 2;

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
  const { editText, description } = parsed.data;

  // Без ключа провайдера — заготовленные вопросы, чтобы прототип не вставал.
  if (!providerKeyPresent(activeProviderId())) {
    return Response.json({ questions: starterEditQuestions() }, { status: 200 });
  }

  const system = [
    "Ты — AI-помощник продукта Афина (B2B marketing automation).",
    "Пользователь просит изменить уже собранную рекламную кампанию.",
    `Задай ровно ${QUESTION_COUNT} уточняющих вопроса, без которых правку нельзя применить однозначно.`,
    "Требования:",
    `  • Верни ровно ${QUESTION_COUNT} вопроса через инструмент ask_questions.`,
    "  • Каждый вопрос — {prompt: string, options: [{id, label}, …]} с 2–3 вариантами ответа.",
    "  • Вопросы опираются на описание цепочки: не спрашивай про то, чего в ней нет.",
    "  • Варианты — короткие, взаимоисключающие, на русском.",
    "  • id — латиницей, короткий, уникальный внутри вопроса.",
    "  • НЕ добавляй пояснений вне инструмента.",
  ].join("\n");

  const questions: Array<{ prompt: string; options: Array<{ id: string; label: string }> }> = [];

  try {
    await generateText({
      model: resolveModel(),
      system,
      prompt: `Как сейчас работает кампания:\n${description}\n\nПравка пользователя: ${editText}`,
      tools: {
        ask_questions: tool({
          description: "Вернуть уточняющие вопросы с вариантами ответа.",
          inputSchema: z.object({
            questions: z
              .array(
                z.object({
                  prompt: z.string(),
                  options: z
                    .array(z.object({ id: z.string(), label: z.string() }))
                    .min(2)
                    .max(3),
                })
              )
              .length(QUESTION_COUNT),
          }),
          execute: ({ questions: q }) => {
            questions.push(...q);
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

    if (questions.length === 0) {
      return Response.json({ questions: starterEditQuestions() }, { status: 200 });
    }
    // allowFreeInput — всегда: пользователь не должен быть заперт в вариантах.
    return Response.json(
      { questions: questions.map((q) => ({ ...q, allowFreeInput: true })) },
      { status: 200 }
    );
  } catch (err) {
    const s = String(err).toLowerCase();
    const rateLimited = s.includes("429") || s.includes("rate") || s.includes("quota");
    console.error(
      "[ai/campaign-edit-questions] LLM call failed:",
      rateLimited ? "rate-limited" : "ai-failed"
    );
    return Response.json({ questions: starterEditQuestions() }, { status: 200 });
  }
}
