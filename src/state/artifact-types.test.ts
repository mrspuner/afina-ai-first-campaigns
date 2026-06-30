import { describe, expect, it } from "vitest";
import type { Artifact, MessageTemplate } from "./app-state";

describe("artifact + template contracts", () => {
  it("Artifact is campaign-scoped with a kind", () => {
    const a: Artifact = {
      id: "art_1",
      campaignId: "cmp_1",
      kind: "signals",
      count: 100,
      baseSize: 240,
      createdAt: "2026-06-18T00:00:00.000Z",
    };
    expect(a.kind).toBe("signals");
  });

  it("MessageTemplate is channel-typed with a usage counter", () => {
    const t: MessageTemplate = {
      id: "tpl_1",
      channel: "sms",
      name: "Напоминание",
      content: { kind: "sms", text: "Привет", alphaName: "AFINA", scheduledAt: "immediate" },
      usedInCampaigns: 0,
    };
    expect(t.channel).toBe("sms");
  });
});
