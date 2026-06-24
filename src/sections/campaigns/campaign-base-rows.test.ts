import { describe, it, expect } from "vitest";
import { campaignBaseRows } from "./campaign-metrics";
import type { Campaign } from "@/state/app-state";

const base = { id: "c", name: "n", status: "draft", createdAt: "" } as unknown as Campaign;

describe("campaignBaseRows", () => {
  it("нет файлов → undefined", () => {
    expect(campaignBaseRows({ ...base })).toBeUndefined();
    expect(campaignBaseRows({ ...base, files: [] })).toBeUndefined();
  });
  it("несколько файлов → сумма строк", () => {
    expect(
      campaignBaseRows({ ...base, files: [{ name: "a", rowCount: 100 }, { name: "b", rowCount: 250 }] }),
    ).toBe(350);
  });
});
