/**
 * Pure helpers for the «Добавить свой домен» combobox (Task 8).
 *
 * The account-level domain registry (`AccountSettings.ownDomains`,
 * `domain_registered` reducer case — Task 6) matches domains by EXACT
 * string, so any free-typed input must be normalized at THIS input boundary
 * before it's compared against the registry or `knownTriggerDomains()`, or
 * dispatched for registration. Kept pure + unit-tested independently of the
 * combobox's React wiring.
 */

/**
 * Normalize a typed domain: trim whitespace, lowercase, strip a leading
 * `www.`, strip a trailing dot. Does NOT strip protocols/paths — the
 * combobox expects a bare domain, not a URL.
 */
export function normalizeDomainInput(raw: string): string {
  let d = raw.trim().toLowerCase();
  if (d.startsWith("www.")) d = d.slice(4);
  while (d.endsWith(".")) d = d.slice(0, -1);
  return d;
}

/**
 * Case-insensitive, ROOTS-ONLY membership check against
 * `knownTriggerDomains()`. A subdomain of a known brand (e.g.
 * `online.sberbank.ru`) is NOT a known root — it classifies as unknown and
 * routes to moderation, even though its root domain is known. That's
 * intentional (see Task 8 brief) — this helper does not attempt any
 * root-extraction/matching for subdomains.
 */
export function isKnownRootDomain(
  normalized: string,
  knownRoots: readonly string[]
): boolean {
  return knownRoots.some((root) => root.toLowerCase() === normalized);
}

/** Outcome of classifying a freshly-typed domain (post-normalization). */
export interface TypedDomainClassification {
  /** The normalized domain string — what actually gets added/dispatched. */
  domain: string;
  /** True when `domain` is a known trigger-domain root → immediately active,
   *  no registration dispatch needed. False → unknown, caller must dispatch
   *  `domain_registered` (routes to `pending`) before adding it. */
  isKnown: boolean;
}

/**
 * Normalize + classify a free-typed domain against the known trigger-domain
 * roots. The caller is responsible for the actual routing (add to
 * `delta.added` always; dispatch `domain_registered` only when `!isKnown`).
 */
export function classifyTypedDomain(
  raw: string,
  knownRoots: readonly string[]
): TypedDomainClassification {
  const domain = normalizeDomainInput(raw);
  return { domain, isKnown: isKnownRootDomain(domain, knownRoots) };
}

/**
 * The combobox's directory list: previously-registered own-domains
 * (`AccountSettings.ownDomains`, any status) minus the ones already present
 * in the CURRENT trigger's `delta.added` (nothing to re-add). Deduped,
 * case-insensitive, sorted for stable display.
 */
export function availableRegisteredDomains(
  ownDomains: readonly { domain: string }[],
  alreadyAdded: readonly string[]
): string[] {
  const addedLower = new Set(alreadyAdded.map((d) => d.toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { domain } of ownDomains) {
    const lower = domain.toLowerCase();
    if (addedLower.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    out.push(domain);
  }
  return out.sort((a, b) => a.localeCompare(b));
}
