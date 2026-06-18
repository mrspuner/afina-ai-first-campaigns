// Statistics fact cube — the single coherent data model behind the report.
//
// The old mock data generated every row and sub-row from an independent random
// seed, so sub-rows never summed to their parent and a "campaign" row could be
// split by unrelated entities. This module replaces that with a real OLAP-style
// cube: a deterministic set of atomic delivery *facts* derived from the actual
// launched campaigns and their source signals. Each fact carries exactly one
// value per dimension plus numeric metrics. Any rows×subRows breakdown is just
// a group-by over the same facts, so:
//   • sub-rows always sum to their parent row, and
//   • the grand total is identical no matter which dimension you group by.
//
// Fact grain: campaign × active day × channel. Every other dimension is an
// attribute of the fact (real ones from the campaign, the rest assigned
// deterministically from per-campaign subsets of label pools).

import {
  addFunnel,
  campaignBaseSends,
  computeFunnel,
  EMPTY_FUNNEL,
  rngFor,
  scaleFunnel,
  seededInt,
  type FunnelNumbers,
} from "@/state/metrics";
import type { RowKind, SearchConditions } from "./statistics-state";
import {
  eachDay,
  formatDateRangeRu,
  formatDateRu,
  monthLabel,
  weekNumber,
  type DateRange,
} from "./period-utils";

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

const TIME_DIMS = ["days", "weekdays", "weeks", "months"] as const;
type TimeDim = (typeof TIME_DIMS)[number];

/** Non-temporal dimensions — stored explicitly on every fact. */
export type EntityDim = Exclude<RowKind, TimeDim>;

function isTimeDim(kind: RowKind): kind is TimeDim {
  return (TIME_DIMS as readonly string[]).includes(kind);
}

export type DimValue = {
  key: string;
  label: string;
  caption?: string;
  /** Sort hint: timestamp for time dims, weekday index for weekdays, else 0. */
  order: number;
};

export type Fact = {
  date: Date;
  metrics: FunnelNumbers;
  dims: Record<EntityDim, DimValue>;
};

/** Real launched campaigns + their signals, injected from app state. */
export type StatsContext = {
  campaigns?: readonly {
    id: string;
    name: string;
    // TODO(wave1): campaign-first инверсия сделала signalId опциональным —
    // статистика перейдёт на campaignId-keyed Artifact. Пока допускаем
    // отсутствие связи: кампания без signalId просто не подтянет count сигнала.
    signalId?: string;
    status: string;
    createdAt: string;
    launchedAt?: string;
    pausedAt?: string;
    completedAt?: string;
    scenario?: { id: string; name: string };
  }[];
  signals?: readonly { id: string; count: number }[];
};

// ---------------------------------------------------------------------------
// Label pools for invented dimensions (the universe of values; each campaign
// uses a deterministic subset). Real dims (campaigns, scenarios) are not here —
// their values come from the campaign itself.
// ---------------------------------------------------------------------------

export const POOLS: Record<Exclude<EntityDim, "campaigns" | "scenarios">, string[]> = {
  offers: [
    "Кредит наличными",
    "Депозит «Гибкий»",
    "Карта Cashback+",
    "Ипотека «Семейная»",
    "Автокредит Light",
    "Страхование жизни",
    "Премиум-пакет",
    "Подписка Pro",
    "Инвест-счёт",
    "Накопительный вклад",
  ],
  subscribers: [
    "Активные держатели карт",
    "Премиум-сегмент",
    "Новые клиенты 0–30 дней",
    "Отток-риск",
    "Молодая аудитория 18–25",
    "VIP-клиенты",
    "Зарплатный проект",
    "Неактивные 90+ дней",
    "Digital-only",
    "Региональные",
  ],
  channels: [
    "SMS",
    "Push",
    "Email",
    "Viber",
    "WhatsApp",
    "Звонок",
    "Личный кабинет",
    "Мобильное приложение",
  ],
  creatives: [
    "Баннер «Весна»",
    "Видео 15s",
    "Текст A/B #1",
    "Карусель «Преимущества»",
    "Лендинг v2",
    "Персональное письмо",
    "Статичный креатив",
    "Интерактивная форма",
  ],
  triggers: [
    "Покупка > 5000",
    "Забытая корзина",
    "Смена сегмента",
    "Реактивация 60 дней",
    "Приветственная серия",
    "Пост-покупка",
    "День рождения",
    "Геолокация: отделение",
  ],
  landings: [
    "Главная /offer-2026",
    "Лендинг кредита",
    "Лендинг депозита",
    "Страница акции",
    "Форма заявки",
    "Посадочная для push",
  ],
  strategies: [
    "Первичная витрина",
    "Каскадное сообщение",
    "A/B бандл",
    "Retention-треугольник",
    "Upsell-цепочка",
  ],
  advertisers: [
    "ООО «Вектор»",
    "АО «Северная звезда»",
    "ГК «Меридиан»",
    "ТД «Радуга»",
    "АО «Прогресс»",
  ],
  "traffic-suppliers": [
    "Yandex Ads",
    "VK Реклама",
    "MyTarget",
    "Google Ads",
    "Telegram Ads",
    "Ozon Ads",
  ],
};

const WEEKDAY_NAMES = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];

// How many distinct values each invented dimension spans per campaign.
const SUBSET_SIZE: Record<keyof typeof POOLS, [number, number]> = {
  channels: [2, 4],
  creatives: [2, 3],
  offers: [1, 3],
  landings: [1, 2],
  subscribers: [2, 4],
  triggers: [2, 3],
  strategies: [1, 1],
  advertisers: [1, 1],
  "traffic-suppliers": [1, 1],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isLaunched(status: string): boolean {
  return status === "active" || status === "paused" || status === "completed";
}

type CampaignLike = NonNullable<StatsContext["campaigns"]>[number];

/** Real lifetime of a campaign, clamped to whole days. Null if never launched. */
function campaignWindow(c: CampaignLike, now: Date): DateRange | null {
  if (!isLaunched(c.status)) return null;
  const from = dateOnly(new Date(c.launchedAt ?? c.createdAt));
  let end: Date;
  if (c.status === "completed") end = new Date(c.completedAt ?? now);
  else if (c.status === "paused") end = new Date(c.pausedAt ?? now);
  else end = now; // active → up to today, never the future
  const to = dateOnly(end);
  if (to.getTime() < from.getTime()) return null;
  return { from, to };
}

function intersect(a: DateRange, b: DateRange): DateRange | null {
  const from = new Date(Math.max(a.from.getTime(), b.from.getTime()));
  const to = new Date(Math.min(a.to.getTime(), b.to.getTime()));
  return from.getTime() <= to.getTime() ? { from, to } : null;
}

/** Deterministic subset of a pool, as dim values keyed by pool index. */
function pickSubset(
  kind: keyof typeof POOLS,
  campaignId: string,
): DimValue[] {
  const pool = POOLS[kind];
  const [min, max] = SUBSET_SIZE[kind];
  const rng = rngFor("subset", kind, campaignId);
  const n = Math.min(seededInt(rng, min, max), pool.length);
  const idx = pool.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx
    .slice(0, n)
    .map((i) => ({ key: `${kind}-${i}`, label: pool[i], order: 0 }));
}

/** Splits `total` across `weights` into integers that sum to exactly `total`. */
function distribute(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rem = total - out.reduce((a, b) => a + b, 0);
  const byFrac = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; rem > 0 && k < byFrac.length; k++, rem--) {
    out[byFrac[k].i]++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fact construction
// ---------------------------------------------------------------------------

/** Доля прошедшего дня (0..1) на момент `now`. Нижний порог 0.02 — чтобы
 *  утреннее демо не показывало нули; верхний порог 1 — в конце дня.
 *  Используем dateOnly (midnight local) для начала дня — тот же паттерн,
 *  что и в campaignWindow и eachDay. */
function intradayFraction(now: Date): number {
  const startOfDay = dateOnly(now); // midnight local
  const fraction = (now.getTime() - startOfDay.getTime()) / 86_400_000;
  return Math.max(0.02, Math.min(1, fraction));
}

/** Ключ «сегодняшнего» дня — строим через dateOnly, чтобы совпадал
 *  с ключами ячеек куба (те тоже создаются через dateOnly → midnight local). */
function todayKey(now: Date): string {
  return dateOnly(now).toISOString().slice(0, 10);
}

function buildCampaignFacts(
  c: CampaignLike,
  signalCount: number | undefined,
  days: Date[],
  now: Date,
): Fact[] {
  const base = campaignBaseSends(c.id, signalCount);
  if (base <= 0 || days.length === 0) return [];

  // Per-campaign dimension values.
  const channels = pickSubset("channels", c.id);
  const creatives = pickSubset("creatives", c.id);
  const offers = pickSubset("offers", c.id);
  const landings = pickSubset("landings", c.id);
  const subscribers = pickSubset("subscribers", c.id);
  const triggers = pickSubset("triggers", c.id);
  const strategy = pickSubset("strategies", c.id)[0];
  const advertiser = pickSubset("advertisers", c.id)[0];
  const trafficSupplier = pickSubset("traffic-suppliers", c.id)[0];

  const campaignDim: DimValue = {
    key: `cmp-${c.id}`,
    label: c.name,
    order: 0,
  };
  const scenarioDim: DimValue = c.scenario
    ? { key: `scn-${c.scenario.id}`, label: c.scenario.name, order: 0 }
    : { key: "scn-none", label: "Без сценария", order: 0 };

  // Weighted cells over (day × channel); distribute the campaign's total sends.
  const cells: { day: Date; channel: DimValue; weight: number }[] = [];
  for (const day of days) {
    const dayKey = day.toISOString().slice(0, 10);
    const dayW = 0.5 + rngFor("day-weight", c.id, dayKey)();
    for (const channel of channels) {
      const chW = 0.5 + rngFor("ch-weight", c.id, channel.key)();
      cells.push({ day, channel, weight: dayW * chW });
    }
  }
  const sends = distribute(base, cells.map((x) => x.weight));

  // Ключ «сегодня» и доля прошедшего дня — используем для масштабирования
  // фактов текущего дня; прошлые дни остаются полными и неизменными.
  const today = todayKey(now);
  const fraction = intradayFraction(now);

  const facts: Fact[] = [];
  cells.forEach((cell, i) => {
    const s = sends[i];
    if (s <= 0) return;
    const dayKey = cell.day.toISOString().slice(0, 10);
    const metricRng = rngFor("fact", c.id, dayKey, cell.channel.key);
    const pickRng = rngFor("fact-dims", c.id, dayKey, cell.channel.key);
    const pick = (arr: DimValue[]): DimValue =>
      arr[Math.floor(pickRng() * arr.length)];
    // Сегодняшние факты масштабируем долей прошедшего дня — числа монотонно
    // растут в течение сессии. Прошлые дни детерминированы и не меняются.
    const rawMetrics = computeFunnel(metricRng, s);
    const metrics = dayKey === today ? scaleFunnel(rawMetrics, fraction) : rawMetrics;
    facts.push({
      date: cell.day,
      metrics,
      dims: {
        campaigns: campaignDim,
        scenarios: scenarioDim,
        strategies: strategy,
        advertisers: advertiser,
        "traffic-suppliers": trafficSupplier,
        channels: cell.channel,
        creatives: pick(creatives),
        offers: pick(offers),
        landings: pick(landings),
        subscribers: pick(subscribers),
        triggers: pick(triggers),
      },
    });
  });
  return facts;
}

// Tiny memo: facts depend only on entities + period + campaign filter, not on
// the column/currency/sort/rows choices that change on every settings tweak.
let factCache: { key: string; facts: Fact[] } | null = null;

function cacheKey(ctx: StatsContext, period: DateRange, now: Date): string {
  const c = (ctx.campaigns ?? [])
    .map(
      (x) =>
        `${x.id}:${x.status}:${x.signalId ?? ""}:${x.launchedAt ?? ""}:${x.pausedAt ?? ""}:${x.completedAt ?? ""}:${x.createdAt}:${x.scenario?.id ?? ""}`,
    )
    .join("|");
  const s = (ctx.signals ?? []).map((x) => `${x.id}:${x.count}`).join("|");
  return `${period.from.getTime()}-${period.to.getTime()}|${now.getTime()}|${c}|${s}`;
}

/**
 * All delivery facts for the launched campaigns active during `period`. Cached
 * by entities+period+now; per-entity filtering (search conditions, campaign
 * scoping) is applied downstream via {@link filterFactsByConditions}, not here.
 */
export function buildFacts(
  ctx: StatsContext,
  period: DateRange,
  opts: { now?: Date } = {},
): Fact[] {
  const now = opts.now ?? new Date();
  const key = cacheKey(ctx, period, now);
  if (factCache && factCache.key === key) return factCache.facts;

  const countById = new Map(
    (ctx.signals ?? []).map((s) => [s.id, s.count] as const),
  );
  const facts: Fact[] = [];
  for (const c of ctx.campaigns ?? []) {
    const window = campaignWindow(c, now);
    if (!window) continue;
    const span = intersect(window, period);
    if (!span) continue; // campaign not active during this period → no rows
    const days = eachDay(span);
    facts.push(
      ...buildCampaignFacts(
        c,
        c.signalId ? countById.get(c.signalId) : undefined,
        days,
        now,
      ),
    );
  }
  factCache = { key, facts };
  return facts;
}

/** Dimension options for a label pool, keyed exactly like fact dim values. */
export function poolOptions(
  kind: keyof typeof POOLS,
): { value: string; label: string }[] {
  return POOLS[kind].map((label, i) => ({ value: `${kind}-${i}`, label }));
}

/**
 * Applies live search conditions to the fact set. Within an entity the values
 * are OR'd; across entities they are AND'd; excludes drop any matching fact.
 * Entity keys are dimension names (campaigns/offers/channels/…), so each fact's
 * value for that dimension is read via {@link dimValueOf} and matched by key —
 * the same `cmp-<id>` / `<kind>-<i>` / `scn-<id>` namespace the options use.
 */
export function filterFactsByConditions(
  facts: Fact[],
  conditions: SearchConditions,
): Fact[] {
  const include = Object.entries(conditions.include).filter(
    ([, v]) => v && v.length > 0,
  );
  const exclude = Object.entries(conditions.exclude).filter(
    ([, v]) => v && v.length > 0,
  );
  if (include.length === 0 && exclude.length === 0) return facts;
  return facts.filter((f) => {
    for (const [entity, values] of include) {
      if (!values.includes(dimValueOf(f, entity as RowKind).key)) return false;
    }
    for (const [entity, values] of exclude) {
      if (values.includes(dimValueOf(f, entity as RowKind).key)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/** The value of one fact along a dimension. Time dims bucket from `date`. */
export function dimValueOf(fact: Fact, kind: RowKind): DimValue {
  if (!isTimeDim(kind)) return fact.dims[kind];
  const d = fact.date;
  if (kind === "days") {
    return {
      key: `d-${d.toISOString().slice(0, 10)}`,
      label: formatDateRu(d),
      order: d.getTime(),
    };
  }
  if (kind === "weekdays") {
    const idx = (d.getDay() + 6) % 7;
    return { key: `wd-${idx}`, label: WEEKDAY_NAMES[idx], order: idx };
  }
  if (kind === "weeks") {
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return {
      key: `w-${weekStart.toISOString().slice(0, 10)}`,
      label: `Неделя ${weekNumber(d)}`,
      caption: formatDateRangeRu({ from: weekStart, to: weekEnd }),
      order: weekStart.getTime(),
    };
  }
  // months
  const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
  const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    key: `m-${d.getFullYear()}-${d.getMonth()}`,
    label: monthLabel(d),
    caption: formatDateRangeRu({ from: mStart, to: mEnd }),
    order: mStart.getTime(),
  };
}

export type FactGroup = {
  key: string;
  label: string;
  caption?: string;
  order: number;
  facts: Fact[];
};

export function aggregate(facts: Fact[]): FunnelNumbers {
  return facts.reduce((acc, f) => addFunnel(acc, f.metrics), { ...EMPTY_FUNNEL });
}

/**
 * Groups facts by a dimension, keeping each group's facts for further
 * sub-grouping. Time dims order newest-first (weekdays Mon→Sun); entity dims
 * order by descending send volume.
 */
export function groupFacts(facts: Fact[], kind: RowKind): FactGroup[] {
  const map = new Map<string, FactGroup>();
  for (const f of facts) {
    const dv = dimValueOf(f, kind);
    const cur = map.get(dv.key);
    if (cur) cur.facts.push(f);
    else
      map.set(dv.key, {
        key: dv.key,
        label: dv.label,
        caption: dv.caption,
        order: dv.order,
        facts: [f],
      });
  }
  const groups = [...map.values()];
  if (kind === "weekdays") {
    groups.sort((a, b) => a.order - b.order);
  } else if (isTimeDim(kind)) {
    groups.sort((a, b) => b.order - a.order);
  } else {
    groups.sort((a, b) => sumSends(b.facts) - sumSends(a.facts));
  }
  return groups;
}

function sumSends(facts: Fact[]): number {
  let n = 0;
  for (const f of facts) n += f.metrics.sends;
  return n;
}
