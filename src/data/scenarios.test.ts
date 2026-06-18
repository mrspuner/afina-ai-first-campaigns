import { describe, expect, it } from "vitest";
import { SCENARIOS, type SourceTypeForScenario } from "./scenarios";

describe("scenario recommendedSourceType", () => {
  it("every scenario carries a recommendedSourceType in the three-source union", () => {
    const valid: SourceTypeForScenario[] = ["new", "stream", "own"];
    for (const s of SCENARIOS) {
      expect(valid).toContain(s.recommendedSourceType);
    }
  });
});
