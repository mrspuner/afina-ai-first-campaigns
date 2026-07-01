import { describe, it, expect } from "vitest";
import { appReducer, initialState, type AppState, type Campaign } from "./app-state";
import { MAX_DIGESTS, digestCount } from "./artifact-metrics";

function withActiveStream(): AppState {
  const c: Campaign = {
    id: "cs1", name: "Поток", status: "active", createdAt: "2026-06-17T00:00:00.000Z",
    launchedAt: "2026-06-17T00:00:00.000Z", sourceType: "stream", channels: [],
  };
  return { ...initialState, campaigns: [c] };
}

const TS = "2026-06-30T12:00:00.000Z";

describe("stream_digest_emitted", () => {
  it("appends a daily digest (seeded count, dated) and creates the cumulative on day 0", () => {
    const s = appReducer(withActiveStream(), { type: "stream_digest_emitted", id: "cs1", timestamp: TS });
    const daily = s.artifacts.filter((a) => a.variant === "daily");
    const cum = s.artifacts.filter((a) => a.variant === "cumulative");
    expect(daily).toHaveLength(1);
    expect(cum).toHaveLength(1);
    expect(daily[0].count).toBe(digestCount("cs1", 0));
    expect(daily[0].periodDate).toBe("2026-06-17");
    expect(cum[0].count).toBe(daily[0].count);
  });

  it("second emit adds a second daily and grows the cumulative by that day's count", () => {
    let s = appReducer(withActiveStream(), { type: "stream_digest_emitted", id: "cs1", timestamp: TS });
    s = appReducer(s, { type: "stream_digest_emitted", id: "cs1", timestamp: TS });
    const daily = s.artifacts.filter((a) => a.variant === "daily");
    const cum = s.artifacts.find((a) => a.variant === "cumulative")!;
    expect(daily).toHaveLength(2);
    expect(cum.count).toBe(digestCount("cs1", 0) + digestCount("cs1", 1));
  });

  it("stops at MAX_DIGESTS daily digests", () => {
    let s = withActiveStream();
    for (let i = 0; i < MAX_DIGESTS + 3; i++) {
      s = appReducer(s, { type: "stream_digest_emitted", id: "cs1", timestamp: TS });
    }
    expect(s.artifacts.filter((a) => a.variant === "daily")).toHaveLength(MAX_DIGESTS);
  });

  it("is a no-op for a non-streaming or non-active campaign", () => {
    const s0 = withActiveStream();
    const paused = appReducer({ ...s0, campaigns: [{ ...s0.campaigns[0], status: "paused" }] }, { type: "stream_digest_emitted", id: "cs1", timestamp: TS });
    expect(paused.artifacts).toHaveLength(0);
  });
});
