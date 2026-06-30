"use client";

import Image from "next/image";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { InterestChip } from "./interest-chip";

/** One pickable interest plus the triggers it unlocks (labels). Drives the
 *  editable drawer's «add more» grids without coupling it to the data layer. */
export interface InterestOption {
  label: string;
  triggerLabels: string[];
}

interface ScoringInsightsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wizard-selected interests (themes the audience cares about). */
  interests: string[];
  /** Wizard-selected behavioral triggers (intent signals). */
  triggers: string[];
  /**
   * 2c — when true (draft campaign, not launched), the interests/triggers are
   * editable: chips become toggles over `interestOptions`, and every change
   * flows through `onChange`. When false/omitted (launched, or no options), the
   * drawer stays the read-only AI narration it has always been.
   */
  editable?: boolean;
  /** Interests offered in edit mode (the campaign direction's catalog). */
  interestOptions?: InterestOption[];
  /** Called with the next selection on every toggle (edit mode only). */
  onChange?: (next: { interests: string[]; triggers: string[] }) => void;
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

/** Distinct, order-preserving union of label lists. */
function union(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const v of list) {
      if (!seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
  }
  return out;
}

/**
 * Drawer that explains — and, for a draft campaign, lets the user edit — what
 * this scoring node targets: the interests and intent triggers pulled from the
 * wizard.
 *
 * Read-only (launched): the AI narrates its own selection (PRODUCT principle 6).
 * Editable (draft): the same interest/trigger controls the wizard uses
 * (`InterestChip` toggles) let the user refine the selection before launch;
 * edits are persisted back to the campaign by the caller via `onChange`.
 */
export function ScoringInsightsDrawer({
  open,
  onOpenChange,
  interests,
  triggers,
  editable,
  interestOptions,
  onChange,
}: ScoringInsightsDrawerProps) {
  const isEditing = Boolean(editable && onChange);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent width="460px">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-muted">
              <Image src="/mascot-icon.svg" width={16} height={16} alt="" aria-hidden />
            </span>
            <SheetTitle className="text-lg">Интересы и триггеры</SheetTitle>
          </div>
          <SheetDescription>
            {isEditing
              ? "Уточните, по чему скоринг отбирает горячую аудиторию из базы."
              : "По чему скоринг отбирает горячую аудиторию из базы."}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-6">
          {isEditing ? (
            <EditableBody
              interests={interests}
              triggers={triggers}
              interestOptions={interestOptions ?? []}
              onChange={onChange!}
            />
          ) : (
            <ReadOnlyBody interests={interests} triggers={triggers} />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function ReadOnlyBody({
  interests,
  triggers,
}: {
  interests: string[];
  triggers: string[];
}) {
  const hasInterests = interests.length > 0;
  const hasTriggers = triggers.length > 0;
  if (!hasInterests && !hasTriggers) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        Для этой ноды пока не заданы интересы и триггеры. Выберите их в визарде на
        шаге «Интересы и триггеры» — и они появятся здесь.
      </p>
    );
  }
  return (
    <>
      <p className="text-sm leading-relaxed text-foreground/90">
        Из загруженной базы я оставляю людей, которым важны выбранные темы и
        которые проявляют намерение прямо сейчас — по их недавним действиям в
        сети.
      </p>

      {hasInterests && (
        <section className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Интересы
            </h3>
            <p className="text-xs text-muted-foreground">
              Темы, вокруг которых собрана аудитория.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {interests.map((interest) => (
              <span
                key={interest}
                className="rounded-md border border-border bg-card px-2.5 py-1 text-[13px] text-foreground"
              >
                {interest}
              </span>
            ))}
          </div>
        </section>
      )}

      {hasTriggers && (
        <section className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Сигналы намерения
            </h3>
            <p className="text-xs text-muted-foreground">
              Действия, по которым человек попадает в горячий сегмент.
            </p>
          </div>
          <ul className="flex flex-col gap-1.5">
            {triggers.map((trigger) => (
              <li
                key={trigger}
                className="flex items-start gap-2.5 rounded-md border border-border bg-card px-3 py-2 text-[13px] leading-snug text-foreground"
              >
                <span
                  aria-hidden
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40"
                />
                <span>{trigger}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function EditableBody({
  interests,
  triggers,
  interestOptions,
  onChange,
}: {
  interests: string[];
  triggers: string[];
  interestOptions: InterestOption[];
  onChange: (next: { interests: string[]; triggers: string[] }) => void;
}) {
  // Interests offered: the direction catalog, plus any already-selected ones not
  // in it (custom — never drop a current selection).
  const interestLabels = union(
    interestOptions.map((o) => o.label),
    interests
  );
  // Triggers offered: those unlocked by the currently-selected interests, plus
  // any already-selected ones (so a trigger stays visible/removable even if its
  // interest is later deselected).
  const availableTriggerLabels = union(
    interestOptions
      .filter((o) => interests.includes(o.label))
      .flatMap((o) => o.triggerLabels),
    triggers
  );

  const hasInterestPick = interestLabels.length > 0;

  return (
    <>
      <p className="text-sm leading-relaxed text-foreground/90">
        Я уже отобрал темы и сигналы намерения. Поправьте подбор до запуска —
        отметьте нужное, снимите лишнее.
      </p>

      <section className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Интересы
          </h3>
          <p className="text-xs text-muted-foreground">
            Темы, вокруг которых собрана аудитория.
          </p>
        </div>
        {hasInterestPick ? (
          <div className="flex flex-wrap gap-2">
            {interestLabels.map((label) => (
              <InterestChip
                key={label}
                label={label}
                selected={interests.includes(label)}
                onToggle={() =>
                  onChange({ interests: toggle(interests, label), triggers })
                }
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Для этого направления нет готовых тем — задайте их в визарде.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Сигналы намерения
          </h3>
          <p className="text-xs text-muted-foreground">
            Действия, по которым человек попадает в горячий сегмент.
          </p>
        </div>
        {availableTriggerLabels.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {availableTriggerLabels.map((label) => (
              <InterestChip
                key={label}
                label={label}
                selected={triggers.includes(label)}
                onToggle={() =>
                  onChange({ interests, triggers: toggle(triggers, label) })
                }
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Выберите интерес — под него подтянутся сигналы намерения.
          </p>
        )}
      </section>
    </>
  );
}
