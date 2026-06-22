import {
  scaleBreakdown,
  type BreakdownRow,
} from "@/sections/campaigns/scale-breakdown";

export interface BudgetComponent extends BreakdownRow {
  /** Contact count to show on the Сигналы row, scaled by the same factor. */
  contactCount?: number;
}

export interface BudgetDisplayResult {
  rows: BudgetComponent[];
  total: number;
}

/**
 * Given the recommended component rows (Сигналы, Коммуникация — NOT the Итого
 * row) and the chosen budget mode, return the rows to render plus the total.
 *
 * - `customTotal` null/0 → recommended mode: components unchanged, total = recommendedTotal.
 * - `customTotal > 0` → scale each component proportionally to customTotal; the
 *   per-row `contactCount` scales by the same factor; total = customTotal.
 */
export function budgetDisplayRows(args: {
  components: BudgetComponent[];
  recommendedTotal: number;
  customTotal: number | null;
}): BudgetDisplayResult {
  const { components, recommendedTotal, customTotal } = args;
  if (customTotal != null && customTotal > 0) {
    const factor = recommendedTotal > 0 ? customTotal / recommendedTotal : 0;
    const scaled = scaleBreakdown(components, customTotal, recommendedTotal);
    const rows = scaled.map((row) => ({
      ...row,
      ...(row.contactCount !== undefined
        ? { contactCount: Math.round(row.contactCount * factor) }
        : {}),
    }));
    return { rows, total: customTotal };
  }
  return { rows: components, total: recommendedTotal };
}
