import { describe, it, expect } from "vitest";
import { appReducer, initialState, type Campaign } from "./app-state";

const draft: Campaign = {
  id: "c1",
  name: "C",
  status: "draft",
  createdAt: "x",
  sourceType: "new",
  channels: ["sms"],
  files: [
    { name: "base-1.csv", rowCount: 1000 },
    { name: "base-2.csv", rowCount: 2500 },
  ],
};

describe("campaign_file_removed — удаление базы с графа (скоринг-нода)", () => {
  it("removes the file at the given index from Campaign.files", () => {
    const next = appReducer(
      { ...initialState, campaigns: [draft] },
      { type: "campaign_file_removed", campaignId: "c1", index: 0 }
    );
    expect(next.campaigns[0].files).toEqual([
      { name: "base-2.csv", rowCount: 2500 },
    ]);
  });

  it("removes the correct file when names repeat (keyed by index)", () => {
    const dupes: Campaign = {
      ...draft,
      files: [
        { name: "same.csv", rowCount: 100 },
        { name: "same.csv", rowCount: 200 },
      ],
    };
    const next = appReducer(
      { ...initialState, campaigns: [dupes] },
      { type: "campaign_file_removed", campaignId: "c1", index: 1 }
    );
    expect(next.campaigns[0].files).toEqual([{ name: "same.csv", rowCount: 100 }]);
  });

  it("adding then removing returns to the prior state", () => {
    const base = { ...initialState, campaigns: [draft] };
    const added = appReducer(base, {
      type: "campaign_file_added",
      campaignId: "c1",
      file: { name: "base-3.csv", rowCount: 3000 },
    });
    // Remove the just-added file (last index) → back to the two originals.
    const removed = appReducer(added, {
      type: "campaign_file_removed",
      campaignId: "c1",
      index: (added.campaigns[0].files?.length ?? 0) - 1,
    });
    expect(removed.campaigns[0].files).toEqual(draft.files);
  });

  it("is a no-op for an unknown campaign id", () => {
    const base = { ...initialState, campaigns: [draft] };
    const next = appReducer(base, {
      type: "campaign_file_removed",
      campaignId: "nope",
      index: 0,
    });
    expect(next).toBe(base);
  });

  it("is a no-op for an out-of-range index", () => {
    const base = { ...initialState, campaigns: [draft] };
    const next = appReducer(base, {
      type: "campaign_file_removed",
      campaignId: "c1",
      index: 9,
    });
    expect(next).toBe(base);
  });
});
