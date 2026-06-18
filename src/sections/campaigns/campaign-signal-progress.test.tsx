import { describe, it, expect } from "vitest";
import { processedFraction } from "./campaign-signal-progress";

describe("processedFraction", () => {
  it("derives a stable processed % from campaign id + phase", () => {
    const f = processedFraction("cmp_1", "scoring");
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);
  });
  it("is deterministic for the same inputs", () => {
    expect(processedFraction("cmp_1", "scoring")).toBe(
      processedFraction("cmp_1", "scoring")
    );
  });
  it("communicating phase is fully processed", () => {
    expect(processedFraction("cmp_1", "communicating")).toBe(1);
  });
});
