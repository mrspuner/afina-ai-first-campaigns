import { describe, it, expect } from "vitest";
import { TIER_QUOTA, tierForTrigger } from "./subdomain-fill";

describe("tierForTrigger", () => {
  it("квоты тиров — 3 / 7 / 12", () => {
    expect(TIER_QUOTA.shallow).toBe(3);
    expect(TIER_QUOTA.medium).toBe(7);
    expect(TIER_QUOTA.deep).toBe(12);
  });

  it("федеральные потребительские порталы — deep", () => {
    expect(tierForTrigger("credit-banks")).toBe("deep");
    expect(tierForTrigger("apartment-listings")).toBe("deep");
    expect(tierForTrigger("food-grocery")).toBe("deep");
  });

  it("нишевые справочники и калькуляторы — shallow", () => {
    expect(tierForTrigger("mortgage-calculators")).toBe("shallow");
    expect(tierForTrigger("osago-calculators")).toBe("shallow");
    expect(tierForTrigger("procurement-suppliers")).toBe("shallow");
  });

  it("всё остальное — medium, включая незнакомый триггер", () => {
    expect(tierForTrigger("credit-aggregators")).toBe("medium");
    expect(tierForTrigger("hr-job-boards")).toBe("medium");
    expect(tierForTrigger("совершенно-новый-триггер")).toBe("medium");
  });
});
