/**
 * Display-time split for the payment screen.
 *
 * «Сигналы» and «Коммуникации» are paid TOGETHER as one budget — one cannot be
 * paid without the other. So «своя сумма» rescales the whole grand total: both
 * lines scale proportionally by `customTotal / recommendedTotal`, and «Итого»
 * is their sum. In recommended mode (or when there is nothing to scale against)
 * the split is returned untouched.
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
  /** The recommended GRAND total (scoring + communication) the lines scale against. */
  recommendedTotal: number;
}): T {
  const { split, mode, customTotal, recommendedTotal } = args;
  if (mode !== "custom" || recommendedTotal <= 0) return split;
  const factor = customTotal / recommendedTotal;
  const scoring = Math.round(split.scoring * factor);
  const communication = Math.round(split.communication * factor);
  return {
    ...split,
    scoring,
    communication,
    total: scoring + communication,
  };
}
