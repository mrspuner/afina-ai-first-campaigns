import { describe, it, expect } from "vitest";
import {
  groupCommunicationLines,
  buildChannelTable,
} from "./communication-breakdown";
import type { CostLine } from "./campaign-cost";

function line(over: Partial<CostLine>): CostLine {
  return {
    nodeId: "n",
    channel: "sms",
    label: "",
    unit: 5,
    reach: 0,
    sum: 0,
    isDynamic: false,
    ...over,
  };
}

describe("groupCommunicationLines (aim #23)", () => {
  it("splits into primary (isDynamic=false) and repeat (isDynamic=true)", () => {
    const groups = groupCommunicationLines([
      line({ nodeId: "a", channel: "sms", sum: 100, isDynamic: false }),
      line({ nodeId: "b", channel: "email", sum: 50, isDynamic: true }),
    ]);
    expect(groups.primary).toEqual([{ channel: "sms", sum: 100 }]);
    expect(groups.repeat).toEqual([{ channel: "email", sum: 50 }]);
  });

  it("dedups + sums duplicate channels within a group (channel appears once)", () => {
    const groups = groupCommunicationLines([
      line({ nodeId: "a", channel: "sms", sum: 100, isDynamic: false }),
      line({ nodeId: "b", channel: "sms", sum: 25, isDynamic: false }),
      line({ nodeId: "c", channel: "email", sum: 10, isDynamic: false }),
    ]);
    expect(groups.primary).toEqual([
      { channel: "sms", sum: 125 },
      { channel: "email", sum: 10 },
    ]);
    expect(groups.repeat).toEqual([]);
  });

  it("a channel can appear once in EACH group (primary + repeat) independently", () => {
    const groups = groupCommunicationLines([
      line({ nodeId: "a", channel: "sms", sum: 200, isDynamic: false }),
      line({ nodeId: "b", channel: "sms", sum: 60, isDynamic: true }),
      line({ nodeId: "c", channel: "sms", sum: 40, isDynamic: true }),
    ]);
    expect(groups.primary).toEqual([{ channel: "sms", sum: 200 }]);
    // Two dynamic SMS nodes collapse to a single SMS repeat row summed to 100.
    expect(groups.repeat).toEqual([{ channel: "sms", sum: 100 }]);
  });

  it("preserves first-seen channel order within a group", () => {
    const groups = groupCommunicationLines([
      line({ nodeId: "a", channel: "ivr", sum: 8, isDynamic: false }),
      line({ nodeId: "b", channel: "push", sum: 1, isDynamic: false }),
      line({ nodeId: "c", channel: "ivr", sum: 8, isDynamic: false }),
    ]);
    expect(groups.primary.map((r) => r.channel)).toEqual(["ivr", "push"]);
    expect(groups.primary[0].sum).toBe(16);
  });

  it("empty input yields two empty groups", () => {
    const groups = groupCommunicationLines([]);
    expect(groups.primary).toEqual([]);
    expect(groups.repeat).toEqual([]);
  });
});

describe("buildChannelTable (v8 Коммуникации table — Канал | Первичные | Повторные | Итого)", () => {
  it("single channel → one row with primary + repeat and their per-channel total", () => {
    const groups = groupCommunicationLines([
      line({ nodeId: "a", channel: "sms", sum: 50_000, isDynamic: false }),
      line({ nodeId: "b", channel: "sms", sum: 15_000, isDynamic: true }),
    ]);
    expect(buildChannelTable(groups)).toEqual([
      { channel: "sms", primary: 50_000, repeat: 15_000, total: 65_000 },
    ]);
  });

  it("multi channel → one row per channel, first-appearance order preserved", () => {
    const groups = groupCommunicationLines([
      line({ nodeId: "a", channel: "sms", sum: 100, isDynamic: false }),
      line({ nodeId: "b", channel: "email", sum: 40, isDynamic: false }),
      line({ nodeId: "c", channel: "email", sum: 10, isDynamic: true }),
    ]);
    expect(buildChannelTable(groups)).toEqual([
      { channel: "sms", primary: 100, repeat: 0, total: 100 },
      { channel: "email", primary: 40, repeat: 10, total: 50 },
    ]);
  });

  it("a channel only present in the repeat group still gets a row (primary 0)", () => {
    const groups = groupCommunicationLines([
      line({ nodeId: "a", channel: "push", sum: 7, isDynamic: true }),
    ]);
    expect(buildChannelTable(groups)).toEqual([
      { channel: "push", primary: 0, repeat: 7, total: 7 },
    ]);
  });

  it("no communication → empty table (no rows)", () => {
    expect(buildChannelTable(groupCommunicationLines([]))).toEqual([]);
  });

  it("per-channel total column equals primary + repeat for every row", () => {
    const groups = groupCommunicationLines([
      line({ nodeId: "a", channel: "sms", sum: 200, isDynamic: false }),
      line({ nodeId: "b", channel: "sms", sum: 60, isDynamic: true }),
      line({ nodeId: "c", channel: "ivr", sum: 80, isDynamic: false }),
    ]);
    for (const row of buildChannelTable(groups)) {
      expect(row.total).toBe(row.primary + row.repeat);
    }
  });
});
