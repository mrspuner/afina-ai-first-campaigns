import type { Campaign, Artifact } from "@/state/app-state";
import { aggregate, buildFacts } from "@/sections/statistics/fact-cube";
import { recommendBudget } from "@/state/metrics";
import { UNIT_COST } from "./campaign-cost";

/** Референсная цена за касание — та же база (SMS), что и в прогнозе оплаты. */
const COST_PER_TOUCH = UNIT_COST.sms;

/** Суммарный размер базы кампании (строк) по всем файлам; undefined, если файлов нет. */
export function campaignBaseRows(c: Campaign): number | undefined {
  return c.files?.length ? c.files.reduce((sum, f) => sum + f.rowCount, 0) : undefined;
}

/**
 * Метрики карточки кампании, посчитанные из того же куба статистики
 * (`fact-cube`), что и раздел «Статистика» — поэтому «Отправки» и CR на
 * карточке совпадают с разрезом по кампаниям в отчёте. Отдельного `mock-stats`
 * больше нет: единый движок чисел, один источник правды.
 */
export interface CampaignCardMetrics {
  /** Запущена ли кампания (active/paused/completed) — у draft метрик факта нет. */
  launched: boolean;
  /** Отправки за всё время жизни кампании (из куба). */
  sends: number;
  /** CR = approves ÷ sends, в процентах (как AR в статистике). */
  crPct: number;
  /** Расчётный (плановый) бюджет, ₽. */
  plannedBudget: number;
  /** Фактические расходы, ₽ — по реально отправленным касаниям из куба. */
  actualSpend: number;
}

function isLaunched(status: Campaign["status"]): boolean {
  return status === "active" || status === "paused" || status === "completed";
}

export function getCampaignCardMetrics(
  campaign: Campaign,
  artifact?: Artifact,
): CampaignCardMetrics {
  const launched = isLaunched(campaign.status);

  // Расчётный бюджет (campaign-first): то, что пользователь заложил при
  // запуске; иначе — детерминированная рекомендация от размера загруженной
  // базы. Сигнал-джойна больше нет.
  const plannedBudget =
    campaign.budget ?? recommendBudget(campaignBaseRows(campaign) ?? 0);

  if (!launched) {
    return { launched, sends: 0, crPct: 0, plannedBudget, actualSpend: 0 };
  }

  // Считаем факты только для этой кампании за всё её время жизни (широкий
  // период — границы куб всё равно обрежет по реальному окну кампании).
  // Reach (база касаний) — из артефакта кампании, ключ — campaignId; без
  // артефакта fact-cube даёт нулевой reach → нулевые отправки.
  const now = new Date();
  const period = { from: new Date(2000, 0, 1), to: now };
  const facts = buildFacts(
    {
      campaigns: [campaign],
      artifacts: artifact ? [artifact] : [],
    },
    period,
    { now },
  );
  const agg = aggregate(facts);
  const crPct = agg.sends > 0 ? (agg.approves / agg.sends) * 100 : 0;
  // Фактические расходы выводим из реально отправленных касаний по той же цене
  // за касание, что и плановый бюджет, — расчётный и факт сопоставимы, но
  // отличаются (доставленный объём ≠ плановый).
  const actualSpend = agg.sends * COST_PER_TOUCH;

  return { launched, sends: agg.sends, crPct, plannedBudget, actualSpend };
}
