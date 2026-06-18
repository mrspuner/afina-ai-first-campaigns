/**
 * Two-payment split for a campaign launch (spec §5 + §3):
 *  - scoring payment       — producing the scored audience (free for own bases).
 *  - communication payment — the channel touches (skipped when no channels).
 * Degenerate own bases (no channels, free scoring) yield zero payments.
 */
import {
  estimateCampaignBudget,
  type BudgetEstimateInput,
} from "./campaign-budget-estimate";

export type PaymentKind = "scoring" | "communication";

export interface CampaignPayment {
  kind: PaymentKind;
  amount: number;
  /** Stream communication only: per-day budget alongside the total cap. */
  dailyBudget?: number;
}

export interface CampaignPaymentSplit {
  scoring: number;
  communication: number;
  total: number;
  /** Only the non-zero payment lines, in scoring → communication order. */
  payments: CampaignPayment[];
  /** Stream only: per-day budget for the communication payment. */
  dailyBudget?: number;
}

export function splitCampaignPayments(
  input: BudgetEstimateInput
): CampaignPaymentSplit {
  const est = estimateCampaignBudget(input);
  const payments: CampaignPayment[] = [];
  if (est.signals > 0) {
    payments.push({ kind: "scoring", amount: est.signals });
  }
  if (est.communication > 0) {
    payments.push({
      kind: "communication",
      amount: est.communication,
      ...(est.dailyBudget !== undefined ? { dailyBudget: est.dailyBudget } : {}),
    });
  }
  return {
    scoring: est.signals,
    communication: est.communication,
    total: est.total,
    payments,
    ...(est.dailyBudget !== undefined ? { dailyBudget: est.dailyBudget } : {}),
  };
}
