import { describe, it, expect } from "vitest";
import {
  aggregate,
  buildFacts,
  filterFactsByConditions,
  groupFacts,
  type StatsContext,
} from "./fact-cube";
import type { DateRange } from "./period-utils";

// Fixed "now" so campaign windows and the period are deterministic.
const NOW = new Date(2026, 5, 15); // 15 Jun 2026, полночь (startOfDay)
const PERIOD: DateRange = {
  from: new Date(2026, 3, 1), // 01 Apr
  to: new Date(2026, 5, 30), // 30 Jun
};

// Фиксированные моменты времени для тестов внутридневной доли.
// Все три — один и тот же календарный день (15 Jun 2026), разное время суток.
const DAY = new Date(2026, 5, 15); // базовая дата для ticks ниже
function atHour(h: number, m = 0): Date {
  return new Date(DAY.getFullYear(), DAY.getMonth(), DAY.getDate(), h, m);
}
const NOW_09 = atHour(9, 0);  // 09:00 утра
const NOW_21 = atHour(21, 0); // 21:00 вечера
const NOW_EOD = new Date(DAY.getFullYear(), DAY.getMonth(), DAY.getDate(), 23, 59, 59);

// «Вчера» — для проверки, что прошлые дни не меняются.
const YESTERDAY = new Date(2026, 5, 14); // 14 Jun 2026

// Кампания, активная с начала периода вплоть до «сегодня» включительно.
const CTX_ACTIVE: StatsContext = {
  signals: [{ id: "sig_x", count: 30000 }],
  campaigns: [
    {
      id: "cmp_x",
      name: "Активная",
      signalId: "sig_x",
      status: "active",
      createdAt: new Date(2026, 5, 1).toISOString(),
      launchedAt: new Date(2026, 5, 1).toISOString(),
    },
  ],
};

const PERIOD_JUNE: DateRange = {
  from: new Date(2026, 5, 1),  // 01 Jun 2026
  to: new Date(2026, 5, 30),   // 30 Jun 2026
};

function iso(y: number, m: number, d: number): string {
  return new Date(y, m, d).toISOString();
}

const CTX_WITH_TEMPLATES: StatsContext = {
  signals: [{ id: "sig_t", count: 20000 }],
  campaigns: [
    {
      id: "cmp_t",
      name: "С шаблонами",
      signalId: "sig_t",
      status: "active",
      createdAt: iso(2026, 5, 1),
      launchedAt: iso(2026, 5, 1),
      templates: [
        { channel: "sms", id: "tpl_sms", name: "SMS-напоминание" },
        { channel: "email", id: "tpl_eml", name: "Email-дайджест" },
      ],
    },
  ],
};

describe("StatsContext — per-campaign templates field", () => {
  it("accepts campaigns carrying a templates array", () => {
    expect(CTX_WITH_TEMPLATES.campaigns?.[0].templates).toHaveLength(2);
  });
});

const CTX: StatsContext = {
  signals: [
    { id: "sig_a", count: 40000 },
    { id: "sig_b", count: 12000 },
  ],
  campaigns: [
    {
      id: "cmp_a",
      name: "Кампания A",
      signalId: "sig_a",
      status: "active",
      createdAt: iso(2026, 3, 10),
      launchedAt: iso(2026, 3, 12),
      scenario: { id: "scn-1", name: "Регистрация" },
    },
    {
      id: "cmp_b",
      name: "Кампания B",
      signalId: "sig_b",
      status: "completed",
      createdAt: iso(2026, 3, 1),
      launchedAt: iso(2026, 4, 5),
      completedAt: iso(2026, 4, 20),
    },
  ],
};

const ADDITIVE = [
  "sends",
  "clicks",
  "actions",
  "holds",
  "approves",
  "rejects",
] as const;

describe("buildFacts — околореальные дни", () => {
  it("кампания, запущенная сегодня, даёт ровно один активный день", () => {
    const ctx: StatsContext = {
      signals: [{ id: "s", count: 5000 }],
      campaigns: [
        {
          id: "c",
          name: "Сегодня",
          signalId: "s",
          status: "active",
          createdAt: NOW.toISOString(),
          launchedAt: NOW.toISOString(),
        },
      ],
    };
    const facts = buildFacts(ctx, PERIOD, { now: NOW });
    const days = new Set(facts.map((f) => f.date.toISOString().slice(0, 10)));
    expect(days.size).toBe(1);
    expect([...days][0]).toBe(NOW.toISOString().slice(0, 10));
  });

  it("активные дни = длине пересечения окна кампании и периода", () => {
    // cmp_b: 05 Apr → 20 Apr completed = 16 дней, целиком внутри периода.
    const facts = filterFactsByConditions(
      buildFacts(CTX, PERIOD, { now: NOW }),
      { include: { campaigns: ["cmp-cmp_b"] }, exclude: {} },
    );
    const days = new Set(facts.map((f) => f.date.toISOString().slice(0, 10)));
    expect(days.size).toBe(16);
  });

  it("кампания вне периода не даёт фактов", () => {
    const ctx: StatsContext = {
      signals: [{ id: "s", count: 5000 }],
      campaigns: [
        {
          id: "c",
          name: "Старая",
          signalId: "s",
          status: "completed",
          createdAt: iso(2025, 0, 1),
          launchedAt: iso(2025, 0, 5),
          completedAt: iso(2025, 0, 20),
        },
      ],
    };
    expect(buildFacts(ctx, PERIOD, { now: NOW })).toHaveLength(0);
  });

  it("draft-кампании не попадают в куб", () => {
    const ctx: StatsContext = {
      signals: [{ id: "s", count: 5000 }],
      campaigns: [
        {
          id: "c",
          name: "Черновик",
          signalId: "s",
          status: "draft",
          createdAt: NOW.toISOString(),
        },
      ],
    };
    expect(buildFacts(ctx, PERIOD, { now: NOW })).toHaveLength(0);
  });
});

describe("cube invariants", () => {
  const facts = buildFacts(CTX, PERIOD, { now: NOW });

  it("кампания не отправляет больше, чем count её сигнала", () => {
    const a = aggregate(
      groupFacts(facts, "campaigns").find((g) => g.key === "cmp-cmp_a")!.facts,
    );
    expect(a.sends).toBeLessThanOrEqual(40000);
  });

  it("подстроки суммируются в родителя по аддитивным колонкам", () => {
    for (const parent of groupFacts(facts, "campaigns")) {
      const parentAgg = aggregate(parent.facts);
      const subAgg = groupFacts(parent.facts, "channels").reduce(
        (acc, sg) => {
          const a = aggregate(sg.facts);
          for (const k of ADDITIVE) acc[k] += a[k];
          return acc;
        },
        { sends: 0, clicks: 0, actions: 0, holds: 0, approves: 0, rejects: 0 } as Record<
          (typeof ADDITIVE)[number],
          number
        >,
      );
      for (const k of ADDITIVE) expect(subAgg[k]).toBe(parentAgg[k]);
    }
  });

  it("общий итог не зависит от выбора разреза (инвариант куба)", () => {
    const byDays = aggregate(facts);
    for (const dim of ["campaigns", "channels", "scenarios", "templates", "weekdays"] as const) {
      const total = groupFacts(facts, dim).reduce(
        (acc, g) => {
          const a = aggregate(g.facts);
          for (const k of ADDITIVE) acc[k] += a[k];
          return acc;
        },
        { sends: 0, clicks: 0, actions: 0, holds: 0, approves: 0, rejects: 0 } as Record<
          (typeof ADDITIVE)[number],
          number
        >,
      );
      for (const k of ADDITIVE) expect(total[k]).toBe(byDays[k]);
    }
  });

  it("детерминизм: повторный вызов даёт те же числа", () => {
    const again = buildFacts(CTX, PERIOD, { now: NOW });
    expect(aggregate(again)).toEqual(aggregate(facts));
  });

  it("условие include по кампании оставляет только её факты", () => {
    const only = filterFactsByConditions(facts, {
      include: { campaigns: ["cmp-cmp_a"] },
      exclude: {},
    });
    expect(only.length).toBeGreaterThan(0);
    expect(only.every((f) => f.dims.campaigns.key === "cmp-cmp_a")).toBe(true);
  });

  it("условие exclude убирает факты кампании", () => {
    const without = filterFactsByConditions(facts, {
      include: {},
      exclude: { campaigns: ["cmp-cmp_a"] },
    });
    expect(without.every((f) => f.dims.campaigns.key !== "cmp-cmp_a")).toBe(true);
    expect(without.length).toBe(
      facts.filter((f) => f.dims.campaigns.key !== "cmp-cmp_a").length,
    );
  });

  it("пустые условия не меняют набор фактов", () => {
    expect(filterFactsByConditions(facts, { include: {}, exclude: {} })).toBe(
      facts,
    );
  });

  it("include по pool-измерению фильтрует по ключу канала", () => {
    const ch = facts[0].dims.channels.key;
    const only = filterFactsByConditions(facts, {
      include: { channels: [ch] },
      exclude: {},
    });
    expect(only.length).toBeGreaterThan(0);
    expect(only.every((f) => f.dims.channels.key === ch)).toBe(true);
  });

  it("каждый факт несёт значение по каждому измерению", () => {
    for (const f of facts.slice(0, 50)) {
      for (const dim of [
        "campaigns",
        "scenarios",
        "templates",
        "channels",
        "creatives",
        "offers",
        "landings",
        "subscribers",
        "triggers",
        "strategies",
        "advertisers",
        "traffic-suppliers",
      ] as const) {
        expect(f.dims[dim]?.label).toBeTruthy();
      }
    }
  });
});

describe("templates dimension — facts", () => {
  it("каждый факт несёт значение по измерению templates", () => {
    const facts = buildFacts(CTX_WITH_TEMPLATES, PERIOD_JUNE, { now: NOW });
    expect(facts.length).toBeGreaterThan(0);
    for (const f of facts) {
      expect(f.dims.templates?.label).toBeTruthy();
      expect(f.dims.templates?.key).toBeTruthy();
    }
  });

  it("факты email-канала несут email-шаблон, sms-канала — sms-шаблон", () => {
    const facts = buildFacts(CTX_WITH_TEMPLATES, PERIOD_JUNE, { now: NOW });
    for (const f of facts) {
      if (f.dims.channels.label === "Email") {
        expect(f.dims.templates.label).toBe("Email-дайджест");
      }
      if (f.dims.channels.label === "SMS") {
        expect(f.dims.templates.label).toBe("SMS-напоминание");
      }
    }
  });

  it("канал без шаблона → факт получает «Без шаблона»", () => {
    // CTX (no templates anywhere) → every fact falls back.
    const facts = buildFacts(CTX, PERIOD, { now: NOW });
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((f) => f.dims.templates.key === "tpl-none")).toBe(true);
    expect(facts.every((f) => f.dims.templates.label === "Без шаблона")).toBe(true);
  });

  it("группировка по templates сохраняет инвариант: подстроки = родитель", () => {
    const facts = buildFacts(CTX_WITH_TEMPLATES, PERIOD_JUNE, { now: NOW });
    const byTemplate = groupFacts(facts, "templates");
    const total = aggregate(facts);
    const summed = byTemplate.reduce(
      (acc, g) => {
        const a = aggregate(g.facts);
        for (const k of ADDITIVE) acc[k] += a[k];
        return acc;
      },
      { sends: 0, clicks: 0, actions: 0, holds: 0, approves: 0, rejects: 0 } as Record<
        (typeof ADDITIVE)[number],
        number
      >,
    );
    for (const k of ADDITIVE) expect(summed[k]).toBe(total[k]);
  });
});

describe("cacheKey — template identity", () => {
  it("смена шаблонов кампании инвалидирует кэш (другое распределение по templates)", () => {
    const ctxA: StatsContext = {
      signals: [{ id: "s", count: 20000 }],
      campaigns: [
        {
          id: "cmp_c", name: "C", signalId: "s", status: "active",
          createdAt: iso(2026, 5, 1), launchedAt: iso(2026, 5, 1),
          templates: [{ channel: "sms", id: "tpl_1", name: "Шаблон 1" }],
        },
      ],
    };
    const ctxB: StatsContext = {
      ...ctxA,
      campaigns: [{ ...ctxA.campaigns![0], templates: [{ channel: "sms", id: "tpl_2", name: "Шаблон 2" }] }],
    };
    const labelsA = new Set(
      buildFacts(ctxA, PERIOD_JUNE, { now: NOW }).map((f) => f.dims.templates.label),
    );
    const labelsB = new Set(
      buildFacts(ctxB, PERIOD_JUNE, { now: NOW }).map((f) => f.dims.templates.label),
    );
    // If the cache ignored templates, ctxB would return ctxA's cached facts and
    // labelsB would still contain "Шаблон 1".
    expect(labelsA.has("Шаблон 1")).toBe(true);
    expect(labelsB.has("Шаблон 2")).toBe(true);
    expect(labelsB.has("Шаблон 1")).toBe(false);
  });
});

describe("внутридневная доля — сегодняшние факты масштабируются", () => {
  /** Преобразует Date в ключ дня через локальные компоненты — тот же путь,
   *  что в buildCampaignFacts (dateOnly → midnight local → ISO). */
  function localDayKey(d: Date): string {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
      .toISOString()
      .slice(0, 10);
  }

  /** Суммирует поле по всем фактам «сегодняшнего» дня. */
  function todaySends(ctx: StatsContext, period: DateRange, now: Date): number {
    const key = localDayKey(now);
    return buildFacts(ctx, period, { now })
      .filter((f) => f.date.toISOString().slice(0, 10) === key)
      .reduce((s, f) => s + f.metrics.sends, 0);
  }

  function todayIncome(ctx: StatsContext, period: DateRange, now: Date): number {
    const key = localDayKey(now);
    return buildFacts(ctx, period, { now })
      .filter((f) => f.date.toISOString().slice(0, 10) === key)
      .reduce((s, f) => s + f.metrics.incomeUsd, 0);
  }

  it("sends за «сегодня» при 09:00 < при 21:00 ≤ при 23:59:59", () => {
    const s09  = todaySends(CTX_ACTIVE, PERIOD_JUNE, NOW_09);
    const s21  = todaySends(CTX_ACTIVE, PERIOD_JUNE, NOW_21);
    const sEod = todaySends(CTX_ACTIVE, PERIOD_JUNE, NOW_EOD);
    expect(s09).toBeLessThan(s21);
    expect(s21).toBeLessThanOrEqual(sEod);
  });

  it("факты за прошлый день идентичны при разных значениях now", () => {
    const key = localDayKey(YESTERDAY);
    function yesterdaySends(now: Date): number {
      return buildFacts(CTX_ACTIVE, PERIOD_JUNE, { now })
        .filter((f) => f.date.toISOString().slice(0, 10) === key)
        .reduce((s, f) => s + f.metrics.sends, 0);
    }
    expect(yesterdaySends(NOW_09)).toBe(yesterdaySends(NOW_21));
    expect(yesterdaySends(NOW_09)).toBe(yesterdaySends(NOW_EOD));
  });

  it("монотонность: sends/incomeUsd не убывают по мере роста now", () => {
    // Пять равномерно распределённых моментов в пределах одного дня.
    const ticks = [
      atHour(4, 0),
      atHour(8, 30),
      atHour(12, 0),
      atHour(16, 45),
      atHour(22, 0),
    ];
    let prevSends = -1;
    let prevIncome = -1;
    for (const t of ticks) {
      const s = todaySends(CTX_ACTIVE, PERIOD_JUNE, t);
      const inc = todayIncome(CTX_ACTIVE, PERIOD_JUNE, t);
      expect(s).toBeGreaterThanOrEqual(prevSends);
      expect(inc).toBeGreaterThanOrEqual(prevIncome);
      prevSends = s;
      prevIncome = inc;
    }
  });

  it("инвариант сходимости сохраняется при отскейленном «сегодня»", () => {
    // now = полдень — часть дня прошла, today факты отскейлены.
    const now = atHour(12, 0);
    const scaledFacts = buildFacts(CTX_ACTIVE, PERIOD_JUNE, { now });
    // Подстроки (по каналам) должны суммироваться в родителя (по кампании).
    for (const parent of groupFacts(scaledFacts, "campaigns")) {
      const parentAgg = aggregate(parent.facts);
      const subAgg = groupFacts(parent.facts, "channels").reduce(
        (acc, sg) => {
          const a = aggregate(sg.facts);
          for (const k of ADDITIVE) acc[k] += a[k];
          return acc;
        },
        { sends: 0, clicks: 0, actions: 0, holds: 0, approves: 0, rejects: 0 } as Record<
          (typeof ADDITIVE)[number],
          number
        >,
      );
      for (const k of ADDITIVE) expect(subAgg[k]).toBe(parentAgg[k]);
    }
  });
});
