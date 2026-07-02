import type { CampaignStatus } from "@/state/app-state";
import type { SourceType } from "@/types/campaign";
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";
import { validateWorkflow } from "@/state/workflow-validation";

type GateCampaign = { status: CampaignStatus; sourceType?: SourceType; phase?: "scoring" | "communicating" };

/** new draft collects signals pre-launch; collecting = draft + new + phase still scoring. */
export function isCollecting(c: GateCampaign): boolean {
  return c.status === "draft" && c.sourceType === "new" && (c.phase ?? "scoring") === "scoring";
}

/** Launch allowed: draft → new needs collection done; stream/own immediate. paused → true. active/completed → false. */
export function canLaunchCampaign(c: GateCampaign): boolean {
  if (c.status === "draft") return c.sourceType === "new" ? !isCollecting(c) : true;
  if (c.status === "paused") return true;
  return false;
}

/**
 * Полный гейт кнопки «Запустить» в карточке кампании: базовый статус-гейт И
 * валидность workflow-графа (нет нод «needs-attention» — в т.ч. незаполненный
 * шаблон — и есть достижимый success-путь). Граф передаёт вызывающий (из
 * durable-кэша либо построенного по сценарию шаблона). `null`-граф → по графу
 * не блокируем (нечего валидировать). `signalBound=true`: post-inversion каждая
 * кампания — корень графа, поэтому проверяем только needs-attention + success.
 */
export function canLaunchWithGraph(
  c: GateCampaign,
  graph: { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null,
): boolean {
  if (!canLaunchCampaign(c)) return false;
  if (!graph) return true;
  return validateWorkflow(graph, true).ok;
}
