import { describe, expect, it } from "vitest";
import { ARTIFACT_KIND_LABEL } from "./artifact-labels";

describe("artifact kind labels", () => {
  it("maps both kinds to Russian labels", () => {
    expect(ARTIFACT_KIND_LABEL.signals).toBe("Сигналы");
    expect(ARTIFACT_KIND_LABEL.signals_conversions).toBe("Сигналы и конверсии");
  });
});
