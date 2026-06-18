"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Plus, X, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepProps } from "@/types/campaign";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { VERTICALS, getInterestById } from "@/data/triggers-by-vertical";
import { getInterestsForDirection } from "@/data/interests-by-direction";
import { getTriggerDomains } from "@/data/trigger-domains";
import {
  PREVIEW_VISIBLE_COUNT,
  previewDomains,
  splitSystemDomains,
} from "@/lib/trigger-domain-view";
import type { Interest, Trigger, Vertical } from "@/types/directions";
import {
  applyEditToDelta,
  EMPTY_DELTA,
  isDeltaEmpty,
  removeFromDelta,
  type ParsedTriggerCommand,
  type TriggerDelta,
} from "@/lib/trigger-edit-parser";
import { usePromptChips } from "@/state/prompt-chips-context";
import { usePromptInputController } from "@/components/ai-elements/prompt-input";
import { useRegisterTriggerEdit, type TriggerEditApi } from "@/state/trigger-edit-context";
import { computeRandomRemix } from "@/lib/random-remix";
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

function InterestChip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "rounded-lg border px-3 py-2 text-left text-sm transition-all",
        selected
          ? "border-brand/50 bg-brand-muted text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

function MascotIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/mascot-icon.svg"
      alt=""
      width={20}
      height={20}
      aria-hidden
      className={cn("shrink-0", className)}
    />
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
          <Image src="/mascot-icon.svg" alt="" width={14} height={14} aria-hidden />
        </button>
      </MascotHint>
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

interface TriggerCardProps {
  trigger: Trigger;
  domains: string[];
  selected: boolean;
  delta: TriggerDelta;
  highlight: boolean;
  onToggle: () => void;
  onCheckboxToggle: () => void;
  onRemoveDelta: (bucket: "added" | "excluded", domain: string) => void;
  onExcludeSystemDomain: (domain: string) => void;
  onRestoreSystemDomain: (domain: string) => void;
  onAddDomain: () => void;
}

/**
 * Chip for a SYSTEM domain in the expanded trigger card.
 *  - active   → neutral chip with ✕; ✕ excludes the domain (reversible).
 *  - excluded → struck-through red chip with ↩; click restores the domain.
 * System data is never deleted — exclusion lives in the user-layer delta.
 */
function SystemDomainChip({
  domain,
  excluded,
  onExclude,
  onRestore,
}: {
  domain: string;
  excluded: boolean;
  onExclude: () => void;
  onRestore: () => void;
}) {
  if (excluded) {
    return (
      <button
        type="button"
        onClick={onRestore}
        aria-label={`Вернуть ${domain}`}
        className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-xs text-rose-700 transition-colors hover:bg-rose-500/20 dark:text-rose-300"
      >
        <span className="line-through">{domain}</span>
        <Undo2 className="h-3 w-3 opacity-70" />
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs text-foreground/85">
      {domain}
      <button
        type="button"
        onClick={onExclude}
        aria-label={`Исключить ${domain}`}
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
  onAddDomain,
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
          {collapsedPreview.visible.map((d) => (
            <span
              key={d}
              className="inline-flex items-center rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs text-foreground/85"
            >
              {d}
            </span>
          ))}
          {collapsedPreview.overflowCount > 0 && (
            <span className="inline-flex items-center rounded-md border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground">
              +{collapsedPreview.overflowCount}
            </span>
          )}
        </button>
      )}

      {/* Expanded (selected): every domain as a chip. System domains carry a
          reversible ✕; user-added domains are green chips; the dashed button
          adds a new domain via the prompt bar. */}
      {selected && (
        <div className="animate-in fade-in-0 slide-in-from-top-1 border-t border-primary/20 bg-background/40 px-3 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {domains.map((d) => (
              <SystemDomainChip
                key={`sys-${d}`}
                domain={d}
                excluded={excludedSystemDomains.some(
                  (e) => e.toLowerCase() === d.toLowerCase()
                )}
                onExclude={() => onExcludeSystemDomain(d)}
                onRestore={() => onRestoreSystemDomain(d)}
              />
            ))}
            {delta.added.map((d) => (
              <DeltaChip
                key={`add-${d}`}
                domain={d}
                variant="added"
                onRemove={() => onRemoveDelta("added", d)}
              />
            ))}
            <button
              type="button"
              onClick={onAddDomain}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              Добавить свой домен
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Step2Interests({ data, onNext }: StepProps) {
  const { clientDirection, wizardRemixToken } = useAppState();
  const dispatch = useAppDispatch();
  const { pushChip, clearChips, removeChip } = usePromptChips();
  const { textInput } = usePromptInputController();
  const vertical = useMemo(
    () => resolveVertical(clientDirection),
    [clientDirection]
  );
  const interestsForDirection = useMemo(
    () => resolveInterests(clientDirection, vertical),
    [clientDirection, vertical]
  );

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

  // Pre-fill on first mount when the wizard hasn't filled this step yet —
  // demonstrates the "AI already prepared this for you" behavior described in
  // the subtitle. We seed off the direction so finance vs auto pick different
  // suggestions, but the result is stable inside one direction.
  const initialPrefill = useMemo(() => {
    if (data.interests.length > 0 || data.triggers.length > 0) {
      return { interestIds: data.interests, triggerIds: data.triggers };
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
  const [deltas, setDeltas] = useState<Record<string, TriggerDelta>>({});
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

  // Lookup map for resolving label → trigger object (used by handleContinue).
  const triggerById = useMemo(() => {
    const m = new Map<string, Trigger>();
    for (const { trigger } of availableTriggers) m.set(trigger.id, trigger);
    return m;
  }, [availableTriggers]);

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

  // M2.4 (revised) — "Добавить свой домен" pulls the TRIGGER NAME into the
  // prompt bar as a `trigger` chip, then pre-fills "добавь домен " AFTER the
  // tag so the user only needs to type the domain. The chip lands in the
  // contenteditable via an effect on the next commit, so the text insertion is
  // deferred one frame to land after the chip (not before it). The full
  // «добавь домен X.ru» is parsed by parseTriggerCommand into an add-edit, and
  // useChatSubmit routes `trigger` chips through triggerEdit.applyToTrigger —
  // no parser change. A stable chip id means re-clicking refreshes, not stacks.
  function handleAddDomain(triggerId: string, triggerLabel: string) {
    pushTriggerChip(triggerId, triggerLabel);
    // Текст-команду вставляем ТОЛЬКО после того, как чип реально оказался в DOM
    // (он попадает туда асинхронным эффектом ChipEditableInput). Один
    // requestAnimationFrame порядок не гарантирует — поэтому ждём появления
    // чипа, иначе «добавь домен » вставляется до тега и теряется/едет (S2).
    insertCommandAfterChip(triggerId, "добавь домен ");
  }

  // Дожидается появления чипа триггера в contenteditable, затем вставляет
  // text-команду после него. Поллинг по кадрам с потолком попыток — на случай
  // если чип почему-то не материализуется.
  function insertCommandAfterChip(
    triggerId: string,
    command: string,
    attempt = 0
  ) {
    const ed = document.querySelector<HTMLDivElement>(
      '[role="textbox"][contenteditable="true"]'
    );
    const chipReady =
      !!ed &&
      Array.from(ed.querySelectorAll<HTMLElement>("[data-chip-id]")).some(
        (c) => c.dataset.chipId === `trigger_${triggerId}`
      );
    if (!chipReady && attempt < 6) {
      requestAnimationFrame(() =>
        insertCommandAfterChip(triggerId, command, attempt + 1)
      );
      return;
    }
    ed?.focus();
    textInput.insertAtCursor(command, {
      separator: "smart",
      preserveTags: true,
    });
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
      // Pool of currently-active system domains for the scoped trigger(s).
      const pool: Array<{ triggerId: string; domain: string }> = [];
      for (const tId of scope) {
        const delta = deltasRef.current[tId] ?? EMPTY_DELTA;
        const { active } = splitSystemDomains(getTriggerDomains(tId), delta);
        for (const domain of active) pool.push({ triggerId: tId, domain });
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
  // через useTriggerEdit. На unmount api сбрасывается в NOOP.
  useRegisterTriggerEdit(triggerEditApi);

  // ---- Remix subscriber: re-roll selection when wizardRemixToken increments ----

  useEffect(() => {
    if (wizardRemixToken === 0) return;
    const vertical = {
      interestIds: interestsForDirection.map((i) => i.id),
      triggerIdsByInterest: Object.fromEntries(
        interestsForDirection.map((i) => [i.id, i.triggers.map((t) => t.id)])
      ),
      domainsByTrigger: Object.fromEntries(
        interestsForDirection.flatMap((i) =>
          i.triggers.map((t) => [t.id, getTriggerDomains(t.id)])
        )
      ),
    };
    const r = computeRandomRemix(vertical, wizardRemixToken * 31 + 7);
    setSelectedInterests(r.interestIds);
    setSelectedTriggers(r.triggerIds);
    setDeltas(r.deltas);
    setHighlightedTriggerIds(new Set(r.triggerIds));
    window.setTimeout(() => setHighlightedTriggerIds(new Set()), 800);
  }, [wizardRemixToken, interestsForDirection]);

  const hasInterest = selectedInterests.length > 0;
  const canContinue = hasInterest || selectedTriggers.length > 0;

  function handleContinue() {
    // Persist deltas back into the legacy StepData shape so downstream steps
    // (Summary, etc.) can render them. We serialize each delta into the
    // existing TriggerConfig { add, exclude } string format using the
    // trigger label as the key — that's what the legacy summary expects.
    const triggerConfig: Record<string, { add: string; exclude: string }> = {};
    const triggerLabels: string[] = [];
    for (const triggerId of selectedTriggers) {
      const t = triggerById.get(triggerId);
      if (!t) continue;
      triggerLabels.push(t.label);
      const d = deltas[triggerId];
      if (d) {
        triggerConfig[t.label] = {
          add: d.added.join(", "),
          exclude: d.excluded.join(", "),
        };
      }
    }
    const interestLabels = selectedInterests
      .map((id) => interestsForDirection.find((i) => i.id === id)?.label)
      .filter((l): l is string => Boolean(l));

    onNext({
      interests: interestLabels,
      triggers: triggerLabels,
      triggerConfig,
    });
  }

  return (
      <StepContent
        title="Какие интересы и триггеры вы ищете?"
        subtitle="Мы уже сгенерили настройки под вас — выберите интересы и триггеры в любом порядке."
      >
        <div className="flex flex-col gap-6">
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
                  onAddDomain={() => handleAddDomain(trigger.id, trigger.label)}
                />
              ))}
            </div>
            {!hasInterest && (
              <p className="mt-2 text-xs text-muted-foreground">
                Сначала выберите хотя бы один интерес — триггеры подстроятся под него
              </p>
            )}
          </div>

          <div className="flex flex-col items-start gap-1.5">
            <Button disabled={!canContinue} onClick={handleContinue}>
              Продолжить
            </Button>
            <p className="text-xs text-muted-foreground">
              Если нужного нет в списке — напишите в поле чата
            </p>
          </div>
        </div>
      </StepContent>
  );
}
