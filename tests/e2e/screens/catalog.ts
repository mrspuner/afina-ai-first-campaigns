// Screen regression catalog — one entry per app screen. Every screen is
// selected purely by a seeded `view` (the app is a single Next.js route whose
// view is a discriminated union in src/state/app-state.ts). Seeds use FIXED
// ids/timestamps so renders are deterministic.
//
// All imports are type-only on purpose: they are erased at runtime so Playwright
// never has to transpile app code to run this file. The StepData shape is
// rebuilt locally for the same reason.
import type { AppState, Campaign, Artifact, View } from "@/state/app-state";
import type { StepData } from "@/types/campaign";

export type Screen = {
  id: string;
  name: string;
  seed: Partial<AppState>;
  /** Playwright selector (page.locator) that must be visible once seeded. */
  expect: string;
  /** Optional selectors masked out of visual snapshots (non-deterministic regions). */
  mask?: string[];
  /**
   * Приложение скроллится внутренним контейнером, поэтому `fullPage` снимает
   * только первый экран. Для экранов с реальным контентом ниже сгиба ставим
   * `expand: true` — перед съёмкой вьюпорт растягивается на скрытую высоту.
   *
   * НЕ включать для шагов визарда: там контент центрируется по высоте экрана и
   * растёт вместе с вьюпортом (расширение уходит в разнос).
   */
  expand?: boolean;
  /**
   * Экран участвует в `npm run test:visual` (пиксельный снапшот). По умолчанию
   * `true`. Поставь `false` для экранов, у которых ещё нет baseline PNG —
   * они всё равно покрываются smoke-тестом (screens.smoke.spec.ts), просто без
   * пиксельного сравнения. Baseline генерируются вне ворктри (см. AGENTS.md:
   * не запускать `playwright ... --update-snapshots` из ворктри).
   */
  visual?: boolean;
};

// Shared, survey-passed, intro-skipped, funded base applied to every screen.
const FIXED: Partial<AppState> = {
  surveyStatus: "completed",
  introSeen: true,
  balance: 100_000,
};

// ---- Fixed fixtures (stable ids + timestamps) ----

const activeCampaign: Campaign = {
  id: "cmp_test01",
  name: "Тестовая кампания",
  status: "active",
  createdAt: "2026-06-01T10:00:00.000Z",
  launchedAt: "2026-06-15T14:30:00.000Z",
  sourceType: "new",
  channels: ["sms", "email"],
  interests: ["Кредитование"],
  budget: 50_000,
  // Past the scoring window already → the campaign card never starts the
  // pre-launch collection timer (SCORING_WINDOW_MS).
  phase: "communicating",
  scenario: { id: "base-registration", name: "Регистрация" },
};

const draftCampaign: Campaign = {
  id: "cmp_test02",
  name: "Черновик кампании",
  status: "draft",
  createdAt: "2026-06-20T09:00:00.000Z",
  sourceType: "new",
  channels: ["sms", "email", "push"],
  interests: ["Кредитование"],
  budget: 30_000,
  // The workflow/payment screens don't run the card collection timer, but set
  // a stable phase defensively so no draft path can spin one up.
  phase: "communicating",
  scenario: { id: "base-registration", name: "Регистрация" },
};

const noCommsCampaign: Campaign = {
  id: "cmp_test03",
  name: "Без коммуникации",
  status: "draft",
  createdAt: "2026-06-20T09:00:00.000Z",
  sourceType: "new",
  channels: [],
  phase: "communicating",
  scenario: { id: "base-registration", name: "Регистрация" },
};

// A2.1 — own-source draft: exercises the campaign card's «Сигнал» node-block
// (as opposed to the «Скоринг» block new/stream sources get).
const ownCampaign: Campaign = {
  id: "cmp_test04",
  name: "Своя база",
  status: "draft",
  createdAt: "2026-06-20T09:00:00.000Z",
  sourceType: "own",
  channels: ["sms"],
  files: [{ name: "crm-export.csv", rowCount: 3_400 }],
  phase: "communicating",
  scenario: { id: "base-registration", name: "Регистрация" },
};

const artifact: Artifact = {
  id: "art_test01",
  campaignId: "cmp_test01",
  kind: "signals_conversions",
  count: 12_500,
  createdAt: "2026-06-15T14:30:00.000Z",
};

// ---- Streaming-collection fixtures (Task II-8) ----
// A completed streaming campaign + its artifacts: one cumulative + five daily
// digests for the SAME campaignId. `status: "completed"` keeps the seed
// deterministic — the StreamDigestDriver only ticks `active` streams, so a
// completed one is a no-op and never appends more dailies after 7s. The
// collection card + detail render off artifacts (not status), so they still
// show. Fixed ids/dates/counts; cumulative.count == sum of the five dailies.
const streamCampaign: Campaign = {
  id: "cmp_stream01",
  name: "Ипотека под ключ",
  status: "completed",
  createdAt: "2026-06-01T10:00:00.000Z",
  launchedAt: "2026-06-10T09:00:00.000Z",
  completedAt: "2026-06-15T09:00:00.000Z",
  sourceType: "stream",
  channels: ["sms", "email"],
  interests: ["Ипотека"],
  budget: 40_000,
  phase: "communicating",
  scenario: { id: "base-registration", name: "Регистрация" },
};

const streamDailies: Artifact[] = [
  { id: "art_stream_d1", campaignId: "cmp_stream01", kind: "signals_conversions", count: 1_200, createdAt: "2026-06-10T09:00:00.000Z", variant: "daily", periodDate: "2026-06-10" },
  { id: "art_stream_d2", campaignId: "cmp_stream01", kind: "signals_conversions", count: 980, createdAt: "2026-06-11T09:00:00.000Z", variant: "daily", periodDate: "2026-06-11" },
  { id: "art_stream_d3", campaignId: "cmp_stream01", kind: "signals_conversions", count: 1_540, createdAt: "2026-06-12T09:00:00.000Z", variant: "daily", periodDate: "2026-06-12" },
  { id: "art_stream_d4", campaignId: "cmp_stream01", kind: "signals_conversions", count: 2_100, createdAt: "2026-06-13T09:00:00.000Z", variant: "daily", periodDate: "2026-06-13" },
  { id: "art_stream_d5", campaignId: "cmp_stream01", kind: "signals_conversions", count: 1_760, createdAt: "2026-06-14T09:00:00.000Z", variant: "daily", periodDate: "2026-06-14" },
];

// Cumulative count = sum of the five dailies (1200 + 980 + 1540 + 2100 + 1760).
const streamCumulative: Artifact = {
  id: "art_stream_cum",
  campaignId: "cmp_stream01",
  kind: "signals_conversions",
  count: 7_580,
  createdAt: "2026-06-14T09:00:00.000Z",
  variant: "cumulative",
};

const streamArtifacts: Artifact[] = [streamCumulative, ...streamDailies];

// ---- Wizard StepData (files are raw File[] in the app; the harness seeds [] —
//      downstream steps fall back to fileRowCount / FALLBACK_BASE). ----

const baseStepData: StepData = {
  scenario: null,
  interests: [],
  triggers: [],
  triggerConfig: {},
  sourceType: "new",
  intent: "signals-comms",
  analysisMode: "once",
  channels: [],
  budget: null,
  files: [],
};

function stepData(overrides: Partial<StepData>): StepData {
  return { ...baseStepData, ...overrides };
}

function guided(step: number, data: StepData): Partial<AppState> {
  return {
    ...FIXED,
    view: { kind: "guided-campaign" } satisfies View,
    wizardSeed: { step, stepData: data },
  };
}

const wizardData = stepData({
  scenario: "base-registration",
  sourceType: "new",
  interests: ["Кредитование"],
  triggers: ["Заявка на кредит"],
  channels: ["sms", "email"],
  fileRowCount: 12_500,
});

export const SCREENS: Screen[] = [
  {
    id: "welcome",
    name: "Приветствие",
    seed: { ...FIXED, view: { kind: "welcome" } },
    expect: 'h1:has-text("Добро пожаловать")',
  },
  {
    id: "survey",
    name: "Анкета",
    seed: { ...FIXED, surveyStatus: "not_started", view: { kind: "survey" } },
    expect: 'h1:has-text("С чего начнём")',
  },

  // ---- Wizard (single guided-campaign view; step selected via wizardSeed) ----
  // The intent-gated flow for the default intent («signals-comms», set in
  // baseStepData) is: Сценарий → Цель → Интересы → Режим → Файл → Каналы →
  // Бюджет — seven steps. Each screen seeds the step index into that list.
  {
    id: "wizard-1-scenario",
    name: "Визард · шаг 1 — Сценарий",
    seed: { ...FIXED, view: { kind: "guided-campaign" } },
    expect: 'h1:has-text("Выберите сценарий")',
  },
  {
    id: "wizard-2-intent",
    name: "Визард · шаг 2 — Цель",
    seed: guided(2, stepData({ scenario: "base-registration" })),
    expect: 'h1:has-text("Что хотите получить")',
  },
  {
    id: "wizard-3-interests",
    name: "Визард · шаг 3 — Интересы и триггеры",
    seed: guided(3, stepData({ scenario: "base-registration" })),
    expect: 'h1:has-text("Какие интересы")',
  },
  {
    id: "wizard-4-analysis",
    name: "Визард · шаг 4 — Режим анализа",
    seed: guided(
      4,
      stepData({
        scenario: "base-registration",
        interests: ["Кредитование"],
        triggers: ["Заявка на кредит"],
      }),
    ),
    expect: 'h1:has-text("Разовый или потоковый")',
  },
  {
    id: "wizard-5-file",
    name: "Визард · шаг 5 — Файл",
    seed: guided(
      5,
      stepData({
        scenario: "base-registration",
        interests: ["Кредитование"],
        triggers: ["Заявка на кредит"],
      }),
    ),
    expect: 'h1:has-text("Загрузите вашу базу")',
  },
  {
    id: "wizard-6-channels",
    name: "Визард · шаг 6 — Каналы",
    seed: guided(6, stepData({ ...wizardData, channels: [] })),
    expect: 'h1:has-text("Как будем общаться")',
  },
  {
    id: "wizard-7-budget",
    name: "Визард · шаг 7 — Бюджет",
    seed: guided(7, wizardData),
    expect: 'h1:has-text("Прогноз бюджета")',
  },

  // ---- Campaign lifecycle screens ----
  {
    id: "workflow-draft",
    name: "Воркфлоу — черновик",
    seed: {
      ...FIXED,
      campaigns: [draftCampaign],
      view: {
        kind: "workflow",
        campaign: { id: draftCampaign.id, name: draftCampaign.name },
        launched: false,
      },
    },
    expect: ".react-flow",
  },
  {
    id: "workflow-launched",
    name: "Воркфлоу — запущена",
    seed: {
      ...FIXED,
      campaigns: [activeCampaign],
      artifacts: [artifact],
      view: {
        kind: "workflow",
        campaign: { id: activeCampaign.id, name: activeCampaign.name },
        launched: true,
      },
    },
    expect: ".react-flow",
  },
  {
    id: "campaign-card",
    name: "Карточка кампании",
    seed: {
      ...FIXED,
      campaigns: [activeCampaign],
      artifacts: [artifact],
      view: {
        kind: "campaign",
        campaign: { id: activeCampaign.id, name: activeCampaign.name },
      },
    },
    expect: 'h1:has-text("Тестовая кампания")',
    // 500px контента ниже сгиба (внутренний скроллер)
    expand: true,
  },
  {
    id: "campaign-card-draft",
    name: "Карточка кампании — черновик (нодо-блок скоринга)",
    // A2.1 — draft new-source campaign: exercises the INTERACTIVE «Скоринг»
    // node-block («Добавить файл», «Интересы и триггеры» affordance).
    seed: {
      ...FIXED,
      campaigns: [draftCampaign],
      view: {
        kind: "campaign",
        campaign: { id: draftCampaign.id, name: draftCampaign.name },
      },
    },
    expect: 'h1:has-text("Черновик кампании")',
    // Нет baseline PNG ещё — покрыт smoke, но исключён из @visual.
    visual: false,
  },
  {
    id: "campaign-card-own",
    name: "Карточка кампании — своя база (нодо-блок сигнала)",
    // A2.1 — own-source campaign: exercises the «Сигнал» node-block (file
    // list, no interests/triggers row).
    seed: {
      ...FIXED,
      campaigns: [ownCampaign],
      view: {
        kind: "campaign",
        campaign: { id: ownCampaign.id, name: ownCampaign.name },
      },
    },
    expect: 'h1:has-text("Своя база")',
    // Нет baseline PNG ещё — покрыт smoke, но исключён из @visual.
    visual: false,
  },
  {
    id: "campaign-payment",
    name: "Оплата кампании",
    seed: {
      ...FIXED,
      campaigns: [draftCampaign],
      view: {
        kind: "campaign-payment",
        campaign: { id: draftCampaign.id, name: draftCampaign.name },
      },
    },
    expect: "text=Оплата запуска кампании",
  },
  {
    id: "campaign-payment-no-comms",
    name: "Оплата кампании — без коммуникации",
    seed: {
      ...FIXED,
      campaigns: [noCommsCampaign],
      view: {
        kind: "campaign-payment",
        campaign: { id: noCommsCampaign.id, name: noCommsCampaign.name },
      },
    },
    expect: "text=Оплата запуска кампании",
  },
  {
    id: "artifact",
    name: "Артефакт",
    seed: {
      ...FIXED,
      campaigns: [activeCampaign],
      artifacts: [artifact],
      view: { kind: "artifact", artifactId: artifact.id },
    },
    expect: 'h1:has-text("Сигналы и конверсии")',
    // 105px контента ниже сгиба (внутренний скроллер)
    expand: true,
  },

  // ---- Sidebar sections ----
  {
    id: "section-statistics",
    name: "Раздел — Статистика",
    // Seeded with a launched campaign + artifact so the fact-cube renders rows
    // and the «Номера»/«Сигналы» columns are visible in the baseline. The clock
    // is pinned (seed.ts) so the date-relative cube stays deterministic.
    seed: {
      ...FIXED,
      campaigns: [activeCampaign],
      artifacts: [artifact],
      view: { kind: "section", name: "Статистика" },
    },
    expect: 'h1:has-text("Сводный за период")',
    // 275px контента ниже сгиба (внутренний скроллер)
    expand: true,
  },
  {
    id: "section-artifacts",
    name: "Раздел — Артефакты",
    seed: {
      ...FIXED,
      campaigns: [activeCampaign],
      artifacts: [artifact],
      view: { kind: "section", name: "Артефакты" },
    },
    expect: 'h1:has-text("Артефакты")',
  },
  {
    id: "section-campaigns",
    name: "Раздел — Кампании",
    seed: {
      ...FIXED,
      campaigns: [activeCampaign, draftCampaign],
      artifacts: [artifact],
      view: { kind: "section", name: "Кампании" },
    },
    expect: 'h1:has-text("Кампании")',
  },
  {
    id: "section-settings",
    name: "Раздел — Настройки",
    seed: { ...FIXED, view: { kind: "section", name: "Настройки" } },
    expect: 'h1:has-text("Настройки")',
    // 1046px контента ниже сгиба (внутренний скроллер)
    expand: true,
  },

  // ---- Streaming artifacts (Task II-8) ----
  {
    id: "artifacts-collection",
    name: "Артефакты · коллекция потока",
    // Артефакты → Сигналы: the streaming campaign's cumulative + dailies
    // collapse into one ArtifactCollectionCard («Поток · …»). Completed stream
    // → the digest driver is a no-op, so the snapshot is stable.
    seed: {
      ...FIXED,
      campaigns: [streamCampaign],
      artifacts: streamArtifacts,
      view: { kind: "section", name: "Артефакты" },
    },
    expect: "text=Поток ·",
  },
  {
    id: "artifact-collection-detail",
    name: "Артефакт · детали коллекции",
    // Collection detail (ArtifactScreen) opened on the cumulative: «Всего
    // сигналов за период» total + «Дневные выжимки» list of the five dailies.
    seed: {
      ...FIXED,
      campaigns: [streamCampaign],
      artifacts: streamArtifacts,
      view: { kind: "artifact", artifactId: streamCumulative.id },
    },
    expect: "text=Дневные выжимки",
    // 455px контента ниже сгиба (внутренний скроллер)
    expand: true,
  },
];
