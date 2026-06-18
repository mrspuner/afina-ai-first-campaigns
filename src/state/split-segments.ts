import type { Signal } from "./app-state";

/**
 * Ветки разделения «по сегменту» (спека A6).
 *
 * Источник — материализованные тиры сигнала (`Signal.segments: {max, high,
 * mid, low}` с ненулевым объёмом), иначе четыре дефолтные категории. Так число
 * и подписи веток сплита совпадают с тем, что реально содержит сигнал.
 *
 * Примечание: сегментный шаг визарда удалён (campaign-first, Task 10), поэтому
 * ветка `wizardData?.segments` убрана — остаётся только объектная логика
 * `Signal.segments`.
 */

export interface SegmentBranch {
  key: string;
  label: string;
}

/** Подписи категорий тиров Signal.segments. */
export const SEGMENT_LABELS: Record<string, string> = {
  max: "Максимальный",
  "very-high": "Очень высокий",
  high: "Высокий",
  medium: "Средний и ниже",
};

const SEGMENT_ORDER = ["max", "very-high", "high", "medium"];

const DEFAULT_BRANCHES: SegmentBranch[] = SEGMENT_ORDER.map((key) => ({
  key,
  label: SEGMENT_LABELS[key],
}));

// Соответствие материализованных тиров (Signal.segments) категориям визарда.
const TIER_TO_SEGMENT: Array<{ tier: keyof Signal["segments"]; key: string }> = [
  { tier: "max", key: "max" },
  { tier: "high", key: "very-high" },
  { tier: "mid", key: "high" },
  { tier: "low", key: "medium" },
];

export function splitSegmentBranches(signal?: Signal | null): SegmentBranch[] {
  if (!signal) return DEFAULT_BRANCHES;

  // 1) Материализованные тиры с ненулевым объёмом.
  const tiers = TIER_TO_SEGMENT.filter(({ tier }) => signal.segments?.[tier] > 0);
  if (tiers.length > 0) {
    return tiers.map(({ key }) => ({ key, label: SEGMENT_LABELS[key] }));
  }

  // 2) Фолбэк — четыре дефолтные категории.
  return DEFAULT_BRANCHES;
}
