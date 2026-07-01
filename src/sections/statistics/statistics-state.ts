export type PeriodPreset =
  | "today"
  | "yesterday"
  | "this-quarter"
  | "last-quarter"
  | "this-month"
  | "last-month"
  | "this-year"
  | "last-year"
  | "custom";

export type Period = {
  preset: PeriodPreset;
  from?: string;
  to?: string;
};

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Сегодня",
  yesterday: "Вчера",
  "this-quarter": "Этот квартал",
  "last-quarter": "Прошлый квартал",
  "this-month": "Этот месяц",
  "last-month": "Прошлый месяц",
  "this-year": "Этот год",
  "last-year": "Прошлый год",
  custom: "Произвольный период",
};

export function periodLabel(period: Period): string {
  if (period.preset === "custom" && period.from && period.to) {
    return `${period.from} — ${period.to}`;
  }
  return PERIOD_LABELS[period.preset];
}

export type CalcMethod = "funnel" | "cohort" | "attribution";
export type Currency = "rub" | "usd" | "eur";

export type RowKind =
  | "days"
  | "weekdays"
  | "weeks"
  | "months"
  | "offers"
  | "subscribers"
  | "channels"
  | "creatives"
  | "triggers"
  | "landings"
  | "campaigns"
  | "scenarios"
  | "templates"
  | "strategies"
  | "advertisers"
  | "traffic-suppliers";

export type ColumnKey =
  | "numbers"
  | "signals"
  | "approves"
  | "expenses"
  | "income"
  | "holds"
  | "rejects"
  | "clicks"
  | "sends"
  | "actions"
  | "ar"
  | "rr";

export type SortDirection = "asc" | "desc";

/** Колонка сортировки: метрика-столбец или строковое имя строки. */
export type SortColumn = ColumnKey | "label";

export type SortState = {
  column: SortColumn;
  direction: SortDirection;
};

export type SearchConditions = {
  include: Record<string, string[]>;
  exclude: Record<string, string[]>;
};

export type StatisticsFilters = {
  calcMethod: CalcMethod;
  currency: Currency;
  period: Period;
  rows: RowKind;
  rowCount: number;
  subRows: RowKind | "none";
  columns: ColumnKey[];
  conditions: SearchConditions;
  sort: SortState | null;
};

export const DEFAULT_FILTERS: StatisticsFilters = {
  calcMethod: "funnel",
  currency: "rub",
  period: { preset: "this-quarter" },
  rows: "days",
  rowCount: 2000,
  subRows: "campaigns",
  columns: [
    "numbers",
    "signals",
    "approves",
    "expenses",
    "income",
    "holds",
    "rejects",
    "clicks",
    "sends",
    "actions",
  ],
  conditions: { include: {}, exclude: {} },
  sort: null,
};

export type StatisticsAction =
  | { type: "SET_PERIOD"; period: Period }
  | { type: "SET_CALC_METHOD"; method: CalcMethod }
  | { type: "SET_CURRENCY"; currency: Currency }
  | { type: "SET_ROWS"; rows: RowKind }
  // Поле «Количество строк» убрано из UI (C3), но rowCount остаётся в стейте
  // фиксированным дефолтом и управляется из чата (напр. «топ-10»). Экшен
  // сохранён для этих программных патчей.
  | { type: "SET_ROW_COUNT"; count: number }
  | { type: "SET_SUB_ROWS"; subRows: RowKind | "none" }
  | { type: "TOGGLE_COLUMN"; column: ColumnKey }
  | { type: "REORDER_COLUMNS"; columns: ColumnKey[] }
  | {
      type: "SET_CONDITION";
      scope: "include" | "exclude";
      entity: string;
      values: string[];
    }
  | { type: "SET_SORT"; sort: SortState | null }
  | { type: "RESET"; filters: StatisticsFilters };

export function statisticsReducer(
  state: StatisticsFilters,
  action: StatisticsAction,
): StatisticsFilters {
  switch (action.type) {
    case "SET_PERIOD":
      return { ...state, period: action.period };
    case "SET_CALC_METHOD":
      return { ...state, calcMethod: action.method };
    case "SET_CURRENCY":
      return { ...state, currency: action.currency };
    case "SET_ROWS":
      return { ...state, rows: action.rows };
    case "SET_ROW_COUNT":
      return { ...state, rowCount: action.count };
    case "SET_SUB_ROWS":
      return { ...state, subRows: action.subRows };
    case "TOGGLE_COLUMN": {
      const has = state.columns.includes(action.column);
      return {
        ...state,
        columns: has
          ? state.columns.filter((c) => c !== action.column)
          : [...state.columns, action.column],
      };
    }
    case "REORDER_COLUMNS":
      return { ...state, columns: action.columns };
    case "SET_CONDITION":
      return {
        ...state,
        conditions: {
          ...state.conditions,
          [action.scope]: {
            ...state.conditions[action.scope],
            [action.entity]: action.values,
          },
        },
      };
    case "SET_SORT":
      return { ...state, sort: action.sort };
    case "RESET":
      return action.filters;
  }
}

export function filtersEqual(
  a: StatisticsFilters,
  b: StatisticsFilters,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
