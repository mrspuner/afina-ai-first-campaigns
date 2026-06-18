import { describe, expect, it } from "vitest";
import {
  appReducer,
  initialState,
  type Campaign,
  type MessageTemplate,
} from "./app-state";

function draft(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "cmp_seed",
    name: "Seed",
    status: "draft",
    createdAt: "2026-06-18T00:00:00.000Z",
    sourceType: "new",
    channels: ["sms"],
    ...over,
  };
}

const newTpl: MessageTemplate = {
  id: "tpl_launch_sms",
  channel: "sms",
  name: "SMS из ноды",
  content: { kind: "sms", text: "Привет", alphaName: "AFINA", scheduledAt: "immediate" },
  usedInCampaigns: 0,
};

describe("campaign_launched template + dailyBudget merge", () => {
  it("pushes a new template with usedInCampaigns: 1 and links it to the campaign", () => {
    const state = { ...initialState, campaigns: [draft()] };
    const next = appReducer(state, {
      type: "campaign_launched",
      id: "cmp_seed",
      timestamp: "2026-06-18T00:00:00.000Z",
      budget: 50000,
      templates: [newTpl],
    });
    const merged = next.templates.find((t) => t.id === "tpl_launch_sms");
    expect(merged?.usedInCampaigns).toBe(1);
    expect(next.campaigns[0].templateIds).toEqual(["tpl_launch_sms"]);
  });

  it("increments usedInCampaigns for an already-present template id (no duplicate)", () => {
    const seeded: MessageTemplate = { ...newTpl, usedInCampaigns: 2 };
    const state = { ...initialState, campaigns: [draft()], templates: [seeded] };
    const next = appReducer(state, {
      type: "campaign_launched",
      id: "cmp_seed",
      timestamp: "x",
      budget: 1000,
      templates: [{ ...newTpl, usedInCampaigns: 0 }],
    });
    const hits = next.templates.filter((t) => t.id === "tpl_launch_sms");
    expect(hits).toHaveLength(1);
    expect(hits[0].usedInCampaigns).toBe(3);
  });

  it("persists dailyBudget when present and leaves templates untouched when omitted", () => {
    const state = { ...initialState, campaigns: [draft()] };
    const before = state.templates.length;
    const next = appReducer(state, {
      type: "campaign_launched",
      id: "cmp_seed",
      timestamp: "x",
      budget: 1000,
      dailyBudget: 2500,
    });
    expect(next.campaigns[0].dailyBudget).toBe(2500);
    expect(next.templates).toHaveLength(before);
    expect(next.campaigns[0].templateIds ?? []).toEqual([]);
  });
});
