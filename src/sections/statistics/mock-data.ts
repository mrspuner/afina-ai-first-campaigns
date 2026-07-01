import { resolvePeriod } from "./period-utils";
import type {
  ColumnKey,
  SortState,
  StatisticsFilters,
} from "./statistics-state";
import { formatFunnel, type FunnelDisplay } from "@/state/metrics";
import {
  aggregate,
  buildFacts,
  filterFactsByConditions,
  groupFacts,
  type StatsContext,
} from "./fact-cube";

export type { StatsContext } from "./fact-cube";

/** A formatted report cell row. Identical shape to the display funnel. */
export type RowData = FunnelDisplay;

export type GeneratedRow = {
  key: string;
  label: string;
  caption?: string;
  data: RowData;
  subRows: { key: string; label: string; data: RowData }[];
};

/**
 * Превращает значение ячейки (число или денежная/процентная строка вида
 * "1 200,50 ₽" / "3.50%") в число для сравнения. Нечисловые остатки
 * отбрасываются, запятая трактуется как десятичный разделитель.
 */
function numericCellValue(data: RowData, column: ColumnKey): number {
  const raw = data[column];
  if (typeof raw === "number") return raw;
  const cleaned = raw
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Сортирует топ-уровневые строки отчёта по выбранной колонке.
 * sort: null оставляет исходный порядок (заданный кубом). Не мутирует вход.
 */
export function sortRows(
  rows: GeneratedRow[],
  sort: SortState | null,
): GeneratedRow[] {
  if (!sort) return rows;
  const factor = sort.direction === "asc" ? 1 : -1;
  if (sort.column === "label") {
    return [...rows].sort(
      (a, b) => a.label.localeCompare(b.label, "ru") * factor,
    );
  }
  const column = sort.column;
  return [...rows].sort((a, b) => {
    const av = numericCellValue(a.data, column);
    const bv = numericCellValue(b.data, column);
    return (av - bv) * factor;
  });
}

/**
 * Строит строки отчёта как group-by по кубу фактов (см. fact-cube.ts). Строки —
 * это группировка фактов по `filters.rows`, подстроки — под-группировка фактов
 * каждой строки по `filters.subRows`. Поэтому подстроки всегда суммируются в
 * родителя, а общий итог не зависит от выбора разреза. Без `ctx` (нет реальных
 * кампаний) отчёт пуст.
 */
export function generateRows(
  filters: StatisticsFilters,
  ctx?: StatsContext,
  opts: { now?: Date } = {},
): GeneratedRow[] {
  if (!ctx) return [];
  const period = resolvePeriod(filters.period, opts.now);
  // Условия поиска — единый живой фильтр куба (включения/исключения по
  // сущностям). Применяются к полному набору фактов до группировки.
  const facts = filterFactsByConditions(
    buildFacts(ctx, period, opts),
    filters.conditions,
  );

  // subRows === rows — вырожденная пара (разбивка измерения само на себя);
  // трактуем как отсутствие подстрок.
  const sub =
    filters.subRows !== "none" && filters.subRows !== filters.rows
      ? filters.subRows
      : null;

  const rows: GeneratedRow[] = groupFacts(facts, filters.rows).map((g) => ({
    key: g.key,
    label: g.label,
    caption: g.caption,
    data: formatFunnel(aggregate(g.facts), filters.currency),
    subRows: sub
      ? groupFacts(g.facts, sub).map((sg) => ({
          key: `${g.key}__${sg.key}`,
          label: sg.label,
          data: formatFunnel(aggregate(sg.facts), filters.currency),
        }))
      : [],
  }));

  return sortRows(rows.slice(0, Math.max(1, filters.rowCount)), filters.sort);
}

export const COLUMN_HEADERS: Record<ColumnKey, string> = {
  numbers: "Номера",
  signals: "Сигналы",
  expenses: "Expenses",
  income: "Income",
  sends: "Sends",
  actions: "Actions",
  holds: "Holds",
  approves: "Approves",
  rejects: "Rejects",
  clicks: "Clicks",
  ar: "AR, %",
  rr: "RR, %",
};

export function cellValue(data: RowData, key: ColumnKey): string {
  const v = data[key];
  return typeof v === "number" ? v.toLocaleString("ru-RU") : v;
}
