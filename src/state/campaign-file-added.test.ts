import { describe, it, expect } from "vitest";
import { appReducer, initialState, type Campaign } from "./app-state";

const draft: Campaign = {
  id: "c1",
  name: "C",
  status: "draft",
  createdAt: "x",
  sourceType: "new",
  channels: ["sms"],
  files: [{ name: "base-1.csv", rowCount: 1000 }],
};

describe("campaign_file_added (group C #8 — «Добавить файл» с графа)", () => {
  it("appends a base to Campaign.files", () => {
    const next = appReducer(
      { ...initialState, campaigns: [draft] },
      { type: "campaign_file_added", campaignId: "c1", file: { name: "base-2.csv", rowCount: 2500 } }
    );
    expect(next.campaigns[0].files).toEqual([
      { name: "base-1.csv", rowCount: 1000 },
      { name: "base-2.csv", rowCount: 2500 },
    ]);
  });

  it("initialises files when the campaign had none", () => {
    const noFiles: Campaign = { ...draft, files: undefined };
    const next = appReducer(
      { ...initialState, campaigns: [noFiles] },
      { type: "campaign_file_added", campaignId: "c1", file: { name: "b.csv", rowCount: 50 } }
    );
    expect(next.campaigns[0].files).toEqual([{ name: "b.csv", rowCount: 50 }]);
  });

  it("is a no-op for an unknown campaign id", () => {
    const base = { ...initialState, campaigns: [draft] };
    const next = appReducer(base, {
      type: "campaign_file_added",
      campaignId: "nope",
      file: { name: "x.csv", rowCount: 1 },
    });
    expect(next).toBe(base);
  });
});
