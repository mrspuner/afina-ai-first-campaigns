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

interface ScoringInsightsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wizard-selected interests (themes the audience cares about). */
  interests: string[];
  /** Wizard-selected behavioral triggers (intent signals). */
  triggers: string[];
}

/**
 * Read-only drawer that structurally explains what this scoring node targets —
 * the interests and intent triggers pulled from the wizard. Voiced as the AI
 * narrating its own selection (PRODUCT principle 6: mascot is functional), not
 * a raw data dump. No editing here; configuration lives in the wizard.
 */
export function ScoringInsightsDrawer({
  open,
  onOpenChange,
  interests,
  triggers,
}: ScoringInsightsDrawerProps) {
  const hasInterests = interests.length > 0;
  const hasTriggers = triggers.length > 0;
  const isEmpty = !hasInterests && !hasTriggers;

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
            По чему скоринг отбирает горячую аудиторию из базы.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-6">
          {isEmpty ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Для этой ноды пока не заданы интересы и триггеры. Выберите их в
              визарде на шаге «Интересы и триггеры» — и они появятся здесь.
            </p>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-foreground/90">
                Из загруженной базы я оставляю людей, которым важны выбранные
                темы и которые проявляют намерение прямо сейчас — по их недавним
                действиям в сети.
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
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
