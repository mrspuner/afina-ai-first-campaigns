import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCampaignClock } from "./use-campaign-clock";
import type { Campaign } from "@/state/app-state";

function base(over: Partial<Campaign>): Campaign {
  return {
    id: "c1", name: "C", status: "active", sourceType: "new", channels: ["sms"],
    phase: "scoring", scenario: undefined, createdAt: "2026-06-01T00:00:00.000Z",
    launchedAt: "2026-06-01T00:00:00.000Z", budget: 1000, templateIds: [],
    ...over,
  } as Campaign;
}

describe("useCampaignClock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("active → elapsed = now - launchedAt", () => {
    vi.setSystemTime(new Date("2026-06-01T00:00:20.000Z")); // +20s
    const { result } = renderHook(() => useCampaignClock(base({})));
    expect(result.current).toBe(20000);
  });

  it("completed → Infinity", () => {
    vi.setSystemTime(new Date("2026-06-01T00:00:20.000Z"));
    const { result } = renderHook(() =>
      useCampaignClock(base({ status: "completed" })),
    );
    expect(result.current).toBe(Infinity);
  });

  it("paused → frozen at pausedAt - launchedAt", () => {
    vi.setSystemTime(new Date("2026-06-01T00:05:00.000Z"));
    const { result } = renderHook(() =>
      useCampaignClock(base({ status: "paused", pausedAt: "2026-06-01T00:00:10.000Z" })),
    );
    expect(result.current).toBe(10000);
  });
});
