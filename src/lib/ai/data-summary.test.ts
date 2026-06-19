import { describe, expect, it } from "vitest";
import { buildDataSummary, statsLinesFromFunnel, buildStatsLines } from "./data-summary";

const campaign = {
  id: "c1", name: "Ипотека-лето", signalId: "s1", status: "active" as const,
  createdAt: "2026-06-01", budget: 50000, scenario: { id: "x", name: "Горячий интент" },
};
describe("buildDataSummary", () => {
  it("включает кампании с именем, статусом и бюджетом", () => {
    const s = buildDataSummary({ campaigns: [campaign] });
    expect(s).toContain("Ипотека-лето");
    expect(s).toContain("active");
    expect(s).toContain("50000");
  });
  it("режет списки до 20 позиций", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...campaign, id: `c${i}`, name: `К${i}` }));
    const s = buildDataSummary({ campaigns: many });
    expect(s).toContain("Кампаний: 30");
    expect(s).not.toContain('"К25"');
  });
  it("statsLines попадают в сводку", () => {
    const s = buildDataSummary({
      campaigns: [],
      statsLines: statsLinesFromFunnel({
        sends: 10, clicks: 5, actions: 3, holds: 1, approves: 2, rejects: 0,
        expensesUsd: 100, incomeUsd: 300,
      }),
    });
    expect(s).toContain("доход $300");
  });
});

describe("buildStatsLines", () => {
  const now = new Date(2026, 5, 15); // 15 Jun 2026

  const campaigns = [
    {
      id: "c1", name: "Ипотека-лето", signalId: "s1", status: "active" as const,
      createdAt: "2026-01-10", launchedAt: "2026-01-12",
    },
    {
      id: "c2", name: "Автокредит", signalId: "s2", status: "completed" as const,
      createdAt: "2026-02-01", launchedAt: "2026-02-05", completedAt: "2026-03-20",
    },
  ];

  const signals = [
    {
      id: "s1", type: "Первая сделка" as const, name: "Ипотека",
      count: 1200, segments: { max: 100, high: 300, mid: 500, low: 300 },
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    },
    {
      id: "s2", type: "Апсейл" as const, name: "Автокредит",
      count: 800, segments: { max: 80, high: 200, mid: 320, low: 200 },
      createdAt: "2026-02-01", updatedAt: "2026-02-01",
    },
  ];

  it("возвращает не менее 2 строк (общие агрегаты + per-campaign)", () => {
    const lines = buildStatsLines(campaigns, signals, now);
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it("обе строки содержат числа", () => {
    const lines = buildStatsLines(campaigns, signals, now);
    expect(lines[0]).toMatch(/\d+/);
    expect(lines[1]).toMatch(/\d+/);
  });

  it("первая строка упоминает отправки", () => {
    const lines = buildStatsLines(campaigns, signals, now);
    expect(lines[0]).toContain("отправок");
  });

  it("вторая строка упоминает деньги", () => {
    const lines = buildStatsLines(campaigns, signals, now);
    expect(lines[1]).toContain("доход");
  });

  it("ненулевые сигналы дают ненулевые отправки в запущенных кампаниях", () => {
    // count=1200 → campaignBaseSends > 0 → sends > 0
    const lines = buildStatsLines(campaigns, signals, now);
    // первая строка: "- всего: отправок N, ..."
    const match = lines[0].match(/отправок (\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(0);
  });

  it("пустой список кампаний — нули в строках", () => {
    const lines = buildStatsLines([], [], now);
    expect(lines[0]).toContain("отправок 0");
  });

  it("при активной кампании с ненулевым сигналом есть строка с именем кампании и доходом > 0", () => {
    const lines = buildStatsLines(campaigns, signals, now);
    // Строки после первых двух — per-campaign breakdown
    const campaignLines = lines.slice(2);
    expect(campaignLines.length).toBeGreaterThan(0);
    // Хотя бы одна строка содержит «Ипотека-лето» с доходом > 0
    const ipotekaLine = campaignLines.find((l) => l.includes("Ипотека-лето"));
    expect(ipotekaLine).toBeDefined();
    const match = ipotekaLine!.match(/доход \$(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(0);
  });
});
