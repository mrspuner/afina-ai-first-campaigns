import { VERTICALS, getInterestById } from "@/data/triggers-by-vertical";
import { getInterestsForDirection } from "@/data/interests-by-direction";
import type { Interest, Vertical } from "@/types/directions";
import type { InterestOption } from "./scoring-insights-drawer";

// Mirrors the wizard step's direction→interests resolution (step-2-interests),
// so the editable scoring drawer offers the SAME interest/trigger catalog the
// campaign was built from. Pure — safe to call anywhere.

function directionToVerticalId(direction: string): string {
  if (direction === "medicine") return "health";
  return direction;
}

function resolveVertical(direction: string): Vertical {
  const id = directionToVerticalId(direction);
  return VERTICALS.find((v) => v.id === id) ?? VERTICALS[0];
}

function resolveInterests(direction: string, vertical: Vertical): Interest[] {
  const curated = getInterestsForDirection(direction)
    .map((id) => getInterestById(id))
    .filter((i): i is Interest => i !== undefined);
  if (curated.length > 0) return curated;
  return vertical.interests;
}

/** The interest catalog (with each interest's triggers) for a client direction,
 *  shaped for the editable «Интересы и триггеры» drawer. */
export function resolveInterestOptions(direction: string): InterestOption[] {
  const vertical = resolveVertical(direction);
  return resolveInterests(direction, vertical).map((i) => ({
    label: i.label,
    triggerLabels: i.triggers.map((t) => t.label),
  }));
}
