import { describe, expect, it } from "vitest";
import { splitSegmentBranches, splitSummary } from "./split-segments";

describe("splitSegmentBranches", () => {
  it("returns the four default categories (campaign-first, no Signal entity)", () => {
    const branches = splitSegmentBranches();
    expect(branches).toHaveLength(4);
    expect(branches[0].label).toBe("Максимальный");
  });
});

describe("splitSummary", () => {
  it("summarises an equal split", () => {
    expect(splitSummary({ kind: "split", by: "equal", branches: 2 })).toBe("Поровну · 2 ветки");
  });
  it("summarises a segment split", () => {
    expect(splitSummary({ kind: "split", by: "segment", branches: 4 })).toBe("По сегменту · 4 ветки");
  });
  it("summarises a random split with correct plural", () => {
    expect(splitSummary({ kind: "split", by: "random", branches: 5 })).toBe("Рандомно · 5 веток");
  });
});
