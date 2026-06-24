import { describe, it, expect } from "vitest";
import { splitDuration } from "./wait-fields";

describe("splitDuration — hours → {value, unit} (block 7 §3)", () => {
  it("picks the largest exact unit", () => {
    expect(splitDuration(1)).toEqual({ value: 1, unitIdx: 0 }); // 1 час
    expect(splitDuration(24)).toEqual({ value: 1, unitIdx: 1 }); // 1 день
    expect(splitDuration(72)).toEqual({ value: 3, unitIdx: 1 }); // 3 дня
    expect(splitDuration(168)).toEqual({ value: 1, unitIdx: 2 }); // 1 неделя
    expect(splitDuration(336)).toEqual({ value: 2, unitIdx: 2 }); // 2 недели
  });
  it("falls back to hours when not evenly divisible", () => {
    expect(splitDuration(5)).toEqual({ value: 5, unitIdx: 0 });
    expect(splitDuration(25)).toEqual({ value: 25, unitIdx: 0 });
  });
});
