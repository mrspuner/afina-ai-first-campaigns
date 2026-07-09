/**
 * Ветки разделения «по сегменту» (спека A6).
 *
 * Campaign-first (Task 10): верхнеуровневая сущность Signal удалена, поэтому
 * материализованных тиров больше нет — сплит «по сегменту» всегда предлагает
 * четыре дефолтные категории.
 */

import type { SplitParams } from "@/types/workflow";
import { pluralRu } from "@/lib/plural-ru";

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

/**
 * 12c — единый источник сводки сплиттера: «<режим> · N веток». Импортируется
 * подзаголовком ноды (computeNodeSublabel) и полями сплиттера в спеке B —
 * логику не дублировать.
 */
export function splitSummary(params: SplitParams): string {
  const by =
    params.by === "segment" ? "По сегменту"
    : params.by === "random" ? "Рандомно"
    : "Поровну";
  const n = params.branches;
  return `${by} · ${n} ${pluralRu(n, ["ветка", "ветки", "веток"])}`;
}
