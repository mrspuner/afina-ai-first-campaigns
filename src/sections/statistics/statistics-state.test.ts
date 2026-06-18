import { describe, expect, it } from "vitest";

import {
  DEFAULT_FILTERS,
  filtersEqual,
  statisticsReducer,
  type StatisticsFilters,
  type RowKind,
} from "./statistics-state";

describe("RowKind — templates dimension", () => {
  it('"templates" is a valid RowKind', () => {
    const k: RowKind = "templates";
    expect(k).toBe("templates");
  });
});

describe("statisticsReducer — SET_SORT", () => {
  it("устанавливает столбец и направление сортировки", () => {
    const next = statisticsReducer(DEFAULT_FILTERS, {
      type: "SET_SORT",
      sort: { column: "income", direction: "desc" },
    });
    expect(next.sort).toEqual({ column: "income", direction: "desc" });
  });

  it("сбрасывает сортировку при sort: null", () => {
    const withSort: StatisticsFilters = {
      ...DEFAULT_FILTERS,
      sort: { column: "approves", direction: "asc" },
    };
    const next = statisticsReducer(withSort, { type: "SET_SORT", sort: null });
    expect(next.sort).toBeNull();
  });

  it("не мутирует прочие поля фильтра", () => {
    const next = statisticsReducer(DEFAULT_FILTERS, {
      type: "SET_SORT",
      sort: { column: "clicks", direction: "asc" },
    });
    expect(next.columns).toBe(DEFAULT_FILTERS.columns);
    expect(next.period).toBe(DEFAULT_FILTERS.period);
  });
});

describe("DEFAULT_FILTERS.sort", () => {
  it("по умолчанию сортировки нет", () => {
    expect(DEFAULT_FILTERS.sort).toBeNull();
  });
});

describe("filtersEqual учитывает sort", () => {
  it("разные sort → не равны", () => {
    const a: StatisticsFilters = {
      ...DEFAULT_FILTERS,
      sort: { column: "income", direction: "desc" },
    };
    const b: StatisticsFilters = {
      ...DEFAULT_FILTERS,
      sort: { column: "income", direction: "asc" },
    };
    expect(filtersEqual(a, b)).toBe(false);
  });

  it("одинаковый sort → равны", () => {
    const a: StatisticsFilters = {
      ...DEFAULT_FILTERS,
      sort: { column: "income", direction: "desc" },
    };
    const b: StatisticsFilters = {
      ...DEFAULT_FILTERS,
      sort: { column: "income", direction: "desc" },
    };
    expect(filtersEqual(a, b)).toBe(true);
  });
});
