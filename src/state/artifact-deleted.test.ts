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

  it("resets to the Артефакты section when deleting the currently-open artifact", () => {
    const state = {
      ...initialState,
      artifacts: [{ id: "a1", campaignId: "c1", kind: "signals" as const, count: 5, createdAt: "x" }],
      view: { kind: "artifact" as const, artifactId: "a1" },
    };
    const next = appReducer(state, { type: "artifact_deleted", id: "a1" });
    expect(next.view).toEqual({ kind: "section", name: "Артефакты" });
    expect(next.activeSection).toBe("Артефакты");
  });

  it("leaves the view untouched when deleting a non-open artifact", () => {
    const state = {
      ...initialState,
      artifacts: [
        { id: "a1", campaignId: "c1", kind: "signals" as const, count: 5, createdAt: "x" },
        { id: "a2", campaignId: "c1", kind: "signals" as const, count: 9, createdAt: "y" },
      ],
      view: { kind: "artifact" as const, artifactId: "a2" },
    };
    const next = appReducer(state, { type: "artifact_deleted", id: "a1" });
    expect(next.view).toEqual({ kind: "artifact", artifactId: "a2" });
  });
});
