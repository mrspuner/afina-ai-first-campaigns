"use client";

import { useState } from "react";
import { DropZone } from "@/components/ui/drop-zone";
import { HashingLoader } from "@/components/ui/hashing-loader";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps, type SourceType } from "@/types/campaign";
import { useAppState } from "@/state/app-state-context";
import { VERTICALS, getInterestById } from "@/data/triggers-by-vertical";
import { getInterestsForDirection } from "@/data/interests-by-direction";
import type { Interest, Vertical } from "@/types/directions";
import { rngFor, seededInt } from "@/state/metrics";
import { cn } from "@/lib/utils";

interface SourceOption {
  value: SourceType;
  label: string;
  description: string;
}

const SOURCE_OPTIONS: SourceOption[] = [
  {
    value: "new",
    label: "Новая база",
    description: "Соберём горячую аудиторию по интент-сигналам.",
  },
  {
    value: "stream",
    label: "Поток",
    description: "Непрерывный приток новых сигналов в реальном времени.",
  },
  {
    value: "own",
    label: "Своя база",
    description: "Загрузите свой файл — мы оценим качество базы.",
  },
];

function directionToVerticalId(direction: string): string {
  if (direction === "medicine") return "health";
  return direction;
}

function resolveVertical(direction: string): Vertical {
  const id = directionToVerticalId(direction);
  return VERTICALS.find((v) => v.id === id) ?? VERTICALS[0];
}

function resolveInterests(direction: string, vertical: Vertical): Interest[] {
  const curated = getInterestsForDirection(direction)
    .map((id) => getInterestById(id))
    .filter((i): i is Interest => i !== undefined);
  if (curated.length > 0) return curated;
  return vertical.interests;
}

/** Pure continue-gate: own requires a file; new/stream require sourceType set. */
export function canContinueFromSource(
  sourceType: SourceType,
  file: File | null
): boolean {
  if (sourceType === "own") return file !== null;
  return Boolean(sourceType);
}

function RadioDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute right-3 top-3 h-3 w-3 rounded-full border-2 transition-colors",
        active ? "border-foreground bg-foreground" : "border-border bg-transparent"
      )}
    />
  );
}

export function StepSource({ data, onNext, onBack }: StepProps) {
  const { clientDirection } = useAppState();
  const vertical = resolveVertical(clientDirection);
  const interestsForDirection = resolveInterests(clientDirection, vertical);

  const [sourceType, setSourceType] = useState<SourceType>(data.sourceType);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(
    data.interests
  );
  const [file, setFile] = useState<File | null>(data.file);
  const [isHashing, setIsHashing] = useState(false);

  function toggleInterest(label: string) {
    setSelectedInterests((prev) =>
      prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label]
    );
  }

  function simulateRowCount(f: File): number {
    return seededInt(rngFor("rowcount", f.name, f.size), 1000, 100_000);
  }

  function emit(rowCount?: number) {
    onNext({
      sourceType,
      interests: selectedInterests,
      file,
      ...(rowCount !== undefined ? { fileRowCount: rowCount } : {}),
    });
  }

  function handleContinue() {
    // Own with a fresh file → hash before proceeding (mirrors the old upload
    // step). Other sources, or a previously-hashed file, just emit.
    if (sourceType === "own" && file && file !== data.file) {
      setIsHashing(true);
      return;
    }
    if (file) {
      const rowCount =
        data.file === file && typeof data.fileRowCount === "number"
          ? data.fileRowCount
          : simulateRowCount(file);
      emit(rowCount);
      return;
    }
    emit();
  }

  function handleHashingComplete() {
    setIsHashing(false);
    if (file) emit(simulateRowCount(file));
    else emit();
  }

  const canContinue = canContinueFromSource(sourceType, file);

  return (
    <StepContent
      title="Откуда берём аудиторию?"
      subtitle="Выберите источник — остальное настроим под него автоматически."
    >
      <div className="flex flex-col gap-6">
        {/* Source selection — radio-card row (reuses step-5 RadioDot pattern) */}
        <div className="grid grid-cols-3 gap-3">
          {SOURCE_OPTIONS.map((opt) => {
            const active = sourceType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSourceType(opt.value)}
                aria-pressed={active}
                className={cn(
                  "relative flex h-[120px] flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  active
                    ? "border-brand/60 bg-brand-muted"
                    : "border-border bg-card hover:bg-accent/50"
                )}
              >
                <RadioDot active={active} />
                <span
                  className={cn(
                    "text-sm font-medium",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {opt.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {opt.description}
                </span>
              </button>
            );
          })}
        </div>

        {/* Interests — chips (reuses the InterestChip look from step-2) */}
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Интересы
          </p>
          <div className="flex flex-wrap gap-2">
            {interestsForDirection.map((interest) => {
              const selected = selectedInterests.includes(interest.label);
              return (
                <button
                  key={interest.id}
                  type="button"
                  onClick={() => toggleInterest(interest.label)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm transition-all",
                    selected
                      ? "border-brand/50 bg-brand-muted text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {interest.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Upload — own = required, new = optional, stream = hidden (note) */}
        {sourceType !== "stream" ? (
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {sourceType === "own"
                ? "Загрузите вашу базу"
                : "Свой файл (необязательно)"}
            </p>
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
        ) : (
          <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
            Источник подключается автоматически — загрузка файла не требуется.
          </div>
        )}

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
