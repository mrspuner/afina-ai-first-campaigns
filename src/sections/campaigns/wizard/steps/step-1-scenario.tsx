"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepProps } from "@/types/campaign";
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

export function Step1Scenario({ data, onNext }: StepProps) {
  const [query, setQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<ScenarioCategory>>(new Set());

  const normalized = query.trim().toLocaleLowerCase("ru-RU");

  // Базовые сценарии (isBase) одноимённы с категориями и поэтому всегда
  // отсеиваются — пользователь выбирает категорию через chip'ы фильтра выше,
  // а в карточках видит «настоящие» сценарии: подобранные и остальные.
  const filtered = useMemo(() => {
    return SCENARIOS.filter((s) => {
      if (s.isBase) return false;
      if (!matchesQuery(s, normalized)) return false;
      if (activeCategories.size > 0 && !activeCategories.has(s.category)) return false;
      return true;
    });
  }, [normalized, activeCategories]);

  const curated = useMemo(() => filtered.filter((s) => s.isCurated), [filtered]);
  const others = useMemo(() => filtered.filter((s) => !s.isCurated), [filtered]);

  const selectedId =
    typeof data.scenario === "string" && data.scenario.length > 0 ? data.scenario : null;

  function toggleCategory(category: ScenarioCategory) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function handleSelect(id: string) {
    onNext({ scenario: id });
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  function updateScrollFlags() {
    const el = scrollRef.current;
    if (!el) return;
    const slack = 2;
    setCanScrollUp(el.scrollTop > slack);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - slack);
  }

  useLayoutEffect(updateScrollFlags, [filtered]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("resize", updateScrollFlags);
    return () => window.removeEventListener("resize", updateScrollFlags);
  }, []);

  return (
    <StepContent
      title="Выберите сценарий для подбора сигналов"
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

        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={updateScrollFlags}
            className={cn(
              "max-h-[420px] overflow-y-auto pr-2",
              // Firefox / standard
              "[scrollbar-width:thin]",
              "[scrollbar-color:rgb(255_255_255_/_0.18)_transparent]",
              // WebKit (Safari, Chrome)
              "[&::-webkit-scrollbar]:w-1.5",
              "[&::-webkit-scrollbar]:bg-transparent",
              "[&::-webkit-scrollbar-track]:bg-transparent",
              "[&::-webkit-scrollbar-track]:border-0",
              "[&::-webkit-scrollbar-thumb]:rounded-full",
              "[&::-webkit-scrollbar-thumb]:bg-white/15",
              "[&::-webkit-scrollbar-thumb]:border-0",
              "hover:[&::-webkit-scrollbar-thumb]:bg-white/30"
            )}
          >
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Ничего не нашлось. Измените запрос или сбросьте фильтр.
              </p>
            ) : (
              <div className="flex flex-col gap-6 pb-1">
                {curated.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Подобрано для вас
                    </h2>
                    <div className="grid grid-cols-3 gap-3">
                      {curated.map((s) => (
                        <ScenarioCard
                          key={s.id}
                          scenario={s}
                          selected={selectedId === s.id}
                          onClick={handleSelect}
                        />
                      ))}
                    </div>
                  </section>
                )}
                {others.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Остальные сценарии
                    </h2>
                    <div className="grid grid-cols-3 gap-3">
                      {others.map((s) => (
                        <ScenarioCard
                          key={s.id}
                          scenario={s}
                          selected={selectedId === s.id}
                          onClick={handleSelect}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-background to-transparent transition-opacity duration-150",
              canScrollUp ? "opacity-100" : "opacity-0"
            )}
          />
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent transition-opacity duration-150",
              canScrollDown ? "opacity-100" : "opacity-0"
            )}
          />
        </div>
      </div>
    </StepContent>
  );
}
