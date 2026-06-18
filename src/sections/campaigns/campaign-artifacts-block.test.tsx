import { describe, it, expect } from "vitest";
import { artifactKindLabel } from "./campaign-artifacts-block";

describe("artifactKindLabel", () => {
  it("maps signals → Сигналы", () => {
    expect(artifactKindLabel("signals")).toBe("Сигналы");
  });
  it("maps signals_conversions → Сигналы и конверсии", () => {
    expect(artifactKindLabel("signals_conversions")).toBe("Сигналы и конверсии");
  });
});
