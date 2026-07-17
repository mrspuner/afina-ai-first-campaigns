/**
 * Lightweight regex-based parser for trigger edit commands in the prompt-bar.
 *
 * Spec (docs/triggers-ai-edit-ux.md):
 *   - "добавь d1.ru, d2.ru"  → adds these domains to the trigger delta
 *   - "исключи d3.ru"        → adds these domains to the exclude delta
 *   - "убери всё что я добавлял" / "очисти добавленное" → clears `added`
 *   - "верни всё что я исключал" / "очисти исключённое" → clears `excluded`
 *   - any other input → returns a "fallback" command with the canonical message
 *
 * The parser is *forgiving*: a single input may contain both an "добавь" and
 * an "исключи" clause, and domains may be separated by commas, spaces, or
 * Russian semicolons. Domains are normalised to lowercase. Empty/dup tokens
 * are silently dropped — the goal is "make it feel smart on the prototype".
 */

export type ParsedTriggerCommand =
  | { kind: "edit"; add: string[]; exclude: string[] }
  | { kind: "clear-added" }
  | { kind: "clear-excluded" }
  | { kind: "fallback"; message: string };

export const TRIGGER_PARSER_FALLBACK_MESSAGE =
  "AI пока не подключён. Сейчас работают команды: «добавь domain1.ru, domain2.ru», «исключи domain3.ru».";

// Anchor on recognised verb stems. JS `\b` doesn't honour Cyrillic word
// boundaries, so we match as plain substrings (case-insensitive). Collisions
// with non-command speech are unlikely in this prototype's vocabulary.
const ADD_RE = /(?:добав(?:ь|ить|ляй|и|им|ляем)|включ(?:и|ить|ай))/iu;
const EXCLUDE_RE = /(?:исключ(?:и|ить|ай|ите|им)|убер(?:и|ите|ём))/iu;

const CLEAR_ADDED_RE =
  /(?:убер(?:и|ите|ём)|очист(?:и|ить))[^.!?]*(?:добав(?:л(?:енн|ял|ен)|и))/iu;
const CLEAR_EXCLUDED_RE =
  /(?:верн(?:и|ите|ём)|очист(?:и|ить))[^.!?]*(?:исключ(?:енн|ал|ен))/iu;

// A "domain-like" token: at least one dot, followed by 2-24 letters, no
// whitespace. We keep this loose on purpose — the prototype just needs
// recognisable strings, not full URL validation.
const DOMAIN_TOKEN_RE = /[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+/gi;

/**
 * Pull all domain-like tokens out of `text`. Lowercased + deduped, order
 * preserved.
 */
export function extractDomains(text: string): string[] {
  const matches = text.match(DOMAIN_TOKEN_RE) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    const normalised = m.toLowerCase().trim().replace(/[.,;]+$/, "");
    if (!normalised) continue;
    if (seen.has(normalised)) continue;
    seen.add(normalised);
    out.push(normalised);
  }
  return out;
}

/**
 * Split the input on the *second* recognised verb so that "добавь a.ru
 * исключи b.ru" yields two segments. Only the FIRST occurrence of each verb
 * is honoured — repeats are folded into the preceding segment.
 */
function splitByVerbs(input: string): { addPart: string; excludePart: string } {
  const lower = input.toLowerCase();
  const addIdx = lower.search(ADD_RE);
  const exIdx = lower.search(EXCLUDE_RE);

  if (addIdx === -1 && exIdx === -1) {
    return { addPart: "", excludePart: "" };
  }
  if (addIdx === -1) {
    return { addPart: "", excludePart: input.slice(exIdx) };
  }
  if (exIdx === -1) {
    return { addPart: input.slice(addIdx), excludePart: "" };
  }
  if (addIdx < exIdx) {
    return {
      addPart: input.slice(addIdx, exIdx),
      excludePart: input.slice(exIdx),
    };
  }
  return {
    addPart: input.slice(addIdx),
    excludePart: input.slice(exIdx, addIdx),
  };
}

export function parseTriggerCommand(rawInput: string): ParsedTriggerCommand {
  const input = rawInput.trim();
  if (!input) {
    return { kind: "fallback", message: TRIGGER_PARSER_FALLBACK_MESSAGE };
  }

  // Bulk-clear commands take precedence — they're explicitly meant to wipe
  // the delta even if no domains follow.
  if (CLEAR_ADDED_RE.test(input)) return { kind: "clear-added" };
  if (CLEAR_EXCLUDED_RE.test(input)) return { kind: "clear-excluded" };

  const hasAdd = ADD_RE.test(input);
  const hasExclude = EXCLUDE_RE.test(input);
  if (!hasAdd && !hasExclude) {
    return { kind: "fallback", message: TRIGGER_PARSER_FALLBACK_MESSAGE };
  }

  const { addPart, excludePart } = splitByVerbs(input);
  const add = extractDomains(addPart);
  const exclude = extractDomains(excludePart);

  // Verb present but no domains → still a fallback. "добавь" alone tells us
  // nothing actionable.
  if (add.length === 0 && exclude.length === 0) {
    return { kind: "fallback", message: TRIGGER_PARSER_FALLBACK_MESSAGE };
  }

  return { kind: "edit", add, exclude };
}

// ----------------------------------------------------------------------------
// Delta merge
// ----------------------------------------------------------------------------

/**
 * A trigger's user-layer edit: domains added on top of the system list, and
 * system domains excluded from it. `added`/`excluded` are domain STRING
 * references only — this is the durable shape persisted on
 * `Campaign.triggerConfig` / `StepData.triggerConfig`, both keyed by trigger
 * **id** (see `src/types/campaign.ts`). Per-domain account/availability
 * status is intentionally NOT stored here — it lives in a separate account
 * registry (Task 6), keyed off these same domain strings, so this delta stays
 * the single source of truth for "what the user asked to add/exclude".
 */
export interface TriggerDelta {
  added: string[];
  excluded: string[];
}

export const EMPTY_DELTA: TriggerDelta = { added: [], excluded: [] };

function dedupePreservingOrder(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((s) => s.toLowerCase()));
  const out = [...existing];
  for (const item of incoming) {
    const lower = item.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      out.push(lower);
    }
  }
  return out;
}

/**
 * Merge a parsed "edit" command into a delta. `add` domains move into
 * `added`, `exclude` domains into `excluded`. If the same domain appears in
 * both lists in a single command, exclude wins (matches user mental model:
 * "the last word is the one that takes effect").
 */
export function applyEditToDelta(
  delta: TriggerDelta,
  add: string[],
  exclude: string[]
): TriggerDelta {
  const excludeLower = new Set(exclude.map((s) => s.toLowerCase()));
  const addFiltered = add.filter((d) => !excludeLower.has(d.toLowerCase()));

  // Adding a domain that was previously excluded should *promote* it back to
  // added — and vice versa. This matches the chip-removal contract: the user
  // can always type to overwrite their last decision.
  const excludedNext = delta.excluded.filter(
    (d) => !addFiltered.some((a) => a.toLowerCase() === d.toLowerCase())
  );
  const addedNext = delta.added.filter(
    (d) => !excludeLower.has(d.toLowerCase())
  );

  return {
    added: dedupePreservingOrder(addedNext, addFiltered),
    excluded: dedupePreservingOrder(excludedNext, exclude),
  };
}

export function removeFromDelta(
  delta: TriggerDelta,
  bucket: "added" | "excluded",
  domain: string
): TriggerDelta {
  const lower = domain.toLowerCase();
  return {
    ...delta,
    [bucket]: delta[bucket].filter((d) => d.toLowerCase() !== lower),
  };
}

export function isDeltaEmpty(delta: TriggerDelta): boolean {
  return delta.added.length === 0 && delta.excluded.length === 0;
}
