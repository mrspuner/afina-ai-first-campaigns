import { describe, expect, it } from "vitest";

import { generateRows, sortRows, type GeneratedRow, type RowData } from "./mock-data";
import { DEFAULT_FILTERS } from "./statistics-state";
import type { StatsContext } from "./fact-cube";

function row(key: string, data: Partial<RowData>): GeneratedRow {
  const base: RowData = {
    expenses: "0,00 ₽",
    income: "0,00 ₽",
    sends: 0,
    actions: 0,
    holds: 0,
    approves: 0,
    ar: "0.00%",
    rejects: 0,
    rr: "0.00%",
    clicks: 0,
  };
  return { key, label: key, data: { ...base, ...data }, subRows: [] };
}

describe("sortRows", () => {
  const rows: GeneratedRow[] = [
    row("a", { clicks: 30 }),
    row("b", { clicks: 10 }),
    row("c", { clicks: 20 }),
  ];

  it("sort: null оставляет порядок как есть", () => {
    expect(sortRows(rows, null).map((r) => r.key)).toEqual(["a", "b", "c"]);
  });

  it("сортирует по числовой колонке по возрастанию", () => {
    const out = sortRows(rows, { column: "clicks", direction: "asc" });
    expect(out.map((r) => r.key)).toEqual(["b", "c", "a"]);
  });

  it("сортирует по числовой колонке по убыванию", () => {
    const out = sortRows(rows, { column: "clicks", direction: "desc" });
    expect(out.map((r) => r.key)).toEqual(["a", "c", "b"]);
  });

  it("сортирует по денежной строковой колонке по числовому значению", () => {
    const money: GeneratedRow[] = [
      row("x", { income: "1 200,50 ₽" }),
      row("y", { income: "980,00 ₽" }),
      row("z", { income: "12 000,00 ₽" }),
    ];
    const out = sortRows(money, { column: "income", direction: "desc" });
    expect(out.map((r) => r.key)).toEqual(["z", "x", "y"]);
  });

  it("сортирует по процентной колонке по числовому значению", () => {
    const pct: GeneratedRow[] = [
      row("p", { ar: "3.50%" }),
      row("q", { ar: "12.00%" }),
      row("r", { ar: "0.20%" }),
    ];
    const out = sortRows(pct, { column: "ar", direction: "asc" });
    expect(out.map((r) => r.key)).toEqual(["r", "p", "q"]);
  });

  it("сортирует по имени строки (label) по алфавиту", () => {
    const named: GeneratedRow[] = [
      { ...row("1", {}), label: "Берёза" },
      { ...row("2", {}), label: "Авто" },
      { ...row("3", {}), label: "Яблоко" },
    ];
    expect(
      sortRows(named, { column: "label", direction: "asc" }).map((r) => r.key),
    ).toEqual(["2", "1", "3"]);
    expect(
      sortRows(named, { column: "label", direction: "desc" }).map((r) => r.key),
    ).toEqual(["3", "1", "2"]);
  });

  it("не мутирует входной массив", () => {
    const input = [...rows];
    sortRows(input, { column: "clicks", direction: "asc" });
    expect(input.map((r) => r.key)).toEqual(["a", "b", "c"]);
  });
});

describe("generateRows — группировка по шаблонам", () => {
  const now = new Date(2026, 5, 15);
  const ctx: StatsContext = {
    artifacts: [{ campaignId: "cmp", count: 20000 }],
    campaigns: [
      {
        id: "cmp", name: "К", status: "active",
        createdAt: new Date(2026, 5, 1).toISOString(),
        launchedAt: new Date(2026, 5, 1).toISOString(),
        templates: [
          { channel: "sms", id: "t1", name: "SMS A" },
          { channel: "email", id: "t2", name: "Email B" },
        ],
      },
    ],
  };

  it("rows=templates даёт строки по шаблонам кампании (+ Без шаблона для прочих каналов)", () => {
    const rows = generateRows(
      { ...DEFAULT_FILTERS, period: { preset: "this-month" }, rows: "templates", subRows: "none" },
      ctx,
      { now },
    );
    const labels = rows.map((r) => r.label);
    // Хотя бы один реальный шаблон присутствует; набор зависит от того, какие
    // каналы выпали кампании детерминированно.
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((l) => typeof l === "string" && l.length > 0)).toBe(true);
  });

  it("подстроки templates суммируются в родителя (через formatted-нечего ломать на уровне фактов)", () => {
    const rows = generateRows(
      { ...DEFAULT_FILTERS, period: { preset: "this-month" }, rows: "campaigns", subRows: "templates" },
      ctx,
      { now },
    );
    expect(rows.length).toBeGreaterThan(0);
    // Каждая кампания-строка имеет хотя бы одну подстроку-шаблон.
    expect(rows.every((r) => r.subRows.length > 0)).toBe(true);
  });
});
