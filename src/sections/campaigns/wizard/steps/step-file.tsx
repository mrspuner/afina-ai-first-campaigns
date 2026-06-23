"use client";

import { useMemo, useState } from "react";
import { DropZone } from "@/components/ui/drop-zone";
import { HashingLoader } from "@/components/ui/hashing-loader";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import {
  groupScenariosByCategory,
  sourceTypeLabel,
} from "@/sections/campaigns/wizard/steps/step-1-scenario";
import { ScenarioCard } from "@/sections/signals/scenario-card";
import { cn } from "@/lib/utils";
import { StepProps } from "@/types/campaign";
import { rngFor, seededInt } from "@/state/metrics";
import {
  SCENARIOS,
  SCENARIO_CATEGORIES,
  getScenario,
  type ScenarioCategory,
} from "@/data/scenarios";

/** Deterministic stand-in for parsing the uploaded file's row count. */
export function simulateRowCount(f: File): number {
  return seededInt(rngFor("rowcount", f.name, f.size), 1000, 100_000);
}

/** Pure continue-gate for the Файл step: a file is required. */
export function canContinueFromFile(file: File | null): boolean {
  return file !== null;
}

/** Per-source copy for the upload step (own = ready signal list, new = audience base). */
function fileCopy(sourceType: StepProps["data"]["sourceType"]): {
  title: string;
  subtitle: string;
} {
  if (sourceType === "own") {
    return {
      title: "Загрузите ваш список сигналов",
      subtitle: "Готовый список сигналов — загрузим как есть, без скоринга.",
    };
  }
  return {
    title: "Загрузите вашу базу",
    subtitle: "Добавьте файл с аудиторной базой — оценим качество и размер.",
  };
}

/**
 * Own-source signal-type selector. Reuses step-1's grouping
 * (`groupScenariosByCategory`) + `ScenarioCard` so the user can label their
 * uploaded list with a scenario; the scenario's `signalType` is what we
 * surface. Persists the choice through the shared `scenario` field via
 * `onSelect` — mirroring how Step1Scenario calls `onNext({ scenario: id })`.
 * No curated/«Показать все» collapse here: this is a focused in-step picker.
 */
function OwnSignalTypeSelector({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [activeCategories, setActiveCategories] = useState<Set<ScenarioCategory>>(
    new Set()
  );

  const filtered = useMemo(
    () =>
      SCENARIOS.filter((s) => {
        if (s.isBase) return false;
        if (activeCategories.size > 0 && !activeCategories.has(s.category))
          return false;
        return true;
      }),
    [activeCategories]
  );

  const groups = useMemo(
    () => groupScenariosByCategory(filtered).filter((g) => g.count > 0),
    [filtered]
  );

  const selectedSignalType = selectedId
    ? getScenario(selectedId)?.signalType
    : undefined;

  function toggleCategory(category: ScenarioCategory) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Тип сигнала по сценарию
        </h2>
        <p className="text-xs text-muted-foreground">
          {selectedSignalType
            ? `Тип сигнала: ${selectedSignalType}`
            : "Выберите сценарий, чтобы задать тип сигнала для списка."}
        </p>
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

      <div className="flex flex-col gap-6 pb-1">
        {groups.map((group) => (
          <section key={group.category} className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.category}{" "}
              <span className="text-muted-foreground/60">({group.count})</span>
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {group.scenarios.map((s) => (
                <ScenarioCard
                  key={s.id}
                  scenario={s}
                  selected={selectedId === s.id}
                  onClick={onSelect}
                  sourceLabel={sourceTypeLabel(s.recommendedSourceType)}
                  curatedLabel={s.isCurated ? "Подобрано для вас" : undefined}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function StepFile({ data, onNext, onBack }: StepProps) {
  const [file, setFile] = useState<File | null>(data.file);
  const [isHashing, setIsHashing] = useState(false);

  const { title, subtitle } = fileCopy(data.sourceType);
  const isOwn = data.sourceType === "own";

  const selectedScenarioId =
    typeof data.scenario === "string" && data.scenario.length > 0
      ? data.scenario
      : null;

  function emit(rowCount: number) {
    onNext({ file, fileRowCount: rowCount });
  }

  function handleSelectScenario(id: string) {
    onNext({ scenario: id });
  }

  function handleContinue() {
    if (!file) return;
    // Fresh file → hash before proceeding (mirrors the old upload step). A
    // previously-hashed file (unchanged from data.file) reuses its row count.
    if (file !== data.file) {
      setIsHashing(true);
      return;
    }
    const rowCount =
      typeof data.fileRowCount === "number"
        ? data.fileRowCount
        : simulateRowCount(file);
    emit(rowCount);
  }

  function handleHashingComplete() {
    setIsHashing(false);
    if (file) emit(simulateRowCount(file));
  }

  const canContinue = canContinueFromFile(file);

  return (
    <StepContent title={title} subtitle={subtitle}>
      <div className="flex flex-col gap-6">
        <div>
          {isHashing ? (
            <div className="relative flex min-h-[160px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-card">
              <HashingLoader onComplete={handleHashingComplete} />
            </div>
          ) : (
            <DropZone accept=".csv,.xlsx,.txt" file={file} onFile={setFile} />
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Поддерживаемые форматы: CSV, XLSX, TXT · Данные будут захешированы перед отправкой
          </p>
        </div>

        {isOwn ? (
          <OwnSignalTypeSelector
            selectedId={selectedScenarioId}
            onSelect={handleSelectScenario}
          />
        ) : null}

        <StepFooter
          onBack={onBack}
          onContinue={handleContinue}
          continueLabel="Далее"
          continueDisabled={!canContinue || isHashing}
        />
      </div>
    </StepContent>
  );
}
