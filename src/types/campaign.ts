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
  file: File | null;
  /**
   * Approximate number of rows in the uploaded base file. Populated on
   * step-4 (база) when a file is selected; downstream steps (budget) read
   * it to suggest a sensible default.
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
}

export const initialStepData: StepData = {
  scenario: null,
  interests: [],
  triggers: [],
  triggerConfig: {},
  sourceType: "new",
  channels: [],
  budget: null,
  file: null,
};

export interface StepProps {
  data: StepData;
  onNext: (partial: Partial<StepData>) => void;
  onBack?: () => void;
  onGoToStep?: (step: number) => void;
}
