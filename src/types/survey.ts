import type { DirectionId } from "./directions";

export interface Survey {
  companyName: string;
  /**
   * @deprecated kept as an alias of `taskDescription` while the frozen
   * `app-state.ts` reducer still reads it (survey_completed / DEMO_SURVEY).
   * Foundation owner renames the reader; then this field can be dropped.
   */
  companyWebsite: string;
  /** Free-text description of the marketing task (replaces the website URL). */
  taskDescription: string;
  directionId: DirectionId | null;
}

export type SurveyStatus = "not_started" | "completed";

export const EMPTY_SURVEY: Survey = {
  companyName: "",
  companyWebsite: "",
  taskDescription: "",
  directionId: null,
};

/**
 * Pre-filled demo survey, mirroring DEMO_ACCOUNT_SETTINGS. Applied when a
 * non-empty dev preset is selected so the survey gate is satisfied without
 * hand-filling the form.
 */
export const DEMO_SURVEY: Survey = {
  companyName: "Альфа-Банк",
  // Unchanged site-like string: the frozen reducer copies companyWebsite into
  // accountSettings, and the hub's own test asserts on that path. Keeping it
  // avoids hub-test fallout (Foundation hand-off renames this to taskDescription).
  companyWebsite: "alfabank.ru",
  // New semantic field: the real free-text task description.
  taskDescription: "Привлечь клиентов на ипотеку и автокредиты",
  directionId: "banking",
};
