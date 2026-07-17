"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, X, Undo2 } from "lucide-react";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { VERTICALS, getInterestById } from "@/data/triggers-by-vertical";
import { getInterestsForDirection } from "@/data/interests-by-direction";
import {
  getTriggerDomains,
  knownTriggerDomains,
  type DomainGroup,
} from "@/data/trigger-domains";
import {
  PREVIEW_VISIBLE_COUNT,
  previewDomains,
  splitSystemDomains,
} from "@/lib/trigger-domain-view";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Interest, Trigger, Vertical } from "@/types/directions";
import {
  applyEditToDelta,
  EMPTY_DELTA,
  isDeltaEmpty,
  removeFromDelta,
  type ParsedTriggerCommand,
  type TriggerDelta,
} from "@/lib/trigger-edit-parser";
import { classifyTypedDomain } from "@/lib/domain-add";
import { usePromptChips } from "@/state/prompt-chips-context";
import { useRegisterTriggerEdit, type TriggerEditApi } from "@/state/trigger-edit-context";
import { computeRandomRemix } from "@/lib/random-remix";
import { InterestChip } from "@/sections/campaigns/interest-chip";
import { AddDomainCombobox } from "./add-domain-combobox";
import { cn } from "@/lib/utils";

/** Return a copy of `obj` without the given key. Avoids the
 *  `const { [k]: _, ...rest } = obj` pattern that triggers
 *  `no-unused-vars` in our ESLint config. */
function omitKey<T extends object, K extends keyof T>(
  obj: T,
  key: K
): Omit<T, K> {
  const next = { ...obj };
  delete next[key];
  return next;
}

/**
 * Map dev-panel `clientDirection` ids (legacy BUSINESS_DIRECTIONS) to vertical
 * ids in the spec-aligned data layer. Most match 1:1; "medicine" is renamed
 * to "health". Unknown ids fall through to a sensible default.
 */
function directionToVerticalId(direction: string): string {
  if (direction === "medicine") return "health";
  return direction;
}

function resolveVertical(direction: string): Vertical {
  const id = directionToVerticalId(direction);
  return VERTICALS.find((v) => v.id === id) ?? VERTICALS[0];
}

/**
 * Pick the relevant interests for the current direction.
 *   1. If `clientDirection` matches a key in INTERESTS_BY_DIRECTION, use that
 *      curated list (filtered to interests that exist in our data layer).
 *   2. Otherwise, fall back to all interests of the resolved vertical.
 */
function resolveInterests(direction: string, vertical: Vertical): Interest[] {
  const curated = getInterestsForDirection(direction)
    .map((id) => getInterestById(id))
    .filter((i): i is Interest => i !== undefined);
  if (curated.length > 0) return curated;
  return vertical.interests;
}

/**
 * The interest catalog (with each interest's triggers) for a client direction.
 * Shared by the editor (internal) and callers that need to resolve a campaign's
 * saved interest/trigger LABELS back to ids to seed the editor. Pure.
 */
export function resolveInterestsForDirection(direction: string): Interest[] {
  return resolveInterests(direction, resolveVertical(direction));
}

/**
 * Resolve a campaign's saved interest/trigger LABELS to the editor's internal
 * ids for the given direction. Labels not present in the direction catalog are
 * dropped (the editor only renders the catalog — same as the wizard).
 */
export function resolveSelectionIds(
  direction: string,
  selection: { interests: string[]; triggers: string[] }
): { interestIds: string[]; triggerIds: string[] } {
  const catalog = resolveInterestsForDirection(direction);
  const interestByLabel = new Map(catalog.map((i) => [i.label, i.id]));
  const triggerByLabel = new Map<string, string>();
  for (const i of catalog) {
    for (const t of i.triggers) triggerByLabel.set(t.label, t.id);
  }
  return {
    interestIds: selection.interests
      .map((label) => interestByLabel.get(label))
      .filter((id): id is string => id !== undefined),
    triggerIds: selection.triggers
      .map((label) => triggerByLabel.get(label))
      .filter((id): id is string => id !== undefined),
  };
}

function MascotHintIcon() {
  return (
    <Image src="/mascot-icon.svg" alt="" width={14} height={14} aria-hidden />
  );
}

const MASCOT_HINT_TEXT = "Опишите задачу в строке ниже";
const MASCOT_HINT_LINGER_MS = 4000;

/**
 * Поповер-подсказка над маскот-кнопкой. Показывается на клик, авто-исчезает
 * через {@link MASCOT_HINT_LINGER_MS} мс, и сворачивается раньше — если
 * чипсина с указанным id ушла из PromptBar (сабмит → clearChips, или замена
 * на другую чипсину). Позиция: точно над якорем, центрирование по горизонтали.
 */
function useMascotHint(chipId: string) {
  const [hintOpen, setHintOpen] = useState(false);
  const { chips } = usePromptChips();
  const isMyChipPresent = chips.some((c) => c.id === chipId);
  const open = hintOpen && isMyChipPresent;

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setHintOpen(false), MASCOT_HINT_LINGER_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  return { open, show: () => setHintOpen(true) };
}

function MascotHint({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <span className="relative inline-flex">
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            role="status"
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 whitespace-nowrap rounded-md border border-white/10 bg-[#171717] px-2.5 py-1.5 text-xs text-foreground shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
          >
            {MASCOT_HINT_TEXT}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function SectionHeader({
  label,
  sectionId,
  onClick,
}: {
  label: string;
  sectionId: "interests" | "triggers";
  onClick: () => void;
}) {
  const { open, show } = useMascotHint(`section_${sectionId}`);
  return (
    <div className="mb-3 flex items-center gap-2">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <MascotHint open={open}>
        <button
          type="button"
          onClick={() => {
            onClick();
            show();
          }}
          aria-label={`Спросить AI про ${label.toLowerCase()}`}
          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          data-section-id={sectionId}
        >
          <MascotHintIcon />
        </button>
      </MascotHint>
    </div>
  );
}

/** Read-only section header — the plain label without the AI mascot affordance. */
function ReadOnlySectionHeader({ label }: { label: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function DeltaChip({
  domain,
  variant,
  onRemove,
}: {
  domain: string;
  variant: "added" | "excluded";
  onRemove: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
        variant === "added"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
      )}
    >
      <span className={cn(variant === "excluded" && "line-through")}>
        {domain}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Удалить ${domain}`}
        className="opacity-60 transition-opacity hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/** How many system domain groups the EXPANDED trigger card shows inline
 *  before collapsing the rest into a "+N" chip (click reveals the rest).
 *  Distinct from `PREVIEW_VISIBLE_COUNT` (3), which governs the COLLAPSED
 *  one-line preview only. */
const EXPANDED_VISIBLE_GROUP_COUNT = 10;

interface TriggerCardProps {
  trigger: Trigger;
  domains: DomainGroup[];
  selected: boolean;
  delta: TriggerDelta;
  highlight: boolean;
  onToggle: () => void;
  onCheckboxToggle: () => void;
  onRemoveDelta: (bucket: "added" | "excluded", domain: string) => void;
  onExcludeSystemDomain: (domain: string) => void;
  onRestoreSystemDomain: (domain: string) => void;
  /** Account's previously-registered own-domains (any status) — the
   *  «Добавить свой домен» combobox's directory list (Task 8). */
  registeredDomains: readonly string[];
  onSelectRegisteredDomain: (domain: string) => void;
  onSubmitTypedDomain: (raw: string) => void;
}

/**
 * Chip for a SYSTEM domain GROUP in the expanded trigger card.
 *  - active   → neutral chip with ✕; ✕ excludes the WHOLE group (reversible).
 *  - excluded → struck-through red chip with ↩; click restores the group.
 * Label is the group's `root`; a muted (never brand-yellow) " ·N" counter is
 * appended when the group has subdomains. Clicking the label (when there are
 * subdomains to show) opens a tooltip listing them — a read-only preview, no
 * per-subdomain controls. System data is never deleted — exclusion lives in
 * the user-layer delta, keyed by `root`.
 */
function SystemDomainChip({
  group,
  excluded,
  onExclude,
  onRestore,
}: {
  group: DomainGroup;
  excluded: boolean;
  onExclude: () => void;
  onRestore: () => void;
}) {
  // Controlled (click-driven), unlike the rest of the codebase's uncontrolled
  // hover Tooltips: the domains spec requires the subdomain list to be
  // reachable deterministically (click), not only on hover — so `open` is
  // owned here and only forced true on click; base-ui's own hover/focus/
  // outside-click/escape handling still drives it closed via `onOpenChange`.
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const hasSubdomains = group.subdomains.length > 0;

  if (excluded) {
    return (
      <button
        type="button"
        onClick={onRestore}
        aria-label={`Вернуть ${group.root}`}
        className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-xs text-rose-700 transition-colors hover:bg-rose-500/20 dark:text-rose-300"
      >
        <span className="line-through">{group.root}</span>
        <Undo2 className="h-3 w-3 opacity-70" />
      </button>
    );
  }

  const label = (
    <>
      {group.root}
      {hasSubdomains && (
        <span className="text-muted-foreground"> ·{group.subdomains.length}</span>
      )}
    </>
  );

  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs text-foreground/85">
      {hasSubdomains ? (
        <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
          <TooltipTrigger
            // Base-ui's Tooltip.Trigger closes on its own reference-press
            // dismiss by default (`closeOnClick` defaults true), which would
            // immediately re-close the tooltip we just opened via onClick
            // below. Disable it — this trigger is click-to-open, not
            // click-to-toggle.
            closeOnClick={false}
            render={
              <button
                type="button"
                onClick={() => setTooltipOpen(true)}
                aria-label={`Поддомены ${group.root}`}
              />
            }
          >
            {label}
          </TooltipTrigger>
          <TooltipContent side="top" align="start">
            <ul className="flex flex-col gap-0.5 font-mono">
              {group.subdomains.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      ) : (
        <span>{label}</span>
      )}
      <button
        type="button"
        onClick={onExclude}
        aria-label={`Исключить ${group.root}`}
        className="opacity-50 transition-opacity hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function TriggerCard({
  trigger,
  domains,
  selected,
  delta,
  highlight,
  onToggle,
  onCheckboxToggle,
  onRemoveDelta,
  onExcludeSystemDomain,
  onRestoreSystemDomain,
  registeredDomains,
  onSelectRegisteredDomain,
  onSubmitTypedDomain,
}: TriggerCardProps) {
  // Selection IS expansion: a selected trigger is highlighted, open and
  // editable; an unselected one is collapsed to a read-only domain preview.
  const { active: activeSystemDomains, excluded: excludedSystemDomains } =
    splitSystemDomains(domains, delta);
  // Collapsed preview: first PREVIEW_VISIBLE_COUNT active domains as chips + "+N".
  const collapsedPreview = previewDomains(
    activeSystemDomains,
    PREVIEW_VISIBLE_COUNT
  );
  // Expanded card: first EXPANDED_VISIBLE_GROUP_COUNT groups (all of them —
  // active + excluded, same order as the system list), then a "+N" chip that
  // reveals the rest on click. Local + one-way (no re-collapse) — this is a
  // reveal affordance, not a toggle.
  const [allGroupsShown, setAllGroupsShown] = useState(false);
  const visibleGroups = allGroupsShown
    ? domains
    : domains.slice(0, EXPANDED_VISIBLE_GROUP_COUNT);
  const groupOverflowCount = domains.length - EXPANDED_VISIBLE_GROUP_COUNT;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border transition-colors",
        selected
          ? "border-brand/50 bg-brand-muted"
          : "border-border bg-card hover:border-brand/30",
        highlight && "ring-2 ring-brand transition-shadow"
      )}
    >
      <div className="flex w-full items-center gap-2 px-3 py-2.5 text-sm">
        {/* Чекбокс — самостоятельный тоггл: доступен всегда, выключает даже
            активный триггер. Отделён от клика по названию, чтобы тот только
            выбирал+раскрывал, но не снимал выбор. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={selected ? "Снять выбор триггера" : "Выбрать триггер"}
          onClick={(e) => {
            e.stopPropagation();
            onCheckboxToggle();
          }}
          className={cn(
            "nodrag flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:border-brand/50"
          )}
        >
          {selected && <Check className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={
            selected ? "Триггер выбран — открыть в строке" : "Выбрать и раскрыть триггер"
          }
          className={cn(
            "flex-1 text-left font-medium",
            selected ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {trigger.label}
        </button>
      </div>

      {/* Collapsed (unselected): read-only system-domain preview as chips +
          "+N". Clicking it selects + expands the card — there is no separate
          expand control. */}
      {!selected && (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Выбрать и раскрыть триггер"
          className="flex w-full flex-wrap items-center gap-1.5 border-t border-primary/20 bg-background/40 px-3 py-3 text-left"
        >
          {collapsedPreview.visible.map((group) => (
            <span
              key={group.root}
              className="inline-flex items-center rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs text-foreground/85"
            >
              {group.root}
            </span>
          ))}
          {collapsedPreview.overflowCount > 0 && (
            <span className="inline-flex items-center rounded-md border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground">
              +{collapsedPreview.overflowCount}
            </span>
          )}
        </button>
      )}

      {/* Expanded (selected): first EXPANDED_VISIBLE_GROUP_COUNT domain GROUPS
          as chips, then (if more exist) a "+N" chip revealing the rest, then
          user-added domains as green chips, then the dashed button that adds
          a new domain via the prompt bar. System domain groups carry a
          reversible ✕ that excludes the whole group. */}
      {selected && (
        <div className="animate-in fade-in-0 slide-in-from-top-1 border-t border-primary/20 bg-background/40 px-3 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {visibleGroups.map((group) => (
              <SystemDomainChip
                key={`sys-${group.root}`}
                group={group}
                excluded={excludedSystemDomains.some(
                  (e) => e.root.toLowerCase() === group.root.toLowerCase()
                )}
                onExclude={() => onExcludeSystemDomain(group.root)}
                onRestore={() => onRestoreSystemDomain(group.root)}
              />
            ))}
            {!allGroupsShown && groupOverflowCount > 0 && (
              <button
                type="button"
                onClick={() => setAllGroupsShown(true)}
                aria-label={`Показать ещё ${groupOverflowCount} доменов`}
                className="inline-flex items-center rounded-md border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
              >
                +{groupOverflowCount}
              </button>
            )}
            {delta.added.map((d) => (
              <DeltaChip
                key={`add-${d}`}
                domain={d}
                variant="added"
                onRemove={() => onRemoveDelta("added", d)}
              />
            ))}
            <AddDomainCombobox
              alreadyAdded={delta.added}
              registeredDomains={registeredDomains}
              onSelectRegistered={onSelectRegisteredDomain}
              onSubmitTyped={onSubmitTypedDomain}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Read-only trigger card: label + its active domains as static mono chips
 *  (system domains minus excluded, plus user-added). No checkbox, no editing. */
function ReadOnlyTriggerCard({
  trigger,
  domains,
  delta,
}: {
  trigger: Trigger;
  domains: DomainGroup[];
  delta: TriggerDelta;
}) {
  const { active } = splitSystemDomains(domains, delta);
  const shownCount = active.length + delta.added.length;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground">
        {trigger.label}
      </div>
      {shownCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border bg-background/40 px-3 py-3">
          {active.map((group) => (
            <span
              key={group.root}
              className="inline-flex items-center rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs text-foreground/85"
            >
              {group.root}
            </span>
          ))}
          {delta.added.map((d) => (
            <span
              key={d}
              className="inline-flex items-center rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs text-foreground/85"
            >
              {d}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export interface InterestsTriggersEditorSelection {
  interests: string[];
  triggers: string[];
  /** Keyed by trigger id — see the doc comment on `StepData.triggerConfig`. */
  triggerConfig: Record<string, TriggerDelta>;
}

export interface InterestsTriggersEditorProps {
  /**
   * Pre-selected interest ids. The wizard passes `StepData.interests`
   * (resolved-as-ids on resume); the scoring drawer passes ids resolved from
   * the campaign's saved LABELS via {@link resolveSelectionIds}.
   */
  initialInterestIds?: string[];
  initialTriggerIds?: string[];
  /**
   * Per-trigger domain edits to seed the editor's internal `deltas` state
   * with, keyed by trigger id (`StepData.triggerConfig` / durable
   * `Campaign.triggerConfig` — same key, no conversion). Read once on mount,
   * same contract as `initialInterestIds`/`initialTriggerIds`. Passing this
   * is what makes domain add/exclude edits survive a remount (drawer
   * close/reopen, wizard step re-entry).
   */
  initialDeltas?: Record<string, TriggerDelta>;
  /**
   * When true AND there is no initial selection, seed the selection via the
   * deterministic AI-fill random pick (the wizard's "already prepared for you"
   * UX). Off for the drawer, which must reflect the campaign's real selection.
   */
  seedWhenEmpty?: boolean;
  /** Subscribe to the global `wizardRemixToken` re-roll (wizard only). */
  enableRemix?: boolean;
  /** Read-only (launched campaign): render static content, no editing/AI. */
  readOnly?: boolean;
  /** Fires on every selection/delta change with LABELS + triggerConfig. */
  onChange?: (next: InterestsTriggersEditorSelection) => void;
}

// Deterministic seeded RNG so the AI-fill prefill is stable for a given
// direction across remounts within the same session, while still varying
// between directions.
function seededRandom(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickN<T>(items: readonly T[], n: number, rng: () => number): T[] {
  if (n >= items.length) return [...items];
  const copy = [...items];
  // Fisher-Yates shuffle, take first n.
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/**
 * The shared interests/triggers editor: the interests chips, the trigger cards
 * with per-trigger domains/deltas, and the «Настроить триггер» AI prompt-bar
 * bridge (chips + trigger-edit registry). Used BOTH by the wizard's
 * `Step2Interests` (wrapped in `StepContent` + `StepFooter`) and by the scoring
 * node's «Афина ИИ» drawer, so both surfaces are visually + functionally
 * identical. State is internal (ids); every change is surfaced via `onChange`
 * as LABELS so the wizard can advance and the drawer can persist.
 */
export function InterestsTriggersEditor({
  initialInterestIds = [],
  initialTriggerIds = [],
  initialDeltas,
  seedWhenEmpty = false,
  enableRemix = false,
  readOnly = false,
  onChange,
}: InterestsTriggersEditorProps) {
  const { clientDirection, wizardRemixToken, accountSettings } = useAppState();
  const dispatch = useAppDispatch();
  const { pushChip, clearChips, removeChip } = usePromptChips();
  // «Добавить свой домен» combobox (Task 8): the account's previously-
  // registered own-domains (any status) form the directory list, and the
  // known trigger-domain roots decide whether a free-typed domain lands
  // active immediately or needs a `domain_registered` dispatch (→ pending).
  const registeredDomains = useMemo(
    () => accountSettings.ownDomains.map((d) => d.domain),
    [accountSettings.ownDomains]
  );
  const knownRoots = useMemo(
    () => knownTriggerDomains().map((d) => d.id),
    []
  );
  const vertical = useMemo(
    () => resolveVertical(clientDirection),
    [clientDirection]
  );
  const interestsForDirection = useMemo(
    () => resolveInterests(clientDirection, vertical),
    [clientDirection, vertical]
  );

  // Pre-fill on first mount: use the provided initial selection, else (wizard
  // only) demonstrate the "AI already prepared this for you" behavior by seeding
  // a stable, direction-seeded random pick. Off for the drawer (seedWhenEmpty
  // false) so an empty campaign stays empty.
  const initialPrefill = useMemo(() => {
    if (initialInterestIds.length > 0 || initialTriggerIds.length > 0) {
      return { interestIds: initialInterestIds, triggerIds: initialTriggerIds };
    }
    if (!seedWhenEmpty) {
      return { interestIds: [] as string[], triggerIds: [] as string[] };
    }
    const rng = seededRandom(clientDirection.length || 1);
    const interestIds = pickN(
      interestsForDirection.map((i) => i.id),
      Math.min(3, interestsForDirection.length),
      rng
    );
    const availableTriggerIds = interestsForDirection
      .filter((i) => interestIds.includes(i.id))
      .flatMap((i) => i.triggers.map((t) => t.id));
    const triggerIds = pickN(availableTriggerIds, Math.min(5, availableTriggerIds.length), rng);
    return { interestIds, triggerIds };
    // We intentionally compute this once on mount — that's the AI-fill UX.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedInterests, setSelectedInterests] = useState<string[]>(
    initialPrefill.interestIds
  );
  const [selectedTriggers, setSelectedTriggers] = useState<string[]>(
    initialPrefill.triggerIds
  );
  const [deltas, setDeltas] = useState<Record<string, TriggerDelta>>(
    () => initialDeltas ?? {}
  );
  const [highlightedTriggerIds, setHighlightedTriggerIds] = useState<
    Set<string>
  >(() => new Set());

  // The list of trigger objects available — flattened from all interests
  // selected (so user can mix triggers across multiple interests).
  const availableTriggers = useMemo<Array<{
    interest: Interest;
    trigger: Trigger;
  }>>(() => {
    return interestsForDirection
      .filter((i) => selectedInterests.includes(i.id))
      .flatMap((interest) =>
        interest.triggers.map((trigger) => ({ interest, trigger }))
      );
  }, [interestsForDirection, selectedInterests]);

  // Lookup map for resolving id → trigger object (used by onChange + the api).
  const triggerById = useMemo(() => {
    const m = new Map<string, Trigger>();
    for (const { trigger } of availableTriggers) m.set(trigger.id, trigger);
    return m;
  }, [availableTriggers]);

  // Surface the current selection to the caller as LABELS (interests/
  // triggers — the pre-existing convention downstream reads/displays) plus
  // triggerConfig, which is just `deltas` passed through unchanged: both are
  // keyed by trigger id, so there is no re-keying to do here.
  useEffect(() => {
    if (!onChange) return;
    const interestLabels = selectedInterests
      .map((id) => interestsForDirection.find((i) => i.id === id)?.label)
      .filter((l): l is string => Boolean(l));
    const triggerLabels: string[] = [];
    // Only surface config for triggers currently selected — `deltas` retains
    // entries for deselected triggers (so reselecting within the session
    // restores them), but the emitted payload must prune them, or a leaked
    // orphan entry (no matching `triggers` label) persists onto
    // Campaign.triggerConfig/StepData.triggerConfig.
    const triggerConfig: Record<string, TriggerDelta> = {};
    for (const triggerId of selectedTriggers) {
      const t = triggerById.get(triggerId);
      if (!t) continue;
      triggerLabels.push(t.label);
      const d = deltas[triggerId];
      if (d) triggerConfig[triggerId] = d;
    }
    onChange({ interests: interestLabels, triggers: triggerLabels, triggerConfig });
  }, [
    selectedInterests,
    selectedTriggers,
    deltas,
    interestsForDirection,
    triggerById,
    onChange,
  ]);

  function toggleInterest(id: string) {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  // Один активный тег на триггер: id фиксирован, повторный клик переписывает
  // чип, а не плодит новые (pushChip дедупит по id). Тот же id использует
  // handleAddDomain — пути «клик по карточке» и «добавить домен» ссылаются на
  // один тег.
  function pushTriggerChip(triggerId: string, triggerLabel: string) {
    pushChip({
      id: `trigger_${triggerId}`,
      kind: "trigger",
      label: triggerLabel,
      payload: triggerId,
      removable: true,
    });
  }

  // Клик по карточке ВСЕГДА выбирает триггер (никогда не снимает выбор) и
  // отправляет его тегом в PromptBar — чтобы по нему можно было сразу дать
  // команду (например, «проверить доступность доменов»). Уже выбранный триггер
  // остаётся выбранным; невыбранный — активируется (появляется чекбокс).
  function selectTrigger(triggerId: string, triggerLabel: string) {
    setSelectedTriggers((prev) =>
      prev.includes(triggerId) ? prev : [...prev, triggerId]
    );
    pushTriggerChip(triggerId, triggerLabel);
  }

  // Клик по чекбоксу — независимый тоггл выбора (включить/выключить), доступен
  // всегда. Включение также кладёт тег в бар; выключение убирает его, чтобы
  // контекст триггера в PromptBar не «завис» на снятом триггере.
  function toggleTriggerCheckbox(triggerId: string, triggerLabel: string) {
    if (selectedTriggers.includes(triggerId)) {
      setSelectedTriggers((prev) => prev.filter((t) => t !== triggerId));
      removeChip(`trigger_${triggerId}`);
    } else {
      setSelectedTriggers((prev) => [...prev, triggerId]);
      pushTriggerChip(triggerId, triggerLabel);
    }
  }

  function handleApplyParsed(
    triggerId: string,
    parsed: Exclude<ParsedTriggerCommand, { kind: "fallback" }>
  ) {
    // Submitting a chat command for a trigger auto-activates it, so editing
    // an unchecked trigger via the prompt bar flips it into the campaign.
    setSelectedTriggers((prev) =>
      prev.includes(triggerId) ? prev : [...prev, triggerId]
    );
    setDeltas((prev) => {
      const current = prev[triggerId] ?? EMPTY_DELTA;
      let updated: TriggerDelta;
      if (parsed.kind === "clear-added") {
        updated = { ...current, added: [] };
      } else if (parsed.kind === "clear-excluded") {
        updated = { ...current, excluded: [] };
      } else {
        updated = applyEditToDelta(current, parsed.add, parsed.exclude);
      }
      const next = { ...prev };
      if (isDeltaEmpty(updated)) delete next[triggerId];
      else next[triggerId] = updated;
      return next;
    });
  }

  function handleRemoveDelta(
    triggerId: string,
    bucket: "added" | "excluded",
    domain: string
  ) {
    setDeltas((prev) => {
      const current = prev[triggerId] ?? EMPTY_DELTA;
      const next = removeFromDelta(current, bucket, domain);
      if (isDeltaEmpty(next)) return omitKey(prev, triggerId);
      return { ...prev, [triggerId]: next };
    });
  }

  // M2.3 — Exclude a SYSTEM domain. System data is never deleted: this only
  // appends the domain to the user-layer `excluded` delta (reversible).
  function handleExcludeSystemDomain(triggerId: string, domain: string) {
    setSelectedTriggers((prev) =>
      prev.includes(triggerId) ? prev : [...prev, triggerId]
    );
    setDeltas((prev) => {
      const current = prev[triggerId] ?? EMPTY_DELTA;
      const updated = applyEditToDelta(current, [], [domain]);
      const next = { ...prev };
      if (isDeltaEmpty(updated)) delete next[triggerId];
      else next[triggerId] = updated;
      return next;
    });
  }

  // M2.3 — Restore a previously-excluded system domain: drop it from the
  // `excluded` delta. The system domain reappears as a normal active chip.
  function handleRestoreSystemDomain(triggerId: string, domain: string) {
    setDeltas((prev) => {
      const current = prev[triggerId] ?? EMPTY_DELTA;
      const next = removeFromDelta(current, "excluded", domain);
      if (isDeltaEmpty(next)) return omitKey(prev, triggerId);
      return { ...prev, [triggerId]: next };
    });
  }

  // ---- Chip helpers ----

  function pushSectionChip(section: "interests" | "triggers") {
    clearChips();
    pushChip({
      id: `section_${section}`,
      kind: "section",
      label: section === "interests" ? "Интересы" : "Триггеры",
      payload: section,
      removable: true,
    });
  }

  // Task 8 — «Добавить свой домен» combobox routing. Both paths write into
  // the trigger's `delta.added` via the SAME merge as the prompt-bar edit
  // flow (`applyEditToDelta`, through `handleApplyParsed`) — one mechanism,
  // two entry points. Status is never stored on the delta: it's read from
  // the registry (`accountSettings.ownDomains`) at render time.
  //   - Picking a PREVIOUSLY-REGISTERED domain (from the directory list)
  //     needs no (re-)registration — it's already in the registry.
  //   - Free-typed input is normalized + classified against the known
  //     trigger-domain roots: a known root is added directly (inherently
  //     approved, same as system domains); anything else is registered via
  //     `domain_registered` (→ pending in the registry) before being added.
  function addRegisteredDomainToTrigger(triggerId: string, domain: string) {
    handleApplyParsed(triggerId, { kind: "edit", add: [domain], exclude: [] });
  }

  function addTypedDomainToTrigger(triggerId: string, raw: string) {
    const { domain, isKnown } = classifyTypedDomain(raw, knownRoots);
    if (!domain) return;
    if (!isKnown) {
      dispatch({ type: "domain_registered", domain });
    }
    handleApplyParsed(triggerId, { kind: "edit", add: [domain], exclude: [] });
  }

  // ---- TriggerEditApi for the PromptBar bridge ----

  // Mirror selection/deltas into refs so the (stable) api can read the latest
  // values without re-creating itself on every selection change.
  const selectedTriggersRef = useRef(selectedTriggers);
  const deltasRef = useRef(deltas);
  useEffect(() => {
    selectedTriggersRef.current = selectedTriggers;
  }, [selectedTriggers]);
  useEffect(() => {
    deltasRef.current = deltas;
  }, [deltas]);

  const triggerEditApi = useMemo<TriggerEditApi>(() => ({
    applyToTrigger: (triggerId, parsed) => {
      handleApplyParsed(triggerId, parsed);
    },
    highlightTrigger: (triggerId) => {
      setHighlightedTriggerIds(new Set([triggerId]));
      window.setTimeout(() => setHighlightedTriggerIds(new Set()), 600);
    },
    randomRemix: () => {
      dispatch({ type: "wizard_random_remix" });
    },
    resolveTriggerIdByLabel: (label) => {
      const found = availableTriggers.find(({ trigger }) => trigger.label === label);
      return found ? found.trigger.id : null;
    },
    checkDomainAvailability: (triggerId?: string) => {
      // Scope to the active trigger when given (its tag is in the bar),
      // otherwise fall back to all selected triggers.
      const scope = triggerId ? [triggerId] : selectedTriggersRef.current;
      // Pool of currently-active system domain GROUPS for the scoped
      // trigger(s), keyed by root (excluding a domain here excludes its
      // whole group, same as the ✕ on SystemDomainChip).
      const pool: Array<{ triggerId: string; domain: string }> = [];
      for (const tId of scope) {
        const delta = deltasRef.current[tId] ?? EMPTY_DELTA;
        const { active } = splitSystemDomains(getTriggerDomains(tId), delta);
        for (const group of active) pool.push({ triggerId: tId, domain: group.root });
      }
      if (pool.length === 0) return 0;

      // Exclude 1–4 random domains (capped by pool size).
      const n = 1 + Math.floor(Math.random() * Math.min(4, pool.length));
      const chosen = pickN(pool, n, Math.random);
      const byTrigger = new Map<string, string[]>();
      for (const { triggerId, domain } of chosen) {
        byTrigger.set(triggerId, [...(byTrigger.get(triggerId) ?? []), domain]);
      }

      setDeltas((prev) => {
        const next = { ...prev };
        for (const [triggerId, domainsToExclude] of byTrigger) {
          const current = next[triggerId] ?? EMPTY_DELTA;
          const updated = applyEditToDelta(current, [], domainsToExclude);
          if (isDeltaEmpty(updated)) delete next[triggerId];
          else next[triggerId] = updated;
        }
        return next;
      });
      setHighlightedTriggerIds(new Set(byTrigger.keys()));
      window.setTimeout(() => setHighlightedTriggerIds(new Set()), 800);
      return chosen.length;
    },
  }), [availableTriggers, dispatch]);

  // Публикуем api в registry — PromptBar (sibling этого компонента) читает его
  // через useTriggerEdit. На unmount api сбрасывается в NOOP. Read-only режим не
  // регистрирует api — правки запрещены.
  useRegisterTriggerEdit(readOnly ? NOOP_EDITOR_API : triggerEditApi);

  // ---- Remix subscriber: re-roll selection when wizardRemixToken increments ----

  useEffect(() => {
    if (!enableRemix) return;
    if (wizardRemixToken === 0) return;
    const vertical = {
      interestIds: interestsForDirection.map((i) => i.id),
      triggerIdsByInterest: Object.fromEntries(
        interestsForDirection.map((i) => [i.id, i.triggers.map((t) => t.id)])
      ),
      domainsByTrigger: Object.fromEntries(
        interestsForDirection.flatMap((i) =>
          i.triggers.map((t) => [
            t.id,
            getTriggerDomains(t.id).map((g) => g.root),
          ])
        )
      ),
    };
    const r = computeRandomRemix(vertical, wizardRemixToken * 31 + 7);
    setSelectedInterests(r.interestIds);
    setSelectedTriggers(r.triggerIds);
    setDeltas(r.deltas);
    setHighlightedTriggerIds(new Set(r.triggerIds));
    window.setTimeout(() => setHighlightedTriggerIds(new Set()), 800);
  }, [enableRemix, wizardRemixToken, interestsForDirection]);

  const hasInterest = selectedInterests.length > 0;

  if (readOnly) {
    const selectedInterestObjs = interestsForDirection.filter((i) =>
      selectedInterests.includes(i.id)
    );
    return (
      <>
        <div>
          <ReadOnlySectionHeader label="Интересы" />
          {selectedInterestObjs.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedInterestObjs.map((interest) => (
                <span
                  key={interest.id}
                  className="rounded-lg border border-brand/50 bg-brand-muted px-3 py-2 text-sm text-foreground"
                >
                  {interest.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Интересы для этой ноды не заданы.
            </p>
          )}
        </div>

        <div>
          <ReadOnlySectionHeader label="Триггеры" />
          {selectedTriggers.length > 0 ? (
            <div className="flex flex-col gap-2">
              {availableTriggers
                .filter(({ trigger }) => selectedTriggers.includes(trigger.id))
                .map(({ trigger }) => (
                  <ReadOnlyTriggerCard
                    key={trigger.id}
                    trigger={trigger}
                    domains={getTriggerDomains(trigger.id)}
                    delta={deltas[trigger.id] ?? EMPTY_DELTA}
                  />
                ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Триггеры для этой ноды не заданы.
            </p>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Interests */}
      <div>
        <SectionHeader
          label="Интересы"
          sectionId="interests"
          onClick={() => pushSectionChip("interests")}
        />
        <div className="flex flex-wrap gap-2">
          {interestsForDirection.map((interest) => (
            <InterestChip
              key={interest.id}
              label={interest.label}
              selected={selectedInterests.includes(interest.id)}
              onToggle={() => toggleInterest(interest.id)}
            />
          ))}
        </div>
      </div>

      {/* Triggers */}
      <div>
        <SectionHeader
          label="Триггеры"
          sectionId="triggers"
          onClick={() => pushSectionChip("triggers")}
        />
        <div
          className={cn(
            "flex flex-col gap-2 transition-opacity",
            !hasInterest && "pointer-events-none opacity-50"
          )}
        >
          {availableTriggers.map(({ trigger }) => (
            <TriggerCard
              key={trigger.id}
              trigger={trigger}
              domains={getTriggerDomains(trigger.id)}
              selected={selectedTriggers.includes(trigger.id)}
              delta={deltas[trigger.id] ?? EMPTY_DELTA}
              highlight={highlightedTriggerIds.has(trigger.id)}
              onToggle={() => selectTrigger(trigger.id, trigger.label)}
              onCheckboxToggle={() =>
                toggleTriggerCheckbox(trigger.id, trigger.label)
              }
              onRemoveDelta={(bucket, domain) =>
                handleRemoveDelta(trigger.id, bucket, domain)
              }
              onExcludeSystemDomain={(domain) =>
                handleExcludeSystemDomain(trigger.id, domain)
              }
              onRestoreSystemDomain={(domain) =>
                handleRestoreSystemDomain(trigger.id, domain)
              }
              registeredDomains={registeredDomains}
              onSelectRegisteredDomain={(domain) =>
                addRegisteredDomainToTrigger(trigger.id, domain)
              }
              onSubmitTypedDomain={(raw) =>
                addTypedDomainToTrigger(trigger.id, raw)
              }
            />
          ))}
        </div>
        {!hasInterest && (
          <p className="mt-2 text-xs text-muted-foreground">
            Сначала выберите хотя бы один интерес — триггеры подстроятся под него
          </p>
        )}
      </div>
    </>
  );
}

/** Registry api that ignores everything — used in read-only mode. */
const NOOP_EDITOR_API: TriggerEditApi = {
  applyToTrigger: () => {},
  highlightTrigger: () => {},
  randomRemix: () => {},
  resolveTriggerIdByLabel: () => null,
  checkDomainAvailability: () => 0,
};
