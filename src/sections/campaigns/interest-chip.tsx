"use client";

import { cn } from "@/lib/utils";

/**
 * Toggle chip for an interest or trigger label. Shared between the wizard's
 * «Интересы и триггеры» step and the scoring node's editable drawer (2c) so both
 * surfaces use the exact same control. Selected = brand-tinted; unselected =
 * muted card with hover.
 */
export function InterestChip({
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
      aria-pressed={selected}
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
