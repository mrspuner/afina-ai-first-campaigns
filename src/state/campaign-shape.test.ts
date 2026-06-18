import { describe, expect, it } from "vitest";
import type { Campaign } from "./app-state";

describe("Campaign campaign-first fields", () => {
  it("carries sourceType, channels, and phase", () => {
    const c: Campaign = {
      id: "cmp_1",
      name: "Test",
      status: "draft",
      createdAt: "2026-06-18T00:00:00.000Z",
      sourceType: "new",
      channels: ["sms"],
      phase: "scoring",
    };
    expect(c.sourceType).toBe("new");
  });
});
