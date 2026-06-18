import { describe, expect, it } from "vitest";
import { appReducer, initialState, viewToAddress } from "./app-state";

describe("artifact detail routing", () => {
  it("artifact_opened routes to the artifact view", () => {
    const next = appReducer(initialState, { type: "artifact_opened", id: "art_1" });
    expect(next.view).toMatchObject({ kind: "artifact", artifactId: "art_1" });
  });

  it("viewToAddress round-trips the artifact view", () => {
    const addr = viewToAddress({ kind: "artifact", artifactId: "art_1" });
    expect(addr).toEqual({ kind: "artifact", artifactId: "art_1" });
  });
});
