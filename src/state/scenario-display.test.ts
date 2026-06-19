import { describe, it, expect } from "vitest";
import { defaultCampaignName } from "./scenario-display";

describe("defaultCampaignName", () => {
  it("formats as «Сценарий №N»", () => {
    expect(defaultCampaignName("Реактивация", 1)).toBe("Реактивация №1");
    expect(defaultCampaignName("Спящий клиент", 3)).toBe("Спящий клиент №3");
  });
});
