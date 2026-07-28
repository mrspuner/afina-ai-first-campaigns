"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search, List } from "lucide-react";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepProps } from "@/types/campaign";
import { useScreenHints } from "@/hooks/use-screen-hints";
import { SCENARIO_SCREEN_HINTS } from "./screen-hints";
import { ScenarioCard } from "@/sections/signals/scenario-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

/**
 * Подобранные сценарии, показываемые по умолчанию («Подобрали для вас»).
 * Постоянный редакторский блок: поиск/чипсы его НЕ фильтруют — фильтры
 * применяются только к разворачиваемому полному каталогу ниже.
 */
const CURATED_SCENARIOS = SCENARIOS.filter((s) => s.isCurated);

/**
 * Вертикальное сжатие/разжатие при переключении «Подобрали для вас» ↔ полный
 * каталог. ease-out-quart (--ease-out), без bounce, ~0.28s (PRODUCT.md §анимация).
 */
const COLLAPSE_TRANSITION = { duration: 0.28, ease: [0.23, 1, 0.32, 1] } as const;
const collapseMotion = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto" as const, opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: COLLAPSE_TRANSITION,
  className: "overflow-hidden",
};

export function Step1Scenario({
  data,
  onNext,
  active,
  onValueChange,
  editing,
}: StepProps & {
  /**
   * Изолированная сессия точечной правки (Task 12/13): у графа кампании уже
   * есть структура (ручные + ИИ-правки), которую полная пересборка при смене
   * сценария уничтожает. Обычный проход визарда этот проп не передаёт — там
   * графа-предшественника нет, пересобирать нечего, диалог не нужен.
   */
  editing?: boolean;
}) {
  useScreenHints(active ? SCENARIO_SCREEN_HINTS : null);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<ScenarioCategory>>(
    new Set()
  );
  // Сценарий, ожидающий подтверждения смены (Task 13) — null, пока диалог не
  // открыт. Открывается ТОЛЬКО когда editing и клик пришёлся на сценарий,
  // отличный от текущего; клик по уже выбранному или обычный проход визарда
  // применяют выбор сразу же, минуя это состояние.
  const [pendingScenarioId, setPendingScenarioId] = useState<string | null>(null);

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

  function applyScenario(id: string) {
    // Живое уведомление ПЕРЕД onNext — тот же контракт, что и у остальных
    // шагов из STEP_INVALIDATES, хоть здесь оба вызова и происходят одним
    // кликом (карточки сценария автоприменяют выбор, отдельной кнопки нет).
    // Изолированный режим правки использует его для решения о каскаде.
    onValueChange?.({ scenario: id });
    onNext({ scenario: id });
  }

  function handleSelect(id: string) {
    // В режиме правки смена НА ДРУГОЙ сценарий пересобирает граф с нуля
    // (guided-campaign-section.tsx, коммит) — сначала спрашиваем подтверждение.
    // Клик по уже выбранному сценарию менять нечего, диалог не нужен: просто
    // возвращаемся на карточку тем же путём, что и обычный проход визарда.
    if (editing && id !== selectedId) {
      setPendingScenarioId(id);
      return;
    }
    applyScenario(id);
  }

  function confirmScenarioChange() {
    if (pendingScenarioId === null) return;
    const id = pendingScenarioId;
    setPendingScenarioId(null);
    applyScenario(id);
  }

  function cancelScenarioChange() {
    setPendingScenarioId(null);
  }

  return (
    <>
      <StepContent
        title="Выберите сценарий для кампании"
        subtitle="Готовая связка сигнала и кампании под бизнес-цель"
      >
        <div className="flex flex-col gap-4">
          {/* Поиск — всегда сверху */}
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

          {/* Чипсы категорий — всегда сверху */}
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

          {/* Подборка — постоянный блок */}
          <section aria-label="Подобрали для вас" className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Подобрали для вас
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {CURATED_SCENARIOS.map((s) => (
                <ScenarioCard
                  key={s.id}
                  scenario={s}
                  selected={selectedId === s.id}
                  onClick={handleSelect}
                />
              ))}
            </div>
          </section>

          {/* Тоггл «Показать все» ↔ «Свернуть» — заметная outline-кнопка (#12) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAll((v) => !v)}
            className="self-start"
          >
            <List className="h-4 w-4" />
            {showAll ? "Свернуть" : "Показать все"}
          </Button>

          {/* Полный каталог — добавляется ниже подборки */}
          <AnimatePresence initial={false}>
            {showAll && (
              <motion.section key="all" aria-label="Все сценарии" {...collapseMotion}>
                {groups.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Ничего не нашлось. Измените запрос или сбросьте фильтр.
                  </p>
                ) : (
                  <div className="flex flex-col gap-6 pb-1">
                    {groups.map((group) => (
                      <section key={group.category} className="flex flex-col gap-3">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {group.category}{" "}
                          <span className="text-muted-foreground/60">
                            ({group.count})
                          </span>
                        </h2>
                        <div className="grid grid-cols-3 gap-3">
                          {group.scenarios.map((s) => (
                            <ScenarioCard
                              key={s.id}
                              scenario={s}
                              selected={selectedId === s.id}
                              onClick={handleSelect}
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </StepContent>
      {/* Подтверждение смены сценария в режиме правки (Task 13) — «Сценарий»
          не имеет StepFooter, автоприменение сохраняется, диалог его заменяет
          ровно для деструктивного случая (смена НА ДРУГОЙ сценарий). */}
      <Dialog
        open={pendingScenarioId !== null}
        onOpenChange={(open) => {
          if (!open) cancelScenarioChange();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Сменить сценарий?</DialogTitle>
            <DialogDescription>
              Смена сценария пересоберёт цепочку кампании. Правки логики,
              сделанные вручную и через ИИ, будут потеряны.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelScenarioChange}>
              Отмена
            </Button>
            <Button onClick={confirmScenarioChange}>Сменить сценарий</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
