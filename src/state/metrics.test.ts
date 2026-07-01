import { describe, it, expect } from "vitest";
import {
  addFunnel,
  campaignBaseSends,
  computeFunnel,
  EMPTY_FUNNEL,
  estimateSignalCount,
  formatFunnel,
  makeRng,
  recommendBudget,
  scaleFunnel,
  signalCountRange,
} from "./metrics";

describe("budget → signal count", () => {
  const segments = ["max", "high", "medium"];

  it("range upper bound equals estimateSignalCount (визард = карточка)", () => {
    const budget = 5000;
    expect(signalCountRange(segments, budget).max).toBe(
      estimateSignalCount(segments, budget),
    );
  });

  it("min ≤ max, both 0 without budget or segments", () => {
    const { min, max } = signalCountRange(segments, 5000);
    expect(min).toBeLessThanOrEqual(max);
    expect(signalCountRange([], 5000)).toEqual({ min: 0, max: 0 });
    expect(signalCountRange(segments, 0)).toEqual({ min: 0, max: 0 });
  });
});

describe("recommendBudget", () => {
  it("is deterministic and never below the 50 floor", () => {
    expect(recommendBudget(40000)).toBe(recommendBudget(40000));
    expect(recommendBudget(1)).toBeGreaterThanOrEqual(50);
    expect(recommendBudget(0)).toBe(0);
  });
});

describe("campaignBaseSends", () => {
  it("never exceeds the source signal count and is deterministic", () => {
    const count = 12000;
    const a = campaignBaseSends("cmp_1", count);
    expect(a).toBeLessThanOrEqual(count);
    expect(a).toBeGreaterThan(0);
    expect(campaignBaseSends("cmp_1", count)).toBe(a);
  });

  it("is 0 without a signal count", () => {
    expect(campaignBaseSends("cmp_1", 0)).toBe(0);
    expect(campaignBaseSends("cmp_1", undefined)).toBe(0);
  });
});

describe("scaleFunnel", () => {
  // Базовая воронка для всех кейсов (фиксированный seed).
  const base = computeFunnel(makeRng(42), 5000);

  it("f=1 возвращает воронку без изменений (целочисленные поля)", () => {
    const scaled = scaleFunnel(base, 1);
    expect(scaled.sends).toBe(base.sends);
    expect(scaled.clicks).toBe(base.clicks);
    expect(scaled.actions).toBe(base.actions);
    expect(scaled.holds).toBe(base.holds);
    expect(scaled.approves).toBe(base.approves);
  });

  it("f=0 обнуляет все поля воронки", () => {
    const scaled = scaleFunnel(base, 0);
    expect(scaled.sends).toBe(0);
    expect(scaled.clicks).toBe(0);
    expect(scaled.actions).toBe(0);
    expect(scaled.expensesUsd).toBe(0);
    expect(scaled.incomeUsd).toBe(0);
  });

  it("монотонность: каждое поле при f1 ≤ каждому полю при f2 (f1 < f2)", () => {
    const f1 = scaleFunnel(base, 0.3);
    const f2 = scaleFunnel(base, 0.7);
    expect(f2.sends).toBeGreaterThanOrEqual(f1.sends);
    expect(f2.clicks).toBeGreaterThanOrEqual(f1.clicks);
    expect(f2.actions).toBeGreaterThanOrEqual(f1.actions);
    expect(f2.expensesUsd).toBeGreaterThanOrEqual(f1.expensesUsd);
    expect(f2.incomeUsd).toBeGreaterThanOrEqual(f1.incomeUsd);
  });

  it("инвариант: rejects === actions - holds - approves после масштабирования", () => {
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const s = scaleFunnel(base, f);
      expect(s.rejects).toBe(Math.max(0, s.actions - s.holds - s.approves));
    }
  });

  it("кламп: f>1 эквивалентен f=1; f<0 эквивалентен f=0", () => {
    expect(scaleFunnel(base, 2)).toEqual(scaleFunnel(base, 1));
    expect(scaleFunnel(base, -5)).toEqual(scaleFunnel(base, 0));
  });
});

describe("computeFunnel / addFunnel / formatFunnel", () => {
  it("computeFunnel is deterministic and bounded by sends", () => {
    const f = computeFunnel(makeRng(123), 1000);
    expect(f.sends).toBe(1000);
    expect(f.clicks).toBeLessThanOrEqual(f.sends);
    expect(f.actions).toBeLessThanOrEqual(f.sends);
    expect(f.holds + f.approves + f.rejects).toBe(f.actions);
    expect(computeFunnel(makeRng(123), 1000)).toEqual(f);
  });

  it("zero sends yields an empty funnel", () => {
    expect(computeFunnel(makeRng(1), 0)).toEqual(EMPTY_FUNNEL);
  });

  it("addFunnel sums additive metrics", () => {
    const a = computeFunnel(makeRng(1), 1000);
    const b = computeFunnel(makeRng(2), 2000);
    const sum = addFunnel(a, b);
    expect(sum.sends).toBe(a.sends + b.sends);
    expect(sum.approves).toBe(a.approves + b.approves);
    expect(sum.expensesUsd).toBeCloseTo(a.expensesUsd + b.expensesUsd);
  });

  it("formatFunnel recomputes rates from the aggregate", () => {
    const n = { ...EMPTY_FUNNEL, sends: 200, approves: 20, rejects: 10 };
    const d = formatFunnel(n, "rub");
    expect(d.ar).toBe("10.00%");
    expect(d.rr).toBe("5.00%");
    expect(d.sends).toBe(200);
  });
});

describe("funnel «Номера»/«Сигналы» columns", () => {
  it("computeFunnel: sends ≤ signals ≤ numbers и детерминирован", () => {
    const f = computeFunnel(makeRng(777), 5000);
    expect(f.sends).toBeLessThanOrEqual(f.signals);
    expect(f.signals).toBeLessThanOrEqual(f.numbers);
    expect(Number.isInteger(f.signals)).toBe(true);
    expect(Number.isInteger(f.numbers)).toBe(true);
    expect(computeFunnel(makeRng(777), 5000)).toEqual(f);
  });

  it("инвариант сигналы ≤ номера держится на диапазоне сидов", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const f = computeFunnel(makeRng(seed), 1 + seed * 137);
      expect(f.signals).toBeLessThanOrEqual(f.numbers);
    }
  });

  it("addFunnel суммирует signals/numbers и сохраняет инвариант", () => {
    const a = computeFunnel(makeRng(1), 1000);
    const b = computeFunnel(makeRng(2), 2000);
    const sum = addFunnel(a, b);
    expect(sum.signals).toBe(a.signals + b.signals);
    expect(sum.numbers).toBe(a.numbers + b.numbers);
    expect(sum.signals).toBeLessThanOrEqual(sum.numbers);
  });

  it("scaleFunnel сохраняет сигналы ≤ номера после масштабирования", () => {
    const base = computeFunnel(makeRng(9), 8000);
    for (const fr of [0, 0.3, 0.7, 1]) {
      const scaled = scaleFunnel(base, fr);
      expect(scaled.signals).toBeLessThanOrEqual(scaled.numbers);
    }
  });

  it("formatFunnel отдаёт numbers/signals числами", () => {
    const n = { ...EMPTY_FUNNEL, sends: 100, signals: 140, numbers: 300 };
    const d = formatFunnel(n, "rub");
    expect(d.numbers).toBe(300);
    expect(d.signals).toBe(140);
  });
});
