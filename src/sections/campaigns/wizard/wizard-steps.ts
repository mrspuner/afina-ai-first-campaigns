import type { CampaignIntent } from "@/types/campaign";

export type WizardStepId =
  | "scenario" | "intent" | "interests" | "analysis" | "file" | "integration" | "channels" | "budget";

/**
 * The ordered wizard step list depends on the chosen intent (spec Часть I).
 * Until an intent is picked only scenario+intent are determined.
 *  - signals (A)        → interests, analysis, file, budget (no channels)
 *  - signals-comms (B)  → interests, analysis, file, channels, budget
 *  - comms-own (C)      → file, channels, budget (own base, no interests/analysis)
 */
export function stepsForIntent(intent: CampaignIntent | undefined): WizardStepId[] {
  const head: WizardStepId[] = ["scenario", "intent"];
  if (!intent) return head;
  const tail: WizardStepId[] =
    intent === "signals" ? ["interests", "analysis", "file", "budget"]
    : intent === "signals-comms" ? ["interests", "analysis", "file", "channels", "budget"]
    : ["file", "channels", "budget"]; // comms-own
  return [...head, ...tail];
}
