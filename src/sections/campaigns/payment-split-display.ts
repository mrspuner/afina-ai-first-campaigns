/**
 * Display-time split for the payment screen (aim #24).
 *
 * Scoring («Сигналы») is ALREADY PAID during signal scoring, so it must be
 * LOCKED: recalculation / «своя сумма» must never rescale it. Only the
 * communication portion scales with the chosen budget — all new payment goes to
 * communications. In recommended mode (or when there is nothing to scale
 * against) the split is returned untouched.
 */
export interface PaymentSplitShape {
  scoring: number;
  communication: number;
  total: number;
}

export function paymentSplitDisplay<T extends PaymentSplitShape>(args: {
  split: T;
  mode: "recommended" | "custom";
  /** The user-entered custom budget (only used in custom mode). */
  customTotal: number;
  /** The recommended communication total the lines scale against. */
  recommendedTotal: number;
}): T {
  const { split, mode, customTotal, recommendedTotal } = args;
  if (mode !== "custom" || recommendedTotal <= 0) return split;
  // Scoring is locked at its already-paid value; only communication scales.
  const factor = customTotal / recommendedTotal;
  const communication = Math.round(split.communication * factor);
  return {
    ...split,
    communication,
    total: split.scoring + communication,
  };
}
