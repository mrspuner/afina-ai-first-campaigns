import type { SignalType } from "@/state/app-state";
import type { TriggerDelta } from "@/lib/trigger-edit-parser";

export type SourceType = "new" | "stream" | "own";

export type CampaignIntent = "signals" | "signals-comms" | "comms-own";
export type AnalysisMode = "once" | "stream";

/**
 * The legacy `sourceType` is kept as a DERIVED value so the ~30 downstream
 * read-sites (budget, workflow templates, progress, presets, reducer) keep
 * working unchanged. Intent decides the branch; analysisMode decides
 * one-time vs streaming.
 */
export function deriveSourceType(
  intent: CampaignIntent,
  analysisMode: AnalysisMode,
): SourceType {
  if (intent === "comms-own") return "own";
  return analysisMode === "stream" ? "stream" : "new";
}

export type Channel = "sms" | "push" | "email" | "ivr";

export const CHANNELS = ["sms", "push", "email", "ivr"] as const satisfies readonly Channel[];

/**
 * Лёгкая, сериализуемая модель загруженной базы. Тот же тип, что несёт
 * `Campaign.files`, — поэтому между визардом и кампанией конверсии нет, а
 * `StepData` целиком укладывается в снапшот (объекты `File` невосстановимы).
 */
export interface BaseFile {
  name: string;
  rowCount: number;
}

export interface StepData {
  scenario: string | null;
  interests: string[];
  triggers: string[];
  /**
   * Per-trigger domain edits (added/excluded domains) made in the shared
   * interests/triggers editor. Keyed by trigger **id** — the same id the
   * editor's internal `deltas` state and `Campaign.triggerConfig` use, so no
   * conversion happens moving between StepData and Campaign. `interests`/
   * `triggers` above stay LABEL arrays (unrelated, pre-existing convention);
   * the label↔id resolution for THOSE lives in `resolveSelectionIds`
   * (interests-triggers-editor.tsx) — triggerConfig never needs it.
   */
  triggerConfig: Record<string, TriggerDelta>;
  sourceType: SourceType;
  /** Step-2 branch key (A/B/C). Replaces sourceType as the primary branch. */
  intent: CampaignIntent;
  /** Разовый / потоковый — only meaningful for intents A and B. */
  analysisMode: AnalysisMode;
  /** Selected communication channels. Empty array = degenerate campaign (no comms). */
  channels: Channel[];
  budget: number | null;
  /** Загруженные базы (одна или несколько). Пустой массив — база не загружена. */
  files: BaseFile[];
  /**
   * Approximate total number of rows across ALL uploaded base files.
   * Populated on the upload step (база); downstream steps (budget) read it to
   * suggest a sensible default.
   */
  fileRowCount?: number;
  /**
   * Which budget option the user picked on step-5 — "recommended" reuses
   * the auto-suggested amount derived from base size, "custom" stores the
   * user's manual entry. Lets us restore the correct active card on revisit.
   */
  budgetMode?: "recommended" | "custom";
  /** Stream source only: per-day cap, alongside `budget` as the total ceiling. */
  dailyBudget?: number;
  /** Stream source only: integration API key entered on the Интеграция step. */
  apiKey?: string;
  /** Optional user-set ceiling shown in the budget summary. Display only —
   *  does NOT feed the cost model. Empty/undefined = not set. */
  maxDailyBudget?: number;
  /**
   * Own-source only: signal type chosen on the upload step to label the
   * uploaded signal list — one of the 6 `SIGNAL_TYPES`. A dedicated field,
   * distinct from `scenario` (the wizard's primary scenario) on purpose:
   * `handleNext`'s `scenarioChanged` reset watches `scenario`, so writing this
   * field never wipes the upload or rewinds the wizard. Undefined = not picked.
   */
  ownSignalType?: SignalType;
}

/**
 * Сериализуемый слепок ответов визарда, хранимый на кампании.
 *
 * Совпадает со `StepData` — после перевода `files` на `BaseFile` в нём нет
 * несериализуемых значений, поэтому параллельного типа не заводим. Псевдоним
 * существует ради читаемости на стороне `Campaign`.
 */
export type WizardSnapshot = StepData;

export const initialStepData: StepData = {
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

export interface StepProps {
  data: StepData;
  onNext: (partial: Partial<StepData>) => void;
  onBack?: () => void;
  onGoToStep?: (step: number) => void;
  /**
   * True when this step is the one the user is currently on. Several steps are
   * mounted at once (the wizard renders all reached steps in a scroll column),
   * so only the active step publishes its PromptBar hints via `useScreenHints`.
   */
  active?: boolean;
  /**
   * Живое уведомление о текущем выборе шага — до нажатия основной кнопки.
   * Нужно изолированному режиму правки (карточка → визард на одном шаге): он
   * сравнивает выбор со снапшотом и решает, какие шаги обнулились и как
   * читается основная кнопка. Обычный проход визарда коллбек не передаёт.
   * Вызывают только шаги, чьё значение может обнулить что-то ниже: scenario,
   * analysis, file, channels (см. `STEP_INVALIDATES` в wizard-navigation.ts).
   */
  onValueChange?: (partial: Partial<StepData>) => void;
  /**
   * Переопределение футера для изолированной сессии правки (Task 12).
   * Обычный проход визарда этот проп не передаёт — каждый шаг остаётся при
   * своей обычной подписи кнопки и обычном «Назад».
   *  - `continueLabel`/`backLabel` переопределяют подписи основной кнопки и
   *    «Назад» (сессия использует «Далее»/«Применить и вернуться» и «Отмена»
   *    вместо «Назад» — «Сценарий» решает Task 13, у него футера нет вовсе).
   *  - `hidden` скрывает футер целиком — так изолированная колонка растёт
   *    реактивно (шаг становится виден, чтобы показать пересчитанные цифры),
   *    но действующий футер сессии остаётся только у активного шага.
   */
  footerOverride?: {
    continueLabel?: string;
    backLabel?: string;
    hidden?: boolean;
  };
}
