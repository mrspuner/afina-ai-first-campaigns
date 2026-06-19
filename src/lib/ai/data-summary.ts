import type { Campaign, Artifact } from "@/state/app-state";
import type { FunnelNumbers } from "@/state/metrics";
import { buildFacts, aggregate, groupFacts } from "@/sections/statistics/fact-cube";

/**
 * Компактная текстовая сводка реального стейта для промпта оркестратора.
 * Только то, что нужно для ответов: имена/статусы/бюджеты кампаний.
 * Без параметров нод, без ключей.
 * Формат — плоский текст: модель читает его лучше, чем JSON, и он дешевле.
 */
export function buildDataSummary(input: {
  campaigns: Campaign[];
  /** Готовые строки статистики — собирает вызывающий из fact-cube. */
  statsLines?: string[];
}): string {
  const lines: string[] = [];
  lines.push(`Кампаний: ${input.campaigns.length}`);
  for (const c of input.campaigns.slice(0, 20)) {
    lines.push(
      `- кампания "${c.name}" (id ${c.id}): статус ${c.status}` +
        (c.budget ? `, бюджет ${c.budget} ₽` : "") +
        (c.scenario ? `, сценарий «${c.scenario.name}»` : "")
    );
  }
  if (input.statsLines?.length) {
    lines.push("Статистика:");
    lines.push(...input.statsLines);
  }
  return lines.join("\n");
}

/** Строки агрегатов для сводки: общий доход/расход/отправки за всё время. */
export function statsLinesFromFunnel(total: FunnelNumbers): string[] {
  return [
    `- всего: отправок ${total.sends}, кликов ${total.clicks}, конверсий ${total.approves}`,
    `- деньги: доход $${Math.round(total.incomeUsd)}, расход $${Math.round(total.expensesUsd)}`,
  ];
}

/**
 * Строит строки статистики из fact-cube для заданных кампаний и артефактов.
 * Период: с начала текущего года по now.
 * Reach кампании = сумма count её артефактов (ключ — campaignId); без артефакта
 * (или count = 0) fact-cube даёт нулевые агрегаты для этой кампании.
 * Включает до 5 строк топ-кампаний по доходу — чтобы оркестратор мог
 * ответить «какая кампания принесла больше всего?» без галлюцинаций.
 * Используется в buildDataSummary чтобы не дублировать логику в потребителях.
 */
export function buildStatsLines(
  campaigns: Campaign[],
  artifacts: Artifact[],
  now: Date,
): string[] {
  const period = {
    from: new Date(now.getFullYear(), 0, 1),
    to: new Date(now.getFullYear(), 11, 31),
  };
  const facts = buildFacts({ campaigns, artifacts }, period, { now });
  const total = aggregate(facts);
  const lines = statsLinesFromFunnel(total);

  // Per-campaign breakdown: top-5 by income so the model can answer
  // «какая кампания принесла больше всего?» with real numbers.
  const campaignGroups = groupFacts(facts, "campaigns");
  const top5 = campaignGroups
    .map((g) => ({ label: g.label, metrics: aggregate(g.facts) }))
    .sort((a, b) => b.metrics.incomeUsd - a.metrics.incomeUsd)
    .slice(0, 5);
  for (const { label, metrics } of top5) {
    if (metrics.incomeUsd > 0 || metrics.expensesUsd > 0) {
      lines.push(
        `- кампания "${label}": доход $${Math.round(metrics.incomeUsd)}, расход $${Math.round(metrics.expensesUsd)}`
      );
    }
  }

  return lines;
}
