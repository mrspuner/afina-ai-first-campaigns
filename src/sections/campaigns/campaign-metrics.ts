import type { Campaign, Artifact } from "@/state/app-state";
import { aggregate, buildFacts } from "@/sections/statistics/fact-cube";
import { recommendBudget } from "@/state/metrics";
import { UNIT_COST } from "./campaign-cost";

/** Референсная цена за касание — та же база (SMS), что и в прогнозе оплаты. */
const COST_PER_TOUCH = UNIT_COST.sms;

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
    campaign.budget ?? recommendBudget(campaign.file?.rowCount ?? 0);

  if (!launched) {
    return { launched, sends: 0, crPct: 0, plannedBudget, actualSpend: 0 };
  }

  // Считаем факты только для этой кампании за всё её время жизни (широкий
  // период — границы куб всё равно обрежет по реальному окну кампании).
  // Базу касаний питаем количеством из артефакта кампании (если есть);
  // иначе fact-cube выводит детерминированную базу из id кампании.
  const now = new Date();
  const period = { from: new Date(2000, 0, 1), to: now };
  const facts = buildFacts(
    {
      campaigns: campaign.signalId
        ? [campaign]
        : [{ ...campaign, signalId: `art_${campaign.id}` }],
      signals: artifact
        ? [{ id: campaign.signalId ?? `art_${campaign.id}`, count: artifact.count }]
        : [],
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
