import type { SourceType } from "@/types/campaign";

export type WizardStepId =
  | "scenario" | "source" | "interests" | "file" | "integration" | "channels" | "budget";

/**
 * The ordered wizard step list depends on the chosen source (spec §C). Until a
 * source is picked only scenario+source are determined.
 *  - new    → interests, file
 *  - own    → file (no interests)
 *  - stream → interests, integration (no file)
 */
export function stepsForSource(source: SourceType | undefined): WizardStepId[] {
  const head: WizardStepId[] = ["scenario", "source"];
  if (!source) return head;
  const tail: WizardStepId[] =
    source === "new" ? ["interests", "file"]
    : source === "own" ? ["file"]
    : ["interests", "integration"]; // stream
  return [...head, ...tail, "channels", "budget"];
}
