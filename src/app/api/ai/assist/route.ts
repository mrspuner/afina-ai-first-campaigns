/**
 * POST /api/ai/assist — оркестратор: единая точка входа всех AI-запросов.
 * Модель выбирает инструмент из зарегистрированных; набор инструментов
 * фильтруется по context.screen (планы 005/006 расширяют набор).
 * Privacy: текст, история (≤8), сводка моковых данных. Не логировать тексты.
 */

import { generateText, tool } from "ai";
import { z } from "zod";
import {
  assistRequestSchema,
  type AssistResult,
} from "@/lib/ai/assist-contract";
import {
  activeProviderId,
  providerKeyPresent,
  resolveModel,
} from "@/lib/ai/provider";
import { unstringifyJsonArgs } from "@/lib/ai/repair-tool-call";
import {
  buildSystemPrompt,
  buildMessages,
} from "@/lib/ai/orchestrator-prompt";
import { rebuildGraphSchema } from "@/lib/ai/rebuild-schema";
import { wireOpSchema, toStructuralOps } from "@/lib/ai/ops-wire-schema";
import { statsPatchSchema } from "@/lib/ai/stats-patch-schema";
import { wireNavigateSchema, toNavigateTarget } from "@/lib/ai/navigate-schema";

export function GET() {
  return Response.json({
    available: providerKeyPresent(activeProviderId()),
  });
}

export async function POST(request: Request) {
  // Проверяем наличие ключа активного провайдера до разбора тела — быстрый
  // путь к fallback.
  if (!providerKeyPresent(activeProviderId())) {
    return Response.json({ error: "no-key" }, { status: 503 });
  }

  // Разбираем тело запроса защитно
  let parsed;
  try {
    parsed = assistRequestSchema.safeParse(await request.json());
  } catch {
    return Response.json({ error: "invalid-json" }, { status: 400 });
  }
  if (!parsed.success) {
    return Response.json({ error: "invalid-request" }, { status: 400 });
  }
  const { text, history, context } = parsed.data;

  // Результаты: execute вызванных инструментов пушат в массив; максимум 2.
  // Пост-обработчик добавит {kind:"none"} если ни один инструмент не был вызван.
  const results: AssistResult[] = [];

  // Флаг: инструменты графа регистрируются только на экране workflow с графом.
  const onWorkflow = context.screen === "workflow" && Boolean(context.graph);

  // Сигнатура tool() в ai@6 / @ai-sdk/provider-utils: поле схемы — inputSchema
  // (не parameters). toolChoice: "required" поддержан типом ToolChoice<TOOLS>.
  // execute может быть синхронным (возвращает OUTPUT напрямую).
  const tools = {
    answer: tool({
      description:
        "Ответить пользователю текстом: на вопрос по данным, по продукту, " +
        "или честно сказать, что не понял. Единственный способ говорить с пользователем.",
      inputSchema: z.object({
        text: z.string().describe("Ответ, 1–3 предложения, в голосе продукта"),
      }),
      execute: ({ text: answerText }) => {
        results.push({ kind: "answer", text: answerText });
        return "ok" as const;
      },
    }),
    clarify: tool({
      description:
        "Задать 1–2 уточняющих вопроса, когда запрос неоднозначен. " +
        "Только один раунд: если в истории уже есть твои вопросы — не вызывай повторно.",
      inputSchema: z.object({
        questions: z.array(z.string()).min(1).max(2),
      }),
      execute: ({ questions }) => {
        results.push({ kind: "clarify", questions });
        return "ok" as const;
      },
    }),
    // configure_stats — перенастройка таблицы статистики (план 006)
    configure_stats: tool({
      description:
        "Перенастроить таблицу статистики: группировка строк (rows), сортировка, " +
        "период, число строк. Используй для просьб «покажи/разбей/отсортируй/за <период>» " +
        "про статистику. Передавай только меняемые поля (минимум одно). " +
        "confirmation — короткая фраза, что сделал («Разбил по каналам за май»).",
      inputSchema: z.object({ patch: statsPatchSchema, confirmation: z.string() }),
      execute: ({ patch, confirmation }) => {
        results.push({ kind: "stats", patch, confirmation });
        return "ok" as const;
      },
    }),
    // navigate — переход к разделу/кампании/сигналу (план 006)
    navigate: tool({
      description:
        "Перейти к разделу, кампании или сигналу («покажи кампании», «открой статистику»). " +
        "Кампанию/сигнал адресуй по id из данных аккаунта. Если просят И открыть, И " +
        "настроить статистику — вызови navigate, затем configure_stats (в этом порядке). " +
        "Менять граф воркфлоу другой кампании нельзя: вызови navigate и скажи в answer, " +
        "что правку нужно повторить на открывшемся экране.",
      inputSchema: z.object({ target: wireNavigateSchema, confirmation: z.string() }),
      execute: ({ target, confirmation }) => {
        const strict = toNavigateTarget(target);
        if (strict) results.push({ kind: "navigate", target: strict, confirmation });
        return "ok" as const;
      },
    }),
    // Инструменты графа — только на экране workflow с заполненным graph (план 005)
    ...(onWorkflow
      ? {
          edit_workflow: tool({
            description:
              "Изменить текущий граф воркфлоу операциями add/remove/replace. " +
              "ref/refA/refB — id ноды из контекста графа (значение в квадратных скобках, напр. n2). " +
              "Сам сопоставь формулировку пользователя (склонения, синонимы, описание, подпись/сабтлейбл) " +
              "с нужной нодой и подставь её id. " +
              "ВАЖНО про неоднозначность: если под формулировку подходит НЕСКОЛЬКО нод (напр. две ноды " +
              "одного типа), а пользователь не указал явно, какую именно (по подписи/порядку/«все») — " +
              "НЕ применяй правку ко всем и не угадывай: вызови вместо edit_workflow инструмент clarify " +
              "с коротким вопросом, какую из нод он имеет в виду. Применяй ко всем подходящим, только " +
              "если пользователь явно сказал «все/обе». " +
              'Пример (однозначно): убрать СМС и добавить пуш после письма → ops: [{"kind":"remove","ref":"n4"},{"kind":"add","nodeType":"push","placementMode":"after","ref":"n2"}]. ' +
              'Пример (неоднозначно): в графе две ноды СМС [n4] и [n7], пользователь сказал «убери смс» без уточнения — НЕ вызывай edit_workflow, вызови clarify с вопросом, например «Какую СМС убрать — первую или вторую?».' +
              ' Для ветвления (условие YES/NO) используй op kind:"addCondition" с ref — это нода с ОДНИМ выходом, после которой вставится Условие: текущий поток станет веткой YES, и добавится ветка NO (по умолчанию в Конец). Метки веток можно задать через yesLabel/noLabel.' +
              ' Пример: «после первой СМС развилку: открыл — успех, нет — стоп» → ops: [{"kind":"addCondition","ref":"n4","yesLabel":"Открыл","noLabel":"Не открыл"}].',
            inputSchema: z.object({ ops: z.array(wireOpSchema).min(1) }),
            execute: ({ ops }) => {
              const structural = toStructuralOps(ops);
              // Пушим только если есть валидные структурные операции;
              // пустой результат не пушим — общий пост-обработчик добавит none.
              if (structural.length > 0) {
                results.push({ kind: "workflow-ops", ops: structural });
              }
              return "ok" as const;
            },
          }),
          rebuild_workflow: tool({
            description:
              "Пересобрать граф ЦЕЛИКОМ по описанию пользователя. Используй только " +
              "когда просят собрать заново/с нуля. Форма: вход-сигнал уже есть, ты " +
              "описываешь середину (каналы, паузы, условия) и два исхода: success и end. " +
              "В assumptions перечисли принятые допущения одним-двумя предложениями.",
            inputSchema: rebuildGraphSchema,
            execute: (spec) => {
              results.push({ kind: "rebuild", spec });
              return "ok" as const;
            },
          }),
        }
      : {}),
    // edit_node_params — дополнительно, если выбрана нода
    ...(onWorkflow && context.selectedNode
      ? {
          edit_node_params: tool({
            description:
              `Изменить параметры выбранной ноды «${context.selectedNode.label}» ` +
              `(тип ${context.selectedNode.nodeType}). patch — только изменяемые поля ` +
              "параметров этого типа ноды; confirmation — короткая фраза, что поменял.",
            inputSchema: z.object({
              patch: z.record(z.string(), z.unknown()),
              confirmation: z.string(),
            }),
            execute: ({ patch, confirmation }) => {
              results.push({
                kind: "node-params",
                nodeId: context.selectedNode!.id,
                patch,
                confirmation,
              });
              return "ok" as const;
            },
          }),
        }
      : {}),
    // undo_last — только если есть доступный откат
    ...(onWorkflow && context.undoAvailable
      ? {
          undo_last: tool({
            description:
              "Откатить последнее AI-изменение графа («откати», «верни как было»).",
            inputSchema: z.object({}),
            execute: () => {
              results.push({ kind: "undo" });
              return "ok" as const;
            },
          }),
        }
      : {}),
    // edit_triggers — только если есть активный триггер (план 006)
    ...(context.activeTrigger
      ? {
          edit_triggers: tool({
            description:
              `Изменить домены триггера «${context.activeTrigger.label}»: add — добавить ` +
              "домены, exclude — исключить; clearAdded/clearExcluded — снять все ручные " +
              "добавления/исключения. Понимай любые формулировки («убери всё что я добавлял»).",
            inputSchema: z.object({
              add: z.array(z.string()),
              exclude: z.array(z.string()),
              clearAdded: z.boolean().optional(),
              clearExcluded: z.boolean().optional(),
              confirmation: z.string(),
            }),
            execute: (args) => {
              results.push({ kind: "triggers", ...args });
              return "ok" as const;
            },
          }),
        }
      : {}),
  };

  // Модель активного провайдера (deepseek по умолчанию, google по env).
  // Дефолты id и выбор — в @/lib/ai/provider.
  try {
    await generateText({
      model: resolveModel(),
      system: buildSystemPrompt(context),
      messages: buildMessages(history, text),
      tools,
      toolChoice: "required",
      // DeepSeek иногда присылает вложенные tool-аргументы JSON-строкой —
      // чиним до валидации (no-op для провайдеров, шлющих объекты, напр. Gemini).
      experimental_repairToolCall: async ({ toolCall }) => {
        const repaired = unstringifyJsonArgs(toolCall.input);
        return repaired ? { ...toolCall, input: repaired } : null;
      },
    });
    // Текст запроса и ответ модели не логируем — privacy-граница
    if (results.length === 0) results.push({ kind: "none" });
    return Response.json({ results: results.slice(0, 2) }, { status: 200 });
  } catch (err) {
    const s = String(err).toLowerCase();
    const rateLimited =
      s.includes("429") || s.includes("rate") || s.includes("quota");
    // Логируем только тип ошибки, без текста запроса
    console.error(
      "[ai/assist] LLM call failed:",
      rateLimited ? "rate-limited" : "ai-failed"
    );
    return Response.json(
      { error: rateLimited ? "rate-limited" : "ai-failed" },
      { status: 502 }
    );
  }
}
