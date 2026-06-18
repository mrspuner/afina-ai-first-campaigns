import { describe, it, expect } from "vitest";
import { PRESETS, generateSignals, generateCampaigns } from "./presets";

describe("PRESETS.empty", () => {
  it("has no signals and no campaigns", () => {
    expect(PRESETS.empty.signals).toHaveLength(0);
    expect(PRESETS.empty.campaigns).toHaveLength(0);
  });
});

describe("PRESETS.mid", () => {
  it("has 5 signals", () => {
    expect(PRESETS.mid.signals).toHaveLength(5);
  });

  it("has 8 campaigns with expected status distribution", () => {
    expect(PRESETS.mid.campaigns).toHaveLength(8);
    const counts = { draft: 0, active: 0, paused: 0, completed: 0 };
    for (const c of PRESETS.mid.campaigns) counts[c.status as keyof typeof counts]++;
    expect(counts).toEqual({ active: 2, paused: 1, completed: 3, draft: 2 });
  });

  it("all campaign signalIds reference existing signals", () => {
    const signalIds = new Set(PRESETS.mid.signals.map((s) => s.id));
    for (const c of PRESETS.mid.campaigns) {
      // Пресеты всегда заполняют signalId (legacy seed-flow), хотя контракт
      // сделал поле опциональным после campaign-first инверсии.
      expect(c.signalId).toBeDefined();
      expect(signalIds.has(c.signalId!)).toBe(true);
    }
  });
});

describe("PRESETS.full", () => {
  it("has 30 signals", () => {
    expect(PRESETS.full.signals).toHaveLength(30);
  });

  it("has 26 campaigns with expected status distribution", () => {
    expect(PRESETS.full.campaigns).toHaveLength(26);
    const counts = { draft: 0, active: 0, paused: 0, completed: 0 };
    for (const c of PRESETS.full.campaigns) counts[c.status as keyof typeof counts]++;
    expect(counts).toEqual({ active: 8, paused: 2, completed: 10, draft: 6 });
  });
});

describe("generateSignals", () => {
  it("produces count signals with valid shape", () => {
    const signals = generateSignals({
      count: 3,
      seed: 42,
      countRange: [100, 500],
      dateSpanDays: 30,
      now: Date.UTC(2026, 3, 18),
    });
    expect(signals).toHaveLength(3);
    for (const s of signals) {
      expect(s.count).toBeGreaterThanOrEqual(100);
      expect(s.count).toBeLessThanOrEqual(500);
      const sum = s.segments.max + s.segments.high + s.segments.mid + s.segments.low;
      expect(sum).toBe(s.count);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = generateSignals({
      count: 5,
      seed: 123,
      countRange: [100, 200],
      dateSpanDays: 10,
      now: 0,
    });
    const b = generateSignals({
      count: 5,
      seed: 123,
      countRange: [100, 200],
      dateSpanDays: 10,
      now: 0,
    });
    expect(a.map((s) => s.count)).toEqual(b.map((s) => s.count));
  });
});

describe("generateCampaigns", () => {
  it("sets launchedAt for active campaigns", () => {
    const signals = generateSignals({
      count: 2,
      seed: 1,
      countRange: [100, 200],
      dateSpanDays: 10,
      now: Date.UTC(2026, 3, 18),
    });
    const campaigns = generateCampaigns({
      seed: 2,
      signals,
      distribution: { active: 2, paused: 0, completed: 0, draft: 0 },
      dateSpanDays: 10,
      now: Date.UTC(2026, 3, 18),
    });
    for (const c of campaigns) {
      expect(c.status).toBe("active");
      expect(c.launchedAt).toBeDefined();
    }
  });

});

