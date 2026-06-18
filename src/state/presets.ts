import { nanoid } from "nanoid";
import type {
  Campaign,
  CampaignStatus,
  Preset,
  Signal,
  SignalType,
} from "./app-state";
import type { StepData } from "@/types/campaign";
import { SCENARIOS } from "@/data/scenarios";
import { makeRng, splitSegments } from "./metrics";

const SIGNAL_TYPES: SignalType[] = [
  "Регистрация",
  "Первая сделка",
  "Апсейл",
  "Реактивация",
  "Возврат",
  "Удержание",
];

const PRETTY_NAMES = [
  "Летний апсейл премиум",
  "Возврат Q2",
  "Реактивация спящих",
  "Первая сделка — старт",
  "Регистрация онбординг",
  "Удержание VIP",
  "Апсейл флагман",
  "Возврат после месяца тишины",
];

const DAY_MS = 24 * 60 * 60 * 1000;

// PRNG (makeRng) и splitSegments берутся из единого движка чисел
// (src/state/metrics.ts) — никаких локальных генераторов.

function rndInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function rndPick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function rndPastDate(rng: () => number, spanDays: number, now: number): string {
  const offset = Math.floor(rng() * spanDays * DAY_MS);
  return new Date(now - offset).toISOString();
}

// Plausible filler for the "Настройки сигнала" table on preset (demo) signals.
// Interests/triggers are stored as display strings (the screen joins them
// verbatim), so readable labels are enough — no id lookup needed.
const INTERESTS_POOL = [
  "Ипотека и кредиты",
  "Автокредитование",
  "Инвестиции и вклады",
  "Премиальные продукты",
  "Рефинансирование",
  "Страхование",
  "Дебетовые карты",
  "Новостройки",
  "Лизинг",
  "Кэшбэк-программы",
];

const TRIGGERS_POOL = [
  "Посещение сайтов банков",
  "Сравнение кредитных ставок",
  "Заявка на ипотеку онлайн",
  "Кредитный калькулятор",
  "Поиск автомобиля в кредит",
  "Просмотр тарифов вкладов",
  "Брошенная заявка на карту",
  "Чтение обзоров инвестпродуктов",
];

function rndSample<T>(rng: () => number, arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

function buildWizardData(type: SignalType, rng: () => number): StepData {
  const scenarioId =
    SCENARIOS.find((s) => s.isBase && s.signalType === type)?.id ?? null;
  return {
    scenario: scenarioId,
    interests: rndSample(rng, INTERESTS_POOL, rndInt(rng, 2, 4)),
    triggers: rndSample(rng, TRIGGERS_POOL, rndInt(rng, 2, 3)),
    triggerConfig: {},
    // campaign-first контракт: сегментный шаг визарда удалён, добавлены
    // sourceType/channels (Task 1/Task 10).
    sourceType: "new",
    channels: [],
    budget: rndInt(rng, 30, 300) * 1000,
    file: null,
  };
}

export type PresetKey = "empty" | "mid" | "full";

type GenerateSignalsOpts = {
  count: number;
  seed: number;
  countRange: [number, number];
  dateSpanDays: number;
  now: number;
};

export function generateSignals(opts: GenerateSignalsOpts): Signal[] {
  const rng = makeRng(opts.seed);
  const out: Signal[] = [];
  for (let i = 0; i < opts.count; i++) {
    const type = SIGNAL_TYPES[i % SIGNAL_TYPES.length];
    const count = rndInt(rng, opts.countRange[0], opts.countRange[1]);
    const createdAt = rndPastDate(rng, opts.dateSpanDays, opts.now);
    const updatedAt = rndPastDate(rng, opts.dateSpanDays, opts.now);
    out.push({
      id: `sig_${nanoid(6)}_${i}`,
      type,
      count,
      segments: splitSegments(count, rng),
      createdAt,
      updatedAt,
      wizardData: buildWizardData(type, rng),
    });
  }
  return out;
}

type GenerateCampaignsOpts = {
  seed: number;
  signals: Signal[];
  distribution: Record<CampaignStatus, number>;
  dateSpanDays: number;
  now: number;
};

export function generateCampaigns(opts: GenerateCampaignsOpts): Campaign[] {
  const rng = makeRng(opts.seed);
  const statuses: CampaignStatus[] = [];
  (Object.keys(opts.distribution) as CampaignStatus[]).forEach((status) => {
    for (let i = 0; i < opts.distribution[status]; i++) statuses.push(status);
  });
  // shuffle deterministically
  for (let i = statuses.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [statuses[i], statuses[j]] = [statuses[j], statuses[i]];
  }

  const out: Campaign[] = [];
  let prettyUsed = 0;
  statuses.forEach((status, idx) => {
    const signal = rndPick(rng, opts.signals);
    const usePretty = rng() < 0.2 && prettyUsed < PRETTY_NAMES.length;
    const name = usePretty
      ? PRETTY_NAMES[prettyUsed++]
      : `${signal.type} #${idx + 1}`;
    const createdAt = rndPastDate(rng, opts.dateSpanDays, opts.now);
    const campaign: Campaign = {
      id: `cmp_${nanoid(6)}_${idx}`,
      name,
      signalId: signal.id,
      status,
      createdAt,
    };
    if (status === "active") {
      campaign.launchedAt = rndPastDate(rng, 30, opts.now);
    }
    if (status === "paused") {
      // Launched 5–30 days ago, paused some time AFTER launch (never before).
      const launchedMs = opts.now - (5 + Math.floor(rng() * 26)) * DAY_MS;
      campaign.launchedAt = new Date(launchedMs).toISOString();
      campaign.pausedAt = new Date(
        launchedMs + Math.floor(rng() * (opts.now - launchedMs))
      ).toISOString();
    }
    if (status === "completed") {
      // Launched within the span, completed between launch and now — so the
      // lifetime window [launchedAt, completedAt] is always valid (otherwise
      // the stats cube drops the campaign entirely).
      const launchedMs =
        opts.now - Math.floor(rng() * opts.dateSpanDays * DAY_MS);
      campaign.launchedAt = new Date(launchedMs).toISOString();
      campaign.completedAt = new Date(
        launchedMs + Math.floor(rng() * (opts.now - launchedMs))
      ).toISOString();
    }
    out.push(campaign);
  });
  return out;
}

function buildPresets(): Record<PresetKey, Preset> {
  const now = Date.now();

  const midSignals = generateSignals({
    count: 5,
    seed: 0x5eed,
    countRange: [500, 8000],
    dateSpanDays: 30,
    now,
  });
  const midCampaigns = generateCampaigns({
    seed: 0xcafe,
    signals: midSignals,
    distribution: { active: 2, paused: 1, completed: 3, draft: 2 },
    dateSpanDays: 30,
    now,
  });

  const fullSignals = generateSignals({
    count: 30,
    seed: 0xb16b00b5,
    countRange: [500, 50000],
    dateSpanDays: 90,
    now,
  });
  const fullCampaigns = generateCampaigns({
    seed: 0xf00d,
    signals: fullSignals,
    distribution: { active: 8, paused: 2, completed: 10, draft: 6 },
    dateSpanDays: 90,
    now,
  });

  return {
    empty: { key: "empty", label: "Empty", signals: [], campaigns: [] },
    mid: { key: "mid", label: "Mid", signals: midSignals, campaigns: midCampaigns },
    full: { key: "full", label: "Full", signals: fullSignals, campaigns: fullCampaigns },
  };
}

export const PRESETS: Record<PresetKey, Preset> = buildPresets();
