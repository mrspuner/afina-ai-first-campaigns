import { describe, it, expect } from "vitest";
import { PROVIDERS } from "./providers";

describe("providers data", () => {
  it("has 4 providers", () => {
    expect(PROVIDERS).toHaveLength(4);
  });
  it("three providers connect on a timer, one is stuck", () => {
    expect(PROVIDERS.filter((p) => p.connectAfterMs !== null)).toHaveLength(3);
    expect(PROVIDERS.filter((p) => p.connectAfterMs === null)).toHaveLength(1);
  });
  it("Beeline connects fastest", () => {
    const connectTimes = PROVIDERS.filter((p) => p.connectAfterMs !== null).map(
      (p) => p.connectAfterMs as number,
    );
    const bee = PROVIDERS.find((p) => p.name === "Билайн");
    expect(bee?.connectAfterMs).toBe(Math.min(...connectTimes));
  });
});
