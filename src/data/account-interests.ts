import type { AccountInterest, AccountSettings } from "@/types/account-settings";
import type { DirectionId } from "@/types/directions";
import { getInterestsForDirection } from "./interests-by-direction";
import { getInterestById } from "./triggers-by-vertical";

/**
 * Seed the account-level interest set from a business direction. Maps the
 * direction's interest ids to `AccountInterest` records with resolved labels;
 * ids missing from the interest library are dropped. Returns `[]` for an
 * unknown or null direction.
 */
export function buildAccountInterestSeed(
  directionId: DirectionId | null
): AccountInterest[] {
  if (!directionId) return [];
  return getInterestsForDirection(directionId)
    .map((id) => {
      const interest = getInterestById(id);
      return interest ? { id: interest.id, label: interest.label } : null;
    })
    .filter((i): i is AccountInterest => i !== null);
}

/**
 * Accept an AI-suggested interest: remove it from `suggestedInterests` and
 * append it to `interests` (unless already active). No-op when the id is not
 * a current suggestion. Returns a full `AccountSettings` value — all other
 * fields are preserved by reference.
 */
export function moveSuggestionToActive(
  settings: AccountSettings,
  interestId: string
): AccountSettings {
  const picked = settings.suggestedInterests.find((i) => i.id === interestId);
  if (!picked) return settings;
  const alreadyActive = settings.interests.some((i) => i.id === interestId);
  return {
    ...settings,
    interests: alreadyActive
      ? settings.interests
      : [...settings.interests, picked],
    suggestedInterests: settings.suggestedInterests.filter(
      (i) => i.id !== interestId
    ),
  };
}

/**
 * Demote an active interest back to AI suggestions: remove it from `interests`
 * and append it to `suggestedInterests` (unless already suggested). No-op when
 * the id is not currently active. Returns a full `AccountSettings` value — all
 * other fields are preserved by reference.
 */
export function moveActiveToSuggestion(
  settings: AccountSettings,
  interestId: string
): AccountSettings {
  const picked = settings.interests.find((i) => i.id === interestId);
  if (!picked) return settings;
  const alreadySuggested = settings.suggestedInterests.some(
    (i) => i.id === interestId
  );
  return {
    ...settings,
    interests: settings.interests.filter((i) => i.id !== interestId),
    suggestedInterests: alreadySuggested
      ? settings.suggestedInterests
      : [...settings.suggestedInterests, picked],
  };
}

/**
 * Справочник интересов для комбобокса «Добавить интерес» (спека #6): интересы,
 * релевантные направлению компании, минус уже активные. Контролируемый набор —
 * произвольные интересы не вводятся (маппятся на триггеры).
 */
export function buildInterestDirectory(
  directionId: DirectionId | null,
  activeIds: string[]
): { id: string; label: string }[] {
  if (!directionId) return [];
  const active = new Set(activeIds);
  const out: { id: string; label: string }[] = [];
  for (const id of getInterestsForDirection(directionId)) {
    if (active.has(id)) continue;
    const interest = getInterestById(id);
    if (interest) out.push({ id: interest.id, label: interest.label });
  }
  return out;
}
