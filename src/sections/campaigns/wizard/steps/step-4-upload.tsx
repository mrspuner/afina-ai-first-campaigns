"use client";

import { useState } from "react";
import { DropZone } from "@/components/ui/drop-zone";
import { HashingLoader } from "@/components/ui/hashing-loader";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps } from "@/types/campaign";
import { rngFor, seededInt } from "@/state/metrics";

export function Step4Upload({ data, onNext, onBack }: StepProps) {
  const [file, setFile] = useState<File | null>(data.file);
  const [isHashing, setIsHashing] = useState(false);

  /** Simulate parsing the file by attaching a plausible row count. The real
   *  product would parse server-side; for the prototype a count derived
   *  deterministically from the file (name + size) drives downstream UI
   *  (budget recommend) and stays stable for the same file. */
  function simulateRowCount(f: File): number {
    return seededInt(rngFor("rowcount", f.name, f.size), 1000, 100_000);
  }

  function handleNext() {
    // Already-hashed file on revisit — skip re-hashing, just proceed.
    if (file && file === data.file) {
      onNext({ file });
      return;
    }
    setIsHashing(true);
  }

  function handleHashingComplete() {
    setIsHashing(false);
    // Carry a freshly simulated row count if we don't already have one for
    // this exact file — repeat visits to the step keep the prior value so
    // the budget recommendation stays stable.
    const rowCount =
      data.file === file && typeof data.fileRowCount === "number"
        ? data.fileRowCount
        : file
          ? simulateRowCount(file)
          : 0;
    onNext({ file, fileRowCount: rowCount });
  }

  return (
    <StepContent
      title="Загрузите вашу базу"
      subtitle="Файл с номерами телефонов. Данные будут автоматически захешированы перед отправкой"
    >
      <div className="flex flex-col gap-4">
        {isHashing ? (
          <div className="relative flex min-h-[160px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-card">
            <HashingLoader onComplete={handleHashingComplete} />
          </div>
        ) : (
          <DropZone
            accept=".csv,.xlsx,.txt"
            file={file}
            onFile={setFile}
          />
        )}

        <p className="text-center text-xs text-muted-foreground">
          Поддерживаемые форматы: CSV, XLSX, TXT · Максимальный размер: 50 МБ · До 1 000 000
          строк · Один номер на строку
        </p>

        <StepFooter
          onBack={onBack}
          onContinue={handleNext}
          continueLabel="Далее"
          continueDisabled={!file || isHashing}
        />
      </div>
    </StepContent>
  );
}
