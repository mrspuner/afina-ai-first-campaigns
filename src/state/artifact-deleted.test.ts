import { describe, expect, it } from "vitest";
import { appReducer, initialState } from "./app-state";

describe("artifact_deleted", () => {
  it("removes the artifact by id", () => {
    const state = { ...initialState, artifacts: [
      { id: "a1", campaignId: "c1", kind: "signals" as const, count: 5, createdAt: "x" },
      { id: "a2", campaignId: "c1", kind: "signals" as const, count: 9, createdAt: "y" },
    ] };
    const next = appReducer(state, { type: "artifact_deleted", id: "a1" });
    expect(next.artifacts.map((a) => a.id)).toEqual(["a2"]);
  });
});
