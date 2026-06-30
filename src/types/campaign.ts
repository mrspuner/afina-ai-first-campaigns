import type { SignalType } from "@/state/app-state";

export type SourceType = "new" | "stream" | "own";

export type Channel = "sms" | "push" | "email" | "ivr";

export const CHANNELS = ["sms", "push", "email", "ivr"] as const satisfies readonly Channel[];

export interface TriggerConfig {
  add: string;
  exclude: string;
}

export interface StepData {
  scenario: string | null;
  interests: string[];
  triggers: string[];
  triggerConfig: Record<string, TriggerConfig>;
  sourceType: SourceType;
  /** Selected communication channels. Empty array = degenerate campaign (no comms). */
  channels: Channel[];
  budget: number | null;
  /** Uploaded base files (one or more). Empty array = no base uploaded yet. */
  files: File[];
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

export const initialStepData: StepData = {
  scenario: null,
  interests: [],
  triggers: [],
  triggerConfig: {},
  sourceType: "new",
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
}
