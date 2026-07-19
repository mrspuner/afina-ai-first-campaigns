/**
 * Pure view-logic for trigger domains (Mechanic M2).
 *
 * System domains (TRIGGER_DOMAINS) are an indestructible layer. The user layer
 * (TriggerDelta) can *exclude* a system domain — a reversible operation that
 * never deletes the underlying system data. These helpers compute, from a
 * system-domain group list + the current delta:
 *   - which system domain GROUPS are still ACTIVE vs EXCLUDED;
 *   - a one-line preview ("show first N, then +M") for the collapsed card.
 *
 * Groups (DomainGroup: { root, subdomains }) are the unit of partitioning and
 * preview — a root domain and its subdomains move together. Comparison
 * against delta.excluded is by `group.root.toLowerCase()`.
 *
 * Rendering lives in step-2-interests.tsx; this module is intentionally
 * pure + unit-tested so the +N math and exclusion math are not coupled to React.
 */

import type { DomainGroup } from "@/data/trigger-domains";
import type { TriggerDelta } from "./trigger-edit-parser";

/**
 * How many system domain groups the collapsed card shows inline before
 * collapsing the rest into a "+N" chip. A FIXED count is used on purpose:
 * exact one-line fit needs DOM measurement and is overkill for the
 * prototype. 3 reads cleanly on the step-2 column width with typical .ru
 * domains.
 */
export const PREVIEW_VISIBLE_COUNT = 3;

export interface SystemDomainSplit {
  /** System domain groups NOT excluded by the user — shown as plain/✕ chips. */
  active: DomainGroup[];
  /** System domain groups the user has excluded — shown struck-through, reversible. */
  excluded: DomainGroup[];
}

/**
 * Partition `groups` into active vs excluded using `delta.excluded`.
 * Comparison is by `group.root.toLowerCase()`, case-insensitive. Order of
 * the original system list is kept. Excluded entries that don't match any
 * group's root are ignored here (those are user-added exclusions and
 * belong to DeltaBlock, not this split).
 */
export function splitSystemDomains(
  groups: DomainGroup[],
  delta: TriggerDelta
): SystemDomainSplit {
  const excludedLower = new Set(delta.excluded.map((d) => d.toLowerCase()));
  const active: DomainGroup[] = [];
  const excluded: DomainGroup[] = [];
  for (const group of groups) {
    if (excludedLower.has(group.root.toLowerCase())) excluded.push(group);
    else active.push(group);
  }
  return { active, excluded };
}

export interface DomainPreview {
  /** Domain groups rendered inline on the collapsed preview line. */
  visible: DomainGroup[];
  /** How many groups are hidden behind the "+N" chip. 0 → no overflow chip. */
  overflowCount: number;
}

/**
 * Take the first `visibleCount` domain groups for the collapsed one-line
 * preview and report how many overflow into the "+N" chip.
 */
export function previewDomains(
  groups: DomainGroup[],
  visibleCount: number
): DomainPreview {
  if (groups.length <= visibleCount) {
    return { visible: [...groups], overflowCount: 0 };
  }
  return {
    visible: groups.slice(0, visibleCount),
    overflowCount: groups.length - visibleCount,
  };
}

/** Number of subdomains folded into a group (excludes the root itself). */
export const subdomainCount = (g: DomainGroup) => g.subdomains.length;
