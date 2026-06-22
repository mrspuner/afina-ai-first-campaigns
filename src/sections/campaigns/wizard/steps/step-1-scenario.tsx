"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepProps } from "@/types/campaign";
import type { SourceType } from "@/types/campaign";
import { ScenarioCard } from "@/sections/signals/scenario-card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  SCENARIOS,
  SCENARIO_CATEGORIES,
  type Scenario,
  type ScenarioCategory,
} from "@/data/scenarios";

function matchesQuery(scenario: Scenario, q: string): boolean {
  if (!q) return true;
  return scenario.name.toLocaleLowerCase("ru-RU").includes(q);
}

export interface ScenarioGroup {
  category: ScenarioCategory;
  scenarios: Scenario[];
  count: number;
}

/**
 * Groups the non-base scenarios by ЖЦК category (spec §7.3). Returns one group
 * per `SCENARIO_CATEGORIES` value, in catalogue order, each carrying its count.
 */
export function groupScenariosByCategory(
  scenarios: Scenario[] = SCENARIOS
): ScenarioGroup[] {
  const usable = scenarios.filter((s) => !s.isBase);
  return SCENARIO_CATEGORIES.map((category) => {
    const inGroup = usable.filter((s) => s.category === category);
    return { category, scenarios: inGroup, count: inGroup.length };
  });
}

/** Russian label for a recommended source type (shown as a chip on the card). */
export function sourceTypeLabel(sourceType: SourceType): string {
  switch (sourceType) {
    case "new":
      return "Новая база";
    case "stream":
      return "Поток";
    case "own":
      return "Своя база";
  }
}

/** How many cards to show per group before «Показать ещё». */
const COLLAPSED_PER_GROUP = 3;

export function Step1Scenario({ data, onNext }: StepProps) {
  const [query, setQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<ScenarioCategory>>(
    new Set()
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<ScenarioCategory>>(
    new Set()
  );

  const normalized = query.trim().toLocaleLowerCase("ru-RU");

  // Filter first (search + active category chips), then group by ЖЦК.
  const filtered = useMemo(() => {
    return SCENARIOS.filter((s) => {
      if (s.isBase) return false;
      if (!matchesQuery(s, normalized)) return false;
      if (activeCategories.size > 0 && !activeCategories.has(s.category))
        return false;
      return true;
    });
  }, [normalized, activeCategories]);

  const groups = useMemo(
    () => groupScenariosByCategory(filtered).filter((g) => g.count > 0),
    [filtered]
  );

  const selectedId =
    typeof data.scenario === "string" && data.scenario.length > 0
      ? data.scenario
      : null;

  function toggleCategory(category: ScenarioCategory) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function toggleGroupExpanded(category: ScenarioCategory) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function handleSelect(id: string) {
    onNext({ scenario: id });
  }

  return (
    <StepContent
      title="Выберите сценарий для кампании"
      subtitle="Готовая связка сигнала и кампании под бизнес-цель"
    >
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по сценариям"
            aria-label="Поиск по сценариям"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {SCENARIO_CATEGORIES.map((category) => {
            const active = activeCategories.has(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggleCategory(category)}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  active
                    ? "border-brand/50 bg-brand-muted text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {category}
              </button>
            );
          })}
        </div>

        <div>
          {groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Ничего не нашлось. Измените запрос или сбросьте фильтр.
            </p>
          ) : (
            <div className="flex flex-col gap-6 pb-1">
              {groups.map((group) => {
                  const expanded = expandedGroups.has(group.category);
                  const visible = expanded
                    ? group.scenarios
                    : group.scenarios.slice(0, COLLAPSED_PER_GROUP);
                  const hiddenCount = group.count - visible.length;
                  return (
                    <section key={group.category} className="flex flex-col gap-3">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.category}{" "}
                        <span className="text-muted-foreground/60">
                          ({group.count})
                        </span>
                      </h2>
                      <div className="grid grid-cols-3 gap-3">
                        {visible.map((s) => (
                          <ScenarioCard
                            key={s.id}
                            scenario={s}
                            selected={selectedId === s.id}
                            onClick={handleSelect}
                            sourceLabel={sourceTypeLabel(s.recommendedSourceType)}
                          />
                        ))}
                      </div>
                      {hiddenCount > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleGroupExpanded(group.category)}
                          className="self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Показать ещё ({hiddenCount})
                        </button>
                      )}
                      {expanded && group.count > COLLAPSED_PER_GROUP && (
                        <button
                          type="button"
                          onClick={() => toggleGroupExpanded(group.category)}
                          className="self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Свернуть
                        </button>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </div>
    </StepContent>
  );
}
