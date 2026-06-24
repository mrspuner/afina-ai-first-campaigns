"use client";

import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import type { Scenario } from "@/data/scenarios";

interface ScenarioCardProps {
  scenario: Scenario;
  selected?: boolean;
  onClick: (id: string) => void;
  /**
   * compact — step-1 (текущий вид): описание приглушено, фон `bg-card`.
   * catalog — каталог сценариев: оба текста `text-foreground`, фон темнее.
   * default: "compact".
   */
  variant?: "compact" | "catalog";
}

export function ScenarioCard({
  scenario,
  selected = false,
  onClick,
  variant = "compact",
}: ScenarioCardProps) {
  function handleCardClick() {
    onClick(scenario.id);
  }

  function handleCardKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(scenario.id);
    }
  }

  // Catalog variant: оба текста белые, фон темнее, чем bg-popover диалога.
  // 0.18 < bg-popover (~0.215) и тинтнут под хью 102° (warm dark) — никакого
  // голого bg-background, никакого жёлтого. Подбираем визуально при ревью.
  const catalogSurface = "bg-[oklch(0.18_0.006_102)]";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={scenario.name}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      className={cn(
        "flex h-full cursor-pointer flex-col items-start justify-between rounded-lg border p-4 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        selected
          ? "border-brand/50 bg-brand-muted"
          : variant === "catalog"
            ? cn("border-border", catalogSurface, "hover:border-border/80")
            : "border-border bg-card hover:bg-accent hover:border-border"
      )}
    >
      <div className="flex flex-col items-start">
        <span className="text-sm font-medium text-foreground">
          {scenario.name}
        </span>
        <span
          className={cn(
            "mt-1 text-xs leading-relaxed",
            variant === "catalog" ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {scenario.description}
        </span>
      </div>
    </div>
  );
}
