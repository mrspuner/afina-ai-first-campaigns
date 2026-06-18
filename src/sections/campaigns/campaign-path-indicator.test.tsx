import { describe, it, expect } from "vitest";
import { campaignPathStages } from "./campaign-path-indicator";

describe("campaignPathStages", () => {
  it("own path has no scoring stage and ends in Результат", () => {
    expect(campaignPathStages("own")).toEqual([
      "База загружена",
      "Коммуникация",
      "Результат",
    ]);
  });
  it("new path includes Сбор and Скоринг", () => {
    expect(campaignPathStages("new")[0]).toBe("Сбор");
    expect(campaignPathStages("new")).toContain("Скоринг");
  });
  it("stream path starts with Мониторинг", () => {
    expect(campaignPathStages("stream")[0]).toBe("Мониторинг");
  });
  it("every path ends in Результат", () => {
    for (const st of ["new", "stream", "own"] as const) {
      const stages = campaignPathStages(st);
      expect(stages[stages.length - 1]).toBe("Результат");
    }
  });
});
