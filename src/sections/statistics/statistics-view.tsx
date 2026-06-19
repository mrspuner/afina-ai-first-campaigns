"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Download,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useReducer, useState } from "react";

import { useNowTick } from "@/hooks/use-now-tick";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAppState, useAppDispatch } from "@/state/app-state-context";

import { PeriodField } from "./fields/period-field";
import {
  COLUMN_HEADERS,
  cellValue,
  generateRows,
  type GeneratedRow,
  type RowData,
} from "./mock-data";
import {
  formatDateRangeRu,
  resolvePeriod,
} from "./period-utils";
import {
  BUILTIN_TEMPLATES,
  type ReportTemplate,
} from "./report-templates";
import { DrillInPopover } from "./drill-in-popover";
import { buildViewSettingsLevel } from "./view-settings-levels";
import { buildSearchSettingsLevel } from "./search-settings-levels";
import { SaveTemplatePopover } from "./save-template-dialog";
import {
  filtersEqual,
  statisticsReducer,
  type ColumnKey,
  type SortColumn,
  type SortDirection,
  type SortState,
} from "./statistics-state";

function DataCells({
  data,
  columns,
}: {
  data: RowData;
  columns: ColumnKey[];
}) {
  return (
    <>
      {columns.map((col) => (
        <td
          key={col}
          className="px-4 py-3 text-right text-sm tabular-nums text-foreground"
        >
          {cellValue(data, col)}
        </td>
      ))}
    </>
  );
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean;
  direction?: SortDirection;
}) {
  if (active) {
    return direction === "asc" ? (
      <ArrowUpIcon className="h-3 w-3" />
    ) : (
      <ArrowDownIcon className="h-3 w-3" />
    );
  }
  // Скрытый намёк на сортируемость — проявляется при наведении на заголовок.
  return (
    <ChevronsUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover/th:opacity-60" />
  );
}

function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(
  rows: GeneratedRow[],
  columns: ColumnKey[],
  expandedKeys: Set<string>,
): string {
  const header = ["Название", ...columns.map((c) => COLUMN_HEADERS[c])].join(
    ",",
  );
  const lines: string[] = [header];
  for (const row of rows) {
    lines.push(
      [csvCell(row.label), ...columns.map((c) => csvCell(row.data[c]))].join(
        ",",
      ),
    );
    if (expandedKeys.has(row.key)) {
      for (const sub of row.subRows) {
        lines.push(
          [
            csvCell(`    ${sub.label}`),
            ...columns.map((col) => csvCell(sub.data[col])),
          ].join(","),
        );
      }
    }
  }
  return lines.join("\n");
}

export function StatisticsView({ campaignId }: { campaignId?: string } = {}) {
  const filterByCampaign = Boolean(campaignId);
  // `messageTemplates` (not `templates`) avoids clashing with the local
  // ReportTemplate state below; these are the app-state MessageTemplate[] the
  // cube's templates dimension is derived from.
  const { campaigns, artifacts, templates: messageTemplates } = useAppState();

  // Stats only become meaningful once a campaign has actually been
  // launched — having signals or draft campaigns isn't enough to
  // produce numbers. We render a soft empty state until at least one
  // campaign has reached active/paused/completed. The unconditional hook
  // calls below stay so the early return doesn't break rules of hooks.
  const hasLaunchedCampaign = campaigns.some(
    (c) => c.status === "active" || c.status === "paused" || c.status === "completed"
  );
  const noData = !hasLaunchedCampaign;

  // Тик обновляет now каждые 15 с — куб пересчитывает сегодняшние факты
  // по доле прошедшего дня; числа монотонно растут в течение сессии.
  // Хук вызывается безусловно (до ранних return) — правило rules-of-hooks.
  const now = useNowTick();

  const [templates, setTemplates] = useState<ReportTemplate[]>(
    () => BUILTIN_TEMPLATES,
  );
  const [activeTemplateId, setActiveTemplateId] = useState<string>(
    BUILTIN_TEMPLATES[0].id,
  );
  const activeTemplate =
    templates.find((t) => t.id === activeTemplateId) ?? templates[0];

  const appDispatch = useAppDispatch();
  const applied = useAppState().stats;
  const [draft, dispatch] = useReducer(
    statisticsReducer,
    applied,
  );

  // Re-sync local draft when applied changes externally (e.g. from PromptBar).
  // Keeps DrillInPopover state consistent with whatever the table now shows.
  useEffect(() => {
    dispatch({ type: "RESET", filters: applied });
  }, [applied]);

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  const dirty = useMemo(
    () => !filtersEqual(draft, applied),
    [draft, applied],
  );
  const divergedFromTemplate = useMemo(
    () => !filtersEqual(applied, activeTemplate.filters),
    [applied, activeTemplate.filters],
  );

  // Строки — group-by по кубу фактов реальных кампаний/сигналов. Фильтрация (в
  // т.ч. скоуп на одну кампанию из карточки) идёт через живые условия поиска
  // (applied.conditions), которые применяет generateRows.
  // now тикает раз в 15 с → куб пересчитывает сегодняшние факты по
  // внутридневной доле; прошлые дни не меняются.
  // Derive each campaign's per-channel templates from the Foundation linkage
  // (Campaign.templateIds → AppState.templates), shaped to the cube's contract.
  // Campaigns without launched templates resolve to [] → "Без шаблона" dim.
  const cubeCampaigns = useMemo(
    () =>
      campaigns.map((c) => ({
        ...c,
        templates: (c.templateIds ?? [])
          .map((id) => messageTemplates.find((t) => t.id === id))
          .filter((t): t is NonNullable<typeof t> => Boolean(t))
          .map((t) => ({ channel: t.channel, id: t.id, name: t.name })),
      })),
    [campaigns, messageTemplates],
  );
  const rows = useMemo(
    () => generateRows(applied, { campaigns: cubeCampaigns, artifacts }, { now }),
    [applied, cubeCampaigns, artifacts, now],
  );
  const resolvedRange = useMemo(
    () => resolvePeriod(applied.period),
    [applied.period],
  );
  const rangeLabel = useMemo(
    () => formatDateRangeRu(resolvedRange),
    [resolvedRange],
  );

  const hasSubRows = applied.subRows !== "none";

  // Клик по заголовку столбца циклически переключает сортировку:
  // нет → defaultDir → обратное → выкл. Применяется сразу к таблице
  // (минуя draft), как и смена периода в тулбаре.
  function cycleSort(column: SortColumn, defaultDir: SortDirection) {
    const current = applied.sort;
    let next: SortState | null;
    if (!current || current.column !== column) {
      next = { column, direction: defaultDir };
    } else if (current.direction === defaultDir) {
      next = { column, direction: defaultDir === "desc" ? "asc" : "desc" };
    } else {
      next = null;
    }
    appDispatch({ type: "stats_set_sort", sort: next });
  }

  const toggleRow = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  function handleTemplateSelect(id: string) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setActiveTemplateId(id);
    appDispatch({ type: "stats_reset", filters: tpl.filters });
    // Local draft will resync via useEffect once applied updates.
    setExpandedKeys(new Set());
    setTemplatePickerOpen(false);
  }

  function handleSave() {
    appDispatch({ type: "stats_reset", filters: draft });
    setExpandedKeys(new Set());
  }

  function handleSaveTemplate(name: string) {
    const id = `user-${Date.now()}`;
    const now = new Date().toLocaleDateString("ru-RU");
    const tpl: ReportTemplate = {
      id,
      name,
      kind: "user",
      author: "Вы",
      createdAt: now,
      updatedAt: now,
      filters: draft,
    };
    setTemplates((prev) => [...prev, tpl]);
    setActiveTemplateId(id);
    appDispatch({ type: "stats_reset", filters: draft });
    setExpandedKeys(new Set());
  }

  function handleDownload() {
    const csv = buildCsv(rows, applied.columns, expandedKeys);
    const blob = new Blob([`﻿${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = rangeLabel.replace(/[^0-9]+/g, "-").replace(/^-|-$/g, "");
    a.download = `afina-stats-${safe || "current"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const titleText = filterByCampaign
    ? "Статистика кампании"
    : activeTemplate.name;

  const baseSubtitle = divergedFromTemplate
    ? "Пользовательский отчёт"
    : activeTemplate.kind === "builtin"
      ? "Шаблонный отчёт"
      : "Пользовательский отчёт";

  // Show the empty state only on the global statistics view. Per-campaign
  // statistics (when `campaignId` is set) always belong to a real campaign
  // and never hit this empty branch.
  if (noData && !filterByCampaign) {
    return <StatisticsEmptyState />;
  }

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-8 pt-8 pb-3 shrink-0">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Popover
              open={templatePickerOpen}
              onOpenChange={setTemplatePickerOpen}
            >
              <PopoverTrigger className="group/title inline-flex items-center gap-2 rounded-md px-1 py-0.5 -ml-1 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50">
                <h1 className="text-[38px] font-semibold leading-[46px] tracking-tight">
                  {titleText}
                </h1>
                <ChevronDown className="h-5 w-5 text-muted-foreground mt-1 shrink-0 transition-transform duration-200 ease-out group-data-[popup-open]/title:rotate-180" />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-1">
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Шаблоны
                </div>
                {templates
                  .filter((t) => t.kind === "builtin")
                  .map((t) => (
                    <TemplateItem
                      key={t.id}
                      template={t}
                      active={t.id === activeTemplateId}
                      onSelect={handleTemplateSelect}
                    />
                  ))}
                {templates.some((t) => t.kind === "user") && (
                  <>
                    <Separator className="my-1" />
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      Мои отчёты
                    </div>
                    {templates
                      .filter((t) => t.kind === "user")
                      .map((t) => (
                        <TemplateItem
                          key={t.id}
                          template={t}
                          active={t.id === activeTemplateId}
                          onSelect={handleTemplateSelect}
                        />
                      ))}
                  </>
                )}
              </PopoverContent>
            </Popover>
          </div>
          <p className="text-sm text-muted-foreground">
            {baseSubtitle}
            <span className="mx-1.5 text-border">·</span>
            <span className="tabular-nums">{rangeLabel}</span>
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="mt-1 shrink-0"
          onClick={handleDownload}
          aria-label="Скачать CSV"
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-8 py-3 shrink-0">
        <PeriodField
          value={applied.period}
          onChange={(period) => {
            appDispatch({ type: "stats_set_period", period });
            // Local draft resyncs via useEffect.
            setExpandedKeys(new Set());
          }}
          triggerVariant="chip"
        />

        <div className="flex items-center gap-2">
          <DrillInPopover
            trigger={
              <>
                <SlidersHorizontal className="h-4 w-4" />
                Настройка вида
              </>
            }
            root={buildViewSettingsLevel(draft, dispatch)}
            dirty={dirty}
            onSave={handleSave}
            rootFooterExtra={
              <SaveTemplatePopover onSave={handleSaveTemplate} disabled={!dirty}>
                Сохранить как шаблон
              </SaveTemplatePopover>
            }
          />
          <DrillInPopover
            trigger={
              <>
                <Search className="h-4 w-4" />
                Источники данных
              </>
            }
            root={buildSearchSettingsLevel(draft, dispatch)}
            dirty={dirty}
            onSave={handleSave}
            contentWidthClassName="w-[600px]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-8 pb-promptbar">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-background">
              <th className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => cycleSort("label", "asc")}
                  className={cn(
                    "group/th -mx-1 inline-flex select-none items-center gap-1.5 rounded px-1 py-0.5 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50",
                    applied.sort?.column === "label"
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  Название
                  <SortIndicator
                    active={applied.sort?.column === "label"}
                    direction={applied.sort?.direction}
                  />
                </button>
              </th>
              {applied.columns.map((col) => {
                const isSortCol = applied.sort?.column === col;
                return (
                  <th
                    key={col}
                    className="px-4 py-3 text-right text-xs font-medium whitespace-nowrap"
                  >
                    <button
                      type="button"
                      onClick={() => cycleSort(col, "desc")}
                      className={cn(
                        "group/th -mx-1 inline-flex select-none items-center gap-1 rounded px-1 py-0.5 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50",
                        isSortCol ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {COLUMN_HEADERS[col]}
                      <SortIndicator
                        active={isSortCol}
                        direction={applied.sort?.direction}
                      />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isExpanded = expandedKeys.has(row.key);
              const canExpand = hasSubRows && row.subRows.length > 0;

              return (
                <Fragment key={row.key}>
                  <tr
                    className={cn(
                      "border-b border-border transition-colors",
                      canExpand && "cursor-pointer hover:bg-muted/30",
                    )}
                    onClick={() => canExpand && toggleRow(row.key)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-muted-foreground transition-transform",
                            !canExpand && "invisible",
                          )}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <span className="flex flex-col">
                          <span className="text-sm font-medium">
                            {row.label}
                          </span>
                          {row.caption && (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {row.caption}
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <DataCells data={row.data} columns={applied.columns} />
                  </tr>
                  {isExpanded &&
                    row.subRows.map((sub) => (
                      <tr
                        key={sub.key}
                        className="border-b border-border bg-muted/15 hover:bg-muted/25 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 pl-6">
                            <span className="text-sm text-muted-foreground">
                              {sub.label}
                            </span>
                          </div>
                        </td>
                        <DataCells
                          data={sub.data}
                          columns={applied.columns}
                        />
                      </tr>
                    ))}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={applied.columns.length + 1}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  Нет данных для выбранных фильтров
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </main>
  );
}

function TemplateItem({
  template,
  active,
  onSelect,
}: {
  template: ReportTemplate;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(template.id)}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors",
        active
          ? "bg-primary/10 text-foreground"
          : "text-foreground hover:bg-muted",
      )}
    >
      <span>{template.name}</span>
      {active && <span className="text-xs text-muted-foreground">текущий</span>}
    </button>
  );
}

function StatisticsEmptyState() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
      <div className="flex max-w-sm flex-col items-center gap-2">
        <h1 className="text-base font-medium text-foreground">
          Пока нет статистики
        </h1>
        <p className="text-sm text-muted-foreground">
          Запустите кампании, чтобы увидеть результаты.
        </p>
      </div>
    </main>
  );
}
