"use client";

import {
  ChevronRightIcon,
  GripVerticalIcon,
  Trash2Icon,
} from "lucide-react";
import { Reorder, useDragControls } from "motion/react";

import { GroupedSelect } from "./fields/grouped-select";
import { PeriodField } from "./fields/period-field";
import { SimpleSelect } from "./fields/simple-select";
import type { DrillLevel } from "./drill-in-popover";
import type {
  CalcMethod,
  ColumnKey,
  Currency,
  RowKind,
  StatisticsAction,
  StatisticsFilters,
} from "./statistics-state";

const CALC_METHOD_OPTIONS: readonly { value: CalcMethod; label: string }[] = [
  { value: "funnel", label: "Воронка" },
  { value: "cohort", label: "Когорта" },
  { value: "attribution", label: "Атрибуция" },
] as const;

const CURRENCY_OPTIONS: readonly { value: Currency; label: string }[] = [
  { value: "rub", label: "₽ Рубли" },
  { value: "usd", label: "$ Доллары" },
  { value: "eur", label: "€ Евро" },
] as const;

const ROW_GROUPS = [
  {
    heading: "Даты",
    options: [
      { value: "days", label: "Дни" },
      { value: "weekdays", label: "Дни недели" },
      { value: "weeks", label: "Недели" },
      { value: "months", label: "Месяцы" },
    ],
  },
  {
    heading: "Параметры",
    options: [
      { value: "offers", label: "Предложения" },
      { value: "subscribers", label: "Абоненты" },
      { value: "channels", label: "Каналы" },
      { value: "creatives", label: "Креативы" },
      { value: "triggers", label: "Триггеры" },
      { value: "landings", label: "Лендинги" },
    ],
  },
  {
    heading: "Коммуникации",
    options: [
      { value: "campaigns", label: "Кампании" },
      { value: "scenarios", label: "Сценарии" },
      { value: "templates", label: "Шаблоны" },
      { value: "strategies", label: "Стратегии" },
    ],
  },
  {
    heading: "Контрагенты",
    options: [
      { value: "advertisers", label: "Рекламодатели" },
      { value: "traffic-suppliers", label: "Поставщики трафика" },
    ],
  },
] as const;

const SUB_ROW_GROUPS = [
  {
    heading: "Не разделять",
    options: [{ value: "none", label: "Без подстрок" }],
  },
  ...ROW_GROUPS,
] as const;

const COLUMN_LABELS: Record<ColumnKey, string> = {
  numbers: "Номера",
  signals: "Сигналы",
  approves: "Approves",
  expenses: "Expenses",
  income: "Income",
  holds: "Holds",
  rejects: "Rejects",
  clicks: "Clicks",
  sends: "Sends",
  actions: "Actions",
  ar: "AR, %",
  rr: "RR, %",
};

const ALL_COLUMNS: ColumnKey[] = [
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
  "ar",
  "rr",
];

function ColumnReorderItem({
  col,
  onToggle,
}: {
  col: ColumnKey;
  onToggle: (column: ColumnKey) => void;
}) {
  // Перетаскивание стартует только с ручки-грипа — клики по чекбоксу и
  // кнопке удаления остаются обычными кликами.
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={col}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-2 rounded-md bg-background px-2 py-1.5 text-sm hover:bg-muted/50"
    >
      <GripVerticalIcon
        onPointerDown={(e) => controls.start(e)}
        className="size-3.5 shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        aria-label="Перетащить столбец"
      />
      <label className="flex flex-1 items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked
          onChange={() => onToggle(col)}
          className="size-3.5 accent-primary"
        />
        <span>{COLUMN_LABELS[col]}</span>
      </label>
      <button
        type="button"
        onClick={() => onToggle(col)}
        className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label="Удалить"
      >
        <Trash2Icon className="size-3.5" />
      </button>
    </Reorder.Item>
  );
}

function ColumnsList({
  selected,
  onToggle,
  onReorder,
}: {
  selected: ColumnKey[];
  onToggle: (column: ColumnKey) => void;
  onReorder: (columns: ColumnKey[]) => void;
}) {
  const hidden = ALL_COLUMNS.filter((c) => !selected.includes(c));

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-1">
      <Reorder.Group
        axis="y"
        values={selected}
        onReorder={onReorder}
        className="flex flex-col gap-1.5"
      >
        {selected.map((col) => (
          <ColumnReorderItem key={col} col={col} onToggle={onToggle} />
        ))}
      </Reorder.Group>

      {hidden.length > 0 && (
        <div className="mt-1 border-t border-border pt-2">
          <div className="px-2 py-1 text-xs text-muted-foreground">
            Скрытые столбцы
          </div>
          {hidden.map((col) => (
            <label
              key={col}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/50"
            >
              {/* Спейсер под ширину грипа — выравнивает чекбоксы со списком выше. */}
              <span className="size-3.5 shrink-0" />
              <input
                type="checkbox"
                checked={false}
                onChange={() => onToggle(col)}
                className="size-3.5 accent-primary"
              />
              <span>{COLUMN_LABELS[col]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function MenuRow({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
    >
      <span>{label}</span>
      <span className="flex items-center gap-1.5">
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </span>
    </button>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function buildViewSettingsLevel(
  draft: StatisticsFilters,
  dispatch: (action: StatisticsAction) => void,
): DrillLevel {
  const columnsLevel: DrillLevel = {
    id: "columns",
    title: "Управление столбцами",
    render: () => (
      <ColumnsList
        selected={draft.columns}
        onToggle={(column) => dispatch({ type: "TOGGLE_COLUMN", column })}
        onReorder={(columns) => dispatch({ type: "REORDER_COLUMNS", columns })}
      />
    ),
  };

  const generalLevel: DrillLevel = {
    id: "general",
    title: "Общие параметры отчёта",
    render: () => (
      <div className="flex flex-col gap-3 p-2">
        <FieldRow label="Метод расчёта">
          <SimpleSelect
            value={draft.calcMethod}
            onChange={(method) => dispatch({ type: "SET_CALC_METHOD", method })}
            options={CALC_METHOD_OPTIONS}
          />
        </FieldRow>
        <FieldRow label="Валюта отчёта">
          <SimpleSelect
            value={draft.currency}
            onChange={(currency) => dispatch({ type: "SET_CURRENCY", currency })}
            options={CURRENCY_OPTIONS}
          />
        </FieldRow>
        <FieldRow label="Период">
          <PeriodField
            value={draft.period}
            onChange={(period) => dispatch({ type: "SET_PERIOD", period })}
          />
        </FieldRow>
        <FieldRow label="Строки">
          <GroupedSelect<RowKind>
            value={draft.rows}
            onChange={(rows) => dispatch({ type: "SET_ROWS", rows })}
            groups={ROW_GROUPS}
          />
        </FieldRow>
        <FieldRow label="Подстроки">
          <GroupedSelect<RowKind | "none">
            value={draft.subRows}
            onChange={(subRows) => dispatch({ type: "SET_SUB_ROWS", subRows })}
            groups={SUB_ROW_GROUPS}
          />
        </FieldRow>
      </div>
    ),
  };

  return {
    id: "view-root",
    title: "Настройка вида",
    render: (drill) => (
      <div className="flex flex-col gap-0.5 p-1">
        <MenuRow
          label="Управление столбцами"
          hint={`${draft.columns.length} видимых`}
          onClick={() => drill("columns")}
        />
        <MenuRow
          label="Общие параметры отчёта"
          onClick={() => drill("general")}
        />
      </div>
    ),
    children: [columnsLevel, generalLevel],
  };
}
