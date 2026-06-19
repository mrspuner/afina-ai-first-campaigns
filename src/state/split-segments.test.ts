import { describe, expect, it } from "vitest";
import { splitSegmentBranches } from "./split-segments";

describe("splitSegmentBranches", () => {
  it("returns the four default categories (campaign-first, no Signal entity)", () => {
    const branches = splitSegmentBranches();
    expect(branches).toHaveLength(4);
    expect(branches[0].label).toBe("Максимальный");
  });
});
