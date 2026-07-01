import { describe, it, expect } from "vitest";
import { buildSignalsCsv, SIGNALS_CSV_ROW_CAP } from "./signals-csv";

describe("buildSignalsCsv", () => {
  it("emits a header + one row per signal, deterministic for a seed", () => {
    const a = buildSignalsCsv("seed-1", 3);
    expect(a).toBe(buildSignalsCsv("seed-1", 3));
    const lines = a.split("\n");
    expect(lines[0]).toBe("Телефон,Тип сигнала,Дата");
    expect(lines).toHaveLength(1 + 3);
  });
  it("caps generated rows for very large cumulatives", () => {
    const lines = buildSignalsCsv("seed-2", SIGNALS_CSV_ROW_CAP + 500).split("\n");
    expect(lines).toHaveLength(1 + SIGNALS_CSV_ROW_CAP);
  });
  it("different seeds produce different content", () => {
    expect(buildSignalsCsv("a", 5)).not.toBe(buildSignalsCsv("b", 5));
  });
});
