import { describe, expect, it, vi } from "vitest";
import { splitPendingDomains } from "./use-domain-moderation";

/** Deterministic rng fed from a fixed sequence (repeats the last value once exhausted). */
function sequenceRng(...values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)];
    i++;
    return v;
  };
}

// Spans the observable domain of rng()'s [0, 1) contract, including the low/high
// extremes that determine the Fisher–Yates swap targets and the cut point.
const BOUNDARY_VALUES = [0, 0.001, 0.25, 0.5, 0.75, 0.999999];

describe("splitPendingDomains", () => {
  it("n=0: both buckets are empty", () => {
    const { approved, rejected } = splitPendingDomains([]);
    expect(approved).toEqual([]);
    expect(rejected).toEqual([]);
  });

  it("n=1: the single domain lands in exactly one bucket, never both, never neither", () => {
    for (const v of BOUNDARY_VALUES) {
      const { approved, rejected } = splitPendingDomains(["a.com"], sequenceRng(v));
      expect(approved.length + rejected.length).toBe(1);
      expect(approved.length === 1 || rejected.length === 1).toBe(true);
      expect([...approved, ...rejected]).toEqual(["a.com"]);
    }

    // explicit near-0 / near-1 boundaries land on each side (rng() < 0.5 decides).
    const low = splitPendingDomains(["a.com"], sequenceRng(0));
    expect(low).toEqual({ approved: ["a.com"], rejected: [] });

    const high = splitPendingDomains(["a.com"], sequenceRng(0.999999));
    expect(high).toEqual({ approved: [], rejected: ["a.com"] });
  });

  it("n>=2 (4 pending domains): both buckets non-empty and together cover exactly the input, across a full grid of rng sequences incl. near-0/near-1 boundaries", () => {
    const pending = ["a.com", "b.com", "c.com", "d.com"];
    const sortedInput = [...pending].sort();

    // For n=4 the function draws exactly 4 values from rng: 3 Fisher–Yates swaps
    // (i = 3, 2, 1) followed by 1 cut-point draw. Exhaust the boundary grid across
    // all 4 draws to prove the invariant holds no matter how the shuffle/cut land.
    for (const s0 of BOUNDARY_VALUES) {
      for (const s1 of BOUNDARY_VALUES) {
        for (const s2 of BOUNDARY_VALUES) {
          for (const s3 of BOUNDARY_VALUES) {
            const { approved, rejected } = splitPendingDomains(
              pending,
              sequenceRng(s0, s1, s2, s3),
            );

            // no domain lost or duplicated
            expect([...approved, ...rejected].sort()).toEqual(sortedInput);

            // mixed outcome is guaranteed at n>=2
            expect(approved.length).toBeGreaterThan(0);
            expect(rejected.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("n>=2: the cut-point boundaries produce the minimal 1/(n-1) split on each side", () => {
    const pending = ["a.com", "b.com", "c.com", "d.com"];

    // Shuffle draws are irrelevant to the invariant; only the final (cut-point)
    // draw is varied here, at its two extremes.
    const minCut = splitPendingDomains(pending, sequenceRng(0.5, 0.5, 0.5, 0));
    expect(minCut.approved.length).toBe(1);
    expect(minCut.rejected.length).toBe(3);

    const maxCut = splitPendingDomains(pending, sequenceRng(0.5, 0.5, 0.5, 0.999999));
    expect(maxCut.approved.length).toBe(3);
    expect(maxCut.rejected.length).toBe(1);
  });

  it("falls back to Math.random when no rng is injected", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.999999);
    try {
      const { approved, rejected } = splitPendingDomains(["a.com", "b.com"]);
      expect([...approved, ...rejected].sort()).toEqual(["a.com", "b.com"]);
      expect(approved.length).toBeGreaterThan(0);
      expect(rejected.length).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
  });
});
