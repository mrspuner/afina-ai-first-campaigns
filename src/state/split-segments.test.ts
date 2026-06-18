import { describe, expect, it } from "vitest";
import { splitSegmentBranches } from "./split-segments";
import type { Signal } from "./app-state";

function makeSignal(overrides: Partial<Signal>): Signal {
  return {
    id: "s1",
    type: "Регистрация",
    count: 1000,
    segments: { max: 0, high: 0, mid: 0, low: 0 },
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  } as Signal;
}

describe("splitSegmentBranches", () => {
  it("uses materialized tiers with volume", () => {
    const signal = makeSignal({
      segments: { max: 100, high: 0, mid: 50, low: 0 },
    });
    const branches = splitSegmentBranches(signal);
    expect(branches.map((b) => b.key)).toEqual(["max", "high"]);
  });

  it("falls back to four default categories when nothing is known", () => {
    const branches = splitSegmentBranches(makeSignal({}));
    expect(branches).toHaveLength(4);
    expect(branches[0].label).toBe("Максимальный");
  });

  it("returns defaults for a missing signal", () => {
    expect(splitSegmentBranches(null)).toHaveLength(4);
  });
});
