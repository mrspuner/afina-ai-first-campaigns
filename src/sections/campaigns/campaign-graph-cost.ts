import type { SourceType } from "@/types/campaign";
import { getScenario } from "@/data/scenarios";
import { createTemplate } from "@/state/workflow-templates";
import { computeCampaignCost, type CampaignCost } from "./campaign-cost";

/**
 * Headline campaign cost from the workflow GRAPH — the single model shared by the
 * wizard Budget step and the payment screen so their figures match. Builds the
 * scenario+source template graph and prices it over `baseSize`.
 *
 * The returned `total` (primary + repeat) is the communication cost: it is what
 * both surfaces show as «Коммуникация» and «Итого». The scoring/«Сигналы» line
 * is priced separately from the source rule (see campaign-budget-estimate.ts),
 * matching the payment screen where `recommended = cost.total` is comms-only.
 */
export function graphCostFor(args: {
  scenarioId: string | null;
  sourceType: SourceType;
  baseSize: number;
}): CampaignCost | null {
  const signalType = args.scenarioId
    ? getScenario(args.scenarioId)?.signalType
    : undefined;
  if (!signalType) return null;
  const graph = createTemplate(signalType, args.sourceType);
  return computeCampaignCost(graph.nodes, graph.edges, args.baseSize);
}
