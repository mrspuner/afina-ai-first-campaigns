import { describe, expect, it } from "vitest";
import { initialState, PRESET_TEMPLATES, type MessageTemplate } from "./app-state";

describe("seeded message templates", () => {
  it("initialState.templates is the preset set", () => {
    expect(initialState.templates).toBe(PRESET_TEMPLATES);
    expect(initialState.templates.length).toBeGreaterThanOrEqual(5);
  });

  it("seeds three email templates derived from the email directory", () => {
    const emails = initialState.templates.filter((t) => t.channel === "email");
    expect(emails).toHaveLength(3);
    expect(emails.every((t) => t.content.kind === "email")).toBe(true);
  });

  it("seeds at least one sms and one push sample", () => {
    const channels = new Set(initialState.templates.map((t) => t.channel));
    expect(channels.has("sms")).toBe(true);
    expect(channels.has("push")).toBe(true);
  });

  it("each template's content.kind matches its channel and usage starts at 0", () => {
    for (const t of initialState.templates as MessageTemplate[]) {
      expect(t.content.kind).toBe(t.channel);
      expect(t.usedInCampaigns).toBe(0);
    }
  });
});
