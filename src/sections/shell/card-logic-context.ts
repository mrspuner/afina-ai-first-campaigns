/**
 * Task 9 — граф-контекст для правки ЛОГИКИ кампании с КАРТОЧКИ.
 *
 * Сервер (`api/ai/assist/route.ts:59`) регистрирует графовые инструменты
 * (edit_workflow / rebuild_workflow) ТОЛЬКО когда
 * `context.screen === "workflow" && context.graph`. На карточке реальный экран —
 * "campaign", поэтому наивная отправка правки логики не получила бы графовых
 * инструментов, оркестратор не вернул бы `workflow-ops`/`rebuild`, а pending-
 * пузырь в чате завис бы навсегда (ops легли бы в почтовый слот, но карточный
 * аппликатор не получил бы что применять).
 *
 * Этот чистый помощник обнаруживает активный тег «Логика кампании», нацеленный
 * на текущую карточку, и возвращает граф-контекст-оверрайд: `screen` форсируется
 * в "workflow" и прикладывается сводка графа кампании — ровно та же форма
 * payload'а, что шлёт workflow-view. Тогда оркестратор ведёт себя идентично
 * правке внутри графа, а `use-campaign-graph-applier` применяет результат к кэшу
 * графа кампании и закрывает пузырь.
 *
 * Возвращает `null`, когда это НЕ карточная правка логики — вызывающий тогда
 * идёт своим обычным путём (без графа).
 */

import type { AppState } from "@/state/app-state";
import type { ChipSegment } from "@/state/prompt-chips-context";
import { isCampaignLogicPayload } from "@/state/prompt-chips-context";
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";
import { summarizeGraph, type GraphNodeSummary } from "@/lib/ai/graph-summary";

/** Граф кампании (ноды + связи) — минимум, который умеет сводить summarizeGraph. */
export interface ResolvableGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface CardLogicContext {
  /** id кампании, чью логику правим (из payload тега / view). */
  campaignId: string;
  /** Экран для оркестратора — "workflow", иначе сервер не даст графовые tools. */
  screen: "workflow";
  /** Сводка графа — та же форма, что шлёт workflow-view (summarizeGraph). */
  graph: {
    nodes: GraphNodeSummary[];
    edges: Array<{ from: string; to: string; label?: string }>;
  };
  /** Метка сигнала графа — для rebuild (buildGraphFromSpec). */
  cachedSignalLabel: string;
}

/** Метка входного сигнала графа — как в use-chat-submit (workflow-путь). */
export function cardLogicSignalLabel(graph: { nodes: WorkflowNode[] }): string {
  return (
    graph.nodes.find(
      (n) => n.data.nodeType === "source" || n.data.nodeType === "signal"
    )?.data.label ?? "Сигнал"
  );
}

/**
 * Если в баре активен тег «Логика кампании», нацеленный на текущую карточку —
 * возвращает граф-контекст-оверрайд; иначе `null`.
 *
 * `resolveGraph` разрешает граф кампании ровно как `campaign-screen.tsx`'s
 * `launchGraph` (кэш → шаблон по сценарию); передаётся вызывающим, чтобы этот
 * модуль оставался чистым и тестируемым без модульного кэша.
 */
export function resolveCardLogicContext(
  view: AppState["view"],
  segments: ChipSegment[],
  resolveGraph: (campaignId: string) => ResolvableGraph | null
): CardLogicContext | null {
  if (view.kind !== "campaign") return null;
  const seg = segments.find((s) => s.chip.kind === "campaign-logic");
  if (!seg || !isCampaignLogicPayload(seg.chip.payload)) return null;
  const campaignId = seg.chip.payload.campaignId;
  // Тег относится именно к открытой карточке (страховка от рассинхрона).
  if (campaignId !== view.campaign.id) return null;
  const graph = resolveGraph(campaignId);
  if (!graph) return null;
  return {
    campaignId,
    screen: "workflow",
    graph: summarizeGraph(graph),
    cachedSignalLabel: cardLogicSignalLabel(graph),
  };
}
