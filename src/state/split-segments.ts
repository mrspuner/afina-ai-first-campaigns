/**
 * Ветки разделения «по сегменту» (спека A6).
 *
 * Campaign-first (Task 10): верхнеуровневая сущность Signal удалена, поэтому
 * материализованных тиров больше нет — сплит «по сегменту» всегда предлагает
 * четыре дефолтные категории.
 */

export interface SegmentBranch {
  key: string;
  label: string;
}

/** Подписи категорий тиров сегментации. */
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

export function splitSegmentBranches(): SegmentBranch[] {
  return DEFAULT_BRANCHES;
}
