import { describe, it, expect } from "vitest";
import { campaignCadenceLabel } from "./campaign-cadence";

describe("campaignCadenceLabel", () => {
  it("stream → Потоковая", () => expect(campaignCadenceLabel("stream")).toBe("Потоковая"));
  it("new → Разовая", () => expect(campaignCadenceLabel("new")).toBe("Разовая"));
  it("own → Разовая", () => expect(campaignCadenceLabel("own")).toBe("Разовая"));
  it("undefined → null", () => expect(campaignCadenceLabel(undefined)).toBeNull());
});
