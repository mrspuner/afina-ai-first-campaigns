export interface BreakdownRow {
  key: string;
  amount: number;
  /** carried through untouched (label, channel, etc.) */
  [extra: string]: unknown;
}

/**
 * Proportionally rescale component rows so they sum to `customTotal`, given the
 * original `recommendedTotal` they summed to. Rounding drift is absorbed into the
 * largest row so the displayed parts always add up to the chosen budget exactly.
 * recommendedTotal === 0 → all rows become 0 (no division by zero).
 */
export function scaleBreakdown<T extends BreakdownRow>(
  rows: T[],
  customTotal: number,
  recommendedTotal: number,
): T[] {
  if (recommendedTotal <= 0) return rows.map((r) => ({ ...r, amount: 0 }));
  const factor = customTotal / recommendedTotal;
  const scaled = rows.map((r) => ({ ...r, amount: Math.round(r.amount * factor) }));
  const drift = customTotal - scaled.reduce((s, r) => s + r.amount, 0);
  if (drift !== 0 && scaled.length > 0) {
    let maxI = 0;
    for (let i = 1; i < scaled.length; i++) if (scaled[i].amount > scaled[maxI].amount) maxI = i;
    scaled[maxI] = { ...scaled[maxI], amount: scaled[maxI].amount + drift };
  }
  return scaled;
}
