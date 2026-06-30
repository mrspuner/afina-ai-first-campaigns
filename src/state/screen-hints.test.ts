import { describe, it, expect } from "vitest";
import { appReducer, initialState } from "./app-state";
import type { SuggestionItem } from "@/state/suggestion-registry";

const ITEMS_A: SuggestionItem[] = [
  { id: "a1", label: "A1", action: { kind: "ask", prompt: "a1?" } },
];
const ITEMS_B: SuggestionItem[] = [
  { id: "b1", label: "B1", action: { kind: "ask", prompt: "b1?" } },
  { id: "b2", label: "B2", action: { kind: "ask", prompt: "b2?" } },
];

describe("appReducer — screen hints slice", () => {
  it("starts empty", () => {
    expect(initialState.screenHints).toEqual([]);
    expect(initialState.screenHintsOwner).toBeNull();
  });

  it("screen_hints_set publishes items and records the owner", () => {
    const next = appReducer(initialState, {
      type: "screen_hints_set",
      owner: "A",
      items: ITEMS_A,
    });
    expect(next.screenHints).toEqual(ITEMS_A);
    expect(next.screenHintsOwner).toBe("A");
  });

  it("a new owner overwrites the slice (active screen swap)", () => {
    const withA = appReducer(initialState, {
      type: "screen_hints_set",
      owner: "A",
      items: ITEMS_A,
    });
    const withB = appReducer(withA, {
      type: "screen_hints_set",
      owner: "B",
      items: ITEMS_B,
    });
    expect(withB.screenHints).toEqual(ITEMS_B);
    expect(withB.screenHintsOwner).toBe("B");
  });

  it("screen_hints_clear from the current owner empties the slice", () => {
    const withA = appReducer(initialState, {
      type: "screen_hints_set",
      owner: "A",
      items: ITEMS_A,
    });
    const cleared = appReducer(withA, { type: "screen_hints_clear", owner: "A" });
    expect(cleared.screenHints).toEqual([]);
    expect(cleared.screenHintsOwner).toBeNull();
  });

  it("screen_hints_clear from a NON-owner is a no-op (order-independent swap)", () => {
    // B is now the owner; A's late clear (it just deactivated) must not wipe B.
    const withB = appReducer(initialState, {
      type: "screen_hints_set",
      owner: "B",
      items: ITEMS_B,
    });
    const stale = appReducer(withB, { type: "screen_hints_clear", owner: "A" });
    expect(stale).toBe(withB); // same reference — no state change
    expect(stale.screenHints).toEqual(ITEMS_B);
    expect(stale.screenHintsOwner).toBe("B");
  });
});
