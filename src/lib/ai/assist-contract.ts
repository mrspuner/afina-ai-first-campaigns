import { z } from "zod";
import { structuralOpSchema } from "@/lib/ai-workflow-schema";
import { rebuildGraphSchema } from "./rebuild-schema";
import { statsPatchSchema } from "./stats-patch-schema";

/** Сообщение истории сессии (последние N из chat-context). */
export const historyMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
});
export type HistoryMessage = z.infer<typeof historyMessageSchema>;

/** Краткое описание ноды графа — без params (privacy-граница и токен-бюджет). */
export const graphNodeSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  nodeType: z.string(),
  sublabel: z.string().optional(),
});
export type GraphNodeSummary = z.infer<typeof graphNodeSummarySchema>;

/** Контекст момента — собирает клиент, расширяется планами 005/006. */
export const assistContextSchema = z.object({
  screen: z.string(), // "section:Статистика" | "workflow" | "guided-campaign:2" | ...
  dataSummary: z.string(), // компактный текст из data-summary.ts
  /** Компактная сводка текущего графа воркфлоу (план 005). */
  graph: z.object({
    nodes: z.array(graphNodeSummarySchema),
    edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })),
  }).optional(),
  /** Выбранная нода (если пользователь кликнул на ноду). */
  selectedNode: graphNodeSummarySchema.optional(),
  /** Есть ли доступное действие undo. */
  undoAvailable: z.boolean().optional(),
  /** Текущий шаг визарда (план 006). */
  wizardStep: z.object({ step: z.number(), title: z.string() }).optional(),
  /** Активный триггер (план 006). */
  activeTrigger: z.object({ id: z.string(), label: z.string() }).optional(),
});
export type AssistContext = z.infer<typeof assistContextSchema>;

export const assistRequestSchema = z.object({
  text: z.string().min(1),
  history: z.array(historyMessageSchema).max(8),
  context: assistContextSchema,
});
export type AssistRequest = z.infer<typeof assistRequestSchema>;

/** Результат: какой инструмент вызвала модель. Планы 005/006 добавляют kind'ы. */
export const assistResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("answer"), text: z.string() }),
  z.object({ kind: z.literal("clarify"), questions: z.array(z.string()).min(1).max(2) }),
  z.object({ kind: z.literal("none") }), // модель не вызвала инструмент
  /** Структурные операции над графом (план 005). */
  z.object({ kind: z.literal("workflow-ops"), ops: z.array(structuralOpSchema) }),
  /** Патч параметров конкретной ноды (план 005). */
  z.object({
    kind: z.literal("node-params"),
    nodeId: z.string(),
    patch: z.record(z.string(), z.unknown()), // Partial<NodeParams>; точную форму гарантирует сервер
    confirmation: z.string(),
  }),
  /** Откат последнего действия (план 005). */
  z.object({ kind: z.literal("undo") }),
  /** Полная пересборка графа по спецификации модели (план 005). */
  z.object({ kind: z.literal("rebuild"), spec: rebuildGraphSchema }),
  /** Патч фильтров таблицы статистики (план 006). */
  z.object({ kind: z.literal("stats"), patch: statsPatchSchema, confirmation: z.string() }),
  /**
   * Навигация к разделу/кампании (план 006).
   * В контракте используем discriminatedUnion — его парсит наш клиент, не Gemini.
   * Wire-форма для Gemini описана в navigate-schema.ts (wireNavigateSchema).
   */
  z.object({
    kind: z.literal("navigate"),
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("section"), name: z.enum(["Статистика", "Артефакты", "Кампании", "Настройки"]) }),
      z.object({ kind: z.literal("campaign-workflow"), campaignId: z.string() }),
    ]),
    confirmation: z.string(),
  }),
  /**
   * Редактирование триггеров сигнала (план 006).
   * Инвариант: хотя бы одно поле add/exclude непусто или установлен clear-флаг.
   * Держит промпт, а не схема (empty arrays are valid — schema doesn't enforce the invariant).
   */
  z.object({
    kind: z.literal("triggers"),
    add: z.array(z.string()),
    exclude: z.array(z.string()),
    clearAdded: z.boolean().optional(),
    clearExcluded: z.boolean().optional(),
    confirmation: z.string(),
  }),
]);
export type AssistResult = z.infer<typeof assistResultSchema>;

/**
 * Multi-tool ответ оркестратора (план 006).
 * Максимум 2 результата в одном ответе (например: navigate + stats).
 */
export const assistResponseSchema = z.object({
  results: z.array(assistResultSchema).min(1).max(2),
});
export type AssistResponse = z.infer<typeof assistResponseSchema>;
