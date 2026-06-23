"use client";

import { useState } from "react";
import { DropZone } from "@/components/ui/drop-zone";
import { HashingLoader } from "@/components/ui/hashing-loader";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StepData, StepProps } from "@/types/campaign";
import { SIGNAL_TYPES, type SignalType } from "@/state/app-state";
import { rngFor, seededInt } from "@/state/metrics";

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
 * Own-source signal-type dropdown — a simple select over the 6 signal types
 * (`SIGNAL_TYPES`). The selection is HELD LOCALLY by the parent step and
 * reflected back via `value`. Choosing only calls `onChange` (a local state
 * update) — it does NOT advance the wizard. The chosen type is flushed into the
 * wizard's dedicated `ownSignalType` field only when the user clicks the
 * existing «Далее» button, so neither the upload nor the step progress is ever
 * reset (handleNext's scenarioChanged reset watches `scenario`, not this field).
 */
function OwnSignalTypeSelector({
  value,
  onChange,
}: {
  value: SignalType | null;
  onChange: (value: SignalType) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Тип сигнала
      </h2>
      <Select value={value ?? null} onValueChange={(v) => onChange(v as SignalType)}>
        <SelectTrigger className="w-full" aria-label="Тип сигнала">
          <SelectValue placeholder="Выберите тип сигнала" />
        </SelectTrigger>
        <SelectContent>
          {SIGNAL_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function StepFile({ data, onNext, onBack }: StepProps) {
  const [file, setFile] = useState<File | null>(data.file);
  const [isHashing, setIsHashing] = useState(false);
  const isOwn = data.sourceType === "own";

  // Own-source signal-type choice held LOCALLY (seeded from the wizard's
  // dedicated field). Selecting only updates this state — it never calls
  // onNext, so the wizard does not advance and the upload is not reset. The
  // value is flushed into `ownSignalType` on «Далее» (see emit()).
  const [ownSignalType, setOwnSignalType] = useState<SignalType | null>(
    data.ownSignalType ?? null
  );

  const { title, subtitle } = fileCopy(data.sourceType);

  function emit(rowCount: number) {
    const partial: Partial<StepData> = { file, fileRowCount: rowCount };
    // Carry the own-source signal-type choice on the DEDICATED field — never on
    // `scenario` — so handleNext's scenarioChanged reset never fires.
    if (isOwn && ownSignalType) {
      partial.ownSignalType = ownSignalType;
    }
    onNext(partial);
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
            value={ownSignalType}
            onChange={setOwnSignalType}
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
