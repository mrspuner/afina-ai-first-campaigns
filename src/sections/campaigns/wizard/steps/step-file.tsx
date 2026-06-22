"use client";

import { useState } from "react";
import { DropZone } from "@/components/ui/drop-zone";
import { HashingLoader } from "@/components/ui/hashing-loader";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps } from "@/types/campaign";
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

export function StepFile({ data, onNext, onBack }: StepProps) {
  const [file, setFile] = useState<File | null>(data.file);
  const [isHashing, setIsHashing] = useState(false);

  const { title, subtitle } = fileCopy(data.sourceType);

  function emit(rowCount: number) {
    onNext({ file, fileRowCount: rowCount });
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
